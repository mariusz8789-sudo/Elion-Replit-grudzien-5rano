import { describe, it, expect } from 'vitest';
import { selectNextTest, scoreCandidate, assessmentUncertainty, type CyberTestCandidate } from '../core/agent/cyberTestPlanner';
import type { HypothesisAssessment } from '../core/experimentFabric/scientificDiscovery';

/**
 * PLANNER UNIT TESTS — pure function tests against directly-constructed
 * candidates, independent of the Cyber fixture. `cyberAdaptiveInvestigation.test.ts`
 * covers the real, wired integration through the actual Cyber Reasoning Kernel.
 */

const cand = (over: Partial<CyberTestCandidate>): CyberTestCandidate => ({
  hypothesisId: 'H1', discriminationPower: 0.7, safety: 'SAFE', cost: 0.1, downstreamValue: 0.6,
  identityKind: 'NEW', priorAttempts: 0, ...over,
});

describe('assessmentUncertainty (canonical HypothesisAssessment reused, no parallel vocabulary)', () => {
  it('unresolved assessments carry uncertainty=1, terminal ones carry 0', () => {
    const unresolved: HypothesisAssessment[] = ['CANDIDATE', 'INCONCLUSIVE'];
    const terminal: HypothesisAssessment[] = ['SUPPORTED_WITHIN_PROTOCOL', 'FALSIFIED_WITHIN_PROTOCOL'];
    for (const a of unresolved) expect(assessmentUncertainty(a)).toBe(1);
    for (const a of terminal) expect(assessmentUncertainty(a)).toBe(0);
  });
});

describe('selectNextTest — safety exclusion', () => {
  it('UNSAFE candidates are excluded outright, never merely down-weighted', () => {
    const candidates = [
      cand({ hypothesisId: 'unsafe-but-high-value', safety: 'UNSAFE', discriminationPower: 1, downstreamValue: 1 }),
      cand({ hypothesisId: 'safe-lower-value', safety: 'SAFE', discriminationPower: 0.3, downstreamValue: 0.3 }),
    ];
    const sel = selectNextTest(candidates, new Map());
    expect(sel.selectedHypothesisId).toBe('safe-lower-value');
  });

  it('all-UNSAFE candidate pool selects nothing', () => {
    const sel = selectNextTest([cand({ safety: 'UNSAFE' })], new Map());
    expect(sel.selectedHypothesisId).toBeNull();
  });
});

describe('selectNextTest — highest-value selection and WHY/WHY-NOT', () => {
  it('selects the higher-scoring safe candidate and explains both selection and rejection', () => {
    const candidates = [
      cand({ hypothesisId: 'strong', discriminationPower: 0.9, downstreamValue: 0.9 }),
      cand({ hypothesisId: 'weak', discriminationPower: 0.2, downstreamValue: 0.2 }),
    ];
    const sel = selectNextTest(candidates, new Map());
    expect(sel.selectedHypothesisId).toBe('strong');
    expect(sel.whySelected.length).toBeGreaterThan(0);
    expect(sel.whyNotAlternative).toContain('weak');
    expect(sel.targetHypotheses).toEqual(['strong']);
    expect(sel.expectedInformationGain).toBeGreaterThan(0);
  });

  it('stops (selects nothing) once the only candidate is already resolved and not a deliberate replication', () => {
    const candidates = [cand({ identityKind: 'NEW' })];
    const assessments = new Map<string, HypothesisAssessment>([['H1', 'SUPPORTED_WITHIN_PROTOCOL']]);
    const sel = selectNextTest(candidates, assessments);
    expect(sel.selectedHypothesisId).toBeNull();
  });
});

describe('selectNextTest — repeat penalty vs independent replication', () => {
  it('a REPEAT of an unresolved hypothesis scores lower than a fresh NEW candidate of equal quality', () => {
    const fresh = cand({ hypothesisId: 'fresh', identityKind: 'NEW' });
    const repeat = cand({ hypothesisId: 'repeated', identityKind: 'REPEAT', priorAttempts: 1 });
    const assessments = new Map<string, HypothesisAssessment>([['fresh', 'CANDIDATE'], ['repeated', 'INCONCLUSIVE']]);
    const sel = selectNextTest([fresh, repeat], assessments);
    expect(sel.selectedHypothesisId).toBe('fresh');
    expect(scoreCandidate(repeat, 1)).toBeLessThan(scoreCandidate(fresh, 1));
  });

  it('INDEPENDENT_REPLICATION is selectable even though the hypothesis it targets is already terminal', () => {
    const replication = cand({ hypothesisId: 'H1', identityKind: 'INDEPENDENT_REPLICATION', priorAttempts: 1 });
    const assessments = new Map<string, HypothesisAssessment>([['H1', 'SUPPORTED_WITHIN_PROTOCOL']]);
    const sel = selectNextTest([replication], assessments);
    expect(sel.selectedHypothesisId).toBe('H1');
  });

  it('REPEAT and INDEPENDENT_REPLICATION are scored differently for the same otherwise-equal candidate', () => {
    const repeatScore = scoreCandidate(cand({ identityKind: 'REPEAT' }), 1);
    const replicationScore = scoreCandidate(cand({ identityKind: 'INDEPENDENT_REPLICATION' }), 1);
    expect(replicationScore).toBeGreaterThan(repeatScore);
  });
});
