import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../../app.js';
import { initDb } from '../../db/index.js';
import { mintDashboardToken, isGatedApiPath } from '../helpers/auth.js';

const realFetch = globalThis.fetch;
let dashToken = '';
let feedFile = '';

const CANDIDATE = {
  id: 'example-ai',
  name: 'Example AI',
  signupUrl: 'https://example.ai/signup',
  baseUrl: 'https://api.example.ai/v1',
  authMode: 'bearer',
  addedAt: '2026-08-29',
};

async function request(app: Express, method: string, p: string, body?: unknown, auth = true) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(r => server.once('listening', () => r()));
  const addr = server.address() as any;
  const res = await realFetch(`http://127.0.0.1:${addr.port}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && isGatedApiPath(p) ? { Authorization: `Bearer ${dashToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => null);
  server.close();
  return { status: res.status, body: data as any };
}

beforeEach(() => {
  initDb(':memory:');
  dashToken = mintDashboardToken();
  feedFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cand-')), 'feed.json');
  fs.writeFileSync(feedFile, JSON.stringify([CANDIDATE]));
  process.env.FREEAPI_CANDIDATES_PATH = feedFile;
});

afterEach(() => {
  delete process.env.FREEAPI_CANDIDATES_PATH;
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('GET /api/keys/candidates', () => {
  it('requires dashboard auth', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/keys/candidates', undefined, false);
    expect(res.status).toBe(401);
  });

  it('lists the shipped candidates', async () => {
    const app = createApp();
    const res = await request(app, 'GET', '/api/keys/candidates');
    expect(res.status).toBe(200);
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0].signupUrl).toBe('https://example.ai/signup');
  });
});

describe('POST /api/keys/candidates/:id/verify', () => {
  it('404s an unknown candidate', async () => {
    const app = createApp();
    const res = await request(app, 'POST', '/api/keys/candidates/nope/verify', { apiKey: 'k' });
    expect(res.status).toBe(404);
  });

  // The whole point of addressing candidates by id: if a caller could name the
  // base URL, this route would be an open SSRF proxy that also accepts a
  // credential. A body-supplied baseUrl must be ignored entirely.
  it('ignores a baseUrl supplied by the caller and uses the feed entry', async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      seen.push(String(url));
      return new Response(JSON.stringify({}), { status: 401 });
    }) as any;

    const app = createApp();
    await request(app, 'POST', '/api/keys/candidates/example-ai/verify', {
      apiKey: 'k',
      baseUrl: 'https://attacker.example/v1',
    });

    expect(seen.some(u => u.includes('attacker.example'))).toBe(false);
    expect(seen.some(u => u.includes('api.example.ai'))).toBe(true);
  });
});
