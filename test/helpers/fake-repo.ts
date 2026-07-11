import { join, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { ProcessSupervisor } from "../../src/server/system/process.js";

export type FakeRepo = { root: string; branch: string; head: string };

const supervisor = new ProcessSupervisor();

async function runGit(cwd: string, args: string[]): Promise<string> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const stdoutSink = {
    write: async (c: string) => {
      stdoutChunks.push(c);
    },
  };
  const stderrSink = {
    write: async (c: string) => {
      stderrChunks.push(c);
    },
  };

  const result = await supervisor.run(
    {
      executable: "git",
      args,
      cwd,
      stdin: "",
      timeoutMs: 15_000,
    },
    { stdout: stdoutSink, stderr: stderrSink },
    new AbortController().signal,
  );

  if (result.exitCode !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}. Stderr: ${stderrChunks.join("")}`);
  }

  return stdoutChunks.join("").trim();
}

export async function createFakeRepo(root: string): Promise<FakeRepo> {
  await mkdir(root, { recursive: true });

  // 1. Git init
  await runGit(root, ["init", "-b", "main"]);

  // Configure local git to avoid environment issues in test environments
  await runGit(root, ["config", "user.name", "Test"]);
  await runGit(root, ["config", "user.email", "test@example.invalid"]);

  // 2. Add base files
  await commitFile(
    root,
    "package.json",
    JSON.stringify(
      {
        name: "fake-project",
        scripts: {
          "format:check": "prettier --check .",
          lint: "eslint .",
          typecheck: "tsc --noEmit",
          test: "vitest run",
          build: "vite build",
        },
      },
      null,
      2,
    ),
  );

  await commitFile(root, "src/index.ts", "console.log('hello');");
  const headSha = await commitFile(root, "AGENTS.md", "# Agent Rules\n");

  return {
    root,
    branch: "main",
    head: headSha,
  };
}

export async function commitFile(root: string, relPath: string, content: string): Promise<string> {
  const fullPath = join(root, relPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");

  await runGit(root, [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "add",
    "--",
    relPath,
  ]);
  await runGit(root, [
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-m",
    `Update ${relPath}`,
  ]);

  const headSha = await runGit(root, ["rev-parse", "HEAD"]);
  return headSha;
}
