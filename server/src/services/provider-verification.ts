/** Outcome of a single verification check. */
export type CheckOutcome = 'pass' | 'fail' | 'inconclusive';

export interface AuthEnforcementCheck {
  outcome: CheckOutcome;
  /** Upstream HTTP status, when the request completed. */
  status?: number;
  /** Why the check could not conclude. Absent on a clean pass or fail. */
  reason?: string;
}

const PROBE_TIMEOUT_MS = 15_000;

// Deliberately invalid. Sent at chat/completions rather than /models because
// /models is exactly the surface that lies: providers/index.ts:184 records a
// Pollinations endpoint answering 200 there for a revoked key.
const SENTINEL_KEY = 'freellmapi-invalid-verification-probe';

export async function probeAuthEnforcement(baseUrl: string): Promise<AuthEnforcementCheck> {
  // A candidate that is down, slow, or not OpenAI-shaped must not take the
  // whole connect flow with it — the operator is waiting on this call, and an
  // unreachable endpoint is a separate finding from an unenforced key.
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SENTINEL_KEY}`,
      },
      body: JSON.stringify({
        model: 'probe',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      outcome: 'inconclusive',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status === 200) return { outcome: 'fail', status: res.status };
  if (res.status === 401 || res.status === 403) return { outcome: 'pass', status: res.status };
  return { outcome: 'inconclusive', status: res.status };
}
