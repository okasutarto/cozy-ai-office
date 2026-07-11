import { realpath, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { type GitClient, splitNul } from "./git.js";
import { AppError } from "../errors.js";
import type { CommandSpec } from "../../shared/contracts.js";

export type RepositoryInspection = {
  rootPath: string;
  name: string;
  branch: string;
  head: string;
  clean: boolean;
  statusEntries: string[];
  trackedPaths: string[];
  commandCandidates: CommandSpec[];
  rulePaths: string[];
};

export class RepositoryService {
  constructor(private readonly git: GitClient) {}

  async inspect(rootPath: string, signal: AbortSignal): Promise<RepositoryInspection> {
    const realRoot = (await realpath(rootPath)).replaceAll("\\", "/");

    // Verify it is top-level Git root
    let toplevelRaw = "";
    try {
      toplevelRaw = await this.git.require(realRoot, ["rev-parse", "--show-toplevel"], signal);
    } catch (err) {
      throw new AppError("not_git_root", `Directory ${rootPath} is not a git repository`, 400);
    }
    const toplevel = (await realpath(toplevelRaw.trim())).replaceAll("\\", "/");
    if (realRoot !== toplevel) {
      throw new AppError("not_git_root", `Directory ${rootPath} is not a git repository root`, 400);
    }

    // Symbolic-ref HEAD to check branch and reject detached head
    let branch = "";
    try {
      branch = (
        await this.git.require(realRoot, ["symbolic-ref", "--short", "HEAD"], signal)
      ).trim();
    } catch (err) {
      throw new AppError("detached_head", "Repository is in a detached HEAD state", 400);
    }

    // Rev-parse HEAD
    const head = (await this.git.require(realRoot, ["rev-parse", "HEAD"], signal)).trim();

    // Git status porcelain
    const statusRaw = await this.git.require(
      realRoot,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      signal,
    );
    const statusEntries = splitNul(statusRaw);
    const clean = statusEntries.length === 0;

    // Git ls-files
    const filesRaw = await this.git.require(realRoot, ["ls-files", "-z"], signal);
    const trackedPaths = splitNul(filesRaw);

    // Derive name from root directory name
    const name = realRoot.split("/").filter(Boolean).at(-1) || "unnamed";

    // Command Candidates
    const commandCandidates: CommandSpec[] = [];
    const npmExecutable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
    // ponytail: package.json is assumed to be at the repository root. For monorepos, we would need to recursively search subdirectories.
    if (trackedPaths.includes("package.json")) {
      try {
        const content = await readFile(join(realRoot, "package.json"), "utf8");
        const pkg = JSON.parse(content);
        const scripts = pkg.scripts || {};
        const order = ["format:check", "lint", "typecheck", "test", "build"];
        for (const key of order) {
          if (scripts[key]) {
            commandCandidates.push({
              id: randomUUID(),
              label: key,
              executable: npmExecutable,
              args:
                process.platform === "win32"
                  ? ["/d", "/s", "/c", `npm.cmd run ${key}`]
                  : ["run", key],
              cwd: ".",
              required: false,
              timeoutMs: 300_000,
            });
          }
        }
      } catch (err) {
        // ignore JSON/file reading failures to not break onboarding
      }
    }

    if (trackedPaths.includes("pubspec.yaml")) {
      commandCandidates.push({
        id: randomUUID(),
        label: "analyze",
        executable: "flutter",
        args: ["analyze"],
        cwd: ".",
        required: false,
        timeoutMs: 300_000,
      });
      commandCandidates.push({
        id: randomUUID(),
        label: "test",
        executable: "flutter",
        args: ["test"],
        cwd: ".",
        required: false,
        timeoutMs: 300_000,
      });
    }

    // Rule Paths
    const rulePaths: string[] = [];
    const ruleCandidates = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
    for (const candidate of ruleCandidates) {
      if (trackedPaths.includes(candidate)) {
        rulePaths.push(candidate);
      }
    }

    return {
      rootPath: realRoot,
      name,
      branch,
      head,
      clean,
      statusEntries,
      trackedPaths,
      commandCandidates,
      rulePaths,
    };
  }

  async assertCleanAt(
    rootPath: string,
    branch: string,
    head: string,
    signal: AbortSignal,
  ): Promise<void> {
    const realRoot = (await realpath(rootPath)).replaceAll("\\", "/");
    let currentBranch = "";
    try {
      currentBranch = (
        await this.git.require(realRoot, ["symbolic-ref", "--short", "HEAD"], signal)
      ).trim();
    } catch (err) {
      throw new AppError("detached_head", "Repository is in a detached HEAD state", 400);
    }
    if (currentBranch !== branch) {
      throw new AppError(
        "git_state_mismatch",
        `Repository branch is ${currentBranch}, expected ${branch}`,
        400,
      );
    }

    const currentHead = (await this.git.require(realRoot, ["rev-parse", "HEAD"], signal)).trim();
    if (currentHead !== head) {
      throw new AppError(
        "git_state_mismatch",
        `Repository HEAD is ${currentHead}, expected ${head}`,
        400,
      );
    }

    const statusRaw = await this.git.require(
      realRoot,
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      signal,
    );
    if (splitNul(statusRaw).length > 0) {
      throw new AppError("git_dirty", "Repository is not clean", 400);
    }
  }
}
