import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { writeFile, readFile } from "node:fs/promises";
import { ClaudeAdapter } from "../../src/server/providers/claude.js";
import { CodexAdapter } from "../../src/server/providers/codex.js";
import { AntigravityAdapter } from "../../src/server/providers/antigravity.js";
import type { ProviderRequest, BuiltCommand } from "../../src/server/providers/types.js";
import { executeProviderRequest, OUTPUT_CONTRACTS } from "../../src/server/providers/execute.js";
import {
  ProcessSupervisor,
  type SpawnSpec,
  type ProcessSinks,
  type ProcessResult,
} from "../../src/server/system/process.js";
import { ArtifactStore } from "../../src/server/artifacts/store.js";
import { openDatabase } from "../../src/server/db/database.js";
import { withTempDir } from "../helpers/temp.js";
import { ProviderRegistry } from "../../src/server/providers/registry.js";
import type { ProviderStatus } from "../../shared/contracts.js";

const fixture = fileURLToPath(new URL("../fixtures/fake-provider.mjs", import.meta.url));

const validPlan = {
  summary: "Codex Plan",
  risks: ["risk 1"],
  testStrategy: ["test 1"],
  tasks: [
    {
      id: "task-1",
      title: "Task 1",
      objective: "Objective 1",
      mode: "read_only",
      dependsOn: [],
      contextArtifacts: [],
      allowedPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: ["criteria 1"],
      verificationCommands: [],
    },
  ],
};

function request(input: {
  cwd: string;
  model: string | null;
  readOnly: boolean;
  outputContract?: ProviderRequest["outputContract"];
}): ProviderRequest {
  return {
    requestId: "00000000-0000-4000-8000-000000000101",
    runId: null,
    taskId: null,
    conversationId: null,
    contextSnapshotId: null,
    role: input.readOnly ? "manager" : "worker",
    profileId: input.readOnly ? "manager" : "worker-1",
    model: input.model,
    prompt: "test prompt",
    cwd: input.cwd,
    timeoutMs: 60_000,
    readOnly: input.readOnly,
    outputContract: input.outputContract ?? null,
  };
}

class MockProcessSupervisor extends ProcessSupervisor {
  public simulateAuthFail = false;
  public simulateQuotaExceeded = false;
  public simulateInvalidJson = false;
  public simulateHelpFlagsMissing = false;

  constructor(options = {}) {
    super(options);
  }

  override async run(
    spec: SpawnSpec,
    sinks: ProcessSinks,
    signal: AbortSignal,
  ): Promise<ProcessResult> {
    let executable = spec.executable;
    let args = spec.args;

    if (executable === "codex" || executable === "claude" || executable === "agy") {
      executable = process.execPath;

      if (args.includes("--version")) {
        args = [fixture, "version", `${spec.executable} version 1.0.0`];
      } else if (args.includes("login") || args.includes("auth")) {
        if (this.simulateAuthFail) {
          args = [fixture, "auth-fail"];
        } else {
          args = [fixture, "auth-ok"];
        }
      } else if (args.includes("--help")) {
        if (this.simulateHelpFlagsMissing) {
          await sinks.stdout.write("help text with no flags");
          return {
            exitCode: 0,
            signal: null,
            durationMs: 1,
            timedOut: false,
            cancelled: false,
            spawnErrorCode: null,
          };
        }

        const codexFlags = [
          "--ephemeral",
          "--json",
          "--output-last-message",
          "--sandbox",
          "read-only",
          "workspace-write",
          "--ask-for-approval",
          "--ignore-user-config",
          "--ignore-rules",
          "--skip-git-repo-check",
          "--output-schema",
        ];
        const claudeFlags = [
          "-p",
          "--safe-mode",
          "--permission-mode",
          "plan",
          "acceptEdits",
          "--tools",
          "--strict-mcp-config",
          "--print",
          "--output-format",
          "--no-session-persistence",
        ];
        const agyFlags = ["--print", "--model"];

        let helpText = "";
        if (spec.executable === "codex") helpText = codexFlags.join(" ");
        if (spec.executable === "claude") helpText = claudeFlags.join(" ");
        if (spec.executable === "agy") helpText = agyFlags.join(" ");

        await sinks.stdout.write(helpText);
        return {
          exitCode: 0,
          signal: null,
          durationMs: 1,
          timedOut: false,
          cancelled: false,
          spawnErrorCode: null,
        };
      } else if (args.includes("-")) {
        const resultPath = args.find((a) => a.includes("result.json"));
        if (this.simulateQuotaExceeded) {
          args = [fixture, "quota"];
        } else if (this.simulateInvalidJson) {
          if (resultPath) {
            await writeFile(resultPath, "not-json-at-all", "utf8");
          }
          args = [fixture, "echo", "Codex executed with invalid json"];
        } else {
          if (resultPath) {
            await writeFile(resultPath, JSON.stringify(validPlan), "utf8");
          }
          args = [fixture, "echo", "Codex executed successfully"];
        }
      } else if (args.includes("--output-format")) {
        if (this.simulateQuotaExceeded) {
          args = [fixture, "quota"];
        } else if (this.simulateInvalidJson) {
          args = [fixture, "echo", "not-envelope-json"];
        } else {
          const envelope = {
            structured_output: validPlan,
          };
          args = [fixture, "echo", JSON.stringify(envelope)];
        }
      } else if (args.includes("--print")) {
        if (args.includes("Reply with exactly COZY_AUTH_OK. Do not use tools.")) {
          args = [fixture, "echo", "COZY_AUTH_OK"];
        } else {
          args = [fixture, "echo", "Antigravity print output"];
        }
      }
    }

    return super.run({ ...spec, executable, args }, sinks, signal);
  }
}

describe("provider adapter commands", () => {
  it("hardens Codex read-only calls", () => {
    const command = new CodexAdapter("codex").build(
      request({ cwd: "C:/snapshot", model: "gpt-5.4-mini", readOnly: true }),
      { path: "C:/schema.json", json: "{}" },
      "C:/result.json",
    );
    expect(command.args).toEqual(
      expect.arrayContaining([
        "--ask-for-approval",
        "never",
        "exec",
        "--cd",
        "C:/snapshot",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--json",
        "--output-schema",
        "C:/schema.json",
      ]),
    );
    expect(command.args).not.toContain("--yolo");
  });

  it("restricts Claude read-only tools", () => {
    const command = new ClaudeAdapter("claude").build(
      request({ cwd: "/snapshot", model: "sonnet", readOnly: true }),
      { path: "/schema.json", json: "{}" },
      "/result.json",
    );
    expect(command.args).toEqual(
      expect.arrayContaining([
        "-p",
        "--safe-mode",
        "--permission-mode",
        "plan",
        "--tools",
        "Read,Glob,Grep",
        "--disallowedTools",
        "Edit,Write,Bash,NotebookEdit,WebFetch,WebSearch,mcp__*",
        "--strict-mcp-config",
        "--no-chrome",
        "--disable-slash-commands",
        "--no-session-persistence",
      ]),
    );
    expect(command.args.join(" ")).not.toContain("dangerously");
  });

  it("declares Antigravity write-only and does not alter global settings", () => {
    const adapter = new AntigravityAdapter("agy");
    expect(adapter.declaredCapabilities.readOnly).toBe(false);
    expect(adapter.declaredCapabilities.worktreeWrite).toBe(true);
    const command = adapter.build(
      request({ cwd: "/worktree", model: null, readOnly: false }),
      null,
      "/result.json",
    );
    expect(command.cwd).toBe("/worktree");
    expect(command.args).toEqual(["--print", "test prompt"]);
  });
});

describe("provider executions and probes", () => {
  it("converts every wire schema to json schema without throwing", () => {
    for (const [key, value] of Object.entries(OUTPUT_CONTRACTS)) {
      expect(() => (z as any).toJSONSchema(value.wire)).not.toThrow();
    }
  });

  it("probes and runs fake provider adapter successfully", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      try {
        const supervisor = new MockProcessSupervisor();
        const artifacts = new ArtifactStore(db, join(dir, "artifacts"));

        const codexAdapter = new CodexAdapter("codex");
        const status = await codexAdapter.probe(
          { supervisor, cwd: dir },
          new AbortController().signal,
        );

        expect(status.installed).toBe(true);
        expect(status.authenticated).toBe(true);
        expect(status.capabilities.readOnly).toBe(true);
        expect(status.capabilities.worktreeWrite).toBe(true);

        const registry = new ProviderRegistry(
          [codexAdapter],
          supervisor,
          {
            saveProviderStatus: (st) =>
              db
                .prepare(
                  "INSERT OR REPLACE INTO provider_status (provider, installed, authenticated, version, models_json, capabilities_json, diagnostic, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .run(
                  st.provider,
                  st.installed ? 1 : 0,
                  st.authenticated ? 1 : 0,
                  st.version,
                  JSON.stringify(st.models),
                  JSON.stringify(st.capabilities),
                  st.diagnostic,
                  st.checkedAt,
                ),
          },
          join(dir, "temp"),
        );
        registry.setStatus(status);

        const runtime = {
          supervisor,
          artifacts,
          tempDir: join(dir, "temp"),
          statusFor: (id: any) => registry.statusFor(id),
        };

        const execResult = await executeProviderRequest(
          codexAdapter,
          request({ cwd: dir, model: null, readOnly: true, outputContract: "manager_plan" }),
          runtime,
          new AbortController().signal,
        );

        expect(execResult.exitCode).toBe(0);
        expect(execResult.structuredOutput).toEqual(validPlan);
        expect(execResult.errorCode).toBeNull();
      } finally {
        db.close();
      }
    });
  });

  it("reports false capabilities and diagnostics when help flags are missing", async () => {
    await withTempDir(async (dir) => {
      const supervisor = new MockProcessSupervisor();
      supervisor.simulateHelpFlagsMissing = true;

      const codexAdapter = new CodexAdapter("codex");
      const status = await codexAdapter.probe(
        { supervisor, cwd: dir },
        new AbortController().signal,
      );

      expect(status.installed).toBe(true);
      expect(status.capabilities.readOnly).toBe(false);
      expect(status.diagnostic).toContain("readOnly missing");
    });
  });

  it("handles auth failures", async () => {
    await withTempDir(async (dir) => {
      const supervisor = new MockProcessSupervisor();
      supervisor.simulateAuthFail = true;

      const codexAdapter = new CodexAdapter("codex");
      const status = await codexAdapter.probe(
        { supervisor, cwd: dir },
        new AbortController().signal,
      );

      expect(status.installed).toBe(true);
      expect(status.authenticated).toBe(false);
      expect(status.diagnostic).toContain("authentication required");
    });
  });

  it("handles quota exceeded failures", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      try {
        const supervisor = new MockProcessSupervisor();
        supervisor.simulateQuotaExceeded = true;
        const artifacts = new ArtifactStore(db, join(dir, "artifacts"));

        const codexAdapter = new CodexAdapter("codex");
        const status = await codexAdapter.probe(
          { supervisor, cwd: dir },
          new AbortController().signal,
        );

        const registry = new ProviderRegistry([codexAdapter]);
        registry.setStatus(status);

        const runtime = {
          supervisor,
          artifacts,
          tempDir: join(dir, "temp"),
          statusFor: (id: any) => registry.statusFor(id),
        };

        const execResult = await executeProviderRequest(
          codexAdapter,
          request({ cwd: dir, model: null, readOnly: true, outputContract: "manager_plan" }),
          runtime,
          new AbortController().signal,
        );

        expect(execResult.errorCode).toBe("provider_quota_exceeded");
      } finally {
        db.close();
      }
    });
  });

  it("handles invalid JSON from provider", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      try {
        const supervisor = new MockProcessSupervisor();
        supervisor.simulateInvalidJson = true;
        const artifacts = new ArtifactStore(db, join(dir, "artifacts"));

        const codexAdapter = new CodexAdapter("codex");
        const status = await codexAdapter.probe(
          { supervisor, cwd: dir },
          new AbortController().signal,
        );

        const registry = new ProviderRegistry([codexAdapter]);
        registry.setStatus(status);

        const runtime = {
          supervisor,
          artifacts,
          tempDir: join(dir, "temp"),
          statusFor: (id: any) => registry.statusFor(id),
        };

        const promise = executeProviderRequest(
          codexAdapter,
          request({ cwd: dir, model: null, readOnly: true, outputContract: "manager_plan" }),
          runtime,
          new AbortController().signal,
        );
        await expect(promise).rejects.toThrow(/is not valid JSON/);
        await expect(promise).rejects.toHaveProperty("code", "invalid_structured_output");
      } finally {
        db.close();
      }
    });
  });

  it("probes and verifies Antigravity login", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      try {
        const supervisor = new MockProcessSupervisor();
        const projectStore = {
          saveProviderStatus: (st: ProviderStatus) =>
            db
              .prepare(
                "INSERT OR REPLACE INTO provider_status (provider, installed, authenticated, version, models_json, capabilities_json, diagnostic, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              )
              .run(
                st.provider,
                st.installed ? 1 : 0,
                st.authenticated ? 1 : 0,
                st.version,
                JSON.stringify(st.models),
                JSON.stringify(st.capabilities),
                st.diagnostic,
                st.checkedAt,
              ),
        };

        const agyAdapter = new AntigravityAdapter("agy");
        const registry = new ProviderRegistry(
          [agyAdapter],
          supervisor,
          projectStore,
          join(dir, "temp"),
        );

        const status = await agyAdapter.probe(
          { supervisor, cwd: dir },
          new AbortController().signal,
        );
        registry.setStatus(status);

        expect(status.authenticated).toBe(false);

        const verifiedStatus = await registry.verifyAntigravityLogin(
          null,
          new AbortController().signal,
        );
        expect(verifiedStatus.authenticated).toBe(true);
      } finally {
        db.close();
      }
    });
  });

  it("rejects Antigravity read-only request before spawn", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      try {
        const supervisor = new MockProcessSupervisor();
        const artifacts = new ArtifactStore(db, join(dir, "artifacts"));
        const agyAdapter = new AntigravityAdapter("agy");

        const status = await agyAdapter.probe(
          { supervisor, cwd: dir },
          new AbortController().signal,
        );
        status.authenticated = true;
        const registry = new ProviderRegistry([agyAdapter]);
        registry.setStatus(status);

        const runtime = {
          supervisor,
          artifacts,
          tempDir: join(dir, "temp"),
          statusFor: (id: any) => registry.statusFor(id),
        };

        await expect(
          executeProviderRequest(
            agyAdapter,
            request({ cwd: dir, model: null, readOnly: true }),
            runtime,
            new AbortController().signal,
          ),
        ).rejects.toThrow(/does not support read-only capability/);
      } finally {
        db.close();
      }
    });
  });
});
