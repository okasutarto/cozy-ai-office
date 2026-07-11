import type { ProfileId, RoleProfile, TaskBrief, WorkerResult } from "../../shared/contracts.js";
import type { RunStore } from "../db/run-store.js";
import type { WorktreeService } from "../git/worktrees.js";
import type { ContextSnapshotService } from "../context/snapshots.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { ValidatedPlan } from "./plan-validator.js";
import { pathsOverlap } from "./plan-validator.js";
import { AppError } from "../errors.js";

// ── Public types ────────────────────────────────────────────────────

export type SchedulerInput = {
  runId: string;
  projectId: string;
  plan: ValidatedPlan;
  contextSnapshotId: string;
  workerProfiles: RoleProfile[];
  integrationWorktree: string;
  concurrency: number;
};

export type SchedulerResult = {
  completedTaskIds: string[];
  resultArtifactIds: string[];
  integrationHead: string;
};

export type WorkerExecutionPort = {
  execute(input: {
    task: TaskBrief;
    profile: RoleProfile;
    cwd: string;
    signal: AbortSignal;
  }): Promise<WorkerResult>;
  resolveConflict(input: {
    conflictFiles: string[];
    profile: RoleProfile;
    cwd: string;
    signal: AbortSignal;
  }): Promise<WorkerResult>;
};

// ── Internal helpers ────────────────────────────────────────────────

const WORKER_PROFILE_IDS: ProfileId[] = ["worker-1", "worker-2", "worker-3", "worker-4"];

type TaskState = {
  brief: TaskBrief;
  status: "queued" | "running" | "completed" | "failed" | "blocked";
  assignedProfileId: ProfileId | null;
  commitSha: string | null;
  resultArtifactId: string | null;
};

// ── WorkerScheduler ─────────────────────────────────────────────────

export class WorkerScheduler {
  private dispatchPaused = false;
  private readonly integrationQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly runs: RunStore,
    private readonly worktrees: WorktreeService,
    private readonly snapshots: ContextSnapshotService,
    private readonly executor: WorkerExecutionPort,
    private readonly realtime: RealtimeHub,
  ) {}

  /**
   * Unpauses dispatch so the run loop picks up new tasks.
   */
  resume(runId: string): void {
    this.runs.setDispatchPaused(runId, false);
    this.dispatchPaused = false;
  }

  private async withIntegrationLock<T>(
    integrationWorktree: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.integrationQueues.get(integrationWorktree) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.integrationQueues.set(integrationWorktree, tail);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.integrationQueues.get(integrationWorktree) === tail) {
        this.integrationQueues.delete(integrationWorktree);
      }
    }
  }

  /**
   * Main scheduler loop. Dispatches tasks in topological order respecting:
   *  - dependency completion
   *  - write-path overlap safety
   *  - bounded concurrency (1..4)
   */
  async run(input: SchedulerInput, signal: AbortSignal): Promise<SchedulerResult> {
    // ── 1. Validate concurrency ──
    if (!Number.isInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > 4) {
      throw new AppError("invalid_concurrency", "Concurrency must be an integer 1..4", 400);
    }

    const { plan, runId } = input;
    const taskMap = new Map<string, TaskState>();

    // Seed from plan
    for (const brief of plan.tasks) {
      taskMap.set(brief.id, {
        brief,
        status: "queued",
        assignedProfileId: null,
        commitSha: null,
        resultArtifactId: null,
      });
    }

    // ── 2. Hydrate persisted state ──
    this.hydrateFromStore(runId, taskMap);

    const active = new Map<
      string,
      { promise: Promise<{ taskId: string }>; profileId: ProfileId }
    >();

    // ── Main loop ──
    while (true) {
      signal.throwIfAborted();

      // Reload pause flag each iteration
      this.reloadPauseFlag(runId);
      if (this.dispatchPaused) {
        // If paused, wait for any active to finish rather than dispatching new
        if (active.size === 0) {
          // Nothing running and paused; caller must resume() to continue
          break;
        }
        const settled = await Promise.race([...active.values()].map((a) => a.promise));
        this.handleSettled(input.runId, settled.taskId, taskMap, active);
        continue;
      }

      // ── 3. Determine ready tasks ──
      const readyIds = this.getReadyTaskIds(plan.topologicalOrder, taskMap, active);

      // ── 4. Compute idle profiles in deterministic order ──
      const busyProfiles = new Set([...active.values()].map((a) => a.profileId));
      const idleProfiles = input.workerProfiles
        .filter((p) => WORKER_PROFILE_IDS.includes(p.id))
        .filter((p) => !busyProfiles.has(p.id))
        .sort((a, b) => WORKER_PROFILE_IDS.indexOf(a.id) - WORKER_PROFILE_IDS.indexOf(b.id));

      // ── 5-7. Dispatch safe pairs ──
      for (const taskId of readyIds) {
        if (active.size >= input.concurrency) break;
        const task = taskMap.get(taskId)!;

        // Find first idle profile
        const profile = idleProfiles.shift();
        if (!profile) break;

        // 6. Reject write candidate when overlapping active writes
        if (task.brief.mode === "write" && this.overlapsActiveWrites(task.brief, taskMap, active)) {
          idleProfiles.unshift(profile); // return profile
          continue;
        }

        // ── 8. Persist running state before dispatch ──
        this.runs.transaction(() => {
          this.runs.updateTask(runId, taskId, {
            status: "running",
            assignedProfileId: profile.id,
          });
        });
        this.emitEvent(runId, "task.started", profile.id, taskId);

        taskMap.get(taskId)!.status = "running";
        taskMap.get(taskId)!.assignedProfileId = profile.id;

        // Launch worker
        const promise = this.executeTask(input, task.brief, profile, signal).then(() => ({
          taskId,
        }));

        active.set(taskId, { promise, profileId: profile.id });
      }

      // Check termination: all done?
      const allDone = [...taskMap.values()].every(
        (t) => t.status === "completed" || t.status === "failed" || t.status === "blocked",
      );
      if (allDone && active.size === 0) break;

      // Nothing active and nothing dispatched? Deadlock or all blocked
      if (active.size === 0) break;

      // ── 9. Await next settled ──
      const settled = await Promise.race([...active.values()].map((a) => a.promise));
      this.handleSettled(input.runId, settled.taskId, taskMap, active);

      // ── 10. On failure, block dependents ──
      const settledState = taskMap.get(settled.taskId)!;
      if (settledState.status === "failed") {
        this.blockDependents(runId, settled.taskId, plan, taskMap);
        // Continue loop to let other active tasks finish
      }
    }

    // ── 11. Build result ──
    const anyFailed = [...taskMap.values()].some(
      (t) => t.status === "failed" || t.status === "blocked",
    );
    if (anyFailed) {
      const failedIds = [...taskMap.entries()]
        .filter(([, t]) => t.status === "failed")
        .map(([id]) => id);
      throw new AppError("scheduler_tasks_failed", `Tasks failed: ${failedIds.join(", ")}`, 500);
    }

    // Integration HEAD
    const integrationHead = await this.getIntegrationHead(input.integrationWorktree, signal);

    // Result artifacts in topological order
    const completedTaskIds: string[] = [];
    const resultArtifactIds: string[] = [];
    for (const taskId of plan.topologicalOrder) {
      const state = taskMap.get(taskId)!;
      if (state.status === "completed") {
        completedTaskIds.push(taskId);
        if (state.resultArtifactId) {
          resultArtifactIds.push(state.resultArtifactId);
        }
      }
    }

    return { completedTaskIds, resultArtifactIds, integrationHead };
  }

  // ── Private helpers ───────────────────────────────────────────────

  private hydrateFromStore(runId: string, taskMap: Map<string, TaskState>): void {
    const snapshot = this.runs.getRun(runId);
    if (!snapshot) return;

    this.dispatchPaused = snapshot.dispatchPaused;

    for (const persistedTask of snapshot.tasks) {
      const local = taskMap.get(persistedTask.id);
      if (local) {
        local.status = persistedTask.status;
        local.assignedProfileId = persistedTask.assignedProfileId;
        local.commitSha = persistedTask.commitSha;
      }
    }
  }

  private reloadPauseFlag(runId: string): void {
    const snapshot = this.runs.getRun(runId);
    if (snapshot) {
      this.dispatchPaused = snapshot.dispatchPaused;
    }
  }

  private getReadyTaskIds(
    topologicalOrder: string[],
    taskMap: Map<string, TaskState>,
    active: Map<string, unknown>,
  ): string[] {
    const ready: string[] = [];
    for (const taskId of topologicalOrder) {
      const state = taskMap.get(taskId)!;
      if (state.status !== "queued") continue;
      if (active.has(taskId)) continue;

      // All dependencies must be completed (integrated)
      const allDepsDone = state.brief.dependsOn.every((depId) => {
        const dep = taskMap.get(depId);
        return dep?.status === "completed";
      });
      if (allDepsDone) ready.push(taskId);
    }
    return ready;
  }

  private overlapsActiveWrites(
    brief: TaskBrief,
    taskMap: Map<string, TaskState>,
    active: Map<string, unknown>,
  ): boolean {
    for (const activeId of active.keys()) {
      const activeState = taskMap.get(activeId);
      if (!activeState || activeState.brief.mode !== "write") continue;
      for (const activePath of activeState.brief.allowedPaths) {
        for (const candidatePath of brief.allowedPaths) {
          if (pathsOverlap(activePath, candidatePath)) return true;
        }
      }
    }
    return false;
  }

  private async executeTask(
    input: SchedulerInput,
    brief: TaskBrief,
    profile: RoleProfile,
    signal: AbortSignal,
  ): Promise<void> {
    const { runId, integrationWorktree } = input;

    try {
      // Create task worktree
      const worktree = await this.worktrees.createTaskWorktree({
        projectId: input.projectId,
        runId,
        task: brief,
        integrationWorktree,
        signal,
      });

      // Execute worker
      const result = await this.executor.execute({
        task: brief,
        profile,
        cwd: worktree.path,
        signal,
      });

      if (result.status !== "completed") {
        this.runs.transaction(() => {
          this.runs.updateTask(runId, brief.id, { status: "failed" });
        });
        this.emitEvent(runId, "task.failed", profile.id, brief.id);
        return;
      }

      // Validate and commit changes
      let commitSha = "";
      if (brief.mode === "write") {
        const validated = await this.worktrees.validateAndCommit({
          task: brief,
          worktree,
          signal,
        });
        commitSha = validated.commitSha;

        // Integrate into integration worktree
        if (commitSha) {
          await this.withIntegrationLock(integrationWorktree, async () => {
            const integration = await this.worktrees.integrateCommit({
              integrationWorktree,
              commitSha,
              signal,
            });

            if (integration.conflictFiles.length > 0) {
              // Attempt conflict resolution
              await this.executor.resolveConflict({
                conflictFiles: integration.conflictFiles,
                profile,
                cwd: integrationWorktree,
                signal,
              });

              await this.worktrees.resolveConflict({
                integrationWorktree,
                conflictFiles: integration.conflictFiles,
                signal,
              });
            }
          });
        }
      }

      // Mark completed
      this.runs.transaction(() => {
        this.runs.updateTask(runId, brief.id, {
          status: "completed",
          commitSha: commitSha || null,
        });
      });
      this.emitEvent(runId, "task.finished", profile.id, brief.id);
    } catch (err) {
      this.runs.transaction(() => {
        this.runs.updateTask(runId, brief.id, { status: "failed" });
      });
      this.emitEvent(runId, "task.failed", profile.id, brief.id);
    }
  }

  private handleSettled(
    runId: string,
    taskId: string,
    taskMap: Map<string, TaskState>,
    active: Map<string, { promise: Promise<{ taskId: string }>; profileId: ProfileId }>,
  ): void {
    active.delete(taskId);

    // Reload state from store to pick up any status changes from executeTask
    const snapshot = this.runs.getRun(runId);
    if (snapshot) {
      for (const task of snapshot.tasks) {
        const local = taskMap.get(task.id);
        if (local) {
          local.status = task.status;
          local.commitSha = task.commitSha;
          local.assignedProfileId = task.assignedProfileId;
        }
      }
    }
  }

  private blockDependents(
    runId: string,
    failedTaskId: string,
    plan: ValidatedPlan,
    taskMap: Map<string, TaskState>,
  ): void {
    const toBlock: string[] = [];
    const queue = [failedTaskId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const task of plan.tasks) {
        if (task.dependsOn.includes(current) && !visited.has(task.id)) {
          toBlock.push(task.id);
          queue.push(task.id);
        }
      }
    }

    for (const blockId of toBlock) {
      const state = taskMap.get(blockId);
      if (state && state.status === "queued") {
        state.status = "blocked";
        this.runs.updateTask(runId, blockId, { status: "blocked" });
      }
    }
  }

  private async getIntegrationHead(
    integrationWorktree: string,
    _signal: AbortSignal,
  ): Promise<string> {
    // In production this would do: git rev-parse HEAD in integrationWorktree
    // For now, return a placeholder that tests can override
    return integrationWorktree;
  }

  private emitEvent(
    runId: string,
    kind: "task.started" | "task.finished" | "task.failed",
    actorId: ProfileId,
    taskId: string,
  ): void {
    const event = this.runs.appendEvent({
      runId,
      kind,
      actorId,
      taskId,
      payload: {},
      createdAt: new Date().toISOString(),
    });
    this.realtime.publish(event);
  }
}
