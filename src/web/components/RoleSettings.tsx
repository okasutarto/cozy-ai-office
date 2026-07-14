import React, { useEffect, useMemo, useState } from "react";
import type { ProviderCandidate, ProviderStatus, RoleProfile } from "../../shared/contracts.js";

type RoleSettingsProps = {
  profiles: RoleProfile[];
  providers: ProviderStatus[];
  onChange(profiles: RoleProfile[]): void;
};

const PROFILE_ORDER = [
  "manager",
  "worker-1",
  "worker-2",
  "worker-3",
  "worker-4",
  "advisor",
  "qa",
] as const;

function providerReady(status: ProviderStatus | undefined): boolean {
  return Boolean(status?.installed && status.authenticated && status.capabilities.nonInteractive);
}

function supportsProfile(status: ProviderStatus | undefined, profile: RoleProfile): boolean {
  if (!providerReady(status)) return false;
  return profile.role === "worker"
    ? Boolean(status?.capabilities.worktreeWrite)
    : Boolean(status?.capabilities.readOnly);
}

export const RoleSettings: React.FC<RoleSettingsProps> = ({ profiles, providers, onChange }) => {
  const [selectedId, setSelectedId] = useState<string>(profiles[0]?.id ?? "manager");

  const orderedProfiles = useMemo(() => {
    return [...profiles].sort(
      (left, right) => PROFILE_ORDER.indexOf(left.id) - PROFILE_ORDER.indexOf(right.id),
    );
  }, [profiles]);

  useEffect(() => {
    if (!profiles.some((profile) => profile.id === selectedId)) {
      setSelectedId(profiles[0]?.id ?? "manager");
    }
  }, [profiles, selectedId]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? null;

  const updateProfile = (profileId: string, patch: Partial<RoleProfile>) => {
    onChange(
      profiles.map((profile) =>
        profile.id === profileId ? ({ ...profile, ...patch } as RoleProfile) : profile,
      ),
    );
  };

  const updateChain = (
    profile: RoleProfile,
    chainIndex: number,
    patch: Partial<ProviderCandidate>,
  ) => {
    const providerChain = profile.providerChain.map((candidate, index) =>
      index === chainIndex ? ({ ...candidate, ...patch } as ProviderCandidate) : candidate,
    );
    updateProfile(profile.id, { providerChain });
  };

  const addFallback = (profile: RoleProfile) => {
    const configured = new Set(profile.providerChain.map((candidate) => candidate.provider));
    const candidate = providers.find(
      (status) => supportsProfile(status, profile) && !configured.has(status.provider),
    );
    if (!candidate || profile.providerChain.length >= 3) return;
    updateProfile(profile.id, {
      providerChain: [
        ...profile.providerChain,
        { provider: candidate.provider, model: candidate.models[0] ?? null },
      ],
    });
  };

  const removeFallback = (profile: RoleProfile, chainIndex: number) => {
    if (profile.providerChain.length <= 1) return;
    updateProfile(profile.id, {
      providerChain: profile.providerChain.filter((_, index) => index !== chainIndex),
    });
  };

  if (!selectedProfile) {
    return (
      <div className="setup-card warning">
        <strong>Seven role profiles are required.</strong>
        <p className="setup-section-copy" style={{ marginBottom: 0 }}>
          Check compatible AI tools, then return here to configure Manager, four Workers, Tech Lead,
          and QA.
        </p>
      </div>
    );
  }

  const configuredProviders = new Set(
    selectedProfile.providerChain.map((candidate) => candidate.provider),
  );
  const hasFallbackCandidate = providers.some(
    (status) =>
      supportsProfile(status, selectedProfile) && !configuredProviders.has(status.provider),
  );

  return (
    <div className="roles-layout">
      <div className="role-directory" aria-label="Fixed swarm role directory">
        <p className="eyebrow">Fixed swarm directory · {profiles.length}/7</p>
        {orderedProfiles.map((profile) => {
          const primaryStatus = providers.find(
            (status) => status.provider === profile.providerChain[0]?.provider,
          );
          const valid = profile.providerChain.some((candidate) =>
            supportsProfile(
              providers.find((status) => status.provider === candidate.provider),
              profile,
            ),
          );
          return (
            <button
              key={profile.id}
              type="button"
              className={`role-directory-item${selectedId === profile.id ? " active" : ""}`}
              onClick={() => setSelectedId(profile.id)}
            >
              <span>
                <strong>
                  {profile.label} ({profile.role})
                </strong>
                <small style={{ display: "block", marginTop: 3, color: "var(--wood-500)" }}>
                  {profile.id} · {primaryStatus?.provider ?? "unassigned"}
                </small>
              </span>
              <span className={`micro-chip ${valid ? "success" : "danger"}`}>
                <i className="dot" /> {valid ? "ready" : "blocked"}
              </span>
            </button>
          );
        })}
      </div>

      <section className="role-editor setup-card" aria-label={`${selectedProfile.label} profile`}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <p className="eyebrow">Agent profile</p>
            <h3 className="setup-section-heading">
              {selectedProfile.label} · {selectedProfile.id}
            </h3>
          </div>
          <span className="status-chip">{selectedProfile.role}</span>
        </div>

        <div className="setup-grid-2" style={{ marginBottom: 14 }}>
          <div className="cozy-field">
            <label htmlFor={`label-${selectedProfile.id}`}>Display label</label>
            <input
              id={`label-${selectedProfile.id}`}
              className="cozy-input"
              value={selectedProfile.label}
              maxLength={40}
              onChange={(event) => updateProfile(selectedProfile.id, { label: event.target.value })}
            />
          </div>
          <div className="cozy-field">
            <label htmlFor={`timeout-${selectedProfile.id}`}>Timeout (seconds)</label>
            <input
              id={`timeout-${selectedProfile.id}`}
              className="cozy-input"
              type="number"
              min={10}
              max={3600}
              value={Math.round(selectedProfile.timeoutMs / 1000)}
              onChange={(event) => {
                const seconds = Math.min(3600, Math.max(10, Number(event.target.value) || 10));
                updateProfile(selectedProfile.id, { timeoutMs: seconds * 1000 });
              }}
            />
          </div>
          <div className="cozy-field">
            <label htmlFor={`prompt-${selectedProfile.id}`}>Prompt version</label>
            <input
              id={`prompt-${selectedProfile.id}`}
              className="cozy-input"
              value={selectedProfile.promptVersion}
              maxLength={40}
              onChange={(event) =>
                updateProfile(selectedProfile.id, { promptVersion: event.target.value })
              }
            />
          </div>
          <div className="cozy-field">
            <label>Required capability</label>
            <div className="cozy-input" style={{ display: "flex", alignItems: "center" }}>
              {selectedProfile.role === "worker" ? "Can edit files" : "Can review"}
            </div>
          </div>
        </div>

        <p className="eyebrow" style={{ marginBottom: 8 }}>
          AI tool order · first ready tool wins
        </p>
        <div className="command-list">
          {selectedProfile.providerChain.map((candidate, chainIndex) => {
            const status = providers.find((item) => item.provider === candidate.provider);
            const valid = supportsProfile(status, selectedProfile);
            const models = status?.models ?? [];
            return (
              <div key={`${candidate.provider}-${chainIndex}`} className="setup-card">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "30px minmax(130px, .8fr) minmax(150px, 1fr) auto",
                    alignItems: "end",
                    gap: 8,
                  }}
                >
                  <span className="setup-step-index">{chainIndex + 1}</span>
                  <div className="cozy-field">
                    <label htmlFor={`provider-${selectedProfile.id}-${chainIndex}`}>AI tool</label>
                    <select
                      id={`provider-${selectedProfile.id}-${chainIndex}`}
                      className="cozy-input"
                      aria-label={`AI tool for chain item ${chainIndex + 1}`}
                      value={candidate.provider}
                      onChange={(event) => {
                        const nextStatus = providers.find(
                          (item) => item.provider === event.target.value,
                        );
                        updateChain(selectedProfile, chainIndex, {
                          provider: event.target.value as ProviderCandidate["provider"],
                          model: (nextStatus?.models ?? [])[0] ?? null,
                        });
                      }}
                    >
                      {providers.map((provider) => (
                        <option key={provider.provider} value={provider.provider}>
                          {provider.provider}
                          {providerReady(provider) ? "" : " · unavailable"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cozy-field">
                    <label htmlFor={`model-${selectedProfile.id}-${chainIndex}`}>Model</label>
                    <select
                      id={`model-${selectedProfile.id}-${chainIndex}`}
                      className="cozy-input"
                      aria-label={`Model for chain item ${chainIndex + 1}`}
                      value={candidate.model ?? ""}
                      onChange={(event) =>
                        updateChain(selectedProfile, chainIndex, {
                          model: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Tool default</option>
                      {candidate.model && !models.includes(candidate.model) && (
                        <option value={candidate.model}>{candidate.model}</option>
                      )}
                      {models.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="cozy-button danger"
                    disabled={selectedProfile.providerChain.length <= 1}
                    onClick={() => removeFallback(selectedProfile, chainIndex)}
                  >
                    Remove
                  </button>
                </div>
                <div className="skill-list" style={{ marginTop: 8 }}>
                  <span className={`micro-chip ${valid ? "success" : "danger"}`}>
                    <i className="dot" /> {valid ? "ready" : "not available"}
                  </span>
                  {status?.capabilities.nonInteractive && (
                    <span className="micro-chip success">background ready</span>
                  )}
                  {status?.capabilities.readOnly && <span className="micro-chip">can review</span>}
                  {status?.capabilities.worktreeWrite && (
                    <span className="micro-chip">can edit files</span>
                  )}
                  {status?.version && <span className="micro-chip">v{status.version}</span>}
                </div>
                {status?.diagnostic && (
                  <p className="provider-diagnostic" style={{ minHeight: 0, marginTop: 7 }}>
                    {status.diagnostic}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="cozy-button"
          style={{ marginTop: 10 }}
          disabled={selectedProfile.providerChain.length >= 3 || !hasFallbackCandidate}
          onClick={() => addFallback(selectedProfile)}
        >
          + Add compatible fallback
        </button>
      </section>
    </div>
  );
};
