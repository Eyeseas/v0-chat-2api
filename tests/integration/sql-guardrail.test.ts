import { describe, it, expect } from 'bun:test';
import { z } from 'zod';

const QueryRequestSchema = z.object({
  query: z.string().min(1),
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

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function validateQuery(body: unknown) {
  const result = QueryRequestSchema.safeParse(body);
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

  return { query, normalized };
}

describe('SQL Guardrails', () => {
  it('should block INSERT', () => {
    expect(() => validateQuery({ query: 'INSERT INTO test VALUES (1)' }))
      .toThrow(ValidationError);
  });

  it('should block DELETE', () => {
    expect(() => validateQuery({ query: 'DELETE FROM conversations' }))
      .toThrow(ValidationError);
  });

  it('should block UPDATE', () => {
    expect(() => validateQuery({ query: 'UPDATE conversations SET chatId = "test"' }))
      .toThrow(ValidationError);
  });

  it('should block DROP', () => {
    expect(() => validateQuery({ query: 'DROP TABLE conversations' }))
      .toThrow(ValidationError);
  });

  it('should block CREATE', () => {
    expect(() => validateQuery({ query: 'CREATE TABLE test (id INTEGER)' }))
      .toThrow(ValidationError);
  });

  it('should block ALTER', () => {
    expect(() => validateQuery({ query: 'ALTER TABLE conversations ADD COLUMN test TEXT' }))
      .toThrow(ValidationError);
  });

  it('should allow SELECT', () => {
    expect(() => validateQuery({ query: 'SELECT * FROM conversations LIMIT 1' }))
      .not.toThrow();
  });

  it('should allow PRAGMA queries', () => {
    expect(() => validateQuery({ query: 'PRAGMA table_info(conversations)' }))
      .not.toThrow();
  });

  it('should be case-insensitive for blocked keywords', () => {
    expect(() => validateQuery({ query: 'delete FROM conversations WHERE 1=1' }))
      .toThrow(ValidationError);
  });

  it('should block ATTACH', () => {
    expect(() => validateQuery({ query: 'ATTACH DATABASE "test.db" AS test' }))
      .toThrow(ValidationError);
  });

  it('should block DETACH', () => {
    expect(() => validateQuery({ query: 'DETACH DATABASE test' }))
      .toThrow(ValidationError);
  });

  it('should reject non-SELECT/PRAGMA queries', () => {
    expect(() => validateQuery({ query: 'VACUUM' }))
      .toThrow(ValidationError);
  });

  it('should reject empty queries', () => {
    expect(() => validateQuery({ query: '' }))
      .toThrow(ValidationError);
  });

  it('should reject missing query field', () => {
    expect(() => validateQuery({}))
      .toThrow(ValidationError);
  });
});
