# Cozy Agent Office v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first coding-agent orchestrator that runs subscription-authenticated Codex CLI, Claude Code, and Antigravity CLI roles behind a polished original pixel-office React/PixiJS interface, while keeping all generated code isolated from the selected repository until the Owner explicitly applies it.

**Architecture:** A single production Node.js process binds to loopback, serves the built React application, exposes authenticated HTTP/WebSocket interfaces, persists state in SQLite, and owns every provider, Git, QA, retry, and recovery transition. React renders controls and accessible text surfaces; one imperative PixiJS island projects persisted run events into a fixed 22×15 tile office scene. Provider, Git, persistence, and rendering boundaries remain ordinary TypeScript modules rather than a general agent framework.

**Tech Stack:** Node.js 24 LTS, TypeScript strict mode, Fastify 5, SQLite through `better-sqlite3`, Zod 4, React 19, PixiJS 8, Vite 8, Vitest, React Testing Library, and Playwright.

## Global Constraints

- Node.js 24 LTS is the minimum runtime.
- TypeScript uses strict mode, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Production uses one Node.js process and one loopback origin; development remains available through one `npm run dev` command.
- Production binds to an ephemeral port on `127.0.0.1`; never bind to `0.0.0.0`, `::`, or a LAN address.
- Use subscription-authenticated official CLIs only. Never collect, extract, proxy, print, or persist API keys, OAuth tokens, provider cookies, or provider credential files.
- Supported providers are `codex`, `claude`, and `antigravity`. Manager, Advisor, QA, and direct role chat require a probed per-invocation read-only capability. Antigravity starts with every role capability disabled; it becomes eligible only after the installed version passes the explicit capability rules in Task 5. Never infer capability from provider name alone.
- The automatic workflow has exactly two Advisor gate types: preflight and delivery. Each gate is entered at most once and permits at most two semantic reviews.
- Default worker concurrency is three; the hard maximum is four.
- Every provider and QA process uses `node:child_process.spawn` with an argument array, `shell: false`, and `windowsHide: true`.
- Never use `--dangerously-bypass-approvals-and-sandbox`, `--dangerously-skip-permissions`, `--yolo`, or an equivalent permission-bypass flag.
- Read-only roles run from disposable context copies outside the repository, use provider-native non-writing controls, and fail closed when those controls are unavailable.
- Write roles run only in app-owned Git worktrees. The selected root working tree stays unchanged until explicit **Apply to Project**.
- Write mode requires a clean root working tree. Apply requires the same branch and base commit and uses fast-forward-only integration.
- Project verification commands are structured executable/argument arrays approved by the Owner; there is no raw-shell API.
- SQLite is the canonical state store. Persist a transition before publishing its event.
- Store large outputs as atomically finalized artifact files with hashes; store metadata in SQLite.
- React 19 renders forms, dialogs, panels, logs, and diffs. PixiJS 8 directly renders only the office scene; do not add `@pixi/react`.
- The minimum supported viewport is 1280×720. Keyboard access, visible focus, reduce-motion behavior, non-color status cues, and accessible DOM summaries are required.
- Base art tile size is 16×16 with integer scaling and nearest-neighbor sampling.
- Ship seven original character presets: Manager, four Workers, Advisor, and QA. Never copy Stardew Valley, Pixel Agents, or any other proprietary character, map, palette, UI, sound, or animation.
- Source code uses Apache-2.0. Original art/audio uses CC BY 4.0. Third-party assets require a compatible license, source URL, and manifest entry.
- Automated CI must not require real provider credentials or consume subscription quota.
- Keep v0.1 local and single-user. Do not add Mastra, LangGraph, an ORM, a vector database, Electron, Tauri, a hosted service, remote collaboration, a provider plugin API, or semantic memory.

## Chosen Minimal Boundaries

- Use one root npm package rather than workspaces. Server and browser share Zod contracts from `src/shared`.
- Use raw migration SQL and three focused stores rather than an ORM or repository class per table.
- Use `fetch`, React context plus `useReducer`, and native WebSocket rather than React Query, Redux, or Zustand.
- Use a fixed office layout module and PixiJS `Container`, `Sprite`, and `AnimatedSprite`; do not add a tilemap runtime for one static room.
- Use Node standard-library IDs, hashing, file operations, and child processes. Add a dependency only where the platform lacks a safe cross-platform primitive.
- Keep app logs on stdout through Fastify and keep durable run/provider logs in the artifact store. Do not add an observability platform in v0.1.

## Provider Documentation Baseline

The executor must re-check installed `--help` output because subscription CLIs evolve independently. These official references were verified on 2026-07-11 and define the minimum safe flag sets used in Task 5:

- [Codex developer commands](https://developers.openai.com/codex/cli/reference/) and [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive/)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-usage)
- [Google Antigravity CLI hands-on reference](https://codelabs.developers.google.com/antigravity-cli-hands-on)

If installed `--help` lacks any required flag, the probe disables that capability and reports the missing flags. It must never substitute a similar-sounding flag or silently weaken isolation.

## Canonical File Map

```text
.
├── .github/workflows/ci.yml
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── AGENTS.md
├── ASSET_LICENSE.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── THIRD_PARTY_NOTICES.md
├── index.html
├── package.json
├── playwright.config.ts
├── tsconfig.base.json
├── tsconfig.server.json
├── tsconfig.web.json
├── vite.config.ts
├── vitest.config.ts
├── scripts/
│   ├── clean.mjs
│   ├── dev.mjs
│   ├── generate-assets.mjs
│   └── validate-assets.mjs
├── art/
│   ├── README.md
│   └── source/
│       ├── characters.json
│       ├── office.json
│       └── palettes.json
├── src/shared/
│   ├── api.ts
│   └── contracts.ts
├── src/server/
│   ├── app.ts
│   ├── cli.ts
│   ├── config.ts
│   ├── errors.ts
│   ├── artifacts/store.ts
│   ├── context/snapshots.ts
│   ├── conversations/service.ts
│   ├── db/
│   │   ├── conversation-store.ts
│   │   ├── database.ts
│   │   ├── migration.ts
│   │   ├── project-store.ts
│   │   └── run-store.ts
│   ├── git/
│   │   ├── git.ts
│   │   ├── repository.ts
│   │   └── worktrees.ts
│   ├── orchestrator/
│   │   ├── attempts.ts
│   │   ├── engine.ts
│   │   ├── plan-validator.ts
│   │   ├── qa.ts
│   │   ├── scheduler.ts
│   │   └── state-machine.ts
│   ├── projects/service.ts
│   ├── prompts/
│   │   ├── advisor.ts
│   │   ├── manager.ts
│   │   ├── qa.ts
│   │   └── worker.ts
│   ├── providers/
│   │   ├── antigravity.ts
│   │   ├── claude.ts
│   │   ├── codex.ts
│   │   ├── execute.ts
│   │   ├── registry.ts
│   │   └── types.ts
│   ├── realtime/hub.ts
│   ├── routes/
│   │   ├── bootstrap.ts
│   │   ├── conversations.ts
│   │   ├── drafts.ts
│   │   ├── projects.ts
│   │   ├── runs.ts
│   │   └── storage.ts
│   ├── security/
│   │   ├── redact.ts
│   │   └── session.ts
│   └── system/process.ts
├── src/web/
│   ├── App.tsx
│   ├── api.ts
│   ├── main.tsx
│   ├── store.tsx
│   ├── components/
│   │   ├── ConfirmDialog.tsx
│   │   ├── ConversationDock.tsx
│   │   ├── DiffDialog.tsx
│   │   ├── DraftEditor.tsx
│   │   ├── Inspector.tsx
│   │   ├── Onboarding.tsx
│   │   ├── RoleSettings.tsx
│   │   ├── TaskBoard.tsx
│   │   ├── Timeline.tsx
│   │   └── TopBar.tsx
│   ├── office/
│   │   ├── CharacterSprite.ts
│   │   ├── OfficeCanvas.tsx
│   │   ├── OfficeScene.ts
│   │   ├── animation.ts
│   │   ├── asset-manifest.ts
│   │   └── layout.ts
│   └── styles/
│       ├── global.css
│       └── tokens.css
├── public/assets/
│   ├── characters/characters-atlas.json
│   ├── characters/characters-atlas.png
│   ├── office/office-atlas.json
│   ├── office/office-atlas.png
│   ├── asset-manifest.json
│   └── licenses.json
├── test/
│   ├── fixtures/fake-provider.mjs
│   ├── helpers/fake-repo.ts
│   ├── helpers/scripted-adapter.ts
│   ├── helpers/test-dependencies.ts
│   ├── helpers/temp.ts
│   ├── e2e-server.ts
│   ├── server/
│   │   ├── artifacts.test.ts
│   │   ├── attempts.test.ts
│   │   ├── conversations.test.ts
│   │   ├── database.test.ts
│   │   ├── engine.test.ts
│   │   ├── plan-validator.test.ts
│   │   ├── process.test.ts
│   │   ├── providers.contract.test.ts
│   │   ├── qa.test.ts
│   │   ├── redact.test.ts
│   │   ├── repository.test.ts
│   │   ├── routes.test.ts
│   │   ├── scheduler.test.ts
│   │   ├── session.test.ts
│   │   ├── snapshots.test.ts
│   │   └── worktrees.test.ts
│   ├── shared/contracts.test.ts
│   └── web/
│       ├── App.test.tsx
│       ├── ConversationDock.test.tsx
│       ├── Onboarding.test.tsx
│       ├── RoleSettings.test.tsx
│       ├── RunControls.test.tsx
│       └── office.test.ts
└── e2e/
    ├── office-lifecycle.spec.ts
    ├── visual.spec.ts
    └── workflow.spec.ts
```

## Execution Rules for Gemini

1. Work in task order. A later task may consume only interfaces explicitly listed in its **Interfaces** block.
2. Start each task from a clean worktree created for this implementation. Do not initialize additional nested repositories.
3. Run the specified failing test before writing implementation code. If it passes unexpectedly, correct the test boundary before continuing.
4. Run every task's focused test, then `npm run typecheck`, before committing.
5. Use the exact public names in this document. Do not rename types or functions for style preferences.
6. Never make a real provider call from an automated test. Manual provider smoke tests occur only in Task 22 after explicit operator confirmation.
7. If an installed provider version lacks a documented flag, mark the corresponding capability false and surface the diagnostic. Do not invent, approximate, or replace permission flags.
8. Preserve failed worktrees and artifacts for inspection. Never clean them implicitly.
9. Before every commit, run `git diff --check` and inspect `git status --short` for unrelated files.
10. The plan intentionally excludes a runtime tilemap library, ORM, state-management package, terminal emulator, and code editor component. Add one only through a separately approved design change.

---

### Task 1: Initialize the Repository and Lock Shared Contracts

**Files:**

- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.prettierignore`
- Create: `.prettierrc.json`
- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.base.json`
- Create: `tsconfig.server.json`
- Create: `tsconfig.web.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `scripts/clean.mjs`
- Create: `scripts/dev.mjs`
- Create: `src/shared/contracts.ts`
- Create: `src/shared/api.ts`
- Create: `test/shared/contracts.test.ts`

**Interfaces:**

- Consumes: the approved design spec only.
- Produces: every cross-runtime Zod schema and TypeScript type used by server and web; npm commands used by all later tasks.

- [ ] **Step 1: Initialize Git and install only the approved dependency set**

Run:

```bash
git init
npm install fastify@5 @fastify/static@9 @fastify/websocket@11 better-sqlite3@12 open@10 pixi.js@8 react@19 react-dom@19 ws@8 zod@4
npm install -D @playwright/test @testing-library/dom @testing-library/jest-dom @testing-library/react @testing-library/user-event @types/better-sqlite3 @types/node @types/pngjs @types/react @types/react-dom @types/ws @vitejs/plugin-react @vitest/coverage-v8 jsdom pngjs prettier tsx typescript vite@8 vitest
```

Expected: Git reports an initialized repository; npm creates `package-lock.json`; `npm audit` reports no unresolved critical vulnerability. If npm reports a critical vulnerability, keep the lockfile unchanged and stop this task with the advisory ID in the task report.

- [ ] **Step 2: Write the failing shared-contract test**

Create `test/shared/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ManagerPlanSchema,
  RoleProfileSchema,
  TaskBriefSchema,
} from "../../src/shared/contracts.js";

describe("shared contracts", () => {
  it("rejects write briefs without path ownership", () => {
    const result = TaskBriefSchema.safeParse({
      id: "task-1",
      title: "Edit UI",
      objective: "Change the button",
      mode: "write",
      dependsOn: [],
      contextArtifacts: [],
      allowedPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: ["Button is visible"],
      verificationCommands: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects role profiles without a provider chain", () => {
    expect(
      RoleProfileSchema.safeParse({
        id: "manager",
        role: "manager",
        label: "Manager",
        providerChain: [],
        timeoutMs: 60_000,
        promptVersion: "v1",
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded manager plan", () => {
    expect(
      ManagerPlanSchema.parse({
        summary: "Change one file",
        risks: ["Visual regression"],
        testStrategy: ["Run the component test"],
        tasks: [
          {
            id: "task-1",
            title: "Edit UI",
            objective: "Change the button",
            mode: "write",
            dependsOn: [],
            contextArtifacts: [],
            allowedPaths: ["src/button.tsx"],
            forbiddenPaths: ["src/server"],
            acceptanceCriteria: ["Button is visible"],
            verificationCommands: ["typecheck"],
          },
        ],
      }).tasks,
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm the missing-module failure**

Run:

```bash
npx vitest run test/shared/contracts.test.ts
```

Expected: FAIL because `src/shared/contracts.ts` does not exist.

- [ ] **Step 4: Create the root scripts and TypeScript configuration**

Replace `package.json` with:

```json
{
  "name": "cozy-agent-office",
  "version": "0.1.0",
  "private": true,
  "description": "Local-first multi-model coding-agent orchestrator with a pixel office UI",
  "type": "module",
  "engines": {
    "node": ">=24.0.0"
  },
  "bin": {
    "cozy-agent-office": "dist/server/server/cli.js"
  },
  "files": ["dist", "README.md", "LICENSE", "ASSET_LICENSE.md", "THIRD_PARTY_NOTICES.md"],
  "scripts": {
    "clean": "node scripts/clean.mjs",
    "dev": "node scripts/dev.mjs",
    "build:web": "vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "build": "npm run clean && npm run build:web && npm run build:server",
    "start": "node dist/server/server/cli.js",
    "typecheck": "tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run format:check && npm run typecheck && npm run test && npm run build",
    "prepack": "npm run check"
  },
  "dependencies": {
    "@fastify/static": "^9.0.0",
    "@fastify/websocket": "^11.0.0",
    "better-sqlite3": "^12.0.0",
    "fastify": "^5.0.0",
    "open": "^10.0.0",
    "pixi.js": "^8.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "ws": "^8.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@testing-library/dom": "^10.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^24.0.0",
    "@types/pngjs": "^6.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/ws": "^8.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "jsdom": "^26.0.0",
    "pngjs": "^7.0.0",
    "prettier": "^3.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.9.0",
    "vite": "^8.0.0",
    "vitest": "^4.0.0"
  },
  "license": "Apache-2.0"
}
```

Create `.nvmrc`:

```text
24
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
playwright-report/
test-results/
.data/
*.log
.DS_Store
Thumbs.db
```

Create `.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100
}
```

Create `.prettierignore`:

```text
dist
coverage
node_modules
playwright-report
test-results
public/assets/**/*.json
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Create `tsconfig.server.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist/server",
    "types": ["node"],
    "sourceMap": true,
    "declaration": true
  },
  "include": ["src/server/**/*.ts", "src/shared/**/*.ts"]
}
```

Create `tsconfig.web.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src/web/**/*.ts", "src/web/**/*.tsx", "src/shared/**/*.ts", "vite.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/web", emptyOutDir: false },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      "/api": "http://127.0.0.1:4317",
      "/ws": { target: "ws://127.0.0.1:4317", ws: true },
    },
  },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
    },
  },
});
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>Cozy Agent Office</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/web/main.tsx"></script>
  </body>
</html>
```

Create `scripts/clean.mjs`:

```js
import { rm } from "node:fs/promises";

await Promise.all([
  rm(new URL("../dist", import.meta.url), { recursive: true, force: true }),
  rm(new URL("../coverage", import.meta.url), { recursive: true, force: true }),
]);
```

Create `scripts/dev.mjs`:

```js
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataDir = fileURLToPath(new URL("../.data/dev", import.meta.url));
await mkdir(dataDir, { recursive: true });

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const commands = [
  [npx, ["tsx", "watch", "src/server/cli.ts"]],
  [npx, ["vite"]],
];
const children = commands.map(([command, args]) =>
  spawn(command, args, {
    cwd: root,
    env: {
      ...process.env,
      COZY_DEV: "1",
      COZY_PORT: "4317",
      COZY_PUBLIC_ORIGIN: "http://127.0.0.1:5173",
      COZY_DATA_DIR: dataDir,
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  }),
);

const stop = () => {
  for (const child of children) child.kill("SIGTERM");
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const code = await Promise.race(
  children.map(
    (child) => new Promise((resolve) => child.once("exit", (exitCode) => resolve(exitCode ?? 1))),
  ),
);
stop();
process.exitCode = code;
```

- [ ] **Step 5: Implement the canonical shared contracts**

Create `src/shared/contracts.ts`:

```ts
import { z } from "zod";

export const ProviderIdSchema = z.enum(["codex", "claude", "antigravity"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const RoleIdSchema = z.enum(["manager", "worker", "advisor", "qa"]);
export type RoleId = z.infer<typeof RoleIdSchema>;

export const ProfileIdSchema = z.enum([
  "manager",
  "worker-1",
  "worker-2",
  "worker-3",
  "worker-4",
  "advisor",
  "qa",
]);
export type ProfileId = z.infer<typeof ProfileIdSchema>;

export const TaskModeSchema = z.enum(["read_only", "write"]);
export type TaskMode = z.infer<typeof TaskModeSchema>;

export const RunStateSchema = z.enum([
  "planned",
  "advisor_preflight",
  "dispatching",
  "working",
  "integrating",
  "integration_conflict",
  "testing",
  "advisor_delivery",
  "ready_to_apply",
  "applied",
  "failed",
  "blocked",
  "cancelled",
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const ProviderCapabilitiesSchema = z.object({
  nonInteractive: z.boolean(),
  readOnly: z.boolean(),
  worktreeWrite: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const ProviderStatusSchema = z.object({
  provider: ProviderIdSchema,
  installed: z.boolean(),
  authenticated: z.boolean(),
  version: z.string().nullable(),
  models: z.array(z.string()),
  capabilities: ProviderCapabilitiesSchema,
  diagnostic: z.string().nullable(),
  checkedAt: z.string().datetime(),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ProviderCandidateSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1).nullable(),
});
export type ProviderCandidate = z.infer<typeof ProviderCandidateSchema>;

export const RoleProfileSchema = z.object({
  id: ProfileIdSchema,
  role: RoleIdSchema,
  label: z.string().min(1).max(40),
  providerChain: z.array(ProviderCandidateSchema).min(1).max(3),
  timeoutMs: z.number().int().min(10_000).max(3_600_000),
  promptVersion: z.string().min(1).max(40),
});
export type RoleProfile = z.infer<typeof RoleProfileSchema>;

export const CommandSpecSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(100),
  executable: z.string().min(1).max(260),
  args: z.array(z.string().max(1_000)).max(40),
  cwd: z.literal("."),
  required: z.boolean(),
  timeoutMs: z.number().int().min(1_000).max(3_600_000),
});
export type CommandSpec = z.infer<typeof CommandSpecSchema>;

export const RelativePathWireSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value), "absolute path")
  .refine(
    (value) => !value.split(/[\\/]/u).some((segment) => segment === ".."),
    "parent traversal",
  );

export function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export const RelativePathSchema = RelativePathWireSchema.transform(normalizeRelativePath);

export const ContextManifestEntrySchema = z.object({
  path: RelativePathSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type ContextManifestEntry = z.infer<typeof ContextManifestEntrySchema>;

export const ContextSnapshotSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceBranch: z.string().min(1),
  sourceHead: z.string().regex(/^[a-f0-9]{40,64}$/u),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/u),
  entries: z.array(ContextManifestEntrySchema),
  excluded: z.array(z.object({ path: RelativePathSchema, reason: z.string().min(1) })),
  createdAt: z.string().datetime(),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;

export const TaskDraftVersionSchema = z.object({
  draftId: z.string().uuid(),
  version: z.number().int().positive(),
  objective: z.string().min(1).max(10_000),
  scope: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  constraints: z.array(z.string().min(1).max(1_000)).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  contextSnapshotId: z.string().uuid(),
  sourceMessageIds: z.array(z.string().uuid()).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
});
export type TaskDraftVersion = z.infer<typeof TaskDraftVersionSchema>;

export const TaskBriefWireSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
    title: z.string().min(1).max(120),
    objective: z.string().min(1).max(10_000),
    mode: TaskModeSchema,
    dependsOn: z.array(z.string().min(1)).max(32),
    contextArtifacts: z.array(z.string().uuid()).max(100),
    allowedPaths: z.array(RelativePathWireSchema).max(100),
    forbiddenPaths: z.array(RelativePathWireSchema).max(100),
    acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
    verificationCommands: z.array(z.string().min(1).max(80)).max(40),
  })
  .superRefine((brief, context) => {
    if (brief.mode === "read_only" && brief.allowedPaths.length !== 0) {
      context.addIssue({ code: "custom", path: ["allowedPaths"], message: "read-only paths" });
    }
    if (brief.mode === "write" && brief.allowedPaths.length === 0) {
      context.addIssue({ code: "custom", path: ["allowedPaths"], message: "write ownership" });
    }
  });
export type TaskBriefWire = z.infer<typeof TaskBriefWireSchema>;

function normalizeTaskBrief(brief: TaskBriefWire) {
  return {
    ...brief,
    allowedPaths: brief.allowedPaths.map(normalizeRelativePath),
    forbiddenPaths: brief.forbiddenPaths.map(normalizeRelativePath),
  };
}

export const TaskBriefSchema = TaskBriefWireSchema.transform(normalizeTaskBrief);
export type TaskBrief = z.infer<typeof TaskBriefSchema>;

export const ManagerPlanWireSchema = z.object({
  summary: z.string().min(1).max(10_000),
  risks: z.array(z.string().min(1).max(1_000)).max(100),
  testStrategy: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  tasks: z.array(TaskBriefWireSchema).min(1).max(16),
});
export const ManagerPlanSchema = ManagerPlanWireSchema.transform((plan) => ({
  ...plan,
  tasks: plan.tasks.map(normalizeTaskBrief),
}));
export type ManagerPlan = z.infer<typeof ManagerPlanSchema>;

export const AdvisorReviewSchema = z.object({
  verdict: z.enum(["approve", "reject"]),
  blockingFindings: z.array(z.string().min(1).max(2_000)).max(50),
  requestedChanges: z.array(z.string().min(1).max(2_000)).max(50),
  risks: z.array(z.string().min(1).max(2_000)).max(50),
});
export type AdvisorReview = z.infer<typeof AdvisorReviewSchema>;

export const WorkerResultWireSchema = z.object({
  status: z.enum(["completed", "failed", "policy_violation"]),
  summary: z.string().min(1).max(20_000),
  findings: z.array(z.string().min(1).max(2_000)).max(100),
  changedFiles: z.array(RelativePathWireSchema).max(500),
  verification: z.array(z.string().min(1).max(2_000)).max(100),
  risks: z.array(z.string().min(1).max(2_000)).max(100),
});
export const WorkerResultSchema = WorkerResultWireSchema.transform((result) => ({
  ...result,
  changedFiles: result.changedFiles.map(normalizeRelativePath),
}));
export type WorkerResult = z.infer<typeof WorkerResultSchema>;

export const QaDiagnosisWireSchema = z.object({
  summary: z.string().min(1).max(20_000),
  suspectedPaths: z.array(RelativePathWireSchema).max(100),
  repairObjective: z.string().min(1).max(10_000),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
});
export const QaDiagnosisSchema = QaDiagnosisWireSchema.transform((diagnosis) => ({
  ...diagnosis,
  suspectedPaths: diagnosis.suspectedPaths.map(normalizeRelativePath),
}));
export type QaDiagnosis = z.infer<typeof QaDiagnosisSchema>;

export const DraftSuggestionSchema = z.object({
  objective: z.string().min(1).max(10_000),
  scope: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  constraints: z.array(z.string().min(1).max(1_000)).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
});
export type DraftSuggestion = z.infer<typeof DraftSuggestionSchema>;

export const ChatResponseSchema = z.object({
  message: z.string().min(1).max(40_000),
  citedArtifactIds: z.array(z.string().uuid()).max(50),
  draftSuggestion: DraftSuggestionSchema.nullable(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const DeliverySynthesisWireSchema = z.object({
  summary: z.string().min(1).max(20_000),
  changedFiles: z.array(RelativePathWireSchema).max(500),
  qaSummary: z.string().min(1).max(10_000),
  remainingRisks: z.array(z.string().min(1).max(2_000)).max(100),
});
export const DeliverySynthesisSchema = DeliverySynthesisWireSchema.transform((value) => ({
  ...value,
  changedFiles: value.changedFiles.map(normalizeRelativePath),
}));
export type DeliverySynthesis = z.infer<typeof DeliverySynthesisSchema>;

export const EventKindSchema = z.enum([
  "run.created",
  "run.state.changed",
  "run.pause.changed",
  "run.ready_to_apply",
  "run.applied",
  "run.blocked",
  "run.failed",
  "run.cancelled",
  "role.started",
  "role.finished",
  "consultation.started",
  "consultation.finished",
  "task.queued",
  "task.started",
  "task.finished",
  "task.failed",
  "attempt.started",
  "attempt.output",
  "attempt.finished",
  "integration.started",
  "integration.finished",
  "integration.conflict",
  "qa.command.started",
  "qa.command.finished",
  "advisor.gate",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

export const RunEventSchema = z.object({
  sequence: z.number().int().positive(),
  runId: z.string().uuid().nullable(),
  kind: EventKindSchema,
  actorId: ProfileIdSchema.nullable(),
  taskId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

const RunTaskWireSchema = TaskBriefWireSchema.safeExtend({
  status: z.enum(["queued", "running", "completed", "failed", "blocked"]),
  assignedProfileId: ProfileIdSchema.nullable(),
  commitSha: z.string().nullable(),
});
const RunTaskSchema = RunTaskWireSchema.transform((task) => normalizeTaskBrief(task));

export const RunSnapshotSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  state: RunStateSchema,
  dispatchPaused: z.boolean(),
  baseBranch: z.string().min(1),
  baseCommit: z.string().regex(/^[a-f0-9]{40,64}$/u),
  draftId: z.string().uuid(),
  draftVersion: z.number().int().positive(),
  tasks: z.array(RunTaskSchema),
  latestEventSequence: z.number().int().nonnegative(),
  blockReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;
```

Create `src/shared/api.ts`:

```ts
import { z } from "zod";
import {
  ProfileIdSchema,
  ProviderStatusSchema,
  RoleIdSchema,
  RoleProfileSchema,
  RunEventSchema,
  RunSnapshotSchema,
} from "./contracts.js";

export const SelectProjectRequestSchema = z.object({ rootPath: z.string().min(1).max(1_024) });
export const UpdateRoleProfilesRequestSchema = z.object({
  profiles: z.array(RoleProfileSchema).length(7),
});
export const CreateContextSnapshotRequestSchema = z.object({
  paths: z.array(z.string().min(1).max(500)).min(1).max(5_000),
});
export const CreateConversationRequestSchema = z.object({
  role: RoleIdSchema,
  profileId: ProfileIdSchema,
  contextSnapshotId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
});
export const SendMessageRequestSchema = z.object({
  body: z.string().min(1).max(40_000),
  selectedMessageIds: z.array(z.string().uuid()).max(20),
  selectedArtifactIds: z.array(z.string().uuid()).max(50),
  additionalUsageConfirmed: z.boolean().default(false),
});
export const ForwardToManagerRequestSchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(100),
});
export const UpdateDraftRequestSchema = z.object({
  objective: z.string().min(1).max(10_000),
  scope: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  constraints: z.array(z.string().min(1).max(1_000)).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  contextSnapshotId: z.string().uuid(),
  sourceMessageIds: z.array(z.string().uuid()).max(100),
});
export const RunActionRequestSchema = z.object({ expectedUpdatedAt: z.string().datetime() });
export const WsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    token: z.string().min(32).max(200),
    nonce: z.string().regex(/^[a-f0-9]{32}$/u),
  }),
  z.object({
    type: z.literal("subscribe"),
    runId: z.string().uuid().nullable(),
    afterSequence: z.number().int().nonnegative(),
  }),
]);
export const WsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("challenge"), nonce: z.string().regex(/^[a-f0-9]{32}$/u) }),
  z.object({ type: z.literal("authenticated") }),
  z.object({ type: z.literal("snapshot"), run: RunSnapshotSchema.nullable() }),
  z.object({ type: z.literal("event"), event: RunEventSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export const BootstrapResponseSchema = z.object({
  projects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      rootPath: z.string(),
      updatedAt: z.string(),
    }),
  ),
  providers: z.array(ProviderStatusSchema),
  activeRun: RunSnapshotSchema.nullable(),
});

export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;
```

- [ ] **Step 6: Run the contract test and both TypeScript compilers**

Run:

```bash
npx vitest run test/shared/contracts.test.ts
npm run typecheck
```

Expected: three tests PASS; both TypeScript invocations exit 0. The web compiler may report missing `src/web` input only if no matching files exist; if so, create `src/web/main.tsx` containing `export {};` and rerun.

- [ ] **Step 7: Format and commit the foundation**

Run:

```bash
npm run format
git diff --check
git add .gitignore .nvmrc .prettierignore .prettierrc.json package.json package-lock.json index.html tsconfig.base.json tsconfig.server.json tsconfig.web.json vite.config.ts vitest.config.ts scripts src/shared test/shared
git commit -m "chore: initialize cozy agent office"
```

Expected: commit succeeds and `git status --short` is empty.

---

### Task 2: Add SQLite Migrations and Durable Stores

**Files:**

- Create: `src/server/db/migration.ts`
- Create: `src/server/db/database.ts`
- Create: `src/server/db/project-store.ts`
- Create: `src/server/db/conversation-store.ts`
- Create: `src/server/db/run-store.ts`
- Create: `test/server/database.test.ts`
- Create: `test/helpers/temp.ts`

**Interfaces:**

- Consumes: `RoleProfile`, `CommandSpec`, `ProviderStatus`, `RunState`, `RunEvent`, `TaskBrief`, and `TaskDraftVersion` from Task 1.
- Produces: `openDatabase(path: string): Database.Database`, `ProjectStore`, `ConversationStore`, and `RunStore`. Every later state mutation goes through these stores.

- [ ] **Step 1: Write the failing migration and transaction test**

Create `test/helpers/temp.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withTempDir<T>(run: (path: string) => Promise<T>): Promise<T> {
  const path = await mkdtemp(join(tmpdir(), "cozy-agent-office-"));
  try {
    return await run(path);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}
```

Create `test/server/database.test.ts`:

```ts
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/server/db/database.js";
import { SqliteRunStore } from "../../src/server/db/run-store.js";
import { withTempDir } from "../helpers/temp.js";

describe("database", () => {
  it("applies migration 1 with foreign keys and WAL", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      expect(db.pragma("user_version", { simple: true })).toBe(1);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
      const names = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => (row as { name: string }).name);
      expect(names).toContain("runs");
      expect(names).toContain("events");
      db.close();
    });
  });

  it("persists an event before returning it", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      const store = new SqliteRunStore(db);
      const event = store.appendEvent({
        runId: null,
        kind: "run.created",
        actorId: null,
        taskId: null,
        payload: { projectId: "00000000-0000-4000-8000-000000000001" },
        createdAt: "2026-07-11T00:00:00.000Z",
      });
      expect(event.sequence).toBe(1);
      expect(store.listEvents(null, 0)).toEqual([event]);
      db.close();
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm missing database modules**

Run:

```bash
npx vitest run test/server/database.test.ts
```

Expected: FAIL because `src/server/db/database.ts` and `run-store.ts` do not exist.

- [ ] **Step 3: Add migration 1 with the complete v0.1 schema**

Create `src/server/db/migration.ts` with `MIGRATION_1` containing these tables and constraints exactly:

```ts
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
```

- [ ] **Step 4: Open SQLite safely and apply the migration transactionally**

Create `src/server/db/database.ts`:

```ts
import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { MIGRATION_1 } from "./migration.js";

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > 1) {
    db.close();
    throw new Error(`Database version ${version} is newer than supported version 1`);
  }
  if (version === 0) {
    db.transaction(() => {
      db.exec(MIGRATION_1);
      db.pragma("user_version = 1");
    })();
  }
  return db;
}
```

- [ ] **Step 5: Implement store interfaces and concrete SQLite classes without hidden side effects**

Create these valid public interfaces. In the same files, export `SqliteProjectStore`, `SqliteConversationStore`, and `SqliteRunStore` as final concrete classes that implement the matching interface. Only the three concrete classes hold `Database.Database`; later services depend on the interfaces.

```ts
// src/server/db/project-store.ts
import type Database from "better-sqlite3";
import type { CommandSpec, ProviderStatus, RoleProfile } from "../../shared/contracts.js";

export type ProjectRecord = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export interface ProjectStore {
  listProjects(): ProjectRecord[];
  getProject(id: string): ProjectRecord | null;
  getProjectByPath(rootPath: string): ProjectRecord | null;
  upsertProject(record: ProjectRecord): ProjectRecord;
  replaceCommands(projectId: string, commands: CommandSpec[]): void;
  listCommands(projectId: string): CommandSpec[];
  replaceRoleProfiles(projectId: string, profiles: RoleProfile[]): void;
  listRoleProfiles(projectId: string): RoleProfile[];
  saveProviderStatus(status: ProviderStatus): void;
  listProviderStatuses(): ProviderStatus[];
}
```

```ts
// src/server/db/conversation-store.ts
import type Database from "better-sqlite3";
import type { TaskDraftVersion } from "../../shared/contracts.js";

export type ConversationRecord = {
  id: string;
  projectId: string;
  role: string;
  profileId: string;
  contextSnapshotId: string;
  runId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
};
export type MessageRecord = {
  id: string;
  conversationId: string;
  sender: string;
  body: string;
  sourceMessageIds: string[];
  artifactIds: string[];
  createdAt: string;
};

export interface ConversationStore {
  createConversation(record: ConversationRecord): ConversationRecord;
  getConversation(id: string): ConversationRecord | null;
  listConversations(projectId: string): ConversationRecord[];
  appendMessage(record: MessageRecord): MessageRecord;
  listMessages(conversationId: string): MessageRecord[];
  createDraft(projectId: string, version: TaskDraftVersion): TaskDraftVersion;
  appendDraftVersion(version: TaskDraftVersion): TaskDraftVersion;
  getDraftVersion(draftId: string, version?: number): TaskDraftVersion | null;
  markDraftRunning(draftId: string): void;
}
```

```ts
// src/server/db/run-store.ts
import type Database from "better-sqlite3";
import type {
  EventKind,
  ProfileId,
  RunEvent,
  RunSnapshot,
  RunState,
  TaskBrief,
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
```

Implementation rules for the concrete classes:

```text
- Serialize arrays and objects with JSON.stringify and parse them before schema validation.
- Convert SQLite 0/1 integers to booleans at the store boundary.
- Use crypto.randomUUID() in services, not inside stores.
- Use new Date().toISOString() in services and pass timestamps into stores when identity matters.
- Wrap multi-row replacement and run creation in one SQLite transaction.
- `updateTask` maps the six `TaskPatch` keys through a fixed column map; reject an empty patch and never interpolate caller-provided column names.
- `getRun` performs one run query plus one ordered task query, merges `brief_json` with task columns, then validates the result with `RunSnapshotSchema`.
- `appendEvent` inserts the caller-provided `createdAt`, reads `lastInsertRowid`, and validates the reconstructed value with `RunEventSchema`.
- `transaction(work)` is exactly `this.db.transaction(work)()`; engine transitions wrap state mutation and `appendEvent` in this boundary before publishing.
- `SqliteProjectStore` orders projects by `updated_at DESC`, commands by `position`, profiles by `profile_id`, and provider status by `provider`.
- `SqliteConversationStore` orders conversations by `updated_at DESC`, messages by `created_at, id`, and draft versions by `version`. `appendDraftVersion` atomically inserts the version and advances `drafts.current_version` only when the prior version matches.
- Never publish WebSocket events from a store.
- No concrete method may contain a `throw new Error("not implemented")`, signature-only method, dynamic SQL identifier, or silent `any` cast.
```

- [ ] **Step 6: Run migration tests and typecheck**

Run:

```bash
npx vitest run test/server/database.test.ts
npm run typecheck
```

Expected: two tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit durable persistence**

Run:

```bash
npm run format
git diff --check
git add src/server/db test/server/database.test.ts test/helpers/temp.ts
git commit -m "feat: add durable sqlite state stores"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 3: Create Atomic Artifact Storage and Secret Redaction

**Files:**

- Create: `src/server/security/redact.ts`
- Create: `src/server/artifacts/store.ts`
- Create: `test/server/artifacts.test.ts`
- Create: `test/server/redact.test.ts`

**Interfaces:**

- Consumes: the `artifacts` table from Task 2.
- Produces: `redactText(text: string): string`, `ArtifactStore.writeText`, `ArtifactStore.writeJson`, and streaming `ArtifactWriter` used by every provider and QA process.

- [ ] **Step 1: Write failing redaction and atomic-write tests**

Create `test/server/redact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { StreamingRedactor, redactText } from "../../src/server/security/redact.js";

describe("redactText", () => {
  it("redacts common credentials without hiding ordinary identifiers", () => {
    const input = [
      "Authorization: Bearer secret-token-value",
      "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz",
      "github_pat_abcdefghijklmnopqrstuvwxyz123456",
      "task-id=worker-1",
    ].join("\n");
    const output = redactText(input);
    expect(output).not.toContain("secret-token-value");
    expect(output).not.toContain("sk-proj-");
    expect(output).not.toContain("github_pat_");
    expect(output).toContain("task-id=worker-1");
  });

  it("redacts credentials split across process chunks", () => {
    const redactor = new StreamingRedactor();
    const output = [
      ...redactor.push("OPENAI_API_KEY=sk-proj-abc"),
      ...redactor.push("defghijklmnopqrstuvwxyz\n"),
      ...redactor.flush(),
    ].join("");
    expect(output).not.toContain("sk-proj-");
    expect(output).toContain("[REDACTED]");
  });
});
```

Create `test/server/artifacts.test.ts`:

```ts
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactStore } from "../../src/server/artifacts/store.js";
import { openDatabase } from "../../src/server/db/database.js";
import { withTempDir } from "../helpers/temp.js";

describe("ArtifactStore", () => {
  it("redacts, hashes, atomically renames, and registers a text artifact", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      const store = new ArtifactStore(db, join(dir, "artifacts"));
      const artifact = await store.writeText({
        runId: null,
        taskId: null,
        kind: "provider.stdout",
        text: "Authorization: Bearer do-not-store",
      });
      const absolutePath = join(dir, "artifacts", artifact.relativePath);
      expect(await readFile(absolutePath, "utf8")).toContain("[REDACTED]");
      await expect(access(`${absolutePath}.tmp`)).rejects.toThrow();
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/u);
      db.close();
    });
  });
});
```

- [ ] **Step 2: Run both tests and confirm missing modules**

Run:

```bash
npx vitest run test/server/redact.test.ts test/server/artifacts.test.ts
```

Expected: FAIL because the redactor and artifact store do not exist.

- [ ] **Step 3: Implement deterministic line redaction**

Create `src/server/security/redact.ts`:

```ts
const RULES: ReadonlyArray<[RegExp, string]> = [
  [/\b(authorization\s*:\s*bearer\s+)[^\s]+/giu, "$1[REDACTED]"],
  [/\b(sk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{16,})\b/gu, "[REDACTED_OPENAI_KEY]"],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu, "[REDACTED_GITHUB_TOKEN]"],
  [/\b(AIza[A-Za-z0-9_-]{30,})\b/gu, "[REDACTED_GOOGLE_KEY]"],
  [/\b(ANTHROPIC_API_KEY\s*=\s*)[^\s]+/giu, "$1[REDACTED]"],
  [/\b(OPENAI_API_KEY\s*=\s*)[^\s]+/giu, "$1[REDACTED]"],
  [
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/gu,
    "[REDACTED_PRIVATE_KEY]",
  ],
];

export function redactText(text: string): string {
  return RULES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

export class StreamingRedactor {
  private pending = "";
  private inPrivateKey = false;

  push(chunk: string): string[] {
    this.pending += chunk;
    const output: string[] = [];
    let newline = this.pending.indexOf("\n");
    while (newline >= 0) {
      output.push(this.redactLine(this.pending.slice(0, newline + 1)));
      this.pending = this.pending.slice(newline + 1);
      newline = this.pending.indexOf("\n");
    }
    if (this.pending.length > 65_536) {
      const split = this.pending.length - 512;
      output.push(this.redactLine(this.pending.slice(0, split)));
      this.pending = this.pending.slice(split);
    }
    return output;
  }

  flush(): string[] {
    if (!this.pending) return [];
    const output = [this.redactLine(this.pending)];
    this.pending = "";
    return output;
  }

  private redactLine(line: string): string {
    if (this.inPrivateKey) {
      if (/-----END [A-Z ]+ PRIVATE KEY-----/u.test(line)) this.inPrivateKey = false;
      return "";
    }
    if (/-----BEGIN [A-Z ]+ PRIVATE KEY-----/u.test(line)) {
      this.inPrivateKey = !/-----END [A-Z ]+ PRIVATE KEY-----/u.test(line);
      return "[REDACTED_PRIVATE_KEY]\n";
    }
    return redactText(line);
  }
}
```

- [ ] **Step 4: Implement atomic bounded artifact writers**

Create `src/server/artifacts/store.ts` with these exact public contracts:

```ts
import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { StreamingRedactor } from "../security/redact.js";

export type ArtifactRecord = {
  id: string;
  runId: string | null;
  taskId: string | null;
  kind: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
};

export class ArtifactWriter {
  private readonly hash = createHash("sha256");
  private readonly redactor = new StreamingRedactor();
  private sizeBytes = 0;
  private truncated = false;
  private finalized = false;

  constructor(
    private readonly store: ArtifactStore,
    private readonly record: Omit<ArtifactRecord, "sha256" | "sizeBytes">,
    private readonly handle: FileHandle,
    private readonly tempPath: string,
    private readonly finalPath: string,
    private readonly maxBytes: number,
  ) {}

  async write(chunk: string): Promise<void> {
    if (this.finalized) throw new Error("ArtifactWriter is finalized");
    for (const redacted of this.redactor.push(chunk)) await this.writeRedacted(redacted);
  }

  private async writeAll(bytes: Buffer): Promise<void> {
    let offset = 0;
    while (offset < bytes.length) {
      const result = await this.handle.write(bytes, offset, bytes.length - offset, null);
      if (result.bytesWritten <= 0) throw new Error("Artifact write made no progress");
      offset += result.bytesWritten;
    }
  }

  private async writeRedacted(redacted: string): Promise<void> {
    if (this.truncated || !redacted) return;
    const remaining = this.maxBytes - this.sizeBytes;
    const bytes = Buffer.from(redacted);
    const accepted = bytes.subarray(0, Math.max(0, remaining));
    if (accepted.length > 0) {
      await this.writeAll(accepted);
      this.hash.update(accepted);
      this.sizeBytes += accepted.length;
    }
    if (accepted.length < bytes.length) {
      const marker = Buffer.from("\n[OUTPUT TRUNCATED]\n");
      await this.writeAll(marker);
      this.hash.update(marker);
      this.sizeBytes += marker.length;
      this.truncated = true;
    }
  }

  async finalize(): Promise<ArtifactRecord> {
    if (this.finalized) throw new Error("ArtifactWriter is finalized");
    this.finalized = true;
    for (const redacted of this.redactor.flush()) await this.writeRedacted(redacted);
    await this.handle.sync();
    await this.handle.close();
    await rename(this.tempPath, this.finalPath);
    return this.store.register({
      ...this.record,
      sha256: this.hash.digest("hex"),
      sizeBytes: this.sizeBytes,
    });
  }
}

export class ArtifactStore {
  constructor(
    private readonly db: Database.Database,
    readonly root: string,
  ) {}

  async createWriter(input: {
    runId: string | null;
    taskId: string | null;
    kind: string;
    extension?: string;
    maxBytes?: number;
  }): Promise<ArtifactWriter> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const extension = input.extension ?? "log";
    const finalPath = join(this.root, input.runId ?? "global", `${id}.${extension}`);
    await mkdir(dirname(finalPath), { recursive: true });
    const tempPath = `${finalPath}.tmp`;
    const handle = await open(tempPath, "wx");
    return new ArtifactWriter(
      this,
      {
        id,
        runId: input.runId,
        taskId: input.taskId,
        kind: input.kind,
        relativePath: relative(this.root, finalPath).replaceAll("\\", "/"),
        createdAt,
      },
      handle,
      tempPath,
      finalPath,
      input.maxBytes ?? 2 * 1024 * 1024,
    );
  }

  async writeText(input: {
    runId: string | null;
    taskId: string | null;
    kind: string;
    text: string;
  }): Promise<ArtifactRecord> {
    const writer = await this.createWriter(input);
    await writer.write(input.text);
    return writer.finalize();
  }

  async writeJson(input: {
    runId: string | null;
    taskId: string | null;
    kind: string;
    value: unknown;
  }): Promise<ArtifactRecord> {
    const writer = await this.createWriter({
      runId: input.runId,
      taskId: input.taskId,
      kind: input.kind,
      extension: "json",
    });
    await writer.write(`${JSON.stringify(input.value, null, 2)}\n`);
    return writer.finalize();
  }

  register(record: ArtifactRecord): ArtifactRecord {
    this.db
      .prepare(
        `INSERT INTO artifacts
        (id, run_id, task_id, kind, relative_path, sha256, size_bytes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.runId,
        record.taskId,
        record.kind,
        record.relativePath,
        record.sha256,
        record.sizeBytes,
        record.createdAt,
      );
    return record;
  }
}
```

`maxBytes` caps redacted payload bytes; a truncated artifact may exceed it only by the fixed 20-byte marker. If write, sync, close, or rename fails, reject `finalize()` and leave an unregistered `.tmp` when one still exists. If SQLite registration fails after rename, leave the final file unregistered. Startup orphan scanning reports both cases and never deletes them automatically.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
npx vitest run test/server/redact.test.ts test/server/artifacts.test.ts
npm run typecheck
```

Expected: both tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit artifact safety**

Run:

```bash
npm run format
git diff --check
git add src/server/security src/server/artifacts test/server/redact.test.ts test/server/artifacts.test.ts
git commit -m "feat: add redacted atomic artifacts"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 4: Supervise Child Processes with Timeout and Cancellation

**Files:**

- Create: `src/server/system/process.ts`
- Create: `src/server/errors.ts`
- Create: `test/fixtures/fake-provider.mjs`
- Create: `test/server/process.test.ts`

**Interfaces:**

- Consumes: async `ArtifactWriter.write` and `ArtifactWriter.finalize` from Task 3.
- Produces: `ProcessSupervisor.run(spec, sinks, signal): Promise<ProcessResult>`, `sanitizedChildEnv`, and `AppError`; provider adapters and QA use no other process launcher.

- [ ] **Step 1: Create a deterministic fake process fixture**

Create `test/fixtures/fake-provider.mjs`:

```js
import { spawn } from "node:child_process";

const [mode, value = ""] = process.argv.slice(2);
if (mode === "echo") {
  process.stdout.write(value);
  process.stderr.write(`stderr:${value}`);
} else if (mode === "sleep") {
  setTimeout(() => process.stdout.write("finished"), Number(value));
} else if (mode === "exit") {
  process.stderr.write(`exit:${value}`);
  process.exitCode = Number(value);
} else if (mode === "child") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
    windowsHide: true,
  });
  process.stdout.write(String(child.pid));
  setInterval(() => {}, 1000);
} else if (mode === "stdin") {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => process.stdout.write(input));
} else {
  process.stderr.write(`unknown mode:${mode}`);
  process.exitCode = 2;
}
```

- [ ] **Step 2: Write failing process tests**

Create `test/server/process.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProcessSupervisor, sanitizedChildEnv } from "../../src/server/system/process.js";

const fixture = fileURLToPath(new URL("../fixtures/fake-provider.mjs", import.meta.url));

function memorySink() {
  let value = "";
  return {
    write: async (chunk: string) => {
      value += chunk;
    },
    value: () => value,
  };
}

describe("ProcessSupervisor", () => {
  it("strips API and app tokens while preserving CLI auth locations", () => {
    expect(
      sanitizedChildEnv({
        OPENAI_API_KEY: "secret",
        COZY_SESSION_TOKEN: "secret",
        HOME: "/home/test",
        APPDATA: "C:/Users/test/AppData/Roaming",
      }),
    ).toEqual({ HOME: "/home/test", APPDATA: "C:/Users/test/AppData/Roaming" });
  });
  it("uses stdin and keeps stdout and stderr separate", async () => {
    const stdout = memorySink();
    const stderr = memorySink();
    const result = await new ProcessSupervisor().run(
      {
        executable: process.execPath,
        args: [fixture, "stdin"],
        cwd: process.cwd(),
        stdin: "hello",
        timeoutMs: 5_000,
      },
      { stdout, stderr },
      new AbortController().signal,
    );
    expect(result.exitCode).toBe(0);
    expect(stdout.value()).toBe("hello");
    expect(stderr.value()).toBe("");
  });

  it("marks a timed-out process and terminates it", async () => {
    const result = await new ProcessSupervisor({ terminateGraceMs: 50 }).run(
      {
        executable: process.execPath,
        args: [fixture, "sleep", "5000"],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 25,
      },
      { stdout: memorySink(), stderr: memorySink() },
      new AbortController().signal,
    );
    expect(result.timedOut).toBe(true);
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it("marks an aborted process as cancelled", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);
    const result = await new ProcessSupervisor({ terminateGraceMs: 50 }).run(
      {
        executable: process.execPath,
        args: [fixture, "sleep", "5000"],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 5_000,
      },
      { stdout: memorySink(), stderr: memorySink() },
      controller.signal,
    );
    expect(result.cancelled).toBe(true);
  });

  it("returns ENOENT without an unhandled child error", async () => {
    const result = await new ProcessSupervisor().run(
      {
        executable: `cozy-missing-executable-${process.pid}`,
        args: [],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 1_000,
      },
      { stdout: memorySink(), stderr: memorySink() },
      new AbortController().signal,
    );
    expect(result.spawnErrorCode).toBe("ENOENT");
  });

  it("terminates the spawned process tree", async () => {
    const stdout = memorySink();
    await new ProcessSupervisor({ terminateGraceMs: 50 }).run(
      {
        executable: process.execPath,
        args: [fixture, "child"],
        cwd: process.cwd(),
        stdin: "",
        timeoutMs: 50,
      },
      { stdout, stderr: memorySink() },
      new AbortController().signal,
    );
    const grandchildPid = Number(stdout.value());
    expect(Number.isInteger(grandchildPid)).toBe(true);
    await expect
      .poll(() => {
        try {
          process.kill(grandchildPid, 0);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(false);
  });
});
```

- [ ] **Step 3: Run the process tests and confirm the missing supervisor**

Run:

```bash
npx vitest run test/server/process.test.ts
```

Expected: FAIL because `src/server/system/process.ts` does not exist.

- [ ] **Step 4: Define stable application errors**

Create `src/server/errors.ts`:

```ts
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 5: Implement the only allowed child-process launcher**

Create `src/server/system/process.ts`:

```ts
import { spawn } from "node:child_process";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import type { Readable } from "node:stream";

export type SpawnSpec = {
  executable: string;
  args: string[];
  cwd: string;
  stdin: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
};

export type TextSink = { write(chunk: string): Promise<void> };
export type ProcessSinks = { stdout: TextSink; stderr: TextSink };
export type ProcessResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  spawnErrorCode: string | null;
};

const STRIPPED_ENV = new Set([
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "NPM_TOKEN",
  "COZY_SESSION_TOKEN",
]);

export function sanitizedChildEnv(
  base: NodeJS.ProcessEnv = process.env,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries({ ...base, ...extra }).filter(([key]) => !STRIPPED_ENV.has(key.toUpperCase())),
  );
}

async function forceKillTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    await once(killer, "close").catch(() => undefined);
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

function processGroupExists(pid: number): boolean {
  if (process.platform === "win32") return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function pump(stream: Readable, sink: TextSink): Promise<void> {
  stream.setEncoding("utf8");
  for await (const chunk of stream) await sink.write(String(chunk));
}

export class ProcessSupervisor {
  private readonly terminateGraceMs: number;

  constructor(options: { terminateGraceMs?: number } = {}) {
    this.terminateGraceMs = options.terminateGraceMs ?? 5_000;
  }

  async run(spec: SpawnSpec, sinks: ProcessSinks, signal: AbortSignal): Promise<ProcessResult> {
    const started = performance.now();
    let timedOut = false;
    let cancelled = false;
    let terminating = false;
    const child = spawn(spec.executable, spec.args, {
      cwd: spec.cwd,
      env: spec.env ?? process.env,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const pid = child.pid ?? null;
    const stdoutPump = pump(child.stdout, sinks.stdout);
    const stderrPump = pump(child.stderr, sinks.stderr);
    let forceTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillPromise: Promise<void> | null = null;

    const completion = new Promise<{
      exitCode: number | null;
      exitSignal: NodeJS.Signals | null;
      spawnErrorCode: string | null;
    }>((resolve) => {
      let settled = false;
      const settle = (value: {
        exitCode: number | null;
        exitSignal: NodeJS.Signals | null;
        spawnErrorCode: string | null;
      }) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.once("error", (error: NodeJS.ErrnoException) =>
        settle({ exitCode: null, exitSignal: null, spawnErrorCode: error.code ?? "spawn_error" }),
      );
      child.once("close", (exitCode, exitSignal) =>
        settle({ exitCode, exitSignal, spawnErrorCode: null }),
      );
    });

    const terminate = async (reason: "timeout" | "cancel") => {
      if (terminating) return;
      terminating = true;
      timedOut = reason === "timeout";
      cancelled = reason === "cancel";
      if (pid === null) return;
      if (process.platform === "win32") {
        forceKillPromise = forceKillTree(pid);
      } else {
        try {
          process.kill(-pid, "SIGTERM");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
        forceTimer = setTimeout(() => {
          forceKillPromise = forceKillTree(pid);
        }, this.terminateGraceMs);
        forceTimer.unref();
      }
    };

    const timeout = setTimeout(() => void terminate("timeout"), spec.timeoutMs);
    timeout.unref();
    const abort = () => void terminate("cancel");
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();

    child.stdin.on("error", () => undefined);
    child.stdin.end(spec.stdin);
    const { exitCode, exitSignal, spawnErrorCode } = await completion;
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    if (forceTimer !== null) clearTimeout(forceTimer);
    if (forceKillPromise !== null) await forceKillPromise;
    else if (pid !== null && terminating && processGroupExists(pid)) await forceKillTree(pid);
    await Promise.all([stdoutPump, stderrPump]);
    return {
      exitCode,
      signal: exitSignal,
      durationMs: Math.round(performance.now() - started),
      timedOut,
      cancelled,
      spawnErrorCode,
    };
  }
}
```

`forceKillTree` is the sole exception to the provider/QA supervisor rule because it is the supervisor's own fixed-argument termination primitive. Do not add a shell fallback. The async iterator pumps are required: replacing them with unbounded `data`-event promise chains fails the backpressure contract.

- [ ] **Step 6: Run process tests and typecheck**

Run:

```bash
npx vitest run test/server/process.test.ts
npm run typecheck
```

Expected: six tests PASS and TypeScript exits 0. No orphan `node -e setInterval` process remains after the test command.

- [ ] **Step 7: Commit process supervision**

Run:

```bash
npm run format
git diff --check
git add src/server/errors.ts src/server/system test/fixtures/fake-provider.mjs test/server/process.test.ts
git commit -m "feat: supervise provider processes safely"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 5: Implement Provider Capability Probes and CLI Adapters

**Files:**

- Create: `src/server/providers/types.ts`
- Create: `src/server/providers/codex.ts`
- Create: `src/server/providers/claude.ts`
- Create: `src/server/providers/antigravity.ts`
- Create: `src/server/providers/registry.ts`
- Create: `src/server/providers/execute.ts`
- Create: `test/server/providers.contract.test.ts`
- Modify: `test/fixtures/fake-provider.mjs`

**Interfaces:**

- Consumes: `ProcessSupervisor`, `ArtifactStore`, provider/role schemas, the transform-free wire schemas from Task 1, and Zod 4 `z.toJSONSchema`.
- Produces: `ProviderAdapter`, `ProviderRegistry`, `executeProviderRequest`, and a probed capability matrix used by role configuration, consultations, attempts, and scheduling. Scheduling never reads an adapter constant directly.

- [ ] **Step 1: Extend the fake provider with probe and structured-result modes**

Add these modes to `test/fixtures/fake-provider.mjs` before the unknown-mode branch:

```js
} else if (mode === "version") {
  process.stdout.write(value || "fake-provider 1.0.0");
} else if (mode === "auth-ok") {
  process.stdout.write(JSON.stringify({ authenticated: true }));
} else if (mode === "auth-fail") {
  process.stderr.write("authentication required");
  process.exitCode = 1;
} else if (mode === "json") {
  process.stdout.write(JSON.stringify(JSON.parse(value)));
} else if (mode === "quota") {
  process.stderr.write("quota exceeded");
  process.exitCode = 1;
} else if (mode === "invalid-json") {
  process.stdout.write("not-json");
```

- [ ] **Step 2: Write a table-driven failing adapter contract**

Create `test/server/providers.contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ClaudeAdapter } from "../../src/server/providers/claude.js";
import { CodexAdapter } from "../../src/server/providers/codex.js";
import { AntigravityAdapter } from "../../src/server/providers/antigravity.js";
import type { ProviderRequest } from "../../src/server/providers/types.js";

function request(input: {
  cwd: string;
  model: string | null;
  readOnly: boolean;
  outputContract?: ProviderRequest["outputContract"];
}): ProviderRequest {
  return {
    requestId: "00000000-0000-4000-8000-000000000101",
    runId: null,
    taskId: null,
    conversationId: null,
    contextSnapshotId: null,
    role: input.readOnly ? "manager" : "worker",
    profileId: input.readOnly ? "manager" : "worker-1",
    model: input.model,
    prompt: "test prompt",
    cwd: input.cwd,
    timeoutMs: 60_000,
    readOnly: input.readOnly,
    outputContract: input.outputContract ?? null,
  };
}

describe("provider adapter commands", () => {
  it("hardens Codex read-only calls", () => {
    const command = new CodexAdapter("codex").build(
      request({ cwd: "C:/snapshot", model: "gpt-5.4-mini", readOnly: true }),
      { path: "C:/schema.json", json: "{}" },
      "C:/result.json",
    );
    expect(command.args).toEqual(
      expect.arrayContaining([
        "--ask-for-approval",
        "never",
        "exec",
        "--cd",
        "C:/snapshot",
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--json",
        "--output-schema",
        "C:/schema.json",
      ]),
    );
    expect(command.args).not.toContain("--yolo");
  });

  it("restricts Claude read-only tools", () => {
    const command = new ClaudeAdapter("claude").build(
      request({ cwd: "/snapshot", model: "sonnet", readOnly: true }),
      { path: "/schema.json", json: "{}" },
      "/result.json",
    );
    expect(command.args).toEqual(
      expect.arrayContaining([
        "-p",
        "--safe-mode",
        "--permission-mode",
        "plan",
        "--tools",
        "Read,Glob,Grep",
        "--disallowedTools",
        "Edit,Write,Bash,NotebookEdit,WebFetch,WebSearch,mcp__*",
        "--strict-mcp-config",
        "--no-chrome",
        "--disable-slash-commands",
        "--no-session-persistence",
      ]),
    );
    expect(command.args.join(" ")).not.toContain("dangerously");
  });

  it("declares Antigravity write-only and does not alter global settings", () => {
    const adapter = new AntigravityAdapter("agy");
    expect(adapter.declaredCapabilities.readOnly).toBe(false);
    expect(adapter.declaredCapabilities.worktreeWrite).toBe(true);
    const command = adapter.build(
      request({ cwd: "/worktree", model: null, readOnly: false }),
      null,
      "/result.json",
    );
    expect(command.cwd).toBe("/worktree");
    expect(command.args).toEqual(["--print", "test prompt"]);
  });
});
```

- [ ] **Step 3: Run the provider contract and confirm missing adapters**

Run:

```bash
npx vitest run test/server/providers.contract.test.ts
```

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 4: Define one provider boundary**

Create `src/server/providers/types.ts`:

```ts
import type {
  ProfileId,
  ProviderCapabilities,
  ProviderId,
  ProviderStatus,
  RoleId,
} from "../../shared/contracts.js";
import type { ArtifactRecord, ArtifactStore } from "../artifacts/store.js";
import type { ProcessSupervisor } from "../system/process.js";

export type ProviderRequest = {
  requestId: string;
  runId: string | null;
  taskId: string | null;
  conversationId: string | null;
  contextSnapshotId: string | null;
  role: RoleId;
  profileId: ProfileId;
  model: string | null;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  readOnly: boolean;
  outputContract:
    | "manager_plan"
    | "advisor_review"
    | "worker_result"
    | "qa_diagnosis"
    | "chat_response"
    | "draft_suggestion"
    | "delivery_synthesis"
    | null;
};

export type BuiltCommand = {
  executable: string;
  args: string[];
  cwd: string;
  stdin: string;
  structuredResultPath: string | null;
};

export type StructuredSchema = { path: string; json: string };

export type ProviderExecution = {
  exitCode: number | null;
  durationMs: number;
  structuredOutput: unknown;
  stdout: ArtifactRecord;
  stderr: ArtifactRecord;
  errorCode: string | null;
};

export type ProviderProbeRuntime = {
  supervisor: ProcessSupervisor;
  cwd: string;
};

export type ProviderRuntime = {
  supervisor: ProcessSupervisor;
  artifacts: ArtifactStore;
  tempDir: string;
  statusFor(provider: ProviderId): ProviderStatus;
};

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly declaredCapabilities: ProviderCapabilities;
  probe(runtime: ProviderProbeRuntime, signal: AbortSignal): Promise<ProviderStatus>;
  build(
    request: ProviderRequest,
    schema: StructuredSchema | null,
    resultPath: string,
  ): BuiltCommand;
}
```

- [ ] **Step 5: Implement exact safe command builders**

Implement these builder rules:

```ts
// src/server/providers/codex.ts
import type {
  BuiltCommand,
  ProviderAdapter,
  ProviderProbeRuntime,
  ProviderRequest,
  StructuredSchema,
} from "./types.js";
import { probeCli } from "./execute.js";

export class CodexAdapter implements ProviderAdapter {
  readonly id = "codex" as const;
  readonly declaredCapabilities = {
    nonInteractive: true,
    readOnly: true,
    worktreeWrite: true,
  } as const;
  constructor(private readonly executable = "codex") {}

  probe(runtime: ProviderProbeRuntime, signal: AbortSignal) {
    return probeCli(
      {
        id: this.id,
        executable: this.executable,
        versionArgs: ["--version"],
        helpArgs: [["--help"], ["exec", "--help"]],
        authArgs: ["login", "status"],
        models: [],
        requiredFlags: {
          nonInteractive: ["--ephemeral", "--json", "--output-last-message"],
          readOnly: [
            "--sandbox",
            "read-only",
            "--ask-for-approval",
            "--ignore-user-config",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--output-schema",
          ],
          worktreeWrite: [
            "--sandbox",
            "workspace-write",
            "--ask-for-approval",
            "--ignore-user-config",
            "--ignore-rules",
            "--output-schema",
          ],
        },
      },
      runtime,
      signal,
    );
  }

  build(
    request: ProviderRequest,
    schema: StructuredSchema | null,
    resultPath: string,
  ): BuiltCommand {
    const args = [
      "--ask-for-approval",
      "never",
      "exec",
      "--cd",
      request.cwd,
      "--sandbox",
      request.readOnly ? "read-only" : "workspace-write",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--json",
      "--output-last-message",
      resultPath,
    ];
    if (request.readOnly) args.push("--skip-git-repo-check");
    if (schema) args.push("--output-schema", schema.path);
    if (request.model) args.push("--model", request.model);
    args.push("-");
    return {
      executable: this.executable,
      args,
      cwd: request.cwd,
      stdin: request.prompt,
      structuredResultPath: resultPath,
    };
  }
}
```

```ts
// src/server/providers/claude.ts
import type {
  BuiltCommand,
  ProviderAdapter,
  ProviderProbeRuntime,
  ProviderRequest,
  StructuredSchema,
} from "./types.js";
import { probeCli } from "./execute.js";

export class ClaudeAdapter implements ProviderAdapter {
  readonly id = "claude" as const;
  readonly declaredCapabilities = {
    nonInteractive: true,
    readOnly: true,
    worktreeWrite: true,
  } as const;
  constructor(private readonly executable = "claude") {}

  probe(runtime: ProviderProbeRuntime, signal: AbortSignal) {
    return probeCli(
      {
        id: this.id,
        executable: this.executable,
        versionArgs: ["--version"],
        helpArgs: [["--help"]],
        authArgs: ["auth", "status"],
        models: ["haiku", "sonnet", "opus", "fable"],
        requiredFlags: {
          nonInteractive: ["--print", "--output-format", "--no-session-persistence"],
          readOnly: ["--safe-mode", "--permission-mode", "plan", "--tools", "--strict-mcp-config"],
          worktreeWrite: ["--safe-mode", "--permission-mode", "acceptEdits", "--tools"],
        },
      },
      runtime,
      signal,
    );
  }

  build(
    request: ProviderRequest,
    schema: StructuredSchema | null,
    resultPath: string,
  ): BuiltCommand {
    const denied = request.readOnly
      ? "Edit,Write,Bash,NotebookEdit,WebFetch,WebSearch,mcp__*"
      : "Bash,NotebookEdit,WebFetch,WebSearch,mcp__*";
    const args = [
      "-p",
      "--safe-mode",
      "--permission-mode",
      request.readOnly ? "plan" : "acceptEdits",
      "--tools",
      request.readOnly ? "Read,Glob,Grep" : "Read,Glob,Grep,Edit,Write",
      "--disallowedTools",
      denied,
      "--strict-mcp-config",
      "--no-chrome",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--output-format",
      "json",
    ];
    if (schema) args.push("--json-schema", schema.json);
    if (request.model) args.push("--model", request.model);
    return {
      executable: this.executable,
      args,
      cwd: request.cwd,
      stdin: request.prompt,
      structuredResultPath: null,
    };
  }
}
```

```ts
// src/server/providers/antigravity.ts
import type {
  BuiltCommand,
  ProviderAdapter,
  ProviderProbeRuntime,
  ProviderRequest,
  StructuredSchema,
} from "./types.js";
import { probeCli } from "./execute.js";

export class AntigravityAdapter implements ProviderAdapter {
  readonly id = "antigravity" as const;
  readonly declaredCapabilities = {
    nonInteractive: true,
    readOnly: false,
    worktreeWrite: true,
  } as const;
  constructor(private readonly executable = "agy") {}

  probe(runtime: ProviderProbeRuntime, signal: AbortSignal) {
    return probeCli(
      {
        id: this.id,
        executable: this.executable,
        versionArgs: ["--version"],
        helpArgs: [["--help"]],
        authArgs: null,
        models: [],
        requiredFlags: {
          nonInteractive: ["--print"],
          readOnly: null,
          worktreeWrite: ["--print", "--model"],
        },
      },
      runtime,
      signal,
    );
  }

  build(
    request: ProviderRequest,
    _schema: StructuredSchema | null,
    _resultPath: string,
  ): BuiltCommand {
    if (request.readOnly) throw new Error("Antigravity read-only mode is unproven");
    const args: string[] = [];
    if (request.model) args.push("--model", request.model);
    args.push("--print", request.prompt);
    return {
      executable: this.executable,
      args,
      cwd: request.cwd,
      stdin: "",
      structuredResultPath: null,
    };
  }
}
```

The command builders above are the `ProviderAdapter.build()` implementation; do not add a second builder API. Probes use these commands:

```text
Codex version: codex --version
Codex auth: codex login status
Claude version: claude --version
Claude auth: claude auth status
Antigravity version: agy --version
Antigravity auth: no separate non-interactive status command is documented; retain authenticated=true only for the same probed version after an Owner-approved disposable verification turn succeeds. Otherwise report authenticated=false with diagnostic="Run Verify login (uses a small subscription turn)".
```

Implement `probeCli` in `execute.ts`. It runs version, help, and optional auth commands with a 10-second timeout and 256 KiB bounded memory sinks. It returns `installed=false` for `spawnErrorCode="ENOENT"`, never launches a model turn, and sets each capability true only when every token in that capability's `requiredFlags` occurs in current help output. A `null` required-flag set always yields false. It intersects those results with `declaredCapabilities`; it never copies declared capabilities directly into `ProviderStatus`.

`models` contains only documented stable aliases: Codex `[]`, Claude `["haiku", "sonnet", "opus", "fable"]`, Antigravity `[]`. Empty means the UI accepts a manually typed model string or provider default. Persist the full missing-flag diagnostic. `ProviderRegistry` stores the most recent `ProviderStatus`; attempts obtain status from the registry and reject an incompatible role before `build()`.

For Antigravity login verification, add `ProviderRegistry.verifyAntigravityLogin(model, signal)`. It creates a disposable empty directory under the app temp root, runs `agy --print [--model value]` there with the prompt `Reply with exactly COZY_AUTH_OK. Do not use tools.`, requires exit 0 and that marker in stdout, verifies the directory stayed empty, then persists authenticated=true for the current version. This is exposed as an explicit onboarding action in Task 7 and is never run at startup or in CI.

- [ ] **Step 6: Execute adapters through artifacts and schema validation**

Create `src/server/providers/execute.ts` exporting:

```ts
export async function executeProviderRequest(
  adapter: ProviderAdapter,
  request: ProviderRequest,
  runtime: ProviderRuntime,
  signal: AbortSignal,
): Promise<ProviderExecution>;
```

In `execute.ts`, define the only provider-output registry. The `wire` schemas contain no transforms and are the only schemas passed to `z.toJSONSchema`; the `result` schemas normalize paths and are the only schemas returned to orchestration code:

```ts
export const OUTPUT_CONTRACTS = {
  manager_plan: { wire: ManagerPlanWireSchema, result: ManagerPlanSchema },
  advisor_review: { wire: AdvisorReviewSchema, result: AdvisorReviewSchema },
  worker_result: { wire: WorkerResultWireSchema, result: WorkerResultSchema },
  qa_diagnosis: { wire: QaDiagnosisWireSchema, result: QaDiagnosisSchema },
  chat_response: { wire: ChatResponseSchema, result: ChatResponseSchema },
  draft_suggestion: { wire: DraftSuggestionSchema, result: DraftSuggestionSchema },
  delivery_synthesis: { wire: DeliverySynthesisWireSchema, result: DeliverySynthesisSchema },
} as const;
```

Add a contract test that calls `z.toJSONSchema` for every `wire` entry and expects no exception. This test prevents a path-normalizing `.transform()` from crossing the CLI JSON-Schema boundary.

Implement this exact sequence:

```text
1. Load the current ProviderStatus through runtime.statusFor(adapter.id); require installed and authenticated.
2. Reject readOnly=true when status.capabilities.readOnly is false; reject readOnly=false when status.capabilities.worktreeWrite is false. Never consult declaredCapabilities here.
3. Create a per-request temp directory under runtime.tempDir/request.requestId.
4. Resolve request.outputContract through OUTPUT_CONTRACTS. When non-null, call z.toJSONSchema(contract.wire), serialize once, and atomically write schema.json.
5. Call adapter.build(request, {path,json}, resultPath), or adapter.build(request, null, resultPath). Codex and Claude receive the prompt on stdin. Antigravity v0.1 must use its documented `--print <prompt>` argument because its current reference does not establish stdin prompting; show this local process-list exposure in onboarding and SECURITY.md, and disable Antigravity rather than inventing an undocumented stdin flag.
6. Create 2 MiB stdout and stderr ArtifactWriters. Wrap each in a bounded tee sink that also retains at most 2 MiB in memory for envelope parsing; the artifact remains authoritative.
7. Run ProcessSupervisor with request.timeoutMs, `sanitizedChildEnv()`, and the supplied AbortSignal so saved CLI auth locations remain available but API-key/token environment variables cannot switch billing modes or leak into tools.
8. Finalize both artifacts even when the process exits non-zero.
9. Classify spawnErrorCode, timeout, cancellation, authentication text, quota text, and non-zero exit into stable error codes. ENOENT is provider_not_installed; quota never retries the same provider.
10. For Codex, parse the output-last-message file as JSON when a contract exists. For Claude, parse stdout with a Zod envelope `{structured_output?: unknown, result?: string}` and use structured_output, falling back to JSON.parse(result) only when structured_output is absent. For Antigravity, require outputContract=null, derive write evidence later from Git, and retain stdout as the summary.
11. Parse non-null structured output with contract.result. Return invalid_structured_output on failure and keep stdout, stderr, schema, and raw-result artifacts.
12. Remove only the per-request temp directory after its schema and result have been copied into artifacts.
```

Create `src/server/providers/registry.ts`:

```ts
import type { ProviderId } from "../../shared/contracts.js";
import type { ProviderStatus } from "../../shared/contracts.js";
import type { ProviderAdapter } from "./types.js";

export class ProviderRegistry {
  private readonly adapters: Map<ProviderId, ProviderAdapter>;
  private readonly statuses = new Map<ProviderId, ProviderStatus>();
  constructor(adapters: ProviderAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }
  get(id: ProviderId): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Provider adapter is not registered: ${id}`);
    return adapter;
  }
  list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }
  setStatus(status: ProviderStatus): void {
    this.statuses.set(status.provider, status);
  }
  statusFor(id: ProviderId): ProviderStatus {
    const status = this.statuses.get(id);
    if (!status) throw new Error(`Provider has not been probed: ${id}`);
    return status;
  }
}
```

`probeAll(runtime, signal)` probes adapters in parallel, persists each returned status through `ProjectStore.saveProviderStatus`, and then calls `setStatus`. On startup load persisted statuses for display but mark them stale; execution is disabled until the current process has probed the matching executable version. `verifyAntigravityLogin` updates both the store and in-memory map only after its disposable verification succeeds.

- [ ] **Step 7: Expand provider contract tests**

Add tests that inject `process.execPath` plus `fake-provider.mjs` into lightweight test adapters and verify:

```text
- version success and ENOENT installation failure
- missing required help flags produce false capabilities and an explicit diagnostic
- auth success and auth-required classification
- quota classification without same-provider retry
- valid Zod structured output
- every transform-free wire schema converts with z.toJSONSchema without throwing
- invalid JSON retained as an artifact
- timeout and AbortSignal cancellation
- Antigravity read-only request and unverified login are rejected before spawn
- no argument contains a dangerous bypass flag
```

- [ ] **Step 8: Run provider tests, process tests, and typecheck**

Run:

```bash
npx vitest run test/server/providers.contract.test.ts test/server/process.test.ts
npm run typecheck
```

Expected: all tests PASS; TypeScript exits 0; no real provider process starts.

- [ ] **Step 9: Commit provider adapters**

Run:

```bash
npm run format
git diff --check
git add src/server/providers test/fixtures/fake-provider.mjs test/server/providers.contract.test.ts
git commit -m "feat: add subscription cli adapters"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 6: Start a Token-Protected Loopback Server

**Files:**

- Create: `src/server/config.ts`
- Create: `src/server/security/session.ts`
- Create: `src/server/realtime/hub.ts`
- Create: `src/server/routes/bootstrap.ts`
- Create: `src/server/app.ts`
- Create: `src/server/cli.ts`
- Create: `test/server/session.test.ts`
- Create: `src/web/main.tsx`

**Interfaces:**

- Consumes: database stores, `ProviderRegistry`, `ArtifactStore`, `BootstrapResponseSchema`, `WsClientMessageSchema`, and `RunEvent`.
- Produces: `loadConfig`, `SessionGuard`, `RealtimeHub`, `buildApp`, and the production CLI entry point. Every later route registers through `buildApp`.

- [ ] **Step 1: Write failing HTTP and WebSocket security tests**

Create `test/server/session.test.ts` with these cases:

```ts
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { createTestDependencies } from "../helpers/test-dependencies.js";

describe("local session security", () => {
  it("rejects API requests without the server token", async () => {
    const dependencies = await createTestDependencies();
    const app = await buildApp(dependencies);
    const response = await app.inject({ method: "GET", url: "/api/bootstrap" });
    expect(response.statusCode).toBe(401);
    await app.close();
    await dependencies.close();
  });

  it("rejects a mismatched browser origin", async () => {
    const dependencies = await createTestDependencies();
    const app = await buildApp(dependencies);
    const response = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
      headers: {
        authorization: `Bearer ${dependencies.config.sessionToken}`,
        origin: "https://attacker.example",
      },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
    await dependencies.close();
  });

  it("accepts the exact token and loopback origin", async () => {
    const dependencies = await createTestDependencies();
    const app = await buildApp(dependencies);
    const response = await app.inject({
      method: "GET",
      url: "/api/bootstrap",
      headers: {
        authorization: `Bearer ${dependencies.config.sessionToken}`,
        origin: dependencies.config.publicOrigin,
      },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
    await dependencies.close();
  });
});
```

In the same file, start the app on `127.0.0.1` with port `0` and use the direct `ws` dependency to test the actual upgrade path. Set `dependencies.config.websocketAuthTimeoutMs = 50` before `buildApp`. Cover these exact cases and close every client/listener in `finally`:

```text
- Origin https://attacker.example receives HTTP 403 during upgrade.
- Exact Origin receives {type:"challenge",nonce}; sending no auth frame closes with 4401.
- Exact Origin plus wrong token and current nonce closes with 4401.
- Exact Origin plus correct token and current nonce receives authenticated; subscribe then receives snapshot before replayed events.
- Capture a valid auth frame, open a second socket, and replay the old nonce; the second socket closes with 4401.
- Three malformed frames close with 4400 and never add the socket to RealtimeHub.
```

Create `test/helpers/test-dependencies.ts` as a real dependency container backed by a temporary data directory and fake adapters. It must expose `config`, stores, registry, artifacts, realtime hub, and `close()`; no later test constructs server dependencies differently.

- [ ] **Step 2: Run the security test and confirm missing server modules**

Run:

```bash
npx vitest run test/server/session.test.ts
```

Expected: FAIL because `src/server/app.ts` and the test dependency helper do not exist.

- [ ] **Step 3: Resolve local configuration without another package**

Create `src/server/config.ts`:

```ts
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type ServerConfig = {
  dev: boolean;
  host: "127.0.0.1";
  port: number;
  publicOrigin: string;
  sessionToken: string;
  dataDir: string;
  databasePath: string;
  artifactsDir: string;
  worktreesDir: string;
  contextsDir: string;
  tempDir: string;
  webRoot: string;
  websocketAuthTimeoutMs: number;
};

function defaultDataDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Cozy Agent Office");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Cozy Agent Office");
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "cozy-agent-office");
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dev = environment.COZY_DEV === "1";
  const port = environment.COZY_PORT ? Number(environment.COZY_PORT) : 0;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("Invalid COZY_PORT");
  const dataDir = resolve(environment.COZY_DATA_DIR ?? defaultDataDir());
  const publicOrigin = environment.COZY_PUBLIC_ORIGIN ?? "";
  return {
    dev,
    host: "127.0.0.1",
    port,
    publicOrigin,
    sessionToken: randomBytes(32).toString("base64url"),
    dataDir,
    databasePath: join(dataDir, "state.db"),
    artifactsDir: join(dataDir, "runs"),
    worktreesDir: join(dataDir, "worktrees"),
    contextsDir: join(dataDir, "contexts"),
    tempDir: join(dataDir, "tmp"),
    webRoot: resolve("dist/web"),
    websocketAuthTimeoutMs: 2_000,
  };
}
```

- [ ] **Step 4: Implement constant-time token and exact-origin checks**

Create `src/server/security/session.ts`:

```ts
import { timingSafeEqual } from "node:crypto";
import { AppError } from "../errors.js";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class SessionGuard {
  constructor(
    private readonly token: string,
    private publicOrigin: string,
  ) {}

  setPublicOrigin(origin: string): void {
    this.publicOrigin = origin;
  }

  assertHttpOrigin(origin: string | undefined, method: string): void {
    const safeMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";
    if (
      (!safeMethod && origin !== this.publicOrigin) ||
      (origin !== undefined && origin !== this.publicOrigin)
    ) {
      throw new AppError("origin_forbidden", "Browser origin is not allowed", 403);
    }
  }

  assertWebSocketOrigin(origin: string | undefined): void {
    if (origin !== this.publicOrigin) {
      throw new AppError("origin_forbidden", "Browser origin is not allowed", 403);
    }
  }

  assertAuthorization(header: string | undefined): void {
    const prefix = "Bearer ";
    if (!header?.startsWith(prefix) || !safeEqual(header.slice(prefix.length), this.token)) {
      throw new AppError("unauthorized", "Valid local session token required", 401);
    }
  }

  verifyToken(token: string): boolean {
    return safeEqual(token, this.token);
  }
}
```

- [ ] **Step 5: Persist before publishing real-time events**

Create `src/server/realtime/hub.ts`:

```ts
import WebSocket from "ws";
import type { RunEvent } from "../../shared/contracts.js";
import type { RunStore } from "../db/run-store.js";

export class RealtimeHub {
  private readonly clients = new Map<WebSocket, string | null>();
  constructor(private readonly runs: RunStore) {}

  add(socket: WebSocket): void {
    this.clients.set(socket, null);
    socket.once("close", () => this.clients.delete(socket));
  }

  subscribe(socket: WebSocket, runId: string | null, afterSequence: number): RunEvent[] {
    this.clients.set(socket, runId);
    return this.runs.listEvents(runId, afterSequence);
  }

  publish(event: RunEvent): void {
    const message = JSON.stringify({ type: "event", event });
    for (const [socket, runId] of this.clients) {
      if (socket.readyState === WebSocket.OPEN && runId === event.runId) socket.send(message);
    }
  }
}
```

Only call `publish` with the `RunEvent` returned by `RunStore.appendEvent`; never construct a broadcast-only event.

- [ ] **Step 6: Build Fastify with authenticated APIs and a first-message-authenticated WebSocket**

Create `src/server/app.ts` with this dependency boundary:

```ts
export type AppDependencies = {
  config: ServerConfig;
  session: SessionGuard;
  projects: ProjectStore;
  conversations: ConversationStore;
  runs: RunStore;
  providers: ProviderRegistry;
  artifacts: ArtifactStore;
  realtime: RealtimeHub;
};

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance>;
```

Implementation requirements:

```text
- Create Fastify with logger=true and bodyLimit=1 MiB.
- Register @fastify/websocket before websocket routes.
- Add an `/api/*` `onRequest` hook that calls `assertHttpOrigin(request.headers.origin, request.method)` and `assertAuthorization`. Same-origin GET/HEAD may omit Origin because browsers commonly do; every supplied Origin and every mutating request must match exactly.
- Map AppError to {error:{code,message,details}} and hide unknown stack traces from responses.
- GET /api/bootstrap returns persisted projects, provider statuses, and the newest active run.
- GET /api/health returns {ok:true} without a token but contains no project or provider data.
- GET /ws validates the exact non-empty Origin header during upgrade.
- A new socket receives only `{type:"challenge",nonce}` with a fresh 16-byte hex nonce. It receives no project/run state until its first JSON message validates as `{type:"auth",token,nonce}` and the nonce matches that socket in constant time.
- Close unauthenticated sockets with code 4401 after two seconds.
- Consume the nonce after the first auth attempt. A replayed nonce on another socket or a second auth frame closes with 4401.
- After authentication, accept {type:"subscribe",runId,afterSequence}, send a current snapshot, then replay persisted events in sequence order.
- Reject malformed messages with a typed error and close after three malformed messages.
- In production, register @fastify/static at dependencies.config.webRoot and return index.html for unknown non-API GET routes.
- In development, do not register static files; Vite owns the browser origin.
```

Create `src/server/routes/bootstrap.ts` as the only module that serializes `BootstrapResponseSchema`.

- [ ] **Step 7: Add the production CLI and minimal browser bootstrap**

Create `src/server/cli.ts` with a shebang and this sequence:

```text
1. Load config and mkdir data/artifacts/worktrees/contexts/temp.
2. Open SQLite and mark recorded running attempts interrupted.
3. Construct stores, ArtifactStore, ProcessSupervisor, three adapters, registry, session guard, and realtime hub.
4. Build Fastify and listen on {host:"127.0.0.1",port:config.port}.
5. Read the selected port from app.server.address().
6. In production set public origin to http://127.0.0.1:<port> and open that URL with #session=<token> through the `open` package.
7. In development keep COZY_PUBLIC_ORIGIN and do not open a second browser because Vite already opens it.
8. On SIGINT/SIGTERM, abort active runs, close Fastify, close SQLite, then exit.
```

Create `src/web/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function BootstrapScreen() {
  return <main>Cozy Agent Office</main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <BootstrapScreen />
  </StrictMode>,
);
```

- [ ] **Step 8: Complete test dependencies and run server security tests**

Run:

```bash
npx vitest run test/server/session.test.ts test/server/database.test.ts
npm run typecheck
npm run build
```

Expected: security and database tests PASS, both builds succeed, and server output exists at `dist/server/server/cli.js`.

- [ ] **Step 9: Commit the secure local server**

Run:

```bash
npm run format
git diff --check
git add src/server/config.ts src/server/security/session.ts src/server/realtime src/server/routes/bootstrap.ts src/server/app.ts src/server/cli.ts src/web/main.tsx test/helpers/test-dependencies.ts test/server/session.test.ts
git commit -m "feat: add token-protected loopback server"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 7: Onboard Git Projects, Commands, and Role Profiles

**Files:**

- Create: `src/server/git/git.ts`
- Create: `src/server/git/repository.ts`
- Create: `src/server/projects/service.ts`
- Create: `src/server/routes/projects.ts`
- Create: `test/helpers/fake-repo.ts`
- Create: `test/server/repository.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**

- Consumes: `ProcessSupervisor`, `ProjectStore`, `ProviderRegistry`, `CommandSpec`, `RoleProfile`, and project request schemas.
- Produces: `GitClient`, `RepositoryService`, `ProjectService`, project onboarding routes, clean-root inspection, tracked-file enumeration, command candidates, and deterministic default role chains.

- [ ] **Step 1: Build a disposable Git repository fixture**

Create `test/helpers/fake-repo.ts` exporting:

```ts
export type FakeRepo = { root: string; branch: string; head: string };
export async function createFakeRepo(root: string): Promise<FakeRepo>;
export async function commitFile(root: string, path: string, content: string): Promise<string>;
```

Use `ProcessSupervisor` to run these exact Git commands with `shell:false`:

```text
git init -b main
git -c user.name=Test -c user.email=test@example.invalid add -- <path>
git -c user.name=Test -c user.email=test@example.invalid commit -m <message>
git rev-parse HEAD
```

The base fixture contains tracked `package.json`, `src/index.ts`, and `AGENTS.md`.

- [ ] **Step 2: Write failing repository tests**

Create `test/server/repository.test.ts` covering:

```text
- rejects a non-Git directory
- rejects a nested directory whose top-level differs from the selected path
- returns branch, HEAD, and clean=false for tracked or untracked changes
- lists tracked files with spaces and Unicode using NUL-delimited Git output
- proposes npm scripts only from package.json scripts
- proposes flutter analyze and flutter test only when pubspec.yaml is tracked
- never returns a raw compound shell string
- builds exactly seven role profiles with four distinct Worker IDs
- filters Manager/Advisor/QA defaults to read-only-capable providers
- keeps Antigravity authenticated=false until explicit login verification succeeds
- Antigravity verification uses an app temp directory, leaves it empty, and is never run by the normal probe
```

- [ ] **Step 3: Run the repository test and confirm missing services**

Run:

```bash
npx vitest run test/server/repository.test.ts
```

Expected: FAIL because Git and project services do not exist.

- [ ] **Step 4: Implement a NUL-safe Git client**

Create `src/server/git/git.ts`:

```ts
export type GitResult = { stdout: string; stderr: string; exitCode: number };

export class GitClient {
  constructor(private readonly supervisor: ProcessSupervisor) {}
  async run(cwd: string, args: string[], signal: AbortSignal): Promise<GitResult>;
  async require(cwd: string, args: string[], signal: AbortSignal): Promise<string>;
}

export function splitNul(value: string): string[] {
  return value.split("\0").filter(Boolean);
}
```

`run` uses memory sinks capped at 2 MiB, executable `git`, argument arrays, a 60-second timeout, and no shell. `require` throws `AppError("git_command_failed", ...)` with redacted stderr when exit code is non-zero.

- [ ] **Step 5: Inspect repositories and detect command candidates**

Create `src/server/git/repository.ts` with:

```ts
export type RepositoryInspection = {
  rootPath: string;
  name: string;
  branch: string;
  head: string;
  clean: boolean;
  statusEntries: string[];
  trackedPaths: string[];
  commandCandidates: CommandSpec[];
  rulePaths: string[];
};

export class RepositoryService {
  constructor(private readonly git: GitClient) {}
  inspect(rootPath: string, signal: AbortSignal): Promise<RepositoryInspection>;
  assertCleanAt(rootPath: string, branch: string, head: string, signal: AbortSignal): Promise<void>;
}
```

Implement `inspect` with:

```text
- fs.realpath(rootPath)
- git rev-parse --show-toplevel and exact realpath equality
- git symbolic-ref --short HEAD; reject detached HEAD for write mode
- git rev-parse HEAD
- git status --porcelain=v1 -z --untracked-files=all
- git ls-files -z
- tracked package.json script detection in this order: format:check, lint, typecheck, test, build
- tracked pubspec.yaml detection: flutter analyze, then flutter test
- rule path detection from tracked AGENTS.md, CLAUDE.md, and .github/copilot-instructions.md
```

Every candidate is a `CommandSpec` with one executable and an `args` array. Do not infer install commands or execute a candidate during onboarding.

- [ ] **Step 6: Create projects and deterministic initial role profiles**

Create `src/server/projects/service.ts` exporting:

```ts
export class ProjectService {
  constructor(
    private readonly store: ProjectStore,
    private readonly repositories: RepositoryService,
    private readonly providers: ProviderRegistry,
  ) {}
  selectProject(
    rootPath: string,
    signal: AbortSignal,
  ): Promise<RepositoryInspection & { id: string }>;
  probeProviders(signal: AbortSignal): Promise<ProviderStatus[]>;
  verifyAntigravityLogin(model: string | null, signal: AbortSignal): Promise<ProviderStatus>;
  saveCommands(projectId: string, commands: CommandSpec[]): void;
  saveRoleProfiles(projectId: string, profiles: RoleProfile[]): void;
}
```

Default profiles are generated only after probes:

```text
- Manager: first installed authenticated read-only provider
- Advisor: last installed authenticated read-only provider, allowing a premium choice distinct from Manager
- QA: first installed authenticated read-only provider
- Worker 1..4: round-robin through installed authenticated providers with worktreeWrite capability
- Each Worker chain appends available alternatives in stable codex, claude, antigravity order
- Timeout: Manager 15m, Advisor 15m, QA 10m, Worker 30m
- Prompt versions: manager-v1, advisor-v1, qa-v1, worker-v1
- If a required role has no compatible provider, return the project plus a blocking onboarding diagnostic; never invent a provider
```

- [ ] **Step 7: Register validated project routes**

Create `src/server/routes/projects.ts`:

```text
POST /api/projects/select
POST /api/projects/:projectId/providers/probe
POST /api/projects/:projectId/providers/antigravity/verify-login
GET  /api/projects/:projectId/onboarding
PUT  /api/projects/:projectId/commands
PUT  /api/projects/:projectId/roles
```

Parse every body through Task 1 schemas. Verify the project exists. For role updates enforce:

```text
- exactly manager, advisor, qa, worker-1, worker-2, worker-3, worker-4
- profile role matches profile ID
- Manager/Advisor/QA chains contain at least one currently read-only-capable provider
- duplicate provider/model candidates are rejected
- timeout bounds remain schema-valid
```

The Antigravity verification route requires body `{model: string | null, confirmation: "USE SUBSCRIPTION TURN"}`. It calls only `ProjectService.verifyAntigravityLogin`, returns the updated status, and never changes Antigravity global settings.

- [ ] **Step 8: Run repository, route, and type tests**

Run:

```bash
npx vitest run test/server/repository.test.ts test/server/session.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 9: Commit project onboarding**

Run:

```bash
npm run format
git diff --check
git add src/server/git src/server/projects src/server/routes/projects.ts src/server/app.ts test/helpers/fake-repo.ts test/server/repository.test.ts
git commit -m "feat: onboard git projects and role profiles"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 8: Build Immutable Repository Context Snapshots

**Files:**

- Create: `src/server/context/snapshots.ts`
- Create: `test/server/snapshots.test.ts`
- Modify: `src/server/routes/projects.ts`
- Modify: `src/server/db/project-store.ts`

**Interfaces:**

- Consumes: tracked paths and branch/HEAD from `RepositoryService`, context tables, and `CreateContextSnapshotRequestSchema`.
- Produces: `ContextSnapshotService.create`, `materializeDisposable`, `verifyUnchanged`, and safe context routes used by every read-only role and Start Execution.

- [ ] **Step 1: Write failing snapshot isolation tests**

Create `test/server/snapshots.test.ts` covering these exact cases:

```text
- copies only Owner-selected Git-tracked regular files
- rejects an untracked selected path
- excludes every symlink and Windows reparse-point-like non-regular entry
- excludes .env, .env.*, id_rsa, id_ed25519, *.pem, *.p12, *.pfx, *.key, credentials.json, and service-account*.json
- excludes files larger than 2 MiB and files containing a NUL byte in the first 8 KiB
- stops when accepted content exceeds 100 MiB
- records relative path, byte size, SHA-256, source branch, source HEAD, and manifest hash
- produces the same snapshot ID for identical content and selection
- materializes a fresh disposable directory with no .git path
- detects writes, new files, and deletions in the disposable copy
- rejects Start Execution after branch, HEAD, or a selected file hash changes
```

- [ ] **Step 2: Run the snapshot test and confirm the missing service**

Run:

```bash
npx vitest run test/server/snapshots.test.ts
```

Expected: FAIL because `src/server/context/snapshots.ts` does not exist.

- [ ] **Step 3: Implement path and content policy before copying**

Create `src/server/context/snapshots.ts` with these exports:

```ts
export const MAX_CONTEXT_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_CONTEXT_TOTAL_BYTES = 100 * 1024 * 1024;

export type DisposableContext = {
  path: string;
  baselineHash: string;
  verifyUnchanged(): Promise<void>;
  dispose(): Promise<void>;
};

export class ContextSnapshotService {
  constructor(
    private readonly db: Database.Database,
    private readonly projects: ProjectStore,
    private readonly repositories: RepositoryService,
    private readonly contextsRoot: string,
    private readonly tempRoot: string,
  ) {}
  create(projectId: string, selectedPaths: string[], signal: AbortSignal): Promise<ContextSnapshot>;
  get(snapshotId: string): ContextSnapshot | null;
  materializeDisposable(snapshotId: string, requestId: string): Promise<DisposableContext>;
  verifyUnchanged(snapshotId: string, signal: AbortSignal): Promise<void>;
}
```

Use this exact secret-name function:

```ts
function isCredentialShaped(path: string): boolean {
  const name = path.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
  return (
    name === ".env" ||
    name.startsWith(".env.") ||
    name === "id_rsa" ||
    name === "id_ed25519" ||
    name === "credentials.json" ||
    /^service-account.*\.json$/u.test(name) ||
    /\.(pem|p12|pfx|key)$/u.test(name)
  );
}
```

For each selected path, normalize with `RelativePathSchema`, require membership in the current `git ls-files -z` set, call `lstat`, accept only `isFile()`, and ensure `realpath` remains under the selected repository root. Open the accepted source once, re-check `FileHandle.stat().isFile()`, inspect/read/hash/copy only through that same handle, and close it in `finally`; never reopen by path during the copy. On platforms supporting `O_NOFOLLOW`, include it. Reject if a post-copy source `lstat` no longer matches the opened size/mtime identity. Inspect the first 8 KiB for NUL before writing destination bytes.

Write `manifest.json`, call `FileHandle.sync()` for copied files and manifest, and compute `manifestHash` from canonical lexicographically sorted manifest JSON. Derive `snapshotId` deterministically from the first 16 hash bytes after setting RFC 4122 version/variant bits so it passes `z.string().uuid()`. Include `projectId`, source branch/HEAD, selected path list, and entry hashes in the hashed payload. If the same project/snapshot row already exists, verify its directory and return it instead of rewriting. Atomically rename a new directory to `<contextsRoot>/<projectId>/<snapshotId>` and store rows in one database transaction; a uniqueness race returns the verified existing record.

`materializeDisposable` copies from the canonical snapshot to `<tempRoot>/consultations/<requestId>`, hashes its sorted file manifest before launch, and verifies the same manifest after launch. Any difference throws `AppError("policy_violation", "Read-only provider changed its disposable context", 409)` before disposal.

- [ ] **Step 4: Add context endpoints**

Add:

```text
GET  /api/projects/:projectId/context-candidates
POST /api/projects/:projectId/context-snapshots
GET  /api/context-snapshots/:snapshotId
```

The candidates response separates selectable tracked regular files from excluded entries and reasons. Never return file contents from this route.

- [ ] **Step 5: Run snapshot and repository tests**

Run:

```bash
npx vitest run test/server/snapshots.test.ts test/server/repository.test.ts
npm run typecheck
```

Expected: all cases PASS; TypeScript exits 0; selected root repositories remain byte-for-byte unchanged.

- [ ] **Step 6: Commit immutable context snapshots**

Run:

```bash
npm run format
git diff --check
git add src/server/context src/server/routes/projects.ts src/server/db/project-store.ts test/server/snapshots.test.ts
git commit -m "feat: add immutable context snapshots"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 9: Add Read-Only Role Conversations and Versioned Task Drafts

**Files:**

- Create: `src/server/conversations/service.ts`
- Create: `src/server/routes/conversations.ts`
- Create: `src/server/routes/drafts.ts`
- Create: `src/server/prompts/manager.ts`
- Create: `test/server/conversations.test.ts`
- Modify: `src/server/app.ts`

**Interfaces:**

- Consumes: context disposable copies, conversation store, provider registry/execution, role profiles, and conversation/draft request schemas.
- Produces: persisted Discussion messages, role-scoped direct consultations, provenance-preserving **Send to Manager**, and immutable draft versions. It does not create runs.

- [ ] **Step 1: Write failing conversation authority tests**

Create `test/server/conversations.test.ts` covering:

```text
- Manager is the default role for a new project conversation
- every consultation executes with readOnly=true and a disposable context cwd
- an Antigravity-only Worker chain disables direct Worker chat with provider_capability_unavailable
- Worker chat receives persisted task/result artifacts, never an active worktree path
- direct role chat cannot call run-control services
- Advisor consultation is rejected unless additionalUsageConfirmed=true
- each Owner and role message is persisted locally
- request context includes at most 20 selected messages and 40,000 total message characters
- Send to Manager retains source conversation/message IDs
- Manager draft output must include objective, scope, constraints, and acceptance criteria
- editing a draft appends version N+1 and leaves earlier versions unchanged
- raw conversation history is absent from the draft unless selected by ID
```

- [ ] **Step 2: Run conversation tests and confirm missing services**

Run:

```bash
npx vitest run test/server/conversations.test.ts
```

Expected: FAIL because the conversation service and routes do not exist.

- [ ] **Step 3: Define bounded prompt builders**

Create `src/server/prompts/manager.ts`:

```ts
import type { MessageRecord } from "../db/conversation-store.js";

export function buildDiscussionPrompt(input: {
  role: "manager" | "worker" | "advisor" | "qa";
  messages: MessageRecord[];
  artifactSummaries: string[];
}): string {
  return [
    `You are the ${input.role} in Cozy Agent Office.`,
    "This is a read-only consultation. Do not edit files, start work, change run state, or expand scope.",
    "Answer only from the supplied context snapshot, selected messages, and persisted artifacts.",
    "Return JSON with keys: message, citedArtifactIds, draftSuggestion.",
    JSON.stringify({ messages: input.messages, artifacts: input.artifactSummaries }),
  ].join("\n\n");
}

export function buildDraftPrompt(messages: MessageRecord[]): string {
  return [
    "Convert only the selected messages into one editable task draft.",
    "Do not execute the task and do not add requirements not supported by the messages.",
    "Return objective, scope, constraints, and acceptanceCriteria as JSON.",
    JSON.stringify(messages),
  ].join("\n\n");
}
```

Import the canonical `ChatResponseSchema` and `DraftSuggestionSchema` from `src/shared/contracts.ts`. Pass `outputContract="chat_response"` and `outputContract="draft_suggestion"` respectively; do not create competing local schemas.

- [ ] **Step 4: Implement role-safe conversation behavior**

Create `src/server/conversations/service.ts` exporting:

```ts
export class ConversationService {
  create(input: CreateConversationInput): ConversationRecord;
  send(
    conversationId: string,
    input: SendMessageInput,
    signal: AbortSignal,
  ): Promise<MessageRecord>;
  forwardToManager(
    conversationId: string,
    messageIds: string[],
    signal: AbortSignal,
  ): Promise<TaskDraftVersion>;
  updateDraft(draftId: string, input: UpdateDraftInput): TaskDraftVersion;
}
```

`send` must:

```text
1. Load the conversation, project profile, selected messages, and selected artifacts.
2. Reject more than 20 messages or 40,000 combined characters after lookup.
2a. When the conversation role is advisor, require input.additionalUsageConfirmed=true before creating a provider attempt.
3. Pick the first candidate in the profile chain whose current probe has readOnly=true; skipped candidates create no attempt.
4. If none remains, throw provider_capability_unavailable before creating a provider attempt.
5. Materialize a fresh disposable copy of the conversation snapshot.
6. Persist the Owner message.
7. Execute the role with readOnly=true and outputContract="chat_response"; parse the returned value with ChatResponseSchema.
8. Verify the disposable copy is unchanged before accepting the response.
9. Require every ChatResponse.citedArtifactId to be a member of the selected artifact IDs, then persist the role response and provenance; broadcast consultation events with runId=null or the linked run ID.
10. Dispose the copy in finally and never expose its absolute path in a response.
```

`forwardToManager` loads only requested message IDs from the source conversation, invokes the Manager read-only profile with `outputContract="draft_suggestion"`, parses with `DraftSuggestionSchema`, computes SHA-256 from canonical draft JSON, creates version 1, and preserves `sourceMessageIds`.

- [ ] **Step 5: Register conversation and draft routes**

Create:

```text
POST /api/projects/:projectId/conversations
GET  /api/projects/:projectId/conversations
GET  /api/conversations/:conversationId/messages
POST /api/conversations/:conversationId/messages
POST /api/conversations/:conversationId/forward-to-manager
GET  /api/drafts/:draftId
PUT  /api/drafts/:draftId
```

No route in these modules imports the orchestrator engine or Git worktree service. That compile-time boundary enforces read-only conversation authority.

- [ ] **Step 6: Run conversation, provider, and snapshot tests**

Run:

```bash
npx vitest run test/server/conversations.test.ts test/server/providers.contract.test.ts test/server/snapshots.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit conversations and drafts**

Run:

```bash
npm run format
git diff --check
git add src/server/conversations src/server/routes/conversations.ts src/server/routes/drafts.ts src/server/prompts/manager.ts src/server/app.ts test/server/conversations.test.ts
git commit -m "feat: add safe project conversations and drafts"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 10: Validate Manager Plans and Bound Advisor Preflight

**Files:**

- Create: `src/server/prompts/advisor.ts`
- Create: `src/server/orchestrator/plan-validator.ts`
- Create: `test/server/plan-validator.test.ts`

**Interfaces:**

- Consumes: `TaskDraftVersion`, `ManagerPlan`, `AdvisorReview`, `CommandSpec`, and probed role profiles.
- Produces: `validatePlan(plan, draft, commands): ValidatedPlan`, path-overlap helpers, and exact Manager/Advisor prompt builders used by the engine.

- [ ] **Step 1: Write a failing plan-policy suite**

Create `test/server/plan-validator.test.ts` with tests for:

```text
- duplicate task IDs
- missing dependency IDs
- dependency cycles
- self-dependency
- read-only brief with allowed paths
- write brief without allowed paths
- absolute path and parent traversal
- allowed/forbidden overlap
- parallel write paths equal, ancestor, or descendant
- overlapping writes accepted only when one transitively depends on the other
- unknown verification command IDs
- more than 16 tasks
- write allowedPaths outside explicit path-shaped frozen scope entries
- deterministic topological order for valid tasks
```

Use paths `src/a`, `src/a/file.ts`, `src/ab`, and `test/a.test.ts` to prove segment-aware overlap rather than string-prefix overlap.

- [ ] **Step 2: Run the plan-policy test and confirm the missing validator**

Run:

```bash
npx vitest run test/server/plan-validator.test.ts
```

Expected: FAIL because `plan-validator.ts` does not exist.

- [ ] **Step 3: Implement segment-aware ownership and DAG validation**

Create `src/server/orchestrator/plan-validator.ts` exporting:

```ts
export type ValidatedPlan = ManagerPlan & { topologicalOrder: string[] };

export function pathsOverlap(left: string, right: string): boolean {
  const a = left.replaceAll("\\", "/").replace(/\/$/u, "");
  const b = right.replaceAll("\\", "/").replace(/\/$/u, "");
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function validatePlan(
  input: unknown,
  draft: TaskDraftVersion,
  commands: CommandSpec[],
): ValidatedPlan;
```

Implementation order:

```text
1. Parse ManagerPlanSchema.
2. Enforce unique IDs and known dependencies.
3. Compute Kahn topological order and reject cycles.
4. Reject allowed/forbidden overlap inside each brief.
5. For every pair of write briefs with overlapping ownership, require a transitive dependency in one direction.
6. Require every verificationCommands entry to match an approved CommandSpec ID.
7. Parse scope entries beginning with `path:` through RelativePathSchema; when any exist, require every write allowedPath to be equal to or beneath one of them. Free-form objective/acceptance semantics are not guessed by string matching; Advisor preflight owns that semantic check.
8. Return the parsed plan plus deterministic topologicalOrder, breaking equal-ready ties by original plan order.
```

- [ ] **Step 4: Build prompts that expose no provider choice to Manager**

Add `buildManagerPlanPrompt`, `buildManagerRevisionPrompt`, and these Advisor builders:

```ts
// src/server/prompts/advisor.ts
export function buildPreflightPrompt(input: {
  draft: TaskDraftVersion;
  plan: ManagerPlan;
  commandIds: string[];
  passNumber: 1 | 2;
}): string;

export function buildDeliveryPrompt(input: {
  plan: ManagerPlan;
  diffArtifactId: string;
  workerResultArtifactIds: string[];
  qaResultArtifactIds: string[];
  passNumber: 1 | 2;
}): string;
```

Every prompt states:

```text
- Provider/model assignment is owned by the scheduler and must not appear in briefs.
- Preflight changes must remain inside the frozen draft.
- Advisor returns only approve/reject, blockingFindings, requestedChanges, and risks.
- Advisor cannot waive deterministic QA.
- Pass 2 is final; a second rejection blocks the run.
```

- [ ] **Step 5: Run plan tests and typecheck**

Run:

```bash
npx vitest run test/server/plan-validator.test.ts test/shared/contracts.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit bounded planning**

Run:

```bash
npm run format
git diff --check
git add src/server/orchestrator/plan-validator.ts src/server/prompts/manager.ts src/server/prompts/advisor.ts test/server/plan-validator.test.ts
git commit -m "feat: validate bounded execution plans"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 11: Isolate Writers and Enforce Path Ownership

**Files:**

- Create: `src/server/git/worktrees.ts`
- Create: `test/server/worktrees.test.ts`
- Modify: `src/server/git/repository.ts`
- Modify: `src/server/db/run-store.ts`

**Interfaces:**

- Consumes: `GitClient`, `RepositoryService.assertCleanAt`, validated `TaskBrief`, app worktree root, and run/task persistence.
- Produces: `WorktreeService.prepareRun`, `createTaskWorktree`, `validateAndCommit`, `integrateCommit`, `resolveConflict`, and `applyToRoot`. The scheduler and engine never run raw Git commands.

- [ ] **Step 1: Write failing Git isolation tests**

Create `test/server/worktrees.test.ts` covering:

```text
- prepareRun refuses dirty root, detached HEAD, wrong branch, or moved HEAD
- integration and task worktrees are created under configured app data, never under selected root
- branch names are cozy/<short-run-id>/<task-id> and cozy/<short-run-id>/integration
- task branch starts from current integration HEAD at dispatch time
- changed file equal to an allowed path is accepted
- descendants of an allowed directory are accepted
- string-prefix sibling src/ab is rejected when only src/a is allowed
- forbidden paths win over allowed ancestors
- untracked, deleted, renamed, and modified paths are all detected
- pre-staged files and a Worker-created commit/branch/HEAD move are rejected
- any new symlink or non-regular file is a policy violation
- app stages only validated paths and creates one commit with fixed local author flags
- write task with no changes returns no_changes
- policy violation creates no commit and preserves the worktree
- root status remains clean after worktree commit and integration
- hostile pre-commit, commit-msg, post-commit, post-merge, and post-checkout hooks are not executed by app-owned Git mutations
- apply refuses changed root and performs only git merge --ff-only
```

- [ ] **Step 2: Run worktree tests and confirm the missing service**

Run:

```bash
npx vitest run test/server/worktrees.test.ts
```

Expected: FAIL because `src/server/git/worktrees.ts` does not exist.

- [ ] **Step 3: Implement checked app-data paths and branch names**

Create `src/server/git/worktrees.ts` with:

```ts
export type PreparedRun = {
  integrationBranch: string;
  integrationWorktree: string;
};
export type TaskWorktree = {
  branch: string;
  path: string;
  baseCommit: string;
};
export type ValidatedCommit = {
  commitSha: string;
  changedFiles: string[];
};

export class WorktreeService {
  constructor(
    private readonly git: GitClient,
    private readonly repositories: RepositoryService,
    private readonly root: string,
    private readonly emptyHooksDir: string,
  ) {}
  prepareRun(input: {
    projectId: string;
    runId: string;
    repositoryRoot: string;
    branch: string;
    baseCommit: string;
    signal: AbortSignal;
  }): Promise<PreparedRun>;
  createTaskWorktree(input: {
    projectId: string;
    runId: string;
    task: TaskBrief;
    integrationWorktree: string;
    signal: AbortSignal;
  }): Promise<TaskWorktree>;
  validateAndCommit(input: {
    task: TaskBrief;
    worktree: TaskWorktree;
    signal: AbortSignal;
  }): Promise<ValidatedCommit>;
  integrateCommit(input: {
    integrationWorktree: string;
    commitSha: string;
    signal: AbortSignal;
  }): Promise<{ conflictFiles: string[] }>;
  resolveConflict(input: {
    integrationWorktree: string;
    conflictFiles: string[];
    signal: AbortSignal;
  }): Promise<string>;
  applyToRoot(input: {
    repositoryRoot: string;
    expectedBranch: string;
    expectedBaseCommit: string;
    integrationBranch: string;
    signal: AbortSignal;
  }): Promise<string>;
}
```

Use this exact containment helper before every directory creation:

```ts
import { relative, resolve } from "node:path";

export function assertInside(parent: string, child: string): string {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  const rel = relative(resolvedParent, resolvedChild);
  if (rel === "" || (!rel.startsWith("..") && !/^[A-Za-z]:/u.test(rel))) return resolvedChild;
  throw new AppError("path_outside_app_data", "Worktree path escaped app data", 500);
}
```

Use the first 12 hexadecimal characters of the UUID without hyphens for `<short-run-id>`. Reject task IDs that do not already pass `TaskBriefSchema`.

At startup create and verify `emptyHooksDir` as an empty app-owned directory beneath the data root. Prefix every app-owned mutating Git command (`branch`, `worktree add/remove`, `add`, `commit`, `cherry-pick`, `cherry-pick --continue/--abort`, and root `merge`) with `-c core.hooksPath=<emptyHooksDir>`. This prevents repository hooks from modifying the selected root or seeing the server environment. All Git child processes also receive `sanitizedChildEnv()`.

- [ ] **Step 4: Create integration and task worktrees without touching root files**

`prepareRun` performs:

```text
RepositoryService.assertCleanAt(root, branch, baseCommit)
git branch cozy/<short-run-id>/integration <baseCommit>
git worktree add <integration-path> cozy/<short-run-id>/integration
```

If branch or worktree creation fails, remove only refs/directories proven to belong to this not-yet-started run and return `worktree_creation_failed`. Do not clean existing run paths.

`createTaskWorktree` reads `git rev-parse HEAD` in the integration worktree, then performs:

```text
git branch cozy/<short-run-id>/<task-id> <integration-head>
git worktree add <task-path> cozy/<short-run-id>/<task-id>
```

This ensures serialized/overlapping tasks see already integrated predecessors while disjoint concurrent tasks may share the same integration base.

- [ ] **Step 5: Validate every changed path before staging**

Collect changes with:

```text
git diff --name-only -z --diff-filter=ACDMRTUXB
git diff --cached --name-only -z
git ls-files --others --exclude-standard -z
```

Before collecting paths, require `git rev-parse HEAD` to equal `TaskWorktree.baseCommit` and the current symbolic branch to equal `TaskWorktree.branch`. A model-created commit or branch/HEAD move is a policy violation; preserve the worktree and do not integrate it.

Reject pre-staged files. Merge and sort the first and third lists. For each path:

```text
- parse through RelativePathSchema
- require it to be equal to or beneath one allowed path
- require it not to be equal to or beneath any forbidden path
- for existing paths, lstat must be a regular file and realpath must remain inside the task worktree
- deleted paths remain valid when ownership permits them
```

When valid, run:

```text
git -c core.hooksPath=<emptyHooksDir> add -- <each exact validated path>
git -c core.hooksPath=<emptyHooksDir> -c user.name=Cozy-Agent-Office -c user.email=cozy-agent@localhost commit -m "cozy: <task.id> <task.title>"
git rev-parse HEAD
```

Never run `git add .` or change repository Git config.

- [ ] **Step 6: Integrate, handle one conflict, and apply safely**

`integrateCommit` runs `git -c core.hooksPath=<emptyHooksDir> cherry-pick <sha>`. On conflict, retain cherry-pick state and return NUL-parsed `git diff --name-only --diff-filter=U -z`. A conflict repair Worker receives exactly those files as `allowedPaths`. `resolveConflict` requires zero unmerged files, stages only conflict files, then runs `git -c core.hooksPath=<emptyHooksDir> -c core.editor=true cherry-pick --continue` with fixed author environment and returns integration HEAD. This prevents hooks and editor prompts on every OS. If resolution fails, run the similarly hook-disabled `cherry-pick --abort` and block.

`applyToRoot` re-runs `assertCleanAt`, verifies integration branch descends from base with `git merge-base --is-ancestor`, then runs:

```text
git -c core.hooksPath=<emptyHooksDir> merge --ff-only <integration-branch>
git rev-parse HEAD
```

It never checks out files, resets, stashes, or force-updates a branch.

- [ ] **Step 7: Run all Git integration tests**

Run:

```bash
npx vitest run test/server/worktrees.test.ts test/server/repository.test.ts
npm run typecheck
```

Expected: all tests PASS on the current OS; TypeScript exits 0; temporary repositories are removed by test cleanup.

- [ ] **Step 8: Commit isolated write ownership**

Run:

```bash
npm run format
git diff --check
git add src/server/git/worktrees.ts src/server/git/repository.ts src/server/db/run-store.ts test/server/worktrees.test.ts
git commit -m "feat: isolate and validate worker writes"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 12: Add Capability Filtering, Retry, and Provider Fallback

**Files:**

- Create: `src/server/orchestrator/attempts.ts`
- Create: `test/server/attempts.test.ts`
- Modify: `src/server/db/run-store.ts`

**Interfaces:**

- Consumes: role profiles, current provider statuses, adapter registry/execution, artifacts, and run/attempt persistence.
- Produces: `AttemptRunner.execute(input, signal): Promise<AttemptOutcome>`; scheduler and engine use this for every model-backed action.

- [ ] **Step 1: Write a failing bounded-attempt matrix**

Create `test/server/attempts.test.ts` with fake adapter outcomes and these assertions:

```text
- incompatible candidates are skipped without an attempt row
- no compatible candidate returns provider_capability_unavailable
- success stops the chain
- transient failure retries the same candidate exactly once, then falls back
- timeout counts as transient
- authentication and quota failures have zero same-provider retries and fall back immediately
- invalid structured output receives one schema-repair prompt on the same candidate
- a second invalid structured output falls back
- abort stops the current process and starts no fallback
- every launched call has one started and one finished attempt row
- raw provider error text is redacted in persisted diagnostics
- maximum calls for a three-candidate chain is bounded and asserted
```

- [ ] **Step 2: Run the attempt test and confirm the missing runner**

Run:

```bash
npx vitest run test/server/attempts.test.ts
```

Expected: FAIL because `src/server/orchestrator/attempts.ts` does not exist.

- [ ] **Step 3: Define stable attempt inputs and outcomes**

Create `src/server/orchestrator/attempts.ts` with:

```ts
export type RequiredCapability = "readOnly" | "worktreeWrite";
export type AttemptInput = {
  profile: RoleProfile;
  requiredCapability: RequiredCapability;
  request: Omit<ProviderRequest, "model" | "profileId">;
  repairPrompt: (invalidOutput: unknown) => string;
};
export type AttemptOutcome = {
  provider: ProviderId;
  model: string | null;
  execution: ProviderExecution;
  launchedAttempts: number;
};

export class AttemptRunner {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly runs: RunStore,
    private readonly runtime: ProviderRuntime,
  ) {}
  execute(input: AttemptInput, signal: AbortSignal): Promise<AttemptOutcome>;
}
```

Candidate eligibility is:

```ts
function supports(status: ProviderStatus, capability: RequiredCapability): boolean {
  return status.installed && status.authenticated && status.capabilities[capability];
}
```

Resolve each candidate with `registry.statusFor(candidate.provider)` immediately before dispatch so a stale copied status cannot authorize a call. A three-candidate chain launches at most six provider calls; assert that exact upper bound.

- [ ] **Step 4: Implement the bounded decision table exactly**

For each compatible candidate in profile order:

```text
transient or timeout:
  call 1 -> retry same candidate once
  call 2 -> next candidate

authentication or quota:
  call 1 -> next candidate

invalid_structured_output:
  call 1 -> execute one repairPrompt as call 2 on same candidate
  call 2 invalid -> next candidate

policy_violation, cancelled, or explicit non-retryable process error:
  stop chain and return the error

success:
  return immediately
```

The repair prompt contains only the output-contract name, Zod issue paths/messages, and at most 4,000 redacted characters from the invalid output. It never embeds raw stdout, stderr, credentials, absolute paths, or the full context again.

Each launched call inserts an attempt row before spawn, appends `attempt.started`, updates the row after completion, then appends `attempt.finished`. Capability skips produce neither. If no candidate succeeds, throw an `AppError` containing provider/model/error-code summaries but no unredacted stdout/stderr.

- [ ] **Step 5: Run attempt and provider contracts**

Run:

```bash
npx vitest run test/server/attempts.test.ts test/server/providers.contract.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit bounded retry and fallback**

Run:

```bash
npm run format
git diff --check
git add src/server/orchestrator/attempts.ts src/server/db/run-store.ts test/server/attempts.test.ts
git commit -m "feat: add bounded provider fallback"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 13: Schedule Four Worker Profiles with Safe Parallelism

**Files:**

- Create: `src/server/prompts/worker.ts`
- Create: `src/server/orchestrator/scheduler.ts`
- Create: `test/server/scheduler.test.ts`
- Modify: `src/server/git/worktrees.ts`
- Modify: `src/server/db/run-store.ts`

**Interfaces:**

- Consumes: validated topological plan, four Worker profiles, `AttemptRunner`, `WorktreeService`, run pause state, and artifacts.
- Produces: `WorkerScheduler.run(input, signal): Promise<SchedulerResult>` with all task results integrated in dependency order.

- [ ] **Step 1: Write failing deterministic scheduling tests**

Create `test/server/scheduler.test.ts` using injected fake task executors and assert:

```text
- no more than three active Workers by default
- configured limit four is accepted and five is rejected
- each active task owns a distinct Worker profile
- ready tasks are selected by plan order
- dependencies wait for predecessor integration, not merely provider completion
- disjoint write ownership runs concurrently
- equal/ancestor/descendant ownership never overlaps in time
- read-only tasks may run beside writers because they use snapshots
- an Antigravity-only profile is eligible for write and ineligible for read_only
- capability-ineligible chains are skipped without consuming the profile
- dispatchPaused prevents new launches while active tasks finish
- persisted pause survives scheduler reconstruction and Resume wakes it
- cancel aborts active tasks and launches no new tasks
- failed required task stops dependents and yields a stable failure report
- one cherry-pick conflict creates exactly one conflict-repair task
- unresolved repair or a second conflict blocks scheduling
```

- [ ] **Step 2: Run scheduler tests and confirm the missing scheduler**

Run:

```bash
npx vitest run test/server/scheduler.test.ts
```

Expected: FAIL because `src/server/orchestrator/scheduler.ts` does not exist.

- [ ] **Step 3: Build a Worker prompt that cannot expand ownership**

Create `src/server/prompts/worker.ts`:

```ts
import type { TaskBrief } from "../../shared/contracts.js";

export function buildWorkerPrompt(input: {
  brief: TaskBrief;
  dependencySummaries: string[];
  projectRules: string[];
}): string {
  return [
    "You are a bounded Worker in Cozy Agent Office.",
    `Mode: ${input.brief.mode}`,
    "Complete only the supplied brief. Do not broaden scope, change provider settings, commit, merge, push, or edit the root repository.",
    "The app will validate paths and create the commit.",
    JSON.stringify({
      brief: input.brief,
      dependencySummaries: input.dependencySummaries,
      projectRules: input.projectRules,
    }),
  ].join("\n\n");
}

export function buildConflictPrompt(conflictFiles: string[]): string {
  return [
    "Resolve only the listed Git conflict files in the current integration worktree.",
    "Preserve both accepted task intents, remove all conflict markers, and do not commit.",
    JSON.stringify({ conflictFiles }),
  ].join("\n\n");
}
```

- [ ] **Step 4: Define the injected scheduler boundary**

Create `src/server/orchestrator/scheduler.ts` with:

```ts
export type SchedulerInput = {
  runId: string;
  projectId: string;
  plan: ValidatedPlan;
  contextSnapshotId: string;
  workerProfiles: RoleProfile[];
  integrationWorktree: string;
  concurrency: number;
};
export type SchedulerResult = {
  completedTaskIds: string[];
  resultArtifactIds: string[];
  integrationHead: string;
};

export type WorkerExecutionPort = {
  execute(input: {
    task: TaskBrief;
    profile: RoleProfile;
    cwd: string;
    signal: AbortSignal;
  }): Promise<WorkerResult>;
  resolveConflict(input: {
    conflictFiles: string[];
    profile: RoleProfile;
    cwd: string;
    signal: AbortSignal;
  }): Promise<WorkerResult>;
};

export class WorkerScheduler {
  constructor(
    private readonly runs: RunStore,
    private readonly worktrees: WorktreeService,
    private readonly contexts: ContextSnapshotService,
    private readonly workers: WorkerExecutionPort,
    private readonly realtime: RealtimeHub,
  ) {}
  run(input: SchedulerInput, signal: AbortSignal): Promise<SchedulerResult>;
  resume(runId: string): void;
}
```

- [ ] **Step 5: Implement one bounded event loop**

Use this algorithm without a queue dependency:

```text
1. Validate concurrency is integer 1..4.
2. Load persisted task states and dispatchPaused before each loop.
3. A task is ready only when every dependency is completed and integrated.
4. Compute idle Worker profiles in worker-1..worker-4 order.
5. Filter ready/profile pairs by required provider capability.
6. Reject a write candidate when any active write path overlaps through pathsOverlap().
7. Dispatch until active.size equals concurrency or no safe pair exists. A write task gets its app-owned task worktree; a read-only task gets a fresh disposable materialization of input.contextSnapshotId and never receives a worktree path.
8. Persist task running and task.started before invoking WorkerExecutionPort.
9. Await Promise.race(active promises).
10. For read_only success, verify its disposable context hash is unchanged, store result, mark completed, and remove only that disposable copy in finally.
11. For write success, validateAndCommit then integrateCommit before marking completed.
12. On first integration conflict, persist integration_conflict, invoke one conflict repair with a free compatible Worker profile, verify only conflict files changed, and continue cherry-pick.
13. On a second conflict or unresolved files, set run blocked and stop.
14. On task failure, mark task failed, mark not-yet-started dependents blocked, and stop.
15. If paused with no active work, await an in-memory Resume promise; reconstructing the scheduler reads persisted dispatchPaused and remains paused.
16. Abort exits after active executions settle and returns cancelled without dispatching.
17. When all tasks complete, return integration HEAD and result artifacts in topological order.
```

The scheduler does not implement retry logic; WorkerExecutionPort calls `AttemptRunner` once per assigned task.

- [ ] **Step 6: Run scheduler, attempt, and worktree tests**

Run:

```bash
npx vitest run test/server/scheduler.test.ts test/server/attempts.test.ts test/server/worktrees.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit deterministic parallel scheduling**

Run:

```bash
npm run format
git diff --check
git add src/server/prompts/worker.ts src/server/orchestrator/scheduler.ts src/server/git/worktrees.ts src/server/db/run-store.ts test/server/scheduler.test.ts
git commit -m "feat: schedule bounded parallel workers"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 14: Run Deterministic QA and One Bounded Repair

**Files:**

- Create: `src/server/prompts/qa.ts`
- Create: `src/server/orchestrator/qa.ts`
- Create: `test/server/qa.test.ts`
- Modify: `src/server/db/run-store.ts`

**Interfaces:**

- Consumes: approved `CommandSpec[]`, integration worktree, `ProcessSupervisor`, artifact store, QA role profile, `AttemptRunner`, and Worker repair port.
- Produces: `QaRunner.run(input, signal): Promise<QaReport>` with authoritative exit codes and at most one repair cycle.

- [ ] **Step 1: Write failing QA authority tests**

Create `test/server/qa.test.ts` covering:

```text
- commands execute in configured position order with shell=false
- cwd is always the integration worktree plus CommandSpec.cwd
- CI=1 is present; provider/API/app token environment variables are absent while ordinary PATH/HOME/APPDATA values remain
- stdout/stderr each truncate at 2 MiB and retain artifacts
- optional failure is reported and does not block
- required failure stops the first command pass
- timeout and cancellation are distinct statuses
- QA diagnosis runs read-only from output/diff artifacts, not integration cwd
- repair paths are intersected with the union of original write allowedPaths
- empty repair ownership blocks rather than broadening scope
- exactly one repair executes, then all required commands rerun from the first required command
- a second required failure blocks delivery
- QA model text cannot turn a non-zero required exit into pass
```

- [ ] **Step 2: Run QA tests and confirm the missing runner**

Run:

```bash
npx vitest run test/server/qa.test.ts
```

Expected: FAIL because `src/server/orchestrator/qa.ts` does not exist.

- [ ] **Step 3: Build a diagnosis prompt with deterministic authority**

Create `src/server/prompts/qa.ts`:

```ts
export function buildQaDiagnosisPrompt(input: {
  commandId: string;
  exitCode: number | null;
  stdoutArtifactId: string;
  stderrArtifactId: string;
  diffArtifactId: string;
  allowedRepairPaths: string[];
}): string {
  return [
    "You are QA. The command exit code is authoritative and cannot be waived.",
    "Diagnose the failure and propose one bounded repair within allowedRepairPaths.",
    "Return summary, suspectedPaths, repairObjective, and acceptanceCriteria as JSON.",
    JSON.stringify(input),
  ].join("\n\n");
}
```

- [ ] **Step 4: Define QA records and runner**

Create `src/server/orchestrator/qa.ts` with:

```ts
export type QaCommandResult = {
  commandId: string;
  required: boolean;
  status: "passed" | "failed" | "timed_out" | "cancelled";
  exitCode: number | null;
  durationMs: number;
  stdoutArtifactId: string;
  stderrArtifactId: string;
};
export type QaReport = {
  passed: boolean;
  cycleCount: 1 | 2;
  results: QaCommandResult[];
  diagnosisArtifactId: string | null;
  repairResultArtifactId: string | null;
};

export class QaRunner {
  constructor(
    private readonly supervisor: ProcessSupervisor,
    private readonly artifacts: ArtifactStore,
    private readonly attempts: AttemptRunner,
    private readonly runs: RunStore,
    private readonly repairWorker: WorkerExecutionPort,
  ) {}
  run(
    input: {
      runId: string;
      integrationWorktree: string;
      commands: CommandSpec[];
      qaProfile: RoleProfile;
      repairProfile: RoleProfile;
      originalWritePaths: string[];
      diffArtifactId: string;
    },
    signal: AbortSignal,
  ): Promise<QaReport>;
}
```

- [ ] **Step 5: Implement one command loop and one repair loop**

For each command use:

```ts
{
  executable: command.executable,
  args: command.args,
  cwd: integrationWorktree,
  stdin: "",
  timeoutMs: command.timeoutMs,
  env: sanitizedChildEnv(process.env, { CI: "1" }),
}
```

Persist `qa.command.started` before spawn and `qa.command.finished` after artifact finalization. First-pass optional failures do not stop later commands; first-pass required failure stops and triggers diagnosis. Diagnosis uses a disposable artifact-only snapshot. Filter `suspectedPaths` to those owned by `originalWritePaths`, then execute one write repair in the integration worktree. Re-run every required command in configured order. Any required non-zero, timeout, or cancellation makes `passed=false`. There is no third cycle.

- [ ] **Step 6: Run QA, process, and artifact tests**

Run:

```bash
npx vitest run test/server/qa.test.ts test/server/process.test.ts test/server/artifacts.test.ts
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit deterministic QA**

Run:

```bash
npm run format
git diff --check
git add src/server/prompts/qa.ts src/server/orchestrator/qa.ts src/server/db/run-store.ts test/server/qa.test.ts
git commit -m "feat: add authoritative qa and repair"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 15: Implement the Persisted Workflow Engine and Recovery

**Files:**

- Create: `src/server/orchestrator/state-machine.ts`
- Create: `src/server/orchestrator/engine.ts`
- Create: `test/server/engine.test.ts`
- Modify: `src/server/db/run-store.ts`
- Modify: `src/server/cli.ts`

**Interfaces:**

- Consumes: draft/context freezing, planning/Advisor prompts, `AttemptRunner`, plan validator, worktrees, scheduler, QA, artifacts, stores, and realtime hub.
- Produces: `OrchestratorEngine.start`, `pause`, `resume`, `cancel`, `retryInterruptedTask`, `apply`, and startup recovery.

- [ ] **Step 1: Write failing state-machine and full-flow tests**

Create `test/server/engine.test.ts` using only fake adapters and temporary Git repositories. Cover:

```text
- every legal state edge in the approved state list
- every illegal state edge rejected before persistence
- Start freezes approved draft/context hashes and rejects stale context
- Manager plan -> Advisor preflight -> Workers -> QA -> Advisor delivery -> Manager synthesis -> ready_to_apply
- preflight rejection -> one Manager revision -> one final preflight review
- second preflight rejection blocks before any Worker starts
- delivery rejection -> one repair -> all required QA rerun -> one final delivery review
- second delivery rejection blocks
- Manager synthesis cannot run before both Advisor gate types pass
- minimum successful Advisor semantic calls is two and maximum is four
- all required QA failures block before delivery
- root remains clean and at base in ready_to_apply
- apply changes root only after explicit call
- pause persists independently from run state
- cancel aborts active children and never applies
- startup marks running attempts interrupted and sets affected run blocked with reason interrupted
- interrupted work is not relaunched automatically
- retryInterruptedTask creates a clean replacement worktree and keeps prior artifacts
- retryInterruptedTask is rejected for blocked reasons other than interrupted and for interruptions without a task ID
- every emitted event already exists in SQLite when the fake realtime hub receives it
```

- [ ] **Step 2: Run engine tests and confirm missing engine modules**

Run:

```bash
npx vitest run test/server/engine.test.ts
```

Expected: FAIL because state-machine and engine modules do not exist.

- [ ] **Step 3: Implement explicit legal transitions**

Create `src/server/orchestrator/state-machine.ts`:

```ts
import type { RunState } from "../../shared/contracts.js";
import { AppError } from "../errors.js";

const LEGAL: Record<RunState, readonly RunState[]> = {
  planned: ["advisor_preflight", "cancelled", "failed", "blocked"],
  advisor_preflight: ["dispatching", "cancelled", "failed", "blocked"],
  dispatching: ["working", "integrating", "cancelled", "failed", "blocked"],
  working: ["working", "integrating", "testing", "cancelled", "failed", "blocked"],
  integrating: ["working", "integration_conflict", "testing", "cancelled", "failed", "blocked"],
  integration_conflict: ["integrating", "cancelled", "failed", "blocked"],
  testing: ["testing", "advisor_delivery", "cancelled", "failed", "blocked"],
  advisor_delivery: ["testing", "ready_to_apply", "cancelled", "failed", "blocked"],
  ready_to_apply: ["applied", "cancelled", "blocked"],
  applied: [],
  failed: [],
  blocked: [],
  cancelled: [],
};

export function assertTransition(from: RunState, to: RunState): void {
  if (!LEGAL[from].includes(to)) {
    throw new AppError("illegal_run_transition", `Cannot transition ${from} -> ${to}`, 409);
  }
}
```

Keep `blocked` terminal in `LEGAL`. Add a separate, narrowly named guard rather than widening the normal table:

```ts
export function assertInterruptedRetry(run: RunSnapshot, taskId: string): void {
  const task = run.tasks.find((candidate) => candidate.id === taskId);
  if (run.state !== "blocked" || run.blockReason !== "interrupted" || task?.status !== "running") {
    throw new AppError(
      "interrupted_retry_unavailable",
      "Only an interrupted running task can retry",
      409,
    );
  }
}
```

After this guard, `retryInterruptedTask` performs a dedicated atomic recovery operation: preserve the old attempt/worktree, create a new task worktree from current integration HEAD with suffix `-retry-<attemptNumber>`, set only that task back to queued with the replacement path, set run state to `dispatching` and blockReason null, append `run.state.changed` with cause `owner_retry_interrupted`, commit, publish, then create a controller. No generic transition helper can move another blocked run.

`cancel` has one parallel special case: a blocked run with blockReason `interrupted` may atomically move to `cancelled` with event cause `owner_cancel_interrupted`. Other blocked/failed/applied runs remain terminal and reject Cancel.

- [ ] **Step 4: Define the engine boundary and active-run controllers**

Create `src/server/orchestrator/engine.ts`:

```ts
export type StartRunInput = {
  projectId: string;
  draftId: string;
  expectedDraftVersion: number;
  concurrency: 1 | 2 | 3 | 4;
};

export class OrchestratorEngine {
  private readonly controllers = new Map<string, AbortController>();
  start(input: StartRunInput): Promise<RunSnapshot>;
  pause(runId: string): RunSnapshot;
  resume(runId: string): RunSnapshot;
  cancel(runId: string): Promise<RunSnapshot>;
  retryInterruptedTask(runId: string, taskId: string): Promise<RunSnapshot>;
  apply(runId: string): Promise<RunSnapshot>;
  recoverInterruptedRuns(): RunSnapshot[];
}
```

Inject all collaborators through the constructor; do not create global singletons.

- [ ] **Step 5: Implement the complete bounded engine sequence**

`start` returns after run creation and schedules its execution without awaiting completion. The background execution performs exactly:

```text
1. Load project, current draft version, role profiles, commands, and selected snapshot.
2. Require expectedDraftVersion, clean root, same branch/HEAD, and ContextSnapshotService.verifyUnchanged.
3. Create the integration branch/worktree through WorktreeManager before opening a SQLite transaction. Git and filesystem operations are not described as transactional.
4. In one SQLite transaction: mark the draft running; persist the run with frozen IDs/hashes and the already-created integration paths; append run.created. Publish only the returned event after commit.
5. If step 4 fails, remove only that unregistered integration worktree and branch after revalidating their app-owned absolute paths; leave the draft runnable and root working tree unchanged.
6. Invoke Manager read-only with outputContract="manager_plan"; validate and persist the plan artifact.
7. Transition to advisor_preflight and invoke Advisor pass 1 with outputContract="advisor_review".
8. If rejected, invoke one Manager revision inside frozen scope, validate, then invoke Advisor pass 2. A second rejection blocks.
9. Persist approved plan/tasks; transition dispatching; call WorkerScheduler.
10. Persist the integration diff artifact; transition testing; call QaRunner. Failed required QA blocks.
11. Transition advisor_delivery and invoke Advisor pass 1 with outputContract="advisor_review". If rejected, execute one repair bounded to original write ownership, run every required QA command again, then invoke Advisor pass 2. Failure or second rejection blocks.
12. Invoke Manager read-only with outputContract="delivery_synthesis" and the approved plan, diff, Worker results, QA, and Advisor artifacts.
13. Persist evidence; transition ready_to_apply; append run.ready_to_apply; stop without applying.
```

Every transition helper executes `assertTransition`, updates the run, appends the event, commits, then publishes. Catch blocks classify `cancelled`, policy/user-precondition `blocked`, and exhausted/unexpected execution `failed`. No catch path applies or deletes work.

`pause` persists `dispatchPaused=true` before calling scheduler state. `resume` persists false then wakes the scheduler. `cancel` aborts the controller and waits for active child cleanup before state `cancelled`. `apply` is valid only from `ready_to_apply` and delegates to `WorktreeService.applyToRoot`.

`recoverInterruptedRuns` marks attempts `interrupted`, converts any non-durable active run to `blocked` with reason `interrupted`, preserves its last workflow state in the event payload, leaves the interrupted task status `running` as recovery evidence, and creates no controller. Retry is offered only when an interrupted attempt has a task ID; interruption during planning, integration, QA, or Advisor review requires Cancel or creating a new draft/run.

- [ ] **Step 6: Run the fake-provider end-to-end engine suite**

Run:

```bash
npx vitest run test/server/engine.test.ts test/server/scheduler.test.ts test/server/qa.test.ts
npm run typecheck
```

Expected: all tests PASS, no real provider quota is used, and TypeScript exits 0.

- [ ] **Step 7: Commit the workflow engine**

Run:

```bash
npm run format
git diff --check
git add src/server/orchestrator/state-machine.ts src/server/orchestrator/engine.ts src/server/db/run-store.ts src/server/cli.ts test/server/engine.test.ts
git commit -m "feat: orchestrate bounded coding runs"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 16: Expose Run Controls, Diffs, Artifacts, and Safe Cleanup

**Files:**

- Create: `src/server/routes/runs.ts`
- Create: `src/server/routes/storage.ts`
- Create: `test/server/routes.test.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/db/run-store.ts`
- Modify: `src/shared/api.ts`

**Interfaces:**

- Consumes: `OrchestratorEngine`, stores, artifact root, `RunActionRequestSchema`, and authenticated Fastify hooks.
- Produces: the complete v0.1 HTTP surface consumed by React. It exposes typed actions only and no arbitrary process, Git, filesystem, or shell route.

- [ ] **Step 1: Write failing API authority and cleanup tests**

Create `test/server/routes.test.ts` covering:

```text
- every /api route requires Bearer token and rejects wrong Origin
- malformed bodies return 400 with a stable Zod validation code
- POST draft/start returns 202 plus a run snapshot
- stale expectedUpdatedAt returns 409 and performs no action
- only Owner HTTP routes can pause, resume, cancel, retry, and apply
- apply before ready_to_apply returns 409
- GET run snapshot, events, diff, QA, attempts, and artifact metadata
- artifact reads resolve only DB-registered relative paths beneath artifact root
- path traversal and unknown artifact IDs return 404 without path disclosure
- no route accepts executable, args, command, shell, cwd, branch name, or raw Git input from a run-control body
- storage usage counts artifacts and worktrees owned by the selected run
- cleanup requires confirmation text equal to the run ID
- cleanup refuses active and ready_to_apply runs
- cleanup deletes registered files one by one, preserves DB audit rows, and never recursively deletes a computed unverified path
- route table contains no raw-shell or terminal endpoint
```

- [ ] **Step 2: Run route tests and confirm missing routes**

Run:

```bash
npx vitest run test/server/routes.test.ts
```

Expected: FAIL because run and storage routes do not exist.

- [ ] **Step 3: Add remaining API request schemas**

Append to `src/shared/api.ts`:

```ts
export const StartRunRequestSchema = z.object({
  expectedDraftVersion: z.number().int().positive(),
  concurrency: z.number().int().min(1).max(4).default(3),
});
export const RetryTaskRequestSchema = z.object({
  taskId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().datetime(),
});
export const CleanupRunRequestSchema = z.object({ confirmation: z.string().uuid() });
```

In the same file, extend the Task 1 imports with `AdvisorReviewSchema`, `ProfileIdSchema`, `ProviderIdSchema`, `RunEventSchema`, `RunSnapshotSchema`, and `TaskDraftVersionSchema`, then add these canonical response schemas and inferred types. Server routes validate before sending; `ApiClient` validates after receiving:

```ts
export const ConversationRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  role: RoleIdSchema,
  profileId: ProfileIdSchema,
  contextSnapshotId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const MessageRecordSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  sender: z.enum(["owner", "manager", "worker", "advisor", "qa"]),
  body: z.string().min(1).max(40_000),
  sourceMessageIds: z.array(z.string().uuid()),
  artifactIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
});
export const ArtifactMetadataSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  taskId: z.string().nullable(),
  kind: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export const DiffViewSchema = z.object({
  artifact: ArtifactMetadataSchema,
  stat: z.string(),
  patch: z.string(),
  truncated: z.boolean(),
});
export const QaCommandResultViewSchema = z.object({
  commandId: z.string(),
  label: z.string(),
  cycleNumber: z.number().int().min(1).max(2),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(["passed", "failed", "cancelled", "timed_out"]),
  stdoutArtifactId: z.string().uuid().nullable(),
  stderrArtifactId: z.string().uuid().nullable(),
});
export const QaReportViewSchema = z.object({
  status: z.enum(["passed", "failed", "blocked"]),
  repairAttempted: z.boolean(),
  diagnosisArtifactId: z.string().uuid().nullable(),
  commands: z.array(QaCommandResultViewSchema),
});
export const AttemptViewSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().nullable(),
  role: RoleIdSchema,
  profileId: ProfileIdSchema,
  provider: ProviderIdSchema,
  model: z.string().nullable(),
  stage: z.string(),
  attemptNumber: z.number().int().positive(),
  status: z.enum(["running", "succeeded", "failed", "interrupted", "cancelled"]),
  exitCode: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  stdoutArtifactId: z.string().uuid().nullable(),
  stderrArtifactId: z.string().uuid().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
});
export const AdvisorReviewViewSchema = z.object({
  gate: z.enum(["preflight", "delivery"]),
  pass: z.number().int().min(1).max(2),
  review: AdvisorReviewSchema,
  artifactId: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export const RunEvidenceSchema = z.object({
  run: RunSnapshotSchema,
  diff: DiffViewSchema.nullable(),
  qa: QaReportViewSchema.nullable(),
  attempts: z.array(AttemptViewSchema),
  advisorReviews: z.array(AdvisorReviewViewSchema),
  synthesisArtifactId: z.string().uuid().nullable(),
});
export const RunStorageSchema = z.object({
  runId: z.string().uuid(),
  artifactCount: z.number().int().nonnegative(),
  artifactBytes: z.number().int().nonnegative(),
  worktreeCount: z.number().int().nonnegative(),
  worktreeBytes: z.number().int().nonnegative(),
  cleanupEligible: z.boolean(),
});
export const CleanupResultSchema = z.object({
  runId: z.string().uuid(),
  deletedArtifacts: z.number().int().nonnegative(),
  deletedWorktrees: z.number().int().nonnegative(),
  freedBytes: z.number().int().nonnegative(),
  auditPreserved: z.literal(true),
});

export const ConversationListResponseSchema = z.array(ConversationRecordSchema);
export const MessageListResponseSchema = z.array(MessageRecordSchema);
export const RunEventsResponseSchema = z.array(RunEventSchema);
export { TaskDraftVersionSchema };

export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;
export type MessageRecord = z.infer<typeof MessageRecordSchema>;
export type DiffView = z.infer<typeof DiffViewSchema>;
export type QaReportView = z.infer<typeof QaReportViewSchema>;
export type AttemptView = z.infer<typeof AttemptViewSchema>;
export type AdvisorReviewView = z.infer<typeof AdvisorReviewViewSchema>;
export type RunEvidence = z.infer<typeof RunEvidenceSchema>;
export type RunStorage = z.infer<typeof RunStorageSchema>;
export type CleanupResult = z.infer<typeof CleanupResultSchema>;
```

- [ ] **Step 4: Register the exact run API**

Create `src/server/routes/runs.ts` with:

```text
POST /api/drafts/:draftId/start
GET  /api/runs/:runId
GET  /api/runs/:runId/events?after=<sequence>
GET  /api/runs/:runId/diff
GET  /api/runs/:runId/qa
GET  /api/runs/:runId/attempts
GET  /api/artifacts/:artifactId
POST /api/runs/:runId/pause
POST /api/runs/:runId/resume
POST /api/runs/:runId/cancel
POST /api/runs/:runId/retry-task
POST /api/runs/:runId/apply
```

For action routes, load the run and compare request `expectedUpdatedAt` before calling the engine. Return `202` for start/cancel operations still settling, `200` for persisted synchronous flags, and the current `RunSnapshot` in every success response.

`GET diff` returns a registered UTF-8 artifact containing:

```text
git diff --binary --stat <baseCommit>..HEAD
git diff --binary <baseCommit>..HEAD
```

Cap the API response at 5 MiB; larger diffs return metadata and a paged text endpoint limited to 256 KiB chunks. Never render binary bytes inline.

- [ ] **Step 5: Implement calculated storage and verified cleanup**

Create `src/server/routes/storage.ts`:

```text
GET    /api/storage
GET    /api/runs/:runId/storage
DELETE /api/runs/:runId/storage
```

The delete handler:

```text
1. Parse CleanupRunRequestSchema and require confirmation === runId.
2. Permit only applied, failed, blocked, or cancelled.
3. Query registered artifact files and recorded run worktree paths.
4. Resolve each file and require assertInside(config.dataDir, path).
5. Unlink files individually; ignore only ENOENT and record missing files.
6. Run git worktree remove <exact-recorded-path> for each recorded worktree.
7. Delete empty run directories only after assertInside and lstat directory checks.
8. Keep run/task/attempt/event rows and append a storage.cleaned audit event.
9. Return bytesFreed, filesDeleted, worktreesRemoved, and missingFiles.
```

- [ ] **Step 6: Run the complete server suite**

Run:

```bash
npx vitest run test/server
npm run typecheck
npm run build
```

Expected: all server tests PASS, typecheck exits 0, and build succeeds.

- [ ] **Step 7: Commit the HTTP surface**

Run:

```bash
npm run format
git diff --check
git add src/server/routes/runs.ts src/server/routes/storage.ts src/server/app.ts src/server/db/run-store.ts src/shared/api.ts test/server/routes.test.ts
git commit -m "feat: expose controlled run actions"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 17: Build the React Shell, Session Client, and Onboarding

**Files:**

- Create: `src/web/api.ts`
- Create: `src/web/store.tsx`
- Create: `src/web/App.tsx`
- Create: `src/web/styles/tokens.css`
- Create: `src/web/styles/global.css`
- Create: `src/web/components/TopBar.tsx`
- Create: `src/web/components/Onboarding.tsx`
- Create: `src/web/components/RoleSettings.tsx`
- Create: `test/web/App.test.tsx`
- Create: `test/web/Onboarding.test.tsx`
- Create: `test/web/RoleSettings.test.tsx`
- Modify: `src/web/main.tsx`

**Interfaces:**

- Consumes: authenticated API/WebSocket contracts and all shared schemas.
- Produces: `ApiClient`, `RealtimeClient`, `AppStoreProvider`, authenticated application bootstrap, project onboarding, context selection, command approval, and seven role-profile settings. Later UI tasks render inside this shell.

- [ ] **Step 1: Write failing browser-session and onboarding tests**

Create jsdom tests with `// @vitest-environment jsdom` and assert:

```text
- #session token moves to sessionStorage and disappears from location.hash
- token never enters localStorage or visible DOM
- every fetch has Authorization: Bearer and same-origin URL
- WebSocket waits for the server challenge, sends `{type:"auth",token,nonce}` before subscribe, and never reuses a nonce
- missing token renders a restart-server message and makes no API call
- onboarding accepts a pasted absolute repository path and has no fake browser file picker
- provider probe cards show installed/authenticated/version/capabilities/diagnostic
- Antigravity card shows **Verify login (uses one small subscription turn)** while unauthenticated and requires the exact confirmation phrase before calling the dedicated verification route
- command candidates are individually enabled, editable as executable plus argument chips, and never a raw shell textarea
- tracked context paths are selectable and excluded paths display reasons
- exactly seven role profiles render
- Manager/Advisor/QA disable write-only Antigravity with explanation
- each Worker permits independent primary/model/fallback configuration
- direct Worker chat capability warning appears when its chain lacks read-only fallback
- keyboard Tab reaches every onboarding control and visible focus class is present
```

- [ ] **Step 2: Run web tests and confirm missing UI modules**

Run:

```bash
npx vitest run test/web/App.test.tsx test/web/Onboarding.test.tsx test/web/RoleSettings.test.tsx
```

Expected: FAIL because React application modules do not exist.

- [ ] **Step 3: Implement token extraction and typed clients**

Create `src/web/api.ts`:

```ts
import {
  BootstrapResponseSchema,
  WsServerMessageSchema,
  type BootstrapResponse,
  type WsClientMessage,
} from "../shared/api.js";

const SESSION_KEY = "cozy-session";

export function consumeSessionToken(location = window.location): string | null {
  const parameters = new URLSearchParams(location.hash.slice(1));
  const incoming = parameters.get("session");
  if (incoming) {
    sessionStorage.setItem(SESSION_KEY, incoming);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    return incoming;
  }
  return sessionStorage.getItem(SESSION_KEY);
}

export class ApiClient {
  constructor(private readonly token: string) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init.headers,
        authorization: `Bearer ${this.token}`,
      },
    });
    const body = (await response.json()) as unknown;
    if (!response.ok) throw body;
    return body as T;
  }

  async bootstrap(): Promise<BootstrapResponse> {
    return BootstrapResponseSchema.parse(await this.request("/api/bootstrap"));
  }
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  constructor(
    private readonly token: string,
    private readonly onMessage: (message: ReturnType<typeof WsServerMessageSchema.parse>) => void,
  ) {}
  connect(runId: string | null, afterSequence: number): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket.addEventListener("open", () => {
      this.send({ type: "auth", token: this.token });
      this.send({ type: "subscribe", runId, afterSequence });
    });
    this.socket.addEventListener("message", (event) => {
      this.onMessage(WsServerMessageSchema.parse(JSON.parse(String(event.data))));
    });
  }
  send(message: WsClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }
  close(): void {
    this.socket?.close(1000, "client closed");
    this.socket = null;
  }
}
```

Validate endpoint-specific responses with their Zod schema when available; do not cast unvalidated run, provider, task, or event data.

- [ ] **Step 4: Implement one reducer-backed application store**

Create `src/web/store.tsx` with:

```ts
export type AppState = {
  phase: "booting" | "missing_session" | "onboarding" | "office" | "fatal";
  bootstrap: BootstrapResponse | null;
  selectedProjectId: string | null;
  selectedActorId: ProfileId;
  selectedTaskId: string | null;
  run: RunSnapshot | null;
  events: RunEvent[];
  reduceMotion: boolean;
  error: string | null;
};

export type AppAction =
  | { type: "bootstrapped"; value: BootstrapResponse }
  | { type: "missing_session" }
  | { type: "project_selected"; projectId: string }
  | { type: "run_snapshot"; run: RunSnapshot | null }
  | { type: "event_received"; event: RunEvent }
  | { type: "actor_selected"; actorId: ProfileId }
  | { type: "task_selected"; taskId: string | null }
  | { type: "reduce_motion"; value: boolean }
  | { type: "fatal"; message: string };
```

Export `AppStoreProvider`, `useAppState`, and `useAppDispatch`. Deduplicate events by `sequence`, sort ascending, and cap in-memory timeline to the latest 2,000 while older events remain queryable from the API.

- [ ] **Step 5: Establish the original visual token system and fixed shell geometry**

Create `src/web/styles/tokens.css`:

```css
:root {
  --ink-950: #1f1b24;
  --ink-800: #342a31;
  --wood-900: #4a332d;
  --wood-700: #6b4b3e;
  --wood-500: #a06b4f;
  --parchment-300: #f2d6a2;
  --parchment-100: #fff1cf;
  --moss-600: #708457;
  --moss-400: #9bad74;
  --teal-600: #4f746d;
  --blue-500: #6576a3;
  --rose-500: #b46061;
  --gold-400: #d8bf62;
  --danger-500: #cf5c55;
  --focus: #ffe28a;
  --topbar-height: 48px;
  --left-panel-width: 240px;
  --right-panel-width: 304px;
  --dock-height: 152px;
  --shell-gap: 8px;
  --shell-padding: 8px;
  --pixel-border: 3px solid var(--ink-950);
  color: var(--parchment-100);
  background: var(--ink-950);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

Create `src/web/styles/global.css` with reset, visible `:focus-visible`, buttons/forms, and this shell:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  min-width: 1280px;
  min-height: 720px;
  width: 100%;
  height: 100%;
  margin: 0;
}

.app-shell {
  min-width: 1280px;
  min-height: 720px;
  width: 100vw;
  height: 100dvh;
  padding: var(--shell-padding);
  gap: var(--shell-gap);
  display: grid;
  grid-template:
    "top top top" var(--topbar-height)
    "left office right" minmax(480px, 1fr)
    "dock dock dock" var(--dock-height)
    / var(--left-panel-width) minmax(704px, 1fr) var(--right-panel-width);
  overflow: hidden;
}

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

Do not reuse Stardew Valley or Pixel Agents colors; these tokens are the canonical project palette.

At exactly 1280×720 the horizontal equation is `16px outer padding + 16px gaps + 240px + 704px + 304px = 1280px`; the middle row is 488px high, so the 704×480 integer-scaled office fits without hiding either side panel. Add a unit assertion for both equations.

- [ ] **Step 6: Implement onboarding and capability-aware role settings**

`Onboarding.tsx` is a four-step accessible form:

```text
1. Repository: paste path, select/reuse project, show branch/HEAD/clean status.
2. Providers: probe cards with official install/login guidance and capability chips.
3. Commands & context: structured command rows plus tracked path tree and exclusions.
4. Roles: RoleSettings for Manager, four Workers, Advisor, and QA; save only after compatibility validation.
```

`RoleSettings.tsx` receives:

```ts
type RoleSettingsProps = {
  profiles: RoleProfile[];
  providers: ProviderStatus[];
  onChange(profiles: RoleProfile[]): void;
};
```

Each chain editor provides primary provider, optional model text/known alias, ordered fallback rows, timeout, and diagnostic. For Manager/Advisor/QA, disable candidates lacking `readOnly`. Workers may save mixed chains; show whether each candidate supports read, write, or both. Never expose raw provider auth material.

- [ ] **Step 7: Wire App bootstrap and top bar**

`App.tsx` consumes the token, bootstraps once, chooses onboarding when no configured project is ready, and otherwise renders `.app-shell` with reserved regions for later tasks. `TopBar.tsx` shows project, branch, run state, paused label, and disabled run controls until Task 21. Render errors as text with a retry action; do not use `alert()`.

Update `src/web/main.tsx` to import both CSS files and render:

```tsx
<StrictMode>
  <AppStoreProvider>
    <App />
  </AppStoreProvider>
</StrictMode>
```

- [ ] **Step 8: Run browser tests and production build**

Run:

```bash
npx vitest run test/web/App.test.tsx test/web/Onboarding.test.tsx test/web/RoleSettings.test.tsx
npm run typecheck
npm run build:web
```

Expected: all web tests PASS, TypeScript exits 0, and Vite builds `dist/web/index.html`.

- [ ] **Step 9: Commit the application shell**

Run:

```bash
npm run format
git diff --check
git add src/web test/web/App.test.tsx test/web/Onboarding.test.tsx test/web/RoleSettings.test.tsx
git commit -m "feat: add onboarding and role settings ui"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 18: Add Discussion, Direct Role Chat, and Draft Task UI

**Files:**

- Create: `src/web/components/ConversationDock.tsx`
- Create: `src/web/components/DraftEditor.tsx`
- Create: `test/web/ConversationDock.test.tsx`
- Modify: `src/web/App.tsx`
- Modify: `src/web/store.tsx`
- Modify: `src/web/api.ts`

**Interfaces:**

- Consumes: conversation/draft APIs, selected actor, context snapshots, and role capability diagnostics.
- Produces: the three visible modes **Discussion**, **Draft Task**, and **Execution**; Execution only starts through an explicit reviewed draft action in Task 21.

- [ ] **Step 1: Write failing interaction-authority tests**

Create `test/web/ConversationDock.test.tsx` covering:

```text
- dock defaults to Manager and labels current mode Discussion
- selecting a character switches the direct role conversation
- direct role header visibly says Read-only consultation
- Advisor direct chat displays additional premium usage warning before Send
- Antigravity-only Worker displays disabled Send and read-only fallback guidance
- selected prior messages and artifacts are explicit chips, not hidden context
- Send to Manager requires selected messages and preserves their IDs
- generated draft opens Draft Task mode with editable objective, scope, constraints, and acceptance criteria
- editing each list uses one item per row and preserves order
- no chat action renders Start, Pause, Cancel, Apply, terminal, or shell controls
- requirement change during an active run creates a revised draft banner and never mutates the current run
- Start Execution remains disabled until draft, context, command, provider, and clean-root preflight are valid
- keyboard and screen-reader labels identify sender, role, timestamp, and read-only status
```

- [ ] **Step 2: Run interaction tests and confirm missing components**

Run:

```bash
npx vitest run test/web/ConversationDock.test.tsx
```

Expected: FAIL because conversation components do not exist.

- [ ] **Step 3: Add exact API client methods**

Add these methods to `ApiClient`, each validating the matching response schema:

```ts
createConversation(projectId: string, body: unknown): Promise<ConversationRecord>;
listConversations(projectId: string): Promise<ConversationRecord[]>;
listMessages(conversationId: string): Promise<MessageRecord[]>;
sendMessage(conversationId: string, body: unknown): Promise<MessageRecord>;
forwardToManager(conversationId: string, messageIds: string[]): Promise<TaskDraftVersion>;
getDraft(draftId: string): Promise<TaskDraftVersion>;
updateDraft(draftId: string, body: unknown): Promise<TaskDraftVersion>;
```

Import these return types and schemas from the canonical Task 16 additions to `src/shared/api.ts`; do not redeclare browser-only response shapes.

- [ ] **Step 4: Implement ConversationDock without implicit context**

`ConversationDock.tsx` props:

```ts
type ConversationDockProps = {
  projectId: string;
  selectedActorId: ProfileId;
  activeRun: RunSnapshot | null;
  roleProfiles: RoleProfile[];
  providerStatuses: ProviderStatus[];
  contextSnapshotId: string;
  onDraftCreated(draft: TaskDraftVersion): void;
};
```

Render:

```text
- mode tabs: Discussion, Draft Task, Execution
- role portrait/name/provider/model and read-only badge
- scrollable semantic <ol> of messages
- explicit selected-context chips
- multiline composer with character counter
- additional-usage confirmation for Advisor
- Send and Send to Manager controls
- progress, provider diagnostic, quota/auth failure, and retry-copy states
```

Conversation messages remain selectable/copyable DOM text outside PixiJS.

- [ ] **Step 5: Implement editable immutable-version drafts**

`DraftEditor.tsx` accepts a `TaskDraftVersion`, keeps a form-local copy, and sends `PUT /api/drafts/:id`. After save, replace the displayed version with the returned N+1. Show source-message provenance and context snapshot hash. When an active run exists, label Save as **Save as new run draft** and never call a run route.

Under Scope show concise help: entries may be prose, while `path:src/feature` creates a mechanically enforced write boundary. Validate path-shaped entries client-side with the same shared schema and keep the server authoritative.

The component exposes:

```ts
type DraftEditorProps = {
  draft: TaskDraftVersion;
  activeRun: RunSnapshot | null;
  canStart: boolean;
  blockingReasons: string[];
  onSaved(draft: TaskDraftVersion): void;
  onRequestStart(draft: TaskDraftVersion): void;
};
```

Do not call `onRequestStart` until Owner clicks **Review execution** and confirms a summary dialog; the actual start API is wired in Task 21.

- [ ] **Step 6: Run conversation UI and accessibility tests**

Run:

```bash
npx vitest run test/web/ConversationDock.test.tsx test/web/App.test.tsx
npm run typecheck
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit project discussion UI**

Run:

```bash
npm run format
git diff --check
git add src/web/api.ts src/web/store.tsx src/web/App.tsx src/web/components/ConversationDock.tsx src/web/components/DraftEditor.tsx test/web/ConversationDock.test.tsx
git commit -m "feat: add discussion and task drafting ui"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 19: Establish the Licensed Pixel-Art Contract and Office Scene

**Files:**

- Create: `art/README.md`
- Create: `art/source/characters.json`
- Create: `art/source/office.json`
- Create: `art/source/palettes.json`
- Create: `public/assets/asset-manifest.json`
- Create: `public/assets/licenses.json`
- Create: `public/assets/office/office-atlas.png`
- Create: `public/assets/office/office-atlas.json`
- Create: `public/assets/characters/characters-atlas.png`
- Create: `public/assets/characters/characters-atlas.json`
- Create: `scripts/generate-assets.mjs`
- Create: `scripts/validate-assets.mjs`
- Create: `src/web/office/asset-manifest.ts`
- Create: `src/web/office/layout.ts`
- Create: `src/web/office/OfficeScene.ts`
- Create: `src/web/office/OfficeCanvas.tsx`
- Create: `test/web/office.test.ts`
- Modify: `package.json`
- Modify: `src/web/App.tsx`

**Interfaces:**

- Consumes: approved original-art contract and PixiJS 8 `Assets`, `Application`, `Container`, `Sprite`, and `Texture`.
- Produces: deterministically generated and validated office/character atlases, fixed collision-safe office geometry, an imperative `OfficeScene`, and a React-owned canvas lifecycle. Task 20 adds live characters.

- [ ] **Step 1: Write failing asset and geometry tests**

Create `test/web/office.test.ts` covering:

```text
- manifest version is 1, tileSize is 16, office size is 352×240
- office grid is exactly 22×15 tiles
- both atlases exist, have power-of-two dimensions no larger than 2048, and use PNG RGBA
- every frame rectangle stays inside its source atlas
- no frame has fractional coordinates
- all seven actor IDs exist
- all required character animation frame names/counts exist
- all room/station coordinates stay within office bounds
- every station is reachable through the navigation graph
- resize chooses an integer scale and centers the 352×240 view
- every navigation edge has a waypoint polyline and no segment intersects a collider
- atlas JSON matches the exact Pixi spritesheet schema, including meta.image, sourceSize, spriteSourceSize, rotated, and trimmed
- asset licenses contain author, license, hashed source files, hashed outputs, affected frame names, and modification note
- running `generate-assets.mjs --check` proves committed binaries/JSON are deterministic
```

Keep this Vitest file pure: validate schemas, PNG bytes, geometry, scale math, and projection helpers without creating `PIXI.Application` in jsdom. Actual `Assets.load`, nearest sampling, StrictMode initialization, and teardown are verified in Playwright in Task 22.

- [ ] **Step 2: Run asset tests and confirm missing assets/modules**

Run:

```bash
npx vitest run test/web/office.test.ts
```

Expected: FAIL because manifest, binary atlases, and office modules do not exist.

- [ ] **Step 3: Define deterministic original-art sources and licenses**

Do not download or incorporate a third-party art pack in v0.1. The previously inspected 2dPig pack can remain a future, separately approved option, but this release has one reproducible provenance path: JSON art recipes plus the generator in this repository. Do not use Stardew Valley, Pixel Agents, or another project's sprites, palette, map, names, or animation timing as source material.

Create `art/source/palettes.json`, `office.json`, and `characters.json`. Validate them with Zod inside `generate-assets.mjs`. Their top-level shapes are exact:

```text
palettes.json:   {version:1, colors: Record<paletteName,"#RRGGBBAA">}
office.json:     {version:1, width:352, height:240, rooms:RoomRecipe[], props:PropRecipe[]}
characters.json: {version:1, frame:{width:16,height:24}, actors:ActorRecipe[], animations:Record<animation,frameCount>}
```

`ActorRecipe` contains `id`, `skin`, `hair`, `shirt`, `accent`, and one original accessory enum (`ledger`, `headset`, `mug`, `tool-pouch`, `scarf`, `book`, `goggles`). `RoomRecipe` and `PropRecipe` contain only integer pixel rectangles, palette keys, and project-owned symbolic sprite names. Commit no base64 blobs or copied pixel grids.

Create `public/assets/licenses.json` in this exact shape after generation:

```json
{
  "version": 1,
  "assets": [
    {
      "id": "cozy-original-art",
      "author": "Cozy Agent Office contributors",
      "sourceUrl": "repository:art/source",
      "license": "CC-BY-4.0",
      "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
      "sourceFiles": [
        { "path": "art/source/palettes.json", "sha256": "64 lowercase hex" },
        { "path": "art/source/office.json", "sha256": "64 lowercase hex" },
        { "path": "art/source/characters.json", "sha256": "64 lowercase hex" }
      ],
      "outputs": [
        {
          "path": "public/assets/office/office-atlas.png",
          "sha256": "64 lowercase hex",
          "frames": ["office.background"]
        },
        {
          "path": "public/assets/office/office-atlas.json",
          "sha256": "64 lowercase hex",
          "frames": ["office.background"]
        },
        {
          "path": "public/assets/characters/characters-atlas.png",
          "sha256": "64 lowercase hex",
          "frames": ["all 336 generated character frame keys"]
        },
        {
          "path": "public/assets/characters/characters-atlas.json",
          "sha256": "64 lowercase hex",
          "frames": ["all 336 generated character frame keys"]
        }
      ],
      "modifications": "Deterministically generated original pixel art; no third-party pixels included"
    }
  ]
}
```

Keep `repository:art/source` for local and prerelease builds. Task 22 may replace it with the actual repository tree URL only when that URL is known. The validator accepts a repository-relative source or an HTTPS URL and rejects empty/fabricated values.

- [ ] **Step 4: Generate one coherent original office atlas**

Implement `scripts/generate-assets.mjs` with `pngjs`. It reads the three JSON recipes, paints only integer pixels through `setPixel`, `fillRect`, `strokeRect`, `drawLine`, and `blitMask`, and packs frames in stable lexicographic order. It must not call Aseprite, a browser, a network endpoint, or a random-number API. Use exactly this original palette:

```text
outline       #1F1B24
shadow        #342A31
wood-dark     #4A332D
wood-mid      #6B4B3E
wood-light    #A06B4F
paper         #F2D6A2
paper-light   #FFF1CF
moss          #708457
moss-light    #9BAD74
teal          #4F746D
blue          #6576A3
rose          #B46061
gold          #D8BF62
warning       #CF5C55
stone         #7C7470
stone-light   #A59A91
```

Encode and render these 16×16-aligned pieces with one- or two-pixel dark outlines and no anti-aliasing:

```text
- timber floor, stone floor, rugs, walls, corners, windows, two doors
- Manager desk/cabin divider and ledger
- meeting table with eight chairs
- four visually distinct Worker desks, monitors, keyboards, chairs, cables
- Advisor shelves, reading table, lamp, stacked books
- QA bench, terminal lights, test tubes, warning board
- integration desk with two monitors and branch diagram
- coffee counter, machine, mugs, stools, plants
- state props: monitor idle/running/error, QA pass/fail lamp, integration spinner frames
```

Generate a 512×512 RGBA office atlas. Include `office.background` at 352×240 plus state-prop frames, all prefixed `office.`. The generator must fail when a frame overlaps another, exceeds the atlas, uses an unknown palette key, or contains a fractional coordinate.

- [ ] **Step 5: Generate seven original character sheets and every contracted frame**

Encode these identities in `art/source/characters.json`. The generator builds every 16×24 frame from original layered masks (shadow, legs, torso, head, hair, face, arm, accessory, highlight) and per-animation integer offsets. It must visibly change legs/arms or accessory pixels between contracted frames; duplicating one frame 336 times fails validation. Character identities:

```text
manager  — auburn cropped hair, cream shirt, moss vest, small ledger
worker-1 — dark skin, short coils, blue work jacket, gold headset
worker-2 — tan skin, long black braid, rose cardigan, teal mug
worker-3 — light skin, sandy undercut, teal overshirt, tool pouch
worker-4 — brown skin, wavy dark hair, gold sweater, blue scarf
advisor  — silver bob, plum coat, round spectacles, book
qa       — deep brown skin, high bun, teal lab jacket, amber goggles
```

For every actor export exactly:

```text
idle:       4 frames
walk.down:  4 frames
walk.left:  4 frames
walk.right: 4 frames
walk.up:    4 frames
work:       6 frames
read:       4 frames
talk:       4 frames
test:       6 frames
celebrate:  6 frames
error:      2 frames
```

Frame keys use `<actor>.<animation>.<zero-based-index>`, for example `worker-2.walk.left.3`. This yields 48 frames per actor and 336 character frames total. Distinguish roles through silhouette/accessories, not proprietary outfits or copied portraits.

Pack the 336 frames into a fixed 1024×256 transparent RGBA atlas using 64 frames per row and source order `manager`, `worker-1` through `worker-4`, `advisor`, `qa`, then the animation order shown above. The generator writes byte-identical PNG and sorted JSON on Windows, Linux, and macOS; PNG metadata contains no clock, host, path, or locale value.

- [ ] **Step 6: Commit a machine-readable asset manifest and validator**

Create `public/assets/asset-manifest.json`:

```json
{
  "version": 1,
  "tileSize": 16,
  "office": {
    "width": 352,
    "height": 240,
    "image": "/assets/office/office-atlas.png",
    "atlas": "/assets/office/office-atlas.json"
  },
  "characters": {
    "frameWidth": 16,
    "frameHeight": 24,
    "image": "/assets/characters/characters-atlas.png",
    "atlas": "/assets/characters/characters-atlas.json",
    "actors": ["manager", "worker-1", "worker-2", "worker-3", "worker-4", "advisor", "qa"]
  },
  "scaleMode": "nearest"
}
```

Create `scripts/validate-assets.mjs`. It must use only Node standard library to:

```text
- read PNG signature and IHDR width/height from the first 24 bytes
- require positive power-of-two dimensions <= 2048
- parse both atlas JSON files
- require this PixiJS spritesheet shape for every frame: `{frame:{x,y,w,h}, rotated:false, trimmed:false, spriteSourceSize:{x:0,y:0,w,h}, sourceSize:{w,h}, anchor:{x,y}}`; character anchors are `{x:0.5,y:1}` and office anchors are `{x:0,y:0}`
- require atlas meta `{app:"cozy-agent-office-generator",version:"1",image:<sibling png filename>,format:"RGBA8888",size:{w,h},scale:"1"}`
- require `animations` values to be arrays of existing frame keys in the exact contracted order
- verify integer frame x/y/w/h within source dimensions
- generate and require the exact 336 character frame-key set
- require every animation to contain at least two distinct frame pixel hashes when its frame count exceeds one
- validate asset-manifest.json and licenses.json required fields, all source/output hashes, and affected frame keys
- calculate each committed PNG/JSON SHA-256 and print a compact table
- exit 1 on the first invalid contract
```

The generator writes the same schema. Example character entry:

```json
{
  "manager.idle.0": {
    "frame": { "x": 0, "y": 0, "w": 16, "h": 24 },
    "rotated": false,
    "trimmed": false,
    "spriteSourceSize": { "x": 0, "y": 0, "w": 16, "h": 24 },
    "sourceSize": { "w": 16, "h": 24 },
    "anchor": { "x": 0.5, "y": 1 }
  }
}
```

Add scripts:

```json
"assets:generate": "node scripts/generate-assets.mjs",
"assets:check": "node scripts/generate-assets.mjs --check && node scripts/validate-assets.mjs"
```

and prepend `npm run assets:check` to `check`.

- [ ] **Step 7: Define fixed office geometry and navigation**

Create `src/web/office/layout.ts`:

```ts
export const OFFICE_WIDTH = 352;
export const OFFICE_HEIGHT = 240;
export const TILE_SIZE = 16;

export const STATIONS = {
  "manager-desk": { x: 56, y: 64 },
  meeting: { x: 168, y: 64 },
  bookshelf: { x: 288, y: 64 },
  "worker-1-desk": { x: 48, y: 136 },
  "worker-2-desk": { x: 128, y: 136 },
  "worker-3-desk": { x: 208, y: 136 },
  "worker-4-desk": { x: 288, y: 136 },
  coffee: { x: 48, y: 208 },
  integration: { x: 168, y: 208 },
  qa: { x: 288, y: 208 },
} as const;

export const NAV_GRAPH: Record<keyof typeof STATIONS, Array<keyof typeof STATIONS>> = {
  "manager-desk": ["meeting", "worker-1-desk"],
  meeting: ["manager-desk", "bookshelf", "worker-2-desk", "worker-3-desk"],
  bookshelf: ["meeting", "worker-4-desk"],
  "worker-1-desk": ["manager-desk", "worker-2-desk", "coffee"],
  "worker-2-desk": ["worker-1-desk", "worker-3-desk", "meeting", "integration"],
  "worker-3-desk": ["worker-2-desk", "worker-4-desk", "meeting", "integration"],
  "worker-4-desk": ["worker-3-desk", "bookshelf", "qa"],
  coffee: ["worker-1-desk", "integration"],
  integration: ["coffee", "qa", "worker-2-desk", "worker-3-desk"],
  qa: ["integration", "worker-4-desk"],
};
```

Do not move sprites along a straight station-to-station line. Export `NAV_ROUTES` for every undirected edge as the exact endpoint-inclusive waypoint polylines below; generate the reverse route by reversing the array:

```text
manager-desk|meeting:       manager-desk -> (56,88)  -> (168,88) -> meeting
manager-desk|worker-1-desk: manager-desk -> (56,88)  -> (48,88)  -> worker-1-desk
meeting|bookshelf:          meeting      -> (168,88) -> (288,88) -> bookshelf
meeting|worker-2-desk:      meeting      -> (168,88) -> (128,88) -> worker-2-desk
meeting|worker-3-desk:      meeting      -> (168,88) -> (208,88) -> worker-3-desk
bookshelf|worker-4-desk:    bookshelf    -> (288,88)              -> worker-4-desk
worker-1-desk|worker-2-desk:worker-1-desk-> (48,168) -> (128,168)-> worker-2-desk
worker-1-desk|coffee:       worker-1-desk-> (48,168)              -> coffee
worker-2-desk|worker-3-desk:worker-2-desk-> (128,168)->(208,168) -> worker-3-desk
worker-2-desk|integration:  worker-2-desk-> (128,168)->(168,168) -> integration
worker-3-desk|worker-4-desk:worker-3-desk-> (208,168)->(288,168) -> worker-4-desk
worker-3-desk|integration:  worker-3-desk-> (208,168)->(168,168) -> integration
worker-4-desk|qa:           worker-4-desk-> (288,168)             -> qa
coffee|integration:         coffee      -> (48,168) -> (168,168) -> integration
integration|qa:             integration -> (168,168)-> (288,168) -> qa
```

Coordinates named by station resolve through `STATIONS`. Export `COLLIDERS` from the office recipe and a pure `segmentIntersectsCollider` helper. The generator and unit tests require every waypoint to be inside the office, every segment to be axis-aligned, and every segment interior to avoid every collider. A recipe change that blocks a route must fail tests rather than letting characters walk through furniture.

Create room rectangles aligned to tiles:

```text
Manager cabin: x=16 y=16 w=80 h=64
Meeting area:   x=112 y=16 w=112 h=64
Advisor library:x=240 y=16 w=96 h=64
Worker floor:   x=16 y=96 w=320 h=64
Coffee area:    x=16 y=176 w=80 h=48
Integration:    x=112 y=176 w=112 h=48
QA lab:         x=240 y=176 w=96 h=48
```

- [ ] **Step 8: Initialize Pixi imperatively and resize by integer scale**

`OfficeScene` owns one `Application`, world `Container`, static room sprites, and `resize(containerWidth, containerHeight)`. Initialize with:

```ts
await app.init({
  width: OFFICE_WIDTH,
  height: OFFICE_HEIGHT,
  antialias: false,
  background: "#1f1b24",
  autoDensity: false,
  resolution: 1,
});
```

Load both atlas JSON URLs with `Assets.load`; do not manually assume TexturePacker compatibility. After loading, require `Spritesheet` resources and set every texture source `scaleMode = "nearest"`. `resize` computes:

```ts
const scale = Math.max(
  1,
  Math.floor(Math.min(containerWidth / OFFICE_WIDTH, containerHeight / OFFICE_HEIGHT)),
);
app.canvas.style.width = `${OFFICE_WIDTH * scale}px`;
app.canvas.style.height = `${OFFICE_HEIGHT * scale}px`;
```

`OfficeCanvas.tsx` starts async scene creation once in `useEffect`, appends `app.canvas`, observes its container with `ResizeObserver`, forwards later event/selection props, and calls `scene.destroy()` plus observer cleanup on unmount. Use an explicit `disposed` boolean: if React StrictMode cleans up before `Application.init`/`Assets.load` resolves, immediately destroy the late scene and never append its canvas. `OfficeScene.destroy()` is idempotent. Pixi never owns React panels or dialogs.

Add a pure unit test for scale math only. The office wrapper always exposes non-sensitive read-only diagnostics as `data-pixi-ready`, `data-pixi-antialias`, `data-pixi-scale-mode`, and `data-pixi-scene-count`. Task 22's Chromium lifecycle test mounts `<React.StrictMode><OfficeCanvas /></React.StrictMode>`, verifies those values plus exactly one canvas, unmounts/remounts, and verifies no leaked canvas or ticker. No production branch checks an E2E environment variable.

- [ ] **Step 9: Validate assets, office tests, and production bundle**

Run:

```bash
npm run assets:generate
npm run assets:check
npx vitest run test/web/office.test.ts
npm run typecheck
npm run build:web
```

Expected: generation is deterministic; asset validator exits 0 and reports 336 character frames; office tests PASS; Vite copies `public/assets` into `dist/web/assets`.

- [ ] **Step 10: Commit original pixel-office foundations**

Run:

```bash
npm run format
git diff --check
git add art public/assets scripts/generate-assets.mjs scripts/validate-assets.mjs package.json package-lock.json src/web/office src/web/App.tsx test/web/office.test.ts
git commit -m "feat: add original pixel office scene"
```

Expected: commit succeeds, binary assets are covered by `licenses.json`, and the working tree is clean.

---

### Task 20: Animate Formal Roles from Persisted Run Events

**Files:**

- Create: `src/web/office/animation.ts`
- Create: `src/web/office/CharacterSprite.ts`
- Modify: `src/web/office/OfficeScene.ts`
- Modify: `src/web/office/OfficeCanvas.tsx`
- Modify: `test/web/office.test.ts`

**Interfaces:**

- Consumes: ordered `RunEvent[]`, `RunSnapshot`, asset frame keys, office stations, selected actor, and reduce-motion preference.
- Produces: deterministic event-to-location/animation projection, walking through the navigation graph, selection/emote overlays, and accessible actor summaries.

- [ ] **Step 1: Add failing animation projection tests**

Extend `test/web/office.test.ts` to assert:

```text
- planning/preflight moves Manager and Advisor to meeting with talk/read
- read-only consultation maps actor to bookshelf/read
- write Worker maps to assigned desk/work
- waiting Worker maps to coffee/idle
- integration maps assigned Worker or Manager to integration/work
- QA command maps QA to qa/test
- delivery review maps Advisor to bookshelf/read
- failed/blocked maps actor to error and warning emote
- completed maps actor to celebrate, then home desk idle
- events are reduced strictly by sequence; duplicate/out-of-order input is normalized
- browser reload computes latest authoritative home/idle pose without replaying a one-shot animation
- repeated setState with the same source sequence never restarts celebrate/error effects
- live station change follows the shortest graph route and concatenates its NAV_ROUTES waypoint polylines
- reduce motion immediately places actor and selects semantic animation first frame
- selected character gets a non-color outline and click dispatches actor_selected
- seven visible keyboard actor buttons expose selection and visible focus; separate screen-reader summaries expose role, provider, model, task, and status
- motion-state is settled only after all walking and one-shot effects finish
```

- [ ] **Step 2: Run office tests and confirm missing animation modules**

Run:

```bash
npx vitest run test/web/office.test.ts
```

Expected: FAIL because `animation.ts` and `CharacterSprite.ts` do not exist.

- [ ] **Step 3: Implement the pure projection table**

Create `src/web/office/animation.ts`:

```ts
export type CharacterAnimation =
  | "idle"
  | "walk.down"
  | "walk.left"
  | "walk.right"
  | "walk.up"
  | "work"
  | "read"
  | "talk"
  | "test"
  | "celebrate"
  | "error";
export type LiveEffect = {
  kind: "celebrate";
  sourceSequence: number;
} | null;
export type ActorPose = {
  actorId: ProfileId;
  station: keyof typeof STATIONS;
  animation: CharacterAnimation;
  sourceSequence: number;
  liveEffect: LiveEffect;
  semanticStatus: string;
  taskId: string | null;
  warning: boolean;
};

export function projectActorPoses(run: RunSnapshot | null, events: RunEvent[]): ActorPose[];
export function shortestStationPath(
  from: keyof typeof STATIONS,
  to: keyof typeof STATIONS,
): Array<keyof typeof STATIONS>;
export function stationRoutePoints(
  from: keyof typeof STATIONS,
  to: keyof typeof STATIONS,
): Array<{ x: number; y: number }>;
```

Use one explicit switch on `EventKind`; do not infer states from speech text. Map profile home stations exactly. For events without `actorId`, update only semantic room indicators. A completion event projects the stable pose to the actor's home station with `animation="idle"` and emits `liveEffect={kind:"celebrate",sourceSequence}`. Failure/blocked remains a stable `error` pose. `sourceSequence` is the last event that changed that actor, or 0 for initial idle.

- [ ] **Step 4: Implement one Pixi character wrapper**

Create `src/web/office/CharacterSprite.ts` with:

```ts
export class CharacterSprite {
  readonly container: Container;
  constructor(input: {
    actorId: ProfileId;
    textures: Record<CharacterAnimation, Texture[]>;
    onSelect(actorId: ProfileId): void;
    onMotionChanged(): void;
  });
  setSelected(selected: boolean): void;
  setPose(pose: ActorPose, options: { live: boolean; reduceMotion: boolean }): void;
  update(deltaSeconds: number): void;
  isSettled(): boolean;
  destroy(): void;
}
```

Use one `AnimatedSprite`, selection outline `Graphics`, and emote sprite. Store `lastPoseSequence` and `lastEffectSequence` inside the wrapper. Live movement follows `stationRoutePoints` at 32 internal pixels/second and chooses directional walk animation from each axis-aligned segment. At arrival, switch to the stable target animation. Play celebrate only when `live=true`, `liveEffect` is non-null, and its sequence exceeds `lastEffectSequence`; play once, then restore the stable animation. Recovery passes `live=false`, jumps to the stable station, records both sequence values, and never plays the effect. Repeated props with the same sequence are a no-op. Reduce motion jumps to the station and displays the effect's first frame for 250 ms before the stable pose, without tweening.

- [ ] **Step 5: Connect event projection without making Pixi authoritative**

`OfficeScene.setState({run,events,selectedActorId,reduceMotion,live})` calls the pure projector and updates existing character objects. The first hydrated snapshot uses `live=false`; only later events whose sequence exceeds the hydrated maximum use `live=true`. It never mutates the React store or run state.

`OfficeScene` calls `onMotionState("moving" | "settled")` whenever any `CharacterSprite.isSettled()` value changes. `OfficeCanvas` mirrors this as `data-motion-state` on a visible office wrapper so E2E screenshots can wait for deterministic settling.

Beside the canvas, render a visible compact `<nav aria-label="Office roles">` with seven `<button>` elements (role short label plus status icon), `aria-pressed`, and a non-color selected border. These are the keyboard equivalent of sprite clicks and must have visible focus. Render a separate visually hidden `<ul aria-live="polite">` with one current role/provider/model/task/status summary per actor; never place focusable controls inside the hidden list.

- [ ] **Step 6: Run office motion and accessibility tests**

Run:

```bash
npx vitest run test/web/office.test.ts
npm run typecheck
```

Expected: all office tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit event-driven office characters**

Run:

```bash
npm run format
git diff --check
git add src/web/office test/web/office.test.ts
git commit -m "feat: animate roles from persisted events"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 21: Complete Task Board, Inspector, Timeline, Diff, and Owner Controls

**Files:**

- Create: `src/web/components/TaskBoard.tsx`
- Create: `src/web/components/Inspector.tsx`
- Create: `src/web/components/Timeline.tsx`
- Create: `src/web/components/DiffDialog.tsx`
- Create: `src/web/components/ConfirmDialog.tsx`
- Create: `test/web/RunControls.test.tsx`
- Modify: `src/web/components/TopBar.tsx`
- Modify: `src/web/components/DraftEditor.tsx`
- Modify: `src/web/App.tsx`
- Modify: `src/web/api.ts`
- Modify: `src/web/store.tsx`

**Interfaces:**

- Consumes: completed run API, WebSocket events, run/task/attempt/QA/diff data, and Owner authority rules.
- Produces: the complete main office application and the only UI entry points for Start, Pause/Resume, Cancel, Retry interrupted task, Apply, and cleanup.

- [ ] **Step 1: Write failing run-control and evidence tests**

Create `test/web/RunControls.test.tsx` covering:

```text
- reviewed draft confirmation is required before Start Execution
- Start sends expected draft version and selected concurrency
- Pause and Resume display persisted state and expectedUpdatedAt
- Cancel requires explicit confirmation and never implies Apply
- interrupted task Retry explains replacement worktree behavior
- Apply is absent before ready_to_apply
- ready_to_apply shows plan, diff stat/text, required/optional QA, Advisor reviews, attempts, provider fallback, risks, and root guards
- Apply confirmation names project, branch, base commit, and fast-forward-only operation
- stale action response refreshes snapshot instead of resubmitting
- dirty/moved/wrong-branch block reason remains visible and root is unchanged
- Task Board columns Plan, Running, Review, Done reflect task status
- clicking task selects assigned character and Inspector task
- Inspector shows role/provider/model/task/worktree/attempts but never credentials
- Timeline visually distinguishes advisor_gate from consultation
- status uses icon/text as well as color
- diff is selectable <pre>, binary entries are labeled, and no Monaco dependency exists
- cleanup shows calculated bytes, requires typed run ID, and is disabled for active/ready runs
- all actions are keyboard reachable and dialogs trap/restore focus
```

- [ ] **Step 2: Run run-control tests and confirm missing panels**

Run:

```bash
npx vitest run test/web/RunControls.test.tsx
```

Expected: FAIL because the run panels and dialogs do not exist.

- [ ] **Step 3: Implement the task and evidence panels**

Component contracts:

```ts
type TaskBoardProps = {
  run: RunSnapshot | null;
  onSelectTask(taskId: string): void;
};
type InspectorProps = {
  actorId: ProfileId;
  taskId: string | null;
  run: RunSnapshot | null;
  attempts: AttemptView[];
  providerStatuses: ProviderStatus[];
};
type TimelineProps = {
  events: RunEvent[];
  onLoadEarlier(): void;
};
type DiffDialogProps = {
  open: boolean;
  diff: DiffView | null;
  qa: QaReportView | null;
  advisorReviews: AdvisorReviewView[];
  onClose(): void;
};
```

Use plain semantic HTML lists/tables/pre. Virtualization is excluded because the in-memory event list is capped at 2,000 and diff responses are paged.

- [ ] **Step 4: Implement an accessible reusable confirmation dialog**

`ConfirmDialog.tsx` uses native `<dialog>` when available and a tested fallback in jsdom. Props include title, description, confirm label, danger flag, optional required confirmation text, pending state, error, confirm, and cancel. On open, focus the first safe control; on close, restore the trigger. Escape cancels unless an action is pending.

- [ ] **Step 5: Wire exact Owner actions**

Add ApiClient methods:

```ts
startRun(draftId: string, expectedDraftVersion: number, concurrency: number): Promise<RunSnapshot>;
pauseRun(run: RunSnapshot): Promise<RunSnapshot>;
resumeRun(run: RunSnapshot): Promise<RunSnapshot>;
cancelRun(run: RunSnapshot): Promise<RunSnapshot>;
retryTask(run: RunSnapshot, taskId: string): Promise<RunSnapshot>;
applyRun(run: RunSnapshot): Promise<RunSnapshot>;
getRunEvidence(runId: string): Promise<RunEvidence>;
getRunStorage(runId: string): Promise<RunStorage>;
cleanupRun(runId: string, confirmation: string): Promise<CleanupResult>;
```

TopBar rules:

```text
- Start exists only in reviewed DraftEditor, not TopBar.
- Pause exists during dispatching/working/integrating/testing/advisor states when not paused.
- Resume exists only when dispatchPaused.
- Cancel exists for every non-terminal run including ready_to_apply.
- Apply exists only in ready_to_apply after evidence loads.
- Terminal states expose evidence and eligible cleanup, never Resume or Apply.
```

All actions send the current `updatedAt`; on 409, fetch latest snapshot and show **Run changed; review current state**.

- [ ] **Step 6: Finish the desktop layout**

Render:

```text
TopBar                 grid-area: top
TaskBoard              grid-area: left
OfficeCanvas           grid-area: office
Inspector              grid-area: right
Conversation/Timeline  grid-area: dock, switchable tabs
```

At every supported viewport (1280×720 or larger), both side panels remain visible. Below the unsupported minimum, preserve the 1280×720 layout with browser overflow plus a compact viewport warning; do not silently hide controls. Do not make the canvas absorb dialogs, logs, diffs, or form controls.

- [ ] **Step 7: Run all browser tests and build**

Run:

```bash
npx vitest run test/web
npm run typecheck
npm run build:web
```

Expected: all browser tests PASS, TypeScript exits 0, and Vite build succeeds.

- [ ] **Step 8: Commit the complete Owner UI**

Run:

```bash
npm run format
git diff --check
git add src/web test/web/RunControls.test.tsx
git commit -m "feat: complete owner run controls"
```

Expected: commit succeeds and the working tree is clean.

---

### Task 22: Prove the Full Workflow and Package the Open-Source Release

**Files:**

- Create: `playwright.config.ts`
- Create: `test/helpers/scripted-adapter.ts`
- Create: `test/e2e-server.ts`
- Create: `e2e/workflow.spec.ts`
- Create: `e2e/office-lifecycle.spec.ts`
- Create: `e2e/visual.spec.ts`
- Create: `.github/workflows/ci.yml`
- Create: `LICENSE`
- Create: `ASSET_LICENSE.md`
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `AGENTS.md`
- Modify: `package.json`
- Modify: `src/server/cli.ts`

**Interfaces:**

- Consumes: the complete backend, browser app, fake adapter contract, asset validator, and npm package definition.
- Produces: reproducible functional E2E, Linux visual baselines, three-OS CI, manual real-provider smoke instructions, licenses, contributor rules, and a verified npm tarball.

- [ ] **Step 1: Add a scripted adapter and isolated E2E server**

Create `test/helpers/scripted-adapter.ts` implementing `ProviderAdapter`. It executes only `process.execPath test/fixtures/fake-provider.mjs` and uses request role/stage to return deterministic Zod-valid artifacts:

```text
Manager planning:
  three dependency-free write tasks with disjoint ownership:
    add-greeting    allowedPaths=[src/greeting.ts]
    add-farewell    allowedPaths=[src/farewell.ts]
    add-punctuation allowedPaths=[src/punctuation.ts]

Advisor preflight:
  approve

Worker write:
  each task creates only its owned file with one exact exported constant

QA:
  deterministic npm test command supplied by the fixture repository

Advisor delivery:
  approve

Manager synthesis:
  summary with all three changed files and passing QA
```

The scripted adapter never calls a network or subscription service. Its constructor accepts scenario `success | worker_error | advisor_blocked`. `worker_error` fails `add-farewell` once with a typed execution error so the office can show error before retry. `advisor_blocked` rejects both delivery passes so the durable terminal state is blocked. Expose per-run barriers named `planning`, `worker-1`, `worker-2`, `worker-3`, `testing`, `reviewing`, and `ready`; releasing one worker barrier must not release the others.

Create `test/e2e-server.ts` that:

```text
- recreates only .data/e2e after proving it is inside repository .data
- creates a temporary Git project with package.json, one passing Vitest test, and a clean main commit
- builds AppDependencies with scripted Codex/Claude/Antigravity adapters
- uses fixed token e2e-session-token-0000000000000000000000000001
- serves built web on 127.0.0.1:4318
- registers /__test/status, /__test/reset, /__test/scenario/:name, and /__test/release/:barrier only on this test server
- closes server/database and removes temp worktrees on SIGTERM
```

No production module checks `COZY_E2E` or registers a test route.

`POST /__test/reset` is refused while an engine controller is active. Otherwise it closes the current fixture DB/repository, removes only the resolved `.data/e2e` child paths after boundary checks, creates a fresh fixture, resets barriers/scenario to success, and returns the new repository path. Every Playwright test calls it in `beforeEach`; no test shares run state.

- [ ] **Step 2: Configure Playwright deterministically**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
    baseURL: "http://127.0.0.1:4318",
    colorScheme: "dark",
    reducedMotion: "no-preference",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx tsx test/e2e-server.ts",
    url: "http://127.0.0.1:4318/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Add package scripts:

```json
"test:e2e": "playwright test e2e/workflow.spec.ts e2e/office-lifecycle.spec.ts",
"test:visual": "playwright test e2e/visual.spec.ts",
"test:all": "npm run test && npm run test:e2e"
```

- [ ] **Step 3: Write the full browser-to-Git workflow test**

Create `e2e/workflow.spec.ts` that performs and asserts:

```text
1. Open /#session=e2e-session-token-0000000000000000000000000001.
2. Confirm fragment disappears.
3. Paste fixture repository path supplied by /__test/status.
4. Probe fake providers and verify capability labels.
5. Approve test command and tracked context.
6. Save seven role profiles with distinct models/fallback chains.
7. Discuss with Manager and create a draft.
8. Review draft, set concurrency=3, confirm Start Execution.
9. Release all three worker barriers and observe three simultaneous running tasks before integration; then observe QA and Advisor timeline events in order.
10. Reload during working and verify the run reconnects without stopping.
11. Reach ready_to_apply and verify none of the three root files exists through /__test/status.
12. Open diff and verify src/greeting.ts, src/farewell.ts, src/punctuation.ts, plus passing required QA.
13. Confirm Apply and wait for applied state.
14. Verify the fixture root now contains all three exact exports and remains clean.
15. Reload and verify applied history remains inspectable.
```

Add a second test that resets the fixture, starts with concurrency=1, holds the first Worker barrier, pauses with one active and two queued tasks, releases the active task, confirms no next task dispatch, reloads, resumes, then cancels before Apply and verifies all three root files remain absent.

- [ ] **Step 4: Capture semantic visual states on Linux only**

First create `e2e/office-lifecycle.spec.ts`. In Chromium it must load both atlas JSON URLs through the production UI, wait for `data-pixi-ready="true"`, and assert the wrapper diagnostics report `antialias=false`, `scaleMode=nearest`, and one active scene. Navigate away and back twice under React StrictMode and require one canvas, one active scene, and no late canvas append after unmount. Run the same case once with a deliberately delayed asset response to prove the disposed guard.

Create `e2e/visual.spec.ts`. Skip when `process.platform !== "linux"`. At 1280×720 capture:

```text
office-idle.png
office-planning.png
office-parallel-workers.png
office-qa.png
office-advisor-review.png
office-error.png
office-blocked.png
office-ready.png
office-done.png
```

For each screenshot wait for both the visible semantic status and office wrapper `data-motion-state="settled"`. Mask timestamps, commit hashes, and durations. Do not use arbitrary sleep.

Use a fresh reset for each scenario: success produces idle/planning/parallel-workers/QA/advisor/ready/done; `worker_error` produces error before releasing its retry; `advisor_blocked` produces blocked after the second delivery rejection. Apply only in the success scenario. Run a separate fresh reduced-motion assertion without screenshots and verify characters change state without a walking tween.

- [ ] **Step 5: Add three-OS CI with one visual authority OS**

Create `.github/workflows/ci.yml` with:

```yaml
name: ci
on:
  push:
  pull_request:

jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install chromium --with-deps
        if: runner.os == 'Linux'
      - run: npx playwright install chromium
        if: runner.os != 'Linux'
      - run: npm run format:check
      - run: npm run assets:check
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      - run: npm run test:e2e

  visual:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: npm run test:visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diff
          path: test-results
```

No CI secret is required.

- [ ] **Step 6: Write exact open-source and security documentation**

Create:

```text
LICENSE                  standard Apache License 2.0 text
ASSET_LICENSE.md         CC BY 4.0 notice for original art/audio and asset-manifest rules
THIRD_PARTY_NOTICES.md   each third-party asset/dependency notice that requires attribution
SECURITY.md              loopback/token model, trusted-repository warning, disclosure contact, no-OS-sandbox warning
CONTRIBUTING.md          Node 24 setup, tests, art contribution/licensing rules, no copied assets
AGENTS.md                exact commands, architecture boundaries, one-writer-per-file rule, completion criteria
README.md                screenshots, product boundary, install/start, onboarding, roles, provider compatibility, workflow, troubleshooting
```

README must state clearly:

```text
- ChatGPT/Claude/Google subscriptions authenticate their official CLIs; API credit is not used by this app.
- Subscription availability, quota, and model access remain provider-controlled.
- Antigravity is eligible only for write Workers after current `--help` capability probing and explicit login verification; v0.1 does not claim a proven per-invocation read-only mode.
- Antigravity's documented print mode receives the prompt as a process argument in v0.1, so the prompt may be visible to other local processes/users that can inspect process command lines; Codex and Claude prompts use stdin.
- Worktrees protect Git changes but are not an OS sandbox.
- The app is intended for local repositories and CLI accounts trusted by the Owner.
- The root working tree changes only after Apply and verified fast-forward conditions.
```

Document manual smoke commands without running them in CI:

```text
codex --version
codex login status
claude --version
claude auth status
agy --version
npm start
```

The manual checklist creates a disposable Git repository, runs one read-only Manager consultation with Codex, one with Claude, and one Antigravity write Worker. It confirms no global provider settings were modified and deletes only the disposable repository after explicit human confirmation.

- [ ] **Step 7: Make the package publishable and verify its contents**

Remove `"private": true` from `package.json`, retain the `files` allowlist, add repository/homepage/bugs fields after the actual GitHub repository URL exists, and keep Apache-2.0 as the package license. Ensure compiled `cli.js` preserves `#!/usr/bin/env node`.

Run:

```bash
npm run check
npm run test:e2e
npm pack --dry-run
```

Expected:

```text
- all unit/integration tests PASS
- both TypeScript projects PASS
- assets:check reports 336 character frames
- Vite/server builds PASS
- functional E2E PASS
- tarball contains dist, README, LICENSE, ASSET_LICENSE, and THIRD_PARTY_NOTICES
- tarball excludes src, test, e2e, art/source, .data, provider credentials, and worktrees
```

- [ ] **Step 8: Perform a final diff and secret audit**

Run:

```bash
git diff --check
git status --short
git grep -n -E "(sk-proj-|github_pat_|Authorization: Bearer [A-Za-z0-9])" -- . ":(exclude)package-lock.json"
git grep -n -E "dangerously-bypass|dangerously-skip|--yolo" -- src test e2e
```

Expected: diff check is clean; only intended release files are uncommitted; credential grep returns no matches; dangerous-flag grep returns matches only in tests that assert those flags are absent.

- [ ] **Step 9: Commit the releasable v0.1**

Run:

```bash
git add .github playwright.config.ts test/helpers/scripted-adapter.ts test/e2e-server.ts e2e LICENSE ASSET_LICENSE.md THIRD_PARTY_NOTICES.md README.md SECURITY.md CONTRIBUTING.md AGENTS.md package.json package-lock.json src/server/cli.ts
git commit -m "chore: verify and package v0.1"
```

Expected: commit succeeds and `git status --short` is empty.

---

## Final Verification Checklist

Run from a clean checkout with Node 24:

```bash
npm ci
npx playwright install chromium
npm run format:check
npm run assets:check
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm pack --dry-run
git diff --check
git status --short
```

Expected: every command exits 0; unit/integration/E2E tests pass; the working tree remains clean.

Manually verify at 1280×720 and one wider viewport:

```text
- onboarding can configure all seven profiles independently
- Manager is the default contact
- direct role conversations are visibly read-only
- Advisor consultation warns about extra premium usage
- Start/Cancel/Apply require explicit Owner action
- three Workers visibly operate in parallel on disjoint tasks
- pause survives reload
- required QA cannot be waived
- root stays unchanged before Apply
- Apply refuses branch/base/dirty mismatch
- every office state and all seven original characters render correctly
- keyboard-only navigation and reduce-motion mode remain usable
```

## Spec Coverage Map

| Approved design area                           | Implementation tasks  |
| ---------------------------------------------- | --------------------- |
| Runtime, one command, loopback binding         | Tasks 1, 6, 22        |
| SQLite, artifacts, recovery                    | Tasks 2, 3, 15, 16    |
| Provider abstraction and capability matrix     | Tasks 4, 5, 12        |
| Owner/Manager discussion and direct role chat  | Tasks 8, 9, 17, 18    |
| Frozen draft/context and plan preflight        | Tasks 8, 9, 10, 15    |
| Worktree writes, ownership, integration, Apply | Tasks 11, 13, 15, 16  |
| Parallel scheduling, retry, fallback           | Tasks 12, 13          |
| Deterministic QA and repairs                   | Tasks 14, 15          |
| Advisor preflight and delivery gates           | Tasks 10, 15          |
| Pause, cancel, interruption recovery           | Tasks 13, 15, 21      |
| React UI and formal role configuration         | Tasks 17, 18, 21      |
| PixiJS office, art, animation, accessibility   | Tasks 19, 20, 21      |
| Security, testing, CI, licensing, packaging    | Tasks 3, 4, 6, 16, 22 |

## Completion Boundary

v0.1 is complete only after Task 22 and the Final Verification Checklist pass. A passing UI demo without provider fallback, worktree policy, QA authority, recovery, licenses, or three-OS tests is not a completed implementation.
