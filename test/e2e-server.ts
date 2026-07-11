import { mkdir, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { openDatabase } from "../src/server/db/database.js";
import { SqliteProjectStore } from "../src/server/db/project-store.js";
import { SqliteConversationStore } from "../src/server/db/conversation-store.js";
import { SqliteRunStore } from "../src/server/db/run-store.js";
import { ArtifactStore } from "../src/server/artifacts/store.js";
import { ProcessSupervisor } from "../src/server/system/process.js";
import { ScriptedAdapter } from "./helpers/scripted-adapter.js";
import { ProviderRegistry } from "../src/server/providers/registry.js";
import { SessionGuard } from "../src/server/security/session.js";
import { RealtimeHub } from "../src/server/realtime/hub.js";
import { buildApp } from "../src/server/app.js";
import type { AppDependencies } from "../src/server/app.js";

const e2eDir = path.resolve(".data/e2e");
const baseDir = path.resolve(".data");

if (!e2eDir.startsWith(baseDir)) {
  throw new Error("Path security boundary breach");
}

let dbInstance: any = null;
let currentProjectRoot = "";

const supervisor = new ProcessSupervisor();
const codex = new ScriptedAdapter("codex");
const claude = new ScriptedAdapter("claude");
const antigravity = new ScriptedAdapter("antigravity");

const registry = new ProviderRegistry(
  [codex, claude, antigravity],
  supervisor,
  null as any, // Will set projectStore on dependencies update
  path.join(e2eDir, "tmp"),
);

const session = new SessionGuard(
  "e2e-session-token-0000000000000000000000000001",
  "http://127.0.0.1:4318",
);

const config = {
  dev: false,
  host: "127.0.0.1" as const,
  port: 4318,
  publicOrigin: "http://127.0.0.1:4318",
  sessionToken: "e2e-session-token-0000000000000000000000000001",
  dataDir: e2eDir,
  databasePath: path.join(e2eDir, "data", "state.db"),
  artifactsDir: path.join(e2eDir, "runs"),
  worktreesDir: path.join(e2eDir, "worktrees"),
  contextsDir: path.join(e2eDir, "contexts"),
  tempDir: path.join(e2eDir, "tmp"),
  webRoot: path.resolve("dist/web"),
  websocketAuthTimeoutMs: 2_000,
};

async function createFreshFixture() {
  await rm(e2eDir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(path.join(e2eDir, "data"), { recursive: true });
  await mkdir(path.join(e2eDir, "runs"), { recursive: true });
  await mkdir(path.join(e2eDir, "worktrees"), { recursive: true });
  await mkdir(path.join(e2eDir, "contexts"), { recursive: true });
  await mkdir(path.join(e2eDir, "tmp"), { recursive: true });

  // 1. Create temporary Git project
  const projDir = path.join(e2eDir, "project");
  currentProjectRoot = projDir;
  await mkdir(projDir, { recursive: true });

  execSync("git init", { cwd: projDir, stdio: "ignore" });
  execSync('git config user.name "E2E Test"', { cwd: projDir, stdio: "ignore" });
  execSync('git config user.email "e2e@example.com"', { cwd: projDir, stdio: "ignore" });
  execSync("git config commit.gpgSign false", { cwd: projDir, stdio: "ignore" });

  const pkgJson = {
    name: "fixture-project",
    version: "1.0.0",
    scripts: {
      test: "vitest run",
    },
    devDependencies: {
      vitest: "^4.1.10",
    },
  };
  await writeFile(path.join(projDir, "package.json"), JSON.stringify(pkgJson, null, 2));

  // Write testing tests with barriers
  await mkdir(path.join(projDir, "test"), { recursive: true });
  const dummyTestSnippet = `
    import { test, expect } from "vitest";
    import * as fs from "node:fs";
    import * as path from "node:path";

    test("dummy test checks testing barrier", () => {
      const barrierPath = path.join(${JSON.stringify(path.join(e2eDir, "data"))}, "testing.barrier");
      while (fs.existsSync(barrierPath)) {
        try {
          require("child_process").execSync('node -e "setTimeout(() => {}, 50)"');
        } catch (e) {}
      }
      expect(true).toBe(true);
    });
  `;
  await writeFile(path.join(projDir, "test/greeting.test.ts"), dummyTestSnippet);
  await writeFile(path.join(projDir, "test/farewell.test.ts"), dummyTestSnippet);
  await writeFile(path.join(projDir, "test/punctuation.test.ts"), dummyTestSnippet);

  execSync("git add .", { cwd: projDir, stdio: "ignore" });
  execSync('git commit -m "initial commit"', { cwd: projDir, stdio: "ignore" });

  // 2. Setup SQLite DB
  if (!dbInstance) {
    dbInstance = openDatabase(config.databasePath);
  }
  const projectStore = new SqliteProjectStore(dbInstance);
  const conversationStore = new SqliteConversationStore(dbInstance);
  const runStore = new SqliteRunStore(dbInstance);
  const artifacts = new ArtifactStore(dbInstance, config.artifactsDir);

  // Set ProjectStore reference in the ProviderRegistry
  (registry as any).projectStore = projectStore;

  // Mark statuses installed/authenticated on startup
  const mockStatuses = [
    {
      provider: "codex" as const,
      installed: true,
      authenticated: true,
      version: "1.0.0",
      models: ["mock-model"],
      capabilities: { nonInteractive: true, readOnly: true, worktreeWrite: true },
      diagnostic: null,
      checkedAt: new Date().toISOString(),
    },
    {
      provider: "claude" as const,
      installed: true,
      authenticated: true,
      version: "1.0.0",
      models: ["mock-model"],
      capabilities: { nonInteractive: true, readOnly: true, worktreeWrite: true },
      diagnostic: null,
      checkedAt: new Date().toISOString(),
    },
    {
      provider: "antigravity" as const,
      installed: true,
      authenticated: true,
      version: "1.0.0",
      models: ["mock-model"],
      capabilities: { nonInteractive: true, readOnly: false, worktreeWrite: true },
      diagnostic: null,
      checkedAt: new Date().toISOString(),
    },
  ];
  projectStore.saveProviderStatus(mockStatuses[0]!);
  projectStore.saveProviderStatus(mockStatuses[1]!);
  projectStore.saveProviderStatus(mockStatuses[2]!);
  registry.loadStatuses(mockStatuses);

  // Create initial barriers
  const barriers = [
    "planning",
    "worker-1",
    "worker-2",
    "worker-3",
    "testing",
    "reviewing",
    "reviewing-delivery",
    "ready",
  ];
  for (const b of barriers) {
    fs.writeFileSync(path.join(e2eDir, "data", `${b}.barrier`), "");
  }

  codex.scenario = "success";
  claude.scenario = "success";
  antigravity.scenario = "success";

  return {
    projectStore,
    conversationStore,
    runStore,
    artifacts,
  };
}

async function start() {
  process.env.COZY_DATA_DIR = config.dataDir;
  const initial = await createFreshFixture();
  const realtime = new RealtimeHub(initial.runStore);

  const dependencies: AppDependencies = {
    config,
    session,
    projects: initial.projectStore,
    conversations: initial.conversationStore,
    runs: initial.runStore,
    providers: registry,
    artifacts: initial.artifacts,
    realtime,
  };

  const app = await buildApp(dependencies);

  // Register internal E2E routes
  app.get("/__test/status", async () => {
    return {
      projectPath: currentProjectRoot,
    };
  });

  app.post("/__test/release/:barrier", async (request: any, reply) => {
    const { barrier } = request.params;
    const file = path.join(e2eDir, "data", `${barrier}.barrier`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    return { released: true };
  });

  app.post("/__test/scenario/:name", async (request: any, reply) => {
    const { name } = request.params;
    if (name !== "success" && name !== "worker_error" && name !== "advisor_blocked") {
      reply.code(400).send({ error: "Invalid scenario" });
      return reply;
    }
    codex.scenario = name;
    claude.scenario = name;
    antigravity.scenario = name;
    return { scenario: name };
  });

  app.post("/__test/reset", async (request, reply) => {
    const active = dependencies.runs.listActiveRuns();
    const executing = active.filter((run) => run.state !== "ready_to_apply");
    if (executing.length > 0) {
      reply.status(400).send({ error: "Engine controller active" });
      return reply;
    }

    // Clear DB tables while maintaining active SQLite database connection
    dbInstance.transaction(() => {
      dbInstance.prepare("DELETE FROM events").run();
      dbInstance.prepare("DELETE FROM qa_results").run();
      dbInstance.prepare("DELETE FROM advisor_reviews").run();
      dbInstance.prepare("DELETE FROM artifacts").run();
      dbInstance.prepare("DELETE FROM attempts").run();
      dbInstance.prepare("DELETE FROM tasks").run();
      dbInstance.prepare("DELETE FROM runs").run();
      dbInstance.prepare("DELETE FROM draft_versions").run();
      dbInstance.prepare("DELETE FROM drafts").run();
      dbInstance.prepare("DELETE FROM messages").run();
      dbInstance.prepare("DELETE FROM conversations").run();
      dbInstance.prepare("DELETE FROM context_entries").run();
      dbInstance.prepare("DELETE FROM context_snapshots").run();
      dbInstance.prepare("DELETE FROM command_specs").run();
      dbInstance.prepare("DELETE FROM role_profiles").run();
      dbInstance.prepare("DELETE FROM projects").run();
    })();

    // Wipe out filesystem artifacts
    await rm(config.artifactsDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(config.worktreesDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(config.contextsDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(config.tempDir, { recursive: true, force: true }).catch(() => undefined);

    await mkdir(config.artifactsDir, { recursive: true });
    await mkdir(config.worktreesDir, { recursive: true });
    await mkdir(config.contextsDir, { recursive: true });
    await mkdir(config.tempDir, { recursive: true });

    // Recreate the git fixture repository
    const projDir = path.join(e2eDir, "project");
    await rm(projDir, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(projDir, { recursive: true });

    execSync("git init", { cwd: projDir, stdio: "ignore" });
    execSync('git config user.name "E2E Test"', { cwd: projDir, stdio: "ignore" });
    execSync('git config user.email "e2e@example.com"', { cwd: projDir, stdio: "ignore" });
    execSync("git config commit.gpgSign false", { cwd: projDir, stdio: "ignore" });

    const pkgJson = {
      name: "fixture-project",
      version: "1.0.0",
      scripts: {
        test: "vitest run",
      },
      devDependencies: {
        vitest: "^4.1.10",
      },
    };
    await writeFile(path.join(projDir, "package.json"), JSON.stringify(pkgJson, null, 2));

    await mkdir(path.join(projDir, "test"), { recursive: true });
    const dummyTestSnippet = `
      import { test, expect } from "vitest";
      import * as fs from "node:fs";
      import * as path from "node:path";

      test("dummy test checks testing barrier", () => {
        const barrierPath = path.join(${JSON.stringify(path.join(e2eDir, "data"))}, "testing.barrier");
        while (fs.existsSync(barrierPath)) {
          try {
            require("child_process").execSync('node -e "setTimeout(() => {}, 50)"');
          } catch (e) {}
        }
        expect(true).toBe(true);
      });
    `;
    await writeFile(path.join(projDir, "test/greeting.test.ts"), dummyTestSnippet);
    await writeFile(path.join(projDir, "test/farewell.test.ts"), dummyTestSnippet);
    await writeFile(path.join(projDir, "test/punctuation.test.ts"), dummyTestSnippet);

    execSync("git add .", { cwd: projDir, stdio: "ignore" });
    execSync('git commit -m "initial commit"', { cwd: projDir, stdio: "ignore" });

    // Mark default providers statuses in clean database
    const mockStatuses = [
      {
        provider: "codex" as const,
        installed: true,
        authenticated: true,
        version: "1.0.0",
        models: ["mock-model"],
        capabilities: { nonInteractive: true, readOnly: true, worktreeWrite: true },
        diagnostic: null,
        checkedAt: new Date().toISOString(),
      },
      {
        provider: "claude" as const,
        installed: true,
        authenticated: true,
        version: "1.0.0",
        models: ["mock-model"],
        capabilities: { nonInteractive: true, readOnly: true, worktreeWrite: true },
        diagnostic: null,
        checkedAt: new Date().toISOString(),
      },
      {
        provider: "antigravity" as const,
        installed: true,
        authenticated: true,
        version: "1.0.0",
        models: ["mock-model"],
        capabilities: { nonInteractive: true, readOnly: false, worktreeWrite: true },
        diagnostic: null,
        checkedAt: new Date().toISOString(),
      },
    ];
    dependencies.projects.saveProviderStatus(mockStatuses[0]!);
    dependencies.projects.saveProviderStatus(mockStatuses[1]!);
    dependencies.projects.saveProviderStatus(mockStatuses[2]!);

    // Recreate barriers
    const barriers = [
      "planning",
      "worker-1",
      "worker-2",
      "worker-3",
      "testing",
      "reviewing",
      "reviewing-delivery",
      "ready",
    ];
    for (const b of barriers) {
      fs.writeFileSync(path.join(e2eDir, "data", `${b}.barrier`), "");
    }

    codex.scenario = "success";
    claude.scenario = "success";
    antigravity.scenario = "success";

    return { ok: true, projectPath: currentProjectRoot };
  });

  await app.listen({ host: config.host, port: config.port });
  console.log(`E2E Test Server listening on http://127.0.0.1:${config.port}`);

  const shutdown = async () => {
    if (dbInstance) {
      dbInstance.close();
    }
    await app.close();
    process.exit(0);
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start().catch((err) => {
  console.error("Failed to start E2E server:", err);
  process.exit(1);
});
