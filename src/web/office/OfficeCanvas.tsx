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

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => dispatch({ type: "reduce_motion", value: media.matches });
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, [dispatch]);

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
      scene.resize(container.clientWidth || 512, container.clientHeight || 288);
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
      data-reduced-motion={state.reduceMotion ? "true" : "false"}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      {/* Pixi Canvas target */}
      <div
        ref={containerRef}
        className="office-canvas-container"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#1f1b24",
        }}
      />

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
