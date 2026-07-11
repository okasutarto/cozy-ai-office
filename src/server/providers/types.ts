import type {
  ProfileId,
  ProviderCapabilities,
  ProviderId,
  ProviderStatus,
  RoleId,
} from "../../shared/contracts.js";
import type { ArtifactRecord, ArtifactStore } from "../artifacts/store.js";
import type { ProcessSupervisor } from "../system/process.js";

export type ProviderRequest = {
  requestId: string;
  runId: string | null;
  taskId: string | null;
  conversationId: string | null;
  contextSnapshotId: string | null;
  role: RoleId;
  profileId: ProfileId;
  model: string | null;
  prompt: string;
  cwd: string;
  timeoutMs: number;
  readOnly: boolean;
  outputContract:
    | "manager_plan"
    | "advisor_review"
    | "worker_result"
    | "qa_diagnosis"
    | "chat_response"
    | "draft_suggestion"
    | "delivery_synthesis"
    | null;
};

export type BuiltCommand = {
  executable: string;
  args: string[];
  cwd: string;
  stdin: string;
  structuredResultPath: string | null;
};

export type StructuredSchema = { path: string; json: string };

export type ProviderExecution = {
  exitCode: number | null;
  durationMs: number;
  structuredOutput: unknown;
  stdout: ArtifactRecord;
  stderr: ArtifactRecord;
  errorCode: string | null;
};

export type ProviderProbeRuntime = {
  supervisor: ProcessSupervisor;
  cwd: string;
};

export type ProviderRuntime = {
  supervisor: ProcessSupervisor;
  artifacts: ArtifactStore;
  tempDir: string;
  statusFor(provider: ProviderId): ProviderStatus;
};

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly declaredCapabilities: ProviderCapabilities;
  probe(runtime: ProviderProbeRuntime, signal: AbortSignal): Promise<ProviderStatus>;
  build(
    request: ProviderRequest,
    schema: StructuredSchema | null,
    resultPath: string,
  ): BuiltCommand;
}
