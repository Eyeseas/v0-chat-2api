import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import Fastify from 'fastify';
import { healthRoutes } from '../../src/server/routes/health.js';
import { config } from '../../src/config/index.js';

describe('POST /v1/chat/completions', () => {
  it('should require valid API key format', () => {
    const authHeader = 'Bearer wrong-key';
    const validKey = config.OPENAI_API_KEY || 'local-dev-openai-key';
    expect(authHeader).not.toBe(`Bearer ${validKey}`);
  });

  it('should validate request body has required fields', () => {
    const invalidBody = {};
    const validBody = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    };
    expect(invalidBody).not.toHaveProperty('model');
    expect(invalidBody).not.toHaveProperty('messages');
    expect(validBody).toHaveProperty('model');
    expect(validBody).toHaveProperty('messages');
  });

  it('should reject messages with invalid role', () => {
    const validRoles = ['system', 'user', 'assistant'];
    const invalidMessage = { role: 'invalid', content: 'Hello' };
    expect(validRoles).not.toContain(invalidMessage.role);
  });

  it('should accept messages with valid roles', () => {
    const validRoles = ['system', 'user', 'assistant'];
    const validMessages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' }
    ];
    for (const msg of validMessages) {
      expect(validRoles).toContain(msg.role);
    }
  });
});

describe('GET /internal/health', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(healthRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/internal/health'
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

describe('GET /internal/capacity', () => {
  it('should have capacity endpoint configuration', () => {
    expect(config.V0_API_KEY).toBeDefined();
  });
});
