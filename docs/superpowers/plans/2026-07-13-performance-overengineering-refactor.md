# Performance and Over-Engineering Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two measured hot-path costs with native or linear operations and delete compiler-confirmed dead structure without changing product behavior.

**Architecture:** Keep the current event, snapshot, HTTP, WebSocket, SQLite, provider, and scheduler boundaries. Optimize inside `projectActorPoses` and disposable snapshot materialization, then use TypeScript's built-in unused checks to make dead-code deletion enforceable.

**Tech Stack:** TypeScript 7, React 19, PixiJS 8, Node.js filesystem APIs, Fastify 5, SQLite via better-sqlite3, Vitest 4, Playwright 1.61.

## Global Constraints

- Run final verification with the installed Node 22.18.0 and explicitly report that it is below the package's declared Node.js 24 floor.
- Add no dependencies, caches, workers, queues, or interfaces.
- Do not change HTTP or WebSocket contracts, React context structure, SQLite transition-before-event ordering, provider behavior, scheduler concurrency, worktree isolation, security, or credential handling.
- Preserve event semantics: accept out-of-order input, keep the first duplicate sequence, and sort by sequence.
- Keep all writes in `C:\tmp\cozy-ai-office-perf-refactor`; never modify the primary checkout.
- Baseline on Node 22.18.0: typecheck passes; 109 of 111 tests pass; the snapshot and worktree integration tests time out on Windows.

## File Map

- `src/web/office/animation.ts`: actor-pose projection and event normalization.
- `test/web/office.test.ts`: pose behavior and deterministic complexity regression coverage.
- `src/server/context/snapshots.ts`: snapshot creation, disposable materialization, verification, and cleanup.
- `src/server/app.ts`: application composition and constructor call sites.
- `test/server/snapshots.test.ts`, `test/server/conversations.test.ts`: `ContextSnapshotService` integration call sites.
- `tsconfig.base.json`: repository-wide compiler enforcement.
- `src/server/orchestrator/scheduler.ts`, `test/server/scheduler.test.ts`: scheduler dependencies and result shape.
- `src/server/orchestrator/qa.ts`, `test/server/qa.test.ts`: QA runner dependencies.
- `src/server/providers/execute.ts`: provider process finalization.
- `src/server/context/snapshots.ts`, `src/server/conversations/service.ts`, `src/server/db/project-store.ts`, `src/server/orchestrator/engine.ts`, `src/server/providers/claude.ts`, `src/server/providers/registry.ts`, `src/server/routes/bootstrap.ts`, `src/server/routes/runs.ts`, `src/server/routes/storage.ts`, `src/shared/api.ts`: compiler-reported server/shared cleanup.
- `src/web/App.tsx`, `src/web/components/ConversationDock.tsx`: compiler-reported browser cleanup.

---

### Task 1: Linear event normalization

**Files:**

- Modify: `test/web/office.test.ts`
- Modify: `src/web/office/animation.ts`

**Interfaces:**

- Consumes: `projectActorPoses(run: RunSnapshot | null, events: RunEvent[]): ActorPose[]`.
- Produces: the same signature and event semantics with linear deduplication followed by the existing sequence sort.

- [ ] **Step 1: Write the failing complexity regression test**

Add this test inside `describe("Office Animation & State Projection", ...)`:

```ts
it("normalizes ordered event sequences with linear reads", () => {
  let sequenceReads = 0;
  const events = Array.from({ length: 500 }, (_, index) => {
    const event = {
      sequence: index + 1,
      runId: "963d3fb6-787f-44e2-a7cb-df95880df965",
      kind: "task.started",
      actorId: "worker-1",
      taskId: `task-${index}`,
      payload: {},
      createdAt: "2026-07-11T12:01:00.000Z",
    } as RunEvent;
    Object.defineProperty(event, "sequence", {
      get() {
        sequenceReads++;
        return index + 1;
      },
    });
    return event;
  });

  projectActorPoses({ state: "working", tasks: [] } as RunSnapshot, events);

  expect(sequenceReads).toBeLessThan(events.length * 10);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
cmd /c npm.cmd run test -- test/web/office.test.ts -t "normalizes ordered event sequences with linear reads"
```

Expected: FAIL because the nested `findIndex` reads `sequence` more than 5,000 times.

- [ ] **Step 3: Replace the nested scan with a `Set` pass**

Replace the start of `projectActorPoses` with:

```ts
export function projectActorPoses(run: RunSnapshot | null, events: RunEvent[]): ActorPose[] {
  const seenSequences = new Set<number>();
  const normalizedEvents = events
    .filter((event) => {
      if (seenSequences.has(event.sequence)) return false;
      seenSequences.add(event.sequence);
      return true;
    })
    .sort((left, right) => left.sequence - right.sequence);
  const sourceSequence = normalizedEvents.at(-1)?.sequence ?? 0;
```

Leave the remaining pose logic unchanged.

- [ ] **Step 4: Run the targeted office tests and verify GREEN**

Run:

```powershell
cmd /c npm.cmd run test -- test/web/office.test.ts
```

Expected: PASS, including duplicate-sequence behavior and the access-count regression.

- [ ] **Step 5: Commit the UI optimization**

```powershell
git add src/web/office/animation.ts test/web/office.test.ts
git commit -m "perf(web): normalize events linearly"
```

---

### Task 2: Native disposable snapshot copying

**Files:**

- Modify: `src/server/context/snapshots.ts`
- Modify: `src/server/app.ts`
- Modify: `test/server/snapshots.test.ts`
- Modify: `test/server/conversations.test.ts`

**Interfaces:**

- Consumes: `ContextSnapshotService(projects, repositories, contextsRoot, tempRoot)`.
- Produces: unchanged `create`, `materializeDisposable`, `verifyUnchanged`, and `get` behavior with native file copies.

- [ ] **Step 1: Change the snapshot test to the desired four-argument constructor**

In `test/server/snapshots.test.ts`, change construction to:

```ts
const snapshotService = new ContextSnapshotService(
  projectStore,
  repoService,
  contextsRoot,
  tempRoot,
);
```

- [ ] **Step 2: Run the snapshot test and verify RED**

Run:

```powershell
cmd /c npm.cmd run test -- test/server/snapshots.test.ts -t "creates, materializes, and verifies snapshot policies"
```

Expected: FAIL because the current five-argument constructor binds `projectStore` to the unused database slot and shifts the remaining dependencies.

- [ ] **Step 3: Remove the unused database dependency and use `copyFile`**

Use this import and constructor shape in `src/server/context/snapshots.ts`:

```ts
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rm,
  rename,
  open,
} from "node:fs/promises";

export class ContextSnapshotService {
  constructor(
    private readonly projects: ProjectStore,
    private readonly repositories: RepositoryService,
    private readonly contextsRoot: string,
    private readonly tempRoot: string,
  ) {}
```

Delete the `better-sqlite3` import and the unused `errorMessage` import. In `materializeDisposable`, replace the read/write pair with:

```ts
const srcPath = join(snapshot.directoryPath, entry.path);
const destPath = join(destDir, entry.path);
await mkdir(dirname(destPath), { recursive: true });
await copyFile(srcPath, destPath);
```

- [ ] **Step 4: Update remaining constructor call sites**

Use the same four-argument order in `src/server/app.ts` and `test/server/conversations.test.ts`:

```ts
const snapshotService = new ContextSnapshotService(
  projectStore,
  repoService,
  contextsRoot,
  tempRoot,
);
```

In `src/server/app.ts`, the concrete expressions remain `dependencies.projects`, `repositoryService`, `dependencies.config.contextsDir`, and `dependencies.config.tempDir` in that order.

- [ ] **Step 5: Run snapshot and conversation integration tests**

Run:

```powershell
cmd /c npm.cmd run test -- test/server/snapshots.test.ts test/server/conversations.test.ts
```

Expected: PASS when run without full-suite contention. On Node 22, if the existing snapshot timeout repeats, rerun the named snapshot test alone and record the timeout separately.

- [ ] **Step 6: Commit the server copy optimization**

```powershell
git add src/server/context/snapshots.ts src/server/app.ts test/server/snapshots.test.ts test/server/conversations.test.ts
git commit -m "perf(server): use native snapshot copies"
```

---

### Task 3: Enforce unused checks and delete server/shared dead structure

**Files:**

- Modify: `tsconfig.base.json`
- Modify: `src/server/app.ts`
- Modify: `src/server/conversations/service.ts`
- Modify: `src/server/db/project-store.ts`
- Modify: `src/server/orchestrator/engine.ts`
- Modify: `src/server/orchestrator/qa.ts`
- Modify: `src/server/orchestrator/scheduler.ts`
- Modify: `src/server/providers/claude.ts`
- Modify: `src/server/providers/execute.ts`
- Modify: `src/server/providers/registry.ts`
- Modify: `src/server/routes/bootstrap.ts`
- Modify: `src/server/routes/runs.ts`
- Modify: `src/server/routes/storage.ts`
- Modify: `src/shared/api.ts`
- Modify: `test/server/qa.test.ts`
- Modify: `test/server/scheduler.test.ts`

**Interfaces:**

- Consumes: current QA and scheduler call sites.
- Produces: `QaRunner(supervisor, artifacts, workerPort)` and `WorkerScheduler(runs, worktrees, executor, realtime)`; `SchedulerResult` retains `completedTaskIds` and `resultArtifactIds` only.

- [ ] **Step 1: Enable compiler-native unused checks**

Add these options to `tsconfig.base.json` under `compilerOptions`:

```json
"noUnusedLocals": true,
"noUnusedParameters": true
```

- [ ] **Step 2: Run server typecheck and verify RED**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.server.json --noEmit
```

Expected: FAIL with the existing unused imports, locals, parameters, and constructor properties.

- [ ] **Step 3: Remove unused constructor dependencies**

Change `QaRunner` to:

```ts
export class QaRunner {
  constructor(
    private readonly supervisor: ProcessSupervisor,
    private readonly artifacts: ArtifactStore,
    private readonly workerPort: WorkerExecutionPort | null,
  ) {}
```

Remove its `AttemptRunner` and `RunStore` imports. Update `src/server/app.ts` and all three `test/server/qa.test.ts` call sites to:

```ts
new QaRunner(supervisor, artifacts, null);
```

The app call uses the existing repair-port object as the third argument.

Change `WorkerScheduler` to:

```ts
constructor(
  private readonly runs: RunStore,
  private readonly worktrees: WorktreeService,
  private readonly executor: WorkerExecutionPort,
  private readonly realtime: RealtimeHub,
) {}
```

Remove the `ContextSnapshotService` import, delete `makeFakeSnapshotService` and its import from `test/server/scheduler.test.ts`, and remove that argument from the app and three test constructors.

- [ ] **Step 4: Remove the unused scheduler result member**

Keep this result type:

```ts
export type SchedulerResult = {
  completedTaskIds: string[];
  resultArtifactIds: string[];
};
```

Delete `getIntegrationHead`, delete its call, and return:

```ts
return { completedTaskIds, resultArtifactIds };
```

- [ ] **Step 5: Apply the compiler-reported server/shared deletions**

Make exactly these removals or parameter renames:

```text
src/server/app.ts: rename unused Fastify/WebSocket parameters with a leading underscore.
src/server/conversations/service.ts: remove ProviderAdapter type import.
src/server/db/project-store.ts: remove ContextSnapshotSchema import.
src/server/orchestrator/engine.ts: remove join, TaskBrief, RoleProfile, CommandSpec, and ArtifactStore imports; call markRunningAttemptsInterrupted() without binding count; remove qaProfile; await the synthesis artifact write without binding synthesisArtifact.
src/server/providers/claude.ts: rename resultPath parameter to _resultPath.
src/server/providers/registry.ts: remove AntigravityAdapter import.
src/server/routes/bootstrap.ts: rename the unused request parameter to _request.
src/server/routes/runs.ts: remove the z import.
src/server/routes/storage.ts: remove RunStorageSchema and CleanupResultSchema imports; rename the unused request parameter to _request.
src/shared/api.ts: remove normalizeRelativePath and RelativePathWireSchema imports.
```

In `src/server/providers/execute.ts`, keep `sanitizedChildEnv` and remove the unused `ProcessSupervisor` import. Replace the redundant catch/rethrow block with:

```ts
let result;
try {
  result = await runtime.supervisor.run(
    {
      executable: command.executable,
      args: command.args,
      cwd: command.cwd,
      stdin: command.stdin,
      timeoutMs: request.timeoutMs,
      env: sanitizedChildEnv(),
    },
    { stdout: stdoutSink, stderr: stderrSink },
    signal,
  );
} finally {
  var stdoutArtifact = await stdoutWriter.finalize();
  var stderrArtifact = await stderrWriter.finalize();
}
```

- [ ] **Step 6: Run server typecheck and targeted tests**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.server.json --noEmit
cmd /c npm.cmd run test -- test/server/scheduler.test.ts test/server/qa.test.ts test/server/providers.contract.test.ts test/server/routes.test.ts
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the server/shared cleanup**

```powershell
git add tsconfig.base.json src/server src/shared/api.ts test/server/qa.test.ts test/server/scheduler.test.ts
git commit -m "refactor(server): remove unused structure"
```

---

### Task 4: Delete browser dead state and imports

**Files:**

- Modify: `src/web/App.tsx`
- Modify: `src/web/components/ConversationDock.tsx`

**Interfaces:**

- Consumes: existing `ConversationDockProps` and `ApiClient` methods.
- Produces: unchanged conversation selection/creation behavior without storing an unread conversation list.

- [ ] **Step 1: Run web typecheck and verify RED**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.web.json --noEmit
```

Expected: FAIL for unused `RunEvidence`, `RunStorage`, and `conversations`.

- [ ] **Step 2: Remove unused browser values**

In `src/web/App.tsx`, keep only these API view imports:

```ts
import type { AttemptView, DiffView, QaReportView, AdvisorReviewView } from "../shared/api.js";
```

In `ConversationDock`, delete:

```ts
const [conversations, setConversations] = useState<ConversationRecord[]>([]);
```

Keep `ConversationRecord` because `activeConversation` uses it. Remove both `setConversations(data)` and the post-create `setConversations` callback. The fetch flow becomes:

```ts
.then((data) => {
  if (!active) return;
  const found = data.find((conversation) => conversation.profileId === selectedActorId);
  if (found) {
    setActiveConversation(found);
    return;
  }
  const role =
    selectedActorId === "manager" || selectedActorId === "advisor" || selectedActorId === "qa"
      ? selectedActorId
      : "worker";
  return api
    .createConversation(projectId, {
      role,
      profileId: selectedActorId,
      contextSnapshotId,
      runId: activeRun?.id || null,
    })
    .then((conversation) => {
      if (!active) return;
      setActiveConversation(conversation);
    });
})
```

- [ ] **Step 3: Run browser typecheck and component tests**

Run:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.web.json --noEmit
cmd /c npm.cmd run test -- test/web/App.test.tsx test/web/ConversationDock.test.tsx
```

Expected: both commands PASS.

- [ ] **Step 4: Commit the browser cleanup**

```powershell
git add src/web/App.tsx src/web/components/ConversationDock.tsx
git commit -m "refactor(web): remove unread state"
```

---

### Task 5: Verify the complete refactor

**Files:**

- Verify only; modify code only to fix a regression introduced by Tasks 1–4.

**Interfaces:**

- Consumes: all outputs from Tasks 1–4.
- Produces: evidence that formatting, assets, types, tests, builds, and browser workflows remain valid.

- [ ] **Step 1: Check formatting and generated assets**

Run:

```powershell
cmd /c npm.cmd run format:check
cmd /c npm.cmd run assets:check
```

Expected: both PASS and `git status --short` shows no generated-asset drift.

- [ ] **Step 2: Run complete typechecking and unit/integration tests**

Run:

```powershell
cmd /c npm.cmd run typecheck
cmd /c npm.cmd run test -- --reporter=dot
```

Expected: compare any snapshot/worktree timeout against the documented 109/111 Node 22 baseline; any different failure is a regression and must be fixed before continuing. Report the Node 24 engine mismatch with the final evidence.

- [ ] **Step 3: Run the production build and E2E suite**

Run:

```powershell
cmd /c npm.cmd run build
cmd /c npm.cmd run test:e2e
```

Expected: both PASS. Record browser-installation or Node-version environment blockers separately from code failures.

- [ ] **Step 4: Inspect the final diff and line count**

Run:

```powershell
git diff 6b38020 --check
git diff 6b38020 --stat
git status --short
```

Expected: no whitespace errors, only planned files changed, no dependency additions, and a net source/test/config deletion near the design estimate.

- [ ] **Step 5: Commit verification-only fixes if required**

If Tasks 1–4 required no verification fixes, do not create an empty commit. Otherwise:

```powershell
git add -u
git commit -m "fix: resolve refactor verification regressions"
```

Because the isolated worktree starts clean and this plan creates no implementation files, `git add -u` stages only tracked modifications from this refactor. Confirm that set with `git status --short` before committing.
