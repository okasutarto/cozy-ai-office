import type { FastifyInstance } from "fastify";
import {
  CreateConversationRequestSchema,
  SendMessageRequestSchema,
  ForwardToManagerRequestSchema,
} from "../../shared/api.js";
import type { ConversationService } from "../conversations/service.js";
import { AppError } from "../errors.js";

export function registerConversationRoutes(
  app: FastifyInstance,
  service: ConversationService,
): void {
  // 1. POST /api/projects/:projectId/conversations
  app.post("/api/projects/:projectId/conversations", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = CreateConversationRequestSchema.parse(request.body);
    const result = service.create({
      projectId,
      role: body.role,
      profileId: body.profileId,
      contextSnapshotId: body.contextSnapshotId,
      title: "New Conversation", // ponytail: title defaults to New Conversation. Upgrade path: make title customizable in request body.
    });
    return reply.send(result);
  });

  // 2. GET /api/projects/:projectId/conversations
  app.get("/api/projects/:projectId/conversations", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const result = service.conversationStore.listConversations(projectId);
    return reply.send(result);
  });

  // 3. GET /api/conversations/:conversationId/messages
  app.get("/api/conversations/:conversationId/messages", async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const conv = service.conversationStore.getConversation(conversationId);
    if (!conv) {
      throw new AppError("conversation_not_found", "Conversation not found", 404);
    }
    const result = service.conversationStore.listMessages(conversationId);
    return reply.send(result);
  });

  // 4. POST /api/conversations/:conversationId/messages
  app.post("/api/conversations/:conversationId/messages", async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const body = SendMessageRequestSchema.parse(request.body);
    const result = await service.send(
      conversationId,
      {
        body: body.body,
        selectedMessageIds: body.selectedMessageIds,
        selectedArtifactIds: body.selectedArtifactIds,
        additionalUsageConfirmed: body.additionalUsageConfirmed,
      },
      new AbortController().signal,
    );
    return reply.send(result);
  });

  // 5. POST /api/conversations/:conversationId/forward-to-manager
  app.post("/api/conversations/:conversationId/forward-to-manager", async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const body = ForwardToManagerRequestSchema.parse(request.body);
    const result = await service.forwardToManager(
      conversationId,
      body.messageIds,
      new AbortController().signal,
    );
    return reply.send(result);
  });
}
