/**
 * Mint a catalog signing keypair.
 *
 * The private half signs releases and belongs in a secret store or on your
 * machine — never on the host that serves the catalog, since the whole point of
 * signing is that compromising the CDN does not let anyone forge a catalog.
 * The public half goes in the router's CATALOG_PUBKEY.
 */
import { generateCatalogKeypair } from '../lib/catalog-signing.js';

const { privateKeyPem, publicKeyPem } = generateCatalogKeypair();

console.log('# CATALOG_PRIVATE_KEY (keep secret — signing only)');
console.log(privateKeyPem.trim());
console.log();
console.log('# CATALOG_PUBKEY (set on the router)');
console.log(publicKeyPem.trim());
console.log();
console.log('# For an env var, collapse newlines to \n — catalog-sync expands them back.');
console.log(`CATALOG_PUBKEY="${publicKeyPem.trim().replace(/\n/g, '\n')}"`);
