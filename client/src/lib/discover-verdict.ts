export interface VerificationReport {
  positive: { outcome: 'pass' | 'fail'; modelId?: string; latencyMs?: number; toolCalls?: boolean; reason?: string }
  negative: { outcome: 'pass' | 'fail' | 'inconclusive'; status?: number; reason?: string }
  connectable: boolean
  warning?: string
}

export interface DiscoverVerdict {
  tone: 'ok' | 'warn' | 'blocked'
  messageKey: string
  canSave: boolean
}

/**
 * Turn a verification report into the one thing the operator needs to read.
 *
 * The two blocked cases are different problems with different owners: a key
 * that does not work is the operator's to fix, while an endpoint that accepts
 * any key is the provider's, and saving it would leave a credential guarding
 * nothing. Collapsing them into "verification failed" would tell the operator
 * to go re-copy a key that was fine.
 */
export function discoverVerdict(report: VerificationReport): DiscoverVerdict {
  if (report.positive.outcome === 'fail') {
    return { tone: 'blocked', messageKey: 'keys.discoverBlockedKey', canSave: false }
  }

  if (report.negative.outcome === 'fail') {
    return { tone: 'blocked', messageKey: 'keys.discoverBlockedAuth', canSave: false }
  }

  if (report.negative.outcome === 'inconclusive') {
    return { tone: 'warn', messageKey: 'keys.discoverWarning', canSave: true }
  }

  return { tone: 'ok', messageKey: 'keys.discoverPassed', canSave: true }
}
