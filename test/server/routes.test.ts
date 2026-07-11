import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createTestDependencies, type TestDependencies } from "../helpers/test-dependencies.js";
import { buildApp } from "../../src/server/app.js";
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
  deps.db
    .prepare(
      "INSERT INTO draft_versions (draft_id, version, objective, scope_json, constraints_json, acceptance_json, context_snapshot_id, source_message_ids_json, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(draftId, 1, "objective", "[]", "[]", "[]", snapshotId, "[]", "0".repeat(64), now);
}

function createRun(
  deps: TestDependencies,
  runId: string,
  projectId: string,
  draftId: string,
  snapshotId: string,
  state = "planned",
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

describe("HTTP routes (Runs and Storage)", () => {
  let deps: TestDependencies;
  let app: any;
  let headers: any;

  beforeEach(async () => {
    deps = await createTestDependencies();
    app = await buildApp(deps);
    headers = {
      Authorization: `Bearer ${deps.config.sessionToken}`,
      Origin: deps.config.publicOrigin,
    };
  });

  afterEach(async () => {
    await deps.close();
  });

  it("GET /api/runs/:runId 404s on missing run", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${randomUUID()}`,
      headers,
    });
    expect(response.statusCode).toBe(404);
  });

  it("performs run actions (pause, resume, cancel, apply)", async () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();

    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "working");

    const run = deps.runs.getRun(runId)!;

    // 1. Pause
    let res = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/pause`,
      headers,
      payload: { expectedUpdatedAt: run.updatedAt },
    });
    expect(res.statusCode).toBe(200);
    let snapshot = JSON.parse(res.body);
    expect(snapshot.dispatchPaused).toBe(true);

    // 2. Resume
    res = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/resume`,
      headers,
      payload: { expectedUpdatedAt: snapshot.updatedAt },
    });
    expect(res.statusCode).toBe(200);
    snapshot = JSON.parse(res.body);
    expect(snapshot.dispatchPaused).toBe(false);

    // 3. Cancel
    res = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/cancel`,
      headers,
      payload: { expectedUpdatedAt: snapshot.updatedAt },
    });
    expect(res.statusCode).toBe(202);
    snapshot = JSON.parse(res.body);
    expect(snapshot.state).toBe("cancelled");
  });

  it("exposes GET /api/runs/:runId/attempts", async () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();

    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "working");

    const res = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/attempts`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const attempts = JSON.parse(res.body);
    expect(Array.isArray(attempts)).toBe(true);
  });

  it("calculates storage usage and cleans up storage", async () => {
    const projectId = randomUUID();
    const draftId = randomUUID();
    const snapshotId = randomUUID();
    const runId = randomUUID();

    seedRunParents(deps, projectId, draftId, snapshotId);
    createRun(deps, runId, projectId, draftId, snapshotId, "failed");

    // 1. GET run storage
    let res = await app.inject({
      method: "GET",
      url: `/api/runs/${runId}/storage`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const storageInfo = JSON.parse(res.body);
    expect(storageInfo.runId).toBe(runId);
    expect(storageInfo.cleanupEligible).toBe(true);

    // 2. GET all storage
    res = await app.inject({
      method: "GET",
      url: "/api/storage",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const allStorage = JSON.parse(res.body);
    expect(Array.isArray(allStorage)).toBe(true);

    // 3. DELETE run storage (cleanup)
    res = await app.inject({
      method: "DELETE",
      url: `/api/runs/${runId}/storage`,
      headers,
      payload: { confirmation: runId },
    });
    expect(res.statusCode).toBe(200);
    const cleanupResult = JSON.parse(res.body);
    expect(cleanupResult.deletedArtifacts).toBeDefined();
    expect(cleanupResult.auditPreserved).toBe(true);
  });
});
