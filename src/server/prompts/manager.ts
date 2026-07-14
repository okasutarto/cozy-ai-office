import type { MessageRecord } from "../db/conversation-store.js";
import type { TaskDraftVersion, ManagerPlan } from "../../shared/contracts.js";

export function buildDiscussionPrompt(input: {
  role: "manager" | "worker" | "advisor" | "qa";
  messages: MessageRecord[];
  artifactSummaries: string[];
}): string {
  return [
    `You are the ${input.role} in Cozy Agent Office.`,
    "This is a read-only consultation. Do not edit files, start work, change run state, or expand scope.",
    "Answer only from the supplied context snapshot, selected messages, and persisted artifacts.",
    "Return JSON with keys: message, citedArtifactIds, draftSuggestion.",
    JSON.stringify({ messages: input.messages, artifacts: input.artifactSummaries }),
  ].join("\n\n");
}

export function buildDraftPrompt(messages: MessageRecord[]): string {
  return [
    "Convert the selected or recent conversation messages into one editable task draft.",
    "Do not execute the task and do not add requirements not supported by the messages.",
    "Return objective, scope, constraints, and acceptanceCriteria as JSON.",
    JSON.stringify(messages),
  ].join("\n\n");
}

export function buildManagerPlanPrompt(draft: TaskDraftVersion, commands: string[]): string {
  return [
    "You are the Manager in Cozy Agent Office.",
    "Generate an execution plan satisfying the draft tasks.",
    "Strict Rules:",
    "- Provider/model assignment is owned by the scheduler and must not appear in briefs.",
    "- Output plan with tasks, summary, risks, testStrategy.",
    JSON.stringify({ draft, commands }),
  ].join("\n\n");
}

export function buildManagerRevisionPrompt(
  draft: TaskDraftVersion,
  plan: ManagerPlan,
  review: { blockingFindings: string[]; requestedChanges: string[] },
): string {
  return [
    "You are the Manager in Cozy Agent Office.",
    "Revise the execution plan according to the Tech Lead review feedback.",
    "Strict Rules:",
    "- Provider/model assignment is owned by the scheduler and must not appear in briefs.",
    "- Output revised plan satisfying all requested changes.",
    JSON.stringify({ draft, plan, review }),
  ].join("\n\n");
}
