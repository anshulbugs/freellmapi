import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { backupDbNow } from '../../lib/db-backup.js';

// Render overlaps containers on deploy: the new one boots and restores BEFORE
// the old one is signalled to stop. The new container therefore starts from a
// pre-shutdown snapshot, and its own upload overwrites the good backup the old
// container is about to flush -- turning a stale snapshot into the permanent
// one.
//
// A container holding restored data it has not written to has nothing to
// contribute, so an unchanged database must not be uploaded at all.

const ORIGINAL_PATH = process.env.FREEAPI_DB_BACKUP_PATH;
const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_PATH === undefined) delete process.env.FREEAPI_DB_BACKUP_PATH;
  else process.env.FREEAPI_DB_BACKUP_PATH = ORIGINAL_PATH;
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirty-backup-'));
  const dbPath = path.join(dir, 'freeapi.db');
  const backupPath = path.join(dir, 'backup.bin');
  process.env.ENCRYPTION_KEY = 'd'.repeat(64);
  process.env.FREEAPI_DB_BACKUP_PATH = backupPath;
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE api_keys (id INTEGER PRIMARY KEY, platform TEXT)');
  return { dbPath, backupPath, db };
}

describe('backupDbNow skips an unchanged database', () => {
  it('does not re-upload when nothing has changed since the last backup', async () => {
    const { dbPath, db } = setup();
    db.prepare("INSERT INTO api_keys (platform) VALUES ('groq')").run();

    const first = await backupDbNow(db as any, dbPath);
    const second = await backupDbNow(db as any, dbPath);

    expect(first.skipped).toBeUndefined();
    expect(second.skipped).toBe('unchanged');
  });

  it('uploads again once the database actually changes', async () => {
    const { dbPath, db } = setup();
    await backupDbNow(db as any, dbPath);

    db.prepare("INSERT INTO api_keys (platform) VALUES ('cerebras')").run();
    const after = await backupDbNow(db as any, dbPath);

    expect(after.skipped).toBeUndefined();
  });
});
