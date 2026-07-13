# Performance and Over-Engineering Refactor Design

## Goal

Reduce two measured hot-path costs and remove compiler-confirmed dead structure without changing product behavior, persistence ordering, provider probing, or the public HTTP/WebSocket contracts.

## Evidence

- `projectActorPoses` normalizes up to 2,000 events with a nested `findIndex`, making deduplication quadratic. On this machine, 2,000 unique events took about 5.45 ms per normalization; a `Set`-based pass took about 0.73 ms.
- Disposable context materialization reads each snapshot file into JavaScript and writes it back. For a 16 MiB file, `readFile` plus `writeFile` averaged about 64.15 ms; native `copyFile` averaged about 22.64 ms.
- TypeScript's unused checks report dead imports, locals, state, and constructor dependencies across the server and web client.

## Scope

### UI event normalization

Keep the existing behavior: accept out-of-order events, preserve the first event for a duplicated sequence, sort by sequence, and derive actor poses from the normalized list. Replace the nested scan with one `Set<number>` pass before sorting.

Add a deterministic complexity regression test. It will use sequence getters to count accesses for an already ordered event list, failing the current quadratic implementation without relying on wall-clock timing.

### Native snapshot copying

In disposable context materialization, replace the `readFile`/`writeFile` pair with `node:fs/promises.copyFile`. Directory creation, later hash verification, cleanup, and all security checks remain unchanged. Existing snapshot integration tests cover the copied content and mutation detection.

### Dead-structure removal

Enable `noUnusedLocals` and `noUnusedParameters` in the shared TypeScript configuration, then remove or rename only what the compiler identifies:

- unused imports, locals, and result bindings;
- unread `ConversationDock` conversation-list state while retaining the fetched list used to select or create the active conversation;
- unused `ContextSnapshotService` database dependency;
- unused `WorkerScheduler` snapshot-service dependency;
- unused `QaRunner` attempt-runner and run-store dependencies;
- redundant catch-and-rethrow state in provider execution;
- the unused scheduler `integrationHead` result and placeholder method.

Constructor call sites and tests will be updated only as required by those removals.

## Non-Goals

- No new dependencies, caches, workers, queues, or interfaces.
- No WebSocket message redesign, React context rewrite, or component/file splitting.
- No changes to SQLite transition-before-event ordering.
- No provider, scheduler concurrency, worktree-isolation, security, or credential-handling changes.
- No attempt to fix unrelated correctness concerns found during review.

## Error Handling and Data Flow

UI events continue to flow from SQLite to `RealtimeHub`, the WebSocket client, the reducer, and `OfficeScene`. Only the local normalization algorithm changes. Snapshot files continue to be copied into a request-scoped disposable directory and verified against the stored manifest after provider execution; native copy failures propagate through the existing cleanup path.

## Verification

1. Add the event-access-count test and confirm it fails against the quadratic implementation.
2. Implement `Set` normalization and confirm the targeted office test passes.
3. Enable TypeScript unused checks and confirm typecheck fails on the existing dead structure.
4. Remove the reported dead structure until server and web typechecks pass.
5. Run targeted snapshot, office, scheduler, QA, conversation-dock, and provider tests.
6. Run `npm run typecheck`, `npm run test`, `npm run test:e2e`, formatting, and asset validation.

The approved baseline on Node 22.18.0 is: typecheck passes; 109 of 111 unit/integration tests pass; the snapshot and worktree integration tests time out on Windows. Final reporting will distinguish unchanged baseline failures from regressions. The package declares Node 24 or newer, so verification should note the local engine mismatch.

## Expected Result

The event normalization retains behavior with linear deduplication, disposable snapshot copying uses the native filesystem primitive, and approximately 55 lines of dead or placeholder structure are removed with no dependency additions.
