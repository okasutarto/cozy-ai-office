import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { MIGRATION_1 } from "./migration.js";

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > 1) {
    db.close();
    throw new Error(`Database version ${version} is newer than supported version 1`);
  }
  if (version === 0) {
    db.transaction(() => {
      db.exec(MIGRATION_1);
      db.pragma("user_version = 1");
    })();
  }
  return db;
}
