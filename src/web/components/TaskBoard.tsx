import React, { useMemo, useState } from "react";
import type { RunSnapshot } from "../../shared/contracts.js";

type TaskState = RunSnapshot["tasks"][number]["status"];

type TaskFilter = "all" | "queued" | "running" | "attention" | "completed";

type TaskBoardProps = {
  run: RunSnapshot | null;
  onSelectTask(taskId: string): void;
  selectedTaskId?: string | null;
};

const GROUPS: Array<{ key: TaskFilter; label: string; statuses: TaskState[] }> = [
  { key: "queued", label: "Plan", statuses: ["queued"] },
  { key: "running", label: "Running", statuses: ["running"] },
  { key: "attention", label: "Blocked / Failed", statuses: ["blocked", "failed"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
];

const FILTERS: Array<{ key: TaskFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "queued", label: "Q" },
  { key: "running", label: "R" },
  { key: "attention", label: "⚠" },
  { key: "completed", label: "✓" },
];

function statusTone(status: TaskState): string {
  if (status === "running") return "running";
  if (status === "completed") return "success";
  if (status === "failed" || status === "blocked") return "danger";
  return "queued";
}

export const TaskBoard: React.FC<TaskBoardProps> = ({ run, onSelectTask, selectedTaskId }) => {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [collapsed, setCollapsed] = useState(false);

  const counts = useMemo(() => {
    const tasks = run?.tasks ?? [];
    return {
      all: tasks.length,
      queued: tasks.filter((task) => task.status === "queued").length,
      running: tasks.filter((task) => task.status === "running").length,
      attention: tasks.filter((task) => task.status === "blocked" || task.status === "failed")
        .length,
      completed: tasks.filter((task) => task.status === "completed").length,
    };
  }, [run?.tasks]);

  if (collapsed) {
    return (
      <aside className="task-queue task-queue-collapsed">
        <button
          type="button"
          className="queue-collapse-button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand swarm task queue"
        >
          ›
        </button>
        <span className="queue-collapsed-count">{counts.all}</span>
      </aside>
    );
  }

  return (
    <section className="task-queue" aria-label="Swarm task queue">
      <header className="panel-heading">
        <span>▱ Swarm Task Queue</span>
        <span className="micro-chip">{counts.all} total</span>
        <button
          type="button"
          className="queue-collapse-button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse swarm task queue"
        >
          ‹
        </button>
      </header>

      <div className="queue-summary">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`queue-filter ${filter === item.key ? "active" : ""}`}
            onClick={() => setFilter(item.key)}
            aria-pressed={filter === item.key}
          >
            <span>{item.label}</span>
            <b>{counts[item.key]}</b>
          </button>
        ))}
      </div>

      {!run ? (
        <div className="empty-state">
          <p className="eyebrow">No active swarm</p>
          <p>Draft a task in Discussion, then launch the run to populate this queue.</p>
        </div>
      ) : (
        <div className="queue-groups">
          {GROUPS.filter(
            (group) =>
              filter === "all" ||
              filter === group.key ||
              (filter === "attention" && group.key === "attention"),
          ).map((group) => {
            const tasks = run.tasks.filter((task) => group.statuses.includes(task.status));
            return (
              <section key={group.key} className="queue-group" aria-label={`${group.label} tasks`}>
                <div className="queue-group-heading">
                  <span>
                    {group.label} ({tasks.length})
                  </span>
                  <span className={`micro-chip ${group.key === "attention" ? "danger" : ""}`}>
                    {tasks.length}
                  </span>
                </div>
                {tasks.length === 0 ? (
                  <div className="queue-group-empty">No tasks</div>
                ) : (
                  <div className="queue-cards">
                    {tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className={`task-card ${selectedTaskId === task.id ? "selected" : ""}`}
                        onClick={() => onSelectTask(task.id)}
                      >
                        <span className="task-card-topline">
                          <strong>{task.id}</strong>
                          <span className={`task-status ${statusTone(task.status)}`}>
                            {task.status}
                          </span>
                        </span>
                        <span className="task-card-title">{task.title}</span>
                        <span className="task-card-meta">
                          <span>{task.assignedProfileId ?? "unassigned"}</span>
                          <span>
                            {task.dependsOn.length
                              ? `${task.dependsOn.length} deps`
                              : "independent"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
};
