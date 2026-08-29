/**
 * Daily free-tier regression check.
 *
 * Probes only what needs no credential: the keyless providers in the registry
 * and every entry in the candidate feed. That constraint is the point — this
 * runs in CI, and giving CI a copy of the operator's provider keys to widen
 * coverage would put live credentials in a second system. Keyed providers are
 * already watched by the running instance's own health scheduler, which has the
 * keys legitimately.
 *
 * Exits non-zero when a free tier demonstrably stopped being free, so the
 * workflow can raise an issue.
 */
import { getAllProviders } from '../providers/index.js';
import { OpenAICompatProvider } from '../providers/openai-compat.js';
import { loadCandidates } from '../services/provider-candidates.js';
import { probeAnonymousAccess } from '../services/provider-verification.js';
import { interpretKeylessHealth } from '../services/free-tier-health.js';

interface Target {
  label: string;
  baseUrl: string;
  keyless: boolean;
}

function targets(): Target[] {
  const registry = getAllProviders()
    .filter((p): p is OpenAICompatProvider => p instanceof OpenAICompatProvider && p.keyless)
    .map(p => ({ label: `${p.name} (${p.platform})`, baseUrl: p.probeBaseUrl, keyless: true }));

  const candidates = loadCandidates()
    .filter(c => c.authMode === 'keyless')
    .map(c => ({ label: `${c.name} (candidate)`, baseUrl: c.baseUrl, keyless: true }));

  return [...registry, ...candidates];
}

async function main(): Promise<void> {
  const list = targets();
  if (list.length === 0) {
    console.log('No keyless targets to probe.');
    return;
  }

  const regressions: string[] = [];

  for (const target of list) {
    const check = await probeAnonymousAccess(target.baseUrl);
    const health = interpretKeylessHealth(check);
    const line = `${health.regression ? 'REGRESSION' : health.state.padEnd(12)} ${target.label} — ${target.baseUrl}${health.detail ? ` (${health.detail})` : ''}`;
    console.log(line);
    if (health.regression) regressions.push(line);
  }

  if (regressions.length > 0) {
    console.error(`\n${regressions.length} free tier(s) stopped being free:`);
    for (const line of regressions) console.error(`  ${line}`);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(`probe-free-tiers failed: ${err?.message ?? err}`);
  process.exitCode = 1;
});
