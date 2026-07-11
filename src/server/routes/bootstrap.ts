import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../app.js";
import { BootstrapResponseSchema } from "../../shared/api.js";

export function registerBootstrapRoute(app: FastifyInstance, dependencies: AppDependencies): void {
  app.get("/api/bootstrap", async (request, reply) => {
    const projects = dependencies.projects.listProjects().map((p) => ({
      id: p.id,
      name: p.name,
      rootPath: p.rootPath,
      updatedAt: p.updatedAt,
    }));
    const providers = dependencies.projects.listProviderStatuses();
    const activeRuns = dependencies.runs.listActiveRuns();
    const activeRun =
      activeRuns.length > 0
        ? [...activeRuns].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        : dependencies.runs.getLatestRun();

    const data = {
      projects,
      providers,
      activeRun,
    };

    const parsed = BootstrapResponseSchema.parse(data);
    return reply.send(parsed);
  });
}
