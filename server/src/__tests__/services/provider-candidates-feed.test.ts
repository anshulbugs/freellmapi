import { describe, expect, it } from 'vitest';
import { loadCandidates, getCandidate } from '../../services/provider-candidates.js';

// Guards the feed that actually ships. A malformed entry merged into
// shared/providers-candidates.json is a credential-routing bug, so it must fail
// the build rather than surface in the dashboard.

describe('shipped candidate feed', () => {
  it('parses and validates', () => {
    expect(() => loadCandidates()).not.toThrow();
    expect(Array.isArray(loadCandidates())).toBe(true);
  });

  it('returns null for an id that is not in the feed', () => {
    expect(getCandidate('definitely-not-a-provider')).toBeNull();
  });
});
