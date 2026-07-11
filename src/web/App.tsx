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
import type {
  AttemptView,
  DiffView,
  QaReportView,
  AdvisorReviewView,
  RunEvidence,
  RunStorage,
} from "../shared/api.js";

export const App: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [token, setToken] = useState<string | null>(null);
  const [roleProfiles, setRoleProfiles] = useState<RoleProfile[]>([]);
  const [contextSnapshotId, setContextSnapshotId] = useState<string>("");

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

    const rt = new RealtimeClient(token, (msg) => {
      if (msg.type === "event") {
        dispatch({ type: "event_received", event: msg.event });
      } else if (msg.type === "snapshot") {
        dispatch({ type: "run_snapshot", run: msg.run });
      }
    });

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

  if (state.phase === "booting") {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100dvh",
          color: "var(--gold-400)",
        }}
      >
        <div style={{ fontSize: "20px" }}>Booting Cozy AI Office...</div>
      </div>
    );
  }

  if (state.phase === "missing_session") {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100dvh",
          color: "var(--danger-500)",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "480px" }}>
          <h2>Cozy AI Office: Missing Session</h2>
          <p style={{ color: "var(--parchment-300)" }}>
            No authorization token detected. Please launch the office server using the official CLI:
          </p>
          <pre
            style={{
              background: "var(--ink-800)",
              padding: "12px",
              border: "1px dashed var(--gold-400)",
            }}
          >
            npx cozy-agent-office
          </pre>
        </div>
      </div>
    );
  }

  if (state.phase === "fatal") {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100dvh",
          color: "var(--danger-500)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h2>Fatal Error</h2>
          <p>{state.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              background: "var(--gold-400)",
              color: "var(--ink-950)",
              border: "none",
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "onboarding") {
    return <Onboarding bootstrap={state.bootstrap!} api={api!} />;
  }

  return (
    <div className="app-shell">
      {/* Top bar across the top */}
      <TopBar
        onPause={handlePause}
        onResume={handleResume}
        onCancel={handleCancel}
        onApply={handleApply}
        onCleanup={handleCleanup}
        onShowDiff={handleShowDiff}
      />

      {/* Left panel */}
      <aside
        style={{
          gridArea: "left",
          border: "var(--pixel-border)",
          background: "var(--ink-800)",
          padding: "0",
          overflow: "hidden",
        }}
      >
        <TaskBoard
          run={state.run}
          onSelectTask={(id) => dispatch({ type: "task_selected", taskId: id })}
        />
      </aside>

      {/* Middle office viewport */}
      <main
        style={{
          gridArea: "office",
          border: "var(--pixel-border)",
          background: "var(--ink-950)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "704px",
          minHeight: "480px",
        }}
      >
        <OfficeCanvas />
      </main>

      {/* Right inspector panel */}
      <aside
        style={{
          gridArea: "right",
          border: "var(--pixel-border)",
          background: "var(--ink-800)",
          padding: "0",
          overflow: "hidden",
        }}
      >
        <Inspector
          actorId={state.selectedActorId}
          taskId={state.selectedTaskId}
          run={state.run}
          attempts={attempts}
          providerStatuses={state.bootstrap?.providers || []}
        />
      </aside>

      {/* Bottom docking logs/chat panel */}
      <footer
        style={{
          gridArea: "dock",
          border: "var(--pixel-border)",
          background: "var(--ink-800)",
          padding: "12px",
        }}
      >
        <ConversationDock
          projectId={state.selectedProjectId || ""}
          selectedActorId={state.selectedActorId}
          activeRun={state.run}
          roleProfiles={roleProfiles}
          providerStatuses={state.bootstrap?.providers || []}
          contextSnapshotId={contextSnapshotId}
          onDraftCreated={(draft) => dispatch({ type: "draft_loaded", value: draft })}
          onRequestStart={handleRequestStart}
          timelineEvents={state.events}
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
    </div>
  );
};
