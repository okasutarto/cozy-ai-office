import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createTestDependencies, type TestDependencies } from "../helpers/test-dependencies.js";
import { OrchestratorEngine } from "../../src/server/orchestrator/engine.js";
import { assertTransition } from "../../src/server/orchestrator/state-machine.js";
import type { RunState } from "../../src/shared/contracts.js";
import { randomUUID } from "node:crypto";

// ── Helpers ─────────────────────────────────────────────────────────────

function seedRunParents(
  deps: TestDependencies,
  projectId: string,
  draftId: string,
  snapshotId: string,
): void {
  const now = new Date().toISOString();
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
}

function createRun(
  deps: TestDependencies,
  runId: string,
  projectId: string,
  draftId: string,
  snapshotId: string,
  state: RunState = "planned",
): void {
  const now = new Date().toISOString();
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
    state,
    dispatchPaused: false,
    blockReason: null,
    createdAt: now,
    updatedAt: now,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("state-machine", () => {
  it("allows legal transitions", () => {
    expect(() => assertTransition("planned", "advisor_preflight")).not.toThrow();
    expect(() => assertTransition("advisor_preflight", "dispatching")).not.toThrow();
    expect(() => assertTransition("dispatching", "working")).not.toThrow();
    expect(() => assertTransition("working", "testing")).not.toThrow();
    expect(() => assertTransition("testing", "advisor_delivery")).not.toThrow();
    expect(() => assertTransition("advisor_delivery", "ready_to_apply")).not.toThrow();
    expect(() => assertTransition("ready_to_apply", "applied")).not.toThrow();
  });

  it("rejects illegal transitions", () => {
    expect(() => assertTransition("applied", "planned")).toThrow(/Cannot transition/);
    expect(() => assertTransition("cancelled", "working")).toThrow(/Cannot transition/);
    expect(() => assertTransition("planned", "applied")).toThrow(/Cannot transition/);
    expect(() => assertTransition("testing", "dispatching")).toThrow(/Cannot transition/);
  });

  it("allows cancel from most states", () => {
    const cancellable: RunState[] = [
      "planned",
      "advisor_preflight",
      "dispatching",
      "working",
      "integrating",
      "integration_conflict",
      "testing",
      "advisor_delivery",
      "ready_to_apply",
    ];
    for (const state of cancellable) {
      expect(() => assertTransition(state, "cancelled")).not.toThrow();
    }
  });

  it("allows failed from active states", () => {
    const failable: RunState[] = [
      "planned",
      "advisor_preflight",
      "dispatching",
      "working",
      "integrating",
      "integration_conflict",
      "testing",
      "advisor_delivery",
    ];
    for (const state of failable) {
      expect(() => assertTransition(state, "failed")).not.toThrow();
    }
  });

  it("terminal states have no exits", () => {
    expect(() => assertTransition("applied", "cancelled")).toThrow();
    expect(() => assertTransition("failed", "cancelled")).toThrow();
    expect(() => assertTransition("cancelled", "failed")).toThrow();
    expect(() => assertTransition("blocked", "working")).toThrow();
  });
});

describe("OrchestratorEngine", () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = await createTestDependencies();
  });

  afterEach(async () => {
    await deps.close();
  });

  function makeEngine(deps: TestDependencies): OrchestratorEngine {
    const fakeWorktree = {
      applyToRoot: async () => "new-head",
    } as any;
    return new OrchestratorEngine(
      deps.runs,
      deps.realtime,
      deps.projects,
      deps.conversations,
      fakeWorktree,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it("transitions run state", () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "planned");

    const engine = makeEngine(deps);
    const result = engine.transitionRun(runId, "advisor_preflight");
    expect(result.state).toBe("advisor_preflight");
  });

  it("rejects illegal transition", () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "planned");

    const engine = makeEngine(deps);
    expect(() => engine.transitionRun(runId, "applied")).toThrow(/Cannot transition/);
  });

  it("pauses and resumes", () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "working");

    const engine = makeEngine(deps);
    let run = engine.pause(runId);
    expect(run.dispatchPaused).toBe(true);
    run = engine.resume(runId);
    expect(run.dispatchPaused).toBe(false);
  });

  it("cancels a run", async () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "working");

    const engine = makeEngine(deps);
    const run = await engine.cancel(runId);
    expect(run.state).toBe("cancelled");
  });

  it("applies from ready_to_apply", async () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "ready_to_apply");

    const engine = makeEngine(deps);
    const run = await engine.apply(runId);
    expect(run.state).toBe("applied");
  });

  it("rejects apply from non-ready state", async () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();
    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "working");

    const engine = makeEngine(deps);
    await expect(engine.apply(runId)).rejects.toThrow(/Cannot transition/);
  });
});
