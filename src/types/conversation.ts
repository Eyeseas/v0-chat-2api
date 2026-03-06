import { z } from "zod";
import { OpenAIMessageSchema } from "./openai.js";

export const ConversationSchema = z.object({
  id: z.string(),
  prefixHash: z.string(),
  chatId: z.string(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export const CanonicalMessageSchema = OpenAIMessageSchema;

export const PrefixMappingSchema = z.object({
  prefixHash: z.string(),
  chatId: z.string(),
  canonicalMessages: z.array(CanonicalMessageSchema),
});

export const ConversationStateSchema = z.object({
  conversations: z.record(z.string(), ConversationSchema),
  prefixToChatId: z.record(z.string(), z.string()),
});

export const CreateConversationInputSchema = z.object({
  prefixHash: z.string(),
  chatId: z.string(),
  canonicalMessages: z.array(CanonicalMessageSchema),
});

export const UpdateConversationInputSchema = z.object({
  id: z.string(),
  prefixHash: z.string().optional(),
  chatId: z.string().optional(),
  updatedAt: z.number().int().positive().optional(),
  canonicalMessages: z.array(CanonicalMessageSchema).optional(),
});

export type Conversation = z.infer<typeof ConversationSchema>;
export type CanonicalMessage = z.infer<typeof CanonicalMessageSchema>;
export type PrefixMapping = z.infer<typeof PrefixMappingSchema>;
export type ConversationState = z.infer<typeof ConversationStateSchema>;
export type CreateConversationInput = z.infer<typeof CreateConversationInputSchema>;
export type UpdateConversationInput = z.infer<typeof UpdateConversationInputSchema>;
