#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { openDatabase } from "./db/database.js";
import { SqliteProjectStore } from "./db/project-store.js";
import { SqliteConversationStore } from "./db/conversation-store.js";
import { SqliteRunStore } from "./db/run-store.js";
import { ArtifactStore } from "./artifacts/store.js";
import { ProcessSupervisor } from "./system/process.js";
import { CodexAdapter } from "./providers/codex.js";
import { ClaudeAdapter } from "./providers/claude.js";
import { AntigravityAdapter } from "./providers/antigravity.js";
import { ProviderRegistry } from "./providers/registry.js";
import { SessionGuard } from "./security/session.js";
import { RealtimeHub } from "./realtime/hub.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import open from "open";

async function main() {
  const config = loadConfig();

  // 1. Create directories
  await mkdir(config.dataDir, { recursive: true });
  await mkdir(config.artifactsDir, { recursive: true });
  await mkdir(config.worktreesDir, { recursive: true });
  await mkdir(config.contextsDir, { recursive: true });
  await mkdir(config.tempDir, { recursive: true });

  // 2. Open database and mark running attempts interrupted
  const db = openDatabase(config.databasePath);
  const projectStore = new SqliteProjectStore(db);
  const conversationStore = new SqliteConversationStore(db);
  const runStore = new SqliteRunStore(db);

  runStore.markRunningAttemptsInterrupted();

  // 3. Construct elements
  const artifacts = new ArtifactStore(db, config.artifactsDir);
  const supervisor = new ProcessSupervisor();

  const codex = new CodexAdapter();
  const claude = new ClaudeAdapter();
  const agy = new AntigravityAdapter();

  const registry = new ProviderRegistry(
    [codex, claude, agy],
    supervisor,
    projectStore,
    config.tempDir,
  );

  // Load status from DB but mark stale on startup
  const savedStatuses = projectStore.listProviderStatuses();
  registry.loadStatuses(savedStatuses);

  const session = new SessionGuard(config.sessionToken, config.publicOrigin);
  const realtime = new RealtimeHub(runStore);

  // 4. Build and listen Fastify
  const app = await buildApp({
    config,
    session,
    projects: projectStore,
    conversations: conversationStore,
    runs: runStore,
    providers: registry,
    artifacts,
    realtime,
  });

  await app.listen({ host: config.host, port: config.port });
  const address = app.server.address() as any;
  const actualPort = address.port;

  // 5. Update public origin with actual port in production if not specified
  if (!config.dev) {
    const origin = `http://127.0.0.1:${actualPort}`;
    session.setPublicOrigin(origin);
    const launchUrl = `${origin}/#session=${config.sessionToken}`;
    app.log.info(`Server listening on ${origin}`);
    app.log.info("Opening authenticated local browser session...");
    await open(launchUrl).catch((err) => {
      app.log.error(`Could not open browser automatically: ${err?.message || err}`);
    });
  } else {
    app.log.info(`Server listening in DEV mode on port ${actualPort}`);
    const origin = config.publicOrigin || `http://127.0.0.1:${actualPort}`;
    const launchUrl = `${origin}/#session=${config.sessionToken}`;
    app.log.info("Opening authenticated development browser session...");
    await open(launchUrl).catch((err) => {
      app.log.error(`Could not open browser automatically: ${err?.message || err}`);
    });
  }

  // 8. Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Shutting down...`);

    // Abort active runs
    try {
      const activeRuns = runStore.listActiveRuns();
      for (const run of activeRuns) {
        runStore.setRunState(run.id, "failed", `Server shut down (${signal})`);
      }
    } catch (err) {
      app.log.error(`Error aborting runs: ${err}`);
    }

    try {
      await app.close();
    } catch (err) {
      app.log.error(`Error closing app: ${err}`);
    }

    try {
      db.close();
    } catch (err) {
      app.log.error(`Error closing DB: ${err}`);
    }

    app.log.info("Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
