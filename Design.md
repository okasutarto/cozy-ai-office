# Cozy Agent Office v0.1 Design

**Status:** Approved  
**Date:** 2026-07-11  
**Working product name:** Cozy Agent Office

## 1. Summary

Cozy Agent Office is a local-first, open-source coding-agent orchestrator with a polished original pixel-art office interface. A user starts one local Node.js command, which serves a React/PixiJS browser application and coordinates subscription-authenticated Codex CLI, Claude Code, and Antigravity CLI processes against a selected local Git repository.

The formal roles are Manager, Worker, Tech Lead, and QA. Roles are independent from providers and supported models. The Manager plans and synthesizes, the automatic workflow invokes the Tech Lead only before execution and before delivery, Workers perform bounded tasks in isolated Git worktrees, and QA combines deterministic repository commands with an optional model-generated diagnostic report. The Owner may also open a clearly labeled read-only Tech Lead consultation outside a run. No API key, hosted backend, Mastra runtime, Electron wrapper, vector database, or copied game asset is part of v0.1.

## 2. Goals

1. Run locally from one command and open the browser automatically.
2. Support Codex CLI, Claude Code, and Antigravity CLI through their official subscription-authenticated command-line interfaces.
3. Let the user assign a capability-compatible provider, supported model, and ordered fallback chain independently to Manager, Tech Lead, QA, and each of four Worker profiles.
4. Execute a deterministic workflow:

   ```text
   Request
   → Manager planning
   → Tech Lead preflight
   → Hybrid parallel workers
   → Integration
   → Deterministic QA
   → Tech Lead delivery review
   → Manager synthesis
   → User-controlled apply
   ```

5. Permit parallel writes only when path ownership is disjoint; serialize overlapping writes.
6. Keep every writer out of the root repository by using isolated Git worktrees.
7. Never mutate the root repository until the user explicitly selects **Apply to Project**.
8. Persist workflow state, attempts, events, provider status, and role configuration in SQLite so interrupted runs remain inspectable.
9. Present the live workflow as a polished, cozy, original pixel-art office with seven character presets and deterministic event-to-animation mapping.
10. Ship tests that exercise the complete workflow without real provider credentials.

## 3. Non-goals

- Hosted SaaS or multi-user operation.
- API-key-based provider calls.
- Electron, Tauri, mobile, or browser-extension packaging.
- Mastra, LangGraph, CrewAI, or a general-purpose DAG/plugin engine.
- Arbitrary third-party provider plugins.
- Layout editing or character creation.
- Vector embeddings, semantic memory, or remote databases.
- Automatic pull requests, pushes, or remote Git mutations.
- Running untrusted repositories as if a Git worktree were an operating-system sandbox.
- Characters, names, portraits, maps, palettes, animations, sounds, or other assets copied from Stardew Valley, Pixel Agents, or any other proprietary game or project.

## 4. Runtime and Technology Boundaries

### 4.1 Runtime

- Node.js 24 LTS is the minimum runtime.
- TypeScript uses strict mode throughout the server, shared contracts, and web application.
- Production mode uses one Node.js process. It serves the built frontend, HTTP API, and WebSocket endpoint, and supervises provider and QA child processes.
- Development mode may use a Vite development process plus the Node.js backend, hidden behind one `npm run dev` command.
- The production server binds only to an ephemeral port on `127.0.0.1` and opens the system browser after startup.

### 4.2 Web application

- React 19 renders forms, panels, dialogs, task boards, logs, diffs, approvals, and accessibility surfaces.
- PixiJS 8 directly renders the office map, sprites, movement, emotes, selection, and short speech bubbles.
- PixiJS remains an imperative rendering island inside one React component; `@pixi/react` is excluded from v0.1.
- Vite 8 builds the browser application into static assets served by the local Node.js backend.

### 4.3 Server and persistence

- Fastify 5 hosts static assets, JSON API routes, and the authenticated WebSocket endpoint.
- Zod validates every HTTP payload, persisted structured artifact, provider result, and WebSocket event.
- SQLite is the canonical structured store. A stable SQLite package is used instead of Node's release-candidate `node:sqlite` module.
- Large artifacts are stored as files, with metadata and checksums stored in SQLite.
- The Node.js standard `child_process.spawn` API starts providers and QA commands with `shell: false`.

## 5. Product Architecture

```text
Browser
├── React application
└── PixiJS office scene
        │
        │ authenticated HTTP + WebSocket
        ▼
Local Node.js server
├── static frontend server
├── API controller
├── normalized event stream
├── deterministic orchestrator
├── role configuration service
├── provider adapters
│   ├── Codex CLI
│   ├── Claude Code
│   └── Antigravity CLI
├── process supervisor
├── Git/worktree service
├── integration service
├── QA command runner
├── SQLite repositories
└── artifact store
```

The browser is never authoritative for workflow state. The PixiJS office is a projection of normalized backend events. Closing or reloading the browser does not stop a run. The Node.js process owns workflow state, child-process lifecycles, Git operations, persistence, and recovery.

## 6. Component Responsibilities

### 6.1 Local server

- Selects a free loopback port.
- Generates a cryptographically random session token for each server start.
- Opens the browser with the token in the URL fragment.
- The browser moves the token to `sessionStorage`, removes it from the visible URL, and uses it in an authorization header and WebSocket connection.
- Rejects requests without a valid token.
- Rejects browser origins other than its exact loopback origin.
- Serves the production frontend and API from the same origin.
- Exposes no route that accepts an arbitrary shell command.

### 6.2 Deterministic orchestrator

The orchestrator is ordinary TypeScript, not an AI framework. It owns the finite workflow state machine and calls model-backed roles only at explicit stages. It must reject illegal state transitions rather than attempt to infer intent.

Canonical run states:

```text
planned
advisor_preflight
dispatching
working
integrating
integration_conflict
testing
advisor_delivery
ready_to_apply
applied
failed
blocked
cancelled
```

Terminal states are `applied`, `failed`, `blocked`, and `cancelled`. `ready_to_apply` is durable but non-terminal because the user may still apply or cancel the result.

### 6.3 Role configuration service

Manager, Tech Lead, and QA each have one role profile. Worker has four named profiles so different workers may use different providers and models concurrently. Each profile stores:

- Primary provider.
- Selected model when the provider exposes model selection.
- Ordered fallback providers and optional fallback models.
- Timeout.
- Role-specific prompt version.
- Maximum attempts defined by this design.

The configuration UI offers only providers whose probed capabilities can satisfy the profile's possible work. Manager, Tech Lead, and QA always require read-only capability. Worker capability is resolved per brief after planning: the scheduler filters that Worker's ordered provider chain by `readOnly` or `worktreeWrite`, skips incompatible candidates without creating or consuming an attempt, and blocks before launch only when no compatible candidate remains. It never silently weakens permissions.

The four roles are:

The human user is the **Owner**. Owner is an authority level, not a model-backed role. Only the Owner may control a run or authorize final application to the root working tree.

#### Manager

- Reads repository context and user objective.
- Produces a structured plan and worker briefs.
- Labels each worker task `read_only` or `write`.
- Supplies allowed and forbidden paths for every writer.
- Produces final delivery synthesis after Tech Lead and QA complete.
- Does not write source files.

#### Worker

- Receives one bounded task brief.
- Runs read-only against an application-controlled context snapshot or writes only inside its assigned worktree.
- Cannot expand task scope or allowed paths.
- Produces a structured result with summary, findings, changed files, verification, risks, and completion status.

#### Tech Lead

- Defines exactly two automatic gate types: preflight before worker execution and delivery review before Manager synthesis. Each gate type is entered at most once per run, and every run that reaches Manager synthesis must pass both.
- Each gate permits one initial review and, only after a rejected artifact is revised or repaired, one final review. Optional direct consultations occur outside the workflow and do not change run state.
- May reject a plan once and request one revision.
- May reject a delivery once and request one repair cycle.
- Never edits files.
- Cannot override failed required QA commands.

#### QA

- Runs configured deterministic commands and treats their exit codes as authoritative.
- May invoke its selected provider to summarize failures and recommend repairs.
- Cannot convert a failing required command into a pass.
- Produces a structured QA report with command, exit code, duration, bounded output, and diagnosis.

### 6.4 Owner and role interaction

Manager is the Owner's default contact. General project discussion, requirements, scope, priorities, status questions, and new work all enter through Manager. The application opens project conversations on Manager unless the Owner explicitly selects another character.

The conversation workflow has three explicit modes:

1. **Discussion** — Manager may inspect approved repository context read-only and answer questions. No run is created, no files change, and no worker is dispatched.
2. **Draft Task** — Manager converts selected conversation messages into an editable structured draft containing objective, scope, constraints, and acceptance criteria. Creating or editing a draft does not execute it.
3. **Execution** — A run is created only after the Owner presses **Start Execution** on a reviewed draft.

Clicking an office character opens a direct conversation scoped to that role:

- **Manager:** requirements, trade-offs, priorities, progress, and task drafting.
- **Tech Lead:** architecture, security, risk, and second-opinion review. The UI warns that direct consultation is an additional premium-provider invocation outside the two automatic workflow gates.
- **Worker:** implementation details and artifacts for that Worker's assigned task. This starts a separate consultation from persisted task and artifact snapshots using the first read-only-capable provider in that Worker's configured chain; it never attaches to the active worker process or mutable worktree. If the chain has no read-only candidate, the chat action is disabled with a diagnostic asking for a Codex or Claude fallback. An idle Worker has no authority to accept new work directly.
- **QA:** acceptance criteria, configured commands, failures, regressions, and test evidence.

All direct role conversations are read-only. A role conversation cannot start, pause, cancel, replan, dispatch, repair, apply, or otherwise mutate a workflow or repository. **Send to Manager** copies selected messages into a new Manager draft with source conversation and message IDs retained; Manager remains responsible for normalizing them into scope and acceptance criteria.

Pressing **Start Execution** freezes immutable copies and hashes of the approved task draft and selected context snapshot. Manager may revise its generated execution plan once inside Tech Lead preflight, but only to correct an Tech Lead finding within the frozen objective, scope, constraints, and acceptance criteria. The execution plan becomes immutable after Tech Lead approves it and before any Worker dispatch. Every Owner-requested scope or requirement change after Start Execution is routed to Manager as a proposed revised draft. The current run remains unchanged; the Owner must cancel it before starting the revised draft as a new run. Workers cannot expand their own briefs.

Only the Owner may press **Start Execution**, **Pause/Resume**, **Cancel Run**, or **Apply to Project**. Manager cannot start work from conversational intent alone. QA cannot waive a required failure, and Tech Lead cannot bypass deterministic QA or Owner approval.

Project conversations and drafts are stored locally in SQLite. Execution receives the frozen approved task draft and explicitly selected context snapshot, not the entire raw conversation history. This keeps role context bounded and prevents an unrelated discussion from silently changing task scope.

Repository context is selected explicitly from paths returned by `git ls-files`. `.git`, every symlink or reparse point, credential-shaped files, oversized binaries, absolute paths, and parent traversal are excluded. Untracked and ignored files cannot enter a v0.1 context snapshot. Before a conversation or run, the server copies the approved files and selected persisted artifacts into a content-addressed snapshot outside the repository and records the source branch, source HEAD commit, and a manifest of relative paths, sizes, and hashes.

Every read-only provider call receives a fresh disposable copy of that snapshot as `cwd`, never the repository or an active worktree. The adapter must also expose and use a provider-documented non-writing or sandbox mode; if the installed CLI version cannot prove that capability, the provider is unavailable for read-only roles and the configured fallback is used. The supervisor hashes the disposable copy before and after the call. Any mutation is recorded as `policy_violation`, the result is rejected, and the copy is discarded. The canonical snapshot and selected repository remain untouched.

### 6.5 Provider adapters

Provider adapters expose one common contract:

```ts
type ProviderId = "codex" | "claude" | "antigravity";

type ProviderStatus = {
  provider: ProviderId;
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  models: string[];
  capabilities: {
    nonInteractive: boolean;
    readOnly: boolean;
    worktreeWrite: boolean;
  };
  diagnostic: string | null;
};

type ProviderRequest = {
  requestId: string;
  runId: string | null;
  taskId: string | null;
  conversationId: string | null;
  contextSnapshotId: string | null;
  role: "manager" | "worker" | "advisor" | "qa";
  model: string | null;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  readOnly: boolean;
};

type ProviderResult = {
  exitCode: number;
  structuredOutput: unknown;
  stdoutArtifactId: string;
  stderrArtifactId: string;
  durationMs: number;
};
```

Each adapter implements `probe()`, `listModels()`, `run()`, and `cancel()`. `probe()` also reports whether the installed version supports the required read-only capability. Adapters use official non-interactive CLI modes and machine-readable output when available. They never extract, proxy, persist, or reinterpret provider OAuth credentials.

Provider health is checked during onboarding and before dispatch. Missing installation or authentication is shown with the official login/install action for that CLI. The application never performs a password login itself.

The v0.1 capability baseline, verified against official CLI documentation on 2026-07-11, is:

- **Codex CLI:** read-only and worktree-write capable. Read-only calls use non-interactive `exec` with explicit `--sandbox read-only`, no approvals, ephemeral session state, and JSONL output.
- **Claude Code:** read-only and worktree-write capable. Read-only calls use print mode, safe mode, plan permission mode, and an allowlist limited to `Read`, `Glob`, and `Grep`; shell, edit, write, MCP, hooks, plugins, skills, and session persistence remain disabled.
- **Antigravity CLI:** worktree-write only in v0.1. Its documented hard-deny permissions live in shared global settings rather than an isolated per-invocation profile, so the application does not offer it for Manager, Tech Lead, QA diagnosis, direct consultation, or read-only Worker tasks. A future version may enable those roles only after `probe()` verifies a documented per-invocation read-only mechanism. The application never rewrites a user's global Antigravity settings.

### 6.6 Process supervisor

- Starts every provider with an argument array and `shell: false`.
- Rejects `readOnly: true` unless `cwd` is an app-controlled disposable snapshot and the adapter supplies its verified read-only launch mode.
- Assigns a process identifier to the attempt record.
- Streams stdout and stderr to bounded artifact writers.
- Normalizes provider activity into backend events.
- Enforces timeout with graceful termination followed by process-tree termination.
- Supports cancellation through an `AbortSignal`.
- Redacts recognized token and secret patterns before any line reaches logs or WebSocket clients.
- Never enables dangerous provider permission-bypass flags by default.

### 6.7 Git/worktree service

- Write mode requires a valid Git repository with a clean working tree.
- Records the root branch and base commit before planning.
- Creates all worktrees under the application's data directory, not inside the selected repository.
- Never launches a writer with the root repository as `cwd`.
- Creates one branch per write task and one integration branch per run.
- Verifies post-worker changes against the brief's allowed and forbidden paths.
- Rejects unexpected paths as `policy_violation`.
- Stages only validated paths and creates the worker commit itself.
- Cherry-picks validated worker commits into the integration branch in dependency order.
- Permits parallel writers only when their allowed path sets do not overlap.
- Serializes tasks with overlapping or ancestor/descendant path ownership.
- Refuses execution when worktree creation fails.

### 6.8 QA command runner

Project commands are stored as structured records, never raw shell snippets:

```ts
type CommandSpec = {
  id: string;
  label: string;
  executable: string;
  args: string[];
  cwd: ".";
  required: boolean;
  timeoutMs: number;
};
```

The user reviews detected commands during project onboarding. Commands run inside the integration worktree with `shell: false`. Required commands must pass before Tech Lead delivery review. Optional commands appear in the report but do not block delivery.

### 6.9 Persistence and artifacts

Application data lives under the operating system's user-data directory using this logical layout:

```text
cozy-agent-office/
├── state.db
├── projects/<project-id>/config.json
├── contexts/<project-id>/<snapshot-id>/
│   ├── manifest.json
│   └── files/
├── runs/<run-id>/
│   ├── approved-draft.json
│   ├── context-manifest.json
│   ├── plan.json
│   ├── briefs/
│   ├── results/
│   ├── advisor/
│   ├── qa/
│   └── logs/
└── worktrees/<project-id>/<run-id>/
```

SQLite tables cover projects, context snapshots, context entries, conversations, messages, task drafts and versions, role configurations, provider status, runs, tasks, attempts, events, artifacts, and command specifications. Runs retain immutable approved-draft and context-snapshot IDs plus their hashes. Every workflow transition is committed to SQLite before its event is broadcast. Artifact files are written to a temporary path, flushed, renamed atomically, hashed, and then registered in SQLite.

The application does not automatically delete worktrees or artifacts. The UI exposes cleanup with calculated disk usage and requires user confirmation.

## 7. Structured Task Brief

Manager output must validate against this conceptual schema before workers start:

```ts
type TaskBrief = {
  id: string;
  title: string;
  objective: string;
  mode: "read_only" | "write";
  dependsOn: string[];
  contextArtifacts: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
};
```

Read-only briefs must have empty `allowedPaths`. Write briefs must have at least one allowed path. The orchestrator rejects missing acceptance criteria, unknown dependencies, cycles, duplicate IDs, forbidden/allowed overlap, absolute paths, parent-directory traversal, and overlapping parallel write ownership. The scheduler assigns each ready brief only to an available configured Worker profile with matching probed capabilities; Manager output cannot introduce a provider or model that the user did not configure.

## 8. End-to-End Data Flow

1. User starts the local server and selects a Git repository.
2. Project onboarding probes all three providers and detects candidate install, lint, test, and build commands.
3. User confirms project commands and assigns provider/model/fallback chains to Manager, Tech Lead, QA, and all four Worker profiles.
4. User selects Git-tracked repository paths; the server builds and hashes a context snapshot tied to the current branch and HEAD commit.
5. User discusses the project with Manager or a directly selected read-only role using that snapshot.
6. Manager turns selected discussion into an editable task draft with objective, scope, constraints, and acceptance criteria.
7. User reviews the draft and explicitly presses **Start Execution**.
8. Server requires a clean repository and verifies that branch, HEAD, and selected tracked-file hashes still match the approved context snapshot. A mismatch rebuilds the snapshot and requires Owner reapproval; no run starts. A match freezes the approved draft and context snapshot IDs and hashes, records that same HEAD as the execution base, and creates the run.
9. Manager receives the frozen draft, frozen context snapshot, project rules, and command list.
10. Manager returns the structured plan and briefs.
11. Orchestrator validates and stores the plan version.
12. Tech Lead preflight reviews the plan. If rejected, Manager may revise once and Tech Lead performs one final preflight review; a second rejection blocks the run.
13. The approved execution plan is frozen before dispatch.
14. Orchestrator computes task dependencies and safe parallel groups.
15. Git service creates writer branches and worktrees.
16. Process supervisor executes up to three ready workers concurrently.
17. Each finished writer is path-validated and committed by Git service.
18. Failed transient attempts retry once on the same provider. Authentication or quota failures skip same-provider retry. Remaining failure falls through the configured provider chain.
19. Integration service cherry-picks validated commits into the integration branch.
20. A cherry-pick conflict moves the run to `integration_conflict` and creates one bounded resolution task in the integration worktree. A second unresolved conflict blocks the run.
21. QA runner executes required commands in configured order.
22. If commands fail, QA's selected provider may diagnose the bounded output and one repair task may run in the integration worktree. QA commands then run again.
23. A second required QA failure blocks delivery.
24. Tech Lead delivery reviews the approved plan, integration diff, worker results, and QA report.
25. If Tech Lead rejects delivery, one bounded repair task runs in the integration worktree, all required QA commands run again, and Tech Lead performs one final delivery review. Failed required QA or a second rejection blocks delivery.
26. Manager produces final synthesis and the run becomes `ready_to_apply`.
27. UI shows diff, tests, risks, provider attempts, and **Apply to Project**.
28. Apply rechecks that the root is clean, on the recorded branch, and still at the base commit.
29. Git service performs a fast-forward-only merge from the integration branch.
30. Successful merge marks the run `applied`. A failed precondition leaves the root unchanged and marks the run `blocked` with a specific recovery instruction.

## 9. Retry, Fallback, and Loop Limits

- Transient process or network failure: one retry on the same provider.
- Authentication or quota failure: zero same-provider retries.
- Invalid structured output: one repair prompt on the same attempt chain.
- Provider chain exhaustion: task fails with all attempt diagnostics retained.
- Capability-incompatible fallback candidates are skipped before launch and do not consume attempts; no compatible candidate blocks the task with `provider_capability_unavailable`.
- Tech Lead plan revisions: maximum one.
- Tech Lead delivery repair cycles: maximum one.
- Automatic workflow gate types: exactly two; each is entered at most once, and each permits a maximum of two semantic reviews.
- Integration conflict resolution tasks: maximum one.
- QA repair tasks: maximum one.
- No workflow transition can create an unbounded loop.
- Default concurrent workers: three.
- Maximum concurrent workers in v0.1: four.

## 10. Pause, Cancel, and Recovery

- Pause sets a persisted `dispatchPaused` flag before the server acknowledges the action. The run retains its current workflow state, and the scheduler checks the flag before every new dispatch.
- Active child processes continue until completion, failure, or explicit cancellation while dispatch is paused.
- The flag survives browser and server restarts. Only Owner-initiated Resume clears it.
- Cancel requests graceful termination for every active child and escalates to process-tree termination after a fixed grace period.
- Cancel never applies integration changes to the root.
- On application restart, attempts recorded as running become `interrupted`.
- Interrupted work is never automatically relaunched.
- The user may retry a task from a clean replacement worktree or cancel the run.
- Browser reload reconnects to the current run snapshot and receives events after the latest persisted event sequence.

## 11. UI and Interaction Design

### 11.1 Main screen

```text
┌─────────────────────────────────────────────────────────┐
│ Project · Branch · Run Status · Pause · Stop            │
├────────────┬───────────────────────────────┬────────────┤
│ Task Board │                               │ Inspector  │
│            │       PIXEL OFFICE            │            │
│ Plan       │                               │ Agent      │
│ Running    │   Manager   Workers   QA      │ Provider   │
│ Review     │                               │ Model      │
│ Done       │                               │ Worktree   │
├────────────┴───────────────────────────────┴────────────┤
│ Conversation dock / events / approvals / errors         │
└─────────────────────────────────────────────────────────┘
```

The PixiJS office is the visual center. Side panels collapse. The conversation dock defaults to Manager, exposes the approved context selector, and clearly labels Discussion, Draft Task, and Execution. Clicking a character opens its separate direct read-only consultation plus role, provider, model, current task, worktree, attempts, and recent events; it never attaches chat to an active process. Clicking a task focuses its assigned character. The timeline distinguishes `advisor_gate` attempts from optional `consultation` attempts. Approval, conflict, QA failure, and apply actions use explicit blocking dialogs.

### 11.2 Office areas

- Manager cabin.
- Meeting table for planning and Tech Lead preflight.
- Four Worker desks.
- Tech Lead library/review room.
- QA laboratory.
- Integration desk.
- Coffee/rest area.

### 11.3 Event-to-animation mapping

```text
planning    → meeting room
reading     → bookshelf
writing     → typing at assigned desk
testing     → QA laboratory
waiting     → coffee/rest area
reviewing   → Tech Lead room
integrating → integration desk
failed      → error emote and warning indicator
done        → celebration, then assigned desk
```

The browser derives movement targets from normalized state events. A reload restores the latest authoritative state and may reposition a character once during recovery. Normal live transitions use walking rather than teleporting.

## 12. Original Art Contract

The visual direction is an original cozy rural workshop office using warm timber, stone, plants, amber lighting, and understated technology. It may evoke the broad genre of cozy pixel-art simulation games but must not reproduce identifiable protected expression from another project.

- Base tile: 16×16 pixels.
- Rendering: integer scaling and nearest-neighbor sampling.
- Character presets: one Manager, four Workers, one Tech Lead, and one QA.
- No character creator in v0.1.
- Every binary asset has a source and license entry in the repository asset manifest.
- Pixel display typography is limited to headings; logs and diffs use readable monospace fonts.
- Original or CC0 sound effects are optional and disabled by default.

Animation contract per character:

```text
idle       4 frames
walk       4 directions × 4 frames
work       6 frames
read       4 frames
talk       4 frames
test       6 frames
celebrate  6 frames
error      2 frames
```

No Stardew Valley or Pixel Agents character, name, portrait, map, color palette extraction, clothing design, UI reproduction, sound, or sprite may be included.

## 13. Accessibility and Responsive Behavior

- Minimum supported viewport: 1280×720.
- Main actions, task board, inspector, dialogs, and settings are keyboard accessible.
- Focus indicators remain visible.
- Status is never communicated by color alone.
- Reduce-motion mode disables decorative tweening and replaces walking with short state transitions while preserving semantic state.
- Canvas characters have corresponding accessible DOM summaries.
- Logs and diffs support text selection, copying, and screen-reader navigation outside the canvas.

## 14. Security Model

- Loopback-only server with per-start random token and strict origin validation.
- No provider password, OAuth token, session cookie, or API key is collected or persisted.
- Official CLI authentication remains in provider-owned storage.
- No arbitrary shell endpoint exists.
- Provider and QA processes use argument arrays and `shell: false`.
- The application never modifies provider-owned global permission or authentication settings.
- Project command configuration requires user approval.
- Read-only model calls use approved content snapshots outside the repository plus a verified provider-native non-writing mode; unsupported provider versions fail closed.
- The repository path and active worktree paths are never included in read-only consultation prompts or used as their working directory.
- Disposable consultation copies are mutation-checked and discarded after each attempt.
- Secrets matching supported key, token, authorization-header, and credential-file patterns are redacted before persistence and broadcast.
- Provider permission-bypass flags are disabled by default.
- Worktrees isolate Git changes but are explicitly not described as an OS sandbox.
- The product warning states that v0.1 is intended for repositories and CLI accounts trusted by the local user.

## 15. Testing Strategy

### 15.1 Unit tests

- Legal and illegal workflow transitions.
- Frozen draft, context snapshot, and post-preflight plan version boundaries.
- Tech Lead's two-gate and maximum-two-reviews-per-gate limits.
- Worker mode-to-provider capability filtering, incompatible-candidate skipping, and no-compatible-candidate blocking.
- Persisted pause and resume behavior.
- Context path validation, manifest hashing, and forwarded-message provenance.
- Stale context rejection when branch, HEAD, or selected tracked-file hashes change before Start Execution.
- Task dependency validation and cycle detection.
- Parallel path-ownership overlap detection.
- Concurrency limit of three by default and four maximum.
- Retry, invalid-output repair, and provider fallback rules.
- Secret redaction.
- Event-to-animation mapping.
- CommandSpec validation.

### 15.2 Provider contract tests

Three fake executables emulate provider version, authentication, model listing, capability combinations, streaming output, success, invalid JSON, quota failure, timeout, cancellation, and an attempted snapshot mutation. Contract tests cover the read-only/write scheduling matrix, skip incompatible fallbacks without attempts, block when no compatible candidate exists, and disable direct Worker chat without a read-only candidate. CI never requires a real provider account.

### 15.3 Git integration tests

Temporary repositories cover clean-root enforcement, context selection, root unchanged after consultations, worktree creation, allowed-path commits, path-policy violation, parallel disjoint writes, serialized overlap, cherry-pick integration, conflict, conflict resolution failure, fast-forward apply, and root-change refusal.

### 15.4 QA tests

Structured commands cover pass, optional failure, required failure, timeout, cancellation, bounded output, diagnostic invocation, one repair, and second-failure block.

### 15.5 Server tests

Tests verify loopback binding, session token requirements, origin rejection, API validation, WebSocket authentication, event replay, browser reload recovery, immutable run snapshots, rejected direct-chat mutations, and absence of a raw shell route.

### 15.6 UI tests

React tests cover onboarding, context selection, role configuration, Discussion/Draft Task/Execution transitions, forwarded-message provenance, direct-Tech Lead usage warning, mid-run scope changes, persisted pause, task submission, inspector, approval dialogs, diff review, apply guards, provider-unavailable states, and keyboard navigation. Pixi tests cover scene setup, movement targets, state animation selection, reduce motion, and recovery repositioning.

### 15.7 End-to-end and visual tests

Playwright runs one complete fake-provider workflow from onboarding through apply. Screenshot assertions cover idle, planning, parallel work, QA, Tech Lead review, failure, blocked, and done scenes at 1280×720. Real provider smoke tests are manual and documented separately from CI.

CI runs supported tests on Windows, Linux, and macOS.

## 16. Acceptance Criteria

v0.1 is complete only when all conditions below hold:

1. One local command starts the backend, serves the built frontend, and opens the browser.
2. The browser reconnects after reload without stopping an active run.
3. Codex CLI, Claude Code, and Antigravity CLI each pass the same fake-adapter contract suite and have manual real-CLI smoke instructions.
4. Manager, Tech Lead, QA, and each of four Worker profiles allow independent provider/model/fallback configuration; dispatch filters each chain by required capability, skips incompatible candidates without attempts, and visibly blocks when none remain.
5. The Owner can discuss a project with Manager, create and edit a task draft, and no run starts until explicit **Start Execution** approval.
6. Start Execution revalidates the approved snapshot against the clean current branch and HEAD, then freezes hashed versions of the approved draft and context; a mismatch requires reapproval and later edits cannot affect the active run.
7. Direct role conversations use isolated context snapshots and verified provider read-only modes, are role-scoped, retain forwarding provenance, and cannot mutate a run or repository.
8. The automatic workflow defines exactly two Tech Lead gate types, enters each at most once, requires both before Manager synthesis, and permits no more than two semantic reviews per gate; optional direct Tech Lead consultations are separately labeled as premium usage.
9. Tech Lead may revise a preflight plan only within the frozen task scope; every Owner-requested change after Start Execution can only create a new draft for a new run, and the execution plan is immutable after preflight approval.
10. Pause survives reload and server restart, blocks new dispatch, and does not terminate already active children.
11. Up to three workers execute concurrently by default, and parallel writers have disjoint allowed paths.
12. Every writer runs in an isolated worktree and unexpected path changes are rejected.
13. Required QA commands must pass before delivery can become ready to apply.
14. The root repository remains unchanged until explicit user approval.
15. Apply refuses a dirty, moved, or wrong-branch root without modifying it.
16. Interrupted runs remain inspectable and are never automatically restarted.
17. The office visibly and correctly represents planning, reading, writing, testing, waiting, reviewing, integrating, failure, and completion states.
18. Seven original character presets satisfy the animation contract and asset-manifest requirements.
19. No copied proprietary game or project assets are present.
20. Automated tests pass on Windows, Linux, and macOS.

## 17. Delivery Boundary

This design produces a local browser application and an npm-distributable command. Desktop wrappers, hosted execution, API-key providers, remote collaboration, plugin ecosystems, and semantic memory require separate designs because they materially change security, authentication, persistence, and distribution boundaries.

## 18. Open-source Licensing

- Source code is released under Apache License 2.0.
- Original art and audio assets are released under CC BY 4.0.
- Third-party assets are limited to licenses compatible with redistribution and are recorded in `THIRD_PARTY_NOTICES.md` and an asset manifest.
- The repository includes `LICENSE`, `ASSET_LICENSE.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- Provider names and logos are used only for factual compatibility labeling and do not imply affiliation or endorsement.
