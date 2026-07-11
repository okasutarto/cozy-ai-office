import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { StreamingRedactor } from "../security/redact.js";

export type ArtifactRecord = {
  id: string;
  runId: string | null;
  taskId: string | null;
  kind: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
};

export class ArtifactWriter {
  private readonly hash = createHash("sha256");
  private readonly redactor = new StreamingRedactor();
  private sizeBytes = 0;
  private truncated = false;
  private finalized = false;

  constructor(
    private readonly store: ArtifactStore,
    private readonly record: Omit<ArtifactRecord, "sha256" | "sizeBytes">,
    private readonly handle: FileHandle,
    private readonly tempPath: string,
    private readonly finalPath: string,
    private readonly maxBytes: number,
  ) {}

  async write(chunk: string): Promise<void> {
    if (this.finalized) throw new Error("ArtifactWriter is finalized");
    for (const redacted of this.redactor.push(chunk)) await this.writeRedacted(redacted);
  }

  private async writeAll(bytes: Buffer): Promise<void> {
    let offset = 0;
    while (offset < bytes.length) {
      const result = await this.handle.write(bytes, offset, bytes.length - offset, null);
      if (result.bytesWritten <= 0) throw new Error("Artifact write made no progress");
      offset += result.bytesWritten;
    }
  }

  private async writeRedacted(redacted: string): Promise<void> {
    if (this.truncated || !redacted) return;
    const remaining = this.maxBytes - this.sizeBytes;
    const bytes = Buffer.from(redacted);
    const accepted = bytes.subarray(0, Math.max(0, remaining));
    if (accepted.length > 0) {
      await this.writeAll(accepted);
      this.hash.update(accepted);
      this.sizeBytes += accepted.length;
    }
    if (accepted.length < bytes.length) {
      const marker = Buffer.from("\n[OUTPUT TRUNCATED]\n");
      await this.writeAll(marker);
      this.hash.update(marker);
      this.sizeBytes += marker.length;
      this.truncated = true;
    }
  }

  async finalize(): Promise<ArtifactRecord> {
    if (this.finalized) throw new Error("ArtifactWriter is finalized");
    this.finalized = true;
    for (const redacted of this.redactor.flush()) await this.writeRedacted(redacted);
    await this.handle.sync();
    await this.handle.close();
    await rename(this.tempPath, this.finalPath);
    return this.store.register({
      ...this.record,
      sha256: this.hash.digest("hex"),
      sizeBytes: this.sizeBytes,
    });
  }
}

export class ArtifactStore {
  constructor(
    private readonly db: Database.Database,
    readonly root: string,
  ) {}

  async createWriter(input: {
    runId: string | null;
    taskId: string | null;
    kind: string;
    extension?: string;
    maxBytes?: number;
  }): Promise<ArtifactWriter> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const extension = input.extension ?? "log";
    const finalPath = join(this.root, input.runId ?? "global", `${id}.${extension}`);
    await mkdir(dirname(finalPath), { recursive: true });
    const tempPath = `${finalPath}.tmp`;
    const handle = await open(tempPath, "wx");
    return new ArtifactWriter(
      this,
      {
        id,
        runId: input.runId,
        taskId: input.taskId,
        kind: input.kind,
        relativePath: relative(this.root, finalPath).replaceAll("\\", "/"),
        createdAt,
      },
      handle,
      tempPath,
      finalPath,
      input.maxBytes ?? 2 * 1024 * 1024,
    );
  }

  async writeText(input: {
    runId: string | null;
    taskId: string | null;
    kind: string;
    text: string;
  }): Promise<ArtifactRecord> {
    const writer = await this.createWriter(input);
    await writer.write(input.text);
    return writer.finalize();
  }

  async writeJson(input: {
    runId: string | null;
    taskId: string | null;
    kind: string;
    value: unknown;
  }): Promise<ArtifactRecord> {
    const writer = await this.createWriter({
      runId: input.runId,
      taskId: input.taskId,
      kind: input.kind,
      extension: "json",
    });
    await writer.write(`${JSON.stringify(input.value, null, 2)}\n`);
    return writer.finalize();
  }

  register(record: ArtifactRecord): ArtifactRecord {
    this.db
      .prepare(
        `INSERT INTO artifacts
        (id, run_id, task_id, kind, relative_path, sha256, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.runId,
        record.taskId,
        record.kind,
        record.relativePath,
        record.sha256,
        record.sizeBytes,
        record.createdAt,
      );
    return record;
  }
}
