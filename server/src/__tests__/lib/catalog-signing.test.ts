import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { generateCatalogKeypair, signCatalogBytes, verifyCatalogBytes, assertPublishableCatalog } from '../../lib/catalog-signing.js';

// Mirrors what catalog-sync.ts does on the client: crypto.verify(null, bytes,
// publicKey, signature) over the EXACT response bytes. If signing and
// verification disagree by even a byte — a re-serialised JSON, a trailing
// newline added by a static host — every sync fails closed and the router
// silently stops receiving catalog updates.

describe('catalog signing', () => {
  it('produces a signature the client-side verify accepts', () => {
    const { privateKeyPem, publicKeyPem } = generateCatalogKeypair();
    const bytes = Buffer.from('{"version":"2026.09.01","tier":"monthly","models":[],"quirks":[]}');

    const signature = signCatalogBytes(bytes, privateKeyPem);

    const verified = crypto.verify(
      null,
      bytes,
      crypto.createPublicKey({ key: publicKeyPem, format: 'pem' }),
      Buffer.from(signature, 'base64'),
    );
    expect(verified).toBe(true);
  });

  it('rejects a body altered after signing', () => {
    const { privateKeyPem, publicKeyPem } = generateCatalogKeypair();
    const bytes = Buffer.from('{"version":"2026.09.01","tier":"monthly","models":[],"quirks":[]}');
    const signature = signCatalogBytes(bytes, privateKeyPem);

    const tampered = Buffer.from(bytes.toString().replace('monthly', 'live'));

    expect(verifyCatalogBytes(tampered, signature, publicKeyPem)).toBe(false);
  });

  it('round-trips through its own verifier', () => {
    const { privateKeyPem, publicKeyPem } = generateCatalogKeypair();
    const bytes = Buffer.from('payload');

    expect(verifyCatalogBytes(bytes, signCatalogBytes(bytes, privateKeyPem), publicKeyPem)).toBe(true);
  });
});

// catalog-sync.ts:556 prunes every source='catalog' model the applied catalog
// does not list. A catalog is therefore a full replacement, not a patch, and
// publishing one with an empty models array would delete the router's entire
// model list on the next sync. That is a one-way door on a live install, so it
// is refused at build time rather than discovered afterwards.

const MIN = '2026.06.07';

function catalog(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    version: '2026.09.01',
    tier: 'monthly',
    models: [{ platform: 'groq', modelId: 'x' }],
    quirks: [],
    ...overrides,
  }));
}

describe('assertPublishableCatalog', () => {
  it('accepts a catalog that lists models', () => {
    expect(() => assertPublishableCatalog(catalog(), MIN)).not.toThrow();
  });

  it('refuses an empty catalog, naming the prune it would cause', () => {
    expect(() => assertPublishableCatalog(catalog({ models: [] }), MIN)).toThrow(/prune|delete/i);
  });

  it('refuses a version the router would ignore as older than its baseline', () => {
    expect(() => assertPublishableCatalog(catalog({ version: '2026.01.01' }), MIN)).toThrow(/version/i);
  });

  it('refuses a payload the router would reject as malformed', () => {
    expect(() => assertPublishableCatalog(Buffer.from('{"nope":true}'), MIN)).toThrow();
  });
});
