import React, { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string | undefined;
  danger?: boolean | undefined;
  requiredText?: string | undefined;
  showConcurrency?: boolean | undefined;
  pending?: boolean | undefined;
  error?: string | null | undefined;
  onConfirm(concurrency?: number): void;
  onCancel(): void;
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  requiredText,
  showConcurrency = false,
  pending = false,
  error,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [textInput, setTextInput] = React.useState("");
  const [concurrency, setConcurrency] = React.useState(4);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      setTextInput("");
      const dialog = dialogRef.current;
      if (dialog) {
        if (!dialog.open) {
          if (typeof dialog.showModal === "function") {
            dialog.showModal();
          } else {
            dialog.setAttribute("open", "true");
          }
        }
        // Focus first control
        const input = dialog.querySelector("input, button");
        if (input) (input as HTMLElement).focus();
      }
    } else {
      const dialog = dialogRef.current;
      if (dialog && dialog.open) {
        if (typeof dialog.close === "function") {
          dialog.close();
        } else {
          dialog.removeAttribute("open");
        }
      }
      if (triggerRef.current) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
    }
  }, [open]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        if (pending) {
          e.preventDefault();
        } else {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending, onCancel]);

  if (!open) return null;

  const isConfirmDisabled = requiredText ? textInput !== requiredText || pending : pending;

  return (
    <dialog
      ref={dialogRef}
      open={open}
      style={{
        background: "var(--ink-900)",
        border: "var(--pixel-border)",
        color: "var(--parchment-100)",
        padding: "20px",
        maxWidth: "400px",
        borderRadius: "4px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
      }}
    >
      <h3 style={{ margin: "0 0 10px 0", color: danger ? "var(--warning)" : "var(--gold-400)" }}>
        {title}
      </h3>
      <p style={{ margin: "0 0 15px 0", fontSize: "14px", lineHeight: "1.4" }}>{description}</p>

      {requiredText && (
        <div style={{ margin: "0 0 15px 0" }}>
          <label style={{ display: "block", fontSize: "12px", marginBottom: "5px" }}>
            Type <strong>{requiredText}</strong> to confirm:
          </label>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={pending}
            style={{
              width: "100%",
              padding: "6px",
              background: "var(--ink-950)",
              border: "1px solid var(--parchment-300)",
              color: "#fff",
              borderRadius: "2px",
            }}
          />
        </div>
      )}

      {showConcurrency && (
        <div style={{ margin: "0 0 15px 0" }}>
          <label
            htmlFor="confirm-concurrency"
            style={{ display: "block", fontSize: "12px", marginBottom: "5px" }}
          >
            Concurrency Limit (Parallel Workers):
          </label>
          <select
            id="confirm-concurrency"
            value={concurrency}
            onChange={(e) => setConcurrency(parseInt(e.target.value, 10))}
            disabled={pending}
            style={{
              width: "100%",
              padding: "6px",
              background: "var(--ink-950)",
              border: "1px solid var(--parchment-300)",
              color: "#fff",
              borderRadius: "2px",
            }}
          >
            <option value={1}>1 Worker (Sequential)</option>
            <option value={2}>2 Workers</option>
            <option value={3}>3 Workers</option>
            <option value={4}>4 Workers (Max Parallelism)</option>
          </select>
        </div>
      )}

      {error && (
        <p style={{ color: "var(--warning)", fontSize: "12px", margin: "0 0 15px 0" }}>{error}</p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          style={{
            background: "var(--ink-800)",
            color: "var(--parchment-100)",
            border: "1px solid var(--parchment-300)",
            padding: "6px 12px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(concurrency)}
          disabled={isConfirmDisabled}
          style={{
            background: danger ? "var(--warning)" : "var(--gold-400)",
            color: "var(--ink-950)",
            border: "none",
            padding: "6px 12px",
            cursor: isConfirmDisabled ? "not-allowed" : "pointer",
            fontWeight: "bold",
          }}
        >
          {pending ? "Processing..." : confirmLabel}
        </button>
      </div>
    </dialog>
  );
};
