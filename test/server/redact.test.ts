import { describe, expect, it } from "vitest";
import { StreamingRedactor, redactText } from "../../src/server/security/redact.js";

describe("redactText", () => {
  it("redacts common credentials without hiding ordinary identifiers", () => {
    const input = [
      "Authorization: Bearer secret-token-value",
      "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz",
      "github_pat_abcdefghijklmnopqrstuvwxyz123456",
      "task-id=worker-1",
    ].join("\n");
    const output = redactText(input);
    expect(output).not.toContain("secret-token-value");
    expect(output).not.toContain("sk-proj-");
    expect(output).not.toContain("github_pat_");
    expect(output).toContain("task-id=worker-1");
  });

  it("redacts credentials split across process chunks", () => {
    const redactor = new StreamingRedactor();
    const output = [
      ...redactor.push("OPENAI_API_KEY=sk-proj-abc"),
      ...redactor.push("defghijklmnopqrstuvwxyz\n"),
      ...redactor.flush(),
    ].join("");
    expect(output).not.toContain("sk-proj-");
    expect(output).toContain("[REDACTED]");
  });
});
