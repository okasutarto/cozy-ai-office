import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import type { ProjectStore } from "../db/project-store.js";
import type {
  ConversationStore,
  ConversationRecord,
  MessageRecord,
} from "../db/conversation-store.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ContextSnapshotService } from "../context/snapshots.js";
import type { ArtifactStore } from "../artifacts/store.js";
import type { ProviderRequest, ProviderRuntime, ProviderAdapter } from "../providers/types.js";
import {
  type TaskDraftVersion,
  ChatResponseSchema,
  DraftSuggestionSchema,
} from "../../shared/contracts.js";
import { AppError } from "../errors.js";
import { buildDiscussionPrompt, buildDraftPrompt } from "../prompts/manager.js";
import { executeProviderRequest } from "../providers/execute.js";

export type CreateConversationInput = {
  projectId: string;
  role: string | null;
  profileId: string | null;
  contextSnapshotId: string;
  runId: string | null;
  title: string;
};

export type SendMessageInput = {
  body: string;
  selectedMessageIds: string[];
  selectedArtifactIds: string[];
  additionalUsageConfirmed: boolean;
};

export type UpdateDraftInput = {
  objective: string;
  scope: string[];
  constraints: string[];
  acceptanceCriteria: string[];
};

export class ConversationService {
  constructor(
    public readonly db: Database.Database,
    public readonly projectStore: ProjectStore,
    public readonly conversationStore: ConversationStore,
    public readonly registry: ProviderRegistry,
    public readonly snapshots: ContextSnapshotService,
    public readonly artifacts: ArtifactStore,
  ) {}

  create(input: CreateConversationInput): ConversationRecord {
    const role = input.role || "manager";
    const profileId = input.profileId || "manager";

    const record: ConversationRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      role,
      profileId,
      contextSnapshotId: input.contextSnapshotId,
      runId: input.runId,
      title: input.title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.conversationStore.createConversation(record);
  }

  async send(
    conversationId: string,
    input: SendMessageInput,
    signal: AbortSignal,
  ): Promise<MessageRecord> {
    const conv = this.conversationStore.getConversation(conversationId);
    if (!conv) throw new AppError("conversation_not_found", "Conversation not found", 404);

    const allMessages = this.conversationStore.listMessages(conversationId);
    const selectedMessages = allMessages.filter((m) => input.selectedMessageIds.includes(m.id));

    if (selectedMessages.length > 20) {
      throw new AppError("context_limit_exceeded", "Too many selected messages", 400);
    }
    const totalChars = selectedMessages.reduce((sum, m) => sum + m.body.length, 0);
    if (totalChars > 40000) {
      throw new AppError("context_limit_exceeded", "Combined character limit exceeded", 400);
    }

    if (conv.role === "advisor" && !input.additionalUsageConfirmed) {
      throw new AppError(
        "usage_confirmation_required",
        "Advisor consultation is rejected unless additionalUsageConfirmed=true",
        400,
      );
    }

    const profiles = this.projectStore.listRoleProfiles(conv.projectId);
    const profile = profiles.find((p) => p.id === conv.profileId);
    if (!profile) throw new AppError("profile_not_found", "Role profile not found", 404);

    let chosenCandidate = null;
    for (const candidate of profile.providerChain) {
      if (!this.registry.isProbed(candidate.provider)) continue;
      const status = this.registry.statusFor(candidate.provider);
      if (status && status.installed && status.authenticated && status.capabilities.readOnly) {
        chosenCandidate = candidate;
        break;
      }
    }

    if (!chosenCandidate) {
      throw new AppError(
        "provider_capability_unavailable",
        "No compatible read-only provider is available in the profile chain",
        400,
      );
    }

    const adapter = this.registry.get(chosenCandidate.provider);
    if (!adapter) {
      throw new AppError(
        "provider_not_found",
        `Adapter ${chosenCandidate.provider} not found`,
        400,
      );
    }

    const disposable = await this.snapshots.materializeDisposable(
      conv.contextSnapshotId,
      randomUUID(),
    );
    try {
      const ownerMessage = this.conversationStore.appendMessage({
        id: randomUUID(),
        conversationId,
        sender: "owner",
        body: input.body,
        sourceMessageIds: input.selectedMessageIds,
        artifactIds: input.selectedArtifactIds,
        createdAt: new Date().toISOString(),
      });

      const promptMessages = [...selectedMessages, ownerMessage];
      const artifactSummaries: string[] = [];

      const prompt = buildDiscussionPrompt({
        role: conv.role as any,
        messages: promptMessages,
        artifactSummaries,
      });

      const providerRequest: ProviderRequest = {
        requestId: randomUUID(),
        runId: null,
        taskId: null,
        conversationId,
        contextSnapshotId: conv.contextSnapshotId,
        role: conv.role as any,
        profileId: conv.profileId as any,
        model: chosenCandidate.model,
        prompt,
        cwd: disposable.path,
        timeoutMs: profile.timeoutMs,
        readOnly: true,
        outputContract: "chat_response",
      };

      const providerRuntime: ProviderRuntime = {
        supervisor: this.registry.supervisor!,
        artifacts: this.artifacts,
        tempDir: this.registry.tempDir!,
        statusFor: (p) => this.registry.statusFor(p),
      };

      const response = await executeProviderRequest(
        adapter,
        providerRequest,
        providerRuntime,
        signal,
      );

      if (response.errorCode) {
        throw new AppError(
          "provider_execution_failed",
          `Provider execution failed with error code: ${response.errorCode}`,
          500,
        );
      }

      const chatResponse = ChatResponseSchema.parse(response.structuredOutput);

      await disposable.verifyUnchanged();

      for (const citedId of chatResponse.citedArtifactIds) {
        if (!input.selectedArtifactIds.includes(citedId)) {
          throw new AppError(
            "policy_violation",
            `Cited artifact ${citedId} was not in selected list`,
            400,
          );
        }
      }

      const agentMsg = this.conversationStore.appendMessage({
        id: randomUUID(),
        conversationId,
        sender: "agent",
        body: chatResponse.message,
        sourceMessageIds: [ownerMessage.id],
        artifactIds: chatResponse.citedArtifactIds,
        createdAt: new Date().toISOString(),
      });

      return agentMsg;
    } finally {
      await disposable.dispose();
    }
  }

  async forwardToManager(
    conversationId: string,
    messageIds: string[],
    signal: AbortSignal,
  ): Promise<TaskDraftVersion> {
    const conv = this.conversationStore.getConversation(conversationId);
    if (!conv) throw new AppError("conversation_not_found", "Conversation not found", 404);

    const allMessages = this.conversationStore.listMessages(conversationId);
    const sourceMessages = allMessages.filter((m) => messageIds.includes(m.id));

    const profiles = this.projectStore.listRoleProfiles(conv.projectId);
    const managerProfile = profiles.find((p) => p.id === "manager");
    if (!managerProfile) throw new AppError("profile_not_found", "Manager profile not found", 404);

    let chosenCandidate = null;
    for (const candidate of managerProfile.providerChain) {
      if (!this.registry.isProbed(candidate.provider)) continue;
      const status = this.registry.statusFor(candidate.provider);
      if (status && status.installed && status.authenticated && status.capabilities.readOnly) {
        chosenCandidate = candidate;
        break;
      }
    }
    if (!chosenCandidate) {
      throw new AppError(
        "provider_capability_unavailable",
        "Manager read-only provider unavailable",
        400,
      );
    }

    const adapter = this.registry.get(chosenCandidate.provider);
    if (!adapter) {
      throw new AppError(
        "provider_not_found",
        `Adapter ${chosenCandidate.provider} not found`,
        400,
      );
    }

    const disposable = await this.snapshots.materializeDisposable(
      conv.contextSnapshotId,
      randomUUID(),
    );
    try {
      const prompt = buildDraftPrompt(sourceMessages);

      const providerRequest: ProviderRequest = {
        requestId: randomUUID(),
        runId: null,
        taskId: null,
        conversationId,
        contextSnapshotId: conv.contextSnapshotId,
        role: "manager",
        profileId: "manager",
        model: chosenCandidate.model,
        prompt,
        cwd: disposable.path,
        timeoutMs: managerProfile.timeoutMs,
        readOnly: true,
        outputContract: "draft_suggestion",
      };

      const providerRuntime: ProviderRuntime = {
        supervisor: this.registry.supervisor!,
        artifacts: this.artifacts,
        tempDir: this.registry.tempDir!,
        statusFor: (p) => this.registry.statusFor(p),
      };

      const response = await executeProviderRequest(
        adapter,
        providerRequest,
        providerRuntime,
        signal,
      );

      if (response.errorCode) {
        throw new AppError(
          "provider_execution_failed",
          `Provider execution failed with error code: ${response.errorCode}`,
          500,
        );
      }

      const draftSuggestion = DraftSuggestionSchema.parse(response.structuredOutput);
      await disposable.verifyUnchanged();

      const draftPayload = {
        objective: draftSuggestion.objective,
        scope: draftSuggestion.scope.sort(),
        constraints: draftSuggestion.constraints.sort(),
        acceptanceCriteria: draftSuggestion.acceptanceCriteria.sort(),
      };
      const canonicalJson = JSON.stringify(draftPayload);
      const sha256 = createHash("sha256").update(canonicalJson).digest("hex");

      const draftId = randomUUID();
      const draftVersion: TaskDraftVersion = {
        draftId,
        version: 1,
        objective: draftSuggestion.objective,
        scope: draftSuggestion.scope,
        constraints: draftSuggestion.constraints,
        acceptanceCriteria: draftSuggestion.acceptanceCriteria,
        contextSnapshotId: conv.contextSnapshotId,
        sourceMessageIds: messageIds,
        sha256,
        createdAt: new Date().toISOString(),
      };

      return this.conversationStore.createDraft(conv.projectId, draftVersion);
    } finally {
      await disposable.dispose();
    }
  }

  updateDraft(draftId: string, input: UpdateDraftInput): TaskDraftVersion {
    const current = this.conversationStore.getDraftVersion(draftId);
    if (!current) throw new AppError("draft_not_found", "Draft not found", 404);

    const draftPayload = {
      objective: input.objective,
      scope: input.scope.sort(),
      constraints: input.constraints.sort(),
      acceptanceCriteria: input.acceptanceCriteria.sort(),
    };
    const canonicalJson = JSON.stringify(draftPayload);
    const sha256 = createHash("sha256").update(canonicalJson).digest("hex");

    const nextVersion: TaskDraftVersion = {
      draftId,
      version: current.version + 1,
      objective: input.objective,
      scope: input.scope,
      constraints: input.constraints,
      acceptanceCriteria: input.acceptanceCriteria,
      contextSnapshotId: current.contextSnapshotId,
      sourceMessageIds: current.sourceMessageIds,
      sha256,
      createdAt: new Date().toISOString(),
    };

    return this.conversationStore.appendDraftVersion(nextVersion);
  }
}
