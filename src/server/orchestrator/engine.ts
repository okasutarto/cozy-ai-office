import type { RunSnapshot, RunState, ProfileId } from "../../shared/contracts.js";
import type { RunStore, NewEvent } from "../db/run-store.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { assertTransition, assertInterruptedRetry } from "./state-machine.js";
import { AppError } from "../errors.js";

// ── Types ──────────────────────────────────────────────────────────────

export type StartRunInput = {
  projectId: string;
  draftId: string;
  expectedDraftVersion: number;
  concurrency: 1 | 2 | 3 | 4;
};

// ── Engine ─────────────────────────────────────────────────────────────

export class OrchestratorEngine {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly runs: RunStore,
    private readonly realtime: RealtimeHub,
  ) {}

  /**
   * Transition run state with validation.
   */
  transitionRun(runId: string, to: RunState, blockReason: string | null = null): RunSnapshot {
    return this.runs.transaction(() => {
      const run = this.runs.getRun(runId);
      if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);
      assertTransition(run.state, to);
      this.runs.setRunState(runId, to, blockReason);
      this.emitEvent(runId, "run.state.changed", null, null, {
        from: run.state,
        to,
        blockReason,
      });
      return this.runs.getRun(runId)!;
    });
  }

  /**
   * Pause dispatch — prevents new task launches.
   */
  pause(runId: string): RunSnapshot {
    return this.runs.transaction(() => {
      const run = this.runs.getRun(runId);
      if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);
      this.runs.setDispatchPaused(runId, true);
      this.emitEvent(runId, "run.pause.changed", null, null, { paused: true });
      return this.runs.getRun(runId)!;
    });
  }

  /**
   * Resume dispatch — allows new task launches.
   */
  resume(runId: string): RunSnapshot {
    return this.runs.transaction(() => {
      const run = this.runs.getRun(runId);
      if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);
      this.runs.setDispatchPaused(runId, false);
      this.emitEvent(runId, "run.pause.changed", null, null, { paused: false });
      return this.runs.getRun(runId)!;
    });
  }

  /**
   * Cancel a run.
   */
  async cancel(runId: string): Promise<RunSnapshot> {
    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort();
      this.controllers.delete(runId);
    }

    return this.runs.transaction(() => {
      const run = this.runs.getRun(runId);
      if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);

      // Allow cancel from blocked/interrupted state
      if (run.state === "blocked" && run.blockReason === "interrupted") {
        this.runs.setRunState(runId, "cancelled", null);
        this.emitEvent(runId, "run.state.changed", null, null, {
          from: run.state,
          to: "cancelled",
          cause: "owner_cancel_interrupted",
        });
        return this.runs.getRun(runId)!;
      }

      assertTransition(run.state, "cancelled");
      this.runs.setRunState(runId, "cancelled", null);
      this.emitEvent(runId, "run.state.changed", null, null, {
        from: run.state,
        to: "cancelled",
      });
      return this.runs.getRun(runId)!;
    });
  }

  /**
   * Retry an interrupted task.
   */
  async retryInterruptedTask(runId: string, taskId: string): Promise<RunSnapshot> {
    return this.runs.transaction(() => {
      const run = this.runs.getRun(runId);
      if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);
      assertInterruptedRetry(run, taskId);

      // Reset task to queued
      this.runs.updateTask(runId, taskId, { status: "queued" });
      // Move run back to dispatching
      this.runs.setRunState(runId, "dispatching", null);
      this.emitEvent(runId, "run.state.changed", null, taskId, {
        from: run.state,
        to: "dispatching",
        cause: "owner_retry_interrupted",
      });
      return this.runs.getRun(runId)!;
    });
  }

  /**
   * Apply the integration to root.
   */
  async apply(runId: string): Promise<RunSnapshot> {
    return this.runs.transaction(() => {
      const run = this.runs.getRun(runId);
      if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);
      assertTransition(run.state, "applied");
      this.runs.setRunState(runId, "applied", null);
      this.emitEvent(runId, "run.state.changed", null, null, {
        from: run.state,
        to: "applied",
      });
      return this.runs.getRun(runId)!;
    });
  }

  /**
   * Recover interrupted runs on startup.
   */
  recoverInterruptedRuns(): RunSnapshot[] {
    const count = this.runs.markRunningAttemptsInterrupted();
    const activeRuns = this.runs.listActiveRuns();
    const recovered: RunSnapshot[] = [];

    for (const run of activeRuns) {
      // Mark active runs as blocked/interrupted
      this.runs.setRunState(run.id, "blocked", "interrupted");
      this.emitEvent(run.id, "run.state.changed", null, null, {
        from: run.state,
        to: "blocked",
        blockReason: "interrupted",
        priorState: run.state,
      });
      recovered.push(this.runs.getRun(run.id)!);
    }

    return recovered;
  }

  /**
   * Register a controller for a run.
   */
  registerController(runId: string, controller: AbortController): void {
    this.controllers.set(runId, controller);
  }

  /**
   * Remove a controller for a run.
   */
  removeController(runId: string): void {
    this.controllers.delete(runId);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private emitEvent(
    runId: string,
    kind: string,
    actorId: ProfileId | null,
    taskId: string | null,
    payload: Record<string, unknown>,
  ): void {
    const event = this.runs.appendEvent({
      runId,
      kind: kind as any,
      actorId,
      taskId,
      payload,
      createdAt: new Date().toISOString(),
    });
    this.realtime.publish(event);
  }
}
