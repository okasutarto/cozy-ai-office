import React from "react";
import type { RunEvent } from "../../shared/contracts.js";

type TimelineProps = {
  events: RunEvent[];
  onLoadEarlier?(): void;
};

export const Timeline: React.FC<TimelineProps> = ({ events, onLoadEarlier }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "10px",
        overflowY: "auto",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      {onLoadEarlier && (
        <button
          type="button"
          onClick={onLoadEarlier}
          style={{
            alignSelf: "center",
            background: "var(--ink-850)",
            color: "var(--parchment-200)",
            border: "1px solid var(--ink-800)",
            padding: "4px 8px",
            fontSize: "11px",
            cursor: "pointer",
            marginBottom: "10px",
          }}
        >
          Load Earlier Events
        </button>
      )}

      {events.length === 0 ? (
        <div style={{ color: "var(--parchment-300)", textAlign: "center", fontSize: "12px", padding: "20px" }}>
          No run events recorded yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {events.map((event) => {
            let icon = "⚙️";
            let color = "var(--parchment-200)";

            if (event.kind.startsWith("run.state")) {
              icon = "🏃";
              color = "var(--teal-400)";
            } else if (event.kind.includes("consultation")) {
              icon = "💬";
              color = "var(--gold-400)";
            } else if (event.kind === "advisor.gate") {
              icon = "🛡️";
              color = "var(--rose-400)";
            } else if (event.kind.includes("task.finished") || event.kind.includes("integration.finished")) {
              icon = "✅";
              color = "var(--moss)";
            } else if (event.kind.includes("failed")) {
              icon = "❌";
              color = "var(--warning)";
            }

            return (
              <div
                key={event.sequence}
                style={{
                  display: "flex",
                  gap: "10px",
                  fontSize: "12px",
                  borderLeft: `2px solid ${color}`,
                  paddingLeft: "8px",
                  marginLeft: "4px",
                }}
              >
                <span style={{ fontSize: "14px" }}>{icon}</span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontWeight: "bold", color: "#fff" }}>
                    {event.kind.replace(/_/g, " ").toUpperCase()}
                  </div>
                  {event.actorId && (
                    <div style={{ fontSize: "10px", color: "var(--gold-300)" }}>
                      Actor: {event.actorId}
                    </div>
                  )}
                  {event.taskId && (
                    <div style={{ fontSize: "10px", color: "var(--parchment-300)" }}>
                      Task: {event.taskId}
                    </div>
                  )}
                  <div style={{ fontSize: "10px", color: "var(--parchment-300)" }}>
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
