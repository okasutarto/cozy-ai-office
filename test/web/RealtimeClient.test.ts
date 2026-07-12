// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient } from "../../src/web/api.js";

type SocketEvent = "open" | "message" | "close" | "error";
type SocketListener = (event: Event | MessageEvent) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readonly close = vi.fn();
  private readonly listeners = new Map<SocketEvent, SocketListener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: SocketEvent, listener: SocketListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  emit(type: Exclude<SocketEvent, "message">): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }

  emitMessage(message: unknown): void {
    const event = new MessageEvent("message", { data: JSON.stringify(message) });
    for (const listener of this.listeners.get("message") ?? []) {
      listener(event);
    }
  }
}

describe("RealtimeClient status", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("connects, authenticates a challenge, subscribes, then reports active", () => {
    const onMessage = vi.fn();
    const onStatus = vi.fn();
    const client = new RealtimeClient("session-token", onMessage, onStatus);

    client.connect("run-1", 41);

    expect(onStatus).toHaveBeenCalledWith("connecting");
    const socket = FakeWebSocket.instances[0]!;
    socket.emit("open");
    expect(onStatus).toHaveBeenLastCalledWith("connecting");

    socket.emitMessage({ type: "challenge", nonce: "a".repeat(32) });
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: "auth", token: "session-token", nonce: "a".repeat(32) },
      { type: "subscribe", runId: "run-1", afterSequence: 41 },
    ]);
    expect(onMessage).not.toHaveBeenCalled();

    socket.emitMessage({ type: "authenticated" });
    expect(onStatus).toHaveBeenLastCalledWith("active");
    expect(onMessage).toHaveBeenCalledWith({ type: "authenticated" });
  });

  it("reports offline when the socket errors", () => {
    const onStatus = vi.fn();
    const client = new RealtimeClient("session-token", vi.fn(), onStatus);
    client.connect(null, 0);
    onStatus.mockClear();

    FakeWebSocket.instances[0]!.emit("error");

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("offline");
  });

  it("reports offline when the remote socket closes", () => {
    const onStatus = vi.fn();
    const client = new RealtimeClient("session-token", vi.fn(), onStatus);
    client.connect(null, 0);
    onStatus.mockClear();

    FakeWebSocket.instances[0]!.emit("close");

    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("offline");
  });

  it("closes the socket and reports offline on explicit close", () => {
    const onStatus = vi.fn();
    const client = new RealtimeClient("session-token", vi.fn(), onStatus);
    client.connect(null, 0);
    const socket = FakeWebSocket.instances[0]!;
    onStatus.mockClear();

    client.close();

    expect(socket.close).toHaveBeenCalledWith(1000, "client closed");
    expect(onStatus).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("offline");
  });
});
