import { z } from "zod";

export const OpenAIRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "function",
  "tool",
]);
export type OpenAIRole = z.infer<typeof OpenAIRoleSchema>;


export const OpenAIMessageSchema = z.object({
  role: OpenAIRoleSchema,
  content: z.string(),
  name: z.string().optional(),
  function_call: z
    .object({
      name: z.string(),
      arguments: z.string(),
    })
    .optional(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })
    )
    .optional(),
  tool_call_id: z.string().optional(),
});
export type OpenAIMessage = z.infer<typeof OpenAIMessageSchema>;


export const OpenAIChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(OpenAIMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(false),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().positive().optional().default(1),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().min(-2).max(2).optional().default(0),
  frequency_penalty: z.number().min(-2).max(2).optional().default(0),
  logit_bias: z.record(z.number()).optional(),
  user: z.string().optional(),
  response_format: z
    .object({
      type: z.enum(["text", "json_object"]),
    })
    .optional(),
});
export type OpenAIChatRequest = z.infer<typeof OpenAIChatRequestSchema>;


export const OpenAIChatChoiceSchema = z.object({
  index: z.number().int(),
  message: OpenAIMessageSchema,
  finish_reason: z
    .enum(["stop", "length", "function_call", "tool_calls", "content_filter"])
    .nullable()
    .optional(),
  logprobs: z
    .object({
      content: z
        .array(
          z.object({
            token: z.string(),
            logprob: z.number(),
            bytes: z.array(z.number()).optional(),
            top_logprobs: z.array(
              z.object({
                token: z.string(),
                logprob: z.number(),
                bytes: z.array(z.number()).optional(),
              })
            ),
          })
        )
        .optional(),
    })
    .optional(),
});
export type OpenAIChatChoice = z.infer<typeof OpenAIChatChoiceSchema>;


export const OpenAIUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type OpenAIUsage = z.infer<typeof OpenAIUsageSchema>;


export const OpenAIChatResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(OpenAIChatChoiceSchema),
  usage: OpenAIUsageSchema.optional(),
  system_fingerprint: z.string().optional(),
});
export type OpenAIChatResponse = z.infer<typeof OpenAIChatResponseSchema>;


export const OpenAIChatStreamChoiceSchema = z.object({
  index: z.number().int(),
  delta: z.object({
    role: OpenAIRoleSchema.optional(),
    content: z.string().optional(),
    function_call: z
      .object({
        name: z.string().optional(),
        arguments: z.string().optional(),
      })
      .optional(),
    tool_calls: z
      .array(
        z.object({
          index: z.number().int(),
          id: z.string().optional(),
          type: z.literal("function").optional(),
          function: z.object({
            name: z.string().optional(),
            arguments: z.string().optional(),
          }),
        })
      )
      .optional(),
  }),
  finish_reason: z
    .enum(["stop", "length", "function_call", "tool_calls", "content_filter"])
    .nullable()
    .optional(),
  logprobs: z
    .object({
      content: z
        .array(
          z.object({
            token: z.string(),
            logprob: z.number(),
            bytes: z.array(z.number()).optional(),
            top_logprobs: z.array(
              z.object({
                token: z.string(),
                logprob: z.number(),
                bytes: z.array(z.number()).optional(),
              })
            ),
          })
        )
        .optional(),
    })
    .optional(),
});
export type OpenAIChatStreamChoice = z.infer<typeof OpenAIChatStreamChoiceSchema>;


export const OpenAIChatStreamResponseSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(OpenAIChatStreamChoiceSchema),
  system_fingerprint: z.string().optional(),
});
export type OpenAIChatStreamResponse = z.infer<typeof OpenAIChatStreamResponseSchema>;


export const OpenAIErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    param: z.string().optional(),
    code: z.string().optional(),
  }),
});
export type OpenAIError = z.infer<typeof OpenAIErrorSchema>;
