import React from "react";
import type { RunSnapshot } from "../../shared/contracts.js";

type TaskBoardProps = {
  run: RunSnapshot | null;
  onSelectTask(taskId: string): void;
};

export const TaskBoard: React.FC<TaskBoardProps> = ({ run, onSelectTask }) => {
  if (!run) {
    return (
      <div
        style={{
          padding: "15px",
          color: "var(--parchment-300)",
          textAlign: "center",
          fontSize: "13px",
        }}
      >
        No active run. Review or start a task draft to begin execution.
      </div>
    );
  }

  const tasks = run.tasks;

  const columns = [
    { title: "Plan", status: ["queued"] },
    { title: "Running", status: ["running"] },
    { title: "Blocked/Failed", status: ["blocked", "failed"] },
    { title: "Done", status: ["completed"] },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "10px",
        height: "100%",
        padding: "10px",
        overflowY: "auto",
      }}
    >
      {columns.map((col, idx) => {
        const filtered = tasks.filter((t) => col.status.includes(t.status));

        return (
          <div
            key={idx}
            style={{
              background: "var(--ink-950)",
              border: "1px solid var(--ink-800)",
              borderRadius: "4px",
              display: "flex",
              flexDirection: "column",
              padding: "8px",
              minHeight: "200px",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "13px",
                color: "var(--gold-400)",
                borderBottom: "1px solid var(--ink-800)",
                paddingBottom: "5px",
              }}
            >
              {col.title} ({filtered.length})
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
              {filtered.map((task) => {
                let statusColor = "var(--parchment-300)";
                if (task.status === "running") statusColor = "var(--teal-400)";
                if (task.status === "failed") statusColor = "var(--warning)";
                if (task.status === "blocked") statusColor = "var(--rose-400)";
                if (task.status === "completed") statusColor = "var(--moss)";

                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    style={{
                      background: "var(--ink-900)",
                      border: "var(--pixel-border)",
                      padding: "10px",
                      cursor: "pointer",
                      fontSize: "12px",
                      borderRadius: "2px",
                      transition: "border-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--gold-400)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--ink-750)";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontWeight: "bold", color: "#fff" }}>{task.id}</span>
                      <span style={{ color: statusColor, fontSize: "10px", fontWeight: "bold" }}>
                        {task.status.toUpperCase()}
                      </span>
                    </div>
                    <div
                      style={{
                        color: "var(--parchment-200)",
                        fontSize: "11px",
                        marginBottom: "6px",
                      }}
                    >
                      {task.title}
                    </div>
                    {task.assignedProfileId && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          fontSize: "10px",
                          color: "var(--gold-300)",
                        }}
                      >
                        Actor: {task.assignedProfileId}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
