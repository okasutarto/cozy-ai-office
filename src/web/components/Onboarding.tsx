import React, { useState } from "react";
import type { BootstrapResponse, ConversationRecord } from "../../shared/api.js";
import type { ProviderStatus, RoleProfile } from "../../shared/contracts.js";
import { RoleSettings } from "./RoleSettings.js";
import { ApiClient } from "../api.js";
import { useAppDispatch } from "../store.js";

type OnboardingProps = {
  bootstrap: BootstrapResponse;
  api: ApiClient;
};

export const Onboarding: React.FC<OnboardingProps> = ({ bootstrap, api }) => {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Repository Path
  const [repoPath, setRepoPath] = useState("");
  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Step 2: Providers & Verification
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>(bootstrap.providers);
  const [verificationPhrase, setVerificationPhrase] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);

  // Step 3: Context and Commands
  const [contextPaths, setContextPaths] = useState<string[]>([]);
  const [commands, setCommands] = useState<
    Array<{ id: string; executable: string; args: string[]; required: boolean }>
  >([
    { id: "test", executable: "npm", args: ["test"], required: true },
    { id: "typecheck", executable: "npm", args: ["run", "typecheck"], required: true },
  ]);
  const [newCommandId, setNewCommandId] = useState("");
  const [newCommandExec, setNewCommandExec] = useState("");
  const [newCommandArgs, setNewCommandArgs] = useState("");

  // Step 4: Role Profiles Setup
  const [profiles, setProfiles] = useState<RoleProfile[]>(() => {
    // Generate exactly 7 default profiles
    const defaultWorkers: RoleProfile[] = ["worker-1", "worker-2", "worker-3", "worker-4"].map(
      (id) => ({
        id: id as any,
        role: "worker",
        label: id,
        providerChain: [{ provider: "codex", model: null }],
        timeoutMs: 60_000,
        promptVersion: "v1",
      }),
    );

    const defaultManager: RoleProfile = {
      id: "manager" as any,
      role: "manager",
      label: "Manager",
      providerChain: [{ provider: "claude", model: null }],
      timeoutMs: 120_000,
      promptVersion: "v1",
    };

    const defaultAdvisor: RoleProfile = {
      id: "advisor" as any,
      role: "advisor",
      label: "Advisor",
      providerChain: [{ provider: "claude", model: null }],
      timeoutMs: 60_000,
      promptVersion: "v1",
    };

    const defaultQa: RoleProfile = {
      id: "qa" as any,
      role: "qa",
      label: "QA",
      providerChain: [{ provider: "claude", model: null }],
      timeoutMs: 60_000,
      promptVersion: "v1",
    };

    return [defaultManager, ...defaultWorkers, defaultAdvisor, defaultQa];
  });

  // Action methods
  const verifyRepository = async () => {
    try {
      setProjectStatus("Verifying...");
      const result = await api.request<any>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ rootPath: repoPath }),
      });
      setProjectId(result.id);
      setProjectStatus(
        `Clean root. Branch: ${result.branch ?? "main"}, HEAD: ${result.head ?? "n/a"}`,
      );
    } catch (err: any) {
      setProjectStatus(`Error: ${err.message || "Failed to verify repository"}`);
    }
  };

  const verifyAntigravity = async () => {
    if (verificationPhrase !== "verify login") {
      setVerificationStatus("Exact confirmation phrase required: 'verify login'");
      return;
    }
    try {
      setVerificationStatus("Verifying Antigravity login...");
      await api.request("/api/providers/antigravity/verify", { method: "POST" });
      setVerificationStatus("Antigravity Login Verified!");
      // Reload provider statuses
      const updatedBootstrap = await api.bootstrap();
      setProviderStatuses(updatedBootstrap.providers);
    } catch (err: any) {
      setVerificationStatus(`Verification Failed: ${err.message || err}`);
    }
  };

  const addCommand = () => {
    if (!newCommandId || !newCommandExec) return;
    setCommands([
      ...commands,
      {
        id: newCommandId,
        executable: newCommandExec,
        args: newCommandArgs ? newCommandArgs.split(" ") : [],
        required: true,
      },
    ]);
    setNewCommandId("");
    setNewCommandExec("");
    setNewCommandArgs("");
  };

  const saveOnboarding = async () => {
    if (!projectId) {
      alert("Please verify repository path first.");
      return;
    }

    try {
      // 1. Save commands
      await api.request(`/api/projects/${projectId}/commands`, {
        method: "PUT",
        body: JSON.stringify({ commands }),
      });

      // 2. Save role profiles
      await api.request(`/api/projects/${projectId}/profiles`, {
        method: "PUT",
        body: JSON.stringify({ profiles }),
      });

      // 3. Create context snapshot
      const snapshotResult = await api.request<any>(`/api/projects/${projectId}/snapshots`, {
        method: "POST",
        body: JSON.stringify({ paths: contextPaths.length > 0 ? contextPaths : ["package.json"] }),
      });

      // 4. Onboarding complete -> transition back to office phase
      dispatch({ type: "project_selected", projectId });
    } catch (err: any) {
      alert(`Failed to save configuration: ${err.message || err}`);
    }
  };

  return (
    <div
      className="onboarding-wizard"
      style={{
        width: "600px",
        margin: "80px auto",
        padding: "24px",
        border: "var(--pixel-border)",
        background: "var(--ink-800)",
        borderRadius: "4px",
      }}
    >
      <h1 style={{ color: "var(--gold-400)", textAlign: "center", marginBottom: "20px" }}>
        Cozy AI Office Onboarding
      </h1>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
        {[1, 2, 3, 4].map((s) => (
          <span
            key={s}
            style={{
              fontWeight: step === s ? "bold" : "normal",
              color: step === s ? "var(--focus)" : "var(--parchment-300)",
            }}
          >
            Step {s}: {s === 1 ? "Repo" : s === 2 ? "Providers" : s === 3 ? "Commands" : "Roles"}
          </span>
        ))}
      </div>

      {step === 1 && (
        <div style={{ display: "grid", gap: "12px" }}>
          <h3>Step 1: Setup Repository</h3>
          <label htmlFor="repo-path">Repository Absolute Path:</label>
          <input
            id="repo-path"
            type="text"
            placeholder="C:/projects/my-cozy-app"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            style={{
              background: "var(--ink-950)",
              color: "var(--parchment-100)",
              border: "1px solid var(--parchment-300)",
              padding: "8px",
            }}
          />
          <button
            type="button"
            onClick={verifyRepository}
            style={{
              background: "var(--teal-600)",
              color: "var(--parchment-100)",
              border: "none",
              padding: "10px",
              cursor: "pointer",
            }}
          >
            Verify Repository Path
          </button>
          {projectStatus && (
            <div style={{ color: "var(--gold-400)", marginTop: "8px" }}>{projectStatus}</div>
          )}
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "grid", gap: "16px" }}>
          <h3>Step 2: Provider Diagnostics</h3>
          <div style={{ display: "grid", gap: "12px" }}>
            {providerStatuses.map((provider) => (
              <div
                key={provider.provider}
                style={{
                  border: "1px solid var(--parchment-300)",
                  padding: "8px",
                  background: "var(--ink-950)",
                }}
              >
                <strong>{provider.provider}</strong>
                <div style={{ fontSize: "12px", color: "var(--parchment-300)" }}>
                  Status: {provider.installed ? "Installed" : "Not Installed"} |{" "}
                  {provider.authenticated ? "Authenticated" : "Not Authenticated"}
                </div>
                {provider.provider === "antigravity" && !provider.authenticated && (
                  <div style={{ marginTop: "8px" }}>
                    <label htmlFor="verify-phrase">Verify login (uses 1 small sub turn):</label>
                    <input
                      id="verify-phrase"
                      type="text"
                      placeholder="type 'verify login'"
                      value={verificationPhrase}
                      onChange={(e) => setVerificationPhrase(e.target.value)}
                      style={{
                        background: "var(--ink-800)",
                        color: "var(--parchment-100)",
                        border: "1px solid var(--parchment-300)",
                        padding: "4px",
                        marginRight: "8px",
                      }}
                    />
                    <button
                      type="button"
                      onClick={verifyAntigravity}
                      style={{
                        background: "var(--teal-600)",
                        color: "var(--parchment-100)",
                        border: "none",
                        padding: "6px",
                      }}
                    >
                      Verify
                    </button>
                    {verificationStatus && (
                      <div style={{ color: "var(--gold-400)" }}>{verificationStatus}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "grid", gap: "12px" }}>
          <h3>Step 3: Verification Commands</h3>
          <div style={{ border: "1px solid var(--parchment-300)", padding: "8px" }}>
            {commands.map((cmd) => (
              <div key={cmd.id} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {cmd.id}: {cmd.executable} {cmd.args.join(" ")}
                </span>
                <button
                  type="button"
                  onClick={() => setCommands(commands.filter((c) => c.id !== cmd.id))}
                  style={{ background: "var(--rose-500)", border: "none", color: "white" }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <h4>Add Command Candidate:</h4>
            <input
              aria-label="New command ID"
              type="text"
              placeholder="id (e.g. format)"
              value={newCommandId}
              onChange={(e) => setNewCommandId(e.target.value)}
              style={{ background: "var(--ink-950)", color: "white", padding: "6px" }}
            />
            <input
              aria-label="New command executable"
              type="text"
              placeholder="executable (e.g. prettier)"
              value={newCommandExec}
              onChange={(e) => setNewCommandExec(e.target.value)}
              style={{ background: "var(--ink-950)", color: "white", padding: "6px" }}
            />
            <input
              aria-label="New command arguments"
              type="text"
              placeholder="args (space separated)"
              value={newCommandArgs}
              onChange={(e) => setNewCommandArgs(e.target.value)}
              style={{ background: "var(--ink-950)", color: "white", padding: "6px" }}
            />
            <button
              type="button"
              onClick={addCommand}
              style={{
                background: "var(--teal-600)",
                color: "white",
                border: "none",
                padding: "6px",
              }}
            >
              Add Command
            </button>
          </div>

          <h3>Context Files</h3>
          <input
            aria-label="Context file path"
            type="text"
            placeholder="package.json"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const target = e.currentTarget;
                if (target.value && !contextPaths.includes(target.value)) {
                  setContextPaths([...contextPaths, target.value]);
                  target.value = "";
                }
              }
            }}
            style={{ background: "var(--ink-950)", color: "white", padding: "6px" }}
          />
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
            {contextPaths.map((p) => (
              <span
                key={p}
                onClick={() => setContextPaths(contextPaths.filter((cp) => cp !== p))}
                style={{
                  background: "var(--ink-950)",
                  border: "1px solid var(--parchment-300)",
                  padding: "2px 6px",
                  cursor: "pointer",
                }}
              >
                {p} ✕
              </span>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={{ display: "grid", gap: "12px" }}>
          <h3>Step 4: Role Setup</h3>
          <RoleSettings profiles={profiles} providers={providerStatuses} onChange={setProfiles} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px" }}>
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep((s) => (s - 1) as any)}
          style={{
            background: "var(--ink-950)",
            color: "var(--parchment-100)",
            border: "1px solid var(--parchment-300)",
            padding: "8px 16px",
            cursor: step === 1 ? "not-allowed" : "pointer",
          }}
        >
          Previous
        </button>

        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as any)}
            style={{
              background: "var(--teal-600)",
              color: "var(--parchment-100)",
              border: "none",
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={saveOnboarding}
            style={{
              background: "var(--gold-400)",
              color: "var(--ink-950)",
              border: "none",
              padding: "8px 16px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Complete Onboarding
          </button>
        )}
      </div>
    </div>
  );
};
