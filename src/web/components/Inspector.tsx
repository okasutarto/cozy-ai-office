import React from "react";
import type { ProfileId, RunSnapshot, ProviderStatus } from "../../shared/contracts.js";
import type { AttemptView } from "../../shared/api.js";

type InspectorProps = {
  actorId: ProfileId;
  taskId: string | null;
  run: RunSnapshot | null;
  attempts: AttemptView[];
  providerStatuses: ProviderStatus[];
};

export const Inspector: React.FC<InspectorProps> = ({
  actorId,
  taskId,
  run,
  attempts,
  providerStatuses,
}) => {


  const selectedTask = run?.tasks.find((t: any) => t.id === taskId);
  const taskAttempts = attempts.filter((a) => a.taskId === taskId);

  return (
    <div
      style={{
        padding: "12px",
        color: "var(--parchment-100)",
        display: "flex",
        flexDirection: "column",
        gap: "15px",
        height: "100%",
        overflowY: "auto",
        background: "var(--ink-900)",
        borderLeft: "1px solid var(--ink-800)",
      }}
    >
      <h3 style={{ margin: 0, fontSize: "14px", color: "var(--gold-400)", borderBottom: "1px solid var(--ink-800)", paddingBottom: "5px" }}>
        Inspector
      </h3>

      {/* Selected Actor Card */}
      <section
        style={{
          background: "var(--ink-950)",
          border: "var(--pixel-border)",
          padding: "10px",
          borderRadius: "2px",
        }}
      >
        <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--gold-300)" }}>
          Role Profile: {actorId}
        </h4>
        <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div>
            <strong>Identity:</strong>{" "}
            {actorId === "manager"
              ? "Project Manager"
              : actorId === "advisor"
                ? "Repository Advisor"
                : actorId === "qa"
                  ? "QA Engineer"
                  : `Worker ${actorId.replace("worker-", "")}`}
          </div>
          {providerStatuses.map((status) => {
            return (
              <div key={status.provider} style={{ borderTop: "1px solid var(--ink-850)", paddingTop: "4px", marginTop: "4px" }}>
                <div>
                  <strong>Provider:</strong> {status.provider} (v{status.version || "unknown"})
                </div>
                <div>
                  <strong>Status:</strong>{" "}
                  <span style={{ color: status.authenticated ? "var(--moss)" : "var(--warning)" }}>
                    {status.authenticated ? "● Authenticated" : "○ Unauthenticated"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Selected Task Card */}
      {selectedTask ? (
        <section
          style={{
            background: "var(--ink-950)",
            border: "var(--pixel-border)",
            padding: "10px",
            borderRadius: "2px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <h4 style={{ margin: 0, fontSize: "12px", color: "var(--gold-300)" }}>
            Selected Task: {selectedTask.id}
          </h4>
          <div style={{ fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div>
              <strong>Title:</strong> {selectedTask.title}
            </div>
            <div>
              <strong>Status:</strong>{" "}
              <span
                style={{
                  color:
                    selectedTask.status === "completed"
                      ? "var(--moss)"
                      : selectedTask.status === "failed"
                        ? "var(--warning)"
                        : "var(--teal-400)",
                }}
              >
                {selectedTask.status.toUpperCase()}
              </span>
            </div>
            <div>
              <strong>Dependencies:</strong> {selectedTask.dependsOn.join(", ") || "None"}
            </div>
          </div>

          {/* Attempts list */}
          <div style={{ marginTop: "8px" }}>
            <h5 style={{ margin: "0 0 6px 0", fontSize: "11px", color: "var(--gold-300)" }}>
              Attempts ({taskAttempts.length})
            </h5>
            {taskAttempts.length === 0 ? (
              <p style={{ fontSize: "10px", color: "var(--parchment-300)", margin: 0 }}>
                No execution attempts made yet.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                {taskAttempts.map((att) => (
                  <li
                    key={att.id}
                    style={{
                      background: "var(--ink-900)",
                      padding: "6px",
                      borderRadius: "2px",
                      fontSize: "10px",
                      border: "1px solid var(--ink-800)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span>Attempt #{att.attemptNumber}</span>
                      <span style={{ color: att.status === "succeeded" ? "var(--moss)" : "var(--warning)" }}>
                        {att.status.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      Model: {att.provider}/{att.model}
                    </div>
                    {att.stdoutArtifactId && (
                      <div style={{ marginTop: "4px" }}>
                        <a
                          href={`/api/artifacts/${att.stdoutArtifactId}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--teal-400)", textDecoration: "underline", marginRight: "8px" }}
                        >
                          Stdout Log
                        </a>
                        {att.stderrArtifactId && (
                          <a
                            href={`/api/artifacts/${att.stderrArtifactId}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--teal-400)", textDecoration: "underline" }}
                          >
                            Stderr Log
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <div style={{ fontSize: "11px", color: "var(--parchment-300)" }}>
          Select a task from the Task Board to view execution attempts and logs.
        </div>
      )}
    </div>
  );
};
