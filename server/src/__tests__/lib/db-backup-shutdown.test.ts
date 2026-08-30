import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShutdownBackup, restoreDbBackupIfNeeded } from '../../lib/db-backup.js';

// A container that is told to stop must take its last writes with it. The pump
// runs every 5 minutes, so without this a key added four minutes before a
// redeploy is simply not in the backup -- and on a diskless host the next boot
// restores the older blob and overwrites the good one, making the loss
// permanent rather than temporary.

const ORIGINAL_PATH = process.env.FREEAPI_DB_BACKUP_PATH;
const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_PATH === undefined) delete process.env.FREEAPI_DB_BACKUP_PATH;
  else process.env.FREEAPI_DB_BACKUP_PATH = ORIGINAL_PATH;
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shutdown-backup-'));
  const dbPath = path.join(dir, 'freeapi.db');
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
  process.env.FREEAPI_DB_BACKUP_PATH = path.join(dir, 'backup.bin');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE api_keys (id INTEGER PRIMARY KEY, platform TEXT)');
  return { dir, dbPath, db };
}

describe('createShutdownBackup', () => {
  it('flushes a write made since the last pump tick', async () => {
    const { dbPath, db } = setup();
    db.prepare("INSERT INTO api_keys (platform) VALUES ('cerebras')").run();

    await createShutdownBackup(db as any, dbPath)();

    db.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    await restoreDbBackupIfNeeded(dbPath);

    const restored = new Database(dbPath);
    const rows = restored.prepare('SELECT platform FROM api_keys').all() as { platform: string }[];
    restored.close();
    expect(rows.map(r => r.platform)).toEqual(['cerebras']);
  });

  it('resolves even when the backup target fails, so shutdown is never blocked', async () => {
    const { dbPath, db } = setup();
    process.env.FREEAPI_DB_BACKUP_PATH = '';
    process.env.FREEAPI_DB_BACKUP_URL = 'https://127.0.0.1:1/nope';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(createShutdownBackup(db as any, dbPath)()).resolves.toBeUndefined();

    warn.mockRestore();
    delete process.env.FREEAPI_DB_BACKUP_URL;
    db.close();
  });
});
