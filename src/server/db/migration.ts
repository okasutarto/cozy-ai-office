export const MIGRATION_1 = `
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE command_specs (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  executable TEXT NOT NULL,
  args_json TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms >= 1000),
  position INTEGER NOT NULL,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE role_profiles (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  provider_chain_json TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL,
  prompt_version TEXT NOT NULL,
  PRIMARY KEY (project_id, profile_id)
);

CREATE TABLE provider_status (
  provider TEXT PRIMARY KEY,
  installed INTEGER NOT NULL,
  authenticated INTEGER NOT NULL,
  version TEXT,
  models_json TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  diagnostic TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE context_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_branch TEXT NOT NULL,
  source_head TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  directory_path TEXT NOT NULL,
  excluded_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE context_entries (
  snapshot_id TEXT NOT NULL REFERENCES context_snapshots(id) ON DELETE CASCADE,
  relative_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, relative_path)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  context_snapshot_id TEXT NOT NULL REFERENCES context_snapshots(id),
  run_id TEXT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  source_message_ids_json TEXT NOT NULL,
  artifact_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  current_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE draft_versions (
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  objective TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  acceptance_json TEXT NOT NULL,
  context_snapshot_id TEXT NOT NULL REFERENCES context_snapshots(id),
  source_message_ids_json TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (draft_id, version)
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  draft_version INTEGER NOT NULL,
  draft_hash TEXT NOT NULL,
  context_snapshot_id TEXT NOT NULL REFERENCES context_snapshots(id),
  context_hash TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  base_commit TEXT NOT NULL,
  integration_branch TEXT NOT NULL,
  integration_worktree TEXT NOT NULL,
  state TEXT NOT NULL,
  dispatch_paused INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_paused IN (0, 1)),
  block_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  brief_json TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_profile_id TEXT,
  branch_name TEXT,
  worktree_path TEXT,
  commit_sha TEXT,
  result_artifact_id TEXT,
  PRIMARY KEY (run_id, id)
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  task_id TEXT,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  stage TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  process_id INTEGER,
  exit_code INTEGER,
  error_code TEXT,
  stdout_artifact_id TEXT,
  stderr_artifact_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  task_id TEXT,
  kind TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE advisor_reviews (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  gate TEXT NOT NULL,
  pass_number INTEGER NOT NULL CHECK (pass_number IN (1, 2)),
  verdict TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  created_at TEXT NOT NULL,
  UNIQUE (run_id, gate, pass_number)
);

CREATE TABLE qa_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  stdout_artifact_id TEXT REFERENCES artifacts(id),
  stderr_artifact_id TEXT REFERENCES artifacts(id),
  created_at TEXT NOT NULL
);

CREATE TABLE events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor_id TEXT,
  task_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX events_run_sequence ON events(run_id, sequence);
CREATE INDEX tasks_run_status ON tasks(run_id, status);
CREATE INDEX attempts_run_task ON attempts(run_id, task_id);
CREATE INDEX artifacts_run_task ON artifacts(run_id, task_id);
`;

export const MIGRATION_2 = `
ALTER TABLE projects
ADD COLUMN setup_complete INTEGER NOT NULL DEFAULT 0
CHECK (setup_complete IN (0, 1));
`;

export const MIGRATION_3 = `
CREATE TABLE office_layouts (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  layout_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
