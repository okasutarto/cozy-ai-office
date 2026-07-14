# Cozy Agent Office

Cozy Agent Office is a local-first, multi-model coding-agent orchestrator with a pixel-office UI.

## What it does

- Checks locally installed Codex, Claude, and Antigravity AI tools before assigning work.
- Assigns Manager, Tech Lead, QA, and Worker roles to ordered AI tool chains.
- Stores conversations, versioned drafts, run attempts, and output artifacts locally.
- Creates immutable context snapshots from tracked Git files.
- Isolates worker changes in Git worktrees and validates allowed paths before committing them.
- Streams run updates to the browser over WebSockets.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or newer
- npm
- Git
- At least one signed-in AI tool command available on `PATH`: `codex`, `claude`, or `agy`

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

## AI Tools

Cozy Agent Office checks each local AI tool during project setup and only assigns work to tools that are installed, signed in, and able to do the required job.

| AI tool     | Command  | Can review | Can edit files |
| ----------- | -------- | ---------- | -------------- |
| Codex       | `codex`  | Yes        | Yes            |
| Claude      | `claude` | Yes        | Yes            |
| Antigravity | `agy`    | No         | Yes            |

Install and sign in to these tools separately before starting the app. Antigravity login verification uses one subscription turn and requires explicit confirmation in the app.

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
src/server/    Fastify API, orchestration, AI tool adapters, storage, and Git isolation
src/shared/    Shared API schemas and contracts
test/          Vitest unit and integration tests
```

Runtime data is stored outside the repository in the platform application-data directory by default. Set `COZY_DATA_DIR` to override it.

## Security model

- **Authentication model**: ChatGPT/Claude/Google subscriptions sign in to their local command-line tools; API credit is not used by this app. Subscription availability, quota, and model access remain controlled by each tool.
- **Antigravity eligibility**: Antigravity is eligible only for write Workers after current `--help` capability checks and explicit login verification; v0.1 does not claim a proven per-invocation review-only mode.
- **Prompt exposure**: Antigravity's documented print mode receives the prompt as a process argument in v0.1, so the prompt may be visible to other local processes/users that can inspect process command lines; Codex and Claude prompts use stdin.
- **Git isolation**: Worktrees protect Git changes but are not an OS sandbox. The root working tree changes only after Apply and verified fast-forward conditions.
- **Intended codebase**: The app is intended for local repositories and AI tool accounts trusted by the Owner.

## Manual Smoke Commands

To test your local AI tool status:

```bash
# Verify Codex command
codex --version
codex login status

# Verify Claude command
claude --version
claude auth status

# Verify Antigravity command
agy --version

# Launch the production orchestrator build
npm start
```

## License

Apache-2.0
