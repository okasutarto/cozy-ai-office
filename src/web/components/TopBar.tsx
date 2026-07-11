import React from "react";
import { useAppState } from "../store.js";

type TopBarProps = {
  onPause(): void;
  onResume(): void;
  onCancel(): void;
  onApply(): void;
  onCleanup(): void;
  onShowDiff(): void;
};

export const TopBar: React.FC<TopBarProps> = ({
  onPause,
  onResume,
  onCancel,
  onApply,
  onCleanup,
  onShowDiff,
}) => {
  const { bootstrap, selectedProjectId, run } = useAppState();

  const project = bootstrap?.projects.find((p) => p.id === selectedProjectId);

  const isTerminal = run
    ? ["applied", "failed", "blocked", "cancelled"].includes(run.state)
    : false;

  const showPause =
    run &&
    !isTerminal &&
    !run.dispatchPaused &&
    ["advisor_preflight", "dispatching", "working", "integrating", "testing", "advisor_delivery"].includes(
      run.state,
    );

  const showResume = run && !isTerminal && run.dispatchPaused;

  const showCancel = run && !isTerminal;

  const showApply = run && run.state === "ready_to_apply";

  const showCleanup = run && isTerminal;

  return (
    <header
      style={{
        gridArea: "top",
        background: "var(--ink-800)",
        borderBottom: "var(--pixel-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        height: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <h1
          style={{ margin: 0, fontSize: "18px", color: "var(--gold-400)", fontFamily: "inherit" }}
        >
          Cozy Agent Office
        </h1>
        {project && (
          <span style={{ fontSize: "14px", color: "var(--parchment-300)" }}>
            Project: <strong>{project.name}</strong>
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
        {run && (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px" }}>
            <span>
              Branch: <strong>{run.baseBranch}</strong>
            </span>
            <span>
              State: <strong style={{ color: "var(--gold-400)" }}>{run.state.toUpperCase()}</strong>
            </span>
            {run.dispatchPaused && (
              <span
                style={{
                  background: "var(--rose-500)",
                  color: "white",
                  padding: "2px 6px",
                  fontSize: "11px",
                  fontWeight: "bold",
                }}
              >
                PAUSED
              </span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px" }}>
          {showPause && (
            <button
              type="button"
              onClick={onPause}
              style={{
                background: "var(--ink-950)",
                color: "var(--gold-400)",
                border: "1px solid var(--gold-400)",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Pause
            </button>
          )}

          {showResume && (
            <button
              type="button"
              onClick={onResume}
              style={{
                background: "var(--gold-400)",
                color: "var(--ink-950)",
                border: "none",
                padding: "4px 8px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "12px",
              }}
            >
              Resume
            </button>
          )}

          {showCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: "var(--rose-600)",
                color: "#fff",
                border: "none",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Cancel
            </button>
          )}

          {showApply && (
            <button
              type="button"
              onClick={onApply}
              style={{
                background: "var(--moss)",
                color: "#fff",
                border: "none",
                padding: "4px 8px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "12px",
              }}
            >
              Apply Changes
            </button>
          )}

          {run && (
            <button
              type="button"
              onClick={onShowDiff}
              style={{
                background: "var(--ink-850)",
                color: "var(--parchment-100)",
                border: "1px solid var(--parchment-300)",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              View Evidence
            </button>
          )}

          {showCleanup && (
            <button
              type="button"
              onClick={onCleanup}
              style={{
                background: "var(--rose-700)",
                color: "#fff",
                border: "none",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "12px",
              }}
            >
              Cleanup Run
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
