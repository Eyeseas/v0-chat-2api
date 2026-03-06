import { db } from "../connection.js";
import type { CanonicalMessage, Conversation } from "../../types/conversation.js";

export function createConversation(
  prefixHash: string,
  chatId: string
): Conversation {
  const id = crypto.randomUUID();
  const now = Date.now();
  const stmt = db.prepare(
    "INSERT INTO conversations (id, prefix_hash, chat_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(id, prefixHash, chatId, now, now);
  return { id, prefixHash, chatId, createdAt: now, updatedAt: now };
}

export function findByPrefixHash(prefixHash: string): Conversation | null {
  const historyStmt = db.prepare(
    "SELECT chat_id FROM history_prefixes WHERE prefix_hash = ?"
  );
  const historyRow = historyStmt.get(prefixHash) as { chat_id: string } | undefined;

  if (historyRow?.chat_id) {
    const conversation = findByChatId(historyRow.chat_id);
    if (conversation) {
      return conversation;
    }

    return {
      id: historyRow.chat_id,
      prefixHash,
      chatId: historyRow.chat_id,
      createdAt: 0,
      updatedAt: 0,
    };
  }

  const stmt = db.prepare(
    "SELECT * FROM conversations WHERE prefix_hash = ? ORDER BY updated_at DESC LIMIT 1"
  );
  const row = stmt.get(prefixHash) as Record<string, unknown> | undefined;
  return row ? mapRowToConversation(row) : null;
}

export function findByChatId(chatId: string): Conversation | null {
  const stmt = db.prepare(
    "SELECT * FROM conversations WHERE chat_id = ? ORDER BY updated_at DESC LIMIT 1"
  );
  const row = stmt.get(chatId) as Record<string, unknown> | undefined;
  return row ? mapRowToConversation(row) : null;
}

export function listRecent(limit: number = 50): Conversation[] {
  const stmt = db.prepare(
    "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?"
  );
  const rows = stmt.all(limit) as Record<string, unknown>[];
  return rows.map(mapRowToConversation);
}

export function listConversationsPage(
  limit: number,
  offset: number
): { data: Conversation[]; total: number } {
  const totalStmt = db.prepare("SELECT COUNT(*) as total FROM conversations");
  const totalRow = totalStmt.get() as { total: number } | undefined;
  const total = totalRow?.total ?? 0;

  const stmt = db.prepare(
    "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  );
  const rows = stmt.all(limit, offset) as Record<string, unknown>[];

  return {
    data: rows.map(mapRowToConversation),
    total,
  };
}

export function deleteConversationThread(chatId: string): {
  conversationsDeleted: number;
  historyPrefixesDeleted: number;
  auditRowsDeleted: number;
} {
  const transaction = db.transaction(() => {
    const conversationIds = db
      .prepare("SELECT id FROM conversations WHERE chat_id = ?")
      .all(chatId) as Array<{ id: string }>;

    let auditRowsDeleted = 0;
    if (conversationIds.length > 0) {
      const deleteAuditStmt = db.prepare(
        "DELETE FROM requests_audit WHERE conversation_id = ?"
      );
      for (const conversation of conversationIds) {
        const result = deleteAuditStmt.run(conversation.id);
        auditRowsDeleted += result.changes;
      }
    }

    const historyResult = db
      .prepare("DELETE FROM history_prefixes WHERE chat_id = ?")
      .run(chatId);

    const conversationResult = db
      .prepare("DELETE FROM conversations WHERE chat_id = ?")
      .run(chatId);

    return {
      conversationsDeleted: conversationResult.changes,
      historyPrefixesDeleted: historyResult.changes,
      auditRowsDeleted,
    };
  });

  return transaction();
}

export function upsertHistoryPrefix(
  prefixHash: string,
  chatId: string,
  canonicalMessages: CanonicalMessage[]
): void {
  const stmt = db.prepare(
    `
      INSERT INTO history_prefixes (prefix_hash, chat_id, canonical_messages, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(prefix_hash) DO UPDATE SET
        chat_id = excluded.chat_id,
        canonical_messages = excluded.canonical_messages
    `
  );

  stmt.run(prefixHash, chatId, JSON.stringify(canonicalMessages), Date.now());
}

export function getLatestCanonicalHistoryByChatId(
  chatId: string
): CanonicalMessage[] | null {
  const stmt = db.prepare(
    `
      SELECT canonical_messages
      FROM history_prefixes
      WHERE chat_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  const row = stmt.get(chatId) as
    | { canonical_messages: string }
    | undefined;

  if (!row?.canonical_messages) {
    return null;
  }

  return JSON.parse(row.canonical_messages) as CanonicalMessage[];
}

export function touchConversation(chatId: string): void {
  const stmt = db.prepare(
    "UPDATE conversations SET updated_at = ? WHERE chat_id = ?"
  );
  stmt.run(Date.now(), chatId);
}

function mapRowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    prefixHash: String(row.prefix_hash),
    chatId: String(row.chat_id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}
