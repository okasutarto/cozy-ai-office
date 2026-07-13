import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { openDatabase } from "../../src/server/db/database.js";
import { MIGRATION_1 } from "../../src/server/db/migration.js";
import { SqliteRunStore } from "../../src/server/db/run-store.js";
import { withTempDir } from "../helpers/temp.js";

describe("database", () => {
  it("applies migrations through version 3 with foreign keys and WAL", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      expect(db.pragma("user_version", { simple: true })).toBe(3);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
      const names = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(names).toContain("runs");
      expect(names).toContain("events");
      const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as Array<{
        name: string;
      }>;
      expect(projectColumns.map((column) => column.name)).toContain("setup_complete");
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

  it("backfills only legacy projects with a complete usable setup", async () => {
    await withTempDir(async (dir) => {
      const databasePath = join(dir, "legacy.db");
      const legacy = new Database(databasePath);
      legacy.pragma("foreign_keys = ON");
      legacy.exec(MIGRATION_1);
      legacy.pragma("user_version = 1");

      const configuredId = "00000000-0000-4000-8000-000000000101";
      const incompleteId = "00000000-0000-4000-8000-000000000102";
      const now = "2026-07-12T00:00:00.000Z";
      const insertProject = legacy.prepare(
        "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      );
      insertProject.run(configuredId, "configured", "/configured", now, now);
      insertProject.run(incompleteId, "incomplete", "/incomplete", now, now);
      legacy
        .prepare(
          "INSERT INTO command_specs (id, project_id, label, executable, args_json, required, timeout_ms, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("test", configuredId, "test", "npm", "[]", 1, 60_000, 0);

      const insertRole = legacy.prepare(
        "INSERT INTO role_profiles (project_id, profile_id, role, label, provider_chain_json, timeout_ms, prompt_version) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const rolePairs = [
        ["manager", "manager"],
        ["worker-1", "worker"],
        ["worker-2", "worker"],
        ["worker-3", "worker"],
        ["worker-4", "worker"],
        ["advisor", "advisor"],
        ["qa", "qa"],
      ] as const;
      for (const [profileId, role] of rolePairs) {
        insertRole.run(
          configuredId,
          profileId,
          role,
          profileId,
          JSON.stringify([{ provider: "codex", model: null }]),
          60_000,
          `${role}-v1`,
        );
      }
      legacy
        .prepare(
          "INSERT INTO context_snapshots (id, project_id, source_branch, source_head, manifest_hash, directory_path, excluded_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "00000000-0000-4000-8000-000000000103",
          configuredId,
          "main",
          "a".repeat(40),
          "b".repeat(64),
          "/contexts/configured",
          "[]",
          now,
        );
      legacy
        .prepare(
          "INSERT INTO provider_status (provider, installed, authenticated, version, models_json, capabilities_json, diagnostic, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          "codex",
          1,
          1,
          "1.0.0",
          "[]",
          JSON.stringify({ nonInteractive: true, readOnly: true, worktreeWrite: true }),
          null,
          now,
        );
      legacy.close();

      const migrated = openDatabase(databasePath);
      expect(migrated.pragma("user_version", { simple: true })).toBe(3);
      const projects = migrated
        .prepare("SELECT id, setup_complete AS setupComplete FROM projects ORDER BY id")
        .all() as Array<{ id: string; setupComplete: number }>;
      expect(projects).toEqual([
        { id: configuredId, setupComplete: 1 },
        { id: incompleteId, setupComplete: 0 },
      ]);
      migrated.close();
    });
  });
});
