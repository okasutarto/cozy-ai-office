import React from "react";
import { useAppState } from "../store.js";

export const TopBar: React.FC = () => {
  const { bootstrap, selectedProjectId, run } = useAppState();

  const project = bootstrap?.projects.find((p) => p.id === selectedProjectId);

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
              State: <strong style={{ color: "var(--gold-400)" }}>{run.state}</strong>
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
          <button
            type="button"
            disabled
            style={{
              background: "var(--ink-950)",
              color: "var(--parchment-300)",
              border: "1px solid var(--parchment-300)",
              padding: "4px 8px",
              cursor: "not-allowed",
              fontSize: "12px",
            }}
          >
            Start Run
          </button>
          <button
            type="button"
            disabled
            style={{
              background: "var(--ink-950)",
              color: "var(--parchment-300)",
              border: "1px solid var(--parchment-300)",
              padding: "4px 8px",
              cursor: "not-allowed",
              fontSize: "12px",
            }}
          >
            Pause
          </button>
        </div>
      </div>
    </header>
  );
};
