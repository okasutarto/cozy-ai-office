import type { ProjectStore } from "../db/project-store.js";
import type { RepositoryService, RepositoryInspection } from "../git/repository.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { CommandSpec, RoleProfile, ProviderStatus } from "../../shared/contracts.js";
import { AppError } from "../errors.js";
import { randomUUID } from "node:crypto";

export class ProjectService {
  constructor(
    public readonly store: ProjectStore,
    public readonly repositories: RepositoryService,
    public readonly providers: ProviderRegistry,
  ) {}

  async selectProject(
    rootPath: string,
    signal: AbortSignal,
  ): Promise<RepositoryInspection & { id: string; diagnostic: string | null }> {
    const inspection = await this.repositories.inspect(rootPath, signal);

    let project = this.store.getProjectByPath(inspection.rootPath);
    if (!project) {
      project = {
        id: randomUUID(),
        name: inspection.name,
        rootPath: inspection.rootPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.store.upsertProject(project);
    } else {
      project.updatedAt = new Date().toISOString();
      this.store.upsertProject(project);
    }

    this.store.replaceCommands(project.id, inspection.commandCandidates);

    const allStatuses = this.store.listProviderStatuses();
    const readOnlyProviders = allStatuses.filter(
      (s) => s.installed && s.authenticated && s.capabilities.readOnly,
    );
    const writeProviders = allStatuses.filter(
      (s) => s.installed && s.authenticated && s.capabilities.worktreeWrite,
    );

    let diagnostic: string | null = null;
    if (readOnlyProviders.length === 0) {
      diagnostic =
        "No compatible read-only provider is authenticated. Manager, Advisor, and QA roles cannot be assigned.";
    } else if (writeProviders.length === 0) {
      diagnostic =
        "No compatible write provider is authenticated. Worker roles cannot be assigned.";
    }

    if (!diagnostic) {
      const readOnlyStable = readOnlyProviders.sort((a, b) => {
        const stableOrder = ["codex", "claude"];
        return stableOrder.indexOf(a.provider) - stableOrder.indexOf(b.provider);
      });

      const writeStable = writeProviders.sort((a, b) => {
        const stableOrder = ["codex", "claude", "antigravity"];
        return stableOrder.indexOf(a.provider) - stableOrder.indexOf(b.provider);
      });

      const profiles: RoleProfile[] = [];

      // Manager
      // ponytail: Role profile timeout is hardcoded. Upgrade path: make timeouts customizable in project settings.
      const managerProv = readOnlyStable[0]!;
      profiles.push({
        id: "manager",
        role: "manager",
        label: "Manager",
        providerChain: [{ provider: managerProv.provider, model: managerProv.models[0] || null }],
        timeoutMs: 15 * 60 * 1000,
        promptVersion: "manager-v1",
      });

      // Advisor
      const advisorProv = readOnlyStable[readOnlyStable.length - 1]!;
      profiles.push({
        id: "advisor",
        role: "advisor",
        label: "Advisor",
        providerChain: [{ provider: advisorProv.provider, model: advisorProv.models[0] || null }],
        timeoutMs: 15 * 60 * 1000,
        promptVersion: "advisor-v1",
      });

      // QA
      const qaProv = readOnlyStable[0]!;
      profiles.push({
        id: "qa",
        role: "qa",
        label: "QA",
        providerChain: [{ provider: qaProv.provider, model: qaProv.models[0] || null }],
        timeoutMs: 10 * 60 * 1000,
        promptVersion: "qa-v1",
      });

      // Workers
      // ponytail: Workers are distributed using a simple round-robin picker. Upgrade path: add workload-based allocation or agent latency metrics.
      const workers = ["worker-1", "worker-2", "worker-3", "worker-4"] as const;
      workers.forEach((id, index) => {
        const primaryProvider = writeStable[index % writeStable.length]!;

        const alternatives = writeStable
          .filter((p) => p.provider !== primaryProvider.provider)
          .map((p) => ({ provider: p.provider, model: p.models[0] || null }));

        const providerChain = [
          { provider: primaryProvider.provider, model: primaryProvider.models[0] || null },
          ...alternatives,
        ].slice(0, 3);

        profiles.push({
          id,
          role: "worker",
          label: `Worker ${index + 1}`,
          providerChain,
          timeoutMs: 30 * 60 * 1000,
          promptVersion: "worker-v1",
        });
      });

      this.store.replaceRoleProfiles(project.id, profiles);
    }

    return {
      ...inspection,
      id: project.id,
      diagnostic,
    };
  }

  async probeProviders(signal: AbortSignal): Promise<ProviderStatus[]> {
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

    return this.providers.list().map((adapter) => this.providers.statusFor(adapter.id));
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
}
