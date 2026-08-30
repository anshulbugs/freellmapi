/**
 * Recover provider keys from an encrypted backup into a declarative config.
 *
 * Written for the failure this repo hit in production: on a diskless host the
 * database is disposable, and a backup that goes stale takes the provider keys
 * with it. The keys themselves are still recoverable from any copy of the
 * backup -- including an older revision in the Hugging Face dataset, since each
 * upload is a commit -- so this turns one back into a config file that seeds
 * them on every boot and can never be lost the same way again.
 *
 * Usage:
 *   ENCRYPTION_KEY=<64 hex> npm run recover:keys -w server -- \
 *     --backup path/to/freellmapi.db.enc --out freellmapi.config.json
 */
import crypto from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import { gunzipSync } from 'zlib';
import { decrypt, initEncryptionKey } from '../lib/crypto.js';

const MAGIC = Buffer.from('FAPIBK1\0');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function decryptBackup(payload: Buffer, keyHex: string): Buffer {
  if (payload.length < MAGIC.length + 12 + 16 || !payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('not a FreeLLMAPI backup (magic header missing)');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = payload.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = payload.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload.subarray(MAGIC.length + 28)), decipher.final()]);
}

function main(): void {
  const backupPath = arg('backup');
  if (!backupPath) throw new Error('--backup <path> is required');
  const keyHex = process.env.ENCRYPTION_KEY?.trim();
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('ENCRYPTION_KEY must be set to the same 64-char hex key the backup was written with');
  }

  // Hugging Face stores the blob base64-encoded (its commit route rejects raw
  // binary on Xet storage), so sniff rather than assume: a file written by an
  // older build, or pulled from a plain HTTP target, starts with MAGIC already.
  const raw = fs.readFileSync(backupPath);
  const payload = raw.subarray(0, MAGIC.length).equals(MAGIC)
    ? raw
    : Buffer.from(raw.toString('utf8').trim(), 'base64');

  const dbBytes = gunzipSync(decryptBackup(payload, keyHex));

  const dbPath = `${backupPath}.recovered.db`;
  fs.writeFileSync(dbPath, dbBytes, { mode: 0o600 });

  const db = new Database(dbPath);

  // decrypt() reads a module-cached key, so the env key has to be loaded before
  // the first call. The recovered database is passed in only to satisfy the
  // signature: the env branch returns before it is ever touched.
  initEncryptionKey(db as never);
  const rows = db.prepare(
    'SELECT platform, label, encrypted_key, iv, auth_tag, enabled FROM api_keys ORDER BY platform',
  ).all() as Array<{ platform: string; label: string; encrypted_key: string; iv: string; auth_tag: string; enabled: number }>;

  const keys: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    try {
      keys.push({
        platform: row.platform,
        key: decrypt(row.encrypted_key, row.iv, row.auth_tag),
        ...(row.label ? { label: row.label } : {}),
        ...(row.enabled ? {} : { enabled: false }),
      });
    } catch {
      // A key encrypted under a DIFFERENT ENCRYPTION_KEY cannot be recovered.
      // Report it rather than emitting a config that silently drops a provider.
      console.error(`could not decrypt the ${row.platform} key — wrong ENCRYPTION_KEY for that row`);
    }
  }
  db.close();
  fs.rmSync(dbPath, { force: true });

  const outPath = arg('out') ?? 'freellmapi.config.json';
  fs.writeFileSync(outPath, `${JSON.stringify({ keys }, null, 2)}\n`, { mode: 0o600 });
  console.log(`recovered ${keys.length} of ${rows.length} key(s) into ${outPath}`);
  for (const key of keys) console.log(`  ${key.platform}${key.label ? ` (${key.label})` : ''}`);
}

try {
  main();
} catch (err: any) {
  console.error(`recover-keys failed: ${err?.message ?? err}`);
  process.exitCode = 1;
}
