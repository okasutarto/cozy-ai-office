import { z } from "zod";
import {
  ProfileIdSchema,
  ProviderStatusSchema,
  RoleIdSchema,
  RoleProfileSchema,
  RunEventSchema,
  RunSnapshotSchema,
} from "./contracts.js";

export const SelectProjectRequestSchema = z.object({ rootPath: z.string().min(1).max(1_024) });
export const UpdateRoleProfilesRequestSchema = z.object({
  profiles: z.array(RoleProfileSchema).length(7),
});
export const CreateContextSnapshotRequestSchema = z.object({
  paths: z.array(z.string().min(1).max(500)).min(1).max(5_000),
});
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
  projects: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      rootPath: z.string(),
      updatedAt: z.string(),
    }),
  ),
  providers: z.array(ProviderStatusSchema),
  activeRun: RunSnapshotSchema.nullable(),
});

export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;
export type WsClientMessage = z.infer<typeof WsClientMessageSchema>;
export type WsServerMessage = z.infer<typeof WsServerMessageSchema>;
