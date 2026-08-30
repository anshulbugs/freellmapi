import { describe, expect, it } from 'vitest';
import { signupUrlFor, SIGNUP_URLS } from '../../services/provider-signup.js';

// These URLs are where an operator goes to create a real account and paste a
// real credential back. A wrong one sends someone to a page that is not the
// provider's, so the shape is asserted rather than trusted: https only, and no
// entry for a platform we do not actually know.

describe('signupUrlFor', () => {
  it('returns the console URL for a provider we know', () => {
    expect(signupUrlFor('groq')).toMatch(/^https:\/\/console\.groq\.com\//);
  });

  it('returns undefined for a provider we have no verified URL for', () => {
    expect(signupUrlFor('definitely-not-a-platform')).toBeUndefined();
  });

  it('has no non-https entries', () => {
    const bad = Object.entries(SIGNUP_URLS).filter(([, url]) => !url.startsWith('https://'));
    expect(bad).toEqual([]);
  });
});
