import type {
  ProfileId,
  ProviderId,
  ProviderStatus,
  RoleId,
  RoleProfile,
} from "../../shared/contracts.js";

export const REQUIRED_SETUP_ROLES: Readonly<Record<ProfileId, RoleId>> = {
  manager: "manager",
  "worker-1": "worker",
  "worker-2": "worker",
  "worker-3": "worker",
  "worker-4": "worker",
  advisor: "advisor",
  qa: "qa",
};

export type SetupReadinessInput = {
  commandCount: number;
  profiles: RoleProfile[];
  contextSnapshotId: string | null;
  providerStatuses: ProviderStatus[];
  isProviderProbed?: (provider: ProviderId) => boolean;
};

export type SetupReadiness = {
  complete: boolean;
  contextSnapshotId: string | null;
  missingRequirements: string[];
};

function isReadyProvider(status: ProviderStatus, input: SetupReadinessInput): boolean {
  return (
    (input.isProviderProbed?.(status.provider) ?? true) &&
    status.installed &&
    status.authenticated &&
    status.capabilities.nonInteractive
  );
}

export function evaluateSetupReadiness(input: SetupReadinessInput): SetupReadiness {
  const missing = new Set<string>();
  if (input.commandCount < 1) missing.add("commands");
  if (!input.contextSnapshotId) missing.add("context_snapshot");

  const expectedEntries = Object.entries(REQUIRED_SETUP_ROLES) as Array<[ProfileId, RoleId]>;
  const profilesById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  const validRoleSet =
    input.profiles.length === expectedEntries.length &&
    expectedEntries.every(([profileId, role]) => profilesById.get(profileId)?.role === role);
  if (!validRoleSet) missing.add("roles");

  const probedStatuses = input.providerStatuses.filter((status) =>
    input.isProviderProbed ? input.isProviderProbed(status.provider) : true,
  );
  if (probedStatuses.length === 0) missing.add("provider_probe");

  const readyStatuses = input.providerStatuses.filter((status) => isReadyProvider(status, input));
  const readableProviders = new Set(
    readyStatuses.filter((status) => status.capabilities.readOnly).map((status) => status.provider),
  );
  const writableProviders = new Set(
    readyStatuses
      .filter((status) => status.capabilities.worktreeWrite)
      .map((status) => status.provider),
  );
  if (readableProviders.size === 0) missing.add("read_only_provider");
  if (writableProviders.size === 0) missing.add("write_provider");

  if (validRoleSet) {
    for (const [profileId, role] of expectedEntries) {
      const profile = profilesById.get(profileId)!;
      const compatible = profile.providerChain.some((candidate) =>
        role === "worker"
          ? writableProviders.has(candidate.provider)
          : readableProviders.has(candidate.provider),
      );
      if (!compatible) missing.add(`role_provider:${profileId}`);
    }
  }

  return {
    complete: missing.size === 0,
    contextSnapshotId: input.contextSnapshotId,
    missingRequirements: [...missing],
  };
}
