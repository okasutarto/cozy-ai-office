import type { ProcessSupervisor, ProcessResult } from "../system/process.js";
import { sanitizedChildEnv } from "../system/process.js";
import type { ArtifactStore } from "../artifacts/store.js";
import type { AttemptRunner } from "./attempts.js";
import type { RunStore } from "../db/run-store.js";

// ── Types ──────────────────────────────────────────────────────────────

export type QaCommandResult = {
  commandId: string;
  required: boolean;
  status: "passed" | "failed" | "timed_out" | "cancelled";
  exitCode: number | null;
  durationMs: number;
  stdoutArtifactId: string;
  stderrArtifactId: string;
};

export type QaReport = {
  passed: boolean;
  cycleCount: 1 | 2;
  results: QaCommandResult[];
  diagnosisArtifactId: string | null;
  repairResultArtifactId: string | null;
};

export type QaCommand = {
  id: string;
  executable: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  required: boolean;
  position: number;
};

/**
 * Port that lets QA request a single bounded repair from a worker.
 * Defined here so qa.ts is self-contained; scheduler.ts will implement it.
 */
export interface WorkerExecutionPort {
  requestRepair(input: {
    diagnosisArtifactId: string;
    allowedRepairPaths: string[];
  }): Promise<{ resultArtifactId: string }>;
}

export type QaRunInput = {
  runId: string;
  taskId: string;
  commands: QaCommand[];
  diffArtifactId: string;
  allowedRepairPaths: string[];
};

// ── Runner ─────────────────────────────────────────────────────────────

export class QaRunner {
  constructor(
    private readonly supervisor: ProcessSupervisor,
    private readonly artifacts: ArtifactStore,
    private readonly attempts: AttemptRunner,
    private readonly runs: RunStore,
    private readonly workerPort: WorkerExecutionPort | null,
  ) {}

  async run(input: QaRunInput, signal: AbortSignal): Promise<QaReport> {
    const sorted = [...input.commands].sort((a, b) => a.position - b.position);

    // ── First pass ─────────────────────────────────────────────────────
    const firstPassResults: QaCommandResult[] = [];
    let firstRequiredFailure: QaCommandResult | null = null;

    for (const command of sorted) {
      if (signal.aborted) {
        firstPassResults.push(cancelledResult(command));
        continue;
      }

      const result = await this.runCommand(command, input, signal);
      firstPassResults.push(result);

      if (result.status !== "passed" && command.required && !firstRequiredFailure) {
        firstRequiredFailure = result;
        break; // stop on first required failure
      }
    }

    // All passed on first pass
    if (!firstRequiredFailure) {
      const allPassed = firstPassResults.every((r) => r.status === "passed" || !r.required);
      return {
        passed: allPassed,
        cycleCount: 1,
        results: firstPassResults,
        diagnosisArtifactId: null,
        repairResultArtifactId: null,
      };
    }

    // ── Diagnosis ──────────────────────────────────────────────────────
    if (!this.workerPort) {
      // No repair port available, report failure
      return {
        passed: false,
        cycleCount: 1,
        results: firstPassResults,
        diagnosisArtifactId: null,
        repairResultArtifactId: null,
      };
    }

    const { buildQaDiagnosisPrompt } = await import("../prompts/qa.js");
    const diagnosisText = buildQaDiagnosisPrompt({
      commandId: firstRequiredFailure.commandId,
      exitCode: firstRequiredFailure.exitCode,
      stdoutArtifactId: firstRequiredFailure.stdoutArtifactId,
      stderrArtifactId: firstRequiredFailure.stderrArtifactId,
      diffArtifactId: input.diffArtifactId,
      allowedRepairPaths: input.allowedRepairPaths,
    });

    const diagnosisArtifact = await this.artifacts.writeText({
      runId: input.runId,
      taskId: input.taskId,
      kind: "qa-diagnosis",
      text: diagnosisText,
    });

    // ── Repair ─────────────────────────────────────────────────────────
    const repairResult = await this.workerPort.requestRepair({
      diagnosisArtifactId: diagnosisArtifact.id,
      allowedRepairPaths: input.allowedRepairPaths,
    });

    // ── Second pass (rerun all required commands) ──────────────────────
    const secondPassResults: QaCommandResult[] = [];
    for (const command of sorted) {
      if (!command.required) continue;
      if (signal.aborted) {
        secondPassResults.push(cancelledResult(command));
        continue;
      }
      const result = await this.runCommand(command, input, signal);
      secondPassResults.push(result);
    }

    const allRequiredPassed = secondPassResults.every((r) => r.status === "passed");

    return {
      passed: allRequiredPassed,
      cycleCount: 2,
      results: secondPassResults,
      diagnosisArtifactId: diagnosisArtifact.id,
      repairResultArtifactId: repairResult.resultArtifactId,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async runCommand(
    command: QaCommand,
    input: QaRunInput,
    signal: AbortSignal,
  ): Promise<QaCommandResult> {
    const stdoutWriter = await this.artifacts.createWriter({
      runId: input.runId,
      taskId: input.taskId,
      kind: "qa-stdout",
    });
    const stderrWriter = await this.artifacts.createWriter({
      runId: input.runId,
      taskId: input.taskId,
      kind: "qa-stderr",
    });

    const processResult: ProcessResult = await this.supervisor.run(
      {
        executable: command.executable,
        args: command.args,
        cwd: command.cwd,
        stdin: "",
        timeoutMs: command.timeoutMs,
        env: sanitizedChildEnv(process.env, { CI: "1" }),
      },
      {
        stdout: { write: (chunk: string) => stdoutWriter.write(chunk) },
        stderr: { write: (chunk: string) => stderrWriter.write(chunk) },
      },
      signal,
    );

    const stdoutArtifact = await stdoutWriter.finalize();
    const stderrArtifact = await stderrWriter.finalize();

    let status: QaCommandResult["status"];
    if (processResult.cancelled) {
      status = "cancelled";
    } else if (processResult.timedOut) {
      status = "timed_out";
    } else if (processResult.exitCode === 0) {
      status = "passed";
    } else {
      status = "failed";
    }

    return {
      commandId: command.id,
      required: command.required,
      status,
      exitCode: processResult.exitCode,
      durationMs: processResult.durationMs,
      stdoutArtifactId: stdoutArtifact.id,
      stderrArtifactId: stderrArtifact.id,
    };
  }
}

function cancelledResult(command: QaCommand): QaCommandResult {
  return {
    commandId: command.id,
    required: command.required,
    status: "cancelled",
    exitCode: null,
    durationMs: 0,
    stdoutArtifactId: "",
    stderrArtifactId: "",
  };
}
