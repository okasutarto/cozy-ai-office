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
import { GitClient } from "./git/git.js";
import { RepositoryService } from "./git/repository.js";
import { ProjectService } from "./projects/service.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { ContextSnapshotService } from "./context/snapshots.js";
import { ConversationService } from "./conversations/service.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerDraftRoutes } from "./routes/drafts.js";
import { join } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { WorktreeService } from "./git/worktrees.js";
import { AttemptRunner } from "./orchestrator/attempts.js";
import { WorkerScheduler } from "./orchestrator/scheduler.js";
import { QaRunner } from "./orchestrator/qa.js";
import { OrchestratorEngine } from "./orchestrator/engine.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerStorageRoutes } from "./routes/storage.js";
import { buildWorkerPrompt, buildConflictPrompt } from "./prompts/worker.js";

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
      app.log.warn(`AppError [${error.code}]: ${error.message}`);
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

  app.get<{ Params: { file: string } }>(
    "/local-assets/pixel-life/:file",
    async (request, reply) => {
      if (
        request.params.file !== "office-atlas.json" &&
        request.params.file !== "office-atlas.png"
      ) {
        return reply.code(404).send({ error: "Not Found" });
      }

      try {
        const filePath = join(process.cwd(), ".local-assets", "pixel-life", request.params.file);
        const contents = await readFile(filePath);
        return reply
          .type(request.params.file.endsWith(".json") ? "application/json" : "image/png")
          .send(contents);
      } catch {
        return reply.code(404).send({ error: "Not Found" });
      }
    },
  );

  // Register bootstrap route
  registerBootstrapRoute(app, dependencies);

  const supervisor = dependencies.providers.supervisor;
  if (!supervisor) {
    throw new Error("Supervisor not configured in ProviderRegistry");
  }
  const gitClient = new GitClient(supervisor);
  const repositoryService = new RepositoryService(gitClient);
  const projectService = new ProjectService(
    dependencies.projects,
    repositoryService,
    dependencies.providers,
  );
  const snapshotService = new ContextSnapshotService(
    dependencies.projects,
    repositoryService,
    dependencies.config.contextsDir,
    dependencies.config.tempDir,
  );

  // Register project routes
  registerProjectRoutes(app, projectService, snapshotService);

  const conversationService = new ConversationService(
    (dependencies.projects as any).db,
    dependencies.projects,
    dependencies.conversations,
    dependencies.providers,
    snapshotService,
    dependencies.artifacts,
  );

  // Register conversation routes
  registerConversationRoutes(app, conversationService);

  // Register draft routes
  registerDraftRoutes(app, conversationService);

  // ── Worktree and Orchestration Setup ──
  const emptyHooksDir = join(dependencies.config.dataDir, "empty-hooks").replaceAll("\\", "/");
  await mkdir(emptyHooksDir, { recursive: true }).catch(() => undefined);

  const worktreeService = new WorktreeService(
    gitClient,
    repositoryService,
    dependencies.config.worktreesDir,
    emptyHooksDir,
  );

  const attemptRunner = new AttemptRunner(dependencies.providers, dependencies.runs, {
    supervisor,
    artifacts: dependencies.artifacts,
    tempDir: dependencies.config.tempDir,
    statusFor: (p) => dependencies.providers.statusFor(p),
  });

  const schedulerWorkerPort = {
    async execute(input: any) {
      const outcome = await attemptRunner.execute(
        {
          profile: input.profile,
          requiredCapability: input.task.mode === "write" ? "worktreeWrite" : "readOnly",
          request: {
            runId: input.task.runId ?? null,
            taskId: input.task.id,
            conversationId: null,
            contextSnapshotId: null,
            role: "worker",
            prompt: buildWorkerPrompt({
              brief: input.task,
              dependencySummaries: [],
              projectRules: [],
            }),
            cwd: input.cwd,
            timeoutMs: input.profile.timeoutMs,
            readOnly: input.task.mode === "read_only",
            outputContract: "worker_result",
          },
          repairPrompt: (err) => `Repair: ${err}`,
        },
        input.signal,
      );
      return outcome.execution.structuredOutput as any;
    },
    async resolveConflict(input: any) {
      const outcome = await attemptRunner.execute(
        {
          profile: input.profile,
          requiredCapability: "worktreeWrite",
          request: {
            runId: null,
            taskId: null,
            conversationId: null,
            contextSnapshotId: null,
            role: "worker",
            prompt: buildConflictPrompt(input.conflictFiles),
            cwd: input.cwd,
            timeoutMs: input.profile.timeoutMs,
            readOnly: false,
            outputContract: "worker_result",
          },
          repairPrompt: (err) => `Repair: ${err}`,
        },
        input.signal,
      );
      return outcome.execution.structuredOutput as any;
    },
  };

  const workerScheduler = new WorkerScheduler(
    dependencies.runs,
    worktreeService,
    snapshotService,
    schedulerWorkerPort,
    dependencies.realtime,
  );

  const qaRunner = new QaRunner(
    supervisor,
    dependencies.artifacts,
    attemptRunner,
    dependencies.runs,
    {
      async requestRepair(input: any) {
        const diagArtifact = dependencies.artifacts.getArtifact(input.diagnosisArtifactId);
        if (!diagArtifact) throw new Error("Diagnosis artifact not found");
        const diagPath = join(dependencies.artifacts.root, diagArtifact.relativePath);
        const diagText = await readFile(diagPath, "utf8");

        const workerProfile: any = {
          id: "worker-1",
          role: "worker",
          label: "worker-1",
          providerChain: [{ provider: "codex", model: null }],
          timeoutMs: 60_000,
          promptVersion: "v1",
        };

        const repairBrief = {
          id: "repair-task",
          title: "QA Repair",
          objective: diagText,
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: input.allowedRepairPaths,
          forbiddenPaths: [],
          acceptanceCriteria: ["QA checks pass"],
          verificationCommands: [],
        };

        const runRow = (dependencies.runs as any).db
          .prepare("SELECT integration_worktree FROM runs LIMIT 1")
          .get() as { integration_worktree: string } | undefined;
        const cwd = runRow?.integration_worktree ?? "";

        const outcome = await attemptRunner.execute(
          {
            profile: workerProfile,
            requiredCapability: "worktreeWrite",
            request: {
              runId: null,
              taskId: null,
              conversationId: null,
              contextSnapshotId: null,
              role: "worker",
              prompt: buildWorkerPrompt({
                brief: repairBrief as any,
                dependencySummaries: [],
                projectRules: [],
              }),
              cwd,
              timeoutMs: workerProfile.timeoutMs,
              readOnly: false,
              outputContract: "worker_result",
            },
            repairPrompt: (err) => `Repair: ${err}`,
          },
          new AbortController().signal,
        );

        const resultArtifact = await dependencies.artifacts.writeJson({
          runId: null,
          taskId: null,
          kind: "worker-result",
          value: outcome.execution.structuredOutput,
        });

        return { resultArtifactId: resultArtifact.id };
      },
    },
  );

  const orchestratorEngine = new OrchestratorEngine(
    dependencies.runs,
    dependencies.realtime,
    dependencies.projects,
    dependencies.conversations,
    worktreeService,
    snapshotService,
    attemptRunner,
    workerScheduler,
    qaRunner,
  );
  orchestratorEngine.recoverInterruptedRuns();

  // Register run and storage routes
  registerRunRoutes(
    app,
    orchestratorEngine,
    dependencies.runs,
    dependencies.artifacts,
    dependencies.conversations,
  );
  registerStorageRoutes(
    app,
    dependencies.runs,
    dependencies.artifacts,
    worktreeService,
    dependencies.projects,
  );

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
