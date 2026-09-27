import { describe, expect, it } from 'vitest';
import { runHypothesisCompetition } from '../core/discovery/molecular/competingHypotheses';
import type { ExperimentalResult, TestableHypothesis } from '../core/discovery/molecular/experimentalResult';

function result(overrides: Partial<ExperimentalResult>): ExperimentalResult {
  return {
    resultId: 'r1', compound: 'X', canonicalSmiles: null, target: 'NMDAR', assay: 'patch clamp',
    parameter: 'IC50', value: 1, unit: 'uM', observation: null, model: 'HEK293', species: 'Human',
    cellLine: null, concentration: null, replicates: null, controls: null, timepoint: null, uncertainty: null,
    provenance: { kind: 'REAL_MEASUREMENT', source: 'test', rawDataReference: null, recordedAt: '2026-01-01T00:00:00Z' },
    ...overrides,
  };
}

const openChannel: TestableHypothesis = {
  hypothesisId: 'h-open-channel', statement: 'Open-channel block', compound: null, target: 'NMDAR', parameter: 'IC50',
  supportedIf: 'low IC50', falsifiedIf: 'no engagement', threshold: 10, thresholdUnit: 'uM', lowerIsSupport: true,
};
const competitiveAntagonist: TestableHypothesis = {
  hypothesisId: 'h-competitive', statement: 'Competitive antagonism', compound: null, target: 'NMDAR', parameter: 'Ki',
  supportedIf: 'low Ki', falsifiedIf: 'no binding', threshold: 10, thresholdUnit: 'uM', lowerIsSupport: true,
};
const unrelated: TestableHypothesis = {
  hypothesisId: 'h-unrelated', statement: 'Acts at GABA-A instead', compound: null, target: 'GABA-A', parameter: 'IC50',
  supportedIf: 'low IC50', falsifiedIf: 'no engagement', threshold: 10, thresholdUnit: 'uM', lowerIsSupport: true,
};

describe('multi-hypothesis competition', () => {
  it('a hypothesis with no deciding result is UNTESTED, not falsified or supported', () => {
    const r = runHypothesisCompetition([openChannel], [], []);
    expect(r.outcomes[0]!.competitionStatus).toBe('UNTESTED');
    expect(r.leadingHypothesis).toBeNull();
  });

  it('one supported hypothesis with no competitor in its group leads outright', () => {
    const r = runHypothesisCompetition(
      [openChannel, unrelated],
      [result({ resultId: 'a', target: 'NMDAR', parameter: 'IC50', value: 1 })],
      [],
    );
    const open = r.outcomes.find((o) => o.hypothesisId === 'h-open-channel')!;
    expect(open.competitionStatus).toBe('SUPPORTED');
    expect(r.leadingHypothesis).toBe('h-open-channel');
  });

  it('two mutually exclusive hypotheses both supported: the one with more independent evidence leads, the other is WEAKENED not SUPPORTED', () => {
    const results: ExperimentalResult[] = [
      result({ resultId: 'a', target: 'NMDAR', parameter: 'IC50', value: 1 }),
      result({ resultId: 'b', target: 'NMDAR', parameter: 'IC50', value: 2 }),
      result({ resultId: 'c', target: 'NMDAR', parameter: 'Ki', value: 3 }),
    ];
    const r = runHypothesisCompetition([openChannel, competitiveAntagonist], results, [['h-open-channel', 'h-competitive']]);
    const open = r.outcomes.find((o) => o.hypothesisId === 'h-open-channel')!;
    const comp = r.outcomes.find((o) => o.hypothesisId === 'h-competitive')!;
    expect(open.independentEvidenceCount).toBe(2);
    expect(comp.independentEvidenceCount).toBe(1);
    expect(open.competitionStatus).toBe('SUPPORTED');
    expect(comp.competitionStatus).toBe('WEAKENED');
    expect(comp.reason).toContain('demoted to WEAKENED');
    expect(r.leadingHypothesis).toBe('h-open-channel');
    expect(r.discriminated).toBe(true);
  });

  it('a falsifying result actually falsifies, and does not get demoted differently', () => {
    const r = runHypothesisCompetition(
      [openChannel],
      [result({ resultId: 'a', target: 'NMDAR', parameter: 'IC50', value: 500 })],
      [],
    );
    expect(r.outcomes[0]!.competitionStatus).toBe('FALSIFIED');
    expect(r.leadingHypothesis).toBeNull();
  });

  it('conflicting deciding evidence for one hypothesis is BLOCKED, never silently resolved', () => {
    const r = runHypothesisCompetition(
      [openChannel],
      [
        result({ resultId: 'a', target: 'NMDAR', parameter: 'IC50', value: 1 }),
        result({ resultId: 'b', target: 'NMDAR', parameter: 'IC50', value: 500 }),
      ],
      [],
    );
    expect(r.outcomes[0]!.competitionStatus).toBe('BLOCKED');
  });

  it('hypotheses outside any mutually-exclusive group never demote each other', () => {
    const r = runHypothesisCompetition(
      [openChannel, unrelated],
      [
        result({ resultId: 'a', target: 'NMDAR', parameter: 'IC50', value: 1 }),
        result({ resultId: 'b', target: 'GABA-A', parameter: 'IC50', value: 1 }),
      ],
      [],
    );
    expect(r.outcomes.every((o) => o.competitionStatus === 'SUPPORTED')).toBe(true);
  });
});
