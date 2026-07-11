import type Database from "better-sqlite3";
import {
  type CommandSpec,
  CommandSpecSchema,
  type ProviderStatus,
  ProviderStatusSchema,
  type RoleProfile,
  RoleProfileSchema,
  type ContextSnapshot,
  ContextSnapshotSchema,
} from "../../shared/contracts.js";

export type ProjectRecord = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export interface ProjectStore {
  listProjects(): ProjectRecord[];
  getProject(id: string): ProjectRecord | null;
  getProjectByPath(rootPath: string): ProjectRecord | null;
  upsertProject(record: ProjectRecord): ProjectRecord;
  replaceCommands(projectId: string, commands: CommandSpec[]): void;
  listCommands(projectId: string): CommandSpec[];
  replaceRoleProfiles(projectId: string, profiles: RoleProfile[]): void;
  listRoleProfiles(projectId: string): RoleProfile[];
  saveProviderStatus(status: ProviderStatus): void;
  listProviderStatuses(): ProviderStatus[];
  saveContextSnapshot(snapshot: ContextSnapshot, directoryPath: string): void;
  getContextSnapshot(id: string): (ContextSnapshot & { directoryPath: string }) | null;
}

export class SqliteProjectStore implements ProjectStore {
  constructor(public readonly db: Database.Database) {}

  listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare(
        "SELECT id, name, root_path as rootPath, created_at as createdAt, updated_at as updatedAt FROM projects ORDER BY updated_at DESC",
      )
      .all() as ProjectRecord[];
    return rows;
  }

  getProject(id: string): ProjectRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, name, root_path as rootPath, created_at as createdAt, updated_at as updatedAt FROM projects WHERE id = ?",
      )
      .get(id) as ProjectRecord | undefined;
    return row ?? null;
  }

  getProjectByPath(rootPath: string): ProjectRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, name, root_path as rootPath, created_at as createdAt, updated_at as updatedAt FROM projects WHERE root_path = ?",
      )
      .get(rootPath) as ProjectRecord | undefined;
    return row ?? null;
  }

  upsertProject(record: ProjectRecord): ProjectRecord {
    this.db
      .prepare(
        "INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, root_path = excluded.root_path, updated_at = excluded.updated_at",
      )
      .run(record.id, record.name, record.rootPath, record.createdAt, record.updatedAt);
    return record;
  }

  replaceCommands(projectId: string, commands: CommandSpec[]): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM command_specs WHERE project_id = ?").run(projectId);
      const insert = this.db.prepare(
        "INSERT INTO command_specs (id, project_id, label, executable, args_json, required, timeout_ms, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      commands.forEach((cmd, index) => {
        insert.run(
          cmd.id,
          projectId,
          cmd.label,
          cmd.executable,
          JSON.stringify(cmd.args),
          cmd.required ? 1 : 0,
          cmd.timeoutMs,
          index,
        );
      });
    })();
  }

  listCommands(projectId: string): CommandSpec[] {
    const rows = this.db
      .prepare(
        "SELECT id, label, executable, args_json, required, timeout_ms FROM command_specs WHERE project_id = ? ORDER BY position",
      )
      .all(projectId) as any[];

    return rows.map((row) => {
      return CommandSpecSchema.parse({
        id: row.id,
        label: row.label,
        executable: row.executable,
        args: JSON.parse(row.args_json),
        cwd: ".",
        required: row.required === 1,
        timeoutMs: row.timeout_ms,
      });
    });
  }

  replaceRoleProfiles(projectId: string, profiles: RoleProfile[]): void {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM role_profiles WHERE project_id = ?").run(projectId);
      const insert = this.db.prepare(
        "INSERT INTO role_profiles (project_id, profile_id, role, label, provider_chain_json, timeout_ms, prompt_version) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      profiles.forEach((profile) => {
        insert.run(
          projectId,
          profile.id,
          profile.role,
          profile.label,
          JSON.stringify(profile.providerChain),
          profile.timeoutMs,
          profile.promptVersion,
        );
      });
    })();
  }

  listRoleProfiles(projectId: string): RoleProfile[] {
    const rows = this.db
      .prepare(
        "SELECT profile_id, role, label, provider_chain_json, timeout_ms, prompt_version FROM role_profiles WHERE project_id = ? ORDER BY profile_id",
      )
      .all(projectId) as any[];

    return rows.map((row) => {
      return RoleProfileSchema.parse({
        id: row.profile_id,
        role: row.role,
        label: row.label,
        providerChain: JSON.parse(row.provider_chain_json),
        timeoutMs: row.timeout_ms,
        promptVersion: row.prompt_version,
      });
    });
  }

  saveProviderStatus(status: ProviderStatus): void {
    this.db
      .prepare(
        "INSERT INTO provider_status (provider, installed, authenticated, version, models_json, capabilities_json, diagnostic, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET installed = excluded.installed, authenticated = excluded.authenticated, version = excluded.version, models_json = excluded.models_json, capabilities_json = excluded.capabilities_json, diagnostic = excluded.diagnostic, checked_at = excluded.checked_at",
      )
      .run(
        status.provider,
        status.installed ? 1 : 0,
        status.authenticated ? 1 : 0,
        status.version,
        JSON.stringify(status.models),
        JSON.stringify(status.capabilities),
        status.diagnostic,
        status.checkedAt,
      );
  }

  listProviderStatuses(): ProviderStatus[] {
    const rows = this.db
      .prepare(
        "SELECT provider, installed, authenticated, version, models_json, capabilities_json, diagnostic, checked_at FROM provider_status ORDER BY provider",
      )
      .all() as any[];

    return rows.map((row) => {
      return ProviderStatusSchema.parse({
        provider: row.provider,
        installed: row.installed === 1,
        authenticated: row.authenticated === 1,
        version: row.version,
        models: JSON.parse(row.models_json),
        capabilities: JSON.parse(row.capabilities_json),
        diagnostic: row.diagnostic,
        checkedAt: row.checked_at,
      });
    });
  }

  saveContextSnapshot(snapshot: ContextSnapshot, directoryPath: string): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO context_snapshots (id, project_id, source_branch, source_head, manifest_hash, directory_path, excluded_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          snapshot.id,
          snapshot.projectId,
          snapshot.sourceBranch,
          snapshot.sourceHead,
          snapshot.manifestHash,
          directoryPath,
          JSON.stringify(snapshot.excluded),
          snapshot.createdAt,
        );

      const insertEntry = this.db.prepare(
        "INSERT INTO context_entries (snapshot_id, relative_path, size_bytes, sha256) VALUES (?, ?, ?, ?)",
      );
      for (const entry of snapshot.entries) {
        insertEntry.run(snapshot.id, entry.path, entry.sizeBytes, entry.sha256);
      }
    })();
  }

  getContextSnapshot(id: string): (ContextSnapshot & { directoryPath: string }) | null {
    const row = this.db
      .prepare(
        "SELECT id, project_id as projectId, source_branch as sourceBranch, source_head as sourceHead, manifest_hash as manifestHash, directory_path as directoryPath, excluded_json as excludedJson, created_at as createdAt FROM context_snapshots WHERE id = ?",
      )
      .get(id) as any;
    if (!row) return null;

    const entriesRows = this.db
      .prepare(
        "SELECT relative_path as path, size_bytes as sizeBytes, sha256 FROM context_entries WHERE snapshot_id = ? ORDER BY relative_path ASC",
      )
      .all(id) as any[];

    return {
      id: row.id,
      projectId: row.projectId,
      sourceBranch: row.sourceBranch,
      sourceHead: row.sourceHead,
      manifestHash: row.manifestHash,
      directoryPath: row.directoryPath,
      entries: entriesRows.map((entry) => ({
        path: entry.path,
        sizeBytes: entry.sizeBytes,
        sha256: entry.sha256,
      })),
      excluded: JSON.parse(row.excludedJson),
      createdAt: row.createdAt,
    };
  }
}
