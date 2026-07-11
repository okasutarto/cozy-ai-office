import React, { useState, useEffect } from "react";
import type { TaskDraftVersion, RunSnapshot } from "../../shared/contracts.js";
import { ApiClient } from "../api.js";

type DraftEditorProps = {
  draft: TaskDraftVersion;
  activeRun: RunSnapshot | null;
  canStart: boolean;
  blockingReasons: string[];
  onSaved(draft: TaskDraftVersion): void;
  onRequestStart(draft: TaskDraftVersion): void;
};

export const DraftEditor: React.FC<DraftEditorProps> = ({
  draft,
  activeRun,
  canStart,
  blockingReasons,
  onSaved,
  onRequestStart,
}) => {
  const api = new ApiClient(sessionStorage.getItem("cozy-session") || "");

  const [objective, setObjective] = useState(draft.objective);
  const [scope, setScope] = useState<string[]>(draft.scope);
  const [constraints, setConstraints] = useState<string[]>(draft.constraints);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>(draft.acceptanceCriteria);

  const [newScopeItem, setNewScopeItem] = useState("");
  const [newConstraintItem, setNewConstraintItem] = useState("");
  const [newAcceptanceItem, setNewAcceptanceItem] = useState("");

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Sync state if draft changes
  useEffect(() => {
    setObjective(draft.objective);
    setScope(draft.scope);
    setConstraints(draft.constraints);
    setAcceptanceCriteria(draft.acceptanceCriteria);
  }, [draft]);

  const handleSave = async () => {
    setSaveStatus("Saving...");
    try {
      const updated = await api.updateDraft(draft.draftId, {
        objective,
        scope,
        constraints,
        acceptanceCriteria,
        contextSnapshotId: draft.contextSnapshotId,
        sourceMessageIds: draft.sourceMessageIds,
      });
      onSaved(updated);
      setSaveStatus("Saved successfully!");
    } catch (err: any) {
      setSaveStatus(`Save failed: ${err.message || err}`);
    }
  };

  const handleReviewExecution = () => {
    onRequestStart(draft);
  };

  return (
    <div
      className="draft-editor"
      style={{
        padding: "16px",
        overflowY: "auto",
        height: "100%",
        display: "grid",
        gap: "16px",
        color: "var(--parchment-100)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "var(--gold-400)" }}>
          Draft Task Editor (v{draft.version})
        </h2>
        <span style={{ fontSize: "11px", color: "var(--parchment-300)" }}>
          Ctx: {draft.contextSnapshotId.substring(0, 8)}... | Src: {draft.sourceMessageIds.length}{" "}
          msgs
        </span>
      </div>

      {/* Objective */}
      <div style={{ display: "grid", gap: "6px" }}>
        <label htmlFor="draft-objective">Objective:</label>
        <textarea
          id="draft-objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          style={{
            background: "var(--ink-950)",
            color: "white",
            border: "1px solid var(--parchment-300)",
            padding: "8px",
            height: "72px",
            resize: "none",
          }}
        />
      </div>

      {/* Scope */}
      <div style={{ display: "grid", gap: "6px" }}>
        <label>Scope Items:</label>
        <p style={{ margin: "0 0 6px 0", fontSize: "11px", color: "var(--parchment-300)" }}>
          Write prose, or <code>path:src/feature</code> to declare a write path.
        </p>
        <div style={{ display: "grid", gap: "4px" }}>
          {scope.map((item, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{item}</span>
              <button
                type="button"
                onClick={() => setScope(scope.filter((_, i) => i !== idx))}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--rose-500)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            aria-label="Add scope item"
            type="text"
            placeholder="e.g. path:src/routes"
            value={newScopeItem}
            onChange={(e) => setNewScopeItem(e.target.value)}
            style={{ background: "var(--ink-950)", color: "white", flex: 1, padding: "6px" }}
          />
          <button
            type="button"
            onClick={() => {
              if (newScopeItem) {
                setScope([...scope, newScopeItem]);
                setNewScopeItem("");
              }
            }}
            style={{
              background: "var(--teal-600)",
              border: "none",
              color: "white",
              padding: "6px 12px",
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Constraints */}
      <div style={{ display: "grid", gap: "6px" }}>
        <label>Constraints:</label>
        <div style={{ display: "grid", gap: "4px" }}>
          {constraints.map((item, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{item}</span>
              <button
                type="button"
                onClick={() => setConstraints(constraints.filter((_, i) => i !== idx))}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--rose-500)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            aria-label="Add constraint"
            type="text"
            placeholder="Add constraint"
            value={newConstraintItem}
            onChange={(e) => setNewConstraintItem(e.target.value)}
            style={{ background: "var(--ink-950)", color: "white", flex: 1, padding: "6px" }}
          />
          <button
            type="button"
            onClick={() => {
              if (newConstraintItem) {
                setConstraints([...constraints, newConstraintItem]);
                setNewConstraintItem("");
              }
            }}
            style={{
              background: "var(--teal-600)",
              border: "none",
              color: "white",
              padding: "6px 12px",
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Acceptance Criteria */}
      <div style={{ display: "grid", gap: "6px" }}>
        <label>Acceptance Criteria:</label>
        <div style={{ display: "grid", gap: "4px" }}>
          {acceptanceCriteria.map((item, idx) => (
            <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{item}</span>
              <button
                type="button"
                onClick={() =>
                  setAcceptanceCriteria(acceptanceCriteria.filter((_, i) => i !== idx))
                }
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--rose-500)",
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            aria-label="Add acceptance criterion"
            type="text"
            placeholder="Add acceptance criterion"
            value={newAcceptanceItem}
            onChange={(e) => setNewAcceptanceItem(e.target.value)}
            style={{ background: "var(--ink-950)", color: "white", flex: 1, padding: "6px" }}
          />
          <button
            type="button"
            onClick={() => {
              if (newAcceptanceItem) {
                setAcceptanceCriteria([...acceptanceCriteria, newAcceptanceItem]);
                setNewAcceptanceItem("");
              }
            }}
            style={{
              background: "var(--teal-600)",
              border: "none",
              color: "white",
              padding: "6px 12px",
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Blocking Reasons */}
      {blockingReasons.length > 0 && (
        <div
          style={{
            border: "1px solid var(--danger-500)",
            padding: "10px",
            background: "var(--ink-950)",
          }}
        >
          <strong style={{ color: "var(--danger-500)" }}>Preflight Warnings:</strong>
          <ul style={{ margin: "4px 0 0 0", paddingLeft: "20px", fontSize: "12px" }}>
            {blockingReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action panel */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "16px",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleSave}
            style={{
              background: "var(--teal-600)",
              color: "white",
              border: "none",
              padding: "10px 20px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            {activeRun ? "Save as new run draft" : "Save Draft"}
          </button>
          {saveStatus && (
            <span style={{ fontSize: "12px", color: "var(--gold-400)" }}>{saveStatus}</span>
          )}
        </div>

        <button
          type="button"
          disabled={!canStart}
          onClick={handleReviewExecution}
          style={{
            background: canStart ? "var(--gold-400)" : "var(--ink-950)",
            color: canStart ? "var(--ink-950)" : "var(--parchment-300)",
            border: canStart ? "none" : "1px solid var(--parchment-300)",
            padding: "10px 20px",
            fontWeight: "bold",
            cursor: canStart ? "pointer" : "not-allowed",
          }}
        >
          Review execution
        </button>
      </div>
    </div>
  );
};
