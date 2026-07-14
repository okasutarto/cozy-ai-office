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

type DiscussionProfileId = Extract<ProfileId, "manager" | "advisor">;

const DISCUSSION_PERSONAS: Array<{ id: DiscussionProfileId; label: string }> = [
  { id: "manager", label: "Manager" },
  { id: "advisor", label: "Tech Lead" },
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
  const [discussionProfileId, setDiscussionProfileId] = useState<DiscussionProfileId>("manager");
  const [activeConversation, setActiveConversation] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [draftSelectionActive, setDraftSelectionActive] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
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
    setActiveConversation(null);
    setMessages([]);
    setDraftSelectionActive(false);
    setSelectedMessageIds([]);
    api
      .listConversations(projectId)
      .then((data) => {
        if (!active) return;
        const found = data.find((conversation) => conversation.profileId === discussionProfileId);
        if (found) {
          setActiveConversation(found);
          return;
        }
        return api
          .createConversation(projectId, {
            role: discussionProfileId,
            profileId: discussionProfileId,
            contextSnapshotId,
            runId: activeRun?.id || null,
          })
          .then((conversation) => {
            if (!active) return;
            setActiveConversation(conversation);
          });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeRun?.id, api, contextSnapshotId, discussionProfileId, projectId]);

  useEffect(() => {
    if (!activeConversation) return;
    setSelectedMessageIds([]);
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

  const activeProfile = roleProfiles.find((profile) => profile.id === discussionProfileId);
  const activePersona =
    DISCUSSION_PERSONAS.find((persona) => persona.id === discussionProfileId) ??
    DISCUSSION_PERSONAS[0]!;
  const primaryProvider = providerStatuses.find(
    (provider) => provider.provider === activeProfile?.providerChain[0]?.provider,
  );
  const antigravityOnly =
    activeProfile?.providerChain[0]?.provider === "antigravity" &&
    primaryProvider?.capabilities.readOnly === false;
  const isTechLead = discussionProfileId === "advisor";
  const warningEvents = timelineEvents.filter(eventIsWarning);
  const completedAttempts = attempts.filter((attempt) => attempt.status === "succeeded");
  const totalDuration = attempts.reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0);

  const sendMessage = async () => {
    if (!activeConversation || !inputText.trim() || antigravityOnly || isSending) return;
    const conversation = activeConversation;
    const body = inputText.trim();
    const optimisticId = crypto.randomUUID();
    const optimisticMessage: MessageRecord = {
      id: optimisticId,
      conversationId: conversation.id,
      sender: "owner",
      body,
      sourceMessageIds: [],
      artifactIds: [],
      createdAt: new Date().toISOString(),
    };
    setInputText("");
    setIsSending(true);
    setMessages((current) => [...current, optimisticMessage]);
    try {
      await api.sendMessage(conversation.id, {
        body,
        selectedMessageIds: [],
        selectedArtifactIds: [],
        additionalUsageConfirmed: isTechLead,
      });
      setMessages(await api.listMessages(conversation.id));
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setInputText((current) => current || body);
    } finally {
      setIsSending(false);
    }
  };

  const forwardToManager = async () => {
    if (!activeConversation || selectedMessageIds.length === 0) return;
    try {
      const draft = await api.forwardToManager(activeConversation.id, selectedMessageIds);
      onDraftCreated(draft);
      setDraftSelectionActive(false);
      setSelectedMessageIds([]);
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
      <div className="dock-subheader discussion-subheader">
        <div className="discussion-personas" role="tablist" aria-label="Discussion personas">
          {DISCUSSION_PERSONAS.map((persona) => (
            <button
              key={persona.id}
              type="button"
              role="tab"
              aria-selected={discussionProfileId === persona.id}
              disabled={isSending}
              className={`persona-tab ${discussionProfileId === persona.id ? "active" : ""}`}
              onClick={() => setDiscussionProfileId(persona.id)}
            >
              {persona.label}
            </button>
          ))}
        </div>
        <div className="discussion-status">
          <span>{activeProfile?.providerChain[0]?.provider ?? "no provider"}</span>
          <span className="status-chip success">Read-only chat</span>
        </div>
      </div>
      <ol ref={messageLogRef} className="message-log" aria-label="Message log">
        {messages.length === 0 ? (
          <li className="empty-state">No messages yet. Start a chat with {activePersona.label}.</li>
        ) : (
          <>
            {messages.map((message) => {
              const selected = selectedMessageIds.includes(message.id);
              const outgoing = message.sender === "owner";
              return (
                <li
                  className={`message-row ${outgoing ? "outgoing" : "incoming"}`}
                  key={message.id}
                >
                  {draftSelectionActive && (
                    <input
                      aria-label={`Select message from ${outgoing ? "You" : activePersona.label}`}
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
                  )}
                  <div className={`message-bubble ${selected ? "selected" : ""}`}>
                    <span className="eyebrow">{outgoing ? "You" : activePersona.label}</span>
                    <p>{message.body}</p>
                  </div>
                </li>
              );
            })}
            {isSending && (
              <li
                className="message-row incoming"
                role="status"
                aria-label={`${activePersona.label} is typing`}
              >
                <div className="message-bubble typing-bubble" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </li>
            )}
          </>
        )}
      </ol>
      {antigravityOnly && (
        <p className="inline-message error">
          Selected discussion persona lacks read-only capability. Select a compatible provider
          fallback chain to enable chat.
        </p>
      )}
      {draftSelectionActive && (
        <div className="draft-selection-bar">
          <span>Select the messages that should become task context.</span>
          <button
            type="button"
            className="cozy-button"
            onClick={() => {
              setDraftSelectionActive(false);
              setSelectedMessageIds([]);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      <div className="composer">
        <textarea
          aria-label="Composer input"
          value={inputText}
          disabled={antigravityOnly || !activeConversation || isSending}
          onChange={(event) => setInputText(event.target.value.slice(0, 40_000))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder={antigravityOnly ? "Chat disabled" : `Message ${activePersona.label}…`}
        />
        <div className="composer-actions">
          <button
            type="button"
            className="cozy-button"
            disabled={!inputText.trim() || !activeConversation || antigravityOnly || isSending}
            onClick={() => void sendMessage()}
          >
            Send
          </button>
          <button
            type="button"
            className="cozy-button primary"
            disabled={
              !activeConversation || (draftSelectionActive && selectedMessageIds.length === 0)
            }
            onClick={() => {
              if (draftSelectionActive) void forwardToManager();
              else setDraftSelectionActive(true);
            }}
          >
            {draftSelectionActive
              ? `Create Draft (${selectedMessageIds.length})`
              : "Create Task Draft"}
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
        No draft loaded. Choose Create Task Draft in Discussion and select its context.
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
