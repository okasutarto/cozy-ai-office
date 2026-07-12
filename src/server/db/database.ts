import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { ProviderStatusSchema, RoleProfileSchema } from "../../shared/contracts.js";
import type { ProviderStatus, RoleProfile } from "../../shared/contracts.js";
import { evaluateSetupReadiness } from "../projects/setup.js";
import { MIGRATION_1, MIGRATION_2 } from "./migration.js";

const SUPPORTED_DATABASE_VERSION = 2;

function backfillLegacySetupCompletion(db: Database.Database): void {
  const providerStatuses = (
    db
      .prepare(
        "SELECT provider, installed, authenticated, version, models_json, capabilities_json, diagnostic, checked_at FROM provider_status",
      )
      .all() as any[]
  ).flatMap((row): ProviderStatus[] => {
    try {
      const parsed = ProviderStatusSchema.safeParse({
        provider: row.provider,
        installed: row.installed === 1,
        authenticated: row.authenticated === 1,
        version: row.version,
        models: JSON.parse(row.models_json),
        capabilities: JSON.parse(row.capabilities_json),
        diagnostic: row.diagnostic,
        checkedAt: row.checked_at,
      });
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });

  const projects = db.prepare("SELECT id FROM projects").all() as Array<{ id: string }>;
  const commandCountStatement = db.prepare(
    "SELECT COUNT(*) AS count FROM command_specs WHERE project_id = ?",
  );
  const profileStatement = db.prepare(
    "SELECT profile_id, role, label, provider_chain_json, timeout_ms, prompt_version FROM role_profiles WHERE project_id = ?",
  );
  const snapshotStatement = db.prepare(
    "SELECT id FROM context_snapshots WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
  );
  const markCompleteStatement = db.prepare("UPDATE projects SET setup_complete = 1 WHERE id = ?");

  for (const project of projects) {
    const commandCount =
      (commandCountStatement.get(project.id) as { count: number } | undefined)?.count ?? 0;
    const profiles = (profileStatement.all(project.id) as any[]).flatMap((row): RoleProfile[] => {
      try {
        const parsed = RoleProfileSchema.safeParse({
          id: row.profile_id,
          role: row.role,
          label: row.label,
          providerChain: JSON.parse(row.provider_chain_json),
          timeoutMs: row.timeout_ms,
          promptVersion: row.prompt_version,
        });
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
    const contextSnapshotId =
      (snapshotStatement.get(project.id) as { id: string } | undefined)?.id ?? null;
    const readiness = evaluateSetupReadiness({
      commandCount,
      profiles,
      contextSnapshotId,
      providerStatuses,
    });
    if (readiness.complete) markCompleteStatement.run(project.id);
  }
}

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  let version = db.pragma("user_version", { simple: true }) as number;
  if (version > SUPPORTED_DATABASE_VERSION) {
    db.close();
    throw new Error(
      `Database version ${version} is newer than supported version ${SUPPORTED_DATABASE_VERSION}`,
    );
  }
  if (version === 0) {
    db.transaction(() => {
      db.exec(MIGRATION_1);
      db.pragma("user_version = 1");
    })();
    version = 1;
  }
  if (version === 1) {
    db.transaction(() => {
      db.exec(MIGRATION_2);
      backfillLegacySetupCompletion(db);
      db.pragma("user_version = 2");
    })();
  }
  return db;
}
