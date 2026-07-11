import React, { useEffect, useRef, useState } from "react";
import { OfficeScene } from "./OfficeScene.js";
import { useAppState, useAppDispatch } from "../store.js";
import type { ProfileId } from "../../shared/contracts.js";

const ACTORS: { id: ProfileId; label: string }[] = [
  { id: "manager", label: "Mgr" },
  { id: "worker-1", label: "W1" },
  { id: "worker-2", label: "W2" },
  { id: "worker-3", label: "W3" },
  { id: "worker-4", label: "W4" },
  { id: "advisor", label: "Adv" },
  { id: "qa", label: "QA" },
];

export const OfficeCanvas: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const [motionState, setMotionState] = useState<"moving" | "settled">("settled");
  const [initialized, setInitialized] = useState(false);

  // 1. Initialize Scene & ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let active = true;
    const scene = new OfficeScene();
    sceneRef.current = scene;

    scene.onSelectActor = (actorId) => {
      dispatch({ type: "actor_selected", actorId });
    };

    scene.onMotionState = (nextMotion) => {
      if (active) {
        setMotionState(nextMotion);
      }
    };

    scene.init(container).then(() => {
      if (!active) {
        scene.destroy();
        return;
      }
      // Trigger initial resize
      scene.resize(container.clientWidth || 352, container.clientHeight || 240);
      setInitialized(true);
    });

    const observer = new ResizeObserver((entries) => {
      if (!active || !entries[0]) return;
      const { width, height } = entries[0].contentRect;
      scene.resize(width, height);
    });
    observer.observe(container);

    return () => {
      active = false;
      observer.disconnect();
      if (sceneRef.current) {
        sceneRef.current.destroy();
        sceneRef.current = null;
      }
      setInitialized(false);
      // Remove data attributes
      container.removeAttribute("data-pixi-ready");
      container.removeAttribute("data-pixi-antialias");
      container.removeAttribute("data-pixi-scale-mode");
      container.removeAttribute("data-pixi-scene-count");
    };
  }, [dispatch]);

  // 2. Hydrate states
  useEffect(() => {
    if (sceneRef.current && initialized) {
      sceneRef.current.setState({
        run: state.run,
        events: state.events,
        selectedActorId: state.selectedActorId,
        reduceMotion: state.reduceMotion,
      });
    }
  }, [state.run, state.events, state.selectedActorId, state.reduceMotion, initialized]);

  return (
    <div
      className="office-scene-wrapper"
      data-motion-state={motionState}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Pixi Canvas target */}
      <div
        ref={containerRef}
        className="office-canvas-container"
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "#1f1b24",
        }}
      />

      {/* Accessible Navbar overlay for role selections */}
      <nav
        aria-label="Office roles"
        style={{
          position: "absolute",
          bottom: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "8px",
          background: "rgba(31, 27, 36, 0.85)",
          padding: "4px 8px",
          border: "2px solid var(--ink-950)",
          borderRadius: "4px",
          zIndex: 10,
        }}
      >
        {ACTORS.map((actor) => {
          const isSelected = state.selectedActorId === actor.id;
          return (
            <button
              key={actor.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => dispatch({ type: "actor_selected", actorId: actor.id })}
              style={{
                background: isSelected ? "var(--gold-400)" : "var(--ink-800)",
                color: isSelected ? "var(--ink-950)" : "var(--parchment-100)",
                border: isSelected ? "2px solid var(--focus)" : "1px solid var(--parchment-300)",
                padding: "4px 8px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "12px",
                borderRadius: "2px",
              }}
            >
              {actor.label}
            </button>
          );
        })}
      </nav>

      {/* Screen-reader visually hidden live updates log */}
      <ul
        aria-live="polite"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: "0",
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: "0",
        }}
      >
        {ACTORS.map((actor) => (
          <li key={actor.id}>{actor.id}: currently selected status details</li>
        ))}
      </ul>
    </div>
  );
};
