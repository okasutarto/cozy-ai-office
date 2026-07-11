import { describe, expect, it } from "vitest";
import {
  ManagerPlanSchema,
  RoleProfileSchema,
  TaskBriefSchema,
} from "../../src/shared/contracts.js";

describe("shared contracts", () => {
  it("rejects write briefs without path ownership", () => {
    const result = TaskBriefSchema.safeParse({
      id: "task-1",
      title: "Edit UI",
      objective: "Change the button",
      mode: "write",
      dependsOn: [],
      contextArtifacts: [],
      allowedPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: ["Button is visible"],
      verificationCommands: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects role profiles without a provider chain", () => {
    expect(
      RoleProfileSchema.safeParse({
        id: "manager",
        role: "manager",
        label: "Manager",
        providerChain: [],
        timeoutMs: 60_000,
        promptVersion: "v1",
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded manager plan", () => {
    expect(
      ManagerPlanSchema.parse({
        summary: "Change one file",
        risks: ["Visual regression"],
        testStrategy: ["Run the component test"],
        tasks: [
          {
            id: "task-1",
            title: "Edit UI",
            objective: "Change the button",
            mode: "write",
            dependsOn: [],
            contextArtifacts: [],
            allowedPaths: ["src/button.tsx"],
            forbiddenPaths: ["src/server"],
            acceptanceCriteria: ["Button is visible"],
            verificationCommands: ["typecheck"],
          },
        ],
      }).tasks,
    ).toHaveLength(1);
  });
});
