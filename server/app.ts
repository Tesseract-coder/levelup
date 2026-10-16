import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import compress from '@fastify/compress';
import { constants as zlib } from 'node:zlib';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { z } from 'zod';
import {
  ActivityParseWire,
  FoodParseWire,
  ParseActivityRequest,
  ParseFoodRequest,
  SuggestRequest,
  SuggestWire,
  SummaryRequest,
  SummaryWire,
  sanitizeActivityEntries,
  sanitizeFoodItems,
  sanitizeIdeas,
  validateSummary,
} from '../shared/schemas.ts';
import { AIError, aiConfigured, cacheKey, MODEL, structured } from './ai.ts';
import { ACTIVITY_SYSTEM, FOOD_SYSTEM, SUGGEST_SYSTEM, SUMMARY_SYSTEM } from './prompts.ts';

function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body);
  if (!r.success) throw new AIError(`Invalid request: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`, 400, 'bad_request');
  return r.data;
}

export async function buildApp(opts: { logger?: boolean; serveStatic?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? true,
    bodyLimit: 16 * 1024, // requests are small text; reject anything larger
    connectionTimeout: 60_000,
    requestTimeout: 60_000,
    trustProxy: true,
  });

  await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_PER_MIN || 30),
    timeWindow: '1 minute',
    // only the AI endpoints are rate limited — never static assets, the SW, or the health check
    allowList: (req) => !req.url.startsWith('/api/') || req.url === '/api/health',
  });

  const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && allowed.includes(origin)) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'origin');
      reply.header('access-control-allow-headers', 'content-type');
    }
    if (req.method === 'OPTIONS') return reply.code(204).send();
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AIError) return reply.code(err.status).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 413) return reply.code(413).send({ error: 'too_large', message: 'Request too large' });
    if (status === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Too many requests — please wait a minute' });
    app.log.error(err);
    return reply.code(status).send({ error: 'server_error', message: status >= 500 ? 'Server error' : (err as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true, ai: aiConfigured(), model: aiConfigured() ? MODEL : null }));

  app.post('/api/parse-food', async (req) => {
    const body = parseBody(ParseFoodRequest, req.body);
    const user = [
      body.defaultMeal ? `Default meal for unlabeled items: ${body.defaultMeal}` : null,
      body.diet ? `Diet preference: ${body.diet}` : null,
      `Food description:\n"""${body.text}"""`,
    ]
      .filter(Boolean)
      .join('\n');
    const { value, model, cached } = await structured({
      system: FOOD_SYSTEM,
      user,
      schema: FoodParseWire,
      cacheId: cacheKey('food', body),
      validate: (v) => (v.items.length === 0 ? 'no food items were returned' : null),
    });
    const items = sanitizeFoodItems(value);
    if (!items.length) throw new AIError('No usable items', 502, 'ai_empty');
    return { items, source: 'ai', model, cached };
  });

  app.post('/api/parse-activity', async (req) => {
    const body = parseBody(ParseActivityRequest, req.body);
    const { value, model } = await structured({
      system: ACTIVITY_SYSTEM,
      user: `Tracked activities:\n${JSON.stringify(body.activities)}\n\nNote:\n"""${body.text}"""`,
      schema: ActivityParseWire,
      cacheId: cacheKey('activity', body),
    });
    return { entries: sanitizeActivityEntries(value, new Set(body.activities.map((a) => a.id))), source: 'ai', model };
  });

  app.post('/api/summary', async (req) => {
    const body = parseBody(SummaryRequest, req.body);
    const { value, model } = await structured({
      system: SUMMARY_SYSTEM,
      user: `Summary type: ${body.kind}\nUser goal: ${body.goal}\n\nFacts:\n${body.facts.map((f) => `[${f.id}] ${f.text}`).join('\n')}\n\nCandidate wins: ${body.candidates.wins.join(', ') || 'none'}\nCandidate misses: ${body.candidates.misses.join(', ') || 'none'}\nCandidate improvements: ${body.candidates.improvements.join(', ') || 'none'}\nSuggested focus fact: ${body.candidates.focus ?? 'none'}`,
      schema: SummaryWire,
      effort: 'medium',
      cacheId: cacheKey('summary', body),
      validate: (v) => {
        const r = validateSummary(v, body.facts);
        return r.ok ? null : r.problems.slice(0, 3).join('; ');
      },
    });
    return { summary: value, model };
  });

  app.post('/api/suggest', async (req) => {
    const body = parseBody(SuggestRequest, req.body);
    const { value, model } = await structured({
      system: SUGGEST_SYSTEM,
      user: `Goal: ${body.goal}\nDiet: ${body.diet}\nAvoid: ${body.avoid.join(', ') || 'nothing'}\nProtein still needed today: ${body.proteinGapG} g\nCalories left today: ${body.caloriesLeft}\nMeal slot: ${body.mealSlot ?? 'any'}`,
      schema: SuggestWire,
      cacheId: cacheKey('suggest', body),
    });
    return { ideas: sanitizeIdeas(value), model };
  });

  app.all('/api/*', async (_req, reply) => reply.code(404).send({ error: 'not_found' }));

  // Optional: serve the built PWA from the same origin in production.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  if (opts.serveStatic !== false && existsSync(dist)) {
    // brotli/gzip on the fly (moderate brotli quality keeps CPU low)
    await app.register(compress, { global: true, threshold: 1024, brotliOptions: { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } } });
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: false,
      cacheControl: false, // we set our own headers below
      setHeaders(res, filePath) {
        // hashed build assets never change; the shell and service worker must always revalidate
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        else res.setHeader('cache-control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
