# Agentic Execution Context

This file details the boundaries, commands, and rules for AI coding assistants working in this repository:

## Architecture Boundaries

1. **Mono-repository Structure**: Cozy Agent Office utilizes a single root npm package. Do not add nested `package.json` configurations or sub-workspaces.
2. **Persistence**: All state is persisted in SQLite. Transitions must be written to SQLite before being dispatched as events.
3. **Provider Probes**: Official CLIs (`codex`, `claude`, `antigravity`) must be probed for capabilities before dispatching task assignments. Never assume capabilities from the provider name alone.

## Concurrency and Writer Isolation

1. **Parallel Scheduler**: Dispatches up to four tasks concurrently.
2. **One-Writer-Per-File**: No two active tasks may write to the same relative file path or overlapping directory tree. Overlapping writes must be deferred until the active task integrates.
3. **Clean Working Tree**: Code writes are isolated inside temporary Git worktrees. Never write directly to the user's primary project repository directory.

## Testing & Verification Commands

- **Unit testing**: `npm run test`
- **Typechecking**: `npm run typecheck`
- **E2E testing**: `npm run test:e2e`

## Completion Criteria

1. Full test coverage in Vitest and Playwright.
2. Formatting and asset validation checks pass.
3. Zero credential leakage.
