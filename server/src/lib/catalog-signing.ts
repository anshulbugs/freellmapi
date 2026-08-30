import crypto from 'crypto';

/**
 * Ed25519 signing for a self-hosted catalog.
 *
 * catalog-sync.ts verifies with `crypto.verify(null, bytes, key, signature)`
 * over the exact bytes of the HTTP response, and discards anything that does
 * not verify. That fail-closed posture is the point — a compromised CDN cannot
 * inject models or quirks into the router — but it also means signing must
 * cover the byte sequence actually served, not a re-serialised copy of it.
 */

export interface CatalogKeypair {
  privateKeyPem: string;
  publicKeyPem: string;
}

/**
 * Mint a catalog signing keypair.
 *
 * @returns PEM-encoded private and public halves. The private half signs
 *   releases and must never reach the server that serves them; the public half
 *   goes in the router's CATALOG_PUBKEY.
 */
export function generateCatalogKeypair(): CatalogKeypair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/**
 * Sign catalog bytes.
 *
 * @param bytes - Exactly the bytes that will be served as the response body.
 * @param privateKeyPem - PKCS#8 PEM private key.
 * @returns Base64 signature for the `x-catalog-signature` header.
 */
export function signCatalogBytes(bytes: Buffer, privateKeyPem: string): string {
  const key = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' });
  // `null` algorithm: Ed25519 hashes internally, and passing a digest name here
  // is what the client does too — they must match or every verify fails.
  return crypto.sign(null, bytes, key).toString('base64');
}

/**
 * Verify catalog bytes the same way the router will.
 *
 * @returns True when the signature covers exactly these bytes.
 */
export function verifyCatalogBytes(bytes: Buffer, signature: string, publicKeyPem: string): boolean {
  try {
    const key = crypto.createPublicKey({ key: publicKeyPem, format: 'pem' });
    return crypto.verify(null, bytes, key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

/**
 * Refuse to publish a catalog that would damage a router applying it.
 *
 * catalog-sync.ts treats an applied catalog as the complete truth and deletes
 * every source='catalog' model missing from it, so publishing an empty or
 * malformed catalog wipes the model list on every install that syncs. There is
 * no undo once a signed catalog is fetched, which is why this is a hard failure
 * at build time rather than a warning.
 *
 * @param bytes - The exact bytes about to be signed.
 * @param minVersion - The router's MIN_CATALOG_VERSION.
 * @throws If the payload is malformed, older than the baseline, or lists no models.
 */
export function assertPublishableCatalog(bytes: Buffer, minVersion: string): void {
  let parsed: { version?: unknown; tier?: unknown; models?: unknown; quirks?: unknown };
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('catalog is not valid JSON');
  }

  if (typeof parsed.version !== 'string') throw new Error('catalog is missing a string version');
  if (parsed.tier !== 'live' && parsed.tier !== 'monthly') {
    throw new Error("catalog tier must be 'live' or 'monthly'");
  }
  if (!Array.isArray(parsed.models)) throw new Error('catalog is missing a models array');
  if (!Array.isArray(parsed.quirks)) throw new Error('catalog is missing a quirks array');

  // Lexicographic compare is sound for YYYY.MM.DD and is what the router uses.
  if (parsed.version < minVersion) {
    throw new Error(
      `catalog version ${parsed.version} is older than the router baseline ${minVersion}; it would be ignored as skipped_older`,
    );
  }

  if (parsed.models.length === 0) {
    throw new Error(
      'catalog lists no models: applying it would prune and delete every catalog-managed model on each router that syncs',
    );
  }
}
