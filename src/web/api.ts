import {
  BootstrapResponseSchema,
  WsServerMessageSchema,
  ConversationRecordSchema,
  ConversationListResponseSchema,
  MessageListResponseSchema,
  MessageRecordSchema,
  TaskDraftVersionSchema,
  type BootstrapResponse,
  type WsClientMessage,
  type ConversationRecord,
  type MessageRecord,
} from "../shared/api.js";
import type { TaskDraftVersion } from "../shared/contracts.js";

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
    const res = await this.request("/api/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return ConversationRecordSchema.parse(res);
  }

  async listConversations(projectId: string): Promise<ConversationRecord[]> {
    const res = await this.request(`/api/conversations?projectId=${projectId}`);
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
    const res = await this.request(`/api/conversations/${conversationId}/forward`, {
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
    this.socket.addEventListener("message", (event) => {
      const msg = WsServerMessageSchema.parse(JSON.parse(String(event.data)));
      if (msg.type === "challenge") {
        this.send({ type: "auth", token: this.token, nonce: msg.nonce });
        this.send({ type: "subscribe", runId, afterSequence });
        return;
      }
      this.onMessage(msg);
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
