import {
  BootstrapResponseSchema,
  WsServerMessageSchema,
  ConversationRecordSchema,
  ConversationListResponseSchema,
  MessageListResponseSchema,
  MessageRecordSchema,
  TaskDraftVersionSchema,
  RunEvidenceSchema,
  RunStorageSchema,
  CleanupResultSchema,
  type BootstrapResponse,
  type WsClientMessage,
  type ConversationRecord,
  type MessageRecord,
  type RunEvidence,
  type RunStorage,
  type CleanupResult,
} from "../shared/api.js";
import { type TaskDraftVersion, type RunSnapshot, RunSnapshotSchema } from "../shared/contracts.js";

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

  async createConversation(projectId: string, body: unknown): Promise<ConversationRecord> {
    const res = await this.request(`/api/projects/${projectId}/conversations`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return ConversationRecordSchema.parse(res);
  }

  async listConversations(projectId: string): Promise<ConversationRecord[]> {
    const res = await this.request(`/api/projects/${projectId}/conversations`);
    return ConversationListResponseSchema.parse(res);
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    const res = await this.request(`/api/conversations/${conversationId}/messages`);
    return MessageListResponseSchema.parse(res);
  }

  async sendMessage(conversationId: string, body: unknown): Promise<MessageRecord> {
    const res = await this.request(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return MessageRecordSchema.parse(res);
  }

  async forwardToManager(conversationId: string, messageIds: string[]): Promise<TaskDraftVersion> {
    const res = await this.request(`/api/conversations/${conversationId}/forward-to-manager`, {
      method: "POST",
      body: JSON.stringify({ messageIds }),
    });
    return TaskDraftVersionSchema.parse(res);
  }

  async getDraft(draftId: string): Promise<TaskDraftVersion> {
    const res = await this.request(`/api/drafts/${draftId}`);
    return TaskDraftVersionSchema.parse(res);
  }

  async updateDraft(draftId: string, body: unknown): Promise<TaskDraftVersion> {
    const res = await this.request(`/api/drafts/${draftId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return TaskDraftVersionSchema.parse(res);
  }

  async startRun(
    draftId: string,
    expectedDraftVersion: number,
    concurrency: number,
  ): Promise<RunSnapshot> {
    const res = await this.request(`/api/drafts/${draftId}/start`, {
      method: "POST",
      body: JSON.stringify({ expectedDraftVersion, concurrency }),
    });
    return RunSnapshotSchema.parse(res);
  }

  async pauseRun(run: RunSnapshot): Promise<RunSnapshot> {
    const res = await this.request(`/api/runs/${run.id}/pause`, {
      method: "POST",
      body: JSON.stringify({ expectedUpdatedAt: run.updatedAt }),
    });
    return RunSnapshotSchema.parse(res);
  }

  async resumeRun(run: RunSnapshot): Promise<RunSnapshot> {
    const res = await this.request(`/api/runs/${run.id}/resume`, {
      method: "POST",
      body: JSON.stringify({ expectedUpdatedAt: run.updatedAt }),
    });
    return RunSnapshotSchema.parse(res);
  }

  async cancelRun(run: RunSnapshot): Promise<RunSnapshot> {
    const res = await this.request(`/api/runs/${run.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ expectedUpdatedAt: run.updatedAt }),
    });
    return RunSnapshotSchema.parse(res);
  }

  async retryTask(run: RunSnapshot, taskId: string): Promise<RunSnapshot> {
    const res = await this.request(`/api/runs/${run.id}/retry-task`, {
      method: "POST",
      body: JSON.stringify({ expectedUpdatedAt: run.updatedAt, taskId }),
    });
    return RunSnapshotSchema.parse(res);
  }

  async applyRun(run: RunSnapshot): Promise<RunSnapshot> {
    const res = await this.request(`/api/runs/${run.id}/apply`, {
      method: "POST",
      body: JSON.stringify({ expectedUpdatedAt: run.updatedAt }),
    });
    return RunSnapshotSchema.parse(res);
  }

  async getRunEvidence(runId: string): Promise<RunEvidence> {
    const res = await this.request(`/api/runs/${runId}/evidence`);
    return RunEvidenceSchema.parse(res);
  }

  async getRunStorage(runId: string): Promise<RunStorage> {
    const res = await this.request(`/api/runs/${runId}/storage`);
    return RunStorageSchema.parse(res);
  }

  async cleanupRun(runId: string, confirmation: string): Promise<CleanupResult> {
    const res = await this.request(`/api/runs/${runId}/storage`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation }),
    });
    return CleanupResultSchema.parse(res);
  }

  async downloadArtifact(artifactId: string): Promise<Blob> {
    const response = await fetch(`/api/artifacts/${encodeURIComponent(artifactId)}`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      let detail = `Artifact download failed (${response.status})`;
      try {
        const body = (await response.json()) as { message?: string; error?: { message?: string } };
        detail = body.error?.message ?? body.message ?? detail;
      } catch {
        // The artifact route can return plain text errors; keep the status-based message.
      }
      throw new Error(detail);
    }
    return response.blob();
  }
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  constructor(
    private readonly token: string,
    private readonly onMessage: (message: ReturnType<typeof WsServerMessageSchema.parse>) => void,
    private readonly onStatus: (status: "connecting" | "active" | "offline") => void = () => {},
  ) {}
  connect(runId: string | null, afterSequence: number): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.onStatus("connecting");
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket.addEventListener("open", () => this.onStatus("connecting"));
    this.socket.addEventListener("message", (event) => {
      const msg = WsServerMessageSchema.parse(JSON.parse(String(event.data)));
      if (msg.type === "challenge") {
        this.send({ type: "auth", token: this.token, nonce: msg.nonce });
        this.send({ type: "subscribe", runId, afterSequence });
        return;
      }
      if (msg.type === "authenticated") {
        this.onStatus("active");
      }
      this.onMessage(msg);
    });
    this.socket.addEventListener("close", () => this.onStatus("offline"));
    this.socket.addEventListener("error", () => this.onStatus("offline"));
  }
  send(message: WsClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }
  close(): void {
    this.socket?.close(1000, "client closed");
    this.socket = null;
    this.onStatus("offline");
  }
}
