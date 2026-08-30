import { afterEach, describe, expect, it } from 'vitest';
import { initDb, getDb, getUnifiedApiKey } from '../../db/index.js';
import { applyEnvBootstrap } from '../../services/env-bootstrap.js';
import { userCount, verifyCredentials } from '../../services/auth.js';

// Makes the database disposable. On a host with no persistent disk, everything
// that must outlive a container comes from env instead: provider keys already
// do via declarative config, but the unified API key regenerates on every boot
// (db/index.ts:233) -- breaking every client pointed at the router -- and the
// dashboard account has to be re-claimed with a setup code each time.

const VARS = ['FREEAPI_UNIFIED_KEY', 'FREEAPI_ADMIN_EMAIL', 'FREEAPI_ADMIN_PASSWORD'];
const ORIGINAL = Object.fromEntries(VARS.map(v => [v, process.env[v]]));

afterEach(() => {
  for (const v of VARS) {
    if (ORIGINAL[v] === undefined) delete process.env[v];
    else process.env[v] = ORIGINAL[v]!;
  }
});

describe('applyEnvBootstrap', () => {
  it('pins the unified API key so clients survive a redeploy', () => {
    initDb(':memory:');
    process.env.FREEAPI_UNIFIED_KEY = 'freellmapi-pinned-value-for-clients';

    applyEnvBootstrap();

    expect(getUnifiedApiKey()).toBe('freellmapi-pinned-value-for-clients');
  });

  it('creates the dashboard account when the database is empty', async () => {
    initDb(':memory:');
    process.env.FREEAPI_ADMIN_EMAIL = 'owner@example.com';
    process.env.FREEAPI_ADMIN_PASSWORD = 'correct horse battery';

    applyEnvBootstrap();

    expect(userCount()).toBe(1);
    expect(await verifyCredentials('owner@example.com', 'correct horse battery')).toBeTruthy();
  });

  // Re-creating it would fail on the unique email; silently resetting the
  // password would let a stale env var overwrite one changed in the dashboard.
  it('leaves an existing account alone', () => {
    initDb(':memory:');
    process.env.FREEAPI_ADMIN_EMAIL = 'owner@example.com';
    process.env.FREEAPI_ADMIN_PASSWORD = 'correct horse battery';
    applyEnvBootstrap();

    expect(() => applyEnvBootstrap()).not.toThrow();
    expect(userCount()).toBe(1);
  });

  it('does nothing when no bootstrap vars are set', () => {
    initDb(':memory:');
    const before = getUnifiedApiKey();

    applyEnvBootstrap();

    expect(getUnifiedApiKey()).toBe(before);
    expect(userCount()).toBe(0);
  });
});
