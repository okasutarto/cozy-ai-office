import type { RunState } from "../../shared/contracts.js";
import { AppError } from "../errors.js";

const LEGAL: Record<RunState, readonly RunState[]> = {
  planned: ["advisor_preflight", "cancelled", "failed", "blocked"],
  advisor_preflight: ["dispatching", "cancelled", "failed", "blocked"],
  dispatching: ["working", "integrating", "cancelled", "failed", "blocked"],
  working: ["working", "integrating", "testing", "cancelled", "failed", "blocked"],
  integrating: ["working", "integration_conflict", "testing", "cancelled", "failed", "blocked"],
  integration_conflict: ["integrating", "cancelled", "failed", "blocked"],
  testing: ["testing", "advisor_delivery", "cancelled", "failed", "blocked"],
  advisor_delivery: ["testing", "ready_to_apply", "cancelled", "failed", "blocked"],
  ready_to_apply: ["applied", "cancelled", "blocked"],
  applied: [],
  failed: [],
  blocked: [],
  cancelled: [],
};

export function assertTransition(from: RunState, to: RunState): void {
  if (!LEGAL[from].includes(to)) {
    throw new AppError("illegal_run_transition", `Cannot transition ${from} -> ${to}`, 409);
  }
}

export type RunSnapshot = {
  state: RunState;
  blockReason: string | null;
  tasks: Array<{ id: string; status: string }>;
};

export function assertInterruptedRetry(
  run: {
    state: RunState;
    blockReason: string | null;
    tasks: Array<{ id: string; status: string }>;
  },
  taskId: string,
): void {
  const task = run.tasks.find((candidate) => candidate.id === taskId);
  if (run.state !== "blocked" || run.blockReason !== "interrupted" || task?.status !== "running") {
    throw new AppError(
      "interrupted_retry_unavailable",
      "Only an interrupted running task can retry",
      409,
    );
  }
}
