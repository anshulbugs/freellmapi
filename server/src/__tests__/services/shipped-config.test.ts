import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { applyDeclarativeConfig } from '../../services/declarative-config.js';
import { initDb } from '../../db/index.js';

// The shipped config re-declares models that catalog sync prunes. The free
// monthly catalog omits GitHub Models, and applyCatalog deletes every
// source='catalog' row the applied catalog does not list -- including the two
// GitHub rows the bundled baseline ships. Declaring them here rewrites them as
// source='user', which catalog sync is required to leave alone.
//
// A malformed config throws on boot, so it is validated here rather than in
// production.

const CONFIG_PATH = new URL('../../../../shared/freellmapi.config.json', import.meta.url);

describe('shipped declarative config', () => {
  it('applies cleanly and declares the pruned GitHub models', () => {
    initDb(':memory:');
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    const result = applyDeclarativeConfig(raw, 'shipped');

    expect(result.warnings).toEqual([]);
    expect(result.models).toBe(2);
  });
});
