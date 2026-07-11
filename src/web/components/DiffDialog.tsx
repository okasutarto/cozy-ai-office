import React, { useEffect, useRef } from "react";
import type { DiffView, QaReportView, AdvisorReviewView } from "../../shared/api.js";

type DiffDialogProps = {
  open: boolean;
  diff: DiffView | null;
  qa: QaReportView | null;
  advisorReviews: AdvisorReviewView[];
  onClose(): void;
};

export const DiffDialog: React.FC<DiffDialogProps> = ({
  open,
  diff,
  qa,
  advisorReviews,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      style={{
        background: "var(--ink-900)",
        border: "var(--pixel-border)",
        color: "var(--parchment-100)",
        padding: "20px",
        width: "90%",
        maxWidth: "800px",
        maxHeight: "80vh",
        overflowY: "auto",
        borderRadius: "4px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h2 style={{ margin: 0, color: "var(--gold-400)" }}>Run Evidence & Diffs</h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "var(--ink-800)",
            color: "var(--parchment-100)",
            border: "1px solid var(--parchment-300)",
            padding: "4px 8px",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      {/* QA Status */}
      <section style={{ marginBottom: "25px", borderBottom: "1px solid var(--ink-700)", paddingBottom: "15px" }}>
        <h3 style={{ color: "var(--gold-400)", margin: "0 0 10px 0" }}>QA Report</h3>
        {qa ? (
          <div>
            <p>
              Status:{" "}
              <strong style={{ color: qa.status === "passed" ? "var(--moss)" : "var(--warning)" }}>
                {qa.status.toUpperCase()}
              </strong>{" "}
              {qa.repairAttempted && "(Repair was attempted)"}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "var(--ink-950)" }}>
                  <th style={{ padding: "6px" }}>Command ID</th>
                  <th style={{ padding: "6px" }}>Status</th>
                  <th style={{ padding: "6px" }}>Exit Code</th>
                  <th style={{ padding: "6px" }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {qa.commands.map((cmd, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--ink-850)" }}>
                    <td style={{ padding: "6px" }}>{cmd.commandId}</td>
                    <td
                      style={{
                        padding: "6px",
                        color: cmd.status === "passed" ? "var(--moss)" : "var(--warning)",
                      }}
                    >
                      {cmd.status}
                    </td>
                    <td style={{ padding: "6px" }}>{cmd.exitCode ?? "N/A"}</td>
                    <td style={{ padding: "6px" }}>{cmd.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--parchment-300)" }}>No QA report generated yet.</p>
        )}
      </section>

      {/* Advisor Reviews */}
      <section style={{ marginBottom: "25px", borderBottom: "1px solid var(--ink-700)", paddingBottom: "15px" }}>
        <h3 style={{ color: "var(--gold-400)", margin: "0 0 10px 0" }}>Advisor Gates</h3>
        {advisorReviews.length > 0 ? (
          <ul style={{ paddingLeft: "20px", margin: 0, fontSize: "13px" }}>
            {advisorReviews.map((rev, i) => (
              <li key={i} style={{ marginBottom: "8px" }}>
                <strong>{rev.gate.toUpperCase()}</strong> (Pass {rev.pass}):{" "}
                <span style={{ color: rev.review.verdict === "approve" ? "var(--moss)" : "var(--warning)" }}>
                  {rev.review.verdict}
                </span>{" "}
                - <span style={{ fontSize: "11px", color: "var(--parchment-300)" }}>{rev.createdAt}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--parchment-300)" }}>No advisor reviews yet.</p>
        )}
      </section>

      {/* Code Diffs */}
      <section>
        <h3 style={{ color: "var(--gold-400)", margin: "0 0 10px 0" }}>Integration Patch Diff</h3>
        {diff ? (
          <div>
            <div style={{ display: "flex", gap: "15px", marginBottom: "10px", fontSize: "12px" }}>
              <span>Stats: {diff.stat}</span>
            </div>
            <pre
              style={{
                background: "var(--ink-950)",
                border: "1px solid var(--ink-800)",
                padding: "10px",
                borderRadius: "2px",
                overflowX: "auto",
                fontFamily: "monospace",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                maxHeight: "300px",
                userSelect: "text",
              }}
            >
              {diff.patch || "No file changes in diff."}
            </pre>
          </div>
        ) : (
          <p style={{ fontSize: "13px", color: "var(--parchment-300)" }}>No diff patch generated yet.</p>
        )}
      </section>
    </dialog>
  );
};
