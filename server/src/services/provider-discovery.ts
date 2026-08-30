import { candidateSchema, type ProviderCandidate } from './provider-candidates.js';

export interface MergeResult {
  feed: ProviderCandidate[];
  added: ProviderCandidate[];
}

/**
 * Pull candidate suggestions out of a model's reply.
 *
 * Model output is untrusted: a suggestion decides where the dashboard sends a
 * key the operator pastes, so every entry is schema-checked before it is
 * allowed near the feed. Malformed entries are DROPPED rather than thrown on —
 * the opposite of parseCandidateFeed, and deliberately so. The shipped feed
 * must fail the build if it is corrupt; a research batch where one suggestion
 * in ten is hallucinated should still yield the other nine.
 *
 * @param raw - The model's reply, with or without markdown fencing.
 * @returns Every suggestion that validates, in reply order.
 */
export function parseDiscoverySuggestions(raw: string): ProviderCandidate[] {
  const json = extractJsonArray(raw);
  if (json === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const valid: ProviderCandidate[] = [];
  for (const entry of parsed) {
    const result = candidateSchema.safeParse(entry);
    if (result.success) valid.push(result.data);
  }
  return valid;
}

function extractJsonArray(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;
  return body.slice(start, end + 1);
}

/** Trailing slashes and case are not meaningful in an endpoint root. */
function normalizeBaseUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Fold newly discovered candidates into the existing feed.
 *
 * @param existing - The current feed; never modified or reordered.
 * @param discovered - Validated suggestions.
 * @param knownBaseUrls - Endpoints already supported first-class, which need no
 *   candidate entry.
 * @returns The merged feed and just the entries that were new.
 */
export function mergeCandidates(
  existing: ProviderCandidate[],
  discovered: ProviderCandidate[],
  knownBaseUrls: ReadonlySet<string>,
): MergeResult {
  const ids = new Set(existing.map(c => c.id));
  // Deduping on id alone is not enough: an id is trivially varied, while the
  // base URL is what actually routes a key. Without this the feed accumulates
  // aliases of one provider, each of which the operator has to judge.
  const baseUrls = new Set(existing.map(c => normalizeBaseUrl(c.baseUrl)));
  for (const url of knownBaseUrls) baseUrls.add(normalizeBaseUrl(url));

  const added: ProviderCandidate[] = [];
  for (const candidate of discovered) {
    const baseUrl = normalizeBaseUrl(candidate.baseUrl);
    if (ids.has(candidate.id) || baseUrls.has(baseUrl)) continue;
    ids.add(candidate.id);
    baseUrls.add(baseUrl);
    added.push(candidate);
  }

  return { feed: [...existing, ...added], added };
}
