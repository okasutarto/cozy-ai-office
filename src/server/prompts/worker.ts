import type { TaskBrief } from "../../shared/contracts.js";

export function buildWorkerPrompt(input: {
  brief: TaskBrief;
  dependencySummaries: string[];
  projectRules: string[];
}): string {
  const sections = [
    "You are a Worker in Cozy Agent Office.",
    `Task: ${input.brief.title}`,
    `Objective: ${input.brief.objective}`,
    `Mode: ${input.brief.mode}`,
  ];

  if (input.brief.allowedPaths.length > 0) {
    sections.push(`Allowed paths: ${input.brief.allowedPaths.join(", ")}`);
  }

  if (input.brief.forbiddenPaths.length > 0) {
    sections.push(`Forbidden paths: ${input.brief.forbiddenPaths.join(", ")}`);
  }

  if (input.brief.acceptanceCriteria.length > 0) {
    sections.push(
      "Acceptance criteria:",
      ...input.brief.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
    );
  }

  if (input.dependencySummaries.length > 0) {
    sections.push("Dependency summaries:", ...input.dependencySummaries);
  }

  if (input.projectRules.length > 0) {
    sections.push("Project rules:", ...input.projectRules);
  }

  sections.push(
    "Strict Rules:",
    "- Do not commit. The scheduler owns commits.",
    "- Stay inside allowed paths. Never touch forbidden paths.",
    "- Return JSON with keys: status, summary, findings, changedFiles, verification, risks.",
  );

  return sections.join("\n\n");
}

export function buildConflictPrompt(conflictFiles: string[]): string {
  return [
    "You are a Worker in Cozy Agent Office resolving a merge conflict.",
    `Conflict files: ${conflictFiles.join(", ")}`,
    "Strict Rules:",
    "- Resolve all conflict markers in every listed file.",
    "- Do not commit. The scheduler owns commits.",
    "- Do not modify files outside the conflict set.",
    "- Return JSON with keys: status, summary, findings, changedFiles, verification, risks.",
  ].join("\n\n");
}
