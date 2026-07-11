import React from "react";
import type { RoleProfile, ProviderStatus } from "../../shared/contracts.js";

type RoleSettingsProps = {
  profiles: RoleProfile[];
  providers: ProviderStatus[];
  onChange(profiles: RoleProfile[]): void;
};

export const RoleSettings: React.FC<RoleSettingsProps> = ({ profiles, providers, onChange }) => {
  const updateProfile = (index: number, patch: Partial<RoleProfile>) => {
    const next = [...profiles];
    next[index] = { ...next[index], ...patch } as RoleProfile;
    onChange(next);
  };

  const updateChain = (
    profileIndex: number,
    chainIndex: number,
    patch: Partial<RoleProfile["providerChain"][0]>,
  ) => {
    const profile = profiles[profileIndex]!;
    const chain = [...profile.providerChain];
    chain[chainIndex] = { ...chain[chainIndex]!, ...patch } as any;
    updateProfile(profileIndex, { providerChain: chain });
  };

  const addChainItem = (profileIndex: number) => {
    const profile = profiles[profileIndex]!;
    const chain = [...profile.providerChain, { provider: "codex" as const, model: null }];
    updateProfile(profileIndex, { providerChain: chain });
  };

  const removeChainItem = (profileIndex: number, chainIndex: number) => {
    const profile = profiles[profileIndex]!;
    const chain = profile.providerChain.filter((_, idx) => idx !== chainIndex);
    updateProfile(profileIndex, { providerChain: chain });
  };

  return (
    <div className="role-settings-container" style={{ padding: "16px", overflowY: "auto" }}>
      <h2 style={{ color: "var(--gold-400)", marginBottom: "16px" }}>Role Configuration</h2>
      <div style={{ display: "grid", gap: "24px" }}>
        {profiles.map((profile, profileIdx) => {
          const isManagerOrAdvisorOrQa = ["manager", "advisor", "qa"].includes(profile.role);

          return (
            <div
              key={profile.id}
              className="role-card"
              style={{
                border: "var(--pixel-border)",
                background: "var(--ink-800)",
                padding: "16px",
                borderRadius: "4px",
              }}
            >
              <h3 style={{ margin: "0 0 12px 0", color: "var(--parchment-100)" }}>
                {profile.label} ({profile.role})
              </h3>

              <div style={{ display: "grid", gap: "12px" }}>
                <div>
                  <label htmlFor={`timeout-${profile.id}`} style={{ marginRight: "8px" }}>
                    Timeout (ms):
                  </label>
                  <input
                    id={`timeout-${profile.id}`}
                    type="number"
                    value={profile.timeoutMs}
                    onChange={(e) =>
                      updateProfile(profileIdx, { timeoutMs: Number(e.target.value) })
                    }
                    style={{
                      background: "var(--ink-950)",
                      color: "var(--parchment-100)",
                      border: "1px solid var(--parchment-300)",
                      padding: "4px 8px",
                      borderRadius: "2px",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                  <strong>Fallback Chain:</strong>
                  {profile.providerChain.map((chainItem, chainIdx) => {
                    const status = providers.find((p) => p.provider === chainItem.provider);
                    const capabilities = status?.capabilities;

                    // Manager/Advisor/QA requires readOnly support
                    const isReadOnlyMissing =
                      isManagerOrAdvisorOrQa && capabilities && !capabilities.readOnly;

                    return (
                      <div
                        key={chainIdx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          flexWrap: "wrap",
                          background: "var(--ink-950)",
                          padding: "8px",
                          borderRadius: "2px",
                        }}
                      >
                        <span style={{ color: "var(--gold-400)" }}>#{chainIdx + 1}</span>

                        <select
                          aria-label={`Provider for chain item ${chainIdx + 1}`}
                          value={chainItem.provider}
                          onChange={(e) =>
                            updateChain(profileIdx, chainIdx, { provider: e.target.value as any })
                          }
                          style={{
                            background: "var(--ink-800)",
                            color: "var(--parchment-100)",
                            border: "1px solid var(--parchment-300)",
                            padding: "4px",
                          }}
                        >
                          {providers.map((p) => (
                            <option key={p.provider} value={p.provider}>
                              {p.provider}
                            </option>
                          ))}
                        </select>

                        <input
                          aria-label={`Model for chain item ${chainIdx + 1}`}
                          type="text"
                          placeholder="Default Model"
                          value={chainItem.model || ""}
                          onChange={(e) =>
                            updateChain(profileIdx, chainIdx, { model: e.target.value || null })
                          }
                          style={{
                            background: "var(--ink-800)",
                            color: "var(--parchment-100)",
                            border: "1px solid var(--parchment-300)",
                            padding: "4px 8px",
                            flex: 1,
                          }}
                        />

                        {/* Capabilities Diagnostic Chips */}
                        <div style={{ display: "flex", gap: "6px" }}>
                          {capabilities?.readOnly && (
                            <span
                              style={{
                                background: "var(--moss-600)",
                                fontSize: "11px",
                                padding: "2px 6px",
                              }}
                            >
                              read
                            </span>
                          )}
                          {capabilities?.worktreeWrite && (
                            <span
                              style={{
                                background: "var(--teal-600)",
                                fontSize: "11px",
                                padding: "2px 6px",
                              }}
                            >
                              write
                            </span>
                          )}
                          {isReadOnlyMissing && (
                            <span
                              style={{
                                color: "var(--danger-500)",
                                fontSize: "11px",
                                border: "1px solid var(--danger-500)",
                                padding: "2px 6px",
                              }}
                            >
                              Missing read-only capability! Disabled.
                            </span>
                          )}
                        </div>

                        {profile.providerChain.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeChainItem(profileIdx, chainIdx)}
                            style={{
                              background: "var(--rose-500)",
                              color: "var(--parchment-100)",
                              border: "none",
                              padding: "4px 8px",
                              cursor: "pointer",
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => addChainItem(profileIdx)}
                    style={{
                      background: "var(--teal-600)",
                      color: "var(--parchment-100)",
                      border: "none",
                      padding: "6px 12px",
                      cursor: "pointer",
                      width: "max-content",
                    }}
                  >
                    Add Fallback Provider
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
