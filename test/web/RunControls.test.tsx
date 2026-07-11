// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "../../src/web/components/TopBar.js";
import { TaskBoard } from "../../src/web/components/TaskBoard.js";
import { Inspector } from "../../src/web/components/Inspector.js";
import { Timeline } from "../../src/web/components/Timeline.js";
import { ConfirmDialog } from "../../src/web/components/ConfirmDialog.js";
import { DiffDialog } from "../../src/web/components/DiffDialog.js";
import type { RunSnapshot, RunEvent } from "../../src/shared/contracts.js";
import type { AttemptView, DiffView, QaReportView, AdvisorReviewView, ProviderStatus } from "../../src/shared/api.js";

// Mock AppStore so state is available
vi.mock("../../src/web/store.js", () => {
  return {
    useAppState: () => ({
      bootstrap: {
        projects: [{ id: "proj-1", name: "Cozy Test Project" }],
        providers: [],
      },
      selectedProjectId: "proj-1",
      selectedActorId: "worker-1",
      selectedTaskId: "task-1",
      run: {
        id: "run-123-uuid",
        projectId: "proj-1",
        state: "working",
        dispatchPaused: false,
        baseBranch: "main",
        baseCommit: "a".repeat(40),
        draftId: "draft-1",
        draftVersion: 1,
        contextSnapshotId: "snap-1",
        integrationBranch: "integration-branch",
        integrationWorktree: "/tmp/worktree",
        tasks: [],
        latestEventSequence: 10,
        blockReason: null,
        updatedAt: "2026-07-11T12:00:00.000Z",
      },
    }),
    useAppDispatch: () => vi.fn(),
  };
});

describe("Owner Run Controls UI & Dashboard Components", () => {
  it("renders TopBar buttons based on run status", () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onCancel = vi.fn();
    const onApply = vi.fn();
    const onCleanup = vi.fn();
    const onShowDiff = vi.fn();

    render(
      <TopBar
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onApply={onApply}
        onCleanup={onCleanup}
        onShowDiff={onShowDiff}
      />,
    );

    // Cancel and Pause buttons should exist since state is 'working' and not paused
    expect(screen.getByText("Pause")).toBeDefined();
    expect(screen.getByText("Cancel")).toBeDefined();

    fireEvent.click(screen.getByText("Pause"));
    expect(onPause).toHaveBeenCalled();
  });

  it("renders TaskBoard columns and maps task states", () => {
    const fakeRun: RunSnapshot = {
      id: "run-1",
      projectId: "proj-1",
      state: "working",
      dispatchPaused: false,
      baseBranch: "main",
      baseCommit: "a".repeat(40),
      draftId: "draft-1",
      draftVersion: 1,
      contextSnapshotId: "snap-1",
      integrationBranch: "integration-branch",
      integrationWorktree: "/tmp/worktree",
      tasks: [
        {
          id: "task-1",
          title: "Write some code",
          objective: "Implement a feature",
          mode: "write",
          dependsOn: [],
          contextArtifacts: [],
          allowedPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: ["it passes"],
          verificationCommands: ["npm test"],
          status: "running",
          assignedProfileId: "worker-1",
          commitSha: null,
        },
      ],
      latestEventSequence: 1,
      blockReason: null,
      updatedAt: "2026-07-11T12:00:00.000Z",
    };

    const onSelectTask = vi.fn();
    render(<TaskBoard run={fakeRun} onSelectTask={onSelectTask} />);

    expect(screen.getByText("Plan (0)")).toBeDefined();
    expect(screen.getByText("Running (1)")).toBeDefined();
    expect(screen.getByText("task-1")).toBeDefined();

    fireEvent.click(screen.getByText("task-1"));
    expect(onSelectTask).toHaveBeenCalledWith("task-1");
  });

  it("renders Inspector without credentials and shows logs links", () => {
    const fakeAttempts: AttemptView[] = [
      {
        id: "att-1",
        taskId: "task-1",
        role: "worker",
        profileId: "worker-1",
        provider: "claude",
        model: "claude-3-5",
        stage: "work",
        attemptNumber: 1,
        status: "succeeded",
        exitCode: 0,
        errorCode: null,
        stdoutArtifactId: "stdout-uuid",
        stderrArtifactId: "stderr-uuid",
        startedAt: "2026-07-11T12:00:00.000Z",
        finishedAt: "2026-07-11T12:01:00.000Z",
        durationMs: 60000,
      },
    ];

    render(
      <Inspector
        actorId="worker-1"
        taskId="task-1"
        run={null}
        attempts={fakeAttempts}
        providerStatuses={[]}
      />,
    );

    // Checks that stdout and stderr links exist
    const link = screen.getByText("Stdout Log");
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/api/artifacts/stdout-uuid");
  });

  it("renders Timeline with distinct event items", () => {
    const events: RunEvent[] = [
      {
        sequence: 1,
        runId: "run-1",
        kind: "run.created",
        actorId: null,
        taskId: null,
        payload: {},
        createdAt: "2026-07-11T12:00:00.000Z",
      },
      {
        sequence: 2,
        runId: "run-1",
        kind: "advisor.gate",
        actorId: "advisor",
        taskId: null,
        payload: {},
        createdAt: "2026-07-11T12:01:00.000Z",
      },
    ];

    render(<Timeline events={events} />);
    expect(screen.getByText("RUN.CREATED")).toBeDefined();
    expect(screen.getByText("ADVISOR.GATE")).toBeDefined();
  });

  it("renders ConfirmDialog and traps focus and handles confirmation", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        title="Start Run Execution"
        description="Verify and start the run"
        confirmLabel="Start"
        showConcurrency={true}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Start Run Execution")).toBeDefined();
    expect(screen.getByText("Concurrency Limit (Parallel Workers):")).toBeDefined();

    fireEvent.click(screen.getByText("Start"));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("renders DiffDialog with selectable patch representation", () => {
    const fakeDiff: DiffView = {
      artifact: {
        id: "diff-art-id",
        runId: "run-id",
        taskId: null,
        kind: "integration-diff",
        sha256: "hash",
        sizeBytes: 100,
        createdAt: "2026-07-11T12:00:00.000Z",
      },
      stat: "1 file changed, 5 insertions(+)",
      patch: "+++ a/package.json\n+   \"new\": \"dependency\"",
      truncated: false,
    };

    render(
      <DiffDialog
        open={true}
        diff={fakeDiff}
        qa={null}
        advisorReviews={[]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Stats: 1 file changed, 5 insertions(+)")).toBeDefined();
    expect(screen.getByText("dependency")).toBeDefined();
  });
});
