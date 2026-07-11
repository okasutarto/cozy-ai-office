import type Database from "better-sqlite3";
import {
  type EventKind,
  type ProfileId,
  type RunEvent,
  RunEventSchema,
  type RunSnapshot,
  RunSnapshotSchema,
  type RunState,
  type TaskBrief,
} from "../../shared/contracts.js";

export type NewEvent = {
  runId: string | null;
  kind: EventKind;
  actorId: ProfileId | null;
  taskId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type NewRunRecord = {
  id: string;
  projectId: string;
  draftId: string;
  draftVersion: number;
  draftHash: string;
  contextSnapshotId: string;
  contextHash: string;
  baseBranch: string;
  baseCommit: string;
  integrationBranch: string;
  integrationWorktree: string;
  state: RunState;
  dispatchPaused: boolean;
  blockReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskPatch = {
  status?: "queued" | "running" | "completed" | "failed" | "blocked";
  assignedProfileId?: ProfileId | null;
  branchName?: string | null;
  worktreePath?: string | null;
  commitSha?: string | null;
  resultArtifactId?: string | null;
};

export interface RunStore {
  transaction<T>(work: () => T): T;
  createRun(input: NewRunRecord): void;
  getRun(id: string): RunSnapshot | null;
  listActiveRuns(): RunSnapshot[];
  setRunState(id: string, state: RunState, blockReason: string | null): void;
  setDispatchPaused(id: string, paused: boolean): void;
  insertTasks(runId: string, tasks: TaskBrief[]): void;
  updateTask(runId: string, taskId: string, patch: TaskPatch): void;
  appendEvent(event: NewEvent): RunEvent;
  listEvents(runId: string | null, afterSequence: number): RunEvent[];
  markRunningAttemptsInterrupted(): number;
}

export class SqliteRunStore implements RunStore {
  constructor(private db: Database.Database) {}

  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  createRun(input: NewRunRecord): void {
    this.db
      .prepare(
        "INSERT INTO runs (id, project_id, draft_id, draft_version, draft_hash, context_snapshot_id, context_hash, base_branch, base_commit, integration_branch, integration_worktree, state, dispatch_paused, block_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        input.id,
        input.projectId,
        input.draftId,
        input.draftVersion,
        input.draftHash,
        input.contextSnapshotId,
        input.contextHash,
        input.baseBranch,
        input.baseCommit,
        input.integrationBranch,
        input.integrationWorktree,
        input.state,
        input.dispatchPaused ? 1 : 0,
        input.blockReason,
        input.createdAt,
        input.updatedAt,
      );
  }

  getRun(id: string): RunSnapshot | null {
    const run = this.db
      .prepare(
        "SELECT id, project_id as projectId, state, dispatch_paused as dispatchPaused, base_branch as baseBranch, base_commit as baseCommit, draft_id as draftId, draft_version as draftVersion, block_reason as blockReason, created_at as createdAt, updated_at as updatedAt FROM runs WHERE id = ?",
      )
      .get(id) as any;
    if (!run) return null;

    const tasksRows = this.db
      .prepare(
        "SELECT id, brief_json, status, assigned_profile_id, commit_sha FROM tasks WHERE run_id = ?",
      )
      .all(id) as any[];

    const eventRow = this.db
      .prepare("SELECT MAX(sequence) as max_seq FROM events WHERE run_id = ?")
      .get(id) as { max_seq: number | null } | undefined;
    const latestEventSequence = eventRow?.max_seq ?? 0;

    const tasks = tasksRows.map((row) => {
      const brief = JSON.parse(row.brief_json);
      return {
        ...brief,
        status: row.status,
        assignedProfileId: row.assigned_profile_id,
        commitSha: row.commit_sha,
      };
    });

    return RunSnapshotSchema.parse({
      id: run.id,
      projectId: run.projectId,
      state: run.state,
      dispatchPaused: run.dispatchPaused === 1,
      baseBranch: run.baseBranch,
      baseCommit: run.baseCommit,
      draftId: run.draftId,
      draftVersion: run.draftVersion,
      tasks,
      latestEventSequence,
      blockReason: run.blockReason,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    });
  }

  listActiveRuns(): RunSnapshot[] {
    const rows = this.db
      .prepare(
        "SELECT id FROM runs WHERE state NOT IN ('applied', 'failed', 'blocked', 'cancelled')",
      )
      .all() as { id: string }[];
    return rows.map((r) => this.getRun(r.id)!).filter(Boolean);
  }

  setRunState(id: string, state: RunState, blockReason: string | null): void {
    this.db
      .prepare("UPDATE runs SET state = ?, block_reason = ?, updated_at = ? WHERE id = ?")
      .run(state, blockReason, new Date().toISOString(), id);
  }

  setDispatchPaused(id: string, paused: boolean): void {
    this.db
      .prepare("UPDATE runs SET dispatch_paused = ?, updated_at = ? WHERE id = ?")
      .run(paused ? 1 : 0, new Date().toISOString(), id);
  }

  insertTasks(runId: string, tasks: TaskBrief[]): void {
    this.db.transaction(() => {
      const insert = this.db.prepare(
        "INSERT INTO tasks (run_id, id, brief_json, status, assigned_profile_id, branch_name, worktree_path, commit_sha, result_artifact_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      tasks.forEach((t) => {
        insert.run(runId, t.id, JSON.stringify(t), "queued", null, null, null, null, null);
      });
    })();
  }

  updateTask(runId: string, taskId: string, patch: TaskPatch): void {
    const keys = Object.keys(patch) as (keyof TaskPatch)[];
    if (keys.length === 0) {
      throw new Error("Empty patch");
    }
    const columnMap: Record<keyof TaskPatch, string> = {
      status: "status",
      assignedProfileId: "assigned_profile_id",
      branchName: "branch_name",
      worktreePath: "worktree_path",
      commitSha: "commit_sha",
      resultArtifactId: "result_artifact_id",
    };

    const sets: string[] = [];
    const values: any[] = [];
    for (const key of keys) {
      const col = columnMap[key];
      if (!col) {
        throw new Error(`Invalid patch key ${key}`);
      }
      sets.push(`${col} = ?`);
      values.push(patch[key] === undefined ? null : patch[key]);
    }
    values.push(runId, taskId);

    const query = `UPDATE tasks SET ${sets.join(", ")} WHERE run_id = ? AND id = ?`;
    this.db.prepare(query).run(...values);
  }

  appendEvent(event: NewEvent): RunEvent {
    const res = this.db
      .prepare(
        "INSERT INTO events (run_id, kind, actor_id, task_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        event.runId,
        event.kind,
        event.actorId,
        event.taskId,
        JSON.stringify(event.payload),
        event.createdAt,
      );
    const sequence = Number(res.lastInsertRowid);
    return RunEventSchema.parse({
      sequence,
      runId: event.runId,
      kind: event.kind,
      actorId: event.actorId,
      taskId: event.taskId,
      payload: event.payload,
      createdAt: event.createdAt,
    });
  }

  listEvents(runId: string | null, afterSequence: number): RunEvent[] {
    let rows: any[];
    if (runId === null) {
      rows = this.db
        .prepare(
          "SELECT sequence, run_id as runId, kind, actor_id as actorId, task_id as taskId, payload_json, created_at as createdAt FROM events WHERE run_id IS NULL AND sequence > ? ORDER BY sequence ASC",
        )
        .all(afterSequence);
    } else {
      rows = this.db
        .prepare(
          "SELECT sequence, run_id as runId, kind, actor_id as actorId, task_id as taskId, payload_json, created_at as createdAt FROM events WHERE run_id = ? AND sequence > ? ORDER BY sequence ASC",
        )
        .all(runId, afterSequence);
    }

    return rows.map((row) =>
      RunEventSchema.parse({
        sequence: row.sequence,
        runId: row.runId,
        kind: row.kind,
        actorId: row.actorId,
        taskId: row.taskId,
        payload: JSON.parse(row.payload_json),
        createdAt: row.createdAt,
      }),
    );
  }

  markRunningAttemptsInterrupted(): number {
    const res = this.db
      .prepare("UPDATE attempts SET status = 'interrupted', ended_at = ? WHERE status = 'running'")
      .run(new Date().toISOString());
    return res.changes;
  }
}
