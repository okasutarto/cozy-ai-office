import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { withTempDir } from "../helpers/temp.js";
import { createFakeRepo, commitFile } from "../helpers/fake-repo.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import { GitClient } from "../../src/server/git/git.js";
import { RepositoryService } from "../../src/server/git/repository.js";
import { WorktreeService } from "../../src/server/git/worktrees.js";

describe("Worktree Service", () => {
  it("manages isolated worktrees, enforces path ownership, and integrates commits", async () => {
    await withTempDir(async (dir) => {
      const supervisor = new ProcessSupervisor();
      const gitClient = new GitClient(supervisor);
      const repoService = new RepositoryService(gitClient);

      const worktreeRoot = join(dir, "worktrees");
      const emptyHooks = join(dir, "empty-hooks");
      await mkdir(worktreeRoot, { recursive: true });
      await mkdir(emptyHooks, { recursive: true });

      const service = new WorktreeService(gitClient, repoService, worktreeRoot, emptyHooks);

      const repoPath = join(dir, "repo");
      const repo = await createFakeRepo(repoPath);

      const runId = "00000000-0000-4000-8000-000000000501";
      const shortRunId = "000000000000";

      let integrationWtPath: string | undefined;
      let taskWtPath: string | undefined;
      let siblingWtPath: string | undefined;
      let forbiddenWtPath: string | undefined;

      try {
        // 1. Prepare run (integration branch + worktree)
        const prepared = await service.prepareRun({
          projectId: "proj-1",
          runId,
          repositoryRoot: repoPath,
          branch: "main",
          baseCommit: repo.head,
          signal: new AbortController().signal,
        });
        integrationWtPath = prepared.integrationWorktree;

        expect(prepared.integrationBranch).toBe(`cozy/${shortRunId}/integration`);
        expect(prepared.integrationWorktree).toContain(`integration`);

        // 2. Create task worktree
        const taskBrief = {
          id: "task-1",
          title: "Build features",
          objective: "Build code",
          mode: "write" as const,
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/a", "test/a.test.ts"],
          forbiddenPaths: ["src/a/forbidden.ts"],
          acceptanceCriteria: ["pass"],
          verificationCommands: [],
        };

        const taskWorktree = await service.createTaskWorktree({
          projectId: "proj-1",
          runId,
          task: taskBrief,
          integrationWorktree: prepared.integrationWorktree,
          signal: new AbortController().signal,
        });
        taskWtPath = taskWorktree.path;

        expect(taskWorktree.branch).toBe(`cozy/${shortRunId}/task-1`);
        expect(taskWorktree.baseCommit).toBe(repo.head);

        // 3. Test validateAndCommit path validation
        // Case 3a: Write task with no changes returns no_changes (empty commitSha)
        const noChangesCommit = await service.validateAndCommit({
          task: taskBrief,
          worktree: taskWorktree,
          signal: new AbortController().signal,
        });
        expect(noChangesCommit.commitSha).toBe("");

        // Case 3b: Allowed changes (adding a file under allowed path)
        const testFile = join(taskWorktree.path, "src/a/file.ts");
        await mkdir(join(taskWorktree.path, "src/a"), { recursive: true });
        await writeFile(testFile, "console.log('hello');");

        const validCommit = await service.validateAndCommit({
          task: taskBrief,
          worktree: taskWorktree,
          signal: new AbortController().signal,
        });
        expect(validCommit.commitSha).not.toBe("");
        expect(validCommit.changedFiles).toContain("src/a/file.ts");

        // Case 3c: Sibling src/ab is rejected when only src/a is allowed
        const siblingTask = {
          ...taskBrief,
          id: "task-2",
          allowedPaths: ["src/a"],
        };

        const siblingWt = await service.createTaskWorktree({
          projectId: "proj-1",
          runId,
          task: siblingTask,
          integrationWorktree: prepared.integrationWorktree,
          signal: new AbortController().signal,
        });
        siblingWtPath = siblingWt.path;

        await mkdir(join(siblingWt.path, "src"), { recursive: true });
        await writeFile(join(siblingWt.path, "src/ab"), "sibling content");

        await expect(
          service.validateAndCommit({
            task: siblingTask,
            worktree: siblingWt,
            signal: new AbortController().signal,
          }),
        ).rejects.toThrow(/escaped allowed ownership/);

        // Case 3d: Forbidden paths win over allowed ancestors
        const forbiddenTask = {
          ...taskBrief,
          id: "task-3",
        };
        const forbiddenWt = await service.createTaskWorktree({
          projectId: "proj-1",
          runId,
          task: forbiddenTask,
          integrationWorktree: prepared.integrationWorktree,
          signal: new AbortController().signal,
        });
        forbiddenWtPath = forbiddenWt.path;

        await mkdir(join(forbiddenWt.path, "src/a"), { recursive: true });
        const forbiddenFile = join(forbiddenWt.path, "src/a/forbidden.ts");
        await writeFile(forbiddenFile, "this is forbidden");

        await expect(
          service.validateAndCommit({
            task: forbiddenTask,
            worktree: forbiddenWt,
            signal: new AbortController().signal,
          }),
        ).rejects.toThrow(/is under a forbidden path/);

        // 4. Integrate commit
        const integrationResult = await service.integrateCommit({
          integrationWorktree: prepared.integrationWorktree,
          commitSha: validCommit.commitSha,
          signal: new AbortController().signal,
        });
        expect(integrationResult.conflictFiles.length).toBe(0);

        // 5. Apply integration to root
        const cleanSignal = new AbortController().signal;
        const integrationHead = (
          await gitClient.require(prepared.integrationWorktree, ["rev-parse", "HEAD"], cleanSignal)
        ).trim();

        const rootHead = await service.applyToRoot({
          repositoryRoot: repoPath,
          expectedBranch: "main",
          expectedBaseCommit: repo.head,
          integrationBranch: prepared.integrationBranch,
          signal: cleanSignal,
        });

        expect(rootHead).toBe(integrationHead);
      } finally {
        const cleanupSignal = new AbortController().signal;
        if (integrationWtPath) {
          await gitClient
            .run(repoPath, ["worktree", "remove", "-f", integrationWtPath], cleanupSignal)
            .catch(() => undefined);
        }
        if (taskWtPath) {
          await gitClient
            .run(repoPath, ["worktree", "remove", "-f", taskWtPath], cleanupSignal)
            .catch(() => undefined);
        }
        if (siblingWtPath) {
          await gitClient
            .run(repoPath, ["worktree", "remove", "-f", siblingWtPath], cleanupSignal)
            .catch(() => undefined);
        }
        if (forbiddenWtPath) {
          await gitClient
            .run(repoPath, ["worktree", "remove", "-f", forbiddenWtPath], cleanupSignal)
            .catch(() => undefined);
        }
        await gitClient.run(repoPath, ["worktree", "prune"], cleanupSignal).catch(() => undefined);
      }
    });
  }, 60_000);
});
