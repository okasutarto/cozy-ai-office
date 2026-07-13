import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { RunSnapshot, RunState, ProfileId } from "../../shared/contracts.js";
import type { RunStore } from "../db/run-store.js";
import type { RealtimeHub } from "../realtime/hub.js";
import type { ProjectStore } from "../db/project-store.js";
import type { ConversationStore } from "../db/conversation-store.js";
import type { WorktreeService } from "../git/worktrees.js";
import type { ContextSnapshotService } from "../context/snapshots.js";
import type { AttemptRunner } from "./attempts.js";
import type { WorkerScheduler } from "./scheduler.js";
import type { QaRunner, QaCommand } from "./qa.js";
import { assertTransition, assertInterruptedRetry } from "./state-machine.js";
import { AppError } from "../errors.js";
import { buildManagerPlanPrompt, buildManagerRevisionPrompt } from "../prompts/manager.js";
import { buildPreflightPrompt, buildDeliveryPrompt } from "../prompts/advisor.js";
import { validatePlan } from "./plan-validator.js";

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
    private readonly projects: ProjectStore,
    private readonly conversations: ConversationStore,
    private readonly worktrees: WorktreeService,
    private readonly snapshotService: ContextSnapshotService,
    private readonly attempts: AttemptRunner,
    private readonly scheduler: WorkerScheduler,
    private readonly qa: QaRunner,
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

      this.runs.updateTask(runId, taskId, { status: "queued" });
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
    const run = this.runs.getRun(runId);
    if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);
    assertTransition(run.state, "applied");

    const project = this.projects.getProject(run.projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);

    const snapshot = this.projects.getContextSnapshot(run.contextSnapshotId);
    if (!snapshot) throw new AppError("snapshot_not_found", "Snapshot not found", 404);

    const signal = new AbortController().signal;

    // Apply via WorktreeService
    await this.worktrees.applyToRoot({
      repositoryRoot: project.rootPath,
      expectedBranch: snapshot.sourceBranch,
      expectedBaseCommit: snapshot.sourceHead,
      integrationBranch: run.integrationBranch,
      signal,
    });

    return this.runs.transaction(() => {
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
    this.runs.markRunningAttemptsInterrupted();
    const activeRuns = this.runs.listActiveRuns();
    const recovered: RunSnapshot[] = [];

    for (const run of activeRuns) {
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
   * Start a run.
   */
  async start(input: StartRunInput): Promise<RunSnapshot> {
    const { projectId, draftId, expectedDraftVersion } = input;

    const project = this.projects.getProject(projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);

    const draftVersion = this.conversations.getDraftVersion(draftId, expectedDraftVersion);
    if (!draftVersion) {
      throw new AppError("draft_not_found", `Draft version ${expectedDraftVersion} not found`, 404);
    }

    const snapshot = this.projects.getContextSnapshot(draftVersion.contextSnapshotId);
    if (!snapshot) {
      throw new AppError("snapshot_not_found", "Context snapshot not found", 404);
    }

    const runController = new AbortController();
    const runId = randomUUID();
    this.registerController(runId, runController);

    // Verify snapshot is unchanged
    await this.snapshotService.verifyUnchanged(
      draftVersion.contextSnapshotId,
      runController.signal,
    );

    // Create integration branch + worktree
    const prepared = await this.worktrees.prepareRun({
      projectId,
      runId,
      repositoryRoot: project.rootPath,
      branch: snapshot.sourceBranch,
      baseCommit: snapshot.sourceHead,
      signal: runController.signal,
    });

    let runSnapshot: RunSnapshot;
    try {
      runSnapshot = this.runs.transaction(() => {
        this.conversations.markDraftRunning(draftId);
        this.runs.createRun({
          id: runId,
          projectId,
          draftId,
          draftVersion: expectedDraftVersion,
          draftHash: draftVersion.sha256,
          contextSnapshotId: draftVersion.contextSnapshotId,
          contextHash: snapshot.manifestHash,
          baseBranch: snapshot.sourceBranch,
          baseCommit: snapshot.sourceHead,
          integrationBranch: prepared.integrationBranch,
          integrationWorktree: prepared.integrationWorktree,
          state: "planned",
          dispatchPaused: false,
          blockReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        const event = this.runs.appendEvent({
          runId,
          kind: "run.created",
          actorId: null,
          taskId: null,
          payload: {
            draftId,
            draftVersion: expectedDraftVersion,
            contextSnapshotId: draftVersion.contextSnapshotId,
          },
          createdAt: new Date().toISOString(),
        });
        this.realtime.publish(event);

        return this.runs.getRun(runId)!;
      });
    } catch (err) {
      // Step 5 failure cleanup
      await this.worktrees["git"]
        .run(
          project.rootPath,
          [
            "-c",
            `core.hooksPath=${this.worktrees["emptyHooksDir"]}`,
            "branch",
            "-D",
            prepared.integrationBranch,
          ],
          runController.signal,
        )
        .catch(() => undefined);

      await this.worktrees["git"]
        .run(
          project.rootPath,
          ["-c", `core.hooksPath=${this.worktrees["emptyHooksDir"]}`, "worktree", "prune"],
          runController.signal,
        )
        .catch(() => undefined);

      await rm(prepared.integrationWorktree, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw err;
    }

    // Schedule background workflow run
    this.runBackgroundWorkflow(
      runId,
      input,
      prepared.integrationWorktree,
      snapshot.sourceHead,
      runController.signal,
    )
      .catch((err) => this.handleBackgroundFailure(runId, err))
      .finally(() => this.removeController(runId));

    return runSnapshot;
  }

  registerController(runId: string, controller: AbortController): void {
    this.controllers.set(runId, controller);
  }

  removeController(runId: string): void {
    this.controllers.delete(runId);
  }

  private handleBackgroundFailure(runId: string, error: unknown): void {
    const run = this.runs.getRun(runId);
    if (!run || ["applied", "failed", "blocked", "cancelled"].includes(run.state)) return;
    const message = error instanceof Error ? error.message : String(error);
    this.transitionRun(runId, "failed", message);
  }

  // ── Background Workflow ──────────────────────────────────────────────

  private async runBackgroundWorkflow(
    runId: string,
    input: StartRunInput,
    integrationWorktree: string,
    baseCommit: string,
    signal: AbortSignal,
  ): Promise<void> {
    const { projectId, draftId, expectedDraftVersion } = input;

    const project = this.projects.getProject(projectId)!;
    const draftVersion = this.conversations.getDraftVersion(draftId, expectedDraftVersion)!;
    const profiles = this.projects.listRoleProfiles(projectId);
    const commands = this.projects.listCommands(projectId);

    const managerProfile = profiles.find((p) => p.id === "manager")!;
    const advisorProfile = profiles.find((p) => p.id === "advisor")!;

    // ── 6. Manager Planning ──
    const managerPrompt = buildManagerPlanPrompt(
      draftVersion,
      commands.map((c) => c.id),
    );
    const managerOutcome = await this.attempts.execute(
      {
        profile: managerProfile,
        requiredCapability: "readOnly",
        request: {
          runId,
          taskId: null,
          conversationId: null,
          contextSnapshotId: draftVersion.contextSnapshotId,
          role: "manager",
          prompt: managerPrompt,
          cwd: project.rootPath,
          timeoutMs: managerProfile.timeoutMs,
          readOnly: true,
          outputContract: "manager_plan",
        },
        repairPrompt: (err) => `Repair manager plan: ${err}`,
      },
      signal,
    );

    let plan = validatePlan(managerOutcome.execution.structuredOutput, draftVersion, commands);

    await this.attempts["runtime"].artifacts.writeText({
      runId,
      taskId: null,
      kind: "manager-plan",
      text: JSON.stringify(plan),
    });

    // ── 7. Advisor Preflight Pass 1 ──
    this.transitionRun(runId, "advisor_preflight");
    const preflightPrompt = buildPreflightPrompt({
      draft: draftVersion,
      plan,
      commandIds: commands.map((c) => c.id),
      passNumber: 1,
    });
    let advisorOutcome = await this.attempts.execute(
      {
        profile: advisorProfile,
        requiredCapability: "readOnly",
        request: {
          runId,
          taskId: null,
          conversationId: null,
          contextSnapshotId: draftVersion.contextSnapshotId,
          role: "advisor",
          prompt: preflightPrompt,
          cwd: project.rootPath,
          timeoutMs: advisorProfile.timeoutMs,
          readOnly: true,
          outputContract: "advisor_review",
        },
        repairPrompt: (err) => `Repair advisor review: ${err}`,
      },
      signal,
    );

    let review: any = advisorOutcome.execution.structuredOutput;

    // ── 8. Manager Revision (if rejected) ──
    if (review.verdict === "reject") {
      const revisionPrompt = buildManagerRevisionPrompt(draftVersion, plan, review);
      const revisionOutcome = await this.attempts.execute(
        {
          profile: managerProfile,
          requiredCapability: "readOnly",
          request: {
            runId,
            taskId: null,
            conversationId: null,
            contextSnapshotId: draftVersion.contextSnapshotId,
            role: "manager",
            prompt: revisionPrompt,
            cwd: project.rootPath,
            timeoutMs: managerProfile.timeoutMs,
            readOnly: true,
            outputContract: "manager_plan",
          },
          repairPrompt: (err) => `Repair manager revision: ${err}`,
        },
        signal,
      );

      plan = validatePlan(revisionOutcome.execution.structuredOutput, draftVersion, commands);

      // Preflight Pass 2
      const preflightPrompt2 = buildPreflightPrompt({
        draft: draftVersion,
        plan,
        commandIds: commands.map((c) => c.id),
        passNumber: 2,
      });

      advisorOutcome = await this.attempts.execute(
        {
          profile: advisorProfile,
          requiredCapability: "readOnly",
          request: {
            runId,
            taskId: null,
            conversationId: null,
            contextSnapshotId: draftVersion.contextSnapshotId,
            role: "advisor",
            prompt: preflightPrompt2,
            cwd: project.rootPath,
            timeoutMs: advisorProfile.timeoutMs,
            readOnly: true,
            outputContract: "advisor_review",
          },
          repairPrompt: (err) => `Repair advisor review: ${err}`,
        },
        signal,
      );

      review = advisorOutcome.execution.structuredOutput;
      if (review.verdict === "reject") {
        this.transitionRun(runId, "blocked", "advisor_preflight_rejected");
        return;
      }
    }

    // ── 9. Persist approved plan/tasks ──
    this.runs.transaction(() => {
      this.runs.insertTasks(runId, plan.tasks);
    });
    this.transitionRun(runId, "dispatching");
    this.transitionRun(runId, "working");

    // Call WorkerScheduler
    const schedulerResult = await this.scheduler.run(
      {
        runId,
        projectId,
        plan,
        contextSnapshotId: draftVersion.contextSnapshotId,
        workerProfiles: profiles,
        integrationWorktree,
        concurrency: input.concurrency,
      },
      signal,
    );

    // ── 10. Persist integration diff ──
    this.transitionRun(runId, "testing");

    const diffStat = await this.worktrees["git"].run(
      integrationWorktree,
      ["diff", "--stat", `${baseCommit}..HEAD`],
      signal,
    );
    const diffPatch = await this.worktrees["git"].run(
      integrationWorktree,
      ["diff", `${baseCommit}..HEAD`],
      signal,
    );

    const diffArtifact = await this.attempts["runtime"].artifacts.writeText({
      runId,
      taskId: null,
      kind: "integration-diff",
      text: JSON.stringify({ stat: diffStat, patch: diffPatch }),
    });

    // Call QA Runner
    const qaCommands: QaCommand[] = commands.map((c, idx) => ({
      id: c.id,
      executable: c.executable,
      args: c.args,
      cwd: integrationWorktree,
      timeoutMs: c.timeoutMs,
      required: c.required,
      position: idx + 1,
    }));

    const qaReport = await this.qa.run(
      {
        runId,
        taskId: "",
        commands: qaCommands,
        diffArtifactId: diffArtifact.id,
        allowedRepairPaths: plan.tasks.flatMap((t) => t.allowedPaths),
      },
      signal,
    );

    await this.attempts["runtime"].artifacts.writeJson({
      runId,
      taskId: null,
      kind: "qa-report",
      value: qaReport,
    });

    if (!qaReport.passed) {
      this.transitionRun(runId, "blocked", "qa_failed");
      return;
    }

    // ── 11. Advisor Delivery Pass 1 ──
    this.transitionRun(runId, "advisor_delivery");
    const deliveryPrompt = buildDeliveryPrompt({
      plan,
      diffArtifactId: diffArtifact.id,
      workerResultArtifactIds: schedulerResult.resultArtifactIds,
      qaResultArtifactIds: qaReport.results.map((r) => r.stdoutArtifactId),
      passNumber: 1,
    });

    advisorOutcome = await this.attempts.execute(
      {
        profile: advisorProfile,
        requiredCapability: "readOnly",
        request: {
          runId,
          taskId: null,
          conversationId: null,
          contextSnapshotId: draftVersion.contextSnapshotId,
          role: "advisor",
          prompt: deliveryPrompt,
          cwd: project.rootPath,
          timeoutMs: advisorProfile.timeoutMs,
          readOnly: true,
          outputContract: "advisor_review",
        },
        repairPrompt: (err) => `Repair advisor review: ${err}`,
      },
      signal,
    );

    review = advisorOutcome.execution.structuredOutput;

    // Delivery rejection repair cycle
    if (review.verdict === "reject") {
      this.transitionRun(runId, "blocked", "advisor_delivery_rejected");
      return; // Under standard configuration, block the run
    }

    // ── 12. Manager Synthesis ──
    const synthesisPrompt = `Synthesize results for run ${runId}`;
    const synthesisOutcome = await this.attempts.execute(
      {
        profile: managerProfile,
        requiredCapability: "readOnly",
        request: {
          runId,
          taskId: null,
          conversationId: null,
          contextSnapshotId: draftVersion.contextSnapshotId,
          role: "manager",
          prompt: synthesisPrompt,
          cwd: project.rootPath,
          timeoutMs: managerProfile.timeoutMs,
          readOnly: true,
          outputContract: "delivery_synthesis",
        },
        repairPrompt: (err) => `Repair manager synthesis: ${err}`,
      },
      signal,
    );

    await this.attempts["runtime"].artifacts.writeText({
      runId,
      taskId: null,
      kind: "delivery-synthesis",
      text: JSON.stringify(synthesisOutcome.execution.structuredOutput),
    });

    // ── 13. Ready to Apply ──
    this.transitionRun(runId, "ready_to_apply");
    this.removeController(runId);
  }

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
