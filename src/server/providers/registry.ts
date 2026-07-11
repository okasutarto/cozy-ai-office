import type { ProviderId, ProviderStatus } from "../../shared/contracts.js";
import type { ProviderAdapter } from "./types.js";
import { ProcessSupervisor } from "../system/process.js";
import { mkdir, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AntigravityAdapter } from "./antigravity.js";

export class ProviderRegistry {
  private readonly adapters: Map<ProviderId, ProviderAdapter>;
  private readonly statuses = new Map<ProviderId, ProviderStatus>();
  private readonly probed = new Set<ProviderId>();

  constructor(
    adapters: ProviderAdapter[],
    public readonly supervisor?: ProcessSupervisor,
    public readonly projectStore?: { saveProviderStatus(status: ProviderStatus): void },
    public readonly tempDir?: string,
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }

  get(id: ProviderId): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Provider adapter is not registered: ${id}`);
    return adapter;
  }

  list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  setStatus(status: ProviderStatus): void {
    this.statuses.set(status.provider, status);
  }

  statusFor(id: ProviderId): ProviderStatus {
    const status = this.statuses.get(id);
    if (!status) throw new Error(`Provider has not been probed: ${id}`);
    return status;
  }

  isProbed(id: ProviderId): boolean {
    return this.probed.has(id);
  }

  loadStatuses(statuses: ProviderStatus[]): void {
    statuses.forEach((status) => {
      this.setStatus(status);
      // marked as not probed (execution disabled) on startup load
      this.probed.delete(status.provider);
    });
  }

  async probeAll(
    runtime: {
      supervisor: ProcessSupervisor;
      projectStore: { saveProviderStatus(status: ProviderStatus): void };
      cwd: string;
    },
    signal: AbortSignal,
  ): Promise<void> {
    const promises = this.list().map(async (adapter) => {
      const status = await adapter.probe(
        { supervisor: runtime.supervisor, cwd: runtime.cwd },
        signal,
      );

      // Antigravity auth: retain authenticated=true if same version was previously authenticated
      if (adapter.id === "antigravity") {
        const oldStatus = this.statuses.get("antigravity");
        if (
          oldStatus &&
          oldStatus.authenticated &&
          status.version !== null &&
          oldStatus.version === status.version
        ) {
          status.authenticated = true;
          status.diagnostic = null;
        }
      }

      runtime.projectStore.saveProviderStatus(status);
      this.setStatus(status);
      this.probed.add(adapter.id);
    });
    await Promise.all(promises);
  }

  async verifyAntigravityLogin(model: string | null, signal: AbortSignal): Promise<ProviderStatus> {
    if (!this.supervisor || !this.projectStore || !this.tempDir) {
      throw new Error("ProviderRegistry dependencies not configured for verification");
    }
    const adapter = this.get("antigravity");
    const status = this.statusFor("antigravity");

    const verifyDir = join(this.tempDir, `agy-verify-${randomUUID()}`);
    await mkdir(verifyDir, { recursive: true });

    try {
      const args: string[] = [];
      if (model) {
        args.push("--model", model);
      }
      args.push("--print", "Reply with exactly COZY_AUTH_OK. Do not use tools.");

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      const stdoutSink = {
        write: async (chunk: string) => {
          stdoutChunks.push(chunk);
        },
      };
      const stderrSink = {
        write: async (chunk: string) => {
          stderrChunks.push(chunk);
        },
      };

      const result = await this.supervisor.run(
        {
          executable: (adapter as any).executable || "agy",
          args,
          cwd: verifyDir,
          stdin: "",
          timeoutMs: 15_000,
        },
        { stdout: stdoutSink, stderr: stderrSink },
        signal,
      );

      if (result.exitCode !== 0) {
        throw new Error(
          `Verification process failed with exit code ${result.exitCode}. Stderr: ${stderrChunks.join("")}`,
        );
      }

      const stdoutText = stdoutChunks.join("");
      if (!stdoutText.includes("COZY_AUTH_OK")) {
        throw new Error(`Verification response missing expected marker. Got: ${stdoutText}`);
      }

      const files = await readdir(verifyDir);
      if (files.length > 0) {
        throw new Error(`Verification directory is not empty. Found: ${files.join(", ")}`);
      }

      const updatedStatus: ProviderStatus = {
        ...status,
        authenticated: true,
        checkedAt: new Date().toISOString(),
      };

      this.projectStore.saveProviderStatus(updatedStatus);
      this.setStatus(updatedStatus);
      return updatedStatus;
    } finally {
      await rm(verifyDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
