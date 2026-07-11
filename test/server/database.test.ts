import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/server/db/database.js";
import { SqliteRunStore } from "../../src/server/db/run-store.js";
import { withTempDir } from "../helpers/temp.js";

describe("database", () => {
  it("applies migration 1 with foreign keys and WAL", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      expect(db.pragma("user_version", { simple: true })).toBe(1);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
      const names = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(names).toContain("runs");
      expect(names).toContain("events");
      db.close();
    });
  });

  it("persists an event before returning it", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      const store = new SqliteRunStore(db);
      const event = store.appendEvent({
        runId: null,
        kind: "run.created",
        actorId: null,
        taskId: null,
        payload: { projectId: "00000000-0000-4000-8000-000000000001" },
        createdAt: "2026-07-11T00:00:00.000Z",
      });
      expect(event.sequence).toBe(1);
      expect(store.listEvents(null, 0)).toEqual([event]);
      db.close();
    });
  });
});
