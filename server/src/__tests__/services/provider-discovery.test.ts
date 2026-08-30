import { describe, expect, it } from 'vitest';
import { parseDiscoverySuggestions, mergeCandidates } from '../../services/provider-discovery.js';

// Everything here treats model output as hostile input. A suggestion decides
// where the dashboard sends a key the operator pastes, so a hallucinated or
// poisoned entry is a credential-routing bug. Unlike the shipped feed -- which
// throws, because a bad merge must fail the build -- discovery FILTERS: one bad
// suggestion among ten must not discard the nine good ones.

const good = {
  id: 'example-ai',
  name: 'Example AI',
  signupUrl: 'https://example.ai/signup',
  baseUrl: 'https://api.example.ai/v1',
  authMode: 'bearer',
  addedAt: '2026-08-30',
};

describe('parseDiscoverySuggestions', () => {
  it('extracts suggestions from a fenced code block', () => {
    const raw = 'Here you go:\n```json\n' + JSON.stringify([good]) + '\n```\nHope that helps!';

    expect(parseDiscoverySuggestions(raw)).toHaveLength(1);
  });

  it('drops a suggestion with a non-https baseUrl instead of failing the batch', () => {
    const raw = JSON.stringify([good, { ...good, id: 'bad-one', baseUrl: 'http://insecure.example/v1' }]);

    const result = parseDiscoverySuggestions(raw);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('example-ai');
  });

  it('returns nothing when the model produced no usable JSON', () => {
    expect(parseDiscoverySuggestions('I could not find any providers.')).toEqual([]);
  });
});

describe('mergeCandidates', () => {
  it('adds a genuinely new candidate', () => {
    const merged = mergeCandidates([], [good], new Set());

    expect(merged.added).toHaveLength(1);
  });

  it('does not re-add a candidate already in the feed', () => {
    const merged = mergeCandidates([good], [good], new Set());

    expect(merged.added).toHaveLength(0);
  });

  // An id is trivially varied; the base URL is what actually routes a key, so
  // dedupe has to key on it too or the feed fills with aliases of one provider.
  it('rejects a new id that reuses an existing baseUrl', () => {
    const alias = { ...good, id: 'example-ai-mirror' };

    const merged = mergeCandidates([good], [alias], new Set());

    expect(merged.added).toHaveLength(0);
  });

  it('skips a provider already supported first-class', () => {
    const merged = mergeCandidates([], [good], new Set(['https://api.example.ai/v1']));

    expect(merged.added).toHaveLength(0);
  });
});
