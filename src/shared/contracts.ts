import { z } from "zod";

export const ProviderIdSchema = z.enum(["codex", "claude", "antigravity"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const RoleIdSchema = z.enum(["manager", "worker", "advisor", "qa"]);
export type RoleId = z.infer<typeof RoleIdSchema>;

export const ProfileIdSchema = z.enum([
  "manager",
  "worker-1",
  "worker-2",
  "worker-3",
  "worker-4",
  "advisor",
  "qa",
]);
export type ProfileId = z.infer<typeof ProfileIdSchema>;

export const TaskModeSchema = z.enum(["read_only", "write"]);
export type TaskMode = z.infer<typeof TaskModeSchema>;

export const RunStateSchema = z.enum([
  "planned",
  "advisor_preflight",
  "dispatching",
  "working",
  "integrating",
  "integration_conflict",
  "testing",
  "advisor_delivery",
  "ready_to_apply",
  "applied",
  "failed",
  "blocked",
  "cancelled",
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const ProviderCapabilitiesSchema = z.object({
  nonInteractive: z.boolean(),
  readOnly: z.boolean(),
  worktreeWrite: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const ProviderStatusSchema = z.object({
  provider: ProviderIdSchema,
  installed: z.boolean(),
  authenticated: z.boolean(),
  version: z.string().nullable(),
  models: z.array(z.string()),
  capabilities: ProviderCapabilitiesSchema,
  diagnostic: z.string().nullable(),
  checkedAt: z.string().datetime(),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ProviderCandidateSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1).nullable(),
});
export type ProviderCandidate = z.infer<typeof ProviderCandidateSchema>;

export const RoleProfileSchema = z.object({
  id: ProfileIdSchema,
  role: RoleIdSchema,
  label: z.string().min(1).max(40),
  providerChain: z.array(ProviderCandidateSchema).min(1).max(3),
  timeoutMs: z.number().int().min(10_000).max(3_600_000),
  promptVersion: z.string().min(1).max(40),
});
export type RoleProfile = z.infer<typeof RoleProfileSchema>;

export const CommandSpecSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(100),
  executable: z.string().min(1).max(260),
  args: z.array(z.string().max(1_000)).max(40),
  cwd: z.literal("."),
  required: z.boolean(),
  timeoutMs: z.number().int().min(1_000).max(3_600_000),
});
export type CommandSpec = z.infer<typeof CommandSpecSchema>;

export const RelativePathWireSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value), "absolute path")
  .refine(
    (value) => !value.split(/[\\/]/u).some((segment) => segment === ".."),
    "parent traversal",
  );

export function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export const RelativePathSchema = RelativePathWireSchema.transform(normalizeRelativePath);

export const ContextManifestEntrySchema = z.object({
  path: RelativePathSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type ContextManifestEntry = z.infer<typeof ContextManifestEntrySchema>;

export const ContextSnapshotSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  sourceBranch: z.string().min(1),
  sourceHead: z.string().regex(/^[a-f0-9]{40,64}$/u),
  manifestHash: z.string().regex(/^[a-f0-9]{64}$/u),
  entries: z.array(ContextManifestEntrySchema),
  excluded: z.array(z.object({ path: RelativePathSchema, reason: z.string().min(1) })),
  createdAt: z.string().datetime(),
});
export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;

export const TaskDraftVersionSchema = z.object({
  draftId: z.string().uuid(),
  version: z.number().int().positive(),
  objective: z.string().min(1).max(10_000),
  scope: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  constraints: z.array(z.string().min(1).max(1_000)).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  contextSnapshotId: z.string().uuid(),
  sourceMessageIds: z.array(z.string().uuid()).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
});
export type TaskDraftVersion = z.infer<typeof TaskDraftVersionSchema>;

export const TaskBriefWireObjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
  title: z.string().min(1).max(120),
  objective: z.string().min(1).max(10_000),
  mode: TaskModeSchema,
  dependsOn: z.array(z.string().min(1)).max(32),
  contextArtifacts: z.array(z.string().uuid()).max(100),
  allowedPaths: z.array(RelativePathWireSchema).max(100),
  forbiddenPaths: z.array(RelativePathWireSchema).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  verificationCommands: z.array(z.string().min(1).max(80)).max(40),
});

const taskBriefRefinement = (brief: any, context: z.RefinementCtx) => {
  if (
    brief.mode === "read_only" &&
    Array.isArray(brief.allowedPaths) &&
    brief.allowedPaths.length !== 0
  ) {
    context.addIssue({ code: "custom", path: ["allowedPaths"], message: "read-only paths" });
  }
  if (
    brief.mode === "write" &&
    Array.isArray(brief.allowedPaths) &&
    brief.allowedPaths.length === 0
  ) {
    context.addIssue({ code: "custom", path: ["allowedPaths"], message: "write ownership" });
  }
};

export const TaskBriefWireSchema = Object.assign(
  TaskBriefWireObjectSchema.superRefine(taskBriefRefinement),
  {
    safeExtend<T extends z.ZodRawShape>(shape: T) {
      return TaskBriefWireObjectSchema.extend(shape).superRefine(taskBriefRefinement);
    },
  },
);
export type TaskBriefWire = z.infer<typeof TaskBriefWireSchema>;

function normalizeTaskBrief<T extends TaskBriefWire>(brief: T) {
  return {
    ...brief,
    allowedPaths: brief.allowedPaths.map(normalizeRelativePath),
    forbiddenPaths: brief.forbiddenPaths.map(normalizeRelativePath),
  };
}

export const TaskBriefSchema = TaskBriefWireSchema.transform(normalizeTaskBrief);
export type TaskBrief = z.infer<typeof TaskBriefSchema>;

export const ManagerPlanWireSchema = z.object({
  summary: z.string().min(1).max(10_000),
  risks: z.array(z.string().min(1).max(1_000)).max(100),
  testStrategy: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  tasks: z.array(TaskBriefWireSchema).min(1).max(16),
});
export const ManagerPlanSchema = ManagerPlanWireSchema.transform((plan) => ({
  ...plan,
  tasks: plan.tasks.map(normalizeTaskBrief),
}));
export type ManagerPlan = z.infer<typeof ManagerPlanSchema>;

export const AdvisorReviewSchema = z.object({
  verdict: z.enum(["approve", "reject"]),
  blockingFindings: z.array(z.string().min(1).max(2_000)).max(50),
  requestedChanges: z.array(z.string().min(1).max(2_000)).max(50),
  risks: z.array(z.string().min(1).max(2_000)).max(50),
});
export type AdvisorReview = z.infer<typeof AdvisorReviewSchema>;

export const WorkerResultWireSchema = z.object({
  status: z.enum(["completed", "failed", "policy_violation"]),
  summary: z.string().min(1).max(20_000),
  findings: z.array(z.string().min(1).max(2_000)).max(100),
  changedFiles: z.array(RelativePathWireSchema).max(500),
  verification: z.array(z.string().min(1).max(2_000)).max(100),
  risks: z.array(z.string().min(1).max(2_000)).max(100),
});
export const WorkerResultSchema = WorkerResultWireSchema.transform((result) => ({
  ...result,
  changedFiles: result.changedFiles.map(normalizeRelativePath),
}));
export type WorkerResult = z.infer<typeof WorkerResultSchema>;

export const QaDiagnosisWireSchema = z.object({
  summary: z.string().min(1).max(20_000),
  suspectedPaths: z.array(RelativePathWireSchema).max(100),
  repairObjective: z.string().min(1).max(10_000),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
});
export const QaDiagnosisSchema = QaDiagnosisWireSchema.transform((diagnosis) => ({
  ...diagnosis,
  suspectedPaths: diagnosis.suspectedPaths.map(normalizeRelativePath),
}));
export type QaDiagnosis = z.infer<typeof QaDiagnosisSchema>;

export const DraftSuggestionSchema = z.object({
  objective: z.string().min(1).max(10_000),
  scope: z.array(z.string().min(1).max(1_000)).min(1).max(100),
  constraints: z.array(z.string().min(1).max(1_000)).max(100),
  acceptanceCriteria: z.array(z.string().min(1).max(1_000)).min(1).max(100),
});
export type DraftSuggestion = z.infer<typeof DraftSuggestionSchema>;

export const ChatResponseSchema = z.object({
  message: z.string().min(1).max(40_000),
  citedArtifactIds: z.array(z.string().uuid()).max(50),
  draftSuggestion: DraftSuggestionSchema.nullable(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const DeliverySynthesisWireSchema = z.object({
  summary: z.string().min(1).max(20_000),
  changedFiles: z.array(RelativePathWireSchema).max(500),
  qaSummary: z.string().min(1).max(10_000),
  remainingRisks: z.array(z.string().min(1).max(2_000)).max(100),
});
export const DeliverySynthesisSchema = DeliverySynthesisWireSchema.transform((value) => ({
  ...value,
  changedFiles: value.changedFiles.map(normalizeRelativePath),
}));
export type DeliverySynthesis = z.infer<typeof DeliverySynthesisSchema>;

export const EventKindSchema = z.enum([
  "run.created",
  "run.state.changed",
  "run.pause.changed",
  "run.ready_to_apply",
  "run.applied",
  "run.blocked",
  "run.failed",
  "run.cancelled",
  "role.started",
  "role.finished",
  "consultation.started",
  "consultation.finished",
  "task.queued",
  "task.started",
  "task.finished",
  "task.failed",
  "attempt.started",
  "attempt.output",
  "attempt.finished",
  "integration.started",
  "integration.finished",
  "integration.conflict",
  "qa.command.started",
  "qa.command.finished",
  "advisor.gate",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

export const RunEventSchema = z.object({
  sequence: z.number().int().positive(),
  runId: z.string().uuid().nullable(),
  kind: EventKindSchema,
  actorId: ProfileIdSchema.nullable(),
  taskId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

const RunTaskWireSchema = TaskBriefWireSchema.safeExtend({
  status: z.enum(["queued", "running", "completed", "failed", "blocked"]),
  assignedProfileId: ProfileIdSchema.nullable(),
  commitSha: z.string().nullable(),
});
const RunTaskSchema = RunTaskWireSchema.transform((task) => normalizeTaskBrief(task));

export const RunSnapshotSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  state: RunStateSchema,
  dispatchPaused: z.boolean(),
  baseBranch: z.string().min(1),
  baseCommit: z.string().regex(/^[a-f0-9]{40,64}$/u),
  draftId: z.string().uuid(),
  draftVersion: z.number().int().positive(),
  contextSnapshotId: z.string().uuid(),
  integrationBranch: z.string(),
  integrationWorktree: z.string(),
  tasks: z.array(RunTaskSchema),
  latestEventSequence: z.number().int().nonnegative(),
  blockReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;
