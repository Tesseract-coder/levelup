// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.RATE_LIMIT_PER_MIN = '5';
  const { buildApp } = await import('../../server/app.ts');
  app = await buildApp({ logger: false, serveStatic: false });
});
afterAll(() => app.close());

describe('AI proxy', () => {
  it('reports health without exposing the key', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, ai: false, model: null });
  });
  it('rejects malformed requests with 400', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/parse-food', payload: { text: '' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('bad_request');
    const s = await app.inject({ method: 'POST', url: '/api/summary', payload: { kind: 'month', goal: 'x', facts: [], candidates: {} } });
    expect(s.statusCode).toBe(400);
  });
  it('enforces the request size limit', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/parse-food', payload: { text: 'a'.repeat(20_000) } });
    expect(r.statusCode).toBe(413);
  });
  it('returns 503 ai_unavailable (so the client falls back) when no key is configured', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/parse-food', payload: { text: '2 rotis and dal' } });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toBe('ai_unavailable');
  });
  it('404s unknown API routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/nope' })).statusCode).toBe(404);
  });
  it('rate limits /api but never the health check', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await app.inject({ method: 'POST', url: '/api/suggest', payload: {} })).statusCode);
    expect(codes).toContain(429);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
  });
});
