import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { ProviderRegistry } from "../../src/server/providers/registry.js";
import type { ProviderAdapter } from "../../src/server/providers/types.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import {
  BootstrapResponseSchema,
  BrowseDirectoriesResponseSchema,
  CompleteProjectSetupResponseSchema,
  ConversationRecordSchema,
  SelectProjectResponseSchema,
} from "../../src/shared/api.js";
import type { ProviderStatus, RoleProfile } from "../../src/shared/contracts.js";
import { createTestDependencies, type TestDependencies } from "../helpers/test-dependencies.js";
import { createFakeRepo } from "../helpers/fake-repo.js";

const READY_STATUS: ProviderStatus = {
  provider: "codex",
  installed: true,
  authenticated: true,
  version: "codex 1.0.0",
  models: ["test-model"],
  capabilities: { nonInteractive: true, readOnly: true, worktreeWrite: true },
  diagnostic: null,
  checkedAt: "2026-07-12T00:00:00.000Z",
};

function authHeaders(deps: TestDependencies) {
  return {
    authorization: `Bearer ${deps.config.sessionToken}`,
    origin: deps.config.publicOrigin,
  };
}

async function addProject(deps: TestDependencies, projectId: string): Promise<string> {
  const rootPath = join(deps.config.dataDir, `project-${projectId}`);
  await createFakeRepo(rootPath);
  deps.projects.upsertProject({
    id: projectId,
    name: "setup-project",
    rootPath,
    setupComplete: false,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  });
  return rootPath;
}

function addCommandAndSnapshot(deps: TestDependencies, projectId: string): string {
  deps.projects.replaceCommands(projectId, [
    {
      id: "test",
      label: "test",
      executable: "npm",
      args: ["test"],
      cwd: ".",
      required: true,
      timeoutMs: 60_000,
    },
  ]);
  const snapshotId = randomUUID();
  deps.projects.saveContextSnapshot(
    {
      id: snapshotId,
      projectId,
      sourceBranch: "main",
      sourceHead: "a".repeat(40),
      manifestHash: "b".repeat(64),
      entries: [],
      excluded: [],
      createdAt: "2026-07-12T00:00:00.000Z",
    },
    `/contexts/${snapshotId}`,
  );
  return snapshotId;
}

function sevenRoles(): RoleProfile[] {
  return [
    ["manager", "manager"],
    ["worker-1", "worker"],
    ["worker-2", "worker"],
    ["worker-3", "worker"],
    ["worker-4", "worker"],
    ["advisor", "advisor"],
    ["qa", "qa"],
  ].map(([id, role]) => ({
    id,
    role,
    label: id,
    providerChain: [{ provider: "codex", model: null }],
    timeoutMs: 60_000,
    promptVersion: `${role}-v1`,
  })) as RoleProfile[];
}

describe("project setup completion", () => {
  it("browses local folders and clones a selected repository", async () => {
    const deps = await createTestDependencies();
    try {
      const sourcePath = join(deps.config.dataDir, "source");
      const cloneParent = join(deps.config.dataDir, "clones");
      await createFakeRepo(sourcePath);
      await mkdir(cloneParent);
      const app = await buildApp(deps);
      const headers = authHeaders(deps);

      const browse = await app.inject({
        method: "POST",
        url: "/api/filesystem/directories",
        headers,
        payload: { path: deps.config.dataDir },
      });
      expect(browse.statusCode).toBe(200);
      expect(
        BrowseDirectoriesResponseSchema.parse(browse.json()).directories.map((entry) => entry.name),
      ).toContain("source");

      const clone = await app.inject({
        method: "POST",
        url: "/api/projects/clone",
        headers,
        payload: {
          remoteUrl: sourcePath,
          parentPath: cloneParent,
          directoryName: "copy",
        },
      });
      expect(clone.statusCode).toBe(200);
      const project = SelectProjectResponseSchema.parse(clone.json());
      expect(project.rootPath).toBe(join(cloneParent, "copy").replaceAll("\\", "/"));
      expect(project.clean).toBe(true);
      expect(deps.projects.getProject(project.id)?.rootPath).toBe(project.rootPath);
    } finally {
      await deps.close();
    }
  });

  it("probes providers, creates defaults, completes setup, and exposes it in bootstrap", async () => {
    const deps = await createTestDependencies();
    try {
      const projectId = randomUUID();
      const projectRoot = await addProject(deps, projectId);

      const adapter: ProviderAdapter = {
        id: "codex",
        declaredCapabilities: READY_STATUS.capabilities,
        async probe() {
          return READY_STATUS;
        },
        build() {
          return {
            executable: "codex",
            args: [],
            cwd: ".",
            stdin: "",
            structuredResultPath: null,
          };
        },
      };
      deps.providers = new ProviderRegistry(
        [adapter],
        new ProcessSupervisor(),
        deps.projects,
        deps.config.tempDir,
      );
      const app = await buildApp(deps);
      const headers = authHeaders(deps);

      const unauthorized = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/setup/complete`,
        headers: { origin: deps.config.publicOrigin },
        payload: {},
      });
      expect(unauthorized.statusCode).toBe(401);

      const probe = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/providers/probe`,
        headers,
      });
      expect(probe.statusCode).toBe(200);
      expect(deps.projects.listRoleProfiles(projectId)).toHaveLength(7);

      const snapshotId = addCommandAndSnapshot(deps, projectId);
      const completion = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/setup/complete`,
        headers,
        payload: {},
      });
      expect(completion.statusCode).toBe(200);
      expect(CompleteProjectSetupResponseSchema.parse(completion.json())).toEqual({
        projectId,
        setupComplete: true,
        contextSnapshotId: snapshotId,
      });
      expect(deps.projects.getProject(projectId)?.setupComplete).toBe(true);

      const conversationRunId = randomUUID();
      const conversation = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/conversations`,
        headers,
        payload: {
          role: "manager",
          profileId: "manager",
          contextSnapshotId: snapshotId,
          runId: conversationRunId,
        },
      });
      expect(conversation.statusCode).toBe(200);
      expect(ConversationRecordSchema.parse(conversation.json()).runId).toBe(conversationRunId);

      const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap", headers });
      const bootstrapBody = BootstrapResponseSchema.parse(bootstrap.json());
      expect(bootstrapBody.projects[0]).toMatchObject({ id: projectId, setupComplete: true });

      deps.projects.replaceCommands(projectId, deps.projects.listCommands(projectId));
      expect(deps.projects.getProject(projectId)?.setupComplete).toBe(false);
      await writeFile(join(projectRoot, "dirty.txt"), "dirty", "utf8");
      const dirtyCompletion = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/setup/complete`,
        headers,
        payload: {},
      });
      expect(dirtyCompletion.statusCode).toBe(409);
      expect(dirtyCompletion.json().error.code).toBe("git_dirty");
    } finally {
      await deps.close();
    }
  });

  it("rejects persisted provider status that was not probed by this process", async () => {
    const deps = await createTestDependencies();
    try {
      const projectId = randomUUID();
      await addProject(deps, projectId);
      deps.projects.saveProviderStatus(READY_STATUS);
      deps.providers.loadStatuses([READY_STATUS]);
      deps.projects.replaceRoleProfiles(projectId, sevenRoles());
      addCommandAndSnapshot(deps, projectId);

      const app = await buildApp(deps);
      const response = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/setup/complete`,
        headers: authHeaders(deps),
        payload: {},
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.details.missingRequirements).toContain("provider_probe");
      expect(deps.projects.getProject(projectId)?.setupComplete).toBe(false);
    } finally {
      await deps.close();
    }
  });
});
