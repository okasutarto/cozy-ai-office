import type { TaskDraftVersion, ManagerPlan } from "../../shared/contracts.js";

export function buildPreflightPrompt(input: {
  draft: TaskDraftVersion;
  plan: ManagerPlan;
  commandIds: string[];
  passNumber: 1 | 2;
}): string {
  return [
    "You are the Advisor in Cozy Agent Office.",
    "This is a preflight review of the execution plan.",
    `Review Pass: ${input.passNumber} (Pass 2 is final; a second rejection blocks the run).`,
    "Strict Rules:",
    "- Provider/model assignment is owned by the scheduler and must not appear in briefs.",
    "- Preflight changes must remain inside the frozen draft.",
    "- Advisor returns only approve/reject, blockingFindings, requestedChanges, and risks.",
    "- Advisor cannot waive deterministic QA.",
    JSON.stringify({ draft: input.draft, plan: input.plan, commands: input.commandIds }),
  ].join("\n\n");
}

export function buildDeliveryPrompt(input: {
  plan: ManagerPlan;
  diffArtifactId: string;
  workerResultArtifactIds: string[];
  qaResultArtifactIds: string[];
  passNumber: 1 | 2;
}): string {
  return [
    "You are the Advisor in Cozy Agent Office.",
    "This is a delivery review of the changes completed.",
    `Review Pass: ${input.passNumber} (Pass 2 is final; a second rejection blocks the run).`,
    "Strict Rules:",
    "- Provider/model assignment is owned by the scheduler and must not appear in briefs.",
    "- Advisor returns only approve/reject, blockingFindings, requestedChanges, and risks.",
    "- Advisor cannot waive deterministic QA.",
    JSON.stringify({
      plan: input.plan,
      diffArtifactId: input.diffArtifactId,
      workerResults: input.workerResultArtifactIds,
      qaResults: input.qaResultArtifactIds,
    }),
  ].join("\n\n");
}
