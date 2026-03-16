import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../../config/index.js";
import * as v0 from "../../client/v0.js";
import * as repo from "../../db/repositories/conversations.js";
import { resolveChatId } from "../../utils/resolver.js";
import { UnauthorizedError } from "../../utils/errors.js";
import { withRetry } from "../../utils/retry.js";
import type { CanonicalMessage } from "../../types/conversation.js";
import type { V0StreamEvent } from "../../types/v0.js";
import { computeFullHash, computePrefixHash } from "../../utils/canonicalize.js";
import { buildV0CreateChatInput } from "../../utils/history-bootstrap.js";
import { mapModel } from "../../utils/model-mapping.js";

const AnthropicContentBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const AnthropicMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.union([
    z.string(),
    z.array(AnthropicContentBlockSchema),
  ]),
});

const AnthropicRequestSchema = z.object({
  model: z.string(),
  messages: z.array(AnthropicMessageSchema),
  system: z.union([
    z.string(),
    z.array(z.object({ type: z.literal("text"), text: z.string() })),
  ]).optional(),
  max_tokens: z.number().int().positive(),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function extractTextContent(content: string | Array<{ type: string; text: string }>): string {
  if (typeof content === "string") return content;
  return content.map((block) => block.text).join("");
}

function toCanonicalMessages(
  request: z.infer<typeof AnthropicRequestSchema>
): CanonicalMessage[] {
  const messages: CanonicalMessage[] = [];

  if (request.system) {
    const systemText = typeof request.system === "string"
      ? request.system
      : request.system.map((b) => b.text).join("\n");
    messages.push({ role: "system", content: systemText });
  }

  for (const msg of request.messages) {
    messages.push({
      role: msg.role,
      content: extractTextContent(msg.content),
    });
  }

  return messages;
}

function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function checkAuth(request: { headers: Record<string, string | string[] | undefined> }): void {
  const apiKey = request.headers["x-api-key"];
  const authHeader = request.headers.authorization;

  const key = typeof apiKey === "string"
    ? apiKey
    : typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  if (key !== config.OPENAI_API_KEY) {
    throw new UnauthorizedError("Invalid API key");
  }
}

function transformToAnthropic(v0Response: unknown, model: string) {
  const content = extractAssistantContent(v0Response);

  return {
    id: generateMessageId(),
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "text" as const, text: content }],
    model,
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };
}

function extractAssistantContent(v0Response: unknown): string {
  const messages = (v0Response as { messages?: Array<{ role: string; content: unknown }> }).messages;
  const assistantMessage = messages?.find((m) => m.role === "assistant");

  if (Array.isArray(assistantMessage?.content)) {
    return (assistantMessage.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text || "")
      .join("");
  }

  return String(assistantMessage?.content || "");
}

export async function anthropicRoutes(fastify: FastifyInstance) {
  fastify.post("/v1/messages", async (request, reply) => {
    const result = AnthropicRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    checkAuth(request);

    const { model, stream } = result.data;
    const modelId = mapModel(model);
    const messages = toCanonicalMessages(result.data);
    let createdChatResponse: unknown | null = null;

    request.log.debug(
      {
        anthropicModel: model,
        v0ModelId: modelId,
        stream,
        messageCount: messages.length,
      },
      "Received Anthropic messages request"
    );

    const { chatId, isNew } = await resolveChatId(
      messages,
      {
        findByPrefixHash: async (prefixHash: string) => {
          const conversation = repo.findByPrefixHash(prefixHash);
          return conversation ? conversation.chatId : null;
        },
        create: async (prefixHash: string, msgs: CanonicalMessage[]) => {
          const createInput = buildV0CreateChatInput(msgs);

          if (stream) {
            const streamResponse = v0.createChatStream(createInput.message, {
              system: createInput.system,
              modelConfiguration: { modelId },
            });

            await handleAnthropicStream(reply, streamResponse, {
              model,
              prefixHash,
              requestMessages: msgs,
            });
            return null as unknown as string;
          }

          const response = await withRetry(() =>
            v0.createChat(createInput.message, {
              system: createInput.system,
              modelConfiguration: { modelId },
              responseMode: "sync",
            })
          );

          repo.createConversation(prefixHash, response.id);
          repo.upsertHistoryPrefix(
            computeFullHash([
              ...msgs,
              { role: "assistant", content: extractAssistantContent(response) },
            ]),
            response.id,
            [
              ...msgs,
              { role: "assistant", content: extractAssistantContent(response) },
            ]
          );
          createdChatResponse = response;
          return response.id;
        },
      },
      false
    );

    if (!chatId) {
      return;
    }

    if (!isNew) {
      const lastMessage = messages[messages.length - 1];

      if (stream) {
        const streamResponse = v0.sendMessageStream(chatId, lastMessage.content, {
          modelConfiguration: { modelId },
        });

        await handleAnthropicStream(reply, streamResponse, {
          model,
          prefixHash: computePrefixHash(messages),
          requestMessages: messages,
          expectedChatId: chatId,
        });
        return;
      }

      const response = await withRetry(() =>
        v0.sendMessage(chatId, lastMessage.content, {
          modelConfiguration: { modelId },
          responseMode: "sync",
        })
      );

      repo.touchConversation(chatId);
      repo.upsertHistoryPrefix(
        computeFullHash([
          ...messages,
          { role: "assistant", content: extractAssistantContent(response) },
        ]),
        chatId,
        [
          ...messages,
          { role: "assistant", content: extractAssistantContent(response) },
        ]
      );

      return reply.send(transformToAnthropic(response, model));
    }

    if (createdChatResponse) {
      return reply.send(transformToAnthropic(createdChatResponse, model));
    }

    const response = await v0.getChat(chatId);
    return reply.send(transformToAnthropic(response, model));
  });
}

interface StreamingContext {
  model: string;
  requestMessages: CanonicalMessage[];
  prefixHash: string;
  expectedChatId?: string;
}

function writeSseEvent(reply: FastifyReply, eventType: string, data: unknown): void {
  reply.raw.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function handleAnthropicStream(
  reply: FastifyReply,
  streamResponse: AsyncGenerator<V0StreamEvent, void, unknown>,
  context: StreamingContext
) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const msgId = generateMessageId();
  let emittedText = "";
  let fallbackAssistantText = "";
  let finalAssistantText: string | null = null;
  let chatId: string | null = context.expectedChatId ?? null;
  let sawUpstreamError = false;
  let contentBlockStarted = false;

  writeSseEvent(reply, "message_start", {
    type: "message_start",
    message: {
      id: msgId,
      type: "message",
      role: "assistant",
      content: [],
      model: context.model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });

  writeSseEvent(reply, "ping", { type: "ping" });

  try {
    for await (const event of streamResponse) {
      const objectType = getStringField(event, "object");
      const eventId = getStringField(event, "id");

      if (objectType === "chat") {
        if (eventId) chatId = eventId;
        const maybeText = getStringField(event, "text");
        if (maybeText !== null) finalAssistantText = maybeText;
      }

      if (objectType === "message.experimental_content.chunk") {
        const chunk = extractExperimentalChunkText(event.delta);
        if (chunk) {
          if (!contentBlockStarted) {
            writeSseEvent(reply, "content_block_start", {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            });
            contentBlockStarted = true;
          }
          writeSseEvent(reply, "content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: chunk },
          });
          emittedText += chunk;
          fallbackAssistantText += chunk;
        }
      }

      if (event.type === "content_block_delta" && isRecord(event.delta)) {
        const legacyText = getStringField(event.delta, "text");
        if (legacyText) {
          if (!contentBlockStarted) {
            writeSseEvent(reply, "content_block_start", {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" },
            });
            contentBlockStarted = true;
          }
          writeSseEvent(reply, "content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: legacyText },
          });
          emittedText += legacyText;
          fallbackAssistantText += legacyText;
        }
      }

      if (
        (event.type === "error" || objectType === "error") &&
        isRecord(event.error)
      ) {
        sawUpstreamError = true;
        writeSseEvent(reply, "error", {
          type: "error",
          error: {
            type: getStringField(event.error, "type") ?? "upstream_error",
            message: getStringField(event.error, "message") ?? "Upstream stream error",
          },
        });
      }
    }

    const assistantText = resolveAssistantText(finalAssistantText, fallbackAssistantText);

    if (assistantText && assistantText.startsWith(emittedText)) {
      const missingSuffix = assistantText.slice(emittedText.length);
      if (missingSuffix) {
        if (!contentBlockStarted) {
          writeSseEvent(reply, "content_block_start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          });
          contentBlockStarted = true;
        }
        writeSseEvent(reply, "content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: missingSuffix },
        });
      }
    } else if (!emittedText && assistantText) {
      if (!contentBlockStarted) {
        writeSseEvent(reply, "content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        });
        contentBlockStarted = true;
      }
      writeSseEvent(reply, "content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: assistantText },
      });
    }

    if (!sawUpstreamError) {
      if (contentBlockStarted) {
        writeSseEvent(reply, "content_block_stop", {
          type: "content_block_stop",
          index: 0,
        });
      }

      writeSseEvent(reply, "message_delta", {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 0 },
      });

      writeSseEvent(reply, "message_stop", { type: "message_stop" });

      const normalizedAssistant = assistantText.trim();
      if (chatId && normalizedAssistant.length > 0) {
        const existingConversation = repo.findByChatId(chatId);
        if (!existingConversation) {
          repo.createConversation(context.prefixHash, chatId);
        } else {
          repo.touchConversation(chatId);
        }

        const canonicalMessages: CanonicalMessage[] = [
          ...context.requestMessages,
          { role: "assistant", content: assistantText },
        ];

        repo.upsertHistoryPrefix(
          computeFullHash(canonicalMessages),
          chatId,
          canonicalMessages
        );
      }
    }

    reply.raw.end();
  } catch (error) {
    writeSseEvent(reply, "error", {
      type: "error",
      error: {
        type: "stream_error",
        message: error instanceof Error ? error.message : "Stream error",
      },
    });
    reply.raw.end();
  }
}

function resolveAssistantText(
  finalAssistantText: string | null,
  fallbackAssistantText: string
): string {
  if (typeof finalAssistantText === "string" && finalAssistantText.length > 0) {
    return finalAssistantText;
  }
  return fallbackAssistantText;
}

function extractExperimentalChunkText(delta: unknown): string {
  const textTuples: string[] = [];
  collectTextTupleValues(delta, textTuples);
  const patchAppend = extractPatchAppend(delta);
  if (patchAppend) textTuples.push(patchAppend);
  return textTuples.join("");
}

function collectTextTupleValues(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    if (value.length >= 3 && value[0] === "text" && typeof value[2] === "string") {
      output.push(value[2]);
      return;
    }
    for (const item of value) collectTextTupleValues(item, output);
    return;
  }
  if (!isRecord(value)) return;
  for (const entry of Object.values(value)) collectTextTupleValues(entry, output);
}

function extractPatchAppend(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const maybeText = entry[entry.length - 1];
    const isNumericPrefix = entry.slice(0, -1).every((part) => typeof part === "number");
    if (isNumericPrefix && typeof maybeText === "string") return maybeText;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringField(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}
