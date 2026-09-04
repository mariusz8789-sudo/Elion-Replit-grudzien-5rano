import { describe, expect, it } from 'vitest';
import { runDiscoveryCase } from '../core/discovery/discoveryEngine';
import type { DiscoveryCaseSpec } from '../core/discovery/discoveryCase';
import { EVIDENCE_STORE_SCHEMA_VERSION, type StoredEvidence } from '../core/discovery/evidenceStore';
import { compareStoredExperiments } from '../core/discovery/experimentComparison';

const conditions = { nAgents: 200, initialInfected: 8, seed: 4242, days: 30, stepsPerDay: 4 };
const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Q',
  hypothesis: {
    statement: 'S',
    falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'R' },
    assumptions: [],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'CONTACT_REDUCTION',
  initialConditions: conditions,
  ...over,
});

function entry(over: Partial<DiscoveryCaseSpec> = {}, commit = 'commit-a'): StoredEvidence {
  const record = runDiscoveryCase(spec(over));
  return { schemaVersion: EVIDENCE_STORE_SCHEMA_VERSION, record, sha256: null, codeCommitHash: commit, savedAt: Date.now() };
}

describe('compareStoredExperiments — Run Comparison between two independently saved experiments', () => {
  it('MATCH: identical inputs (same seed/scenarios/population) reproduce identical results', () => {
    const a = entry();
    const b = entry();
    const cmp = compareStoredExperiments(a, b);
    expect(cmp.status).toBe('COMPARABLE');
    expect(cmp.sameInputFingerprint).toBe(true);
    expect(cmp.sameResultFingerprint).toBe(true);
    expect(cmp.matchStatus).toBe('MATCH');
    expect(cmp.resultDeltas!.baseline.every((d) => d.absoluteDelta === 0)).toBe(true);
  });

  it('is BLOCKED with SEED_MISMATCH for different seeds — not silently compared as if comparable', () => {
    const a = entry();
    const b = entry({ initialConditions: { ...conditions, seed: 1 } });
    const cmp = compareStoredExperiments(a, b);
    expect(cmp.status).toBe('BLOCKED');
    expect(cmp.blockedReason).toBe('SEED_MISMATCH');
    expect(cmp.resultDeltas).toBeNull();
    expect(cmp.inputDifferences.some((d) => d.startsWith('seed:'))).toBe(true);
  });

  it('is BLOCKED with SCENARIO_MISMATCH when the scenario pair differs', () => {
    const a = entry();
    const b = entry({ variantScenario: 'ISOLATION' });
    const cmp = compareStoredExperiments(a, b);
    expect(cmp.status).toBe('BLOCKED');
    expect(cmp.blockedReason).toBe('SCENARIO_MISMATCH');
  });

  it('is BLOCKED with POPULATION_MISMATCH when population size differs', () => {
    const a = entry();
    const b = entry({ initialConditions: { ...conditions, nAgents: 50 } });
    const cmp = compareStoredExperiments(a, b);
    expect(cmp.status).toBe('BLOCKED');
    expect(cmp.blockedReason).toBe('POPULATION_MISMATCH');
  });

  it('reports real, non-zero deltas using only the existing DISCOVERY_METRIC_KEYS, never invented ones', () => {
    const a = entry({ initialConditions: { ...conditions, initialInfected: 4 } });
    const b = entry({ initialConditions: { ...conditions, initialInfected: 60 } });
    const cmp = compareStoredExperiments(a, b);
    // initialInfected differs but isn't itself a controlled seed/scenario/population mismatch,
    // so the comparison proceeds and shows the resulting metric deltas.
    expect(cmp.status).toBe('COMPARABLE');
    const keys = cmp.resultDeltas!.baseline.map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['peakInfectious', 'totalDeaths', 'attackRate']));
    const changed = cmp.resultDeltas!.baseline.filter((d) => d.absoluteDelta !== 0);
    expect(changed.length).toBeGreaterThan(0);
  });

  it('surfaces a real DRIFT only via a tampered record, never by inventing a mismatch', () => {
    const a = entry();
    const tamperedRecord = { ...a.record, runFingerprint: 'not-the-real-fingerprint' };
    const b: StoredEvidence = { ...a, record: tamperedRecord };
    const cmp = compareStoredExperiments(a, b);
    expect(cmp.sameInputFingerprint).toBe(true);
    expect(cmp.sameResultFingerprint).toBe(false);
    expect(cmp.matchStatus).toBe('DRIFT');
  });
});
