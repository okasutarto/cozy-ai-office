import { describe, expect, it, vi, beforeEach } from "vitest";
import { QaRunner, type QaCommand, type QaRunInput } from "../../src/server/orchestrator/qa.js";
import { openDatabase } from "../../src/server/db/database.js";
import { ArtifactStore } from "../../src/server/artifacts/store.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import { withTempDir } from "../helpers/temp.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const echoFixture = fileURLToPath(new URL("../fixtures/fake-provider.mjs", import.meta.url));

describe("QaRunner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("runs commands in position order and returns passed report", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(":memory:");
      const artifacts = new ArtifactStore(db, join(dir, "artifacts"));
      const supervisor = new ProcessSupervisor();

      const runner = new QaRunner(supervisor, artifacts, null);

      const commands: QaCommand[] = [
        {
          id: "cmd-b",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwd: dir,
          timeoutMs: 5_000,
          required: true,
          position: 2,
        },
        {
          id: "cmd-a",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwd: dir,
          timeoutMs: 5_000,
          required: true,
          position: 1,
        },
      ];

      const input: QaRunInput = {
        runId: null as any,
        taskId: null as any,
        commands,
        diffArtifactId: "diff-1",
        allowedRepairPaths: [dir],
      };

      const report = await runner.run(input, new AbortController().signal);

      expect(report.passed).toBe(true);
      expect(report.cycleCount).toBe(1);
      expect(report.results).toHaveLength(2);
      // Position order: cmd-a (pos 1) runs first
      expect(report.results[0].commandId).toBe("cmd-a");
      expect(report.results[1].commandId).toBe("cmd-b");
      expect(report.results[0].status).toBe("passed");
      expect(report.results[1].status).toBe("passed");
      expect(report.diagnosisArtifactId).toBeNull();
      expect(report.repairResultArtifactId).toBeNull();
    });
  });

  it("stops on first required failure and reports failed", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(":memory:");
      const artifacts = new ArtifactStore(db, join(dir, "artifacts"));
      const supervisor = new ProcessSupervisor();

      const runner = new QaRunner(supervisor, artifacts, null);

      const commands: QaCommand[] = [
        {
          id: "cmd-pass",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwd: dir,
          timeoutMs: 5_000,
          required: true,
          position: 1,
        },
        {
          id: "cmd-fail",
          executable: process.execPath,
          args: ["-e", "process.exit(1)"],
          cwd: dir,
          timeoutMs: 5_000,
          required: true,
          position: 2,
        },
        {
          id: "cmd-never",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwd: dir,
          timeoutMs: 5_000,
          required: true,
          position: 3,
        },
      ];

      const input: QaRunInput = {
        runId: null as any,
        taskId: null as any,
        commands,
        diffArtifactId: "diff-2",
        allowedRepairPaths: [dir],
      };

      const report = await runner.run(input, new AbortController().signal);

      // No workerPort, so failure with no repair
      expect(report.passed).toBe(false);
      expect(report.cycleCount).toBe(1);
      // cmd-pass ran and passed, cmd-fail ran and failed, cmd-never never ran
      expect(report.results).toHaveLength(2);
      expect(report.results[0].status).toBe("passed");
      expect(report.results[1].status).toBe("failed");
    });
  });

  it("optional failures do not stop first pass", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(":memory:");
      const artifacts = new ArtifactStore(db, join(dir, "artifacts"));
      const supervisor = new ProcessSupervisor();

      const runner = new QaRunner(supervisor, artifacts, null);

      const commands: QaCommand[] = [
        {
          id: "cmd-optional-fail",
          executable: process.execPath,
          args: ["-e", "process.exit(1)"],
          cwd: dir,
          timeoutMs: 5_000,
          required: false,
          position: 1,
        },
        {
          id: "cmd-required-pass",
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwd: dir,
          timeoutMs: 5_000,
          required: true,
          position: 2,
        },
      ];

      const input: QaRunInput = {
        runId: null as any,
        taskId: null as any,
        commands,
        diffArtifactId: "diff-3",
        allowedRepairPaths: [dir],
      };

      const report = await runner.run(input, new AbortController().signal);

      // Optional fail doesn't block; required passed
      expect(report.passed).toBe(true);
      expect(report.cycleCount).toBe(1);
      expect(report.results).toHaveLength(2);
      expect(report.results[0].status).toBe("failed");
      expect(report.results[0].required).toBe(false);
      expect(report.results[1].status).toBe("passed");
    });
  });
});
