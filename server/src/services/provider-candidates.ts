import fs from 'fs';
import { z } from 'zod';

/**
 * Candidate providers surfaced in the dashboard's "Discover" flow.
 *
 * This feed is the only thing that decides where a key the operator just
 * pasted gets sent, so it is trusted input and validated like it: the file
 * ships in the repo and reaches production through a reviewed merge, never
 * over the wire at runtime.
 */

// Plaintext would put a live API key on the network in the clear, and every
// provider worth onboarding serves TLS. Rejecting at parse time keeps the
// check in one place instead of at each call site.
const httpsUrl = z
  .string()
  .url()
  .refine(value => value.startsWith('https://'), { message: 'must be an https URL' });

export const candidateSchema = z.object({
  /** Stable slug; the dashboard addresses a candidate by this and never by base URL. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'id must be a lowercase slug'),
  name: z.string().min(1),
  /** Where the operator goes to create an account. Opened in a new tab. */
  signupUrl: httpsUrl,
  /** OpenAI-compatible base, including the version segment. */
  baseUrl: httpsUrl,
  docsUrl: httpsUrl.optional(),
  authMode: z.enum(['bearer', 'keyless']),
  notes: z.string().optional(),
  addedAt: z.string(),
  source: z.string().optional(),
});

export type ProviderCandidate = z.infer<typeof candidateSchema>;

/**
 * Validate a raw candidate feed.
 *
 * @param raw - Parsed JSON, expected to be an array of candidate objects.
 * @returns The validated candidates, in feed order.
 * @throws If any entry is malformed, carries a non-https URL, or reuses an id.
 */
export function parseCandidateFeed(raw: unknown): ProviderCandidate[] {
  const candidates = z.array(candidateSchema).parse(raw);

  // A duplicate id is not a cosmetic problem: the verify route resolves a
  // candidate by id, so a second entry sharing an id could silently redirect a
  // pasted key to a different base URL than the one the operator reviewed.
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      throw new Error(`duplicate candidate id: ${candidate.id}`);
    }
    seen.add(candidate.id);
  }

  return candidates;
}

// Resolved relative to this module rather than the process cwd, which differs
// between `tsx watch` in dev, the Docker image and a test run. server/src and
// server/dist sit at the same depth, so one path serves both.
const FEED_URL = new URL('../../../shared/providers-candidates.json', import.meta.url);

/**
 * Where the feed is read from. Overridable the same way the DB and startup
 * config are, so a self-hoster can ship their own candidate list.
 */
function feedPath(): URL | string {
  return process.env.FREEAPI_CANDIDATES_PATH?.trim() || FEED_URL;
}

/**
 * Read and validate the candidate feed that ships with the build.
 *
 * @param path - Override, for tests and self-hosted feeds.
 * @returns Validated candidates; an empty list when the file is absent.
 * @throws If the feed exists but does not validate.
 */
export function loadCandidates(path: URL | string = feedPath()): ProviderCandidate[] {
  let raw: string;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    // A build without the feed is a working install with nothing to suggest,
    // not a broken one.
    return [];
  }
  return parseCandidateFeed(JSON.parse(raw));
}

/** Look up one candidate by its slug. Returns null when unknown. */
export function getCandidate(id: string): ProviderCandidate | null {
  return loadCandidates().find(candidate => candidate.id === id) ?? null;
}
