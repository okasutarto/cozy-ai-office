import React, { useEffect, useMemo, useState } from "react";
import { consumeSessionToken, ApiClient, RealtimeClient } from "./api.js";
import { useAppState, useAppDispatch } from "./store.js";
import { TopBar } from "./components/TopBar.js";
import { Onboarding } from "./components/Onboarding.js";

export const App: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [token, setToken] = useState<string | null>(null);

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
      <TopBar />

      {/* Left panel */}
      <aside
        style={{
          gridArea: "left",
          border: "var(--pixel-border)",
          background: "var(--ink-800)",
          padding: "12px",
        }}
      >
        <h3 style={{ margin: "0 0 10px 0", color: "var(--gold-400)", fontSize: "14px" }}>
          Workspace
        </h3>
        <p style={{ fontSize: "12px", color: "var(--parchment-300)" }}>
          Panel placeholder for files and branches
        </p>
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
        <div style={{ color: "var(--gold-400)", textAlign: "center" }}>
          <h3>Pixel Office Scene Viewport</h3>
          <p style={{ fontSize: "13px", color: "var(--parchment-300)" }}>
            Interactive canvas loading in next tasks
          </p>
        </div>
      </main>

      {/* Right inspector panel */}
      <aside
        style={{
          gridArea: "right",
          border: "var(--pixel-border)",
          background: "var(--ink-800)",
          padding: "12px",
        }}
      >
        <h3 style={{ margin: "0 0 10px 0", color: "var(--gold-400)", fontSize: "14px" }}>
          Inspector
        </h3>
        <p style={{ fontSize: "12px", color: "var(--parchment-300)" }}>
          Metadata, diagnostic actions, and logs
        </p>
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
        <h3 style={{ margin: "0 0 8px 0", color: "var(--gold-400)", fontSize: "14px" }}>Console</h3>
        <p style={{ fontSize: "12px", color: "var(--parchment-300)", margin: 0 }}>
          Conversation threads and running task metrics
        </p>
      </footer>
    </div>
  );
};
