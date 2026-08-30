import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { backupDbNow, restoreDbBackupIfNeeded } from '../../lib/db-backup.js';

// Reported in production: provider keys vanish on every restart while the
// dashboard account survives, and every restore reports the identical byte
// count. The router runs SQLite in WAL mode (db/index.ts:82), and backupDbNow
// copies only the main database file after a best-effort checkpoint whose
// failure is swallowed. If a write is still sitting in the -wal sidecar when
// the backup runs, it is simply not in the backup.

const ORIGINAL_PATH = process.env.FREEAPI_DB_BACKUP_PATH;
const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_PATH === undefined) delete process.env.FREEAPI_DB_BACKUP_PATH;
  else process.env.FREEAPI_DB_BACKUP_PATH = ORIGINAL_PATH;
  if (ORIGINAL_KEY === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe('backup captures writes still in the WAL', () => {
  it('restores a row committed moments before the backup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wal-backup-'));
    const dbPath = path.join(dir, 'freeapi.db');
    const backupPath = path.join(dir, 'backup.bin');
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.FREEAPI_DB_BACKUP_PATH = backupPath;

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE api_keys (id INTEGER PRIMARY KEY, platform TEXT)');
    db.prepare("INSERT INTO api_keys (platform) VALUES ('groq')").run();

    // Backup while the connection is still open — exactly how the pump runs it,
    // with the server live and the WAL hot.
    await backupDbNow(db as any, dbPath);

    // Simulate the container dying: the whole directory goes, sidecars included.
    db.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });

    await restoreDbBackupIfNeeded(dbPath);

    const restored = new Database(dbPath);
    const rows = restored.prepare('SELECT platform FROM api_keys').all() as { platform: string }[];
    restored.close();

    expect(rows.map(r => r.platform)).toEqual(['groq']);
  });
});
