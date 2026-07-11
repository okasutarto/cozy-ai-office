import React, { useEffect, useRef } from "react";
import { OfficeScene } from "./OfficeScene.js";

export const OfficeCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let active = true;
    const scene = new OfficeScene();
    sceneRef.current = scene;

    scene.init(container).then(() => {
      if (!active) {
        scene.destroy();
        return;
      }
      // Trigger initial resize
      scene.resize(container.clientWidth || 352, container.clientHeight || 240);
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
      // Remove data attributes
      container.removeAttribute("data-pixi-ready");
      container.removeAttribute("data-pixi-antialias");
      container.removeAttribute("data-pixi-scale-mode");
      container.removeAttribute("data-pixi-scene-count");
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="office-canvas-container"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background: "#1f1b24",
      }}
    />
  );
};
