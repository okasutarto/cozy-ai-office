import React from "react";
import { useAppState } from "../store.js";

type TopBarProps = {
  onPause(): void;
  onResume(): void;
  onCancel(): void;
  onApply(): void;
  onCleanup(): void;
  onShowDiff(): void;
  onOpenSetup?(): void;
  realtimeStatus?: "connecting" | "active" | "offline";
};

export const TopBar: React.FC<TopBarProps> = ({
  onPause,
  onResume,
  onCancel,
  onApply,
  onCleanup,
  onShowDiff,
  onOpenSetup,
  realtimeStatus,
}) => {
  const { bootstrap, selectedProjectId, run } = useAppState();
  const project = bootstrap?.projects.find((item) => item.id === selectedProjectId);
  const terminal = Boolean(
    run && ["applied", "failed", "blocked", "cancelled"].includes(run.state),
  );
  const canPause = Boolean(
    run &&
    !terminal &&
    !run.dispatchPaused &&
    [
      "advisor_preflight",
      "dispatching",
      "working",
      "integrating",
      "testing",
      "advisor_delivery",
    ].includes(run.state),
  );
  const canResume = Boolean(run && !terminal && run.dispatchPaused);
  const canCancel = Boolean(run && !terminal);
  const canApply = Boolean(run?.state === "ready_to_apply");
  const canCleanup = Boolean(run && terminal);
  const availableProviders =
    bootstrap?.providers.filter(
      (provider) =>
        provider.installed && provider.authenticated && provider.capabilities.nonInteractive,
    ) ?? [];

  const realtimeTone =
    realtimeStatus === "active"
      ? "success"
      : realtimeStatus === "connecting"
        ? "warning"
        : "danger";

  return (
    <header
      style={{
        gridArea: "top",
        minWidth: 0,
        height: "100%",
        padding: "0 12px",
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) auto minmax(360px, 1fr)",
        alignItems: "center",
        gap: 14,
        background: "var(--ink-950)",
        borderBottom: "var(--panel-border)",
      }}
    >
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <p className="eyebrow" style={{ color: "var(--gold-400)" }}>
            Cozy Agent Office
          </p>
          <strong style={{ display: "block", marginTop: 3, color: "white", fontSize: 12 }}>
            Local orchestration control room
          </strong>
        </div>
        {project && (
          <div
            style={{
              minWidth: 0,
              padding: "6px 9px",
              background: "var(--ink-800)",
              border: "1px solid var(--wood-900)",
            }}
          >
            <span className="eyebrow">Repository workspace</span>
            <div
              style={{
                maxWidth: 270,
                marginTop: 3,
                overflow: "hidden",
                color: "white",
                fontSize: 10,
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={project.rootPath}
            >
              {project.name} · {project.rootPath}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {realtimeStatus && (
          <span className={`status-chip ${realtimeTone}`} role="status" aria-live="polite">
            <i className="dot" /> WS {realtimeStatus}
          </span>
        )}
        <span className="eyebrow">Providers</span>
        {(bootstrap?.providers ?? []).map((provider) => {
          const available = availableProviders.some((item) => item.provider === provider.provider);
          return (
            <span
              key={provider.provider}
              className={`micro-chip ${available ? "success" : "danger"}`}
              title={provider.diagnostic ?? undefined}
            >
              <i className="dot" /> {provider.provider}
            </span>
          );
        })}
      </div>

      <div
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
        }}
      >
        {run && (
          <div style={{ marginRight: 4, textAlign: "right" }}>
            <span className="eyebrow">{run.baseBranch}</span>
            <span
              className={`status-chip ${run.state === "failed" || run.state === "blocked" ? "danger" : run.dispatchPaused ? "warning" : "success"}`}
              style={{ marginLeft: 7 }}
            >
              <i className="dot" /> {run.dispatchPaused ? "paused" : run.state.replaceAll("_", " ")}
            </span>
          </div>
        )}
        {onOpenSetup && (
          <button type="button" className="cozy-button" onClick={onOpenSetup}>
            Setup
          </button>
        )}
        {canPause && (
          <button type="button" className="cozy-button" onClick={onPause}>
            Pause
          </button>
        )}
        {canResume && (
          <button type="button" className="cozy-button primary" onClick={onResume}>
            Resume
          </button>
        )}
        {run && (
          <button type="button" className="cozy-button" onClick={onShowDiff}>
            Evidence
          </button>
        )}
        {canApply && (
          <button type="button" className="cozy-button success" onClick={onApply}>
            Apply Changes
          </button>
        )}
        {canCancel && (
          <button type="button" className="cozy-button danger" onClick={onCancel}>
            Cancel
          </button>
        )}
        {canCleanup && (
          <button type="button" className="cozy-button danger" onClick={onCleanup}>
            Cleanup Run
          </button>
        )}
      </div>
    </header>
  );
};
