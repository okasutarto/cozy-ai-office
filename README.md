# Cozy Agent Office

Cozy Agent Office is a local-first, multi-model coding-agent orchestrator with a pixel-office UI.

> [!NOTE]
> This project is in early development. The server-side orchestration foundation is implemented, but the browser UI is currently a minimal shell.

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

The server listens only on `127.0.0.1`, generates a fresh session token at startup, and validates browser origins. Context snapshots accept tracked regular files only, exclude credential-shaped and binary files, and enforce size limits. Write-capable workers run in isolated worktrees; their changed paths are checked before Cozy Agent Office creates commits.

## License

Apache-2.0
