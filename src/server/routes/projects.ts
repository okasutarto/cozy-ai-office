import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SelectProjectRequestSchema, UpdateRoleProfilesRequestSchema } from "../../shared/api.js";
import { CommandSpecSchema, ProviderStatusSchema } from "../../shared/contracts.js";
import type { ProjectService } from "../projects/service.js";
import { AppError } from "../errors.js";

const UpdateCommandsRequestSchema = z.object({
  commands: z.array(CommandSpecSchema),
});

const VerifyAntigravityLoginSchema = z.object({
  model: z.string().nullable(),
  confirmation: z.literal("USE SUBSCRIPTION TURN"),
});

export function registerProjectRoutes(app: FastifyInstance, projectService: ProjectService): void {
  // 1. POST /api/projects/select
  app.post("/api/projects/select", async (request, reply) => {
    const body = SelectProjectRequestSchema.parse(request.body);
    const result = await projectService.selectProject(body.rootPath, request.signal);
    return reply.send(result);
  });

  // 2. POST /api/projects/:projectId/providers/probe
  app.post("/api/projects/:projectId/providers/probe", async (request, reply) => {
    const result = await projectService.probeProviders(request.signal);
    return reply.send(result);
  });

  // 3. POST /api/projects/:projectId/providers/antigravity/verify-login
  app.post(
    "/api/projects/:projectId/providers/antigravity/verify-login",
    async (request, reply) => {
      const body = VerifyAntigravityLoginSchema.parse(request.body);
      const result = await projectService.verifyAntigravityLogin(body.model, request.signal);
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
    return reply.send({
      project,
      commands,
      roles,
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
}
