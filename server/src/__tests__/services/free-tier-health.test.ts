import { describe, expect, it } from 'vitest';
import { interpretKeylessHealth } from '../../services/free-tier-health.js';

// Keyless providers (Kilo, OVH — providers/index.ts:172 and :216) are the ones
// that can silently stop being free: the endpoint stays up, the models stay
// listed, and one day it starts demanding a key. The auth-enforcement probe
// already asks exactly the right question, but the reading is INVERTED here.
// For a candidate we want auth enforced; for a keyless free tier, enforcement
// appearing is the regression.

describe('interpretKeylessHealth', () => {
  it('reports still-free when a junk key is accepted', () => {
    expect(interpretKeylessHealth({ outcome: 'fail', status: 200 }).state).toBe('free');
  });

  it('reports the free tier gone when the endpoint starts demanding a key', () => {
    expect(interpretKeylessHealth({ outcome: 'pass', status: 401 }).state).toBe('requires-key');
  });

  it('reports unknown when the endpoint could not be reached', () => {
    expect(interpretKeylessHealth({ outcome: 'inconclusive', reason: 'ECONNREFUSED' }).state)
      .toBe('unknown');
  });

  it('does not flag a regression for an unreachable endpoint', () => {
    expect(interpretKeylessHealth({ outcome: 'inconclusive', status: 429 }).regression).toBe(false);
  });

  it('flags a regression when the free tier is gone', () => {
    expect(interpretKeylessHealth({ outcome: 'pass', status: 401 }).regression).toBe(true);
  });
});
