import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BootstrapProject,
  BootstrapResponse,
  BrowseDirectoriesResponse,
  ContextCandidatesResponse,
  ProjectOnboardingResponse,
  SelectProjectResponse,
} from "../../shared/api.js";
import type {
  CommandSpec,
  ContextSnapshot,
  ProviderStatus,
  RoleProfile,
} from "../../shared/contracts.js";
import { ApiClient } from "../api.js";
import { useAppDispatch } from "../store.js";
import { RoleSettings } from "./RoleSettings.js";

type OnboardingProps = {
  bootstrap: BootstrapResponse;
  api: ApiClient;
  projectId?: string | null;
  onClose?(projectId: string | null): void;
};

type SetupStep = 1 | 2 | 3 | 4;
type Notice = { kind: "working" | "success" | "error" | "warning"; text: string };

const REQUIRED_PROFILE_IDS = [
  "manager",
  "worker-1",
  "worker-2",
  "worker-3",
  "worker-4",
  "advisor",
  "qa",
] as const;

const STEP_DETAILS: Array<{ id: SetupStep; label: string; description: string }> = [
  { id: 1, label: "Repository", description: "Local workspace" },
  { id: 2, label: "LLM Engines", description: "Official CLI probes" },
  { id: 3, label: "Test Suites & Context", description: "Commands and snapshot" },
  { id: 4, label: "Agent Roles", description: "Fixed seven profiles" },
];

function messageFromError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const value = error as { error?: { message?: string }; message?: string };
    return value.error?.message ?? value.message ?? "Request failed";
  }
  return String(error || "Request failed");
}

function isProviderReady(status: ProviderStatus): boolean {
  return status.installed && status.authenticated && status.capabilities.nonInteractive;
}

function repositoryNameFromRemote(remoteUrl: string): string {
  return (
    remoteUrl
      .trim()
      .replace(/\/?$/u, "")
      .split(/[/:]/u)
      .at(-1)
      ?.replace(/\.git$/u, "") ?? ""
  );
}

function buildProfilesFromProbe(statuses: ProviderStatus[]): RoleProfile[] {
  const readProviders = statuses.filter(
    (status) => isProviderReady(status) && status.capabilities.readOnly,
  );
  const writeProviders = statuses.filter(
    (status) => isProviderReady(status) && status.capabilities.worktreeWrite,
  );
  if (readProviders.length === 0 || writeProviders.length === 0) return [];

  const chainFor = (candidates: ProviderStatus[], offset = 0) => {
    const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)].slice(0, 3);
    return rotated.map((status) => ({
      provider: status.provider,
      model: status.models[0] ?? null,
    }));
  };

  const workers: RoleProfile[] = ["worker-1", "worker-2", "worker-3", "worker-4"].map(
    (id, index) => ({
      id: id as RoleProfile["id"],
      role: "worker",
      label: `Worker ${index + 1}`,
      providerChain: chainFor(writeProviders, index % writeProviders.length),
      timeoutMs: 30 * 60 * 1000,
      promptVersion: "worker-v1",
    }),
  );

  return [
    {
      id: "manager",
      role: "manager",
      label: "Manager",
      providerChain: chainFor(readProviders),
      timeoutMs: 15 * 60 * 1000,
      promptVersion: "manager-v1",
    },
    ...workers,
    {
      id: "advisor",
      role: "advisor",
      label: "Advisor",
      providerChain: chainFor(readProviders, Math.max(0, readProviders.length - 1)),
      timeoutMs: 15 * 60 * 1000,
      promptVersion: "advisor-v1",
    },
    {
      id: "qa",
      role: "qa",
      label: "QA",
      providerChain: chainFor(readProviders),
      timeoutMs: 10 * 60 * 1000,
      promptVersion: "qa-v1",
    },
  ];
}

export const Onboarding: React.FC<OnboardingProps> = ({
  bootstrap,
  api,
  projectId: initialId,
  onClose,
}) => {
  const dispatch = useAppDispatch();
  const initialProject =
    bootstrap.projects.find((project) => project.id === initialId) ?? bootstrap.projects[0] ?? null;

  const [step, setStep] = useState<SetupStep>(1);
  const [projectId, setProjectId] = useState<string | null>(
    initialId ?? initialProject?.id ?? null,
  );
  const [repoPath, setRepoPath] = useState(initialProject?.rootPath ?? "");
  const [repositoryMode, setRepositoryMode] = useState<"local" | "clone">("local");
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneParentPath, setCloneParentPath] = useState("");
  const [cloneDirectoryName, setCloneDirectoryName] = useState("");
  const [cloning, setCloning] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<"local" | "clone" | null>(null);
  const [directoryBrowser, setDirectoryBrowser] = useState<BrowseDirectoriesResponse | null>(null);
  const [browsingDirectories, setBrowsingDirectories] = useState(false);
  const [inspection, setInspection] = useState<SelectProjectResponse | null>(null);
  const [projectNotice, setProjectNotice] = useState<Notice | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);

  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>(bootstrap.providers);
  const [providersProbedThisSession, setProvidersProbedThisSession] = useState(false);
  const [probeNotice, setProbeNotice] = useState<Notice | null>(null);
  const [probing, setProbing] = useState(false);
  const [verificationPhrase, setVerificationPhrase] = useState("");
  const [antigravityModel, setAntigravityModel] = useState<string | null>(null);
  const [verifyingAntigravity, setVerifyingAntigravity] = useState(false);

  const [commands, setCommands] = useState<CommandSpec[]>([]);
  const [newCommandId, setNewCommandId] = useState("");
  const [newCommandExecutable, setNewCommandExecutable] = useState("");
  const [newCommandArgs, setNewCommandArgs] = useState("");
  const [contextCandidates, setContextCandidates] = useState<string[]>([]);
  const [excludedContexts, setExcludedContexts] = useState<ContextCandidatesResponse["excluded"]>(
    [],
  );
  const [contextPaths, setContextPaths] = useState<string[]>([]);
  const [contextSearch, setContextSearch] = useState("");
  const [contextSnapshotId, setContextSnapshotId] = useState<string | null>(null);
  const [configurationNotice, setConfigurationNotice] = useState<Notice | null>(null);

  const [profiles, setProfiles] = useState<RoleProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<Notice | null>(null);

  const bootstrapProject = useMemo(
    () => bootstrap.projects.find((project) => project.id === projectId) ?? null,
    [bootstrap.projects, projectId],
  );

  const loadProjectConfiguration = useCallback(
    async (nextProjectId: string, knownProject?: BootstrapProject | null) => {
      setLoadingProject(true);
      setConfigurationNotice({ kind: "working", text: "Loading persisted project setup…" });
      try {
        const onboarding = await api.request<ProjectOnboardingResponse>(
          `/api/projects/${nextProjectId}/onboarding`,
        );
        if (onboarding?.project) {
          setRepoPath(onboarding.project.rootPath);
        } else if (knownProject) {
          setRepoPath(knownProject.rootPath);
        }
        if (Array.isArray(onboarding?.commands)) setCommands(onboarding.commands);
        if (Array.isArray(onboarding?.roles)) setProfiles(onboarding.roles);
        setContextSnapshotId(onboarding?.contextSnapshotId ?? null);

        const candidates = await api.request<ContextCandidatesResponse>(
          `/api/projects/${nextProjectId}/context-candidates`,
        );
        setContextCandidates(Array.isArray(candidates?.candidates) ? candidates.candidates : []);
        setExcludedContexts(Array.isArray(candidates?.excluded) ? candidates.excluded : []);

        if (onboarding?.contextSnapshotId) {
          const snapshot = await api.request<ContextSnapshot>(
            `/api/context-snapshots/${onboarding.contextSnapshotId}`,
          );
          setContextPaths(snapshot.entries.map((entry) => entry.path));
        } else {
          setContextPaths([]);
        }
        setConfigurationNotice({
          kind: "success",
          text: "Persisted commands, role profiles, and context candidates loaded.",
        });
      } catch (error) {
        setConfigurationNotice({ kind: "error", text: messageFromError(error) });
      } finally {
        setLoadingProject(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!projectId) return;
    const project = bootstrap.projects.find((item) => item.id === projectId) ?? null;
    if (project) {
      setRepoPath(project.rootPath);
      setProjectNotice({
        kind: project.setupComplete ? "success" : "warning",
        text: project.setupComplete
          ? "Registered workspace loaded. Existing completed setup is unchanged until saved."
          : "Registered workspace loaded. Verify the live repository before continuing.",
      });
    }
    void loadProjectConfiguration(projectId, project);
  }, [bootstrap.projects, loadProjectConfiguration, projectId]);

  const readProviders = providerStatuses.filter(
    (status) => isProviderReady(status) && status.capabilities.readOnly,
  );
  const writeProviders = providerStatuses.filter(
    (status) => isProviderReady(status) && status.capabilities.worktreeWrite,
  );

  const repositoryComplete = Boolean(projectId && inspection?.clean === true && !loadingProject);
  const providersComplete =
    providersProbedThisSession && readProviders.length > 0 && writeProviders.length > 0;
  const testsComplete = commands.length > 0 && contextPaths.length > 0;
  const rolesComplete =
    profiles.length === REQUIRED_PROFILE_IDS.length &&
    REQUIRED_PROFILE_IDS.every((id) => profiles.some((profile) => profile.id === id)) &&
    profiles.every((profile) => {
      const capability = profile.role === "worker" ? "worktreeWrite" : "readOnly";
      return (
        profile.label.trim().length > 0 &&
        profile.promptVersion.trim().length > 0 &&
        profile.providerChain.length > 0 &&
        profile.providerChain.some((candidate) => {
          const status = providerStatuses.find(
            (provider) => provider.provider === candidate.provider,
          );
          return Boolean(status && isProviderReady(status) && status.capabilities[capability]);
        })
      );
    });
  const allComplete = repositoryComplete && providersComplete && testsComplete && rolesComplete;

  const completedByStep: Record<SetupStep, boolean> = {
    1: repositoryComplete,
    2: providersComplete,
    3: testsComplete,
    4: rolesComplete,
  };

  const canVisitStep = (target: SetupStep): boolean => {
    if (target === 1) return true;
    if (target === 2) return repositoryComplete;
    if (target === 3) return repositoryComplete && providersComplete;
    return repositoryComplete && providersComplete && testsComplete;
  };

  const browseDirectories = async (target: "local" | "clone", path: string | null = null) => {
    setBrowserTarget(target);
    setBrowsingDirectories(true);
    setProjectNotice({ kind: "working", text: "Opening local folders…" });
    try {
      const result = await api.request<BrowseDirectoriesResponse>("/api/filesystem/directories", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      setDirectoryBrowser(result);
      setProjectNotice(null);
    } catch (error) {
      setProjectNotice({ kind: "error", text: messageFromError(error) });
    } finally {
      setBrowsingDirectories(false);
    }
  };

  const acceptProject = async (result: SelectProjectResponse, successText: string) => {
    const normalizedResult = {
      ...result,
      clean: result.clean === true,
      setupComplete: result.setupComplete ?? false,
    } as SelectProjectResponse;
    setInspection(normalizedResult);
    setProjectId(result.id);
    setRepoPath(result.rootPath);
    if (Array.isArray(result.commandCandidates)) setCommands(result.commandCandidates);
    setProjectNotice({
      kind: normalizedResult.clean ? "success" : "error",
      text: normalizedResult.clean
        ? `${successText} Branch: ${result.branch ?? "unknown"}, HEAD: ${result.head ?? "unknown"}`
        : `Workspace has ${result.statusEntries?.length ?? 0} uncommitted status entries. Clean it before setup completion.`,
    });
    await loadProjectConfiguration(result.id, null);
  };

  const verifyRepository = async () => {
    if (!repoPath.trim()) return;
    setProjectNotice({ kind: "working", text: "Inspecting the existing local Git workspace…" });
    try {
      const result = await api.request<SelectProjectResponse>("/api/projects/select", {
        method: "POST",
        body: JSON.stringify({ rootPath: repoPath.trim() }),
      });
      await acceptProject(result, "Repository ready.");
    } catch (error) {
      setInspection(null);
      setProjectNotice({ kind: "error", text: messageFromError(error) });
    }
  };

  const cloneRepository = async () => {
    if (!cloneUrl.trim() || !cloneParentPath.trim() || !cloneDirectoryName.trim()) return;
    setCloning(true);
    setProjectNotice({ kind: "working", text: "Cloning repository…" });
    try {
      const result = await api.request<SelectProjectResponse>("/api/projects/clone", {
        method: "POST",
        body: JSON.stringify({
          remoteUrl: cloneUrl.trim(),
          parentPath: cloneParentPath.trim(),
          directoryName: cloneDirectoryName.trim(),
        }),
      });
      await acceptProject(result, "Repository cloned and ready.");
    } catch (error) {
      setInspection(null);
      setProjectNotice({ kind: "error", text: messageFromError(error) });
    } finally {
      setCloning(false);
    }
  };

  const selectRecentProject = async (project: BootstrapProject) => {
    setInspection(null);
    setProjectId(project.id);
    setRepoPath(project.rootPath);
  };

  const probeProviders = async () => {
    if (!projectId) return;
    setProbing(true);
    setProbeNotice({ kind: "working", text: "Probing official provider CLIs…" });
    try {
      const statuses = await api.request<ProviderStatus[]>(
        `/api/projects/${projectId}/providers/probe`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setProviderStatuses(statuses);
      setProvidersProbedThisSession(true);
      const persisted = await api.request<ProjectOnboardingResponse>(
        `/api/projects/${projectId}/onboarding`,
      );
      setProfiles(
        persisted.roles.length === REQUIRED_PROFILE_IDS.length
          ? persisted.roles
          : buildProfilesFromProbe(statuses),
      );
      const readable = statuses.some(
        (status) => isProviderReady(status) && status.capabilities.readOnly,
      );
      const writable = statuses.some(
        (status) => isProviderReady(status) && status.capabilities.worktreeWrite,
      );
      setProbeNotice({
        kind: readable && writable ? "success" : "error",
        text:
          readable && writable
            ? "Probe complete: consultation and isolated worktree capabilities are available."
            : "Probe complete, but both read-only and worktree-write capabilities are required.",
      });
    } catch (error) {
      setProbeNotice({ kind: "error", text: messageFromError(error) });
    } finally {
      setProbing(false);
    }
  };

  const verifyAntigravity = async () => {
    if (!projectId || verificationPhrase !== "USE SUBSCRIPTION TURN") return;
    setVerifyingAntigravity(true);
    setProbeNotice({
      kind: "working",
      text: "Verifying Antigravity login with the confirmed subscription turn…",
    });
    try {
      const status = await api.request<ProviderStatus>(
        `/api/projects/${projectId}/providers/antigravity/verify-login`,
        {
          method: "POST",
          body: JSON.stringify({
            model: antigravityModel,
            confirmation: "USE SUBSCRIPTION TURN",
          }),
        },
      );
      setProviderStatuses((current) => [
        ...current.filter((provider) => provider.provider !== "antigravity"),
        status,
      ]);
      setVerificationPhrase("");
      setProbeNotice({
        kind: status.authenticated ? "success" : "error",
        text: status.authenticated
          ? "Antigravity login verified."
          : (status.diagnostic ?? "Antigravity login remains unavailable."),
      });
    } catch (error) {
      setProbeNotice({ kind: "error", text: messageFromError(error) });
    } finally {
      setVerifyingAntigravity(false);
    }
  };

  const addCommand = () => {
    const id = newCommandId.trim();
    const executable = newCommandExecutable.trim();
    if (!id || !executable || commands.some((command) => command.id === id)) return;
    setCommands((current) => [
      ...current,
      {
        id,
        label: id,
        executable,
        args: newCommandArgs
          .split("\n")
          .map((argument) => argument.trim())
          .filter(Boolean),
        cwd: ".",
        required: true,
        timeoutMs: 300_000,
      },
    ]);
    setNewCommandId("");
    setNewCommandExecutable("");
    setNewCommandArgs("");
  };

  const toggleContext = (path: string) => {
    setContextPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    );
  };

  const saveOnboarding = async () => {
    if (!projectId || !allComplete) return;
    setSaving(true);
    setSaveNotice({ kind: "working", text: "Persisting setup and validating readiness…" });
    try {
      await api.request(`/api/projects/${projectId}/commands`, {
        method: "PUT",
        body: JSON.stringify({ commands }),
      });
      await api.request(`/api/projects/${projectId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ profiles }),
      });
      const snapshot = await api.request<ContextSnapshot>(
        `/api/projects/${projectId}/context-snapshots`,
        {
          method: "POST",
          body: JSON.stringify({ paths: contextPaths }),
        },
      );
      setContextSnapshotId(snapshot.id);
      await api.request(`/api/projects/${projectId}/setup/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const refreshed = await api.bootstrap();
      dispatch({ type: "bootstrapped", value: refreshed });
      if (!refreshed.activeRun && refreshed.projects[0]?.id !== projectId) {
        dispatch({ type: "project_selected", projectId });
      }
    } catch (error) {
      setSaveNotice({ kind: "error", text: messageFromError(error) });
    } finally {
      setSaving(false);
    }
  };

  const currentAntigravity = providerStatuses.find(
    (provider) => provider.provider === "antigravity",
  );
  const filteredCandidates = contextCandidates.filter((path) =>
    path.toLowerCase().includes(contextSearch.trim().toLowerCase()),
  );
  const canReturnToOffice = Boolean(
    projectId && (bootstrapProject?.setupComplete || inspection?.setupComplete),
  );

  return (
    <div className="setup-screen">
      <section className="setup-dialog" aria-labelledby="setup-title">
        <header className="setup-header">
          <div>
            <p className="eyebrow">Local-first orchestration</p>
            <h1 id="setup-title" className="setup-title">
              Workspace Setup
            </h1>
            <p className="setup-section-copy" style={{ margin: "4px 0 0" }}>
              Persist a repository, probed engines, QA snapshot, and seven role profiles.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`status-chip ${allComplete ? "success" : "warning"}`}>
              <i className="dot" /> {allComplete ? "ready" : "setup required"}
            </span>
            {(onClose || (canReturnToOffice && projectId)) && (
              <button
                type="button"
                className="cozy-button"
                onClick={() =>
                  onClose
                    ? onClose(projectId)
                    : projectId && dispatch({ type: "project_selected", projectId })
                }
              >
                Close Setup
              </button>
            )}
          </div>
        </header>

        <nav className="setup-steps" aria-label="Setup steps">
          {STEP_DETAILS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`setup-step${step === item.id ? " active" : ""}${completedByStep[item.id] ? " complete" : ""}`}
              disabled={!canVisitStep(item.id)}
              onClick={() => setStep(item.id)}
            >
              <span className="setup-step-index">
                {completedByStep[item.id] ? "✓" : `0${item.id}`}
              </span>
              <span className="setup-step-label">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="setup-body">
          {step === 1 && (
            <div>
              <h2 className="setup-section-heading">01. Connect an existing local workspace</h2>
              <p className="setup-section-copy">
                Browse to an existing repository on this machine, select a recent workspace, or
                clone a remote repository into a local folder.
              </p>

              <div className="setup-mode-tabs" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className={`setup-mode-tab${repositoryMode === "local" ? " active" : ""}`}
                  onClick={() => setRepositoryMode("local")}
                >
                  Browse local
                </button>
                <button
                  type="button"
                  className={`setup-mode-tab${repositoryMode === "clone" ? " active" : ""}`}
                  onClick={() => setRepositoryMode("clone")}
                >
                  Clone repository
                </button>
              </div>

              {repositoryMode === "local" && bootstrap.projects.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p className="eyebrow" style={{ marginBottom: 7 }}>
                    Recent projects
                  </p>
                  <div className="setup-grid-2">
                    {bootstrap.projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className={`setup-card${project.id === projectId ? " success" : ""}`}
                        style={{ color: "inherit", cursor: "pointer", textAlign: "left" }}
                        onClick={() => void selectRecentProject(project)}
                      >
                        <strong>{project.name}</strong>
                        <code
                          style={{
                            display: "block",
                            marginTop: 5,
                            color: "var(--parchment-300)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {project.rootPath}
                        </code>
                        <span
                          className={`micro-chip ${project.setupComplete ? "success" : "warning"}`}
                          style={{ marginTop: 8 }}
                        >
                          {project.setupComplete ? "setup complete" : "verification required"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {repositoryMode === "local" ? (
                <div className="setup-card">
                  <div className="cozy-field">
                    <label htmlFor="repo-path">Local repository folder</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                      <input
                        id="repo-path"
                        className="cozy-input"
                        value={repoPath}
                        placeholder="Choose a repository folder"
                        disabled={loadingProject}
                        onChange={(event) => setRepoPath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void verifyRepository();
                        }}
                      />
                      <button
                        type="button"
                        className="cozy-button"
                        disabled={browsingDirectories || loadingProject}
                        onClick={() => void browseDirectories("local")}
                      >
                        Browse…
                      </button>
                      <button
                        type="button"
                        className="cozy-button primary"
                        disabled={!repoPath.trim() || loadingProject}
                        onClick={() => void verifyRepository()}
                      >
                        Use Repository
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="setup-card">
                  <div className="cozy-field">
                    <label htmlFor="clone-url">Remote repository URL</label>
                    <input
                      id="clone-url"
                      className="cozy-input"
                      value={cloneUrl}
                      placeholder="https://github.com/owner/repository.git"
                      disabled={cloning}
                      onChange={(event) => {
                        const nextUrl = event.target.value;
                        setCloneUrl(nextUrl);
                        setCloneDirectoryName(repositoryNameFromRemote(nextUrl));
                      }}
                    />
                  </div>
                  <div className="setup-grid-2" style={{ marginTop: 10 }}>
                    <div className="cozy-field">
                      <label htmlFor="clone-parent">Clone into folder</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                        <input
                          id="clone-parent"
                          className="cozy-input"
                          value={cloneParentPath}
                          placeholder="Choose a parent folder"
                          disabled={cloning}
                          onChange={(event) => setCloneParentPath(event.target.value)}
                        />
                        <button
                          type="button"
                          className="cozy-button"
                          disabled={browsingDirectories || cloning}
                          onClick={() => void browseDirectories("clone")}
                        >
                          Browse…
                        </button>
                      </div>
                    </div>
                    <div className="cozy-field">
                      <label htmlFor="clone-directory">Repository folder name</label>
                      <input
                        id="clone-directory"
                        className="cozy-input"
                        value={cloneDirectoryName}
                        placeholder="repository"
                        disabled={cloning}
                        onChange={(event) => setCloneDirectoryName(event.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cozy-button primary"
                    style={{ marginTop: 10 }}
                    disabled={
                      cloning ||
                      !cloneUrl.trim() ||
                      !cloneParentPath.trim() ||
                      !cloneDirectoryName.trim()
                    }
                    onClick={() => void cloneRepository()}
                  >
                    {cloning ? "Cloning…" : "Clone and Use Repository"}
                  </button>
                </div>
              )}

              {browserTarget && directoryBrowser && (
                <div className="setup-card" style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <code>{directoryBrowser.currentPath}</code>
                    <button
                      type="button"
                      className="cozy-button primary"
                      onClick={() => {
                        if (browserTarget === "local") {
                          setRepoPath(directoryBrowser.currentPath);
                        } else {
                          setCloneParentPath(directoryBrowser.currentPath);
                        }
                        setBrowserTarget(null);
                        setDirectoryBrowser(null);
                      }}
                    >
                      Select This Folder
                    </button>
                  </div>
                  <div className="directory-browser-list" style={{ marginTop: 10 }}>
                    {directoryBrowser.parentPath && (
                      <button
                        type="button"
                        className="context-row"
                        onClick={() =>
                          void browseDirectories(browserTarget, directoryBrowser.parentPath)
                        }
                      >
                        <strong>↑ Parent folder</strong>
                      </button>
                    )}
                    {directoryBrowser.directories.map((directory) => (
                      <button
                        key={directory.path}
                        type="button"
                        className="context-row"
                        onClick={() => void browseDirectories(browserTarget, directory.path)}
                      >
                        <span>▸</span> <code>{directory.name}</code>
                      </button>
                    ))}
                    {directoryBrowser.directories.length === 0 && (
                      <div className="empty-state">No child folders.</div>
                    )}
                  </div>
                </div>
              )}

              {projectNotice && (
                <div className={`inline-message ${projectNotice.kind}`} style={{ marginTop: 10 }}>
                  {projectNotice.text}
                </div>
              )}
              {inspection && (
                <div
                  className={`setup-card ${inspection.clean ? "success" : "warning"}`}
                  style={{ marginTop: 10 }}
                >
                  <div className="setup-grid-2">
                    <div>
                      <span className="field-label">Workspace</span>
                      <br />
                      {inspection.name}
                    </div>
                    <div>
                      <span className="field-label">Branch</span>
                      <br />
                      {inspection.branch}
                    </div>
                    <div>
                      <span className="field-label">HEAD</span>
                      <br />
                      <code>{inspection.head?.slice(0, 12) ?? "unknown"}</code>
                    </div>
                    <div>
                      <span className="field-label">Git status</span>
                      <br />
                      {inspection.clean
                        ? "Clean"
                        : `${inspection.statusEntries?.length ?? 0} entries`}
                    </div>
                  </div>
                  {inspection.rulePaths?.length > 0 && (
                    <div className="skill-list" style={{ marginTop: 10 }}>
                      {inspection.rulePaths.map((path) => (
                        <span key={path} className="skill-chip">
                          {path}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h2 className="setup-section-heading">02. Probe official LLM engine CLIs</h2>
                  <p className="setup-section-copy">
                    Availability and capabilities come from live Codex, Claude, and Antigravity
                    probes. At least one read-only and one worktree-write engine are required.
                  </p>
                </div>
                <button
                  type="button"
                  className="cozy-button primary"
                  disabled={!projectId || probing}
                  onClick={() => void probeProviders()}
                >
                  {probing ? "Probing…" : "Probe official CLIs"}
                </button>
              </div>

              <div className="provider-grid">
                {providerStatuses.map((provider) => {
                  const ready = isProviderReady(provider);
                  return (
                    <article
                      key={provider.provider}
                      className={`provider-card ${ready ? "available" : "unavailable"}`}
                    >
                      <div className="provider-card-head">
                        <h3>{provider.provider}</h3>
                        <span className={`micro-chip ${ready ? "success" : "danger"}`}>
                          <i className="dot" /> {ready ? "linked" : "unavailable"}
                        </span>
                      </div>
                      <div className="skill-list">
                        <span className="micro-chip">{provider.version ?? "version unknown"}</span>
                        {provider.capabilities.nonInteractive && (
                          <span className="micro-chip success">non-interactive</span>
                        )}
                        {provider.capabilities.readOnly && (
                          <span className="micro-chip">read-only</span>
                        )}
                        {provider.capabilities.worktreeWrite && (
                          <span className="micro-chip">worktree write</span>
                        )}
                      </div>
                      <p className="provider-diagnostic">
                        {provider.diagnostic ?? "No diagnostic returned."}
                      </p>
                      <span className="eyebrow">{provider.models.length} discovered models</span>
                      <span style={{ marginTop: "auto", color: "var(--wood-500)", fontSize: 8 }}>
                        Checked {new Date(provider.checkedAt).toLocaleString()}
                      </span>
                    </article>
                  );
                })}
              </div>

              {currentAntigravity?.installed && !currentAntigravity.authenticated && (
                <div className="setup-card warning" style={{ marginTop: 12 }}>
                  <p className="eyebrow">Antigravity login verification</p>
                  <p className="setup-section-copy">
                    This real check consumes one small subscription turn. Type the exact consent
                    phrase <strong>USE SUBSCRIPTION TURN</strong>.
                  </p>
                  <div className="setup-grid-2">
                    <div className="cozy-field">
                      <label htmlFor="antigravity-model">Model used for verification</label>
                      <select
                        id="antigravity-model"
                        className="cozy-input"
                        value={antigravityModel ?? ""}
                        onChange={(event) => setAntigravityModel(event.target.value || null)}
                      >
                        <option value="">Provider default</option>
                        {currentAntigravity.models.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="cozy-field">
                      <label htmlFor="verify-phrase">Verify login · explicit consent</label>
                      <input
                        id="verify-phrase"
                        className="cozy-input"
                        value={verificationPhrase}
                        placeholder="USE SUBSCRIPTION TURN"
                        onChange={(event) => setVerificationPhrase(event.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cozy-button primary"
                    style={{ marginTop: 10 }}
                    disabled={
                      verifyingAntigravity || verificationPhrase !== "USE SUBSCRIPTION TURN"
                    }
                    onClick={() => void verifyAntigravity()}
                  >
                    {verifyingAntigravity ? "Verifying login…" : "Verify Antigravity login"}
                  </button>
                </div>
              )}
              {probeNotice && (
                <div className={`inline-message ${probeNotice.kind}`} style={{ marginTop: 10 }}>
                  {probeNotice.text}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="setup-section-heading">
                03. Verification commands and context snapshot
              </h2>
              <p className="setup-section-copy">
                Commands come from repository inspection or owner edits. Context may only contain
                server-approved tracked candidates; credential-shaped and binary files stay
                excluded.
              </p>
              <div className="setup-grid-2" style={{ alignItems: "start" }}>
                <section className="setup-card">
                  <p className="eyebrow" style={{ marginBottom: 8 }}>
                    Verification commands · {commands.length}
                  </p>
                  <div className="command-list">
                    {commands.map((command) => (
                      <div
                        key={command.id}
                        className="command-row"
                        style={{ alignItems: "flex-start" }}
                      >
                        <input
                          aria-label={`Require ${command.id}`}
                          type="checkbox"
                          checked={command.required}
                          onChange={(event) =>
                            setCommands((current) =>
                              current.map((item) =>
                                item.id === command.id
                                  ? { ...item, required: event.target.checked }
                                  : item,
                              ),
                            )
                          }
                        />
                        <code style={{ flex: 1 }}>
                          <strong>{command.id}</strong>: {command.executable}{" "}
                          {command.args.join(" ")}
                        </code>
                        <input
                          aria-label={`Timeout for ${command.id} in seconds`}
                          type="number"
                          min={1}
                          max={3600}
                          value={Math.round(command.timeoutMs / 1000)}
                          style={{ width: 60, padding: 4 }}
                          onChange={(event) => {
                            const seconds = Math.min(
                              3600,
                              Math.max(1, Number(event.target.value) || 1),
                            );
                            setCommands((current) =>
                              current.map((item) =>
                                item.id === command.id
                                  ? { ...item, timeoutMs: seconds * 1000 }
                                  : item,
                              ),
                            );
                          }}
                        />
                        <button
                          type="button"
                          className="cozy-button danger"
                          onClick={() =>
                            setCommands((current) =>
                              current.filter((item) => item.id !== command.id),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {commands.length === 0 && (
                      <div className="empty-state">No verification commands configured.</div>
                    )}
                  </div>
                  <div className="setup-card" style={{ marginTop: 10 }}>
                    <p className="eyebrow">Add owner command</p>
                    <div className="setup-grid-2">
                      <input
                        className="cozy-input"
                        aria-label="New command ID"
                        placeholder="id"
                        value={newCommandId}
                        onChange={(event) => setNewCommandId(event.target.value)}
                      />
                      <input
                        className="cozy-input"
                        aria-label="New command executable"
                        placeholder="executable"
                        value={newCommandExecutable}
                        onChange={(event) => setNewCommandExecutable(event.target.value)}
                      />
                    </div>
                    <textarea
                      className="cozy-input"
                      aria-label="New command arguments"
                      placeholder="One argument per line"
                      value={newCommandArgs}
                      style={{ minHeight: 58, marginTop: 8, resize: "vertical" }}
                      onChange={(event) => setNewCommandArgs(event.target.value)}
                    />
                    <button
                      type="button"
                      className="cozy-button"
                      style={{ marginTop: 8 }}
                      disabled={
                        !newCommandId.trim() ||
                        !newCommandExecutable.trim() ||
                        commands.some((command) => command.id === newCommandId.trim())
                      }
                      onClick={addCommand}
                    >
                      + Add command
                    </button>
                  </div>
                </section>

                <section className="setup-card">
                  <p className="eyebrow" style={{ marginBottom: 8 }}>
                    Context candidates · {contextPaths.length} selected
                  </p>
                  <input
                    className="cozy-input"
                    aria-label="Filter context candidates"
                    placeholder="Filter tracked files…"
                    value={contextSearch}
                    onChange={(event) => setContextSearch(event.target.value)}
                  />
                  <div
                    className="context-list"
                    style={{ maxHeight: 310, overflow: "auto", marginTop: 8 }}
                  >
                    {filteredCandidates.map((path) => (
                      <label key={path} className="context-row" style={{ cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={contextPaths.includes(path)}
                          onChange={() => toggleContext(path)}
                        />
                        <code>{path}</code>
                      </label>
                    ))}
                    {filteredCandidates.length === 0 && (
                      <div className="empty-state">No approved context candidates match.</div>
                    )}
                  </div>
                  <div className="skill-list" style={{ marginTop: 8 }}>
                    {contextPaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        className="skill-chip custom"
                        onClick={() => toggleContext(path)}
                      >
                        {path} ×
                      </button>
                    ))}
                  </div>
                  <div className="inline-message" style={{ marginTop: 10 }}>
                    {contextSnapshotId
                      ? `Current persisted snapshot: ${contextSnapshotId}`
                      : "A new immutable snapshot will be created when setup is saved."}
                    {excludedContexts.length > 0 &&
                      ` ${excludedContexts.length} unsafe or unsupported files were excluded by the server.`}
                  </div>
                </section>
              </div>
              {configurationNotice && (
                <div
                  className={`inline-message ${configurationNotice.kind}`}
                  style={{ marginTop: 10 }}
                >
                  {configurationNotice.text}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="setup-section-heading">04. Calibrate the fixed seven-role swarm</h2>
              <p className="setup-section-copy">
                Manager, four Workers, Advisor, and QA are contractual roles. Configure their live
                provider fallback chains, model choices, timeouts, and prompt versions.
              </p>
              <RoleSettings
                profiles={profiles}
                providers={providerStatuses}
                onChange={setProfiles}
              />
              {saveNotice && (
                <div className={`inline-message ${saveNotice.kind}`} style={{ marginTop: 10 }}>
                  {saveNotice.text}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="setup-footer">
          <div className="setup-readiness">
            <span className={repositoryComplete ? "status-chip success" : "status-chip warning"}>
              Repository {repositoryComplete ? "✓" : "—"}
            </span>
            <span className={providersComplete ? "status-chip success" : "status-chip warning"}>
              Providers {providersComplete ? "✓" : "—"}
            </span>
            <span className={testsComplete ? "status-chip success" : "status-chip warning"}>
              QA context {testsComplete ? "✓" : "—"}
            </span>
            <span className={rolesComplete ? "status-chip success" : "status-chip warning"}>
              Roles {rolesComplete ? "✓" : "—"}
            </span>
          </div>
          <div className="setup-actions">
            <button
              type="button"
              className="cozy-button"
              disabled={step === 1 || saving}
              onClick={() => setStep((step - 1) as SetupStep)}
            >
              ← Back
            </button>
            {step < 4 ? (
              <button
                type="button"
                className="cozy-button primary"
                disabled={!completedByStep[step] || saving}
                onClick={() => setStep((step + 1) as SetupStep)}
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                className="cozy-button primary"
                disabled={!allComplete || saving}
                onClick={() => void saveOnboarding()}
              >
                {saving ? "Persisting setup…" : "Activate Swarm Office"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
};
