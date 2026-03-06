import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../db/connection.js";
import { UpstreamError, ValidationError } from "../../utils/errors.js";
import {
  V0APIError,
  deleteChat,
  getRateLimits,
  getChatMessages,
  getUserPlan,
  getUserBilling,
  getUsageReports,
} from "../../client/v0.js";
import {
  deleteConversationThread,
  findByChatId,
  getLatestCanonicalHistoryByChatId,
  listConversationsPage,
} from "../../db/repositories/conversations.js";

const QueryRequestSchema = z.object({
  query: z.string().min(1),
});

const ConversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ConversationMessagesParamsSchema = z.object({
  chatId: z.string().min(1),
});

const ConversationMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(150).default(100),
  cursor: z.string().min(1).optional(),
});

const BLOCKED_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "attach",
  "detach",
];

const RESULT_LIMIT = 200;

export async function internalRoutes(fastify: FastifyInstance) {
  fastify.get("/internal/capacity", async () => {
    const [rateLimits, plan, billing, usage] = await Promise.all([
      getRateLimits().catch(() => null),
      getUserPlan().catch(() => null),
      getUserBilling().catch(() => null),
      getUsageReports(20).catch(() => []),
    ]);

    return {
      rateLimits,
      plan,
      billing,
      usage: { recent: usage },
    };
  });

  fastify.get("/internal/db/schema", async () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    return { tables };
  });

  fastify.get("/internal/conversations", async (request) => {
    const result = ConversationsQuerySchema.safeParse(request.query);
    if (!result.success) {
      throw new ValidationError("Invalid request: " + result.error.message);
    }

    const { limit, offset } = result.data;
    const { data, total } = listConversationsPage(limit, offset);

    return {
      data,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + data.length < total,
      },
    };
  });

  fastify.get("/internal/conversations/:chatId/messages", async (request) => {
    const paramsResult = ConversationMessagesParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      throw new ValidationError("Invalid request: " + paramsResult.error.message);
    }

    const queryResult = ConversationMessagesQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw new ValidationError("Invalid request: " + queryResult.error.message);
    }

    const { chatId } = paramsResult.data;
    const { limit, cursor } = queryResult.data;

    try {
      const response = await getChatMessages(chatId, { limit, cursor });
      const upstreamMessages = response.data.map((message) => ({
        id: message.id,
        role: message.role,
        content: normalizeMessageContent(message.content),
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        finishReason: message.finishReason,
        attachments: message.attachments ?? [],
      }));

      if (!cursor) {
        const localSnapshot = getLatestCanonicalHistoryByChatId(chatId);
        if (localSnapshot && localSnapshot.length > upstreamMessages.length) {
          const conversation = findByChatId(chatId);
          return {
            data: mergeLocalSnapshotWithUpstream(
              chatId,
              localSnapshot,
              upstreamMessages,
              conversation?.createdAt ?? Date.now()
            ),
            pagination: { hasMore: false },
          };
        }
      }

      return {
        data: upstreamMessages,
        pagination: response.pagination ?? { hasMore: false },
      };
    } catch (error) {
      if (error instanceof V0APIError) {
        throw new UpstreamError(
          `Failed to fetch messages for chat '${chatId}': ${error.message}`,
          error.statusCode,
          typeof error.responseBody === "string"
            ? error.responseBody
            : JSON.stringify(error.responseBody ?? null)
        );
      }
      throw error;
    }
  });

  fastify.delete("/internal/conversations/:chatId", async (request) => {
    const paramsResult = ConversationMessagesParamsSchema.safeParse(request.params);
    if (!paramsResult.success) {
      throw new ValidationError("Invalid request: " + paramsResult.error.message);
    }

    const { chatId } = paramsResult.data;

    let upstreamDeleted = false;
    let upstreamSkippedNotFound = false;

    try {
      await deleteChat(chatId);
      upstreamDeleted = true;
    } catch (error) {
      if (error instanceof V0APIError && error.statusCode === 404) {
        upstreamSkippedNotFound = true;
      } else if (error instanceof V0APIError) {
        throw new UpstreamError(
          `Failed to delete chat '${chatId}' from v0: ${error.message}`,
          error.statusCode,
          typeof error.responseBody === "string"
            ? error.responseBody
            : JSON.stringify(error.responseBody ?? null)
        );
      } else {
        throw error;
      }
    }

    const local = deleteConversationThread(chatId);

    return {
      chatId,
      upstream: {
        deleted: upstreamDeleted,
        skippedNotFound: upstreamSkippedNotFound,
      },
      local,
    };
  });

  fastify.post("/internal/db/query", async (request, _reply) => {
    const result = QueryRequestSchema.safeParse(request.body);
    if (!result.success) {
      throw new ValidationError("Invalid request: " + result.error.message);
    }

    const { query } = result.data;
    const normalized = query.trim().toLowerCase();

    for (const keyword of BLOCKED_KEYWORDS) {
      if (normalized.includes(keyword)) {
        throw new ValidationError(`Write operations not allowed: ${keyword}`);
      }
    }

    if (!normalized.startsWith("select") && !normalized.startsWith("pragma")) {
      throw new ValidationError("Only SELECT and PRAGMA queries allowed");
    }

    const stmt = db.prepare(query);
    stmt.raw(true);
    const rows = stmt.all() as Record<string, unknown>[];

    const limited = rows.slice(0, RESULT_LIMIT);

    return {
      rows: limited,
      count: limited.length,
      total: rows.length,
    };
  });
}

type TranscriptMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
  updatedAt?: string;
  finishReason?: string;
  attachments: Array<{ url?: string; [key: string]: unknown }>;
};

function mergeLocalSnapshotWithUpstream(
  chatId: string,
  localSnapshot: Array<{ role: string; content: string }>,
  upstreamMessages: TranscriptMessage[],
  baseCreatedAt: number
): TranscriptMessage[] {
  const merged = localSnapshot.map((message, index) =>
    createSyntheticTranscriptMessage(chatId, message, baseCreatedAt, index)
  );

  let upstreamIndex = upstreamMessages.length - 1;
  for (let localIndex = localSnapshot.length - 1; localIndex >= 0; localIndex--) {
    const localMessage = localSnapshot[localIndex];
    const upstreamMessage = upstreamMessages[upstreamIndex];

    if (
      upstreamMessage &&
      upstreamMessage.role === localMessage.role &&
      upstreamMessage.content.trim() === localMessage.content.trim()
    ) {
      merged[localIndex] = {
        ...upstreamMessage,
        createdAt: new Date(baseCreatedAt + localIndex).toISOString(),
      };
      upstreamIndex -= 1;
    }
  }

  return merged;
}

function createSyntheticTranscriptMessage(
  chatId: string,
  message: { role: string; content: string },
  baseCreatedAt: number,
  index: number
): TranscriptMessage {
  return {
    id: `${chatId}:local:${index}`,
    role:
      message.role === "system" || message.role === "assistant"
        ? message.role
        : "user",
    content: message.content,
    createdAt: new Date(baseCreatedAt + index).toISOString(),
    attachments: [],
  };
}

function normalizeMessageContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as {
      parts?: Array<Record<string, unknown>>;
    };

    if (!parsed.parts || !Array.isArray(parsed.parts)) {
      return content;
    }

    const textParts = extractReadableParts(parsed.parts);
    if (textParts.length > 0) {
      return textParts.join("\n\n");
    }

    return content;
  } catch {
    return content;
  }
}

function extractReadableParts(parts: Array<Record<string, unknown>>): string[] {
  const collected: string[] = [];

  for (const part of parts) {
    const type = typeof part.type === "string" ? part.type : "";
    const partContent =
      typeof part.content === "string" ? part.content.trim() : "";
    const partText = typeof part.text === "string" ? part.text.trim() : "";

    if (
      (type === "mdx" || type === "text" || type === "markdown") &&
      partContent.length > 0
    ) {
      collected.push(partContent);
    } else if (
      (type === "text" || type === "text-delta") &&
      partText.length > 0
    ) {
      collected.push(partText);
    }

    if (Array.isArray(part.parts)) {
      collected.push(
        ...extractReadableParts(
          part.parts.filter(
            (child): child is Record<string, unknown> =>
              typeof child === "object" && child !== null
          )
        )
      );
    }
  }

  return collected;
}
