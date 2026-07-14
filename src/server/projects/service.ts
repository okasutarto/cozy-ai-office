import type { ProjectStore } from "../db/project-store.js";
import type { RepositoryService, RepositoryInspection } from "../git/repository.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { CommandSpec, RoleProfile, ProviderStatus } from "../../shared/contracts.js";
import type { CompleteProjectSetupResponse } from "../../shared/api.js";
import { AppError } from "../errors.js";
import { randomUUID } from "node:crypto";
import { evaluateSetupReadiness } from "./setup.js";

function usableProviders(
  statuses: ProviderStatus[],
  capability: "readOnly" | "worktreeWrite",
): ProviderStatus[] {
  return statuses.filter(
    (status) =>
      status.installed &&
      status.authenticated &&
      status.capabilities.nonInteractive &&
      status.capabilities[capability],
  );
}

function providerDiagnostic(statuses: ProviderStatus[]): string | null {
  if (usableProviders(statuses, "readOnly").length === 0) {
    return "No compatible read-only provider is authenticated. Manager, Tech Lead, and QA roles cannot be assigned.";
  }
  if (usableProviders(statuses, "worktreeWrite").length === 0) {
    return "No compatible write provider is authenticated. Worker roles cannot be assigned.";
  }
  return null;
}

function buildDefaultProfiles(statuses: ProviderStatus[]): RoleProfile[] {
  const readOnlyProviders = usableProviders(statuses, "readOnly").sort((a, b) => {
    const stableOrder = ["codex", "claude"];
    return stableOrder.indexOf(a.provider) - stableOrder.indexOf(b.provider);
  });
  const writeProviders = usableProviders(statuses, "worktreeWrite").sort((a, b) => {
    const stableOrder = ["codex", "claude", "antigravity"];
    return stableOrder.indexOf(a.provider) - stableOrder.indexOf(b.provider);
  });
  if (readOnlyProviders.length === 0 || writeProviders.length === 0) return [];

  const managerProvider = readOnlyProviders[0]!;
  const advisorProvider = readOnlyProviders[readOnlyProviders.length - 1]!;
  const profiles: RoleProfile[] = [
    {
      id: "manager",
      role: "manager",
      label: "Manager",
      providerChain: [
        { provider: managerProvider.provider, model: managerProvider.models[0] || null },
      ],
      timeoutMs: 15 * 60 * 1000,
      promptVersion: "manager-v1",
    },
    {
      id: "advisor",
      role: "advisor",
      label: "Tech Lead",
      providerChain: [
        { provider: advisorProvider.provider, model: advisorProvider.models[0] || null },
      ],
      timeoutMs: 15 * 60 * 1000,
      promptVersion: "advisor-v1",
    },
    {
      id: "qa",
      role: "qa",
      label: "QA",
      providerChain: [
        { provider: managerProvider.provider, model: managerProvider.models[0] || null },
      ],
      timeoutMs: 10 * 60 * 1000,
      promptVersion: "qa-v1",
    },
  ];

  (["worker-1", "worker-2", "worker-3", "worker-4"] as const).forEach((id, index) => {
    const primaryProvider = writeProviders[index % writeProviders.length]!;
    const alternatives = writeProviders
      .filter((status) => status.provider !== primaryProvider.provider)
      .map((status) => ({ provider: status.provider, model: status.models[0] || null }));
    profiles.push({
      id,
      role: "worker",
      label: `Worker ${index + 1}`,
      providerChain: [
        { provider: primaryProvider.provider, model: primaryProvider.models[0] || null },
        ...alternatives,
      ].slice(0, 3),
      timeoutMs: 30 * 60 * 1000,
      promptVersion: "worker-v1",
    });
  });
  return profiles;
}

export class ProjectService {
  constructor(
    public readonly store: ProjectStore,
    public readonly repositories: RepositoryService,
    public readonly providers: ProviderRegistry,
  ) {}

  async selectProject(
    rootPath: string,
    signal: AbortSignal,
  ): Promise<
    RepositoryInspection & { id: string; setupComplete: boolean; diagnostic: string | null }
  > {
    const inspection = await this.repositories.inspect(rootPath, signal);

    let project = this.store.getProjectByPath(inspection.rootPath);
    const isNewProject = project === null;
    if (!project) {
      project = {
        id: randomUUID(),
        name: inspection.name,
        rootPath: inspection.rootPath,
        setupComplete: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.store.upsertProject(project);
    } else {
      project.updatedAt = new Date().toISOString();
      this.store.upsertProject(project);
    }

    if (isNewProject || this.store.listCommands(project.id).length === 0) {
      this.store.replaceCommands(project.id, inspection.commandCandidates);
    }

    const allStatuses = this.store.listProviderStatuses();
    const diagnostic = providerDiagnostic(allStatuses);
    if (!diagnostic && this.store.listRoleProfiles(project.id).length === 0) {
      this.store.replaceRoleProfiles(project.id, buildDefaultProfiles(allStatuses));
    }

    return {
      ...inspection,
      id: project.id,
      setupComplete: project.setupComplete,
      diagnostic,
    };
  }

  async cloneProject(
    remoteUrl: string,
    parentPath: string,
    directoryName: string,
    signal: AbortSignal,
  ): ReturnType<ProjectService["selectProject"]> {
    const inspection = await this.repositories.clone(remoteUrl, parentPath, directoryName, signal);
    return this.selectProject(inspection.rootPath, signal);
  }

  async probeProviders(projectId: string, signal: AbortSignal): Promise<ProviderStatus[]> {
    const project = this.store.getProject(projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);
    const supervisor = (this.providers as any).supervisor;
    const tempDir = (this.providers as any).tempDir || process.cwd();
    if (!supervisor) {
      throw new Error("ProviderRegistry supervisor not configured for probing");
    }
    await this.providers.probeAll(
      {
        supervisor,
        projectStore: this.store,
        cwd: tempDir,
      },
      signal,
    );

    const statuses = this.providers.list().map((adapter) => this.providers.statusFor(adapter.id));
    if (!providerDiagnostic(statuses) && this.store.listRoleProfiles(projectId).length === 0) {
      this.store.replaceRoleProfiles(projectId, buildDefaultProfiles(statuses));
    }
    return statuses;
  }

  async verifyAntigravityLogin(model: string | null, signal: AbortSignal): Promise<ProviderStatus> {
    return this.providers.verifyAntigravityLogin(model, signal);
  }

  saveCommands(projectId: string, commands: CommandSpec[]): void {
    const project = this.store.getProject(projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);
    this.store.replaceCommands(projectId, commands);
  }

  saveRoleProfiles(projectId: string, profiles: RoleProfile[]): void {
    const project = this.store.getProject(projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);
    this.store.replaceRoleProfiles(projectId, profiles);
  }

  async completeSetup(
    projectId: string,
    signal: AbortSignal,
  ): Promise<CompleteProjectSetupResponse> {
    const project = this.store.getProject(projectId);
    if (!project) throw new AppError("project_not_found", "Project not found", 404);

    const inspection = await this.repositories.inspect(project.rootPath, signal);
    if (!inspection.clean) {
      throw new AppError("git_dirty", "Repository must be clean before setup can complete", 409, {
        statusEntries: inspection.statusEntries,
      });
    }

    const contextSnapshotId = this.store.getLatestContextSnapshot(projectId)?.id ?? null;
    const readiness = evaluateSetupReadiness({
      commandCount: this.store.listCommands(projectId).length,
      profiles: this.store.listRoleProfiles(projectId),
      contextSnapshotId,
      providerStatuses: this.store.listProviderStatuses(),
      isProviderProbed: (provider) => this.providers.isProbed(provider),
    });
    if (!readiness.complete) {
      throw new AppError("setup_incomplete", "Project setup requirements are not satisfied", 409, {
        missingRequirements: readiness.missingRequirements,
      });
    }

    this.store.markSetupComplete(projectId);
    return {
      projectId,
      setupComplete: true,
      contextSnapshotId: readiness.contextSnapshotId!,
    };
  }
}
