import { getDb } from '../db/index.js';
import { userCount, createUser } from './auth.js';

/**
 * Seed identity from the environment so the database can be disposable.
 *
 * On a host with no persistent disk every container starts empty. Provider keys
 * already survive that through declarative config, but two things did not: the
 * unified API key is regenerated on each boot (db/index.ts:233), which breaks
 * every client pointed at the router, and the dashboard account has to be
 * re-claimed with a one-time setup code read from the logs.
 *
 * Both are therefore overridable. Nothing here is required — an install with a
 * real disk sets none of it and behaves exactly as before.
 */
export function applyEnvBootstrap(): void {
  pinUnifiedKey();
  bootstrapAdmin();
}

function pinUnifiedKey(): void {
  const pinned = process.env.FREEAPI_UNIFIED_KEY?.trim();
  if (!pinned) return;

  getDb()
    .prepare("UPDATE settings SET value = ? WHERE key = 'unified_api_key'")
    .run(pinned);
  console.log('[bootstrap] unified API key pinned from FREEAPI_UNIFIED_KEY');
}

function bootstrapAdmin(): void {
  const email = process.env.FREEAPI_ADMIN_EMAIL?.trim();
  const password = process.env.FREEAPI_ADMIN_PASSWORD;
  if (!email || !password) return;

  // Only ever creates the FIRST account. Re-applying would collide on the
  // unique email, and resetting the password each boot would let a stale env
  // var silently overwrite one the operator changed in the dashboard.
  if (userCount() > 0) return;

  try {
    createUser(email, password);
    console.log(`[bootstrap] created dashboard account ${email} from env`);
  } catch (err) {
    // A rejected password (too short) must not take the server down with it:
    // the dashboard is still claimable through the normal setup-code flow.
    console.warn(`[bootstrap] could not create the dashboard account: ${err instanceof Error ? err.message : err}`);
  }
}
