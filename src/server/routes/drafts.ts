import type { FastifyInstance } from "fastify";
import { UpdateDraftRequestSchema } from "../../shared/api.js";
import type { ConversationService } from "../conversations/service.js";
import { AppError } from "../errors.js";

export function registerDraftRoutes(app: FastifyInstance, service: ConversationService): void {
  // 1. GET /api/drafts/:draftId
  app.get("/api/drafts/:draftId", async (request, reply) => {
    const { draftId } = request.params as { draftId: string };
    const { version } = request.query as { version?: string };
    const parsedVersion = version ? parseInt(version, 10) : undefined;

    const result = service.conversationStore.getDraftVersion(draftId, parsedVersion);
    if (!result) {
      throw new AppError("draft_not_found", "Draft version not found", 404);
    }
    return reply.send(result);
  });

  // 2. PUT /api/drafts/:draftId
  app.put("/api/drafts/:draftId", async (request, reply) => {
    const { draftId } = request.params as { draftId: string };
    const body = UpdateDraftRequestSchema.parse(request.body);

    const result = service.updateDraft(draftId, {
      objective: body.objective,
      scope: body.scope,
      constraints: body.constraints,
      acceptanceCriteria: body.acceptanceCriteria,
    });
    return reply.send(result);
  });
}
