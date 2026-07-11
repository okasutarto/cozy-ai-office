import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { openDatabase } from "../../src/server/db/database.js";
import { SqliteProjectStore } from "../../src/server/db/project-store.js";
import { SqliteConversationStore } from "../../src/server/db/conversation-store.js";
import { withTempDir } from "../helpers/temp.js";
import { createFakeRepo, commitFile } from "../helpers/fake-repo.js";
import { ProcessSupervisor } from "../../src/server/system/process.js";
import { GitClient } from "../../src/server/git/git.js";
import { RepositoryService } from "../../src/server/git/repository.js";
import { ProviderRegistry } from "../../src/server/providers/registry.js";
import { ContextSnapshotService } from "../../src/server/context/snapshots.js";
import { ConversationService } from "../../src/server/conversations/service.js";
import { ArtifactStore } from "../../src/server/artifacts/store.js";
import { CodexAdapter } from "../../src/server/providers/codex.js";
import { ClaudeAdapter } from "../../src/server/providers/claude.js";
import { AntigravityAdapter } from "../../src/server/providers/antigravity.js";
import { AppError } from "../../src/server/errors.js";
import * as executeModule from "../../src/server/providers/execute.js";

describe("Conversation Service direct role chats", () => {
  it("verifies safety policies, provider routing and versioned task drafts", async () => {
    await withTempDir(async (dir) => {
      const db = openDatabase(join(dir, "state.db"));
      let executeSpy: any;
      try {
        const supervisor = new ProcessSupervisor();
        const projectStore = new SqliteProjectStore(db);
        const conversationStore = new SqliteConversationStore(db);
        const gitClient = new GitClient(supervisor);
        const repoService = new RepositoryService(gitClient);

        const contextsRoot = join(dir, "contexts");
        const tempRoot = join(dir, "tmp");
        await mkdir(contextsRoot, { recursive: true });
        await mkdir(tempRoot, { recursive: true });

        const snapshotService = new ContextSnapshotService(
          db,
          projectStore,
          repoService,
          contextsRoot,
          tempRoot,
        );

        // Mock executeProviderRequest to return mock chat responses or draft suggestions
        executeSpy = vi.spyOn(executeModule, "executeProviderRequest");

        // Set up providers in registry
        const codex = new CodexAdapter("codex");
        const claude = new ClaudeAdapter("claude");
        const agy = new AntigravityAdapter("agy");
        const registry = new ProviderRegistry(
          [codex, claude, agy],
          supervisor,
          projectStore,
          join(dir, "temp-prov"),
        );

        // Save statuses to DB so selectProject builds deterministic profiles
        projectStore.saveProviderStatus({
          provider: "codex",
          installed: true,
          authenticated: true,
          version: "1.0",
          models: ["gpt-4"],
          capabilities: { nonInteractive: true, readOnly: true, worktreeWrite: true },
          diagnostic: null,
          checkedAt: new Date().toISOString(),
        });
        projectStore.saveProviderStatus({
          provider: "claude",
          installed: true,
          authenticated: true,
          version: "2.0",
          models: ["sonnet"],
          capabilities: { nonInteractive: true, readOnly: true, worktreeWrite: true },
          diagnostic: null,
          checkedAt: new Date().toISOString(),
        });
        projectStore.saveProviderStatus({
          provider: "antigravity",
          installed: true,
          authenticated: true,
          version: "1.0",
          models: [],
          capabilities: { nonInteractive: true, readOnly: false, worktreeWrite: true }, // Antigravity is write-only
          diagnostic: null,
          checkedAt: new Date().toISOString(),
        });

        // Initialize status map in registry
        registry.setStatus(projectStore.listProviderStatuses()[0]!);
        registry.setStatus(projectStore.listProviderStatuses()[1]!);
        registry.setStatus(projectStore.listProviderStatuses()[2]!);

        const artifactStore = new ArtifactStore(db, join(dir, "artifacts"));

        const conversationService = new ConversationService(
          db,
          projectStore,
          conversationStore,
          registry,
          snapshotService,
          artifactStore,
        );

        const repoPath = join(dir, "repo");
        await createFakeRepo(repoPath);
        await commitFile(repoPath, "readme.md", "# My Readme");

        // Select project
        const projectResult = await projectStore.upsertProject({
          id: "00000000-0000-4000-8000-000000000301",
          name: "test-project",
          rootPath: repoPath,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Build default profiles
        const inspection = await repoService.inspect(repoPath, new AbortController().signal);
        projectStore.replaceCommands(projectResult.id, inspection.commandCandidates);

        // Setup default profiles
        await projectStore.replaceRoleProfiles(projectResult.id, [
          {
            id: "manager",
            role: "manager",
            label: "Manager",
            providerChain: [{ provider: "codex", model: "gpt-4" }],
            timeoutMs: 10000,
            promptVersion: "manager-v1",
          },
          {
            id: "advisor",
            role: "advisor",
            label: "Advisor",
            providerChain: [{ provider: "claude", model: "sonnet" }],
            timeoutMs: 10000,
            promptVersion: "advisor-v1",
          },
          {
            id: "qa",
            role: "qa",
            label: "QA",
            providerChain: [{ provider: "codex", model: "gpt-4" }],
            timeoutMs: 10000,
            promptVersion: "qa-v1",
          },
          {
            id: "worker-1",
            role: "worker",
            label: "Worker 1",
            providerChain: [{ provider: "antigravity", model: null }], // Antigravity only
            timeoutMs: 10000,
            promptVersion: "worker-v1",
          },
          {
            id: "worker-2",
            role: "worker",
            label: "Worker 2",
            providerChain: [{ provider: "codex", model: "gpt-4" }],
            timeoutMs: 10000,
            promptVersion: "worker-v1",
          },
          {
            id: "worker-3",
            role: "worker",
            label: "Worker 3",
            providerChain: [{ provider: "codex", model: "gpt-4" }],
            timeoutMs: 10000,
            promptVersion: "worker-v1",
          },
          {
            id: "worker-4",
            role: "worker",
            label: "Worker 4",
            providerChain: [{ provider: "codex", model: "gpt-4" }],
            timeoutMs: 10000,
            promptVersion: "worker-v1",
          },
        ]);

        const snapshot = await snapshotService.create(
          projectResult.id,
          ["readme.md"],
          new AbortController().signal,
        );

        // 1. Manager is default role for new project conversation
        const conv = conversationService.create({
          projectId: projectResult.id,
          role: null, // default
          profileId: null, // default
          contextSnapshotId: snapshot.id,
          title: "Initial consultation",
        });
        expect(conv.role).toBe("manager");
        expect(conv.profileId).toBe("manager");

        // 2. Direct Advisor chat rejects unless additionalUsageConfirmed=true
        const advisorConv = conversationService.create({
          projectId: projectResult.id,
          role: "advisor",
          profileId: "advisor",
          contextSnapshotId: snapshot.id,
          title: "Advisor chat",
        });

        await expect(
          conversationService.send(
            advisorConv.id,
            {
              body: "Hi advisor",
              selectedMessageIds: [],
              selectedArtifactIds: [],
              additionalUsageConfirmed: false,
            },
            new AbortController().signal,
          ),
        ).rejects.toThrow(/Advisor consultation is rejected unless additionalUsageConfirmed/);

        // 3. Antigravity-only worker chain throws provider_capability_unavailable
        const agyConv = conversationService.create({
          projectId: projectResult.id,
          role: "worker",
          profileId: "worker-1", // Antigravity-only
          contextSnapshotId: snapshot.id,
          title: "Worker 1 chat",
        });

        await expect(
          conversationService.send(
            agyConv.id,
            {
              body: "Do work",
              selectedMessageIds: [],
              selectedArtifactIds: [],
              additionalUsageConfirmed: false,
            },
            new AbortController().signal,
          ),
        ).rejects.toThrow(/No compatible read-only provider/);

        // 4. Codex conversation send runs successfully (mocks execution)
        executeSpy.mockResolvedValueOnce({
          exitCode: 0,
          durationMs: 1,
          structuredOutput: {
            message: "Yes manager, here is a draft idea",
            citedArtifactIds: [],
            draftSuggestion: {
              objective: "Build test setup",
              scope: ["readme.md"],
              constraints: ["TypeScript only"],
              acceptanceCriteria: ["All test pass"],
            },
          },
          stdout: null,
          stderr: null,
          errorCode: null,
        });

        const replyMsg = await conversationService.send(
          conv.id,
          {
            body: "Analyze requirements",
            selectedMessageIds: [],
            selectedArtifactIds: [],
            additionalUsageConfirmed: false,
          },
          new AbortController().signal,
        );

        expect(replyMsg.sender).toBe("agent");
        expect(replyMsg.body).toContain("Yes manager");

        // 5. Send to Manager preserves source details & creates draft version 1
        executeSpy.mockResolvedValueOnce({
          exitCode: 0,
          durationMs: 1,
          structuredOutput: {
            objective: "Define office scope",
            scope: ["readme.md"],
            constraints: ["no compound shell"],
            acceptanceCriteria: ["passes typecheck"],
          },
          stdout: null,
          stderr: null,
          errorCode: null,
        });

        const draftVersion = await conversationService.forwardToManager(
          conv.id,
          [replyMsg.id],
          new AbortController().signal,
        );
        expect(draftVersion.version).toBe(1);
        expect(draftVersion.objective).toBe("Define office scope");
        expect(draftVersion.sourceMessageIds).toContain(replyMsg.id);

        // 6. Update draft appends version N+1
        const updatedVersion = conversationService.updateDraft(draftVersion.draftId, {
          objective: "Updated objective",
          scope: ["readme.md"],
          constraints: ["no compound shell"],
          acceptanceCriteria: ["passes typecheck"],
        });
        expect(updatedVersion.version).toBe(2);
        expect(updatedVersion.objective).toBe("Updated objective");

        // Earlier version 1 is unchanged
        const original = conversationStore.getDraftVersion(draftVersion.draftId, 1);
        expect(original?.objective).toBe("Define office scope");
      } finally {
        db.close();
        executeSpy.mockRestore();
      }
    });
  });
});
