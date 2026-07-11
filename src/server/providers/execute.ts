import { z } from "zod";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderStatus, ProviderId } from "../../shared/contracts.js";
import {
  type ProviderAdapter,
  type ProviderExecution,
  type ProviderRequest,
  type ProviderRuntime,
  type ProviderProbeRuntime,
} from "./types.js";
import { ProcessSupervisor, sanitizedChildEnv } from "../system/process.js";
import { AppError, errorMessage } from "../errors.js";
import {
  ManagerPlanSchema,
  ManagerPlanWireSchema,
  AdvisorReviewSchema,
  WorkerResultSchema,
  WorkerResultWireSchema,
  QaDiagnosisSchema,
  QaDiagnosisWireSchema,
  ChatResponseSchema,
  DraftSuggestionSchema,
  DeliverySynthesisSchema,
  DeliverySynthesisWireSchema,
} from "../../shared/contracts.js";

export const OUTPUT_CONTRACTS = {
  manager_plan: { wire: ManagerPlanWireSchema, result: ManagerPlanSchema },
  advisor_review: { wire: AdvisorReviewSchema, result: AdvisorReviewSchema },
  worker_result: { wire: WorkerResultWireSchema, result: WorkerResultSchema },
  qa_diagnosis: { wire: QaDiagnosisWireSchema, result: QaDiagnosisSchema },
  chat_response: { wire: ChatResponseSchema, result: ChatResponseSchema },
  draft_suggestion: { wire: DraftSuggestionSchema, result: DraftSuggestionSchema },
  delivery_synthesis: { wire: DeliverySynthesisWireSchema, result: DeliverySynthesisSchema },
} as const;

export async function executeProviderRequest(
  adapter: ProviderAdapter,
  request: ProviderRequest,
  runtime: ProviderRuntime,
  signal: AbortSignal,
): Promise<ProviderExecution> {
  const status = runtime.statusFor(adapter.id);
  if (!status.installed || !status.authenticated) {
    throw new AppError(
      "provider_not_available",
      `Provider ${adapter.id} is not ready (installed: ${status.installed}, authenticated: ${status.authenticated})`,
    );
  }

  if (request.readOnly && !status.capabilities.readOnly) {
    throw new AppError(
      "provider_capability_unavailable",
      `Provider ${adapter.id} does not support read-only capability`,
    );
  }
  if (!request.readOnly && !status.capabilities.worktreeWrite) {
    throw new AppError(
      "provider_capability_unavailable",
      `Provider ${adapter.id} does not support worktree-write capability`,
    );
  }

  const reqTempDir = join(runtime.tempDir, "request", request.requestId);
  await mkdir(reqTempDir, { recursive: true });

  let schemaSpec: { path: string; json: string } | null = null;
  const resultPath = join(reqTempDir, "result.json").replaceAll("\\", "/");

  try {
    if (request.outputContract) {
      const contract = OUTPUT_CONTRACTS[request.outputContract];
      if (!contract) {
        throw new Error(`Unknown output contract: ${request.outputContract}`);
      }
      const schemaObj = (z as any).toJSONSchema(contract.wire);
      const schemaJson = JSON.stringify(schemaObj, null, 2);
      const schemaPath = join(reqTempDir, "schema.json").replaceAll("\\", "/");
      await writeFile(schemaPath, schemaJson, "utf8");
      schemaSpec = { path: schemaPath, json: schemaJson };
    }

    const command = adapter.build(request, schemaSpec, resultPath);

    const stdoutWriter = await runtime.artifacts.createWriter({
      runId: request.runId,
      taskId: request.taskId,
      kind: "provider.stdout",
      extension: "log",
      maxBytes: 2 * 1024 * 1024,
    });
    const stderrWriter = await runtime.artifacts.createWriter({
      runId: request.runId,
      taskId: request.taskId,
      kind: "provider.stderr",
      extension: "log",
      maxBytes: 2 * 1024 * 1024,
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const maxTeeBytes = 2 * 1024 * 1024;

    const stdoutSink = {
      write: async (chunk: string) => {
        await stdoutWriter.write(chunk);
        if (stdoutBytes < maxTeeBytes) {
          const accepted = chunk.slice(0, maxTeeBytes - stdoutBytes);
          stdoutChunks.push(accepted);
          stdoutBytes += Buffer.byteLength(accepted, "utf8");
        }
      },
    };
    const stderrSink = {
      write: async (chunk: string) => {
        await stderrWriter.write(chunk);
        if (stderrBytes < maxTeeBytes) {
          const accepted = chunk.slice(0, maxTeeBytes - stderrBytes);
          stderrChunks.push(accepted);
          stderrBytes += Buffer.byteLength(accepted, "utf8");
        }
      },
    };

    let result;
    let spawnError: any = null;
    try {
      result = await runtime.supervisor.run(
        {
          executable: command.executable,
          args: command.args,
          cwd: command.cwd,
          stdin: command.stdin,
          timeoutMs: request.timeoutMs,
          env: sanitizedChildEnv(),
        },
        { stdout: stdoutSink, stderr: stderrSink },
        signal,
      );
    } catch (err) {
      spawnError = err;
      throw err;
    } finally {
      var stdoutArtifact = await stdoutWriter.finalize();
      var stderrArtifact = await stderrWriter.finalize();
    }

    const stdoutText = stdoutChunks.join("");
    const stderrText = stderrChunks.join("");

    let errorCode: string | null = null;
    if (result.spawnErrorCode === "ENOENT") {
      errorCode = "provider_not_installed";
    } else if (result.spawnErrorCode) {
      errorCode = `provider_spawn_error_${result.spawnErrorCode}`;
    } else if (result.timedOut) {
      errorCode = "provider_timeout";
    } else if (result.cancelled) {
      errorCode = "provider_cancelled";
    } else if (result.exitCode !== 0) {
      if (stderrText.includes("quota exceeded") || stdoutText.includes("quota exceeded")) {
        errorCode = "provider_quota_exceeded";
      } else if (
        stderrText.includes("authentication required") ||
        stdoutText.includes("authentication required")
      ) {
        errorCode = "provider_auth_required";
      } else {
        errorCode = `provider_exit_non_zero_${result.exitCode}`;
      }
    }

    let structuredOutput: unknown = null;
    if (!errorCode && request.outputContract) {
      if (adapter.id === "codex") {
        try {
          const raw = await readFile(resultPath, "utf8");
          structuredOutput = JSON.parse(raw);
        } catch (err) {
          throw new AppError(
            "invalid_structured_output",
            `Codex output-last-message is not valid JSON: ${errorMessage(err)}`,
          );
        }
      } else if (adapter.id === "claude") {
        const ClaudeEnvelopeSchema = z
          .object({
            structured_output: z.unknown().optional(),
            result: z.string().optional(),
          })
          .passthrough();
        try {
          const env = ClaudeEnvelopeSchema.parse(JSON.parse(stdoutText));
          if (env.structured_output !== undefined) {
            structuredOutput = env.structured_output;
          } else if (env.result !== undefined) {
            structuredOutput = JSON.parse(env.result);
          } else {
            throw new Error("Envelope missing both structured_output and result");
          }
        } catch (err) {
          throw new AppError(
            "invalid_structured_output",
            `Claude output envelope parsing failed: ${errorMessage(err)}`,
          );
        }
      } else if (adapter.id === "antigravity") {
        throw new AppError(
          "invalid_provider_request",
          "Antigravity does not support output contract structure",
        );
      }
    }

    let parsedOutput: unknown = null;
    if (!errorCode && request.outputContract) {
      const contract = OUTPUT_CONTRACTS[request.outputContract];
      const parsed = contract.result.safeParse(structuredOutput);
      if (!parsed.success) {
        throw new AppError(
          "invalid_structured_output",
          `Structured output validation failed: ${parsed.error.message}`,
        );
      }
      parsedOutput = parsed.data;
    }

    return {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      structuredOutput: parsedOutput,
      stdout: stdoutArtifact,
      stderr: stderrArtifact,
      errorCode,
    };
  } finally {
    await rm(reqTempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const DECLARED_CAPABILITIES = {
  codex: { nonInteractive: true, readOnly: true, worktreeWrite: true },
  claude: { nonInteractive: true, readOnly: true, worktreeWrite: true },
  antigravity: { nonInteractive: true, readOnly: false, worktreeWrite: true },
} as const;

export async function probeCli(
  spec: {
    id: ProviderId;
    executable: string;
    versionArgs: string[];
    helpArgs: string[][];
    authArgs: string[] | null;
    models: string[];
    requiredFlags: {
      nonInteractive: string[] | null;
      readOnly: string[] | null;
      worktreeWrite: string[] | null;
    };
  },
  runtime: ProviderProbeRuntime,
  signal: AbortSignal,
): Promise<ProviderStatus> {
  const checkedAt = new Date().toISOString();

  const createBufferedSink = (maxBytes: number) => {
    let size = 0;
    const buffer: string[] = [];
    return {
      write: async (chunk: string) => {
        if (size >= maxBytes) return;
        const available = maxBytes - size;
        const sub = chunk.slice(0, available);
        buffer.push(sub);
        size += Buffer.byteLength(sub, "utf8");
      },
      content: () => buffer.join(""),
    };
  };

  const vOut = createBufferedSink(256 * 1024);
  const vErr = createBufferedSink(256 * 1024);

  const versionResult = await runtime.supervisor.run(
    {
      executable: spec.executable,
      args: spec.versionArgs,
      cwd: runtime.cwd,
      stdin: "",
      timeoutMs: 10_000,
    },
    { stdout: vOut, stderr: vErr },
    signal,
  );

  if (versionResult.spawnErrorCode === "ENOENT") {
    return {
      provider: spec.id,
      installed: false,
      authenticated: false,
      version: null,
      models: spec.models,
      capabilities: { nonInteractive: false, readOnly: false, worktreeWrite: false },
      diagnostic: `Executable not found: ${spec.executable}`,
      checkedAt,
    };
  }

  const installed = versionResult.exitCode === 0;
  const version = installed ? vOut.content().trim() : null;

  let authenticated = false;
  let authDiagnostic: string | null = null;
  if (installed && spec.authArgs) {
    const aOut = createBufferedSink(256 * 1024);
    const aErr = createBufferedSink(256 * 1024);
    const authResult = await runtime.supervisor.run(
      {
        executable: spec.executable,
        args: spec.authArgs,
        cwd: runtime.cwd,
        stdin: "",
        timeoutMs: 10_000,
      },
      { stdout: aOut, stderr: aErr },
      signal,
    );
    if (authResult.exitCode === 0) {
      authenticated = true;
    } else {
      authDiagnostic = aErr.content() || aOut.content() || "Authentication failed";
    }
  } else if (installed && !spec.authArgs) {
    if (spec.id === "antigravity") {
      authenticated = false;
      authDiagnostic = "Run Verify login (uses a small subscription turn)";
    }
  }

  let nonInteractive = false;
  let readOnly = false;
  let worktreeWrite = false;
  const missingFlagsDiagnostic: string[] = [];

  if (installed) {
    let helpContent = "";
    for (const hArgs of spec.helpArgs) {
      const hOut = createBufferedSink(256 * 1024);
      const hErr = createBufferedSink(256 * 1024);
      await runtime.supervisor.run(
        {
          executable: spec.executable,
          args: hArgs,
          cwd: runtime.cwd,
          stdin: "",
          timeoutMs: 10_000,
        },
        { stdout: hOut, stderr: hErr },
        signal,
      );
      helpContent += hOut.content() + "\n" + hErr.content();
    }

    const checkFlags = (flags: string[] | null): { pass: boolean; missing: string[] } => {
      if (!flags) return { pass: false, missing: [] };
      const missing = flags.filter((flag) => !helpContent.includes(flag));
      return { pass: missing.length === 0, missing };
    };

    const niCheck = checkFlags(spec.requiredFlags.nonInteractive);
    const roCheck = checkFlags(spec.requiredFlags.readOnly);
    const wwCheck = checkFlags(spec.requiredFlags.worktreeWrite);

    nonInteractive = niCheck.pass;
    readOnly = roCheck.pass;
    worktreeWrite = wwCheck.pass;

    if (!nonInteractive && spec.requiredFlags.nonInteractive) {
      missingFlagsDiagnostic.push(`nonInteractive missing: ${niCheck.missing.join(", ")}`);
    }
    if (!readOnly && spec.requiredFlags.readOnly) {
      missingFlagsDiagnostic.push(`readOnly missing: ${roCheck.missing.join(", ")}`);
    }
    if (!worktreeWrite && spec.requiredFlags.worktreeWrite) {
      missingFlagsDiagnostic.push(`worktreeWrite missing: ${wwCheck.missing.join(", ")}`);
    }
  }

  const declared = DECLARED_CAPABILITIES[spec.id];
  const finalCapabilities = {
    nonInteractive: nonInteractive && declared.nonInteractive,
    readOnly: readOnly && declared.readOnly,
    worktreeWrite: worktreeWrite && declared.worktreeWrite,
  };

  let diagnostic = authDiagnostic;
  if (missingFlagsDiagnostic.length > 0) {
    diagnostic = (diagnostic ? `${diagnostic}\n` : "") + missingFlagsDiagnostic.join("\n");
  }

  return {
    provider: spec.id,
    installed,
    authenticated,
    version,
    models: spec.models,
    capabilities: finalCapabilities,
    diagnostic,
    checkedAt,
  };
}
