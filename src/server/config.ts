import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ServerConfig = {
  dev: boolean;
  host: "127.0.0.1";
  port: number;
  publicOrigin: string;
  sessionToken: string;
  dataDir: string;
  databasePath: string;
  artifactsDir: string;
  worktreesDir: string;
  contextsDir: string;
  tempDir: string;
  webRoot: string;
  websocketAuthTimeoutMs: number;
};

function defaultDataDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Cozy Agent Office");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Cozy Agent Office");
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "cozy-agent-office");
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dev = environment.COZY_DEV === "1";
  const port = environment.COZY_PORT ? Number(environment.COZY_PORT) : 0;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("Invalid COZY_PORT");
  const dataDir = resolve(environment.COZY_DATA_DIR ?? defaultDataDir());
  const publicOrigin = environment.COZY_PUBLIC_ORIGIN ?? "";
  const sessionToken = environment.COZY_SESSION_TOKEN ?? randomBytes(32).toString("base64url");
  if (sessionToken.length < 32) throw new Error("Invalid COZY_SESSION_TOKEN");
  // TypeScript emits the server below dist/server/server while Vite emits the
  // browser bundle below dist/web. During source development the UI lives in
  // src/web, so resolve both layouts without requiring a post-build copy.
  const compiledWebRoot = fileURLToPath(new URL("../../web", import.meta.url));
  const sourceWebRoot = fileURLToPath(new URL("../web", import.meta.url));
  return {
    dev,
    host: "127.0.0.1",
    port,
    publicOrigin,
    sessionToken,
    dataDir,
    databasePath: join(dataDir, "state.db"),
    artifactsDir: join(dataDir, "runs"),
    worktreesDir: join(dataDir, "worktrees"),
    contextsDir: join(dataDir, "contexts"),
    tempDir: join(dataDir, "tmp"),
    webRoot: existsSync(compiledWebRoot) ? compiledWebRoot : sourceWebRoot,
    websocketAuthTimeoutMs: 2_000,
  };
}
