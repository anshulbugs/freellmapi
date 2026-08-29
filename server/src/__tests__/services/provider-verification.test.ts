import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeAuthEnforcement } from '../../services/provider-verification.js';

// A candidate provider is only safe to connect if it actually ENFORCES the key
// the operator pasted. Several real endpoints in this catalog do not: the
// Pollinations note in providers/index.ts records a GET /v1/models that answers
// 200 for a revoked key, which makes a naive "the probe worked" check pass
// forever. So the verification sends a deliberately invalid key at the money
// path — chat/completions — and reads what comes back.

const ENDPOINT = 'http://127.0.0.1:18099/v1';
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stubStatus(status: number) {
  const mock = vi.fn(async () => new Response(JSON.stringify({}), {
    status,
    headers: { 'content-type': 'application/json' },
  }));
  globalThis.fetch = mock as any;
  return mock;
}

describe('probeAuthEnforcement', () => {
  it('fails the endpoint when a deliberately invalid key is accepted', async () => {
    stubStatus(200);

    const result = await probeAuthEnforcement(ENDPOINT);

    expect(result.outcome).toBe('fail');
  });

  it('passes the endpoint when an invalid key is rejected', async () => {
    stubStatus(401);

    const result = await probeAuthEnforcement(ENDPOINT);

    expect(result.outcome).toBe('pass');
  });

  // A rate limit says nothing about whether auth is enforced, and free tiers
  // rate-limit constantly. Blocking the connect on it would make the feature
  // unusable against exactly the providers it exists to onboard.
  it('reports inconclusive with the upstream status when rate limited', async () => {
    stubStatus(429);

    const result = await probeAuthEnforcement(ENDPOINT);

    expect(result.outcome).toBe('inconclusive');
    expect(result.status).toBe(429);
  });

  it('reports inconclusive instead of throwing when the endpoint is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as any;

    const result = await probeAuthEnforcement(ENDPOINT);

    expect(result.outcome).toBe('inconclusive');
    expect(result.reason).toContain('ECONNREFUSED');
  });
});
