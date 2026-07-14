import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { openDatabase } from "../../src/server/db/database.js";
import { SqliteProjectStore } from "../../src/server/db/project-store.js";
import { withTempDir } from "../helpers/temp.js";
import { createFakeRepo, commitFile } from "../helpers/fake-repo.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import { GitClient } from "../../src/server/git/git.js";
import { RepositoryService } from "../../src/server/git/repository.js";
import {
  ContextSnapshotService,
  finalizeSnapshotDirectory,
  renameDirectoryWithRetry,
} from "../../src/server/context/snapshots.js";
import { AppError } from "../../src/server/errors.js";

describe("Context Snapshot Service", () => {
  it("retries transient Windows directory rename failures", async () => {
    const delays: number[] = [];
    let attempts = 0;

    await renameDirectoryWithRetry("temp", "final", {
      renameDirectory: async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error("directory is temporarily locked") as NodeJS.ErrnoException;
          error.code = "EPERM";
          throw error;
        }
      },
      wait: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    expect(attempts).toBe(3);
    expect(delays).toEqual([25, 50]);
  });

  it("does not retry permanent directory rename failures", async () => {
    let attempts = 0;
    const error = new Error("destination already exists") as NodeJS.ErrnoException;
    error.code = "EEXIST";

    await expect(
      renameDirectoryWithRetry("temp", "final", {
        renameDirectory: async () => {
          attempts++;
          throw error;
        },
        wait: async () => undefined,
      }),
    ).rejects.toBe(error);

    expect(attempts).toBe(1);
  });

  it("copies snapshots when Windows keeps directory rename locked", async () => {
    await withTempDir(async (dir) => {
      const source = join(dir, "source");
      const destination = join(dir, "destination");
      await mkdir(join(source, "nested"), { recursive: true });
      await writeFile(join(source, "manifest.json"), "manifest");
      await writeFile(join(source, "nested", "context.txt"), "context");

      await finalizeSnapshotDirectory(source, destination, {
        renameDirectory: async () => {
          const error = new Error("directory remains locked") as NodeJS.ErrnoException;
          error.code = "EPERM";
          throw error;
        },
        wait: async () => undefined,
      });

      await expect(readFile(join(destination, "manifest.json"), "utf8")).resolves.toBe("manifest");
      await expect(readFile(join(destination, "nested", "context.txt"), "utf8")).resolves.toBe(
        "context",
      );
      await expect(readFile(join(source, "manifest.json"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  it("creates, materializes, and verifies snapshot policies", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      try {
        const supervisor = new ProcessSupervisor();
        const projectStore = new SqliteProjectStore(db);
        const gitClient = new GitClient(supervisor);
        const repoService = new RepositoryService(gitClient);

        const contextsRoot = join(dir, "contexts");
        const tempRoot = join(dir, "tmp");
        await mkdir(contextsRoot, { recursive: true });
        await mkdir(tempRoot, { recursive: true });

        const snapshotService = new ContextSnapshotService(
          projectStore,
          repoService,
          contextsRoot,
          tempRoot,
        );

        // 1. Create a fake Git repository
        const repoPath = join(dir, "repo");
        const repo = await createFakeRepo(repoPath);

        // Register project
        const project = projectStore.upsertProject({
          id: "00000000-0000-4000-8000-000000000201",
          name: "fake-project",
          rootPath: repoPath,
          setupComplete: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Add various test files to git
        await commitFile(repoPath, "good.txt", "This is clean, accepted content.");
        await commitFile(repoPath, ".env", "API_SECRET=12345"); // Credential shaped
        await commitFile(repoPath, "id_rsa", "PRIVATE KEY STUFF"); // Credential shaped
        await commitFile(repoPath, "credentials.json", "{}"); // Credential shaped
        await commitFile(repoPath, "src/key.pem", "CERT"); // Credential shaped
        await commitFile(repoPath, "binary.bin", "Hello\0World"); // NUL byte check

        // Large file (> 2 MiB)
        const largeContent = "a".repeat(2 * 1024 * 1024 + 10);
        const latestHead = await commitFile(repoPath, "large.txt", largeContent);

        // ponytail: Symlink tests are skipped on Windows if developer mode is off.
        // We simulate symlink testing natively if the platform supports it.
        try {
          await symlink(join(repoPath, "good.txt"), join(repoPath, "link.txt"));
          // we do not commit link.txt so git won't track it, but we can verify it's skipped or fails if selected
        } catch {
          // ignore if symlinks can't be created (unprivileged on Windows)
        }

        // Test normal selection:
        const selected = [
          "good.txt",
          ".env",
          "id_rsa",
          "credentials.json",
          "src/key.pem",
          "binary.bin",
          "large.txt",
        ];
        const snapshot = await snapshotService.create(
          project.id,
          selected,
          new AbortController().signal,
        );

        // Verification of properties
        expect(snapshot.sourceBranch).toBe("main");
        expect(snapshot.sourceHead).toBe(latestHead);

        // Excluded list verifies shape/size constraints
        const excludedPaths = snapshot.excluded.map((e) => e.path);
        expect(excludedPaths).toContain(".env");
        expect(excludedPaths).toContain("id_rsa");
        expect(excludedPaths).toContain("credentials.json");
        expect(excludedPaths).toContain("src/key.pem");
        expect(excludedPaths).toContain("binary.bin");
        expect(excludedPaths).toContain("large.txt");

        expect(snapshot.entries.length).toBe(1);
        expect(snapshot.entries[0].path).toBe("good.txt");

        // 2. Produces the same snapshot ID for identical content and selection
        const snapshot2 = await snapshotService.create(
          project.id,
          selected,
          new AbortController().signal,
        );
        expect(snapshot2.id).toBe(snapshot.id);

        // 3. Rejects an untracked selected path
        await expect(
          snapshotService.create(project.id, ["untracked.txt"], new AbortController().signal),
        ).rejects.toThrow(/is not tracked by Git/);

        // 4. Materialize disposable context
        const disposable = await snapshotService.materializeDisposable(snapshot.id, "request-123");
        expect(disposable.path).toContain("consultations/request-123");

        // Verify baseline is unchanged
        await expect(disposable.verifyUnchanged()).resolves.toBeUndefined();

        // Write a new file to mock violation:
        await writeFile(join(disposable.path, "violator.txt"), "forbidden write");
        await expect(disposable.verifyUnchanged()).rejects.toThrow(
          /Read-only provider changed its disposable context/,
        );

        await disposable.dispose();

        // 5. VerifyUnchanged on snapshotService checks branch/head/hash changes
        await expect(
          snapshotService.verifyUnchanged(snapshot.id, new AbortController().signal),
        ).resolves.toBeUndefined();

        // Modify good.txt in git repo and check verification rejection
        await writeFile(join(repoPath, "good.txt"), "modified!");
        await expect(
          snapshotService.verifyUnchanged(snapshot.id, new AbortController().signal),
        ).rejects.toThrow(/has been modified since snapshot/);
      } finally {
        db.close();
      }
    });
  }, 60_000);
});
