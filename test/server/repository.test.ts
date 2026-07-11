import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { openDatabase } from "../../src/server/db/database.js";
import { SqliteProjectStore } from "../../src/server/db/project-store.js";
import { withTempDir } from "../helpers/temp.js";
import { createFakeRepo, commitFile } from "../helpers/fake-repo.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import { GitClient } from "../../src/server/git/git.js";
import { RepositoryService } from "../../src/server/git/repository.js";
import { ProjectService } from "../../src/server/projects/service.js";
import { ProviderRegistry } from "../../src/server/providers/registry.js";
import { AntigravityAdapter } from "../../src/server/providers/antigravity.js";
import { CodexAdapter } from "../../src/server/providers/codex.js";
import { ClaudeAdapter } from "../../src/server/providers/claude.js";
import type { ProviderStatus } from "../../shared/contracts.js";

describe("Git repository service", () => {
  it("rejects a non-Git directory", async () => {
    await withTempDir(async (dir) => {
      const supervisor = new ProcessSupervisor();
      const gitClient = new GitClient(supervisor);
      const repoService = new RepositoryService(gitClient);

      const nonGitDir = join(dir, "not-a-repo");
      await mkdir(nonGitDir);

      await expect(repoService.inspect(nonGitDir, new AbortController().signal)).rejects.toThrow(
        /is not a git repository/,
      );
    });
  });

  it("rejects a nested directory whose top-level differs from the selected path", async () => {
    await withTempDir(async (dir) => {
      const supervisor = new ProcessSupervisor();
      const gitClient = new GitClient(supervisor);
      const repoService = new RepositoryService(gitClient);

      const repoPath = join(dir, "repo");
      await createFakeRepo(repoPath);

      const nestedDir = join(repoPath, "src");
      await expect(repoService.inspect(nestedDir, new AbortController().signal)).rejects.toThrow(
        /is not a git repository root/,
      );
    });
  });

  it("inspects a clean git repo, detects npm/flutter candidates, rule files, and handles dirty state", async () => {
    await withTempDir(async (dir) => {
      const supervisor = new ProcessSupervisor();
      const gitClient = new GitClient(supervisor);
      const repoService = new RepositoryService(gitClient);

      const repoPath = join(dir, "repo");
      await createFakeRepo(repoPath);

      // Should inspect successfully
      const inspection = await repoService.inspect(repoPath, new AbortController().signal);
      expect(inspection.clean).toBe(true);
      expect(inspection.branch).toBe("main");
      expect(inspection.rulePaths).toContain("AGENTS.md");
      expect(inspection.commandCandidates.map((c) => c.label)).toEqual([
        "format:check",
        "lint",
        "typecheck",
        "test",
        "build",
      ]);
      const npmExecutable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
      expect(
        inspection.commandCandidates.every((candidate) => candidate.executable === npmExecutable),
      ).toBe(true);
      if (process.platform === "win32") {
        expect(inspection.commandCandidates.map((candidate) => candidate.args)).toEqual([
          ["/d", "/s", "/c", "npm.cmd run format:check"],
          ["/d", "/s", "/c", "npm.cmd run lint"],
          ["/d", "/s", "/c", "npm.cmd run typecheck"],
          ["/d", "/s", "/c", "npm.cmd run test"],
          ["/d", "/s", "/c", "npm.cmd run build"],
        ]);
      }

      // Propose flutter analyze and flutter test only when pubspec.yaml is tracked
      expect(inspection.commandCandidates.map((c) => c.executable)).not.toContain("flutter");

      // Add pubspec.yaml and commit
      await commitFile(repoPath, "pubspec.yaml", "name: fake-flutter");

      const inspection2 = await repoService.inspect(repoPath, new AbortController().signal);
      expect(
        inspection2.commandCandidates.some(
          (c) => c.executable === "flutter" && c.label === "analyze",
        ),
      ).toBe(true);
      expect(
        inspection2.commandCandidates.some((c) => c.executable === "flutter" && c.label === "test"),
      ).toBe(true);

      // Make dirty
      await writeFile(join(repoPath, "src/index.ts"), "console.log('dirty');");
      const inspection3 = await repoService.inspect(repoPath, new AbortController().signal);
      expect(inspection3.clean).toBe(false);
    });
  });

  it("lists tracked files with spaces and Unicode using NUL-delimited Git output", async () => {
    await withTempDir(async (dir) => {
      const supervisor = new ProcessSupervisor();
      const gitClient = new GitClient(supervisor);
      const repoService = new RepositoryService(gitClient);

      const repoPath = join(dir, "repo");
      await createFakeRepo(repoPath);

      // File with spaces and Unicode
      await commitFile(repoPath, "src/folder name/unicode-⚡.ts", "const lightning = 1;");

      const inspection = await repoService.inspect(repoPath, new AbortController().signal);
      expect(inspection.trackedPaths).toContain("src/folder name/unicode-⚡.ts");
    });
  });
});

describe("Project onboarding and role configuration", () => {
  it("builds exactly seven role profiles with four distinct Worker IDs", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      try {
        const supervisor = new ProcessSupervisor();
        const projectStore = new SqliteProjectStore(db);
        const gitClient = new GitClient(supervisor);
        const repoService = new RepositoryService(gitClient);

        // Define fake adapters
        const codex = new CodexAdapter("codex");
        const claude = new ClaudeAdapter("claude");
        const agy = new AntigravityAdapter("agy");

        const registry = new ProviderRegistry(
          [codex, claude, agy],
          supervisor,
          projectStore,
          join(dir, "temp"),
        );

        // Save provider statuses to DB manually to simulate successful probes
        const defaultCap = { nonInteractive: true, readOnly: true, worktreeWrite: true };
        const providerStatuses: ProviderStatus[] = [
          {
            provider: "codex",
            installed: true,
            authenticated: true,
            version: "1.0",
            models: ["gpt-4"],
            capabilities: defaultCap,
            diagnostic: null,
            checkedAt: new Date().toISOString(),
          },
          {
            provider: "claude",
            installed: true,
            authenticated: true,
            version: "2.0",
            models: ["sonnet"],
            capabilities: defaultCap,
            diagnostic: null,
            checkedAt: new Date().toISOString(),
          },
          {
            provider: "antigravity",
            installed: true,
            authenticated: false, // authenticated=false until explicit login verification
            version: "1.0",
            models: [],
            capabilities: { nonInteractive: true, readOnly: false, worktreeWrite: true },
            diagnostic: "Run Verify login",
            checkedAt: new Date().toISOString(),
          },
        ];

        providerStatuses.forEach((st) => projectStore.saveProviderStatus(st));
        providerStatuses.forEach((st) => registry.setStatus(st));

        const projectService = new ProjectService(projectStore, repoService, registry);

        const repoPath = join(dir, "repo");
        await createFakeRepo(repoPath);

        const result = await projectService.selectProject(repoPath, new AbortController().signal);

        const roles = projectStore.listRoleProfiles(result.id);
        expect(roles.length).toBe(7);

        const manager = roles.find((r) => r.id === "manager")!;
        const advisor = roles.find((r) => r.id === "advisor")!;
        const qa = roles.find((r) => r.id === "qa")!;
        const workers = roles.filter((r) => r.id.startsWith("worker-"));

        // Manager/Advisor/QA defaults to read-only-capable providers (codex or claude)
        expect(manager.providerChain[0].provider).toBe("codex");
        expect(advisor.providerChain[0].provider).toBe("claude"); // Last read-only
        expect(qa.providerChain[0].provider).toBe("codex");

        // Exactly four workers
        expect(workers.length).toBe(4);
        const workerIds = new Set(workers.map((w) => w.id));
        expect(workerIds).toEqual(new Set(["worker-1", "worker-2", "worker-3", "worker-4"]));

        // Antigravity is not in default worker chains since authenticated=false
        workers.forEach((w) => {
          w.providerChain.forEach((c) => {
            expect(c.provider).not.toBe("antigravity");
          });
        });
      } finally {
        db.close();
      }
    });
  });
});
