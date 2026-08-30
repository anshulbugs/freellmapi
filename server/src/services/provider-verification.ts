import { probeEndpointModel } from './model-discovery.js';

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
  return probeAuthWall(baseUrl, SENTINEL_KEY);
}

/**
 * Ask whether an endpoint serves callers who present no credential at all.
 *
 * Distinct from probeAuthEnforcement on purpose. A keyless provider is reached
 * by OMITTING the Authorization header; sending a junk bearer instead tests
 * whether bad credentials are rejected, which is a different question and gives
 * the wrong answer for exactly the providers this is aimed at — OVH refuses a
 * junk bearer with 403 while serving anonymous callers normally.
 *
 * @param baseUrl - OpenAI-compatible endpoint root.
 * @returns `pass` when anonymous access is refused (an auth wall exists),
 *   `fail` when it is served, `inconclusive` otherwise.
 */
export async function probeAnonymousAccess(baseUrl: string): Promise<AuthEnforcementCheck> {
  return probeAuthWall(baseUrl, null);
}

/**
 * Shared request for both probes.
 *
 * @param apiKey - Bearer to present, or null to send no Authorization header.
 */
async function probeAuthWall(baseUrl: string, apiKey: string | null): Promise<AuthEnforcementCheck> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey !== null) headers.Authorization = `Bearer ${apiKey}`;

  // A candidate that is down, slow, or not OpenAI-shaped must not take the
  // whole connect flow with it — the operator is waiting on this call, and an
  // unreachable endpoint is a separate finding from an unenforced key.
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
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

export interface PositiveCheck {
  outcome: 'pass' | 'fail';
  modelId?: string;
  latencyMs?: number;
  toolCalls?: boolean;
  reasoning?: boolean;
  reason?: string;
}

export interface VerificationReport {
  positive: PositiveCheck;
  negative: AuthEnforcementCheck;
  /** Whether the dashboard may offer to save this candidate. */
  connectable: boolean;
  /** Present when connect is allowed but something is unproven. */
  warning?: string;
}

export interface VerifyEndpointDeps {
  probePositive?: (baseUrl: string, apiKey: string) => Promise<PositiveCheck>;
  probeNegative?: (baseUrl: string) => Promise<AuthEnforcementCheck>;
}

/**
 * Run both verification checks against a candidate provider and reduce them to
 * a single verdict.
 *
 * @param baseUrl - OpenAI-compatible base, resolved from the trusted candidate
 *   feed by the caller — never from client input.
 * @param apiKey - The key the operator pasted.
 * @param deps - Probe overrides, for tests.
 */
export async function verifyEndpoint(
  baseUrl: string,
  apiKey: string,
  deps: VerifyEndpointDeps = {},
): Promise<VerificationReport> {
  const probeNegative = deps.probeNegative ?? probeAuthEnforcement;
  const probePositive = deps.probePositive ?? defaultPositiveProbe;

  // Sequential, not concurrent: the negative probe deliberately sends a bad
  // key, and firing it alongside the real one invites a provider's abuse
  // heuristics to rate-limit or flag the key the operator just created.
  const positive = await probePositive(baseUrl, apiKey);
  const negative = await probeNegative(baseUrl);

  const connectable = positive.outcome === 'pass' && negative.outcome !== 'fail';
  const warning = connectable && negative.outcome === 'inconclusive'
    ? 'Could not confirm this endpoint enforces your key'
    : undefined;

  return {
    positive,
    negative,
    connectable,
    ...(warning ? { warning } : {}),
  };
}

async function defaultPositiveProbe(baseUrl: string, apiKey: string): Promise<PositiveCheck> {
  try {
    const probe = await probeEndpointModel(baseUrl, apiKey);
    return {
      outcome: 'pass',
      modelId: probe.modelId,
      latencyMs: probe.latencyMs,
      ...(probe.toolCalls !== undefined ? { toolCalls: probe.toolCalls } : {}),
      ...(probe.reasoning !== undefined ? { reasoning: probe.reasoning } : {}),
    };
  } catch (err) {
    return { outcome: 'fail', reason: err instanceof Error ? err.message : String(err) };
  }
}
