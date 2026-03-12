import { z } from "zod";

export const V0ResponseModeSchema = z.enum([
  "sync",
  "async",
  "experimental_stream",
]);
export type V0ResponseMode = z.infer<typeof V0ResponseModeSchema>;

export const V0ModelIdSchema = z.enum([
  "v0-auto",
  "v0-mini",
  "v0-pro",
  "v0-max",
  "v0-max-fast",
]);
export type V0ModelId = z.infer<typeof V0ModelIdSchema>;

export const V0ModelConfigurationSchema = z.object({
  modelId: V0ModelIdSchema.optional(),
  imageGenerations: z.boolean().optional(),
  thinking: z.boolean().optional(),
});
export type V0ModelConfiguration = z.infer<typeof V0ModelConfigurationSchema>;

export const V0MessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);
export type V0MessageRole = z.infer<typeof V0MessageRoleSchema>;

export const V0MessageContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type V0MessageContent = z.infer<typeof V0MessageContentSchema>;

export const V0MessageSchema = z.object({
  role: V0MessageRoleSchema,
  content: z.array(V0MessageContentSchema),
});
export type V0Message = z.infer<typeof V0MessageSchema>;

export const V0MetadataSchema = z.object({
  requestId: z.string().optional(),
  source: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});
export type V0Metadata = z.infer<typeof V0MetadataSchema>;

export const V0ChatCreateRequestSchema = z.object({
  message: z.string().min(1),
  system: z.string().optional(),
  modelConfiguration: V0ModelConfigurationSchema.optional(),
  responseMode: V0ResponseModeSchema.optional().default("sync"),
  metadata: V0MetadataSchema.optional(),
  template: z.string().optional(),
});
export type V0ChatCreateRequest = z.infer<typeof V0ChatCreateRequestSchema>;

export const V0ChatMessageRequestSchema = z.object({
  message: z.string().min(1),
  system: z.string().optional(),
  modelConfiguration: V0ModelConfigurationSchema.optional(),
  responseMode: V0ResponseModeSchema.optional().default("sync"),
});
export type V0ChatMessageRequest = z.infer<typeof V0ChatMessageRequestSchema>;

export const V0ChatStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);
export type V0ChatStatus = z.infer<typeof V0ChatStatusSchema>;

export const V0ChatResponseSchema = z.object({
  id: z.string(),
  status: V0ChatStatusSchema,
  messages: z.array(V0MessageSchema),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type V0ChatResponse = z.infer<typeof V0ChatResponseSchema>;

export const V0StreamEventTypeSchema = z.string();
export type V0StreamEventType = z.infer<typeof V0StreamEventTypeSchema>;

export const V0StreamEventSchema = z.object({
  type: V0StreamEventTypeSchema.optional(),
  object: z.string().optional(),
  id: z.string().optional(),
  message: z
    .object({
      id: z.string(),
      role: V0MessageRoleSchema,
      content: z.array(z.unknown()),
    })
    .optional(),
  index: z.number().int().optional(),
  delta: z.unknown().optional(),
  content_block: z.unknown().optional(),
  error: z
    .object({
      type: z.string().optional(),
      message: z.string().optional(),
    })
    .passthrough()
    .optional(),
  text: z.string().optional(),
  messages: z.array(z.unknown()).optional(),
})
.passthrough();
export type V0StreamEvent = z.infer<typeof V0StreamEventSchema>;

export const V0ErrorSchema = z.object({
  error: z.object({
    type: z.string(),
    message: z.string(),
    code: z.string().optional(),
  }),
});
export type V0Error = z.infer<typeof V0ErrorSchema>;
