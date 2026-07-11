import type Database from "better-sqlite3";
import type { TaskDraftVersion } from "../../shared/contracts.js";

export type ConversationRecord = {
  id: string;
  projectId: string;
  role: string;
  profileId: string;
  contextSnapshotId: string;
  runId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  sender: string;
  body: string;
  sourceMessageIds: string[];
  artifactIds: string[];
  createdAt: string;
};

export interface ConversationStore {
  createConversation(record: ConversationRecord): ConversationRecord;
  getConversation(id: string): ConversationRecord | null;
  listConversations(projectId: string): ConversationRecord[];
  appendMessage(record: MessageRecord): MessageRecord;
  listMessages(conversationId: string): MessageRecord[];
  createDraft(projectId: string, version: TaskDraftVersion): TaskDraftVersion;
  appendDraftVersion(version: TaskDraftVersion): TaskDraftVersion;
  getDraftVersion(draftId: string, version?: number): TaskDraftVersion | null;
  markDraftRunning(draftId: string): void;
}

export class SqliteConversationStore implements ConversationStore {
  constructor(private db: Database.Database) {}

  createConversation(record: ConversationRecord): ConversationRecord {
    this.db
      .prepare(
        "INSERT INTO conversations (id, project_id, role, profile_id, context_snapshot_id, run_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        record.id,
        record.projectId,
        record.role,
        record.profileId,
        record.contextSnapshotId,
        record.runId,
        record.title,
        record.createdAt,
        record.updatedAt,
      );
    return record;
  }

  getConversation(id: string): ConversationRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, project_id as projectId, role, profile_id as profileId, context_snapshot_id as contextSnapshotId, run_id as runId, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE id = ?",
      )
      .get(id) as ConversationRecord | undefined;
    return row ?? null;
  }

  listConversations(projectId: string): ConversationRecord[] {
    const rows = this.db
      .prepare(
        "SELECT id, project_id as projectId, role, profile_id as profileId, context_snapshot_id as contextSnapshotId, run_id as runId, title, created_at as createdAt, updated_at as updatedAt FROM conversations WHERE project_id = ? ORDER BY updated_at DESC",
      )
      .all(projectId) as ConversationRecord[];
    return rows;
  }

  appendMessage(record: MessageRecord): MessageRecord {
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO messages (id, conversation_id, sender, body, source_message_ids_json, artifact_ids_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          record.id,
          record.conversationId,
          record.sender,
          record.body,
          JSON.stringify(record.sourceMessageIds),
          JSON.stringify(record.artifactIds),
          record.createdAt,
        );

      this.db
        .prepare("UPDATE conversations SET updated_at = ? WHERE id = ?")
        .run(record.createdAt, record.conversationId);
    })();
    return record;
  }

  listMessages(conversationId: string): MessageRecord[] {
    const rows = this.db
      .prepare(
        "SELECT id, conversation_id as conversationId, sender, body, source_message_ids_json, artifact_ids_json, created_at as createdAt FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
      )
      .all(conversationId) as any[];

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      sender: row.sender,
      body: row.body,
      sourceMessageIds: JSON.parse(row.source_message_ids_json),
      artifactIds: JSON.parse(row.artifact_ids_json),
      createdAt: row.createdAt,
    }));
  }

  createDraft(projectId: string, version: TaskDraftVersion): TaskDraftVersion {
    this.db.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO drafts (id, project_id, current_version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(version.draftId, projectId, 1, "draft", version.createdAt, version.createdAt);

      this.db
        .prepare(
          "INSERT INTO draft_versions (draft_id, version, objective, scope_json, constraints_json, acceptance_json, context_snapshot_id, source_message_ids_json, sha256, created_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          version.draftId,
          version.objective,
          JSON.stringify(version.scope),
          JSON.stringify(version.constraints),
          JSON.stringify(version.acceptanceCriteria),
          version.contextSnapshotId,
          JSON.stringify(version.sourceMessageIds),
          version.sha256,
          version.createdAt,
        );
    })();
    return version;
  }

  appendDraftVersion(version: TaskDraftVersion): TaskDraftVersion {
    return this.db.transaction(() => {
      const draft = this.db
        .prepare("SELECT current_version FROM drafts WHERE id = ?")
        .get(version.draftId) as { current_version: number } | undefined;
      if (!draft) {
        throw new Error(`Draft ${version.draftId} not found`);
      }
      if (draft.current_version !== version.version - 1) {
        throw new Error(
          `Draft version mismatch: expected ${version.version - 1}, found ${draft.current_version}`,
        );
      }
      this.db
        .prepare(
          "INSERT INTO draft_versions (draft_id, version, objective, scope_json, constraints_json, acceptance_json, context_snapshot_id, source_message_ids_json, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          version.draftId,
          version.version,
          version.objective,
          JSON.stringify(version.scope),
          JSON.stringify(version.constraints),
          JSON.stringify(version.acceptanceCriteria),
          version.contextSnapshotId,
          JSON.stringify(version.sourceMessageIds),
          version.sha256,
          version.createdAt,
        );
      this.db
        .prepare("UPDATE drafts SET current_version = ?, updated_at = ? WHERE id = ?")
        .run(version.version, version.createdAt, version.draftId);
      return version;
    })();
  }

  getDraftVersion(draftId: string, version?: number): TaskDraftVersion | null {
    let v = version;
    if (v === undefined) {
      const draft = this.db
        .prepare("SELECT current_version FROM drafts WHERE id = ?")
        .get(draftId) as { current_version: number } | undefined;
      if (!draft) return null;
      v = draft.current_version;
    }
    const row = this.db
      .prepare(
        "SELECT draft_id, version, objective, scope_json, constraints_json, acceptance_json, context_snapshot_id, source_message_ids_json, sha256, created_at FROM draft_versions WHERE draft_id = ? AND version = ?",
      )
      .get(draftId, v) as any;
    if (!row) return null;
    return {
      draftId: row.draft_id,
      version: row.version,
      objective: row.objective,
      scope: JSON.parse(row.scope_json),
      constraints: JSON.parse(row.constraints_json),
      acceptanceCriteria: JSON.parse(row.acceptance_json),
      contextSnapshotId: row.context_snapshot_id,
      sourceMessageIds: JSON.parse(row.source_message_ids_json),
      sha256: row.sha256,
      createdAt: row.created_at,
    };
  }

  markDraftRunning(draftId: string): void {
    this.db.prepare("UPDATE drafts SET status = 'running' WHERE id = ?").run(draftId);
  }
}
