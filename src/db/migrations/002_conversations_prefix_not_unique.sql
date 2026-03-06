-- Make conversations.prefix_hash non-unique so multiple first-turn chats can coexist.
-- Prefix-to-chat resolution now uses history_prefixes for deterministic continuation.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS conversations_new (
    id TEXT PRIMARY KEY,
    prefix_hash TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

INSERT INTO conversations_new (id, prefix_hash, chat_id, created_at, updated_at)
SELECT id, prefix_hash, chat_id, created_at, updated_at
FROM conversations;

DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;

CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_prefix_hash ON conversations(prefix_hash);

COMMIT;
