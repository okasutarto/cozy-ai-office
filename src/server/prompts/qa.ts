export function buildQaDiagnosisPrompt(input: {
  commandId: string;
  exitCode: number | null;
  stdoutArtifactId: string;
  stderrArtifactId: string;
  diffArtifactId: string;
  allowedRepairPaths: string[];
}): string {
  return [
    "You are QA. The command exit code is authoritative and cannot be waived.",
    "Diagnose the failure and propose one bounded repair within allowedRepairPaths.",
    "Return summary, suspectedPaths, repairObjective, and acceptanceCriteria as JSON.",
    JSON.stringify(input),
  ].join("\n\n");
}
