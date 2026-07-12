import React, { useMemo, useState } from "react";
import type { AttemptView } from "../../shared/api.js";
import type { ProviderStatus, RoleProfile, RunEvent, RunSnapshot } from "../../shared/contracts.js";
import { ApiClient } from "../api.js";

type InspectorProps = {
  actorId: string;
  taskId: string | null;
  run: RunSnapshot | null;
  attempts: AttemptView[];
  providerStatuses: ProviderStatus[];
  roleProfiles?: RoleProfile[];
  events?: RunEvent[];
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toneForStatus(status: string | undefined): string {
  if (status === "completed" || status === "succeeded") return "success";
  if (status === "failed" || status === "blocked") return "danger";
  if (status === "running") return "warning";
  return "";
}

export const Inspector: React.FC<InspectorProps> = ({
  actorId,
  taskId,
  run,
  attempts,
  providerStatuses,
  roleProfiles = [],
  events = [],
}) => {
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const profile = roleProfiles.find((item) => item.id === actorId);
  const provider = providerStatuses.find(
    (item) => item.provider === profile?.providerChain[0]?.provider,
  );
  const task = run?.tasks.find((item) => item.id === taskId);
  const taskAttempts = attempts.filter((attempt) =>
    taskId ? attempt.taskId === taskId : attempt.profileId === actorId,
  );
  const actorEvents = useMemo(
    () =>
      events
        .filter((event) => event.actorId === actorId || (taskId && event.taskId === taskId))
        .slice(-8)
        .reverse(),
    [actorId, events, taskId],
  );

  const openArtifact = async (artifactId: string) => {
    setArtifactError(null);
    try {
      const blob = await new ApiClient(
        sessionStorage.getItem("cozy-session") || "",
      ).downloadArtifact(artifactId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="inspector" aria-label="Agent inspector">
      <header className="panel-heading">
        <span>⚙ Agent Inspector</span>
        <span className="micro-chip">{actorId}</span>
      </header>

      <div className="inspector-scroll">
        <section className="inspector-identity setup-card">
          <div className="inspector-identity-topline">
            <div>
              <p className="eyebrow">Selected profile</p>
              <h2>{profile?.label ?? actorId}</h2>
            </div>
            <span className={`status-chip ${provider?.authenticated ? "success" : "danger"}`}>
              <i className="dot" /> {provider?.authenticated ? "online" : "offline"}
            </span>
          </div>
          <div className="inspector-facts">
            <span>
              <b>Role</b>
              {profile?.role ?? "unknown"}
            </span>
            <span>
              <b>Provider</b>
              {provider?.provider ?? profile?.providerChain[0]?.provider ?? "unassigned"}
            </span>
            <span>
              <b>Model</b>
              {profile?.providerChain[0]?.model ?? "provider default"}
            </span>
            <span>
              <b>Capability</b>
              {profile?.role === "worker" ? "worktree write" : "read-only"}
            </span>
          </div>
          <div className="skill-list" style={{ marginTop: 10 }}>
            {(profile?.providerChain ?? []).map((candidate, index) => (
              <span className="skill-chip" key={`${candidate.provider}-${index}`}>
                #{index + 1} {candidate.provider}
                {candidate.model ? ` / ${candidate.model}` : ""}
              </span>
            ))}
          </div>
        </section>

        {task ? (
          <section className="inspector-section">
            <div className="inspector-section-heading">
              <span>Active task</span>
              <span className={`status-chip ${toneForStatus(task.status)}`}>{task.status}</span>
            </div>
            <h3>{task.title}</h3>
            <p>{task.objective}</p>
            <div className="inspector-facts">
              <span>
                <b>Task</b>
                {task.id}
              </span>
              <span>
                <b>Dependencies</b>
                {task.dependsOn?.length || "none"}
              </span>
              <span>
                <b>Allowed paths</b>
                {task.allowedPaths?.length || "none"}
              </span>
              <span>
                <b>Checks</b>
                {task.verificationCommands?.length || "none"}
              </span>
            </div>
          </section>
        ) : (
          <div className="empty-state">
            Select a task from the queue to inspect its execution evidence.
          </div>
        )}

        <section className="inspector-section">
          <div className="inspector-section-heading">
            <span>Execution attempts</span>
            <span className="micro-chip">{taskAttempts.length}</span>
          </div>
          {taskAttempts.length === 0 ? (
            <p className="inspector-muted">No persisted attempts for this selection.</p>
          ) : (
            <div className="attempt-list">
              {taskAttempts.map((attempt) => (
                <article className="attempt-card" key={attempt.id}>
                  <div className="attempt-card-topline">
                    <span>
                      Attempt #{attempt.attemptNumber} · {attempt.provider}
                    </span>
                    <span className={`task-status ${toneForStatus(attempt.status)}`}>
                      {attempt.status}
                    </span>
                  </div>
                  <div className="attempt-card-meta">
                    <span>{attempt.model ?? "default model"}</span>
                    <span>
                      {attempt.durationMs == null ? "in progress" : `${attempt.durationMs} ms`}
                    </span>
                  </div>
                  {(attempt.stdoutArtifactId || attempt.stderrArtifactId) && (
                    <div className="attempt-links">
                      {attempt.stdoutArtifactId && (
                        <button
                          type="button"
                          onClick={() => void openArtifact(attempt.stdoutArtifactId!)}
                        >
                          Stdout Log
                        </button>
                      )}
                      {attempt.stderrArtifactId && (
                        <button
                          type="button"
                          onClick={() => void openArtifact(attempt.stderrArtifactId!)}
                        >
                          Stderr Log
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {artifactError && <p className="inline-message error">{artifactError}</p>}
        </section>

        <section className="inspector-section">
          <div className="inspector-section-heading">
            <span>Recent events</span>
            <span className="micro-chip">{actorEvents.length}</span>
          </div>
          {actorEvents.length === 0 ? (
            <p className="inspector-muted">No events for this agent yet.</p>
          ) : (
            <div className="inspector-events">
              {actorEvents.map((event) => (
                <div className="inspector-event" key={event.sequence}>
                  <span className="eyebrow">{formatTime(event.createdAt)}</span>
                  <span>{event.kind}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
};
