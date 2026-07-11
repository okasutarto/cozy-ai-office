import { spawn } from "node:child_process";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";

export type SpawnSpec = {
  executable: string;
  args: string[];
  cwd: string;
  stdin: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
};

export type TextSink = { write(chunk: string): Promise<void> };
export type ProcessSinks = { stdout: TextSink; stderr: TextSink };
export type ProcessResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  spawnErrorCode: string | null;
};

const STRIPPED_ENV = new Set([
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "NPM_TOKEN",
  "COZY_SESSION_TOKEN",
]);

export function sanitizedChildEnv(
  base: NodeJS.ProcessEnv = process.env,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries({ ...base, ...extra }).filter(([key]) => !STRIPPED_ENV.has(key.toUpperCase())),
  );
}

async function forceKillTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    await once(killer, "close").catch(() => undefined);
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function processGroupExists(pid: number): boolean {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function pump(stream: Readable, sink: TextSink): Promise<void> {
  stream.setEncoding("utf8");
  for await (const chunk of stream) await sink.write(String(chunk));
}

export class ProcessSupervisor {
  private readonly terminateGraceMs: number;

  constructor(options: { terminateGraceMs?: number } = {}) {
    this.terminateGraceMs = options.terminateGraceMs ?? 5_000;
  }

  async run(spec: SpawnSpec, sinks: ProcessSinks, signal: AbortSignal): Promise<ProcessResult> {
    const started = performance.now();
    let timedOut = false;
    let cancelled = false;
    let terminating = false;
    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: spec.env ?? process.env,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const pid = child.pid ?? null;
    const stdoutPump = pump(child.stdout, sinks.stdout);
    const stderrPump = pump(child.stderr, sinks.stderr);
    let forceTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillPromise: Promise<void> | null = null;

    const completion = new Promise<{
      exitCode: number | null;
      exitSignal: NodeJS.Signals | null;
      spawnErrorCode: string | null;
    }>((resolve) => {
      let settled = false;
      const settle = (value: {
        exitCode: number | null;
        exitSignal: NodeJS.Signals | null;
        spawnErrorCode: string | null;
      }) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.once("error", (error: NodeJS.ErrnoException) =>
        settle({ exitCode: null, exitSignal: null, spawnErrorCode: error.code ?? "spawn_error" }),
      );
      child.once("close", (exitCode, exitSignal) =>
        settle({ exitCode, exitSignal, spawnErrorCode: null }),
      );
    });

    const terminate = async (reason: "timeout" | "cancel") => {
      if (terminating) return;
      terminating = true;
      timedOut = reason === "timeout";
      cancelled = reason === "cancel";
      if (pid === null) return;
      if (process.platform === "win32") {
        forceKillPromise = forceKillTree(pid);
      } else {
        try {
          process.kill(-pid, "SIGTERM");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
        forceTimer = setTimeout(() => {
          forceKillPromise = forceKillTree(pid);
        }, this.terminateGraceMs);
        forceTimer.unref();
      }
    };

    const timeout = setTimeout(() => void terminate("timeout"), spec.timeoutMs);
    timeout.unref();
    const abort = () => void terminate("cancel");
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();

    child.stdin.on("error", () => undefined);
    child.stdin.end(spec.stdin);
    const { exitCode, exitSignal, spawnErrorCode } = await completion;
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    if (forceTimer !== null) clearTimeout(forceTimer);
    if (forceKillPromise !== null) await forceKillPromise;
    else if (pid !== null && terminating && processGroupExists(pid)) await forceKillTree(pid);
    await Promise.all([stdoutPump, stderrPump]);
    return {
      exitCode,
      signal: exitSignal,
      durationMs: Math.round(performance.now() - started),
      timedOut,
      cancelled,
      spawnErrorCode,
    };
  }
}
