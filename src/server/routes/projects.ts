import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import {
  SelectProjectRequestSchema,
  UpdateRoleProfilesRequestSchema,
  CreateContextSnapshotRequestSchema,
} from "../../shared/api.js";
import { CommandSpecSchema, ProviderStatusSchema } from "../../shared/contracts.js";
import type { ProjectService } from "../projects/service.js";
import { ContextSnapshotService, MAX_CONTEXT_FILE_BYTES } from "../context/snapshots.js";
import { AppError, errorMessage } from "../errors.js";

const UpdateCommandsRequestSchema = z.object({
  commands: z.array(CommandSpecSchema),
});

const VerifyAntigravityLoginSchema = z.object({
  model: z.string().nullable(),
  confirmation: z.literal("USE SUBSCRIPTION TURN"),
});

function isCredentialShaped(path: string): boolean {
  const name = path.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === "id_rsa" ||
    name === "id_ed25519" ||
    name === "credentials.json" ||
    /^service-account.*\.json$/u.test(name) ||
    /\.(pem|p12|pfx|key)$/u.test(name)
  );
}

export function registerProjectRoutes(
  app: FastifyInstance,
  projectService: ProjectService,
  snapshotService: ContextSnapshotService,
): void {
  // 1. POST /api/projects/select & POST /api/projects
  const selectHandler = async (request: any, reply: any) => {
    const body = SelectProjectRequestSchema.parse(request.body);
    const result = await projectService.selectProject(body.rootPath, new AbortController().signal);
    return reply.send(result);
  };
  app.post("/api/projects/select", selectHandler);
  app.post("/api/projects", selectHandler);

  // 2. POST /api/projects/:projectId/providers/probe
  app.post("/api/projects/:projectId/providers/probe", async (request, reply) => {
    const result = await projectService.probeProviders(new AbortController().signal);
    return reply.send(result);
  });

  // 3. POST /api/projects/:projectId/providers/antigravity/verify-login
  app.post(
    "/api/projects/:projectId/providers/antigravity/verify-login",
    async (request, reply) => {
      const body = VerifyAntigravityLoginSchema.parse(request.body);
      const result = await projectService.verifyAntigravityLogin(
        body.model,
        new AbortController().signal,
      );
      return reply.send(result);
    },
  );

  // 4. GET /api/projects/:projectId/onboarding
  app.get("/api/projects/:projectId/onboarding", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = projectService.store.getProject(projectId);
    if (!project) {
      throw new AppError("project_not_found", "Project not found", 404);
    }
    const commands = projectService.store.listCommands(projectId);
    const roles = projectService.store.listRoleProfiles(projectId);
    const contextSnapshotId = projectService.store.getLatestContextSnapshot(projectId)?.id ?? null;
    return reply.send({
      project,
      commands,
      roles,
      contextSnapshotId,
    });
  });

  // 5. PUT /api/projects/:projectId/commands
  app.put("/api/projects/:projectId/commands", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = UpdateCommandsRequestSchema.parse(request.body);
    projectService.saveCommands(projectId, body.commands);
    return reply.send({ ok: true });
  });

  // 6. PUT /api/projects/:projectId/roles
  app.put("/api/projects/:projectId/roles", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = UpdateRoleProfilesRequestSchema.parse(request.body);

    const profiles = body.profiles;

    // Enforce constraints
    const requiredIds = [
      "manager",
      "advisor",
      "qa",
      "worker-1",
      "worker-2",
      "worker-3",
      "worker-4",
    ];
    const ids = profiles.map((p) => p.id);
    for (const reqId of requiredIds) {
      if (!ids.includes(reqId as any)) {
        throw new AppError("invalid_role_update", `Missing role profile for: ${reqId}`, 400);
      }
    }

    // Load current provider statuses to verify capabilities
    const statuses = projectService.store.listProviderStatuses();
    const readOnlyCapables = new Set(
      statuses
        .filter((s) => s.installed && s.authenticated && s.capabilities.readOnly)
        .map((s) => s.provider),
    );

    for (const profile of profiles) {
      // Profile role matches profile ID
      if (profile.id === "manager" && profile.role !== "manager") {
        throw new AppError("invalid_role_update", "Manager role profile mismatch", 400);
      }
      if (profile.id === "advisor" && profile.role !== "advisor") {
        throw new AppError("invalid_role_update", "Advisor role profile mismatch", 400);
      }
      if (profile.id === "qa" && profile.role !== "qa") {
        throw new AppError("invalid_role_update", "QA role profile mismatch", 400);
      }
      if (profile.id.startsWith("worker") && profile.role !== "worker") {
        throw new AppError("invalid_role_update", "Worker role profile mismatch", 400);
      }

      // Manager/Advisor/QA chains contain at least one currently read-only-capable provider
      if (["manager", "advisor", "qa"].includes(profile.id)) {
        const hasReadOnly = profile.providerChain.some((c) => readOnlyCapables.has(c.provider));
        if (!hasReadOnly) {
          throw new AppError(
            "invalid_role_update",
            `Role profile ${profile.id} chain must contain at least one currently read-only-capable provider`,
            400,
          );
        }
      }

      // Duplicate provider/model candidates are rejected
      const seen = new Set<string>();
      for (const candidate of profile.providerChain) {
        const key = `${candidate.provider}:${candidate.model || ""}`;
        if (seen.has(key)) {
          throw new AppError("invalid_role_update", `Duplicate provider candidate: ${key}`, 400);
        }
        seen.add(key);
      }
    }

    projectService.saveRoleProfiles(projectId, profiles);
    return reply.send({ ok: true });
  });

  // 7. GET /api/projects/:projectId/context-candidates
  app.get("/api/projects/:projectId/context-candidates", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = projectService.store.getProject(projectId);
    if (!project) {
      throw new AppError("project_not_found", "Project not found", 404);
    }

    const inspection = await projectService.repositories.inspect(
      project.rootPath,
      new AbortController().signal,
    );

    const candidates: string[] = [];
    const excluded: { path: string; reason: string }[] = [];
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW || 0);

    for (const relPath of inspection.trackedPaths) {
      if (isCredentialShaped(relPath)) {
        excluded.push({ path: relPath, reason: "file contains credentials shape" });
        continue;
      }
      const fullPath = join(project.rootPath, relPath);
      try {
        const stats = await lstat(fullPath);
        if (!stats.isFile()) {
          excluded.push({ path: relPath, reason: "not a regular file" });
          continue;
        }
        if (stats.size > MAX_CONTEXT_FILE_BYTES) {
          excluded.push({ path: relPath, reason: "exceeds 2 MiB file size limit" });
          continue;
        }
        const handle = await open(fullPath, flags);
        try {
          const buf = Buffer.alloc(Math.min(8192, stats.size));
          await handle.read(buf, 0, buf.length, 0);
          if (buf.includes(0)) {
            excluded.push({ path: relPath, reason: "contains a NUL byte (binary file)" });
            continue;
          }
        } finally {
          await handle.close();
        }
        candidates.push(relPath);
      } catch (err) {
        excluded.push({ path: relPath, reason: `failed to inspect: ${errorMessage(err)}` });
      }
    }

    return reply.send({ candidates, excluded });
  });

  // 8. POST /api/projects/:projectId/context-snapshots
  app.post("/api/projects/:projectId/context-snapshots", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = CreateContextSnapshotRequestSchema.parse(request.body);
    const snapshot = await snapshotService.create(
      projectId,
      body.paths,
      new AbortController().signal,
    );
    return reply.send(snapshot);
  });

  // 9. GET /api/context-snapshots/:snapshotId
  app.get("/api/context-snapshots/:snapshotId", async (request, reply) => {
    const { snapshotId } = request.params as { snapshotId: string };
    const snapshot = snapshotService.get(snapshotId);
    if (!snapshot) {
      throw new AppError("snapshot_not_found", "Snapshot not found", 404);
    }
    return reply.send(snapshot);
  });
}
