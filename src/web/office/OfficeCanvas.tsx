import React, { useEffect, useMemo, useRef, useState } from "react";
import { OfficeScene } from "./OfficeScene.js";
import { useAppState, useAppDispatch } from "../store.js";
import type { ProfileId } from "../../shared/contracts.js";
import type { OfficeLayout } from "../../shared/api.js";
import type { ApiClient } from "../api.js";
import { catalogUrl, loadCatalog, type CatalogAsset } from "./asset-catalog.js";

type LayoutTool = "off" | OfficeLayout["floors"][string];

const ACTORS: { id: ProfileId; label: string }[] = [
  { id: "manager", label: "Mgr" },
  { id: "worker-1", label: "W1" },
  { id: "worker-2", label: "W2" },
  { id: "worker-3", label: "W3" },
  { id: "worker-4", label: "W4" },
  { id: "advisor", label: "Adv" },
  { id: "qa", label: "QA" },
];

export const OfficeCanvas: React.FC<{ api: ApiClient; projectId: string }> = ({
  api,
  projectId,
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const [motionState, setMotionState] = useState<"moving" | "settled">("settled");
  const [initialized, setInitialized] = useState(false);
  const [tool, setTool] = useState<LayoutTool>("off");
  const [layout, setLayout] = useState<OfficeLayout>({ floors: {}, furniture: [] });
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [catalog, setCatalog] = useState<CatalogAsset[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const floors = catalog.filter((asset) => asset.floor);
  const categories = useMemo(
    () => [
      "All",
      ...new Set(catalog.filter((asset) => !asset.floor).map((asset) => asset.category)),
    ],
    [catalog],
  );
  const furniture = catalog.filter(
    (asset) =>
      !asset.floor &&
      (category === "All" || asset.category === category) &&
      asset.label.toLowerCase().includes(query.toLowerCase()),
  );

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
    scene.onLayoutChange = setLayout;
    scene.onSelectFurniture = setSelectedFurnitureId;

    scene
      .init(container)
      .catch(() => undefined)
      .then(() => {
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

  useEffect(() => {
    api
      .getOfficeLayout(projectId)
      .then(setLayout)
      .catch(() => setSaveState("error"));
  }, [api, projectId]);

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch(() => setSaveState("error"));
  }, []);

  useEffect(() => {
    if (initialized) sceneRef.current?.setCatalog(catalog);
  }, [catalog, initialized]);

  useEffect(() => {
    if (initialized) sceneRef.current?.setLayout(layout);
  }, [layout, initialized]);
  useEffect(() => {
    if (initialized) sceneRef.current?.setEditTool(tool);
  }, [tool, initialized]);

  const saveLayout = async () => {
    setSaveState("saving");
    try {
      setLayout(await api.saveOfficeLayout(projectId, sceneRef.current?.getLayout() ?? layout));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const placeFurnitureAtCenter = (kind: OfficeLayout["furniture"][number]["kind"]) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    sceneRef.current?.placeFurniture(kind, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

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
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const kind = event.dataTransfer.getData(
          "application/x-pixel-life-asset",
        ) as OfficeLayout["furniture"][number]["kind"];
        if (catalog.some((asset) => !asset.floor && asset.id === kind)) {
          sceneRef.current?.placeFurniture(kind, event.clientX, event.clientY);
        }
      }}
      onKeyDown={(event) => {
        if (selectedFurnitureId && (event.key === "Delete" || event.key === "Backspace")) {
          event.preventDefault();
          sceneRef.current?.deleteFurniture(selectedFurnitureId);
        }
      }}
      tabIndex={0}
    >
      <div className="layout-toolbar" aria-label="Layout editor">
        <button
          type="button"
          aria-pressed={tool !== "off"}
          onClick={() => setTool(tool === "off" ? (floors[0]?.id ?? "off") : "off")}
        >
          Layout
        </button>
        {tool !== "off" && (
          <>
            <div className="asset-catalog">
              <strong>Floors · select then paint</strong>
              <div className="asset-grid">
                {floors.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    aria-label={asset.label}
                    aria-pressed={tool === asset.id}
                    onClick={() => setTool(asset.id)}
                  >
                    <img src={catalogUrl(asset.file)} alt="" />
                    <span>{asset.label}</span>
                  </button>
                ))}
              </div>
              <strong>Furniture · drag into office</strong>
              <div className="asset-filters">
                <input
                  type="search"
                  aria-label="Search Pixel Life assets"
                  placeholder="Search assets"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <select
                  aria-label="Asset category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {categories.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="asset-grid">
                {furniture.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    draggable
                    onClick={() => placeFurnitureAtCenter(asset.id)}
                    onDragStart={(event) =>
                      event.dataTransfer.setData("application/x-pixel-life-asset", asset.id)
                    }
                  >
                    <img src={catalogUrl(asset.file)} alt="" loading="lazy" />
                    <span>{asset.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setLayout({ floors: {}, furniture: [] })}>
              Reset
            </button>
            <button type="button" onClick={saveLayout} disabled={saveState === "saving"}>
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
            <span role="status">{saveState === "error" ? "Save failed" : ""}</span>
          </>
        )}
      </div>
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
