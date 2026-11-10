import { describe, it, expect, beforeAll } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey } from '../../db/index.js';

async function request(app: Express, method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const url = `http://127.0.0.1:${addr.port}${path}`;

  const res = await fetch(url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.text();
  server.close();

  let json: any = null;
  try { json = JSON.parse(data); } catch {}

  return { status: res.status, body: json, headers: res.headers, raw: data };
}

describe('Proxy authentication and CORS', () => {
  let app: Express;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
  });

  it('requires the unified API key for loopback chat completions', async () => {
    const { status, body } = await request(app, 'POST', '/v1/chat/completions', {
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(status).toBe(401);
    expect(body.error.type).toBe('authentication_error');
  });

  // #103: Claude Code via CC Switch (and other Anthropic-format clients) send
  // the key in the `x-api-key` header, not as an Authorization bearer token.
  it('rejects a wrong key supplied via the x-api-key header', async () => {
    const { status, body } = await request(app, 'POST', '/v1/chat/completions', {
      messages: [{ role: 'user', content: 'hello' }],
    }, { 'x-api-key': 'freellmapi-wrong-key' });

    expect(status).toBe(401);
    expect(body.error.type).toBe('authentication_error');
  });

  it('accepts the unified key supplied via the x-api-key header', async () => {
    const { status, body } = await request(app, 'POST', '/v1/chat/completions', {
      messages: [{ role: 'user', content: 'hello' }],
    }, { 'x-api-key': getUnifiedApiKey() });

    // Auth passes — it gets past the 401 gate. (Routing then fails because no
    // provider keys are configured in this test DB, which is fine: we only
    // care that the x-api-key header authenticated.)
    expect(status).not.toBe(401);
    expect(body?.error?.type).not.toBe('authentication_error');
  });

  // Every surface authenticates with a header token (unified key or dashboard
  // session bearer) and nothing uses cookies, so an open origin policy grants a
  // foreign page nothing it couldn't already do with the key in hand.
  it('grants CORS access to any browser origin', async () => {
    const { status, headers } = await request(app, 'GET', '/api/ping', undefined, {
      Origin: 'https://some-app.example',
    });

    expect(status).toBe(200);
    expect(headers.get('access-control-allow-origin')).toBe('*');
    expect(headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('answers a cross-origin preflight for an authenticated proxy call', async () => {
    const { status, headers } = await request(app, 'OPTIONS', '/v1/chat/completions', undefined, {
      Origin: 'https://some-app.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type,x-api-key,anthropic-version',
    });

    expect(status).toBe(204);
    expect(headers.get('access-control-allow-origin')).toBe('*');
    expect(headers.get('access-control-allow-headers')).toBe('authorization,content-type,x-api-key,anthropic-version');
  });

  it('lets a public page preflight into a loopback install (Private Network Access)', async () => {
    const { headers } = await request(app, 'OPTIONS', '/v1/messages', undefined, {
      Origin: 'https://some-app.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Private-Network': 'true',
    });

    expect(headers.get('access-control-allow-private-network')).toBe('true');
  });

  it('exposes response headers such as X-Routed-Via to browser callers', async () => {
    const { headers } = await request(app, 'GET', '/api/ping', undefined, {
      Origin: 'https://some-app.example',
    });

    expect(headers.get('access-control-expose-headers')).toBe('*');
  });

  it("allows the locally served notebook origin through CORS, including the preflight for the chat route", async () => {
    const { headers } = await request(app, "OPTIONS", "/v1/chat/completions", undefined, {
      Origin: "http://127.0.0.1:8765",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    });

    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect((headers.get("access-control-allow-headers") ?? "").toLowerCase()).toContain("authorization");
  });
});
