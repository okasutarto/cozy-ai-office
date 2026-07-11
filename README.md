# Cozy Agent Office

Cozy Agent Office is a local-first, multi-model coding-agent orchestrator with a pixel-office UI.

## What it does

- Detects locally installed Codex, Claude, and Antigravity CLIs and verifies their capabilities.
- Assigns manager, advisor, QA, and worker roles to ordered provider fallback chains.
- Stores conversations, versioned drafts, run attempts, and output artifacts locally.
- Creates immutable context snapshots from tracked Git files.
- Isolates worker changes in Git worktrees and validates allowed paths before committing them.
- Streams run updates to the browser over WebSockets.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or newer
- npm
- Git
- At least one authenticated agent CLI available on `PATH`: `codex`, `claude`, or `agy`

## Development

```sh
npm install
npm run dev
```

The development server opens `http://127.0.0.1:5173`. Vite serves the web app and proxies API and WebSocket traffic to the local Fastify server on port 4317.

## Production build

```sh
npm run build
npm start
```

The production server binds to loopback on an available port and opens the authenticated local URL in your default browser.

## Providers

Cozy Agent Office probes each CLI at project setup and only uses installed, authenticated providers with the required capability.

| Provider    | CLI      | Read-only roles | Worktree writes |
| ----------- | -------- | --------------- | --------------- |
| Codex       | `codex`  | Yes             | Yes             |
| Claude      | `claude` | Yes             | Yes             |
| Antigravity | `agy`    | No              | Yes             |

Install and authenticate provider CLIs separately before starting the app. Antigravity login verification uses one subscription turn and requires explicit confirmation in the app.

## Contributor commands

| Command                 | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Run the server and web client in watch mode. |
| `npm run build`         | Build the web client and server.             |
| `npm start`             | Start the production build.                  |
| `npm run typecheck`     | Type-check server and web projects.          |
| `npm test`              | Run the test suite once.                     |
| `npm run test:watch`    | Run tests in watch mode.                     |
| `npm run test:coverage` | Run tests with coverage.                     |
| `npm run format`        | Format the repository with Prettier.         |
| `npm run check`         | Run formatting, types, tests, and a build.   |

## Project structure

```text
src/web/       React and Vite browser client
src/server/    Fastify API, orchestration, providers, storage, and Git isolation
src/shared/    Shared API schemas and contracts
test/          Vitest unit and integration tests
```

Runtime data is stored outside the repository in the platform application-data directory by default. Set `COZY_DATA_DIR` to override it.

## Security model

- **Authentication model**: ChatGPT/Claude/Google subscriptions authenticate their official CLIs; API credit is not used by this app. Subscription availability, quota, and model access remain provider-controlled.
- **Antigravity eligibility**: Antigravity is eligible only for write Workers after current `--help` capability probing and explicit login verification; v0.1 does not claim a proven per-invocation read-only mode.
- **CLI prompt exposure**: Antigravity's documented print mode receives the prompt as a process argument in v0.1, so the prompt may be visible to other local processes/users that can inspect process command lines; Codex and Claude prompts use stdin.
- **Git isolation**: Worktrees protect Git changes but are not an OS sandbox. The root working tree changes only after Apply and verified fast-forward conditions.
- **Intended codebase**: The app is intended for local repositories and CLI accounts trusted by the Owner.

## Manual Smoke Commands

To test your local command-line client provider status:

```bash
# Verify Codex CLI
codex --version
codex login status

# Verify Claude CLI
claude --version
claude auth status

# Verify Antigravity CLI
agy --version

# Launch the production orchestrator build
npm start
```

## License

Apache-2.0
