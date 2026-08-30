/**
 * Weekly provider discovery.
 *
 * Asks a model to name newly-launched free LLM APIs, then treats every word of
 * the answer as a claim to be checked rather than a fact: each suggestion is
 * schema-validated, probed for existence, deduped against the feed and the
 * first-class registry, and written out for a human to review as a pull
 * request. Nothing here can put a provider in front of an operator on its own.
 *
 * Signing up is explicitly NOT automated. Scripted account creation to farm
 * free tiers breaks most providers' terms of service and gets keys banned; the
 * dashboard opens the signup page and the operator does it by hand.
 *
 * Env:
 *   DISCOVERY_BASE_URL - OpenAI-compatible endpoint (e.g. your own router)
 *   DISCOVERY_API_KEY  - key for that endpoint
 *   DISCOVERY_MODEL    - model id, defaults to `auto`
 */
import fs from 'fs';
import { getAllProviders } from '../providers/index.js';
import { OpenAICompatProvider } from '../providers/openai-compat.js';
import { loadCandidates } from '../services/provider-candidates.js';
import { parseDiscoverySuggestions, mergeCandidates } from '../services/provider-discovery.js';
import { probeAnonymousAccess } from '../services/provider-verification.js';

const FEED_PATH = new URL('../../../shared/providers-candidates.json', import.meta.url);

const PROMPT = `List LLM API providers that offer a genuinely free tier requiring no credit card.

Return ONLY a JSON array, no prose, each element exactly:
{
  "id": "lowercase-slug",
  "name": "Display Name",
  "signupUrl": "https://...",
  "baseUrl": "https://.../v1",
  "authMode": "bearer" | "keyless",
  "notes": "one line: limits, and any catch such as prompts used for training",
  "addedAt": "YYYY-MM-DD",
  "source": "where you saw this"
}

Rules:
- baseUrl must be the OpenAI-compatible root ending in the version segment.
- Both URLs must be https.
- Omit anything you are not confident actually exists. An empty array is a fine answer.
- Do not include OpenAI, Anthropic, or any provider whose free tier needs a card.`;

async function askModel(): Promise<string> {
  const baseUrl = process.env.DISCOVERY_BASE_URL?.trim();
  const apiKey = process.env.DISCOVERY_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error('DISCOVERY_BASE_URL and DISCOVERY_API_KEY are required');
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.DISCOVERY_MODEL?.trim() || 'auto',
      messages: [{ role: 'user', content: PROMPT }],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`discovery request failed: HTTP ${res.status}`);
  const body = await res.json() as { choices?: { message?: { content?: string } }[] };
  return body.choices?.[0]?.message?.content ?? '';
}

/** Endpoints already supported first-class need no candidate entry. */
function registryBaseUrls(): Set<string> {
  return new Set(
    getAllProviders()
      .filter((p): p is OpenAICompatProvider => p instanceof OpenAICompatProvider)
      .map(p => p.probeBaseUrl),
  );
}

async function main(): Promise<void> {
  const suggestions = parseDiscoverySuggestions(await askModel());
  console.log(`model returned ${suggestions.length} well-formed suggestion(s)`);

  // A model will confidently invent an endpoint. A suggestion whose host does
  // not even answer is noise a reviewer should never have to read, so it is
  // dropped here rather than in someone's PR review.
  const reachable = [];
  for (const candidate of suggestions) {
    const probe = await probeAnonymousAccess(candidate.baseUrl);
    const exists = probe.outcome !== 'inconclusive' || probe.status !== undefined;
    console.log(`  ${exists ? 'reachable  ' : 'unreachable'} ${candidate.id} — ${candidate.baseUrl}`);
    if (exists) reachable.push(candidate);
  }

  const { feed, added } = mergeCandidates(loadCandidates(FEED_PATH), reachable, registryBaseUrls());

  if (added.length === 0) {
    console.log('nothing new to add');
    return;
  }

  fs.writeFileSync(FEED_PATH, `${JSON.stringify(feed, null, 2)}\n`);
  console.log(`\nadded ${added.length} candidate(s):`);
  for (const candidate of added) console.log(`  ${candidate.id} — ${candidate.baseUrl}`);
}

main().catch(err => {
  console.error(`discover-providers failed: ${err?.message ?? err}`);
  process.exitCode = 1;
});
