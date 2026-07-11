import { relative, resolve, dirname, join } from "node:path";
import { lstat, mkdir, rm, realpath } from "node:fs/promises";
import { type GitClient, splitNul } from "./git.js";
import type { RepositoryService } from "./repository.js";
import { AppError } from "../errors.js";
import { RelativePathSchema, type TaskBrief } from "../../shared/contracts.js";

export type PreparedRun = {
  integrationBranch: string;
  integrationWorktree: string;
};

export type TaskWorktree = {
  branch: string;
  path: string;
  baseCommit: string;
};

export type ValidatedCommit = {
  commitSha: string;
  changedFiles: string[];
};

export function assertInside(parent: string, child: string): string {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  const rel = relative(resolvedParent, resolvedChild);
  if (rel === "" || (!rel.startsWith("..") && !/^[A-Za-z]:/u.test(rel))) {
    return resolvedChild;
  }
  throw new AppError("path_outside_app_data", "Worktree path escaped app data", 500);
}

function isSubpath(sub: string, parent: string): boolean {
  const s = sub.replaceAll("\\", "/").replace(/\/$/u, "");
  const p = parent.replaceAll("\\", "/").replace(/\/$/u, "");
  return s === p || s.startsWith(`${p}/`);
}

export class WorktreeService {
  constructor(
    private readonly git: GitClient,
    private readonly repositories: RepositoryService,
    private readonly root: string,
    private readonly emptyHooksDir: string,
  ) {}

  private getShortRunId(runId: string): string {
    return runId.replaceAll("-", "").substring(0, 12);
  }

  async prepareRun(input: {
    projectId: string;
    runId: string;
    repositoryRoot: string;
    branch: string;
    baseCommit: string;
    signal: AbortSignal;
  }): Promise<PreparedRun> {
    await this.repositories.assertCleanAt(
      input.repositoryRoot,
      input.branch,
      input.baseCommit,
      input.signal,
    );

    const shortRunId = this.getShortRunId(input.runId);
    const integrationBranch = `cozy/${shortRunId}/integration`;
    const integrationWorktree = join(this.root, "runs", input.runId, "integration").replaceAll(
      "\\",
      "/",
    );

    assertInside(this.root, integrationWorktree);
    await mkdir(dirname(integrationWorktree), { recursive: true });

    try {
      // 1. Create branch
      await this.git.require(
        input.repositoryRoot,
        [
          "-c",
          `core.hooksPath=${this.emptyHooksDir}`,
          "branch",
          integrationBranch,
          input.baseCommit,
        ],
        input.signal,
      );

      // 2. Add worktree
      await this.git.require(
        input.repositoryRoot,
        [
          "-c",
          `core.hooksPath=${this.emptyHooksDir}`,
          "worktree",
          "add",
          integrationWorktree,
          integrationBranch,
        ],
        input.signal,
      );

      return {
        integrationBranch,
        integrationWorktree,
      };
    } catch (err) {
      // Clean up refs/directories proven to belong to this run
      await this.git
        .run(
          input.repositoryRoot,
          ["-c", `core.hooksPath=${this.emptyHooksDir}`, "branch", "-D", integrationBranch],
          input.signal,
        )
        .catch(() => undefined);

      await this.git
        .run(
          input.repositoryRoot,
          ["-c", `core.hooksPath=${this.emptyHooksDir}`, "worktree", "prune"],
          input.signal,
        )
        .catch(() => undefined);

      await rm(integrationWorktree, { recursive: true, force: true }).catch(() => undefined);

      throw new AppError(
        "worktree_creation_failed",
        `Failed to create integration worktree: ${(err as Error).message}`,
        500,
      );
    }
  }

  async createTaskWorktree(input: {
    projectId: string;
    runId: string;
    task: TaskBrief;
    integrationWorktree: string;
    signal: AbortSignal;
  }): Promise<TaskWorktree> {
    const integrationHead = (
      await this.git.require(input.integrationWorktree, ["rev-parse", "HEAD"], input.signal)
    ).trim();

    const shortRunId = this.getShortRunId(input.runId);
    const taskBranch = `cozy/${shortRunId}/${input.task.id}`;
    const taskPath = join(this.root, "runs", input.runId, "tasks", input.task.id).replaceAll(
      "\\",
      "/",
    );

    assertInside(this.root, taskPath);
    await mkdir(dirname(taskPath), { recursive: true });

    // Rev-parse repository root to add task worktree
    const repoRoot = (
      await this.git.require(
        input.integrationWorktree,
        ["rev-parse", "--show-toplevel"],
        input.signal,
      )
    ).trim();

    await this.git.require(
      repoRoot,
      ["-c", `core.hooksPath=${this.emptyHooksDir}`, "branch", taskBranch, integrationHead],
      input.signal,
    );

    await this.git.require(
      repoRoot,
      ["-c", `core.hooksPath=${this.emptyHooksDir}`, "worktree", "add", taskPath, taskBranch],
      input.signal,
    );

    return {
      branch: taskBranch,
      path: taskPath,
      baseCommit: integrationHead,
    };
  }

  async validateAndCommit(input: {
    task: TaskBrief;
    worktree: TaskWorktree;
    signal: AbortSignal;
  }): Promise<ValidatedCommit> {
    const currentBranch = (
      await this.git.require(
        input.worktree.path,
        ["rev-parse", "--abbrev-ref", "HEAD"],
        input.signal,
      )
    ).trim();
    const currentHead = (
      await this.git.require(input.worktree.path, ["rev-parse", "HEAD"], input.signal)
    ).trim();

    if (currentBranch !== input.worktree.branch || currentHead !== input.worktree.baseCommit) {
      throw new AppError(
        "policy_violation",
        "Worker modified task repository state or created commits illegally",
        400,
      );
    }

    // Gathers diffs and changes
    const diffRaw = await this.git.require(
      input.worktree.path,
      ["diff", "--name-only", "-z", "--diff-filter=ACDMRTUXB"],
      input.signal,
    );
    const cachedRaw = await this.git.require(
      input.worktree.path,
      ["diff", "--cached", "--name-only", "-z"],
      input.signal,
    );
    const untrackedRaw = await this.git.require(
      input.worktree.path,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      input.signal,
    );

    const prestaged = splitNul(cachedRaw);
    if (prestaged.length > 0) {
      throw new AppError("policy_violation", "Pre-staged changes are forbidden", 400);
    }

    const changedPaths = Array.from(
      new Set([...splitNul(diffRaw), ...splitNul(untrackedRaw)]),
    ).sort();

    if (changedPaths.length === 0) {
      return {
        commitSha: "",
        changedFiles: [],
      };
    }

    const validatedPaths: string[] = [];

    for (const relPath of changedPaths) {
      const normalized = RelativePathSchema.parse(relPath);

      // Require equal to or beneath at least one allowed path
      const allowed = input.task.allowedPaths.some((ap) => isSubpath(normalized, ap));
      if (!allowed) {
        throw new AppError(
          "policy_violation",
          `Changed path ${normalized} escaped allowed ownership`,
          400,
        );
      }

      // Require not equal to or beneath any forbidden path
      const forbidden = input.task.forbiddenPaths.some((fp) => isSubpath(normalized, fp));
      if (forbidden) {
        throw new AppError(
          "policy_violation",
          `Changed path ${normalized} is under a forbidden path`,
          400,
        );
      }

      const filePath = join(input.worktree.path, normalized);
      let stats;
      try {
        stats = await lstat(filePath);
      } catch {
        // Deleted paths remain valid when ownership permits them
        validatedPaths.push(normalized);
        continue;
      }

      if (!stats.isFile()) {
        throw new AppError("policy_violation", `Path ${normalized} is not a regular file`, 400);
      }

      const real = (await realpath(filePath)).replaceAll("\\", "/");
      const realWtRoot = (await realpath(input.worktree.path)).replaceAll("\\", "/");
      if (!real.startsWith(realWtRoot)) {
        throw new AppError(
          "policy_violation",
          `Path ${normalized} resolved outside worktree directory`,
          400,
        );
      }

      validatedPaths.push(normalized);
    }

    // Stage exact validated paths
    for (const path of validatedPaths) {
      await this.git.require(
        input.worktree.path,
        ["-c", `core.hooksPath=${this.emptyHooksDir}`, "add", "--", path],
        input.signal,
      );
    }

    // Commit changes
    await this.git.require(
      input.worktree.path,
      [
        "-c",
        `core.hooksPath=${this.emptyHooksDir}`,
        "-c",
        "user.name=Cozy-Agent-Office",
        "-c",
        "user.email=cozy-agent@localhost",
        "commit",
        "-m",
        `cozy: ${input.task.id} ${input.task.title}`,
      ],
      input.signal,
    );

    const commitSha = (
      await this.git.require(input.worktree.path, ["rev-parse", "HEAD"], input.signal)
    ).trim();

    return {
      commitSha,
      changedFiles: validatedPaths,
    };
  }

  async integrateCommit(input: {
    integrationWorktree: string;
    commitSha: string;
    signal: AbortSignal;
  }): Promise<{ conflictFiles: string[] }> {
    try {
      await this.git.require(
        input.integrationWorktree,
        ["-c", `core.hooksPath=${this.emptyHooksDir}`, "cherry-pick", input.commitSha],
        input.signal,
      );
      return { conflictFiles: [] };
    } catch (err) {
      const diffRaw = await this.git.require(
        input.integrationWorktree,
        ["diff", "--name-only", "--diff-filter=U", "-z"],
        input.signal,
      );
      const conflictFiles = splitNul(diffRaw);
      if (conflictFiles.length > 0) {
        return { conflictFiles };
      }
      throw err;
    }
  }

  async resolveConflict(input: {
    integrationWorktree: string;
    conflictFiles: string[];
    signal: AbortSignal;
  }): Promise<string> {
    const unmergedRaw = await this.git.require(
      input.integrationWorktree,
      ["diff", "--name-only", "--diff-filter=U", "-z"],
      input.signal,
    );
    if (splitNul(unmergedRaw).length > 0) {
      throw new AppError("policy_violation", "Unresolved conflict files remain in workspace", 400);
    }

    for (const file of input.conflictFiles) {
      await this.git.require(
        input.integrationWorktree,
        ["-c", `core.hooksPath=${this.emptyHooksDir}`, "add", "--", file],
        input.signal,
      );
    }

    await this.git.require(
      input.integrationWorktree,
      [
        "-c",
        `core.hooksPath=${this.emptyHooksDir}`,
        "-c",
        "core.editor=true",
        "-c",
        "user.name=Cozy-Agent-Office",
        "-c",
        "user.email=cozy-agent@localhost",
        "cherry-pick",
        "--continue",
      ],
      input.signal,
    );

    const integrationHead = (
      await this.git.require(input.integrationWorktree, ["rev-parse", "HEAD"], input.signal)
    ).trim();

    return integrationHead;
  }

  async applyToRoot(input: {
    repositoryRoot: string;
    expectedBranch: string;
    expectedBaseCommit: string;
    integrationBranch: string;
    signal: AbortSignal;
  }): Promise<string> {
    await this.repositories.assertCleanAt(
      input.repositoryRoot,
      input.expectedBranch,
      input.expectedBaseCommit,
      input.signal,
    );

    // Verify descendants check
    await this.git.require(
      input.repositoryRoot,
      ["merge-base", "--is-ancestor", input.expectedBaseCommit, input.integrationBranch],
      input.signal,
    );

    // Merge ff-only
    await this.git.require(
      input.repositoryRoot,
      ["-c", `core.hooksPath=${this.emptyHooksDir}`, "merge", "--ff-only", input.integrationBranch],
      input.signal,
    );

    const newHead = (
      await this.git.require(input.repositoryRoot, ["rev-parse", "HEAD"], input.signal)
    ).trim();

    return newHead;
  }
}
