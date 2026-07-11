import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createTestDependencies, type TestDependencies } from "../helpers/test-dependencies.js";
import {
  WorkerScheduler,
  type WorkerExecutionPort,
  type SchedulerInput,
} from "../../src/server/orchestrator/scheduler.js";
import type { ContextSnapshotService } from "../../src/server/context/snapshots.js";
import type { WorktreeService, TaskWorktree } from "../../src/server/git/worktrees.js";
import type { ValidatedPlan } from "../../src/server/orchestrator/plan-validator.js";
import type { RoleProfile, TaskBrief, WorkerResult } from "../../src/shared/contracts.js";
import { randomUUID } from "node:crypto";

// ── Fakes ───────────────────────────────────────────────────────────

function makeFakeExecutor(executionLog: string[]): WorkerExecutionPort {
  return {
    async execute(input) {
      executionLog.push(input.task.id);
      return {
        status: "completed",
        summary: `Completed ${input.task.id}`,
        findings: [],
        changedFiles: [],
        verification: [],
        risks: [],
      } satisfies WorkerResult;
    },
    async resolveConflict() {
      return {
        status: "completed",
        summary: "Conflict resolved",
        findings: [],
        changedFiles: [],
        verification: [],
        risks: [],
      } satisfies WorkerResult;
    },
  };
}

function makeFakeWorktreeService(): WorktreeService {
  return {
    createTaskWorktree: async (input: {
      task: TaskBrief;
      signal: AbortSignal;
    }): Promise<TaskWorktree> => ({
      branch: `cozy/test/${input.task.id}`,
      path: `/tmp/fake-worktree/${input.task.id}`,
      baseCommit: "a".repeat(40),
    }),
    validateAndCommit: async () => ({ commitSha: "", changedFiles: [] }),
    integrateCommit: async () => ({ conflictFiles: [] }),
    resolveConflict: async () => "a".repeat(40),
  } as unknown as WorktreeService;
}

function makeFakeSnapshotService(): ContextSnapshotService {
  return {} as ContextSnapshotService;
}

function makeWorkerProfile(id: "worker-1" | "worker-2" | "worker-3" | "worker-4"): RoleProfile {
  return {
    id,
    role: "worker",
    label: id,
    providerChain: [{ provider: "codex", model: null }],
    timeoutMs: 60_000,
    promptVersion: "v1",
  };
}

function makeTaskBrief(overrides: Partial<TaskBrief> & { id: string; title: string }): TaskBrief {
  return {
    objective: "Test objective",
    mode: "read_only",
    dependsOn: [],
    contextArtifacts: [],
    allowedPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: ["done"],
    verificationCommands: [],
    ...overrides,
  };
}

function makePlan(tasks: TaskBrief[]): ValidatedPlan {
  // Simple topo order: respect dependsOn
  const completed = new Set<string>();
  const order: string[] = [];
  const remaining = [...tasks];
  while (remaining.length > 0) {
    const nextIdx = remaining.findIndex((t) => t.dependsOn.every((d) => completed.has(d)));
    if (nextIdx === -1) throw new Error("Cycle in test plan");
    const task = remaining.splice(nextIdx, 1)[0]!;
    order.push(task.id);
    completed.add(task.id);
  }

  return {
    summary: "Test plan",
    risks: [],
    testStrategy: ["test"],
    tasks,
    topologicalOrder: order,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("WorkerScheduler", () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = await createTestDependencies();
  });

  afterEach(async () => {
    await deps.close();
  });

  it("executes tasks in dependency order", async () => {
    const executionLog: string[] = [];
    const executor = makeFakeExecutor(executionLog);

    const scheduler = new WorkerScheduler(
      deps.runs,
      makeFakeWorktreeService(),
      makeFakeSnapshotService(),
      executor,
      deps.realtime,
    );

    const taskA = makeTaskBrief({ id: "task-a", title: "Task A" });
    const taskB = makeTaskBrief({
      id: "task-b",
      title: "Task B",
      dependsOn: ["task-a"],
    });

    const plan = makePlan([taskA, taskB]);
    const runId = randomUUID();
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const now = new Date().toISOString();

    // Seed FK parent records
    deps.db
      .prepare(
        "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(projectId, "test", "/tmp/test", now, now);
    deps.db
      .prepare(
        "INSERT INTO context_snapshots (id, project_id, source_branch, source_head, manifest_hash, directory_path, excluded_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(snapshotId, projectId, "main", "a".repeat(40), "0".repeat(64), "/tmp/ctx", "[]", now);
    deps.db
      .prepare(
        "INSERT INTO drafts (id, project_id, current_version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(draftId, projectId, 1, "active", now, now);

    // Create run record and insert tasks
    deps.runs.createRun({
      id: runId,
      projectId,
      draftId,
      draftVersion: 1,
      draftHash: "0".repeat(64),
      contextSnapshotId: snapshotId,
      contextHash: "0".repeat(64),
      baseBranch: "main",
      baseCommit: "a".repeat(40),
      integrationBranch: "cozy/test/integration",
      integrationWorktree: "/tmp/integration",
      state: "working",
      dispatchPaused: false,
      blockReason: null,
      createdAt: now,
      updatedAt: now,
    });
    deps.runs.insertTasks(runId, [taskA, taskB]);

    const input: SchedulerInput = {
      runId,
      projectId,
      plan,
      contextSnapshotId: randomUUID(),
      workerProfiles: [makeWorkerProfile("worker-1")],
      integrationWorktree: "/tmp/integration",
      concurrency: 1,
    };

    const controller = new AbortController();
    const result = await scheduler.run(input, controller.signal);

    // task-a must execute before task-b
    expect(executionLog).toEqual(["task-a", "task-b"]);
    expect(result.completedTaskIds).toEqual(["task-a", "task-b"]);
  });

  it("rejects concurrency outside 1..4", async () => {
    const scheduler = new WorkerScheduler(
      deps.runs,
      makeFakeWorktreeService(),
      makeFakeSnapshotService(),
      makeFakeExecutor([]),
      deps.realtime,
    );

    const plan = makePlan([makeTaskBrief({ id: "task-x", title: "X" })]);
    const input: SchedulerInput = {
      runId: randomUUID(),
      projectId: randomUUID(),
      plan,
      contextSnapshotId: randomUUID(),
      workerProfiles: [],
      integrationWorktree: "/tmp/integration",
      concurrency: 5,
    };

    await expect(scheduler.run(input, new AbortController().signal)).rejects.toThrow(
      /Concurrency must be an integer 1\.\.4/,
    );
  });
});
