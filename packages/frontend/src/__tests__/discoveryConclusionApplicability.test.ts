import { describe, expect, it } from 'vitest';
import { deriveDiscoveryConclusion } from '../core/discovery/discoveryConclusion';
import type { DiscoveryCase, DiscoveryComparison, DiscoveryReplay } from '../core/discovery/discoveryCase';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';

/**
 * "UNDECIDABLE" MUST NOT READ AS "FALSIFIED".
 *
 * `falsificationRelation.ts` returns `applicable: false` for a relation that a
 * two-arm comparison cannot settle — a monotonic one needs an ordered series,
 * and its own doc says `met` "is then meaningless and must not be read as a
 * falsification". `deriveDiscoveryConclusion` collapsed that into
 * `applicable && met`, so an undecidable criterion produced NOT_SUPPORTED: a
 * falsification-flavoured verdict from a test that never ran.
 *
 * The same hole swallowed a MISSING metric, which is the other way a criterion
 * can be undecidable rather than false.
 *
 * This file was written against the broken code first and failed on both
 * counts, which is the only reason it is worth keeping.
 */

const CRITERION = (over: Partial<FalsificationCriterion> = {}): FalsificationCriterion => ({
  metric: 'totalDeaths',
  relation: 'less-than',
  rationale: 'test',
  ...over,
});

function caseWith(criterion: FalsificationCriterion): DiscoveryCase {
  return {
    caseId: 'c1',
    question: 'q',
    hypothesis: { statement: 's', falsification: criterion, assumptions: [] },
    model: { modelId: 'm', modelVersion: '1.0.0', engine: 'e' },
    seed: 1,
    initialConditions: { nAgents: 10, initialInfected: 1, seed: 1, days: 10, stepsPerDay: 1 },
    arms: [],
    comparison: null,
    replay: null,
    evidence: null,
    conclusion: null,
    limitations: [],
    status: 'COMPLETED',
  } as unknown as DiscoveryCase;
}

const COMPARISON = (metrics: { key: string; baseline: number; variant: number }[]): DiscoveryComparison => ({
  status: 'COMPLETED',
  controlledDifference: 'scenario',
  metrics: metrics.map((m) => ({ ...m, absoluteDelta: m.variant - m.baseline, relativeDeltaPercent: null })),
  message: 'ok',
  blockedReason: null,
} as unknown as DiscoveryComparison);

const REPLAY: DiscoveryReplay = { status: 'MATCH', message: 'ok' } as unknown as DiscoveryReplay;

describe('a criterion the comparison cannot settle is INSUFFICIENT_EVIDENCE, never NOT_SUPPORTED', () => {
  /**
   * A two-arm comparison has no ordering to be monotonic along. The relation
   * module says so with `applicable: false`; the conclusion must carry that
   * through instead of reporting a failed test.
   */
  it('a monotonic relation on two arms does not become a falsification', () => {
    const conclusion = deriveDiscoveryConclusion(
      caseWith(CRITERION({ relation: 'monotonic-increase' })),
      COMPARISON([{ key: 'totalDeaths', baseline: 10, variant: 5 }]),
      REPLAY,
    );
    expect(conclusion.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(conclusion.verdict).not.toBe('NOT_SUPPORTED');
    expect(conclusion.message).toMatch(/seri/i);
  });

  /** A metric the comparison never produced is missing data, not a failed test. */
  it('a missing metric does not become a falsification either', () => {
    const conclusion = deriveDiscoveryConclusion(
      caseWith(CRITERION({ metric: 'notMeasured' })),
      COMPARISON([{ key: 'totalDeaths', baseline: 10, variant: 5 }]),
      REPLAY,
    );
    expect(conclusion.verdict).toBe('INSUFFICIENT_EVIDENCE');
  });

  /** The decidable cases must keep working exactly as before. */
  it('a real, decidable criterion still decides — both ways', () => {
    const supported = deriveDiscoveryConclusion(
      caseWith(CRITERION()),
      COMPARISON([{ key: 'totalDeaths', baseline: 10, variant: 5 }]),
      REPLAY,
    );
    expect(supported.verdict).toBe('SUPPORTED');

    const notSupported = deriveDiscoveryConclusion(
      caseWith(CRITERION()),
      COMPARISON([{ key: 'totalDeaths', baseline: 5, variant: 10 }]),
      REPLAY,
    );
    expect(notSupported.verdict).toBe('NOT_SUPPORTED');
  });

  /**
   * A SUPPORTING criterion that cannot be settled must not be counted as a
   * failure either — that would turn SUPPORTED into PARTIALLY_SUPPORTED on the
   * strength of a test that never ran.
   */
  it('an undecidable supporting criterion does not downgrade a supported primary', () => {
    const record = caseWith(CRITERION());
    const withSupporting = {
      ...record,
      hypothesis: {
        ...record.hypothesis,
        supportingCriteria: [CRITERION({ metric: 'peakInfectious', relation: 'monotonic-decrease' })],
      },
    } as unknown as DiscoveryCase;
    const conclusion = deriveDiscoveryConclusion(
      withSupporting,
      COMPARISON([{ key: 'totalDeaths', baseline: 10, variant: 5 }, { key: 'peakInfectious', baseline: 9, variant: 3 }]),
      REPLAY,
    );
    expect(conclusion.verdict).toBe('SUPPORTED');
    // …but the unsettled criterion must still be visible, not quietly dropped.
    expect(conclusion.limitations.concat(conclusion.basis).join(' ')).toMatch(/seri/i);
  });
});
