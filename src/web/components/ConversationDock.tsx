import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AttemptView, ConversationRecord, MessageRecord } from "../../shared/api.js";
import type {
  ProviderStatus,
  RoleProfile,
  RunEvent,
  RunSnapshot,
  ProfileId,
  TaskDraftVersion,
} from "../../shared/contracts.js";
import { ApiClient } from "../api.js";
import { useAppDispatch, useAppState } from "../store.js";
import { DraftEditor } from "./DraftEditor.js";
import { RoleSettings } from "./RoleSettings.js";
import { Timeline } from "./Timeline.js";

type DockTab = "discussion" | "draft" | "metrics" | "roles" | "execution" | "warnings";

type ConversationDockProps = {
  projectId: string;
  selectedActorId: ProfileId;
  activeRun: RunSnapshot | null;
  roleProfiles: RoleProfile[];
  providerStatuses: ProviderStatus[];
  contextSnapshotId: string;
  onDraftCreated(draft: TaskDraftVersion): void;
  onRequestStart?(draft: TaskDraftVersion): void;
  timelineEvents: RunEvent[];
  attempts?: AttemptView[];
};

const TAB_LABELS: Array<{ id: DockTab; label: string }> = [
  { id: "discussion", label: "Discussion" },
  { id: "draft", label: "Draft Task" },
  { id: "metrics", label: "Run Metrics" },
  { id: "roles", label: "Swarm Roles Manager" },
  { id: "execution", label: "Execution" },
  { id: "warnings", label: "Warnings & Logs" },
];

function eventIsWarning(event: RunEvent): boolean {
  return /fail|block|conflict|error|warn|reject|cancel/i.test(event.kind);
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export const ConversationDock: React.FC<ConversationDockProps> = ({
  projectId,
  selectedActorId,
  activeRun,
  roleProfiles,
  providerStatuses,
  contextSnapshotId,
  onDraftCreated,
  onRequestStart = () => {},
  timelineEvents = [],
  attempts = [],
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const api = useMemo(() => new ApiClient(sessionStorage.getItem("cozy-session") || ""), []);
  const [tab, setTab] = useState<DockTab>("discussion");
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [advisorConfirmed, setAdvisorConfirmed] = useState(false);
  const [commands, setCommands] = useState<unknown[]>([]);
  const [editableProfiles, setEditableProfiles] = useState(roleProfiles);
  const [rolesSaving, setRolesSaving] = useState(false);
  const [rolesNotice, setRolesNotice] = useState<string | null>(null);
  const messageLogRef = useRef<HTMLOListElement>(null);

  useEffect(() => setEditableProfiles(roleProfiles), [roleProfiles]);

  useEffect(() => {
    if (!projectId) return;
    api
      .request<any>(`/api/projects/${projectId}/onboarding`)
      .then((data) => setCommands(data.commands || []))
      .catch(() => setCommands([]));
  }, [api, projectId]);

  useEffect(() => {
    if (!projectId || !contextSnapshotId) return;
    let active = true;
    api
      .listConversations(projectId)
      .then((data) => {
        if (!active) return;
        setConversations(data);
        const found = data.find((conversation) => conversation.profileId === selectedActorId);
        if (found) {
          setActiveConversation(found);
          return;
        }
        const role =
          selectedActorId === "manager" || selectedActorId === "advisor" || selectedActorId === "qa"
            ? selectedActorId
            : "worker";
        return api
          .createConversation(projectId, {
            role,
            profileId: selectedActorId,
            contextSnapshotId,
            runId: activeRun?.id || null,
          })
          .then((conversation) => {
            if (!active) return;
            setConversations((current) => [...current, conversation]);
            setActiveConversation(conversation);
          });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeRun?.id, api, contextSnapshotId, projectId, selectedActorId]);

  useEffect(() => {
    if (!activeConversation) return;
    let active = true;
    api
      .listMessages(activeConversation.id)
      .then((data) => {
        if (active) setMessages(data);
      })
      .catch(() => setMessages([]));
    return () => {
      active = false;
    };
  }, [activeConversation?.id, api]);

  useEffect(() => {
    if (messageLogRef.current) messageLogRef.current.scrollTop = messageLogRef.current.scrollHeight;
  }, [messages]);

  const activeProfile = roleProfiles.find((profile) => profile.id === selectedActorId);
  const primaryProvider = providerStatuses.find(
    (provider) => provider.provider === activeProfile?.providerChain[0]?.provider,
  );
  const antigravityOnly =
    activeProfile?.providerChain[0]?.provider === "antigravity" &&
    primaryProvider?.capabilities.readOnly === false;
  const isAdvisor = selectedActorId === "advisor";
  const warningEvents = timelineEvents.filter(eventIsWarning);
  const completedAttempts = attempts.filter((attempt) => attempt.status === "succeeded");
  const totalDuration = attempts.reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0);

  const sendMessage = async () => {
    if (!activeConversation || !inputText.trim() || antigravityOnly) return;
    if (isAdvisor && !advisorConfirmed) return;
    try {
      const message = await api.sendMessage(activeConversation.id, {
        body: inputText.trim(),
        selectedMessageIds: [],
        selectedArtifactIds: [],
        additionalUsageConfirmed: advisorConfirmed,
      });
      setMessages((current) => [...current, message]);
      setInputText("");
    } catch {
      // The server response is surfaced by the next timeline event; keep the draft text intact.
    }
  };

  const forwardToManager = async () => {
    if (!activeConversation || selectedMessageIds.length === 0) return;
    try {
      const draft = await api.forwardToManager(activeConversation.id, selectedMessageIds);
      onDraftCreated(draft);
      setTab("draft");
    } catch {
      // Keep selected context available so the owner can retry.
    }
  };

  const saveRoles = async () => {
    if (!projectId || editableProfiles.length !== 7) return;
    setRolesSaving(true);
    setRolesNotice(null);
    try {
      await api.request(`/api/projects/${projectId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ profiles: editableProfiles }),
      });
      setRolesNotice("Role mapping saved. It applies to the next run.");
      dispatch({ type: "bootstrapped", value: await api.bootstrap() });
    } catch (error) {
      setRolesNotice(error instanceof Error ? error.message : "Role mapping could not be saved.");
    } finally {
      setRolesSaving(false);
    }
  };

  const renderDiscussion = () => (
    <div className="dock-content discussion-panel">
      <div className="dock-subheader">
        <div>
          <strong>{activeProfile?.label ?? selectedActorId}</strong>
          <span> · {activeProfile?.providerChain[0]?.provider ?? "no provider"}</span>
        </div>
        <span className="status-chip success">Read-only consultation</span>
      </div>
      <ol ref={messageLogRef} className="message-log" aria-label="Message log">
        {messages.length === 0 ? (
          <li className="empty-state">
            No messages yet. Start a consultation or select a different role.
          </li>
        ) : (
          messages.map((message) => {
            const selected = selectedMessageIds.includes(message.id);
            return (
              <li className={`message-card ${selected ? "selected" : ""}`} key={message.id}>
                <input
                  aria-label={`Select message from ${message.sender}`}
                  type="checkbox"
                  checked={selected}
                  onChange={() =>
                    setSelectedMessageIds((current) =>
                      selected
                        ? current.filter((id) => id !== message.id)
                        : [...current, message.id],
                    )
                  }
                />
                <div>
                  <span className="eyebrow">{message.sender}</span>
                  <p>{message.body}</p>
                </div>
              </li>
            );
          })
        )}
      </ol>
      {isAdvisor && (
        <label className="dock-warning-check">
          <input
            type="checkbox"
            checked={advisorConfirmed}
            onChange={(event) => setAdvisorConfirmed(event.target.checked)}
          />
          Confirm premium token usage warning for Advisor turn.
        </label>
      )}
      {antigravityOnly && (
        <p className="inline-message error">
          Worker lacks read-only capability. Select a provider fallback chain supporting readOnly to
          enable chat.
        </p>
      )}
      <div className="composer">
        <textarea
          aria-label="Composer input"
          value={inputText}
          disabled={antigravityOnly || !activeConversation}
          onChange={(event) => setInputText(event.target.value.slice(0, 40_000))}
          placeholder={antigravityOnly ? "Chat disabled" : "Type a message…"}
        />
        <div className="composer-actions">
          <button
            type="button"
            className="cozy-button"
            disabled={!inputText.trim() || !activeConversation || antigravityOnly}
            onClick={() => void sendMessage()}
          >
            Send
          </button>
          <button
            type="button"
            className="cozy-button primary"
            disabled={!activeConversation || selectedMessageIds.length === 0}
            onClick={() => void forwardToManager()}
          >
            Send to Manager
          </button>
        </div>
      </div>
    </div>
  );

  const renderMetrics = () => (
    <div className="dock-content metrics-panel">
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="eyebrow">Tasks</span>
          <strong>{activeRun?.tasks.length ?? 0}</strong>
          <small>current run</small>
        </div>
        <div className="metric-card">
          <span className="eyebrow">Attempts</span>
          <strong>{attempts.length}</strong>
          <small>{completedAttempts.length} completed</small>
        </div>
        <div className="metric-card">
          <span className="eyebrow">Duration</span>
          <strong>{formatDuration(totalDuration)}</strong>
          <small>persisted attempts</small>
        </div>
        <div className="metric-card">
          <span className="eyebrow">Events</span>
          <strong>{timelineEvents.length}</strong>
          <small>{warningEvents.length} warnings</small>
        </div>
      </div>
      <div className="metrics-table">
        {attempts.length === 0 ? (
          <div className="empty-state">
            No provider attempts recorded yet. Token and cost metrics are not exposed by the current
            provider contracts.
          </div>
        ) : (
          attempts.map((attempt) => (
            <div className="metrics-row" key={attempt.id}>
              <span>{attempt.profileId}</span>
              <span>
                {attempt.provider}/{attempt.model ?? "default"}
              </span>
              <span>{attempt.status}</span>
              <span>{formatDuration(attempt.durationMs ?? NaN)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderRoles = () => (
    <div className="dock-content roles-panel">
      {rolesNotice && (
        <p className={`inline-message ${rolesNotice.includes("saved") ? "success" : "error"}`}>
          {rolesNotice}
        </p>
      )}
      <RoleSettings
        profiles={editableProfiles}
        providers={providerStatuses}
        onChange={setEditableProfiles}
      />
      <div className="dock-panel-actions">
        <button
          type="button"
          className="cozy-button primary"
          disabled={rolesSaving || editableProfiles.length !== 7}
          onClick={() => void saveRoles()}
        >
          {rolesSaving ? "Saving…" : "Save Role Mapping"}
        </button>
      </div>
    </div>
  );

  const renderWarnings = () => (
    <div className="dock-content warnings-panel">
      <div className="dock-subheader">
        <span>Warnings & Logs</span>
        <span className="micro-chip danger">{warningEvents.length} attention</span>
      </div>
      {warningEvents.length === 0 ? (
        <div className="empty-state">No failed, blocked, conflict, or warning events.</div>
      ) : (
        warningEvents.map((event) => (
          <article className="log-row warning" key={event.sequence}>
            <span className="eyebrow">
              #{event.sequence} · {event.createdAt}
            </span>
            <strong>{event.kind}</strong>
            <code>{JSON.stringify(event.payload)}</code>
          </article>
        ))
      )}
    </div>
  );

  const renderPanel = () => {
    if (tab === "discussion") return renderDiscussion();
    if (tab === "metrics") return renderMetrics();
    if (tab === "roles") return renderRoles();
    if (tab === "warnings") return renderWarnings();
    if (tab === "execution")
      return (
        <div className="dock-content">
          <Timeline events={timelineEvents} />
        </div>
      );
    return state.draft ? (
      <div className="dock-content">
        <DraftEditor
          draft={state.draft}
          activeRun={activeRun}
          canStart={
            !activeRun &&
            Boolean(
              projectId &&
              contextSnapshotId &&
              commands.length &&
              providerStatuses.some((provider) => provider.authenticated),
            )
          }
          blockingReasons={[]}
          onSaved={(draft) => dispatch({ type: "draft_loaded", value: draft })}
          onRequestStart={onRequestStart}
        />
      </div>
    ) : (
      <div className="empty-state">
        No draft loaded. Select messages in Discussion and send them to Manager.
      </div>
    );
  };

  return (
    <section className="conversation-dock" aria-label="Control room dock">
      <div className="dock-tabbar" role="tablist" aria-label="Workspace dock tabs">
        {TAB_LABELS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`dock-tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === "warnings" && warningEvents.length > 0 && (
              <span className="tab-badge">{warningEvents.length}</span>
            )}
            {item.id === "roles" && <span className="tab-badge">{editableProfiles.length}</span>}
          </button>
        ))}
      </div>
      <div className="dock-tabpanel" role="tabpanel">
        {renderPanel()}
      </div>
    </section>
  );
};
