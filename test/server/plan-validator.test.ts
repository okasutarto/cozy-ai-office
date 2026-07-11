import { describe, expect, it } from "vitest";
import { validatePlan } from "../../src/server/orchestrator/plan-validator.js";
import type { TaskDraftVersion, CommandSpec } from "../../shared/contracts.js";

const mockDraft: TaskDraftVersion = {
  draftId: "00000000-0000-4000-8000-000000000401",
  version: 1,
  objective: "Test objective",
  scope: ["path:src/a", "path:test/a.test.ts"],
  constraints: [],
  acceptanceCriteria: [],
  contextSnapshotId: "00000000-0000-4000-8000-000000000402",
  sourceMessageIds: [],
  sha256: "0".repeat(64),
  createdAt: new Date().toISOString(),
};

const mockCommands: CommandSpec[] = [
  {
    id: "cmd-1",
    label: "check",
    executable: "npm",
    args: ["run", "check"],
    required: true,
    timeoutMs: 5000,
    position: 0,
  },
];

describe("Plan Validator", () => {
  it("rejects duplicate task IDs", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "read_only",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
        {
          id: "task-1",
          title: "t2",
          objective: "o2",
          mode: "read_only",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(/Duplicate task ID: task-1/);
  });

  it("rejects unknown dependency IDs", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "read_only",
          dependsOn: ["unknown-task"],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(/has unknown dependency/);
  });

  it("rejects self dependency", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "read_only",
          dependsOn: ["task-1"],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(/depends on itself/);
  });

  it("rejects dependency cycles", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "read_only",
          dependsOn: ["task-2"],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
        {
          id: "task-2",
          title: "t2",
          objective: "o2",
          mode: "read_only",
          dependsOn: ["task-1"],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(/Dependency cycle detected/);
  });

  it("rejects read-only brief with allowed paths", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "read_only",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/a.ts"],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow();
  });

  it("rejects write brief without allowed paths", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow();
  });

  it("rejects allowed/forbidden overlap inside brief", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/a"],
          forbiddenPaths: ["src/a/file.ts"],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(
      /overlaps with forbidden path/,
    );
  });

  it("rejects overlapping write tasks without transitive dependency", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/a"],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
        {
          id: "task-2",
          title: "t2",
          objective: "o2",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/a/file.ts"],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(
      /must have a transitive dependency/,
    );
  });

  it("accepts overlapping write tasks with transitive dependency", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/a"],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
        {
          id: "task-2",
          title: "t2",
          objective: "o2",
          mode: "write",
          dependsOn: ["task-1"],
          contextArtifacts: [],
          allowedPaths: ["src/a/file.ts"],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    const validated = validatePlan(plan, mockDraft, mockCommands);
    expect(validated.topologicalOrder).toEqual(["task-1", "task-2"]);
  });

  it("rejects write allowedPaths outside frozen scope", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/outside.ts"],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(
      /outside the frozen draft scope/,
    );
  });

  it("rejects unknown verification command IDs", () => {
    const plan = {
      summary: "summary",
      risks: [],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "read_only",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: ["unknown-cmd"],
        },
      ],
    };
    expect(() => validatePlan(plan, mockDraft, mockCommands)).toThrow(
      /uses unknown verification command/,
    );
  });

  it("validates valid plan and produces correct topological order", () => {
    const plan = {
      summary: "summary",
      risks: ["r1"],
      testStrategy: ["test"],
      tasks: [
        {
          id: "task-2",
          title: "t2",
          objective: "o2",
          mode: "read_only",
          dependsOn: ["task-1"],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: [],
        },
        {
          id: "task-1",
          title: "t1",
          objective: "o1",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: ["src/a/file.ts"],
          forbiddenPaths: [],
          acceptanceCriteria: ["a"],
          verificationCommands: ["cmd-1"],
        },
      ],
    };
    const validated = validatePlan(plan, mockDraft, mockCommands);
    expect(validated.topologicalOrder).toEqual(["task-1", "task-2"]);
  });
});
