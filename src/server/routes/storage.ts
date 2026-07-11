import type { FastifyInstance } from "fastify";
import { resolve, join } from "node:path";
import { lstat, readdir, rm, unlink } from "node:fs/promises";
import {
  CleanupRunRequestSchema,
  RunStorageSchema,
  CleanupResultSchema,
} from "../../shared/api.js";
import type { RunStore } from "../db/run-store.js";
import type { ArtifactStore } from "../artifacts/store.js";
import type { WorktreeService } from "../git/worktrees.js";
import type { ProjectStore } from "../db/project-store.js";
import { AppError } from "../errors.js";

// ── Directory Size Helper ──────────────────────────────────────────────

async function getDirSize(path: string): Promise<number> {
  let size = 0;
  try {
    const stats = await lstat(path);
    if (stats.isFile()) {
      return stats.size;
    }
    if (stats.isDirectory()) {
      const files = await readdir(path);
      for (const file of files) {
        size += await getDirSize(join(path, file));
      }
    }
  } catch {
    // Ignore ENOENT or read errors
  }
  return size;
}

export function registerStorageRoutes(
  app: FastifyInstance,
  runs: RunStore,
  artifacts: ArtifactStore,
  worktrees: WorktreeService,
  projects: ProjectStore,
): void {
  // Helper to check if a path is inside dataDir
  const dataDirResolved = resolve((runs as any).db ? join(artifacts.root, "..") : artifacts.root);
  function assertInside(path: string) {
    const resolved = resolve(path);
    if (!resolved.startsWith(dataDirResolved)) {
      throw new AppError("forbidden", "Access denied: outside data directory", 403);
    }
  }

  // Helper to build storage info for a run
  async function getRunStorageInfo(runId: string): Promise<any> {
    const run = runs.getRun(runId);
    if (!run) return null;

    const db = (runs as any).db;

    // Artifacts
    const artifactStats = db
      .prepare("SELECT COUNT(*) as count, SUM(size_bytes) as bytes FROM artifacts WHERE run_id = ?")
      .get(runId) as { count: number; bytes: number | null };
    const artifactCount = artifactStats.count;
    const artifactBytes = artifactStats.bytes ?? 0;

    // Worktrees
    let worktreeCount = 0;
    let worktreeBytes = 0;

    if (run.integrationWorktree) {
      worktreeCount++;
      worktreeBytes += await getDirSize(run.integrationWorktree);
    }

    for (const task of run.tasks) {
      const taskRow = db
        .prepare("SELECT worktree_path FROM tasks WHERE run_id = ? AND id = ?")
        .get(runId, task.id) as { worktree_path: string | null } | undefined;
      if (taskRow?.worktree_path) {
        worktreeCount++;
        worktreeBytes += await getDirSize(taskRow.worktree_path);
      }
    }

    const cleanupEligible = ["applied", "failed", "blocked", "cancelled"].includes(run.state);

    return {
      runId,
      artifactCount,
      artifactBytes,
      worktreeCount,
      worktreeBytes,
      cleanupEligible,
    };
  }

  // 1. GET /api/storage
  app.get("/api/storage", async (request, reply) => {
    // Return storage for all runs
    const db = (runs as any).db;
    const runRows = db.prepare("SELECT id FROM runs").all() as { id: string }[];
    const result = [];
    for (const row of runRows) {
      const info = await getRunStorageInfo(row.id);
      if (info) result.push(info);
    }
    return reply.send(result);
  });

  // 2. GET /api/runs/:runId/storage
  app.get("/api/runs/:runId/storage", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const info = await getRunStorageInfo(runId);
    if (!info) {
      throw new AppError("run_not_found", `Run ${runId} not found`, 404);
    }
    return reply.send(info);
  });

  // 3. DELETE /api/runs/:runId/storage
  app.delete("/api/runs/:runId/storage", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = CleanupRunRequestSchema.parse(request.body);

    if (body.confirmation !== runId) {
      throw new AppError("invalid_confirmation", "Confirmation code must match run ID", 400);
    }

    const run = runs.getRun(runId);
    if (!run) {
      throw new AppError("run_not_found", `Run ${runId} not found`, 404);
    }

    const cleanupEligible = ["applied", "failed", "blocked", "cancelled"].includes(run.state);
    if (!cleanupEligible) {
      throw new AppError("cleanup_ineligible", "Run is active and cannot be cleaned up", 400);
    }

    const db = (runs as any).db;
    const git = (worktrees as any).git;
    const project = projects.getProject(run.projectId);
    if (!project) {
      throw new AppError("project_not_found", "Project not found", 404);
    }

    let deletedArtifacts = 0;
    let deletedWorktrees = 0;
    let freedBytes = 0;

    // A. Clean up artifacts
    const artifactRows = db
      .prepare("SELECT id, relative_path, size_bytes FROM artifacts WHERE run_id = ?")
      .all(runId) as { id: string; relative_path: string; size_bytes: number }[];

    for (const row of artifactRows) {
      const fullPath = join(artifacts.root, row.relative_path);
      try {
        assertInside(fullPath);
        await unlink(fullPath);
        deletedArtifacts++;
        freedBytes += row.size_bytes;
      } catch (err: any) {
        if (err.code !== "ENOENT") {
          app.log.error(`Failed to delete artifact ${row.id}: ${err.message}`);
        }
      }
    }

    // B. Clean up worktrees
    const wts = [];
    if (run.integrationWorktree) {
      wts.push(run.integrationWorktree);
    }

    for (const task of run.tasks) {
      const taskRow = db
        .prepare("SELECT worktree_path FROM tasks WHERE run_id = ? AND id = ?")
        .get(runId, task.id) as { worktree_path: string | null } | undefined;
      if (taskRow?.worktree_path) {
        wts.push(taskRow.worktree_path);
      }
    }

    for (const wtPath of wts) {
      try {
        assertInside(wtPath);
        const size = await getDirSize(wtPath);
        // git worktree remove --force <path>
        await git.run(
          project.rootPath,
          ["worktree", "remove", "--force", wtPath],
          new AbortController().signal,
        );
        deletedWorktrees++;
        freedBytes += size;
      } catch (err: any) {
        app.log.error(`Failed to remove worktree ${wtPath}: ${err.message}`);
        // If git command fails, try manual rm
        try {
          await rm(wtPath, { recursive: true, force: true });
        } catch {}
      }
    }

    // C. Delete empty run directory
    const runDir = join(artifacts.root, runId);
    try {
      assertInside(runDir);
      await rm(runDir, { recursive: true, force: true });
    } catch {}

    // D. Append audit event
    runs.transaction(() => {
      runs.appendEvent({
        runId,
        kind: "run.state.changed", // using a generic run state changed event or state action log
        actorId: null,
        taskId: null,
        payload: { cause: "storage.cleaned", deletedArtifacts, deletedWorktrees, freedBytes },
        createdAt: new Date().toISOString(),
      });
    });

    return reply.send({
      runId,
      deletedArtifacts,
      deletedWorktrees,
      freedBytes,
      auditPreserved: true,
    });
  });
}
