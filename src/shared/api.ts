import { z } from "zod";
import {
  ProfileIdSchema,
  CommandSpecSchema,
  ProviderStatusSchema,
  RoleIdSchema,
  RoleProfileSchema,
  RunEventSchema,
  RunSnapshotSchema,
} from "./contracts.js";

export const ProjectRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  setupComplete: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const BootstrapProjectSchema = ProjectRecordSchema.omit({ createdAt: true });
export const SelectProjectRequestSchema = z.object({ rootPath: z.string().min(1).max(1_024) });
export const SelectProjectResponseSchema = z.object({
  id: z.string().uuid(),
  rootPath: z.string().min(1),
  name: z.string().min(1),
  branch: z.string().min(1),
  head: z.string().regex(/^[a-f0-9]{40,64}$/u),
  clean: z.boolean(),
  statusEntries: z.array(z.string()),
  trackedPaths: z.array(z.string()),
  commandCandidates: z.array(CommandSpecSchema),
  rulePaths: z.array(z.string()),
  setupComplete: z.boolean(),
  diagnostic: z.string().nullable(),
});
export const ProviderStatusListResponseSchema = z.array(ProviderStatusSchema);
export const VerifyAntigravityLoginRequestSchema = z.object({
  model: z.string().nullable(),
  confirmation: z.literal("USE SUBSCRIPTION TURN"),
});
export const UpdateCommandsRequestSchema = z.object({
  commands: z.array(CommandSpecSchema),
});
export const UpdateRoleProfilesRequestSchema = z.object({
  profiles: z.array(RoleProfileSchema).length(7),
});
export const CreateContextSnapshotRequestSchema = z.object({
  paths: z.array(z.string().min(1).max(500)).min(1).max(5_000),
});
export const ContextCandidatesResponseSchema = z.object({
  candidates: z.array(z.string()),
  excluded: z.array(z.object({ path: z.string(), reason: z.string().min(1) })),
});
export const ProjectOnboardingResponseSchema = z.object({
  project: ProjectRecordSchema,
  commands: z.array(CommandSpecSchema),
  roles: z.array(RoleProfileSchema),
  contextSnapshotId: z.string().uuid().nullable(),
});
export const CompleteProjectSetupResponseSchema = z.object({
  projectId: z.string().uuid(),
  setupComplete: z.literal(true),
  contextSnapshotId: z.string().uuid(),
});
export const CompleteProjectSetupRequestSchema = z.object({}).strict();
export const CreateConversationRequestSchema = z.object({
  role: RoleIdSchema,
  profileId: ProfileIdSchema,
  contextSnapshotId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
});
export const SendMessageRequestSchema = z.object({
  body: z.string().min(1).max(40_000),
  selectedMessageIds: z.array(z.string().uuid()).max(20),
  selectedArtifactIds: z.array(z.string().uuid()).max(50),
  additionalUsageConfirmed: z.boolean().default(false),
});
export const ForwardToManagerRequestSchema = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(100),
});
export const UpdateDraftRequestSchema = z.object({
  objective: z.string().min(1).max(10_000),
  scope: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  constraints: z.array(z.string().min(1).max(1_000)).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  contextSnapshotId: z.string().uuid(),
  sourceMessageIds: z.array(z.string().uuid()).max(100),
});
export const RunActionRequestSchema = z.object({ expectedUpdatedAt: z.string().datetime() });
export const WsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    token: z.string().min(32).max(200),
    nonce: z.string().regex(/^[a-f0-9]{32}$/u),
  }),
  z.object({
    type: z.literal("subscribe"),
    runId: z.string().uuid().nullable(),
    afterSequence: z.number().int().nonnegative(),
  }),
]);
export const WsServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("challenge"), nonce: z.string().regex(/^[a-f0-9]{32}$/u) }),
  z.object({ type: z.literal("authenticated") }),
  z.object({ type: z.literal("snapshot"), run: RunSnapshotSchema.nullable() }),
  z.object({ type: z.literal("event"), event: RunEventSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export const BootstrapResponseSchema = z.object({
  projects: z.array(BootstrapProjectSchema),
  providers: z.array(ProviderStatusSchema),
  activeRun: RunSnapshotSchema.nullable(),
});

export const StartRunRequestSchema = z.object({
  expectedDraftVersion: z.number().int().positive(),
  concurrency: z.number().int().min(1).max(4).default(3),
});
export const RetryTaskRequestSchema = z.object({
  taskId: z.string().min(1).max(64),
  expectedUpdatedAt: z.string().datetime(),
});
export const CleanupRunRequestSchema = z.object({ confirmation: z.string().uuid() });

import {
  ProviderIdSchema,
  TaskDraftVersionSchema,
  normalizeRelativePath,
  RelativePathWireSchema,
} from "./contracts.js";

export const ConversationRecordSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  role: RoleIdSchema,
  profileId: ProfileIdSchema,
  contextSnapshotId: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MessageRecordSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  sender: z.enum(["owner", "manager", "worker", "advisor", "qa", "agent"]),
  body: z.string().min(1).max(40_000),
  sourceMessageIds: z.array(z.string().uuid()),
  artifactIds: z.array(z.string().uuid()),
  createdAt: z.string().datetime(),
});

export const ArtifactMetadataSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  taskId: z.string().nullable(),
  kind: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const DiffViewSchema = z.object({
  artifact: ArtifactMetadataSchema,
  stat: z.string(),
  patch: z.string(),
  truncated: z.boolean(),
});

export const QaCommandResultViewSchema = z.object({
  commandId: z.string(),
  label: z.string(),
  cycleNumber: z.number().int().min(1).max(2),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  status: z.enum(["passed", "failed", "cancelled", "timed_out"]),
  stdoutArtifactId: z.string().uuid().nullable(),
  stderrArtifactId: z.string().uuid().nullable(),
});

export const QaReportViewSchema = z.object({
  status: z.enum(["passed", "failed", "blocked"]),
  repairAttempted: z.boolean(),
  diagnosisArtifactId: z.string().uuid().nullable(),
  commands: z.array(QaCommandResultViewSchema),
});

export const AttemptViewSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().nullable(),
  role: RoleIdSchema,
  profileId: ProfileIdSchema,
  provider: ProviderIdSchema,
  model: z.string().nullable(),
  stage: z.string(),
  attemptNumber: z.number().int().positive(),
  status: z.enum(["running", "succeeded", "failed", "interrupted", "cancelled"]),
  exitCode: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  stdoutArtifactId: z.string().uuid().nullable(),
  stderrArtifactId: z.string().uuid().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
});

export const AdvisorReviewViewSchema = z.object({
  gate: z.enum(["preflight", "delivery"]),
  pass: z.number().int().min(1).max(2),
  review: z.object({
    verdict: z.enum(["approve", "reject"]),
    blockingFindings: z.array(z.string().min(1).max(2_000)).max(50),
  }),
  artifactId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const RunEvidenceSchema = z.object({
  run: RunSnapshotSchema,
  diff: DiffViewSchema.nullable(),
  qa: QaReportViewSchema.nullable(),
  attempts: z.array(AttemptViewSchema),
  advisorReviews: z.array(AdvisorReviewViewSchema),
  synthesisArtifactId: z.string().uuid().nullable(),
});

export const RunStorageSchema = z.object({
  runId: z.string().uuid(),
  artifactCount: z.number().int().nonnegative(),
  artifactBytes: z.number().int().nonnegative(),
  worktreeCount: z.number().int().nonnegative(),
  worktreeBytes: z.number().int().nonnegative(),
  cleanupEligible: z.boolean(),
});

export const CleanupResultSchema = z.object({
  runId: z.string().uuid(),
  deletedArtifacts: z.number().int().nonnegative(),
  deletedWorktrees: z.number().int().nonnegative(),
  freedBytes: z.number().int().nonnegative(),
  auditPreserved: z.literal(true),
});

export const ConversationListResponseSchema = z.array(ConversationRecordSchema);
export const MessageListResponseSchema = z.array(MessageRecordSchema);
export const RunEventsResponseSchema = z.array(RunEventSchema);
export { TaskDraftVersionSchema };

export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;
export type BootstrapProject = z.infer<typeof BootstrapProjectSchema>;
export type SelectProjectRequest = z.infer<typeof SelectProjectRequestSchema>;
export type SelectProjectResponse = z.infer<typeof SelectProjectResponseSchema>;
export type ProviderStatusListResponse = z.infer<typeof ProviderStatusListResponseSchema>;
export type VerifyAntigravityLoginRequest = z.infer<typeof VerifyAntigravityLoginRequestSchema>;
export type UpdateCommandsRequest = z.infer<typeof UpdateCommandsRequestSchema>;
export type ProjectOnboardingResponse = z.infer<typeof ProjectOnboardingResponseSchema>;
export type ContextCandidatesResponse = z.infer<typeof ContextCandidatesResponseSchema>;
export type CompleteProjectSetupRequest = z.infer<typeof CompleteProjectSetupRequestSchema>;
export type CompleteProjectSetupResponse = z.infer<typeof CompleteProjectSetupResponseSchema>;
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;
export type ConversationRecord = z.infer<typeof ConversationRecordSchema>;
export type MessageRecord = z.infer<typeof MessageRecordSchema>;
export type DiffView = z.infer<typeof DiffViewSchema>;
export type QaReportView = z.infer<typeof QaReportViewSchema>;
export type AttemptView = z.infer<typeof AttemptViewSchema>;
export type AdvisorReviewView = z.infer<typeof AdvisorReviewViewSchema>;
export type RunEvidence = z.infer<typeof RunEvidenceSchema>;
export type RunStorage = z.infer<typeof RunStorageSchema>;
export type CleanupResult = z.infer<typeof CleanupResultSchema>;
