import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolve, join } from "node:path";
import { readFile } from "node:fs/promises";
import {
  StartRunRequestSchema,
  RunActionRequestSchema,
  RetryTaskRequestSchema,
} from "../../shared/api.js";
import type { OrchestratorEngine } from "../orchestrator/engine.js";
import type { RunStore } from "../db/run-store.js";
import type { ArtifactStore } from "../artifacts/store.js";
import type { ConversationStore } from "../db/conversation-store.js";
import { AppError } from "../errors.js";

export function registerRunRoutes(
  app: FastifyInstance,
  engine: OrchestratorEngine,
  runs: RunStore,
  artifacts: ArtifactStore,
  conversations: ConversationStore,
): void {
  // 1. POST /api/drafts/:draftId/start
  app.post("/api/drafts/:draftId/start", async (request, reply) => {
    const { draftId } = request.params as { draftId: string };
    const body = StartRunRequestSchema.parse(request.body);

    const db = (conversations as any).db;
    const draftRow = db
      .prepare("SELECT project_id FROM drafts WHERE id = ?")
      .get(draftId) as { project_id: string } | undefined;

    if (!draftRow) {
      throw new AppError("draft_not_found", `Draft ${draftId} not found`, 404);
    }

    const run = await engine.start({
      projectId: draftRow.project_id,
      draftId,
      expectedDraftVersion: body.expectedDraftVersion,
      concurrency: body.concurrency as any,
    });

    return reply.status(202).send(run);
  });

  // 2. GET /api/runs/:runId
  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = runs.getRun(runId);
    if (!run) {
      throw new AppError("run_not_found", `Run ${runId} not found`, 404);
    }
    return reply.send(run);
  });

  // 3. GET /api/runs/:runId/events
  app.get("/api/runs/:runId/events", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { after } = request.query as { after?: string };
    const afterSequence = after ? parseInt(after, 10) : 0;

    const events = runs.listEvents(runId, afterSequence);
    return reply.send(events);
  });

  // 4. GET /api/runs/:runId/diff
  app.get("/api/runs/:runId/diff", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const artifact = artifacts.getArtifactByKind(runId, "integration-diff");
    if (!artifact) {
      throw new AppError("diff_not_found", `Diff for run ${runId} not found`, 404);
    }

    const absPath = join(artifacts.root, artifact.relativePath);
    const resolvedRoot = resolve(artifacts.root);
    const resolvedPath = resolve(absPath);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      throw new AppError("forbidden", "Access denied", 403);
    }

    const contentStr = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(contentStr);

    return reply.send({
      artifact: {
        id: artifact.id,
        runId: artifact.runId,
        taskId: artifact.taskId,
        kind: artifact.kind,
        sha256: artifact.sha256,
        sizeBytes: artifact.sizeBytes,
        createdAt: artifact.createdAt,
      },
      stat: parsed.stat,
      patch: parsed.patch,
      truncated: false,
    });
  });

  // 5. GET /api/runs/:runId/qa
  app.get("/api/runs/:runId/qa", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const artifact = artifacts.getArtifactByKind(runId, "qa-report");
    if (!artifact) {
      throw new AppError("qa_report_not_found", `QA report for run ${runId} not found`, 404);
    }

    const absPath = join(artifacts.root, artifact.relativePath);
    const resolvedRoot = resolve(artifacts.root);
    const resolvedPath = resolve(absPath);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      throw new AppError("forbidden", "Access denied", 403);
    }

    const contentStr = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(contentStr);

    return reply.send({
      status: parsed.passed ? "passed" : "failed",
      repairAttempted: parsed.cycleCount > 1,
      diagnosisArtifactId: parsed.diagnosisArtifactId,
      commands: parsed.results.map((r: any) => ({
        commandId: r.commandId,
        label: r.commandId,
        cycleNumber: parsed.cycleCount,
        exitCode: r.exitCode,
        durationMs: r.durationMs,
        status: r.status,
        stdoutArtifactId: r.stdoutArtifactId,
        stderrArtifactId: r.stderrArtifactId,
      })),
    });
  });

  // 6. GET /api/runs/:runId/attempts
  app.get("/api/runs/:runId/attempts", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const db = (conversations as any).db;
    const attempts = db
      .prepare(
        "SELECT id, task_id as taskId, role, profile_id as profileId, provider, model, stage, attempt_number as attemptNumber, status, exit_code as exitCode, error_code as errorCode, stdout_artifact_id as stdoutArtifactId, stderr_artifact_id as stderrArtifactId, started_at as startedAt, ended_at as finishedAt FROM attempts WHERE run_id = ?",
      )
      .all(runId) as any[];

    // Ensure all numeric fields are converted properly
    const mapped = attempts.map((a) => ({
      ...a,
      durationMs: 0, // Placeholder as we don't save durationMs in attempts database schema
    }));

    return reply.send(mapped);
  });

  // 7. GET /api/artifacts/:artifactId
  app.get("/api/artifacts/:artifactId", async (request, reply) => {
    const { artifactId } = request.params as { artifactId: string };
    const artifact = artifacts.getArtifact(artifactId);
    if (!artifact) {
      throw new AppError("artifact_not_found", `Artifact ${artifactId} not found`, 404);
    }

    const absPath = join(artifacts.root, artifact.relativePath);
    const resolvedRoot = resolve(artifacts.root);
    const resolvedPath = resolve(absPath);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      throw new AppError("forbidden", "Access denied", 403);
    }

    const content = await readFile(resolvedPath);
    return reply.send(content);
  });

  // 8. POST /api/runs/:runId/pause
  app.post("/api/runs/:runId/pause", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = RunActionRequestSchema.parse(request.body);

    const run = runs.getRun(runId);
    if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);

    if (run.updatedAt !== body.expectedUpdatedAt) {
      throw new AppError("conflict", "Run changed; review current state", 409);
    }

    const updated = engine.pause(runId);
    return reply.send(updated);
  });

  // 9. POST /api/runs/:runId/resume
  app.post("/api/runs/:runId/resume", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = RunActionRequestSchema.parse(request.body);

    const run = runs.getRun(runId);
    if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);

    if (run.updatedAt !== body.expectedUpdatedAt) {
      throw new AppError("conflict", "Run changed; review current state", 409);
    }

    const updated = engine.resume(runId);
    return reply.send(updated);
  });

  // 10. POST /api/runs/:runId/cancel
  app.post("/api/runs/:runId/cancel", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = RunActionRequestSchema.parse(request.body);

    const run = runs.getRun(runId);
    if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);

    if (run.updatedAt !== body.expectedUpdatedAt) {
      throw new AppError("conflict", "Run changed; review current state", 409);
    }

    const updated = await engine.cancel(runId);
    return reply.status(202).send(updated);
  });

  // 11. POST /api/runs/:runId/retry-task
  app.post("/api/runs/:runId/retry-task", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = RetryTaskRequestSchema.parse(request.body);

    const run = runs.getRun(runId);
    if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);

    if (run.updatedAt !== body.expectedUpdatedAt) {
      throw new AppError("conflict", "Run changed; review current state", 409);
    }

    const updated = await engine.retryInterruptedTask(runId, body.taskId);
    return reply.send(updated);
  });

  // 12. POST /api/runs/:runId/apply
  app.post("/api/runs/:runId/apply", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = RunActionRequestSchema.parse(request.body);

    const run = runs.getRun(runId);
    if (!run) throw new AppError("run_not_found", `Run ${runId} not found`, 404);

    if (run.updatedAt !== body.expectedUpdatedAt) {
      throw new AppError("conflict", "Run changed; review current state", 409);
    }

    const updated = await engine.apply(runId);
    return reply.send(updated);
  });
}
