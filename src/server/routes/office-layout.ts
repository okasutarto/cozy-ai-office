import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { OfficeLayoutSchema } from "../../shared/api.js";

const EMPTY_LAYOUT = { floors: {}, furniture: [] };

export function registerOfficeLayoutRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/office-layout",
    async (request, reply) => {
      const row = db
        .prepare("SELECT layout_json FROM office_layouts WHERE project_id = ?")
        .get(request.params.projectId) as { layout_json: string } | undefined;
      return reply.send(row ? OfficeLayoutSchema.parse(JSON.parse(row.layout_json)) : EMPTY_LAYOUT);
    },
  );

  app.put<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/office-layout",
    async (request, reply) => {
      const layout = OfficeLayoutSchema.parse(request.body);
      db.prepare(
        `INSERT INTO office_layouts (project_id, layout_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET layout_json = excluded.layout_json, updated_at = excluded.updated_at`,
      ).run(request.params.projectId, JSON.stringify(layout), new Date().toISOString());
      return reply.send(layout);
    },
  );
}
