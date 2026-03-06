import { createHash } from "crypto";
import type { CanonicalMessage } from "../types/conversation.js";

/**
 * Creates a stable canonical string representation of messages.
 * Uses deterministic JSON serialization with sorted keys.
 */
export function canonicalizeMessages(messages: CanonicalMessage[]): string {
  // Stable JSON representation - only include role and content for hashing
  const canonical = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Use stable stringify with sorted keys for determinism
  return JSON.stringify(canonical, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value)
        .sort()
        .reduce((sorted, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {} as Record<string, unknown>);
    }
    return value;
  });
}

/**
 * Computes SHA-256 hash of all messages except the last one.
 * This represents the "prefix" of the conversation.
 * Returns empty string for single-message conversations.
 */
export function computePrefixHash(messages: CanonicalMessage[]): string {
  if (messages.length <= 1) {
    // First turn (no prefix) - return empty hash
    return "";
  }

  const prefix = messages.slice(0, -1);
  const canonical = canonicalizeMessages(prefix);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Computes SHA-256 hash of all messages (full conversation).
 */
export function computeFullHash(messages: CanonicalMessage[]): string {
  const canonical = canonicalizeMessages(messages);
  return createHash("sha256").update(canonical).digest("hex");
}
