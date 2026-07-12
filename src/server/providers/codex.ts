import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  BuiltCommand,
  ProviderAdapter,
  ProviderProbeRuntime,
  ProviderRequest,
  StructuredSchema,
} from "./types.js";
import { probeCli } from "./execute.js";

function defaultCodexExecutable(): string {
  const bundled = join(
    homedir(),
    ".codex",
    ".sandbox-bin",
    process.platform === "win32" ? "codex.exe" : "codex",
  );
  return existsSync(bundled) ? bundled : "codex";
}

export class CodexAdapter implements ProviderAdapter {
  readonly id = "codex" as const;
  readonly declaredCapabilities = {
    nonInteractive: true,
    readOnly: true,
    worktreeWrite: true,
  } as const;
  constructor(private readonly executable = defaultCodexExecutable()) {}

  probe(runtime: ProviderProbeRuntime, signal: AbortSignal) {
    return probeCli(
      {
        id: this.id,
        executable: this.executable,
        versionArgs: ["--version"],
        helpArgs: [["--help"], ["exec", "--help"]],
        authArgs: ["login", "status"],
        models: [],
        requiredFlags: {
          nonInteractive: ["--ephemeral", "--json", "--output-last-message"],
          readOnly: [
            "--sandbox",
            "read-only",
            "--ask-for-approval",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--output-schema",
          ],
          worktreeWrite: [
            "--sandbox",
            "workspace-write",
            "--ask-for-approval",
            "--ignore-user-config",
            "--ignore-rules",
            "--output-schema",
          ],
        },
      },
      runtime,
      signal,
    );
  }

  build(
    request: ProviderRequest,
    schema: StructuredSchema | null,
    resultPath: string,
  ): BuiltCommand {
    const args = [
      "--ask-for-approval",
      "never",
      "exec",
      "--cd",
      request.cwd,
      "--sandbox",
      request.readOnly ? "read-only" : "workspace-write",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--json",
      "--output-last-message",
      resultPath,
    ];
    if (request.readOnly) args.push("--skip-git-repo-check");
    if (schema) args.push("--output-schema", schema.path);
    if (request.model) args.push("--model", request.model);
    args.push("-");
    return {
      executable: this.executable,
      args,
      cwd: request.cwd,
      stdin: request.prompt,
      structuredResultPath: resultPath,
    };
  }
}
