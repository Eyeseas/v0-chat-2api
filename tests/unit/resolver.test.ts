import { describe, it, expect } from 'bun:test';
import { resolveChatId, StrictPolicyError } from '../../src/utils/resolver.js';

describe('resolver', () => {
  it('should create new chat for first turn', async () => {
    const repo = {
      findByPrefixHash: async () => null,
      create: async () => 'chat_123',
    };
    const result = await resolveChatId([{ role: 'user', content: 'Hello' }], repo, true);
    expect(result.isNew).toBe(true);
    expect(result.chatId).toBe('chat_123');
  });

  it('should return existing chat for known prefix', async () => {
    const repo = {
      findByPrefixHash: async () => 'chat_123',
      create: async () => 'chat_new',
    };
    const result = await resolveChatId([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Again' }
    ], repo, true);
    expect(result.isNew).toBe(false);
    expect(result.chatId).toBe('chat_123');
  });

  it('should throw StrictPolicyError for unknown prefix in strict mode', async () => {
    const repo = {
      findByPrefixHash: async () => null,
      create: async () => 'chat_new',
    };
    await expect(
      resolveChatId([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Unknown' }
      ], repo, true)
    ).rejects.toThrow(StrictPolicyError);
  });

  it('should create new chat for unknown prefix when not in strict mode', async () => {
    const repo = {
      findByPrefixHash: async () => null,
      create: async () => 'chat_new',
    };
    const result = await resolveChatId([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Unknown' }
    ], repo, false);
    expect(result.isNew).toBe(true);
    expect(result.chatId).toBe('chat_new');
  });

  it('should pass prefix hash to create method', async () => {
    let capturedPrefixHash: string | null = null;
    const repo = {
      findByPrefixHash: async () => null,
      create: async (prefixHash: string) => {
        capturedPrefixHash = prefixHash;
        return 'chat_123';
      },
    };
    await resolveChatId([{ role: 'user', content: 'Hello' }], repo, true);
    expect(capturedPrefixHash).toBe('');
  });

  it('should pass messages to create method', async () => {
    let capturedMessages: any[] = [];
    const repo = {
      findByPrefixHash: async () => null,
      create: async (_prefixHash: string, messages: any[]) => {
        capturedMessages = messages;
        return 'chat_123';
      },
    };
    const inputMessages = [{ role: 'user', content: 'Hello' }];
    await resolveChatId(inputMessages, repo, true);
    expect(capturedMessages).toEqual(inputMessages);
  });
});
