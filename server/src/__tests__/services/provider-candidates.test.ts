import { describe, expect, it } from 'vitest';
import { parseCandidateFeed } from '../../services/provider-candidates.js';

// The candidate feed is the ONLY thing that tells the dashboard where to send a
// key the operator just pasted. A malformed or hostile entry is therefore a
// credential-exfiltration bug, not a display bug — so the feed is validated at
// the boundary and a bad entry fails the whole load rather than being skipped
// quietly into the UI.

const valid = {
  id: 'example-ai',
  name: 'Example AI',
  signupUrl: 'https://example.ai/signup',
  baseUrl: 'https://api.example.ai/v1',
  authMode: 'bearer',
  addedAt: '2026-08-29',
};

describe('parseCandidateFeed', () => {
  it('accepts a well-formed candidate', () => {
    const result = parseCandidateFeed([valid]);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('example-ai');
  });

  it('rejects a candidate whose baseUrl is not https', () => {
    const feed = [{ ...valid, baseUrl: 'http://api.example.ai/v1' }];

    expect(() => parseCandidateFeed(feed)).toThrow(/https/i);
  });

  it('rejects duplicate ids so a later entry cannot shadow an earlier one', () => {
    const feed = [valid, { ...valid, baseUrl: 'https://evil.example/v1' }];

    expect(() => parseCandidateFeed(feed)).toThrow(/duplicate/i);
  });
});
