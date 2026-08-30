import type { AuthEnforcementCheck } from './provider-verification.js';

export type KeylessState = 'free' | 'requires-key' | 'unknown';

export interface KeylessHealth {
  state: KeylessState;
  /** True only when the tier demonstrably stopped being free. */
  regression: boolean;
  detail?: string;
}

/**
 * Read an auth-enforcement probe as a free-tier health verdict.
 *
 * The reading is inverted relative to candidate verification. There, an
 * endpoint that accepts a junk key FAILS, because it is not protecting the
 * operator's credential. Here the provider is keyless by design, so accepting a
 * junk key is proof the free tier is intact; the endpoint starting to enforce a
 * key is the regression worth waking someone for.
 *
 * @param check - Result of probeAuthEnforcement against a keyless provider.
 * @returns The tier's state, and whether it is a regression worth reporting.
 */
export function interpretKeylessHealth(check: AuthEnforcementCheck): KeylessHealth {
  if (check.outcome === 'fail') {
    return { state: 'free', regression: false };
  }

  if (check.outcome === 'pass') {
    return {
      state: 'requires-key',
      regression: true,
      detail: `endpoint now enforces auth (HTTP ${check.status ?? 'unknown'})`,
    };
  }

  // Unreachable, rate-limited, or an unexpected status. A free tier that is
  // merely down or throttled has not stopped being free, and reporting it as a
  // regression would turn this job into a noise generator that gets muted --
  // at which point it stops catching the thing it exists for.
  return {
    state: 'unknown',
    regression: false,
    detail: check.reason ?? (check.status !== undefined ? `HTTP ${check.status}` : undefined),
  };
}
