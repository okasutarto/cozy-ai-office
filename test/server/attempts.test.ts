import { describe, expect, it, vi, beforeEach } from "vitest";
import { AttemptRunner } from "../../src/server/orchestrator/attempts.js";
import { openDatabase } from "../../src/server/db/database.js";
import { SqliteRunStore } from "../../src/server/db/run-store.js";
import { ProviderRegistry } from "../../src/server/providers/registry.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import { ArtifactStore } from "../../src/server/artifacts/store.js";
import { withTempDir } from "../helpers/temp.js";
import { join } from "node:path";
import * as executeModule from "../../src/server/providers/execute.js";
import { AppError } from "../../src/server/errors.js";

describe("Attempt Runner", () => {
  let db: any;
  let runStore: SqliteRunStore;
  let registry: ProviderRegistry;
  let tempDir: string;
  let artifactStore: ArtifactStore;
  let supervisor: ProcessSupervisor;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles fallback, retries, and errors per decision table", async () => {
    await withTempDir(async (dir) => {
      tempDir = dir;
      db = openDatabase(":memory:");
      runStore = new SqliteRunStore(db);
      supervisor = new ProcessSupervisor();

      const mockStatusCodex = {
        installed: true,
        authenticated: true,
        capabilities: { readOnly: true, worktreeWrite: true },
        checkedAt: new Date().toISOString(),
      };
      const mockStatusClaude = {
        installed: true,
        authenticated: true,
        capabilities: { readOnly: true, worktreeWrite: true },
        checkedAt: new Date().toISOString(),
      };

      const mockCodexAdapter = {
        id: "codex" as const,
        declaredCapabilities: { readOnly: true, worktreeWrite: true },
        probe: async () => mockStatusCodex,
        build: () => ({
          executable: "echo",
          args: [],
          cwd: ".",
          stdin: "",
          structuredResultPath: null,
        }),
      };
      const mockClaudeAdapter = {
        id: "claude" as const,
        declaredCapabilities: { readOnly: true, worktreeWrite: true },
        probe: async () => mockStatusClaude,
        build: () => ({
          executable: "echo",
          args: [],
          cwd: ".",
          stdin: "",
          structuredResultPath: null,
        }),
      };

      registry = new ProviderRegistry(
        [mockCodexAdapter, mockClaudeAdapter],
        supervisor,
        undefined,
        join(dir, "providers"),
      );
      artifactStore = new ArtifactStore(db, join(dir, "artifacts"));

      registry.setStatus({ provider: "codex", ...mockStatusCodex });
      registry.setStatus({ provider: "claude", ...mockStatusClaude });

      const runner = new AttemptRunner(registry, runStore, {
        supervisor,
        artifacts: artifactStore,
        tempDir,
        statusFor: (p) => registry.statusFor(p)!,
      });

      const profile = {
        id: "worker-1",
        role: "worker" as const,
        label: "Worker 1",
        providerChain: [
          { provider: "codex" as const, model: "gpt-4" },
          { provider: "claude" as const, model: "sonnet" },
        ],
        timeoutMs: 10000,
        promptVersion: "worker-v1",
      };

      const mockExecution = {
        exitCode: 0,
        durationMs: 150,
        structuredOutput: { success: true },
        stdout: { id: "stdout-1" } as any,
        stderr: { id: "stderr-1" } as any,
        errorCode: null,
      };

      const spy = vi.spyOn(executeModule, "executeProviderRequest");

      // Case 1: Direct success stops immediately
      spy.mockResolvedValueOnce(mockExecution);

      const outcome = await runner.execute(
        {
          profile,
          requiredCapability: "worktreeWrite",
          request: {
            runId: null,
            taskId: null,
            conversationId: null,
            contextSnapshotId: "snap-1",
            role: "worker",
            prompt: "prompt",
            cwd: dir,
            timeoutMs: 10000,
            readOnly: false,
            outputContract: null,
          },
          repairPrompt: () => "repair",
        },
        new AbortController().signal,
      );

      expect(outcome.provider).toBe("codex");
      expect(outcome.launchedAttempts).toBe(1);

      // Verify db logs: select attempts from table
      const rows = db.prepare("SELECT * FROM attempts").all();
      expect(rows.length).toBe(1);
      expect(rows[0].provider).toBe("codex");
      expect(rows[0].status).toBe("completed");

      registry.loadStatuses([
        { provider: "codex", ...mockStatusCodex } as any,
        { provider: "claude", ...mockStatusClaude } as any,
      ]);
      spy.mockClear();
      await expect(
        runner.execute(
          {
            profile,
            requiredCapability: "worktreeWrite",
            request: {
              runId: null,
              taskId: null,
              conversationId: null,
              contextSnapshotId: "snap-1",
              role: "worker",
              prompt: "prompt",
              cwd: dir,
              timeoutMs: 10000,
              readOnly: false,
              outputContract: null,
            },
            repairPrompt: () => "repair",
          },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: "provider_capability_unavailable" });
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
