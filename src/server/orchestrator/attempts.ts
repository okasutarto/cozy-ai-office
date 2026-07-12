import { randomUUID } from "node:crypto";
import type { RoleProfile, ProviderId, ProviderStatus } from "../../shared/contracts.js";
import type { ProviderExecution, ProviderRequest, ProviderRuntime } from "../providers/types.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { RunStore } from "../db/run-store.js";
import { AppError } from "../errors.js";
import { executeProviderRequest } from "../providers/execute.js";

export type RequiredCapability = "readOnly" | "worktreeWrite";

export type AttemptInput = {
  profile: RoleProfile;
  requiredCapability: RequiredCapability;
  request: Omit<ProviderRequest, "model" | "profileId" | "requestId">;
  repairPrompt: (invalidOutput: unknown) => string;
};

export type AttemptOutcome = {
  provider: ProviderId;
  model: string | null;
  execution: ProviderExecution;
  launchedAttempts: number;
};

function supports(status: ProviderStatus, capability: RequiredCapability): boolean {
  return status.installed && status.authenticated && !!status.capabilities[capability];
}

export class AttemptRunner {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly runs: RunStore,
    private readonly runtime: ProviderRuntime,
  ) {}

  async execute(input: AttemptInput, signal: AbortSignal): Promise<AttemptOutcome> {
    let launchedAttempts = 0;

    for (const candidate of input.profile.providerChain) {
      if (!this.registry.isProbed(candidate.provider)) {
        continue;
      }
      const status = this.registry.statusFor(candidate.provider);
      if (!status || !supports(status, input.requiredCapability)) {
        continue; // skip incompatible candidate without attempt row
      }

      let attemptCountForProvider = 0;
      let nextPrompt = input.request.prompt;

      while (attemptCountForProvider < 2) {
        launchedAttempts++;
        attemptCountForProvider++;

        const attemptId = randomUUID();
        const startTime = new Date().toISOString();

        // 1. Log attempt started
        this.runs.createAttempt({
          id: attemptId,
          runId: input.request.runId,
          taskId: input.request.taskId,
          conversationId: input.request.conversationId,
          role: input.request.role,
          profileId: input.profile.id,
          provider: candidate.provider,
          model: candidate.model,
          stage: "started",
          attemptNumber: launchedAttempts,
          status: "running",
          startedAt: startTime,
        });

        // Build full ProviderRequest
        const fullRequest: ProviderRequest = {
          requestId: randomUUID(),
          runId: input.request.runId,
          taskId: input.request.taskId,
          conversationId: input.request.conversationId,
          contextSnapshotId: input.request.contextSnapshotId,
          role: input.request.role as any,
          profileId: input.profile.id as any,
          model: candidate.model,
          prompt: nextPrompt,
          cwd: input.request.cwd,
          timeoutMs: input.request.timeoutMs,
          readOnly: input.requiredCapability === "readOnly",
          outputContract: input.request.outputContract,
        };

        const adapter = this.registry.get(candidate.provider);
        if (!adapter) {
          throw new AppError(
            "provider_not_found",
            `Adapter for ${candidate.provider} not found`,
            404,
          );
        }

        try {
          const execution = await executeProviderRequest(
            adapter,
            fullRequest,
            this.runtime,
            signal,
          );

          // 2. Success: log finished row and return
          this.runs.updateAttempt(attemptId, {
            stage: "finished",
            status: "completed",
            exitCode: execution.exitCode,
            errorCode: execution.errorCode,
            stdoutArtifactId: execution.stdout.id,
            stderrArtifactId: execution.stderr.id,
            endedAt: new Date().toISOString(),
          });

          return {
            provider: candidate.provider,
            model: candidate.model,
            execution,
            launchedAttempts,
          };
        } catch (err: any) {
          const errCode = err.code || "unknown_error";

          // Log failure
          this.runs.updateAttempt(attemptId, {
            stage: "finished",
            status: "failed",
            errorCode: errCode,
            endedAt: new Date().toISOString(),
          });

          if (errCode === "policy_violation" || errCode === "cancelled") {
            // Stop chain and throw immediately
            throw err;
          }

          if (errCode === "invalid_structured_output") {
            if (attemptCountForProvider === 1) {
              // Schema repair: execute one repairPrompt as call 2
              nextPrompt = input.repairPrompt(err.invalidOutput);
              continue;
            } else {
              // 2nd invalid -> fallback to next candidate
              break;
            }
          }

          if (errCode === "provider_auth_failed" || errCode === "provider_quota_exceeded") {
            // Fallback immediately (zero retries)
            break;
          }

          // Otherwise (transient error or timeout)
          if (attemptCountForProvider === 1) {
            // Retry same candidate once
            continue;
          } else {
            // 2nd failure -> fallback
            break;
          }
        }
      }
    }

    throw new AppError(
      "provider_capability_unavailable",
      "No compatible provider succeeded in the fallback chain",
      500,
    );
  }
}
