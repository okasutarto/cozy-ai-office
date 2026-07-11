import fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { randomBytes, timingSafeEqual } from "node:crypto";
import WebSocket from "ws";
import type { ServerConfig } from "./config.js";
import { SessionGuard } from "./security/session.js";
import type { ProjectStore } from "./db/project-store.js";
import type { ConversationStore } from "./db/conversation-store.js";
import type { RunStore } from "./db/run-store.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { ArtifactStore } from "./artifacts/store.js";
import type { RealtimeHub } from "./realtime/hub.js";
import { AppError } from "./errors.js";
import { WsClientMessageSchema } from "../shared/api.js";
import { registerBootstrapRoute } from "./routes/bootstrap.js";

export type AppDependencies = {
  config: ServerConfig;
  session: SessionGuard;
  projects: ProjectStore;
  conversations: ConversationStore;
  runs: RunStore;
  providers: ProviderRegistry;
  artifacts: ArtifactStore;
  realtime: RealtimeHub;
};

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = fastify({
    logger: true,
    bodyLimit: 1024 * 1024,
  });

  // Register WebSocket plugin
  await app.register(websocket);

  // Error Handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode || 400).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details || null,
        },
      });
    } else {
      app.log.error(error);
      const statusCode =
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        typeof (error as any).statusCode === "number"
          ? (error as any).statusCode
          : 500;
      reply.status(statusCode).send({
        error: {
          code: "internal_server_error",
          message: "An internal server error occurred",
          details: null,
        },
      });
    }
  });

  // onRequest Hook for APIs
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }
    if (request.url === "/api/health") {
      return;
    }

    const origin = request.headers.origin;
    const method = request.method;

    dependencies.session.assertHttpOrigin(origin, method);
    dependencies.session.assertAuthorization(request.headers.authorization);
  });

  // Health route
  app.get("/api/health", async () => {
    return { ok: true };
  });

  // Register bootstrap route
  registerBootstrapRoute(app, dependencies);

  // WebSocket Route
  app.get(
    "/ws",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const origin = request.headers.origin;
        try {
          if (!origin) {
            throw new AppError("origin_forbidden", "Origin header is required for WebSocket", 403);
          }
          dependencies.session.assertWebSocketOrigin(origin);
        } catch (err) {
          const statusCode = err instanceof AppError ? err.statusCode : 403;
          const msg = err instanceof Error ? err.message : "Forbidden";
          reply.code(statusCode).send(msg);
          return reply;
        }
      },
    },
    (socket, req) => {
      const nonce = randomBytes(16).toString("hex");

      socket.send(JSON.stringify({ type: "challenge", nonce }));

      let authenticated = false;
      let authTimeout: NodeJS.Timeout | null = null;
      let malformedCount = 0;
      let nonceConsumed = false;

      authTimeout = setTimeout(() => {
        if (!authenticated) {
          socket.close(4401, "Authentication timeout");
        }
      }, dependencies.config.websocketAuthTimeoutMs);

      socket.on("message", (rawMessage: WebSocket.RawData) => {
        let data: any;
        try {
          data = JSON.parse(rawMessage.toString());
        } catch (err) {
          malformedCount++;
          socket.send(
            JSON.stringify({ type: "error", code: "malformed_frame", message: "Invalid JSON" }),
          );
          if (malformedCount >= 3) {
            socket.close(4400, "Too many malformed frames");
          }
          return;
        }

        if (!authenticated) {
          if (data?.type !== "auth") {
            malformedCount++;
            socket.send(
              JSON.stringify({
                type: "error",
                code: "unauthorized",
                message: "Authentication required",
              }),
            );
            if (malformedCount >= 3) {
              socket.close(4400, "Too many malformed frames");
            }
            return;
          }

          const parseResult = WsClientMessageSchema.safeParse(data);
          if (!parseResult.success) {
            malformedCount++;
            socket.send(
              JSON.stringify({
                type: "error",
                code: "invalid_auth_frame",
                message: parseResult.error.message,
              }),
            );
            if (malformedCount >= 3) {
              socket.close(4400, "Too many malformed frames");
            }
            return;
          }

          const authData = parseResult.data;
          if (authData.type !== "auth") return;

          if (nonceConsumed) {
            socket.close(4401, "Nonce already consumed");
            return;
          }
          nonceConsumed = true;

          const nonceMatches = safeEqual(authData.nonce, nonce);
          const tokenMatches = dependencies.session.verifyToken(authData.token);

          if (!nonceMatches || !tokenMatches) {
            socket.close(4401, "Invalid token or nonce");
            return;
          }

          authenticated = true;
          if (authTimeout) {
            clearTimeout(authTimeout);
            authTimeout = null;
          }

          dependencies.realtime.add(socket);
          socket.send(JSON.stringify({ type: "authenticated" }));
          return;
        }

        const parseResult = WsClientMessageSchema.safeParse(data);
        if (!parseResult.success) {
          malformedCount++;
          socket.send(
            JSON.stringify({
              type: "error",
              code: "malformed_frame",
              message: parseResult.error.message,
            }),
          );
          if (malformedCount >= 3) {
            socket.close(4400, "Too many malformed frames");
          }
          return;
        }

        const clientMessage = parseResult.data;
        if (clientMessage.type === "subscribe") {
          const runSnapshot = clientMessage.runId
            ? dependencies.runs.getRun(clientMessage.runId)
            : null;

          socket.send(JSON.stringify({ type: "snapshot", run: runSnapshot }));

          const replayedEvents = dependencies.realtime.subscribe(
            socket,
            clientMessage.runId,
            clientMessage.afterSequence,
          );

          for (const ev of replayedEvents) {
            socket.send(JSON.stringify({ type: "event", event: ev }));
          }
        } else {
          malformedCount++;
          socket.send(
            JSON.stringify({
              type: "error",
              code: "invalid_message_type",
              message: "Unexpected message type post-auth",
            }),
          );
          if (malformedCount >= 3) {
            socket.close(4400, "Too many malformed frames");
          }
        }
      });

      socket.on("close", () => {
        if (authTimeout) {
          clearTimeout(authTimeout);
        }
      });
    },
  );

  // static file serving in production
  if (!dependencies.config.dev) {
    await app.register(fastifyStatic, {
      root: dependencies.config.webRoot,
      wildcard: false,
    });

    app.get("*", async (request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/ws")) {
        reply.code(404).send({ error: "Not Found" });
        return reply;
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
