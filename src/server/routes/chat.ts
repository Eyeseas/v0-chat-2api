import { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { config } from "../../config/index.js";
import * as v0 from "../../client/v0.js";
import * as repo from "../../db/repositories/conversations.js";
import { resolveChatId } from "../../utils/resolver.js";
import { ValidationError, UnauthorizedError } from "../../utils/errors.js";
import { withRetry } from "../../utils/retry.js";
import type { CanonicalMessage } from "../../types/conversation.js";
import type { V0StreamEvent } from "../../types/v0.js";
import { computeFullHash, computePrefixHash } from "../../utils/canonicalize.js";
import { buildV0CreateChatInput } from "../../utils/history-bootstrap.js";

const ChatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: z.string(),
    })
  ),
  stream: z.boolean().optional().default(false),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
});

const ModelParamsSchema = z.object({
  model: z.string().min(1),
});

const SUPPORTED_V0_MODELS = [
  "v0-auto",
  "v0-mini",
  "v0-pro",
  "v0-max",
  "v0-max-fast",
] as const;
type SupportedV0Model = (typeof SUPPORTED_V0_MODELS)[number];

const OPENAI_MODEL_ALIASES: Record<string, SupportedV0Model> = {
  "gpt-4": "v0-pro",
  "gpt-4-turbo": "v0-max",
  "gpt-3.5-turbo": "v0-mini",
};

const OPENAI_MODEL_CREATED = 1704067200;

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.get("/v1/models", async (request) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${config.OPENAI_API_KEY}`) {
      throw new UnauthorizedError("Invalid API key");
    }

    return {
      object: "list",
      data: SUPPORTED_V0_MODELS.map((id) => ({
        id,
        object: "model",
        created: OPENAI_MODEL_CREATED,
        owned_by: "vercel-v0",
        root: id,
        parent: null,
      })),
    };
  });

  fastify.get("/v1/models/:model", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${config.OPENAI_API_KEY}`) {
      throw new UnauthorizedError("Invalid API key");
    }

    const parsed = ModelParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError("Invalid request: " + parsed.error.message);
    }

    const requested = parsed.data.model;
    const id = resolveModelId(requested);

    if (!id) {
      return reply.status(404).send({
        error: {
          message: `The model '${requested}' does not exist`,
          type: "invalid_request_error",
          code: "model_not_found",
        },
      });
    }

    return {
      id,
      object: "model",
      created: OPENAI_MODEL_CREATED,
      owned_by: "vercel-v0",
      root: id,
      parent: null,
    };
  });

  fastify.post("/v1/chat/completions", async (request, reply) => {
    const result = ChatRequestSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError("Invalid request: " + result.error.message);
    }

    const { model, messages, stream } = result.data;
    let createdChatResponse: unknown | null = null;

    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${config.OPENAI_API_KEY}`) {
      throw new UnauthorizedError("Invalid API key");
    }

    const { chatId, isNew } = await resolveChatId(
      messages as CanonicalMessage[],
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
              modelConfiguration: { model: mapModel(model) },
            });

            await handleStreamingResponse(reply, streamResponse, {
              model,
              prefixHash,
              requestMessages: msgs,
            });
            return null as unknown as string;
          }

          const response = await withRetry(() =>
            v0.createChat(createInput.message, {
              system: createInput.system,
              modelConfiguration: { model: mapModel(model) },
              responseMode: "sync",
            })
          );

          repo.createConversation(prefixHash, response.id);
          repo.upsertHistoryPrefix(
            computeFullHash([
              ...msgs,
              {
                role: "assistant",
                content: extractAssistantContent(response),
              },
            ]),
            response.id,
            [
              ...msgs,
              {
                role: "assistant",
                content: extractAssistantContent(response),
              },
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
          modelConfiguration: { model: mapModel(model) },
        });

        await handleStreamingResponse(reply, streamResponse, {
          model,
          prefixHash: computePrefixHash(messages as CanonicalMessage[]),
          requestMessages: messages as CanonicalMessage[],
          expectedChatId: chatId,
        });
        return;
      }

      const response = await withRetry(() =>
        v0.sendMessage(chatId, lastMessage.content, {
          modelConfiguration: { model: mapModel(model) },
          responseMode: "sync",
        })
      );

      repo.touchConversation(chatId);
      repo.upsertHistoryPrefix(
        computeFullHash([
          ...(messages as CanonicalMessage[]),
          {
            role: "assistant",
            content: extractAssistantContent(response),
          },
        ]),
        chatId,
        [
          ...(messages as CanonicalMessage[]),
          {
            role: "assistant",
            content: extractAssistantContent(response),
          },
        ]
      );

      return reply.send(transformToOpenAI(response, model));
    }

    if (createdChatResponse) {
      return reply.send(transformToOpenAI(createdChatResponse, model));
    }

    const response = await v0.getChat(chatId);
    return reply.send(transformToOpenAI(response, model));
  });
}

interface StreamingContext {
  model: string;
  requestMessages: CanonicalMessage[];
  prefixHash: string;
  expectedChatId?: string;
}

async function handleStreamingResponse(
  reply: FastifyReply,
  streamResponse: AsyncGenerator<V0StreamEvent, void, unknown>,
  context: StreamingContext
) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  let hasSentRole = false;
  let emittedText = "";
  let fallbackAssistantText = "";
  let finalAssistantText: string | null = null;
  let chatId: string | null = context.expectedChatId ?? null;
  let sawUpstreamErrorEvent = false;

  try {
    for await (const event of streamResponse) {
      const objectType = getStringField(event, "object");
      const eventId = getStringField(event, "id");

      if (objectType === "chat") {
        if (eventId) {
          chatId = eventId;
        }

        const maybeText = getStringField(event, "text");
        if (maybeText !== null) {
          finalAssistantText = maybeText;
        }
      }

      if (objectType === "message.experimental_content.chunk") {
        const chunk = extractExperimentalChunkText(event.delta);
        if (chunk) {
          hasSentRole = ensureAssistantRoleChunk(
            reply,
            hasSentRole,
            id,
            created,
            context.model
          );
          writeAssistantContentChunk(reply, id, created, context.model, chunk);
          emittedText += chunk;
          fallbackAssistantText += chunk;
        }
      }

      if (event.type === "content_block_delta" && isRecord(event.delta)) {
        const legacyText = getStringField(event.delta, "text");
        if (legacyText) {
          hasSentRole = ensureAssistantRoleChunk(
            reply,
            hasSentRole,
            id,
            created,
            context.model
          );
          writeAssistantContentChunk(reply, id, created, context.model, legacyText);
          emittedText += legacyText;
          fallbackAssistantText += legacyText;
        }
      }

      if (
        (event.type === "error" || objectType === "error") &&
        isRecord(event.error)
      ) {
        sawUpstreamErrorEvent = true;
        writeSseData(reply, {
          error: {
            message:
              getStringField(event.error, "message") ??
              "Upstream stream error",
            type: getStringField(event.error, "type") ?? "upstream_error",
          },
        });
      }
    }

    const assistantText = resolveAssistantText(finalAssistantText, fallbackAssistantText);

    if (assistantText && assistantText.startsWith(emittedText)) {
      const missingSuffix = assistantText.slice(emittedText.length);
      if (missingSuffix) {
        hasSentRole = ensureAssistantRoleChunk(
          reply,
          hasSentRole,
          id,
          created,
          context.model
        );
        writeAssistantContentChunk(
          reply,
          id,
          created,
          context.model,
          missingSuffix
        );
      }
    } else if (!emittedText && assistantText) {
      hasSentRole = ensureAssistantRoleChunk(
        reply,
        hasSentRole,
        id,
        created,
        context.model
      );
      writeAssistantContentChunk(reply, id, created, context.model, assistantText);
    }

    if (!sawUpstreamErrorEvent) {
      writeSseData(reply, {
        id,
        object: "chat.completion.chunk",
        created,
        model: context.model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });

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
          {
            role: "assistant",
            content: assistantText,
          },
        ];

        repo.upsertHistoryPrefix(
          computeFullHash(canonicalMessages),
          chatId,
          canonicalMessages
        );
      }
    }

    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  } catch (error) {
    writeSseData(reply, {
      error: {
        message: error instanceof Error ? error.message : "Stream error",
        type: "stream_error",
      },
    });
    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  }
}

function writeSseData(reply: FastifyReply, payload: unknown): void {
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function ensureAssistantRoleChunk(
  reply: FastifyReply,
  hasSentRole: boolean,
  id: string,
  created: number,
  model: string
): boolean {
  if (hasSentRole) {
    return true;
  }

  writeSseData(reply, {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { role: "assistant" } }],
  });

  return true;
}

function writeAssistantContentChunk(
  reply: FastifyReply,
  id: string,
  created: number,
  model: string,
  text: string
): void {
  writeSseData(reply, {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { content: text } }],
  });
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
  if (patchAppend) {
    textTuples.push(patchAppend);
  }

  return textTuples.join("");
}

function collectTextTupleValues(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    if (
      value.length >= 3 &&
      value[0] === "text" &&
      typeof value[2] === "string"
    ) {
      output.push(value[2]);
      return;
    }

    for (const item of value) {
      collectTextTupleValues(item, output);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const entry of Object.values(value)) {
    collectTextTupleValues(entry, output);
  }
}

function extractPatchAppend(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }

    const maybeText = entry[entry.length - 1];
    const isNumericPrefix = entry
      .slice(0, -1)
      .every((part) => typeof part === "number");

    if (isNumericPrefix && typeof maybeText === "string") {
      return maybeText;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringField(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function mapModel(model: string): string {
  return resolveModelId(model) ?? "v0-auto";
}

function resolveModelId(model: string): string | null {
  if (SUPPORTED_V0_MODELS.includes(model as SupportedV0Model)) {
    return model;
  }

  return OPENAI_MODEL_ALIASES[model] ?? null;
}

function transformToOpenAI(v0Response: unknown, model: string) {
  const content = extractAssistantContent(v0Response);

  return {
    id: (v0Response as { id?: string }).id || "",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content,
        },
        finish_reason: "stop",
      },
    ],
    usage: null,
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
