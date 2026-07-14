import React, { useEffect, useMemo, useState } from "react";
import { consumeSessionToken, ApiClient, RealtimeClient } from "./api.js";
import { useAppState, useAppDispatch } from "./store.js";
import { TopBar } from "./components/TopBar.js";
import { Onboarding } from "./components/Onboarding.js";
import { ConversationDock } from "./components/ConversationDock.js";
import type { RoleProfile, TaskDraftVersion } from "../shared/contracts.js";
import { OfficeCanvas } from "./office/OfficeCanvas.js";
import { TaskBoard } from "./components/TaskBoard.js";
import { Inspector } from "./components/Inspector.js";
import { ConfirmDialog } from "./components/ConfirmDialog.js";
import { DiffDialog } from "./components/DiffDialog.js";
import type { AttemptView, DiffView, QaReportView, AdvisorReviewView } from "../shared/api.js";

const OFFICE_ROLE_TABS = [
  ["manager", "Mgr"],
  ["worker-1", "W1"],
  ["worker-2", "W2"],
  ["worker-3", "W3"],
  ["worker-4", "W4"],
  ["advisor", "Adv"],
  ["qa", "QA"],
] as const;

export const App: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [token, setToken] = useState<string | null>(null);
  const [roleProfiles, setRoleProfiles] = useState<RoleProfile[]>([]);
  const [contextSnapshotId, setContextSnapshotId] = useState<string>("");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "active" | "offline">(
    "offline",
  );
  const [dockHeight, setDockHeight] = useState(290);

  // 1. Consume session token
  useEffect(() => {
    const t = consumeSessionToken();
    if (!t) {
      dispatch({ type: "missing_session" });
    } else {
      setToken(t);
    }
  }, [dispatch]);

  const api = useMemo(() => (token ? new ApiClient(token) : null), [token]);

  const [attempts, setAttempts] = useState<AttemptView[]>([]);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    danger?: boolean;
    requiredText?: string;
    showConcurrency?: boolean;
    pending?: boolean;
    error?: string | null;
    onConfirm(concurrency?: number): void;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const [diffDialog, setDiffDialog] = useState<{
    open: boolean;
    diff: DiffView | null;
    qa: QaReportView | null;
    advisorReviews: AdvisorReviewView[];
  }>({
    open: false,
    diff: null,
    qa: null,
    advisorReviews: [],
  });

  // Fetch attempts on run selection
  useEffect(() => {
    if (!api || !state.run?.id) {
      setAttempts([]);
      return;
    }
    api
      .getRunEvidence(state.run.id)
      .then((evidenceData) => {
        setAttempts(evidenceData.attempts);
      })
      .catch(() => {});
  }, [api, state.run?.id]);

  const handlePause = async () => {
    if (!api || !state.run) return;
    try {
      const updated = await api.pauseRun(state.run);
      dispatch({ type: "run_snapshot", run: updated });
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const handleResume = async () => {
    if (!api || !state.run) return;
    try {
      const updated = await api.resumeRun(state.run);
      dispatch({ type: "run_snapshot", run: updated });
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const handleCancel = () => {
    if (!api || !state.run) return;
    setConfirmDialog({
      open: true,
      title: "Cancel Run Execution",
      description: "Are you sure you want to cancel the current run? This cannot be undone.",
      confirmLabel: "Cancel Run",
      danger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, pending: true, error: null }));
        try {
          const updated = await api.cancelRun(state.run!);
          dispatch({ type: "run_snapshot", run: updated });
          setConfirmDialog((prev) => ({ ...prev, open: false, pending: false }));
        } catch (err: any) {
          setConfirmDialog((prev) => ({
            ...prev,
            pending: false,
            error: err.message || String(err),
          }));
        }
      },
    });
  };

  const handleApply = () => {
    if (!api || !state.run) return;
    setConfirmDialog({
      open: true,
      title: "Apply Integration Branch",
      description: `Fast-forward the integration branch for project ${state.run.projectId} onto main?`,
      confirmLabel: "Apply",
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, pending: true, error: null }));
        try {
          const updated = await api.applyRun(state.run!);
          dispatch({ type: "run_snapshot", run: updated });
          setConfirmDialog((prev) => ({ ...prev, open: false, pending: false }));
        } catch (err: any) {
          setConfirmDialog((prev) => ({
            ...prev,
            pending: false,
            error: err.message || String(err),
          }));
        }
      },
    });
  };

  const handleCleanup = async () => {
    if (!api || !state.run) return;
    try {
      const storage = await api.getRunStorage(state.run.id);
      setConfirmDialog({
        open: true,
        title: "Cleanup Run Storage",
        description: `This will delete ${storage.artifactCount} artifacts (${(storage.artifactBytes / 1024).toFixed(1)} KB) and ${storage.worktreeCount} worktrees. Please type the run ID to confirm:`,
        confirmLabel: "Cleanup",
        danger: true,
        requiredText: state.run.id,
        onConfirm: async () => {
          setConfirmDialog((prev) => ({ ...prev, pending: true, error: null }));
          try {
            await api.cleanupRun(state.run!.id, state.run!.id);
            dispatch({ type: "run_snapshot", run: null });
            setConfirmDialog((prev) => ({ ...prev, open: false, pending: false }));
          } catch (err: any) {
            setConfirmDialog((prev) => ({
              ...prev,
              pending: false,
              error: err.message || String(err),
            }));
          }
        },
      });
    } catch (err: any) {
      alert("Failed to fetch storage info: " + (err.message || String(err)));
    }
  };

  const handleShowDiff = async () => {
    if (!api || !state.run) return;
    try {
      const evidence = await api.getRunEvidence(state.run.id);
      setDiffDialog({
        open: true,
        diff: evidence.diff,
        qa: evidence.qa,
        advisorReviews: evidence.advisorReviews,
      });
    } catch (err: any) {
      alert("Failed to load evidence: " + (err.message || String(err)));
    }
  };

  const handleRequestStart = (d: TaskDraftVersion) => {
    if (!api) return;
    setConfirmDialog({
      open: true,
      title: "Start Run Execution",
      description: `Objective: ${d.objective}. Choose your safe worker concurrency:`,
      confirmLabel: "Start Execution",
      showConcurrency: true,
      onConfirm: async (concurrency) => {
        setConfirmDialog((prev) => ({ ...prev, pending: true, error: null }));
        try {
          const runSnap = await api.startRun(d.draftId, d.version, concurrency || 4);
          dispatch({ type: "run_snapshot", run: runSnap });
          setConfirmDialog((prev) => ({ ...prev, open: false, pending: false }));
        } catch (err: any) {
          setConfirmDialog((prev) => ({
            ...prev,
            pending: false,
            error: err.message || String(err),
          }));
        }
      },
    });
  };

  // 2. Bootstrap application
  useEffect(() => {
    if (!api) return;
    let active = true;

    api
      .bootstrap()
      .then((bootstrapData) => {
        if (!active) return;
        dispatch({ type: "bootstrapped", value: bootstrapData });
      })
      .catch((err) => {
        if (!active) return;
        dispatch({
          type: "fatal",
          message: err?.message || String(err) || "Failed to bootstrap cozy office server",
        });
      });

    return () => {
      active = false;
    };
  }, [api, dispatch]);

  // 3. Connect Realtime WebSocket Client
  useEffect(() => {
    if (!token || !state.selectedProjectId) return;

    const rt = new RealtimeClient(
      token,
      (msg) => {
        if (msg.type === "event") {
          dispatch({ type: "event_received", event: msg.event });
        } else if (msg.type === "snapshot") {
          dispatch({ type: "run_snapshot", run: msg.run });
        }
      },
      setRealtimeStatus,
    );

    rt.connect(state.run?.id || null, state.events[state.events.length - 1]?.sequence || 0);

    return () => {
      rt.close();
    };
  }, [token, state.selectedProjectId, state.run?.id, dispatch]);

  useEffect(() => {
    if (!api || !state.selectedProjectId || state.phase !== "office") return;

    api
      .request<any>(`/api/projects/${state.selectedProjectId}/onboarding`)
      .then((data) => {
        setRoleProfiles(data.roles);
        setContextSnapshotId(data.contextSnapshotId ?? state.run?.contextSnapshotId ?? "");
      })
      .catch(() => {});
  }, [api, state.selectedProjectId, state.phase, state.run?.contextSnapshotId]);

  const handleDockResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dockHeight;
    const onMove = (moveEvent: PointerEvent) => {
      const maxHeight = Math.max(260, window.innerHeight - 320);
      setDockHeight(Math.min(maxHeight, Math.max(180, startHeight + startY - moveEvent.clientY)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  };

  if (state.phase === "booting") {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <p className="eyebrow">Local orchestrator</p>
          <h1>Booting Cozy Agent Office</h1>
          <p style={{ color: "var(--parchment-300)" }}>
            Opening SQLite and checking the local session…
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "missing_session") {
    return (
      <div className="error-screen">
        <div className="error-card">
          <p className="eyebrow">Authorization required</p>
          <h2>Cozy AI Office: Missing Session</h2>
          <p style={{ color: "var(--parchment-300)" }}>
            No authorization token detected. Please launch the office server using the official CLI:
          </p>
          <pre className="terminal-box">npx cozy-agent-office</pre>
        </div>
      </div>
    );
  }

  if (state.phase === "fatal") {
    return (
      <div className="error-screen">
        <div className="error-card">
          <p className="eyebrow">Startup failure</p>
          <h2>Fatal Error</h2>
          <p>{state.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="cozy-button primary"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="app-shell"
      style={{ "--active-dock-height": `${dockHeight}px` } as React.CSSProperties}
    >
      {/* Top bar across the top */}
      <TopBar
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
        onApply={handleApply}
        onCleanup={handleCleanup}
        onShowDiff={handleShowDiff}
        onOpenSetup={() => dispatch({ type: "setup_opened" })}
        realtimeStatus={realtimeStatus}
      />

      {/* Left panel */}
      <aside className="panel" style={{ gridArea: "left" }}>
        <TaskBoard
          run={state.run}
          selectedTaskId={state.selectedTaskId}
          onSelectTask={(id) => dispatch({ type: "task_selected", taskId: id })}
        />
      </aside>

      {/* Middle office viewport */}
      <main className="panel office-panel">
        <div className="panel-heading">
          <span>▱ Swarm Workshop Map (Nearest-Neighbor Render)</span>
          <nav className="office-role-tabs" aria-label="Office roles">
            {OFFICE_ROLE_TABS.map(([actorId, label]) => (
              <button
                key={actorId}
                type="button"
                aria-pressed={state.selectedActorId === actorId}
                onClick={() => dispatch({ type: "actor_selected", actorId })}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="office-stage">
          <OfficeCanvas api={api!} projectId={state.selectedProjectId!} />
        </div>
      </main>

      {/* Right inspector panel */}
      <aside className="panel" style={{ gridArea: "right" }}>
        <Inspector
          actorId={state.selectedActorId}
          taskId={state.selectedTaskId}
          run={state.run}
          attempts={attempts}
          providerStatuses={state.bootstrap?.providers || []}
          roleProfiles={roleProfiles}
          events={state.events}
        />
      </aside>

      {/* Bottom docking logs/chat panel */}
      <footer className="panel dock-panel">
        <div
          className="dock-resizer"
          role="separator"
          aria-label="Resize workspace dock"
          aria-orientation="horizontal"
          onPointerDown={handleDockResize}
        />
        <ConversationDock
          projectId={state.selectedProjectId || ""}
          activeRun={state.run}
          roleProfiles={roleProfiles}
          providerStatuses={state.bootstrap?.providers || []}
          contextSnapshotId={contextSnapshotId}
          onDraftCreated={(draft) => dispatch({ type: "draft_loaded", value: draft })}
          onRequestStart={handleRequestStart}
          timelineEvents={state.events}
          attempts={attempts}
        />
      </footer>

      {/* Dialog overlays */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        danger={confirmDialog.danger}
        requiredText={confirmDialog.requiredText}
        showConcurrency={confirmDialog.showConcurrency}
        pending={confirmDialog.pending}
        error={confirmDialog.error}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />

      <DiffDialog
        open={diffDialog.open}
        diff={diffDialog.diff}
        qa={diffDialog.qa}
        advisorReviews={diffDialog.advisorReviews}
        onClose={() => setDiffDialog((prev) => ({ ...prev, open: false }))}
      />

      {state.phase === "onboarding" && (
        <Onboarding
          bootstrap={state.bootstrap!}
          api={api!}
          projectId={state.selectedProjectId}
          onClose={(projectId) =>
            dispatch(projectId ? { type: "project_selected", projectId } : { type: "setup_closed" })
          }
        />
      )}
    </div>
  );
};
