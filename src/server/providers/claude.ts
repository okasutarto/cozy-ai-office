import type {
  BuiltCommand,
  ProviderAdapter,
  ProviderProbeRuntime,
  ProviderRequest,
  StructuredSchema,
} from "./types.js";
import { probeCli } from "./execute.js";

export class ClaudeAdapter implements ProviderAdapter {
  readonly id = "claude" as const;
  readonly declaredCapabilities = {
    nonInteractive: true,
    readOnly: true,
    worktreeWrite: true,
  } as const;
  constructor(private readonly executable = "claude") {}

  probe(runtime: ProviderProbeRuntime, signal: AbortSignal) {
    return probeCli(
      {
        id: this.id,
        executable: this.executable,
        versionArgs: ["--version"],
        helpArgs: [["--help"]],
        authArgs: ["auth", "status"],
        models: ["haiku", "sonnet", "opus", "fable"],
        requiredFlags: {
          nonInteractive: ["--print", "--output-format", "--no-session-persistence"],
          readOnly: ["--safe-mode", "--permission-mode", "plan", "--tools", "--strict-mcp-config"],
          worktreeWrite: ["--safe-mode", "--permission-mode", "acceptEdits", "--tools"],
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
    const denied = request.readOnly
      ? "Edit,Write,Bash,NotebookEdit,WebFetch,WebSearch,mcp__*"
      : "Bash,NotebookEdit,WebFetch,WebSearch,mcp__*";
    const args = [
      "-p",
      "--safe-mode",
      "--permission-mode",
      request.readOnly ? "plan" : "acceptEdits",
      "--tools",
      request.readOnly ? "Read,Glob,Grep" : "Read,Glob,Grep,Edit,Write",
      "--disallowedTools",
      denied,
      "--strict-mcp-config",
      "--no-chrome",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--output-format",
      "json",
    ];
    if (schema) args.push("--json-schema", schema.json);
    if (request.model) args.push("--model", request.model);
    return {
      executable: this.executable,
      args,
      cwd: request.cwd,
      stdin: request.prompt,
      structuredResultPath: null,
    };
  }
}
