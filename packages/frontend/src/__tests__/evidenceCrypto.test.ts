import { describe, expect, it } from 'vitest';
import { runDiscoveryCase } from '../core/discovery/discoveryEngine';
import type { DiscoveryCaseSpec } from '../core/discovery/discoveryCase';
import { computeEvidencePackSha256, sha256Hex } from '../core/discovery/evidenceCrypto';

const conditions = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };
const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Czy izolacja objawowych obniża szczyt zakażeń?',
  hypothesis: {
    statement: 'Izolacja objawowych obniża szczytową liczbę zakaźnych względem braku interwencji.',
    falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'Izolacja usuwa zakaźnych z obiegu kontaktów.' },
    assumptions: ['Wykrywalność objawowych jest natychmiastowa.'],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'ISOLATION',
  initialConditions: conditions,
  ...over,
});

/**
 * Dowód, że nowa warstwa SHA-256 jest REALNYM kryptograficznym skrótem, a nie
 * kolejnym fnv1a/djb2 pod inną nazwą — i że nie dubluje istniejącego systemu
 * odcisków Discovery Engine, tylko go opakowuje.
 */
describe('evidenceCrypto — real SHA-256 over an existing, untouched evidence pack', () => {
  it('produces a real 256-bit (64 hex char) digest, not a 32-bit toy hash', async () => {
    const hash = await sha256Hex('genesis');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the known SHA-256 of a fixed string (not just "looks hex")', async () => {
    // sha256("") — a standard, independently verifiable test vector.
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('is deterministic and sensitive to any change in the pack content', async () => {
    const c = runDiscoveryCase(spec());
    const hashA = await computeEvidencePackSha256(c.evidence!);
    const hashB = await computeEvidencePackSha256(c.evidence!);
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);

    const cDifferent = runDiscoveryCase(spec({ question: 'Inne pytanie o ten sam eksperyment.' }));
    const hashDifferent = await computeEvidencePackSha256(cDifferent.evidence!);
    expect(hashDifferent).not.toBe(hashA);
  });

  it('does not replace or shadow the existing evidencePackId (fnv1a-based)', () => {
    const c = runDiscoveryCase(spec());
    // The existing internal id keeps its own, unrelated, shorter format.
    expect(c.evidence!.evidencePackId).toMatch(/^dpack_[0-9a-f]{8}$/);
  });
});
