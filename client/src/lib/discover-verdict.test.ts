import { describe, expect, it } from 'vitest'
import { discoverVerdict } from './discover-verdict'

// The server returns a structured report; the UI has to say which check failed,
// not just "it didn't work". The two blocked cases are genuinely different
// problems for the operator — a key that does not work is theirs to fix, an
// endpoint that accepts any key is the provider's — and telling them apart is
// the whole reason verifyEndpoint reports per-check rather than a boolean.

const pass = { outcome: 'pass' as const }
const fail = { outcome: 'fail' as const }

describe('discoverVerdict', () => {
  it('allows saving when both checks pass', () => {
    const v = discoverVerdict({ positive: pass, negative: pass, connectable: true })

    expect(v.canSave).toBe(true)
    expect(v.tone).toBe('ok')
  })

  it('blocks and names the auth problem when the endpoint accepts any key', () => {
    const v = discoverVerdict({ positive: pass, negative: fail, connectable: false })

    expect(v.canSave).toBe(false)
    expect(v.messageKey).toBe('keys.discoverBlockedAuth')
  })

  it('blocks and names the key problem when the key itself failed', () => {
    const v = discoverVerdict({ positive: fail, negative: pass, connectable: false })

    expect(v.canSave).toBe(false)
    expect(v.messageKey).toBe('keys.discoverBlockedKey')
  })

  it('allows saving with a warning when auth could not be confirmed', () => {
    const v = discoverVerdict({
      positive: pass,
      negative: { outcome: 'inconclusive' as const },
      connectable: true,
      warning: 'Could not confirm this endpoint enforces your key',
    })

    expect(v.canSave).toBe(true)
    expect(v.tone).toBe('warn')
  })
})
