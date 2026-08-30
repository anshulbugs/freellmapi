/**
 * Build a signed, statically-hostable catalog site.
 *
 * Output layout matches what catalog-sync.ts fetches:
 *   <out>/v1/latest    the catalog, byte-for-byte as signed
 *   <out>/_headers     x-catalog-signature (Cloudflare Pages / Netlify syntax)
 *
 * The signature covers the exact response bytes, so the file written here must
 * be served verbatim. Any host that rewrites the body — reformatting, appending
 * a newline — breaks verification, and the router fails closed and silently
 * stops updating. Hence the read-back check at the end.
 *
 * Usage:
 *   CATALOG_PRIVATE_KEY="$(cat key.pem)" \
 *     npm run build:catalog-site -w server -- --catalog catalog/data/catalog.live.json
 */
import fs from 'fs';
import path from 'path';
import { MIN_CATALOG_VERSION } from '../services/catalog-sync.js';
import { assertPublishableCatalog, signCatalogBytes, verifyCatalogBytes } from '../lib/catalog-signing.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function main(): void {
  const catalogPath = arg('catalog');
  if (!catalogPath) throw new Error('--catalog <path> is required');

  const privateKeyPem = process.env.CATALOG_PRIVATE_KEY?.trim()
    ?? (arg('key') ? fs.readFileSync(arg('key')!, 'utf8') : undefined);
  if (!privateKeyPem) throw new Error('CATALOG_PRIVATE_KEY or --key <file> is required');

  const publicKeyPem = process.env.CATALOG_PUBKEY?.replace(/\n/g, '\n');
  const outDir = arg('out') ?? 'catalog-site';

  // Read as bytes, never as parsed-and-reserialised JSON: the signature must
  // cover what is served, not an equivalent rendering of it.
  const bytes = fs.readFileSync(catalogPath);

  assertPublishableCatalog(bytes, MIN_CATALOG_VERSION);

  const signature = signCatalogBytes(bytes, privateKeyPem);

  fs.mkdirSync(path.join(outDir, 'v1'), { recursive: true });
  const latestPath = path.join(outDir, 'v1', 'latest');
  fs.writeFileSync(latestPath, bytes);

  fs.writeFileSync(path.join(outDir, '_headers'), [
    '/v1/latest',
    `  x-catalog-signature: ${signature}`,
    '  content-type: application/json',
    '',
  ].join('\n'));

  // Read back what was actually written and verify it the way the router will.
  // A mismatch here means the bytes changed between signing and landing on disk,
  // which would otherwise surface as an unexplained sync failure in production.
  if (publicKeyPem) {
    const written = fs.readFileSync(latestPath);
    if (!verifyCatalogBytes(written, signature, publicKeyPem)) {
      throw new Error('self-check FAILED: the written catalog does not verify against its signature');
    }
    console.log('self-check passed: written bytes verify against the signature');
  } else {
    console.log('note: set CATALOG_PUBKEY to enable the read-back self-check');
  }

  const parsed = JSON.parse(bytes.toString('utf8')) as { version: string; tier: string; models: unknown[] };
  console.log(`built ${outDir}/ — version ${parsed.version}, tier ${parsed.tier}, ${parsed.models.length} models`);
}

try {
  main();
} catch (err: any) {
  console.error(`build-catalog-site failed: ${err?.message ?? err}`);
  process.exitCode = 1;
}
