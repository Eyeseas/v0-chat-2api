-- Initial migration: Create conversation state tables

-- conversations table: Maps conversation IDs to chat IDs with prefix-based deduplication
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    prefix_hash TEXT UNIQUE NOT NULL,
    chat_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- history_prefixes table: Maps message history prefixes to chat IDs for deduplication
CREATE TABLE IF NOT EXISTS history_prefixes (
    prefix_hash TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    canonical_messages TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- requests_audit table: Audit log for all API requests
CREATE TABLE IF NOT EXISTS requests_audit (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    request_body TEXT,
    response_status INTEGER,
    created_at INTEGER NOT NULL
);

-- migrations table: Track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
);

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_history_prefixes_chat_id ON history_prefixes(chat_id);
CREATE INDEX IF NOT EXISTS idx_requests_audit_conversation_id ON requests_audit(conversation_id);
CREATE INDEX IF NOT EXISTS idx_requests_audit_created_at ON requests_audit(created_at);
