import type { CanonicalMessage } from "../types/conversation.js";
import { computePrefixHash } from "./canonicalize.js";

export interface ConversationRepository {
  findByPrefixHash(prefixHash: string): Promise<string | null>;
  create(prefixHash: string, canonicalMessages: CanonicalMessage[]): Promise<string>;
}

export class StrictPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrictPolicyError";
  }
}

export interface ResolveResult {
  chatId: string | null;
  isNew: boolean;
}

/**
 * Resolves a chatId for the given messages using the conversation repository.
 *
 * Logic:
 * - First turn (no prefix / empty prefix hash): Create new chat
 * - Known prefix (found in repository): Return existing chatId
 * - Unknown prefix + strictMode: Throw StrictPolicyError
 * - Unknown prefix + !strictMode: Create new chat (fallback)
 */
export async function resolveChatId(
  messages: CanonicalMessage[],
  repository: ConversationRepository,
  strictMode: boolean
): Promise<ResolveResult> {
  const prefixHash = computePrefixHash(messages);

  // First turn (no prefix): create new
  if (prefixHash === "") {
    const chatId = await repository.create(prefixHash, messages);
    return { chatId, isNew: true };
  }

  // Check if prefix exists in repository
  const existingChatId = await repository.findByPrefixHash(prefixHash);

  if (existingChatId) {
    // Known prefix: return existing chatId
    return { chatId: existingChatId, isNew: false };
  }

  // Unknown prefix
  if (strictMode) {
    // Strict mode: throw error on unknown prefix
    throw new StrictPolicyError(
      `Unknown conversation prefix. No existing chat found for prefix hash: ${prefixHash}`
    );
  }

  // Fallback mode: create new chat
  const chatId = await repository.create(prefixHash, messages);
  return { chatId, isNew: true };
}
