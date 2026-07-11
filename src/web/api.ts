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
