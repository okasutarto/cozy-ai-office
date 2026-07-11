import type { MessageRecord } from "../db/conversation-store.js";

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
    "Convert only the selected messages into one editable task draft.",
    "Do not execute the task and do not add requirements not supported by the messages.",
    "Return objective, scope, constraints, and acceptanceCriteria as JSON.",
    JSON.stringify(messages),
  ].join("\n\n");
}
