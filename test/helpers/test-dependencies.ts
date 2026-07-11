import { join } from "node:path";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { openDatabase } from "../../src/server/db/database.js";
import { SqliteProjectStore } from "../../src/server/db/project-store.js";
import { SqliteConversationStore } from "../../src/server/db/conversation-store.js";
import { SqliteRunStore } from "../../src/server/db/run-store.js";
import { ArtifactStore } from "../../src/server/artifacts/store.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import { ProviderRegistry } from "../../src/server/providers/registry.js";
import { RealtimeHub } from "../../src/server/realtime/hub.js";
import { SessionGuard } from "../../src/server/security/session.js";
import type { ServerConfig } from "../../src/server/config.js";
import type { AppDependencies } from "../../src/server/app.js";

export interface TestDependencies extends AppDependencies {
  db: any;
  close(): Promise<void>;
}

export async function createTestDependencies(): Promise<TestDependencies> {
  const dataDir = await mkdtemp(join(tmpdir(), "cozy-test-"));
  await mkdir(join(dataDir, "web"), { recursive: true });
  const db = openDatabase(join(dataDir, "state.db"));

  const config: ServerConfig = {
    dev: false,
    host: "127.0.0.1",
    port: 0,
    publicOrigin: "http://127.0.0.1",
    sessionToken: randomBytes(32).toString("base64url"),
    dataDir,
    databasePath: join(dataDir, "state.db"),
    artifactsDir: join(dataDir, "runs"),
    worktreesDir: join(dataDir, "worktrees"),
    contextsDir: join(dataDir, "contexts"),
    tempDir: join(dataDir, "tmp"),
    webRoot: join(dataDir, "web"),
    websocketAuthTimeoutMs: 50,
  };

  const projectStore = new SqliteProjectStore(db);
  const conversationStore = new SqliteConversationStore(db);
  const runStore = new SqliteRunStore(db);
  const artifacts = new ArtifactStore(db, config.artifactsDir);
  const supervisor = new ProcessSupervisor();
  
  // We can initialize the registry with empty adapters for the tests
  const providers = new ProviderRegistry([], supervisor, projectStore, config.tempDir);
  const session = new SessionGuard(config.sessionToken, config.publicOrigin);
  const realtime = new RealtimeHub(runStore);

  return {
    config,
    session,
    projects: projectStore,
    conversations: conversationStore,
    runs: runStore,
    providers,
    artifacts,
    realtime,
    db,
    async close() {
      db.close();
      await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
