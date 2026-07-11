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
