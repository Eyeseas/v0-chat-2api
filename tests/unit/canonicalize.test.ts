import { describe, it, expect } from 'bun:test';
import { canonicalizeMessages, computePrefixHash, computeFullHash } from '../../src/utils/canonicalize.js';

describe('canonicalize', () => {
  it('should produce same hash for identical messages', () => {
    const msgs = [{ role: 'user', content: 'Hello' }];
    const hash1 = computePrefixHash([...msgs, { role: 'assistant', content: 'Hi' }]);
    const hash2 = computePrefixHash([...msgs, { role: 'assistant', content: 'Hi' }]);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different messages', () => {
    const hash1 = computePrefixHash([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Response 1' }
    ]);
    const hash2 = computePrefixHash([
      { role: 'user', content: 'World' },
      { role: 'assistant', content: 'Response 2' }
    ]);
    expect(hash1).not.toBe(hash2);
  });

  it('should return empty hash for single message', () => {
    const hash = computePrefixHash([{ role: 'user', content: 'Hello' }]);
    expect(hash).toBe('');
  });

  it('should produce consistent full hashes for identical conversations', () => {
    const msgs = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ];
    const hash1 = computeFullHash(msgs);
    const hash2 = computeFullHash(msgs);
    expect(hash1).toBe(hash2);
  });

  it('should produce different full hashes for different conversations', () => {
    const msgs1 = [{ role: 'user', content: 'Hello' }];
    const msgs2 = [{ role: 'user', content: 'World' }];
    const hash1 = computeFullHash(msgs1);
    const hash2 = computeFullHash(msgs2);
    expect(hash1).not.toBe(hash2);
  });

  it('should canonicalize messages with sorted keys', () => {
    const msgs = [{ content: 'Hello', role: 'user' }];
    const canonical = canonicalizeMessages(msgs);
    expect(canonical).toBe('[{"content":"Hello","role":"user"}]');
  });

  it('should handle system messages in prefix hash', () => {
    const msgs = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' }
    ];
    const hash = computePrefixHash(msgs);
    expect(hash).not.toBe('');
  });

  it('should exclude last message from prefix hash', () => {
    const msgs = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Response' },
      { role: 'user', content: 'Follow-up' }
    ];
    const prefixHash = computePrefixHash(msgs);
    const fullHash = computeFullHash(msgs);
    expect(prefixHash).not.toBe(fullHash);
    expect(prefixHash).not.toBe('');
  });
});
