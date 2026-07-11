# README Design

## Goal

Create a concise root README that helps both users and contributors understand, run, and validate Cozy Agent Office.

## Audience

- Users running the local application with an installed coding-agent CLI.
- Contributors developing or testing the TypeScript codebase.

## Structure

1. Project name and one-sentence description.
2. Current capabilities, limited to behavior verified in the repository.
3. Prerequisites: Node.js 24+, Git, and at least one supported authenticated CLI: Codex, Claude, or Antigravity.
4. Quick start using `npm install` and `npm run dev`.
5. Production build and start commands.
6. Supported provider summary and the application's startup probing behavior.
7. Contributor scripts from `package.json`.
8. Short architecture map covering the React/Vite client, Fastify server, SQLite storage, provider adapters, worktrees, and WebSocket updates.
9. Local-data and security notes based on configuration and route behavior.

## Constraints

- Keep the README practical and compact.
- Do not add badges, screenshots, deployment instructions, or a roadmap.
- Do not claim the current UI implements flows that are only present in server APIs.
- Do not invent provider installation commands; link-free CLI names are sufficient until official installation guidance is requested.
- Use commands already defined by `package.json`.

## Verification

- Run Prettier's check against `README.md`.
- Verify every documented command and requirement against repository files.
