import type {
  BuiltCommand,
  ProviderAdapter,
  ProviderProbeRuntime,
  ProviderRequest,
  StructuredSchema,
} from "./types.js";
import { probeCli } from "./execute.js";

export class AntigravityAdapter implements ProviderAdapter {
  readonly id = "antigravity" as const;
  readonly declaredCapabilities = {
    nonInteractive: true,
    readOnly: false,
    worktreeWrite: true,
  } as const;
  constructor(private readonly executable = "agy") {}

  probe(runtime: ProviderProbeRuntime, signal: AbortSignal) {
    return probeCli(
      {
        id: this.id,
        executable: this.executable,
        versionArgs: ["--version"],
        helpArgs: [["--help"]],
        authArgs: null,
        models: [],
        requiredFlags: {
          nonInteractive: ["--print"],
          readOnly: null,
          worktreeWrite: ["--print", "--model"],
        },
      },
      runtime,
      signal,
    );
  }

  build(
    request: ProviderRequest,
    _schema: StructuredSchema | null,
    _resultPath: string,
  ): BuiltCommand {
    if (request.readOnly) throw new Error("Antigravity read-only mode is unproven");
    const args: string[] = [];
    if (request.model) args.push("--model", request.model);
    args.push("--print", request.prompt);
    return {
      executable: this.executable,
      args,
      cwd: request.cwd,
      stdin: "",
      structuredResultPath: null,
    };
  }
}
