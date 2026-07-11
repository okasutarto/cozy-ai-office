import React, { useState, useEffect, useRef } from "react";
import type {
  RunSnapshot,
  RoleProfile,
  ProviderStatus,
  ProfileId,
  TaskDraftVersion,
} from "../../shared/contracts.js";
import { ApiClient } from "../api.js";
import type { ConversationRecord, MessageRecord } from "../../shared/api.js";
import { useAppState, useAppDispatch } from "../store.js";
import { DraftEditor } from "./DraftEditor.js";
import { Timeline } from "./Timeline.js";
import type { RunEvent } from "../../shared/contracts.js";

type ConversationDockProps = {
  projectId: string;
  selectedActorId: ProfileId;
  activeRun: RunSnapshot | null;
  roleProfiles: RoleProfile[];
  providerStatuses: ProviderStatus[];
  contextSnapshotId: string;
  onDraftCreated(draft: TaskDraftVersion): void;
  onRequestStart(draft: TaskDraftVersion): void;
  timelineEvents: RunEvent[];
};

export const ConversationDock: React.FC<ConversationDockProps> = ({
  projectId,
  selectedActorId,
  activeRun,
  roleProfiles,
  providerStatuses,
  contextSnapshotId,
  onDraftCreated,
  onRequestStart,
  timelineEvents,
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const api = new ApiClient(sessionStorage.getItem("cozy-session") || "");
  const [tab, setTab] = useState<"discussion" | "draft" | "execution">("discussion");

  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [advisorConfirmed, setAdvisorConfirmed] = useState(false);
  const [commands, setCommands] = useState<any[]>([]);

  useEffect(() => {
    if (!projectId) return;
    api
      .request<any>(`/api/projects/${projectId}/onboarding`)
      .then((data) => {
        setCommands(data.commands || []);
      })
      .catch(() => {});
  }, [projectId]);

  const olRef = useRef<HTMLOListElement>(null);

  // 1. Fetch conversations for the project
  useEffect(() => {
    if (!projectId || !contextSnapshotId) return;
    let active = true;
    api
      .listConversations(projectId)
      .then((data) => {
        if (!active) return;
        setConversations(data);

        // Find conversation with selectedActorId
        const found = data.find((c) => c.profileId === selectedActorId);
        if (found) {
          setActiveConv(found);
        } else {
          // Create new conversation
          api
            .createConversation(projectId, {
              role:
                selectedActorId === "manager"
                  ? "manager"
                  : selectedActorId === "advisor"
                    ? "advisor"
                    : "worker",
              profileId: selectedActorId,
              contextSnapshotId,
              runId: activeRun?.id || null,
            })
            .then((newC) => {
              if (active) {
                setConversations((prev) => [...prev, newC]);
                setActiveConv(newC);
              }
            });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [projectId, selectedActorId, contextSnapshotId, activeRun?.id]);

  // 2. Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConv) return;
    let active = true;
    api
      .listMessages(activeConv.id)
      .then((data) => {
        if (active) setMessages(data);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [activeConv?.id]);

  // Scroll to bottom of message list
  useEffect(() => {
    if (olRef.current) {
      olRef.current.scrollTop = olRef.current.scrollHeight;
    }
  }, [messages]);

  const activeProfile = roleProfiles.find((p) => p.id === selectedActorId);
  const providerStatus = providerStatuses.find(
    (p) => p.provider === activeProfile?.providerChain[0]?.provider,
  );

  const isAntigravityOnly =
    activeProfile?.providerChain[0]?.provider === "antigravity" &&
    providerStatus?.capabilities.readOnly === false;

  const isAdvisor = selectedActorId === "advisor";

  const handleSend = async () => {
    if (!activeConv || !inputText) return;
    if (isAdvisor && !advisorConfirmed) {
      alert("Please confirm the premium turn usage warning before sending.");
      return;
    }

    try {
      const msg = await api.sendMessage(activeConv.id, {
        body: inputText,
        selectedMessageIds: [],
        selectedArtifactIds: [],
      });
      setMessages((prev) => [...prev, msg]);
      setInputText("");
    } catch (err: any) {
      alert(`Error sending message: ${err.message || err}`);
    }
  };

  const handleForwardToManager = async () => {
    if (selectedMessageIds.length === 0) return;
    try {
      const draft = await api.forwardToManager(activeConv!.id, selectedMessageIds);
      onDraftCreated(draft);
      setTab("draft");
    } catch (err: any) {
      alert(`Forward failed: ${err.message || err}`);
    }
  };

  const toggleSelectMessage = (id: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(id) ? prev.filter((mid) => mid !== id) : [...prev, id],
    );
  };

  return (
    <div
      className="conversation-dock"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        color: "var(--parchment-100)",
      }}
    >
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          background: "var(--ink-950)",
          borderBottom: "var(--pixel-border)",
        }}
      >
        {(["discussion", "draft", "execution"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              background: tab === t ? "var(--ink-800)" : "transparent",
              color: tab === t ? "var(--focus)" : "var(--parchment-300)",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              textTransform: "capitalize",
            }}
          >
            {t === "discussion" ? "Discussion" : t === "draft" ? "Draft Task" : "Execution"}
          </button>
        ))}
      </div>

      {tab === "discussion" && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Header */}
          <div
            style={{
              padding: "8px 12px",
              background: "var(--ink-800)",
              borderBottom: "var(--pixel-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>{activeProfile?.label || selectedActorId}</strong>{" "}
              <span style={{ fontSize: "11px", color: "var(--parchment-300)" }}>
                ({activeProfile?.providerChain[0]?.provider || "no provider"})
              </span>
            </div>
            <div style={{ color: "var(--gold-400)", fontSize: "12px", fontWeight: "bold" }}>
              Read-only consultation
            </div>
          </div>

          {/* Messages */}
          <ol
            ref={olRef}
            aria-label="Message log"
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px",
              margin: 0,
              listStyle: "none",
              display: "grid",
              gap: "8px",
            }}
          >
            {messages.map((msg) => {
              const isSelected = selectedMessageIds.includes(msg.id);
              return (
                <li
                  key={msg.id}
                  style={{
                    background: "var(--ink-950)",
                    border: isSelected ? "1px solid var(--focus)" : "1px solid transparent",
                    padding: "8px",
                    borderRadius: "2px",
                    display: "flex",
                    gap: "10px",
                  }}
                >
                  <input
                    aria-label={`Select message from ${msg.sender}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectMessage(msg.id)}
                  />
                  <div>
                    <div style={{ fontSize: "11px", color: "var(--gold-400)" }}>
                      <strong>{msg.sender}</strong>
                    </div>
                    <div style={{ fontSize: "13px", marginTop: "4px" }}>{msg.body}</div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Context chips */}
          {selectedMessageIds.length > 0 && (
            <div
              style={{
                padding: "6px 12px",
                background: "var(--ink-950)",
                borderTop: "var(--pixel-border)",
                display: "flex",
                gap: "6px",
                flexWrap: "wrap",
              }}
            >
              {selectedMessageIds.map((id) => (
                <span
                  key={id}
                  style={{
                    background: "var(--ink-800)",
                    border: "1px solid var(--parchment-300)",
                    fontSize: "11px",
                    padding: "2px 6px",
                  }}
                >
                  Msg: {id.substring(0, 8)}...
                </span>
              ))}
            </div>
          )}

          {/* Composer */}
          <div
            style={{
              padding: "8px 12px",
              background: "var(--ink-800)",
              borderTop: "var(--pixel-border)",
              display: "grid",
              gap: "8px",
            }}
          >
            {isAdvisor && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                <input
                  id="advisor-confirm"
                  type="checkbox"
                  checked={advisorConfirmed}
                  onChange={(e) => setAdvisorConfirmed(e.target.checked)}
                />
                <label htmlFor="advisor-confirm" style={{ color: "var(--danger-500)" }}>
                  Confirm premium token usage warning for Advisor turn.
                </label>
              </div>
            )}

            {isAntigravityOnly && (
              <div style={{ color: "var(--danger-500)", fontSize: "12px" }}>
                Worker lacks read-only capability. Select a provider fallback chain supporting
                readOnly to enable chat.
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <textarea
                aria-label="Composer input"
                value={inputText}
                disabled={isAntigravityOnly || !activeConv}
                onChange={(e) => setInputText(e.target.value.substring(0, 40000))}
                placeholder={
                  isAntigravityOnly
                    ? "Chat disabled"
                    : !activeConv
                      ? "Initializing chat..."
                      : "Type a message..."
                }
                style={{
                  flex: 1,
                  background: "var(--ink-950)",
                  color: "white",
                  border: "1px solid var(--parchment-300)",
                  padding: "8px",
                  resize: "none",
                  height: "54px",
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button
                  type="button"
                  disabled={isAntigravityOnly || !inputText || !activeConv}
                  onClick={handleSend}
                  style={{
                    background: "var(--teal-600)",
                    color: "white",
                    border: "none",
                    padding: "8px 16px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Send
                </button>
                <button
                  type="button"
                  disabled={selectedMessageIds.length === 0 || !activeConv}
                  onClick={handleForwardToManager}
                  style={{
                    background: "var(--gold-400)",
                    color: "var(--ink-950)",
                    border: "none",
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: "bold",
                  }}
                >
                  Send to Manager
                </button>
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "var(--parchment-300)", textAlign: "right" }}>
              {inputText.length} / 40,000 characters
            </div>
          </div>
        </div>
      )}

      {tab === "draft" &&
        (state.draft ? (
          <DraftEditor
            draft={state.draft}
            activeRun={activeRun}
            canStart={(() => {
              const blocking: string[] = [];
              if (!projectId) blocking.push("Project must be selected");
              if (!contextSnapshotId) blocking.push("Context snapshot must be valid");
              const hasAuth = providerStatuses.some((p) => p.authenticated);
              if (!hasAuth) blocking.push("At least one provider must be authenticated");
              if (commands.length === 0) {
                blocking.push("Verification commands must be configured");
              }
              return blocking.length === 0 && !activeRun;
            })()}
            blockingReasons={(() => {
              const blocking: string[] = [];
              if (!projectId) blocking.push("Project must be selected");
              if (!contextSnapshotId) blocking.push("Context snapshot must be valid");
              const hasAuth = providerStatuses.some((p) => p.authenticated);
              if (!hasAuth) blocking.push("At least one provider must be authenticated");
              if (commands.length === 0) {
                blocking.push("Verification commands must be configured");
              }
              return blocking;
            })()}
            onSaved={(updated) => dispatch({ type: "draft_loaded", value: updated })}
            onRequestStart={onRequestStart}
          />
        ) : (
          <div style={{ padding: "16px", textAlign: "center", color: "var(--parchment-300)" }}>
            No draft loaded. Select messages in Discussion and click "Send to Manager" to draft a
            task.
          </div>
        ))}

      {tab === "execution" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <Timeline events={timelineEvents} />
        </div>
      )}
    </div>
  );
};
