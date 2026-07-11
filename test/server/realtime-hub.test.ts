import { describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { RealtimeHub } from "../../src/server/realtime/hub.js";

describe("RealtimeHub", () => {
  it("publishes a fresh run snapshot after each run event", () => {
    const run = { id: "c5e3b5b4-a400-4f50-9f7d-98c7802d611f", state: "ready_to_apply" };
    const runs = {
      getRun: vi.fn().mockReturnValue(run),
      listEvents: vi.fn().mockReturnValue([]),
    };
    const sent: string[] = [];
    const socket = {
      readyState: WebSocket.OPEN,
      once: vi.fn(),
      send: vi.fn((message: string) => sent.push(message)),
    };
    const hub = new RealtimeHub(runs as any);

    hub.add(socket as any);
    hub.subscribe(socket as any, run.id, 0);
    hub.publish({
      sequence: 1,
      runId: run.id,
      kind: "run.state.changed",
      actorId: null,
      taskId: null,
      payload: { from: "reviewing", to: "ready_to_apply" },
      createdAt: new Date().toISOString(),
    });

    expect(sent.map((message) => JSON.parse(message))).toEqual([
      expect.objectContaining({ type: "event" }),
      { type: "snapshot", run },
    ]);
  });
});
