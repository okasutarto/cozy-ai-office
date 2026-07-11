import type { ProcessSupervisor } from "../system/process.js";
import { AppError } from "../errors.js";
import { redactText } from "../security/redact.js";

export type GitResult = { stdout: string; stderr: string; exitCode: number };

export class GitClient {
  constructor(private readonly supervisor: ProcessSupervisor) {}

  async run(cwd: string, args: string[], signal: AbortSignal): Promise<GitResult> {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const maxBytes = 2 * 1024 * 1024; // 2 MiB cap

    const stdoutSink = {
      write: async (chunk: string) => {
        if (stdoutBytes < maxBytes) {
          const accepted = chunk.slice(0, maxBytes - stdoutBytes);
          stdoutChunks.push(accepted);
          stdoutBytes += Buffer.byteLength(accepted, "utf8");
        }
      },
    };

    const stderrSink = {
      write: async (chunk: string) => {
        if (stderrBytes < maxBytes) {
          const accepted = chunk.slice(0, maxBytes - stderrBytes);
          stderrChunks.push(accepted);
          stderrBytes += Buffer.byteLength(accepted, "utf8");
        }
      },
    };

    const result = await this.supervisor.run(
      {
        executable: "git",
        args,
        cwd,
        stdin: "",
        timeoutMs: 60_000,
      },
      { stdout: stdoutSink, stderr: stderrSink },
      signal,
    );

    return {
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
      exitCode: result.exitCode ?? -1,
    };
  }

  async require(cwd: string, args: string[], signal: AbortSignal): Promise<string> {
    const result = await this.run(cwd, args, signal);
    if (result.exitCode !== 0) {
      throw new AppError(
        "git_command_failed",
        `Git command 'git ${args.join(" ")}' failed in ${cwd} (exit code ${result.exitCode}): ${redactText(result.stderr).trim()}`,
        500,
      );
    }
    return result.stdout;
  }
}

export function splitNul(value: string): string[] {
  return value.split("\0").filter(Boolean);
}
