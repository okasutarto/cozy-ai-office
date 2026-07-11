import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore } from "../../src/server/artifacts/store.js";
import { openDatabase } from "../../src/server/db/database.js";
import { withTempDir } from "../helpers/temp.js";

describe("ArtifactStore", () => {
  it("redacts, hashes, atomically renames, and registers a text artifact", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      const store = new ArtifactStore(db, join(dir, "artifacts"));
      const artifact = await store.writeText({
        runId: null,
        taskId: null,
        kind: "provider.stdout",
        text: "Authorization: Bearer do-not-store",
      });
      const absolutePath = join(dir, "artifacts", artifact.relativePath);
      expect(await readFile(absolutePath, "utf8")).toContain("[REDACTED]");
      await expect(access(`${absolutePath}.tmp`)).rejects.toThrow();
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
      db.close();
    });
  });
});
