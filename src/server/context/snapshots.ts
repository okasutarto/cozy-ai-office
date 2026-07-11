import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rm, rename, writeFile, open } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { constants } from "node:fs";
import type { ProjectStore } from "../db/project-store.js";
import type { RepositoryService } from "../git/repository.js";
import { AppError, errorMessage } from "../errors.js";
import { RelativePathSchema, type ContextSnapshot } from "../../shared/contracts.js";

export const MAX_CONTEXT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CONTEXT_TOTAL_BYTES = 100 * 1024 * 1024;

export type DisposableContext = {
  path: string;
  baselineHash: string;
  verifyUnchanged(): Promise<void>;
  dispose(): Promise<void>;
};

function isCredentialShaped(path: string): boolean {
  const name = path.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === "id_rsa" ||
    name === "id_ed25519" ||
    name === "credentials.json" ||
    /^service-account.*\.json$/u.test(name) ||
    /\.(pem|p12|pfx|key)$/u.test(name)
  );
}

async function getFilesRecursive(dir: string, currentRoot = dir): Promise<string[]> {
  const entries = await lstat(dir);
  if (entries.isFile()) {
    return [dir];
  }

  // read directory contents recursively
  const subdirs = await import("node:fs/promises").then((fs) =>
    fs.readdir(dir, { withFileTypes: true }),
  );
  const files: string[] = [];
  for (const entry of subdirs) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getFilesRecursive(full, currentRoot)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export class ContextSnapshotService {
  constructor(
    private readonly db: Database.Database,
    private readonly projects: ProjectStore,
    private readonly repositories: RepositoryService,
    private readonly contextsRoot: string,
    private readonly tempRoot: string,
  ) {}

  async create(
    projectId: string,
    selectedPaths: string[],
    signal: AbortSignal,
  ): Promise<ContextSnapshot> {
    const project = this.projects.getProject(projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);

    const inspection = await this.repositories.inspect(project.rootPath, signal);

    // Normalize paths and verify membership
    const normalizedPaths = selectedPaths.map((p) => RelativePathSchema.parse(p));
    for (const normalized of normalizedPaths) {
      if (!inspection.trackedPaths.includes(normalized)) {
        throw new AppError("policy_violation", `File ${normalized} is not tracked by Git`, 400);
      }
    }

    const entries: { path: string; sizeBytes: number; sha256: string }[] = [];
    const excluded: { path: string; reason: string }[] = [];
    let totalBytes = 0;

    // Temporary workspace folder under tempRoot
    const tempDir = join(this.tempRoot, `snapshot-tmp-${randomUUID()}`).replaceAll("\\", "/");
    await mkdir(tempDir, { recursive: true });

    try {
      const flags = constants.O_RDONLY | (constants.O_NOFOLLOW || 0);

      for (const normalized of normalizedPaths) {
        if (isCredentialShaped(normalized)) {
          excluded.push({ path: normalized, reason: "file contains credentials shape" });
          continue;
        }

        const srcPath = join(project.rootPath, normalized);
        let srcStats;
        try {
          srcStats = await lstat(srcPath);
        } catch {
          throw new AppError(
            "git_state_mismatch",
            `File ${normalized} missing from filesystem`,
            404,
          );
        }

        if (!srcStats.isFile()) {
          throw new AppError("policy_violation", `File ${normalized} is not a regular file`, 400);
        }

        const srcReal = await realpathSafe(srcPath);
        if (!srcReal.startsWith(inspection.rootPath)) {
          throw new AppError(
            "policy_violation",
            `File ${normalized} resolves outside repository root`,
            400,
          );
        }

        const handle = await open(srcPath, flags);
        try {
          const handleStats = await handle.stat();
          if (!handleStats.isFile()) {
            throw new AppError("policy_violation", `File ${normalized} is not a regular file`, 400);
          }

          if (handleStats.size > MAX_CONTEXT_FILE_BYTES) {
            excluded.push({ path: normalized, reason: "exceeds 2 MiB file size limit" });
            continue;
          }

          if (totalBytes + handleStats.size > MAX_CONTEXT_TOTAL_BYTES) {
            excluded.push({ path: normalized, reason: "exceeds 100 MiB total directory limit" });
            continue;
          }

          // Check for NUL byte in the first 8 KiB
          const buf = Buffer.alloc(Math.min(8192, handleStats.size));
          await handle.read(buf, 0, buf.length, 0);
          if (buf.includes(0)) {
            excluded.push({ path: normalized, reason: "contains a NUL byte (binary file)" });
            continue;
          }

          // Read content to compute SHA256 and write
          const fullBuf = Buffer.alloc(handleStats.size);
          await handle.read(fullBuf, 0, fullBuf.length, 0);

          const postStats = await lstat(srcPath);
          if (postStats.size !== handleStats.size || postStats.mtimeMs !== handleStats.mtimeMs) {
            throw new AppError(
              "git_state_mismatch",
              `File ${normalized} was modified during copy`,
              409,
            );
          }

          const hash = createHash("sha256").update(fullBuf).digest("hex");

          const destPath = join(tempDir, normalized);
          await mkdir(dirname(destPath), { recursive: true });

          const destHandle = await open(destPath, "w");
          try {
            await destHandle.write(fullBuf);
            await destHandle.sync();
          } finally {
            await destHandle.close();
          }

          entries.push({
            path: normalized,
            sizeBytes: handleStats.size,
            sha256: hash,
          });

          totalBytes += handleStats.size;
        } finally {
          await handle.close();
        }
      }

      // Write manifest
      const sortedEntries = entries.sort((a, b) => a.path.localeCompare(b.path));
      const manifestJson = JSON.stringify(sortedEntries, null, 2);
      const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
      const manifestPath = join(tempDir, "manifest.json");

      const manifestHandle = await open(manifestPath, "w");
      try {
        await manifestHandle.write(manifestJson, 0, "utf8");
        await manifestHandle.sync();
      } finally {
        await manifestHandle.close();
      }

      // Generate UUIDv4 deterministically
      const payload = {
        projectId,
        sourceBranch: inspection.branch,
        sourceHead: inspection.head,
        selectedPaths: normalizedPaths.sort(),
        entryHashes: entries.map((e) => e.sha256).sort(),
      };
      const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest();
      const uuidBytes = Buffer.from(payloadHash.slice(0, 16));
      uuidBytes[6] = (uuidBytes[6]! & 0x0f) | 0x40;
      uuidBytes[8] = (uuidBytes[8]! & 0x3f) | 0x80;

      const snapshotId = [
        uuidBytes.toString("hex", 0, 4),
        uuidBytes.toString("hex", 4, 6),
        uuidBytes.toString("hex", 6, 8),
        uuidBytes.toString("hex", 8, 10),
        uuidBytes.toString("hex", 10, 16),
      ].join("-");

      // Check if snapshot row already exists and verify directory
      const existing = this.projects.getContextSnapshot(snapshotId);
      if (existing) {
        try {
          const stats = await lstat(existing.directoryPath);
          if (stats.isDirectory()) {
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
            return existing;
          }
        } catch {
          // Directory is missing, rename the new one and reuse the record
        }
      }

      const finalDir = join(this.contextsRoot, projectId, snapshotId).replaceAll("\\", "/");
      await mkdir(dirname(finalDir), { recursive: true });

      try {
        await rename(tempDir, finalDir);
      } catch (err) {
        // If rename failed because of uniqueness race, return the existing
        const existingRecord = this.projects.getContextSnapshot(snapshotId);
        if (existingRecord) {
          await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
          return existingRecord;
        }
        throw err;
      }

      const snapshot: ContextSnapshot = {
        id: snapshotId,
        projectId,
        sourceBranch: inspection.branch,
        sourceHead: inspection.head,
        manifestHash,
        entries: sortedEntries,
        excluded: excluded.sort((a, b) => a.path.localeCompare(b.path)),
        createdAt: new Date().toISOString(),
      };

      this.projects.saveContextSnapshot(snapshot, finalDir);
      return snapshot;
    } catch (err) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  get(snapshotId: string): ContextSnapshot | null {
    return this.projects.getContextSnapshot(snapshotId);
  }

  async materializeDisposable(snapshotId: string, requestId: string): Promise<DisposableContext> {
    const snapshot = this.projects.getContextSnapshot(snapshotId);
    if (!snapshot) throw new AppError("snapshot_not_found", "Snapshot not found", 404);

    const destDir = join(this.tempRoot, "consultations", requestId).replaceAll("\\", "/");
    await mkdir(destDir, { recursive: true });

    try {
      for (const entry of snapshot.entries) {
        const srcPath = join(snapshot.directoryPath, entry.path);
        const destPath = join(destDir, entry.path);
        await mkdir(dirname(destPath), { recursive: true });
        const content = await readFile(srcPath);
        await writeFile(destPath, content);
      }

      const verifyUnchanged = async () => {
        const currentEntries: { path: string; sizeBytes: number; sha256: string }[] = [];
        const files = await getFilesRecursive(destDir);
        for (const file of files) {
          const rel = relative(destDir, file).replaceAll("\\", "/");
          if (rel === "manifest.json") continue;
          const data = await readFile(file);
          const hash = createHash("sha256").update(data).digest("hex");
          currentEntries.push({ path: rel, sizeBytes: data.length, sha256: hash });
        }

        const sorted = currentEntries.sort((a, b) => a.path.localeCompare(b.path));
        const currentManifestJson = JSON.stringify(sorted, null, 2);
        const currentHash = createHash("sha256").update(currentManifestJson).digest("hex");
        if (currentHash !== snapshot.manifestHash) {
          throw new AppError(
            "policy_violation",
            "Read-only provider changed its disposable context",
            409,
          );
        }
      };

      const dispose = async () => {
        await rm(destDir, { recursive: true, force: true }).catch(() => undefined);
      };

      return {
        path: destDir,
        baselineHash: snapshot.manifestHash,
        verifyUnchanged,
        dispose,
      };
    } catch (err) {
      await rm(destDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  }

  async verifyUnchanged(snapshotId: string, signal: AbortSignal): Promise<void> {
    const snapshot = this.projects.getContextSnapshot(snapshotId);
    if (!snapshot) throw new AppError("snapshot_not_found", "Snapshot not found", 404);

    const project = this.projects.getProject(snapshot.projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);

    const inspection = await this.repositories.inspect(project.rootPath, signal);

    if (inspection.branch !== snapshot.sourceBranch) {
      throw new AppError(
        "git_state_mismatch",
        `Current branch is ${inspection.branch}, expected ${snapshot.sourceBranch}`,
        409,
      );
    }

    if (inspection.head !== snapshot.sourceHead) {
      throw new AppError(
        "git_state_mismatch",
        `Current HEAD is ${inspection.head}, expected ${snapshot.sourceHead}`,
        409,
      );
    }

    for (const entry of snapshot.entries) {
      const srcPath = join(project.rootPath, entry.path);
      let content;
      try {
        content = await readFile(srcPath);
      } catch {
        throw new AppError(
          "git_state_mismatch",
          `File ${entry.path} has been deleted since snapshot`,
          409,
        );
      }

      const hash = createHash("sha256").update(content).digest("hex");
      if (hash !== entry.sha256) {
        throw new AppError(
          "git_state_mismatch",
          `File ${entry.path} has been modified since snapshot`,
          409,
        );
      }
    }
  }
}

async function realpathSafe(path: string): Promise<string> {
  return (await lstat(path)).isSymbolicLink()
    ? path.replaceAll("\\", "/")
    : (await import("node:fs/promises").then((fs) => fs.realpath(path))).replaceAll("\\", "/");
}
