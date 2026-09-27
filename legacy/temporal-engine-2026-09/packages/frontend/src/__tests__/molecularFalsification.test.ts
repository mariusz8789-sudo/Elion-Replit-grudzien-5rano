import { describe, expect, it } from 'vitest';
import {
  FRAGILE_MARGIN_THRESHOLD,
  falsifyBatch,
  falsifyCandidate,
  passMargin,
} from '../core/discovery/molecular/falsification';
import { assessCandidate } from '../core/discovery/molecular/screening';
import type { DiscoveryConstraints, MoleculeCandidate, MoleculeProperty } from '../core/discovery/molecular/types';

/**
 * ETAP 7 — FALSIFICATION.
 *
 * These tests exist to keep two things true: a runnable check is real
 * arithmetic on real values, and nothing here ever stands in for an experiment.
 */
function property(propertyId: string, value: number | null, status: MoleculeProperty['status']): MoleculeProperty {
  return { propertyId, value, status, unit: '', engine: value === null ? null : 'test-engine' };
}

function candidate(id: string, properties: MoleculeProperty[]): MoleculeCandidate {
  return {
    candidateId: id,
    formula: 'C6H6',
    structure: { status: 'ACTUAL_SOURCE', canonicalSmiles: 'c1ccccc1', engine: 'test' },
    parentFormula: null,
    transformation: null,
    properties,
    origin: 'SEED',
  };
}

const constraints: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'O'],
  maxHeavyAtoms: 50,
  criteria: [
    { criterionId: 'mw-ceiling', propertyId: 'molecularWeight', op: 'lte', value: 500, required: true, rationale: 'test' },
    { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: 0, valueMax: 5, required: true, rationale: 'test' },
  ],
};

describe('margines to realna arytmetyka na realnych wartościach', () => {
  it('lte: wartość daleko od granicy ma duży margines', () => {
    const margin = passMargin(
      { criterionId: 'mw-ceiling', propertyId: 'molecularWeight', verdict: 'PASS', observed: 100, observedStatus: 'COMPUTED', detail: '' },
      constraints.criteria[0]!,
    );
    expect(margin).toBeCloseTo(0.8, 5);
  });

  it('lte: wartość tuż pod granicą ma margines bliski zeru', () => {
    const margin = passMargin(
      { criterionId: 'mw-ceiling', propertyId: 'molecularWeight', verdict: 'PASS', observed: 498, observedStatus: 'COMPUTED', detail: '' },
      constraints.criteria[0]!,
    );
    expect(margin).toBeCloseTo(0.004, 5);
    expect(margin!).toBeLessThan(FRAGILE_MARGIN_THRESHOLD);
  });

  it('range: liczy się odległość do BLIŻSZEJ krawędzi', () => {
    const margin = passMargin(
      { criterionId: 'logp-window', propertyId: 'logP', verdict: 'PASS', observed: 4.9, observedStatus: 'COMPUTED', detail: '' },
      constraints.criteria[1]!,
    );
    // okno 0..5, półszerokość 2.5, odległość do 5 to 0.1 → 0.04
    expect(margin).toBeCloseTo(0.04, 5);
  });

  it('bez realnej wartości nie ma marginesu — nie ma też zmyślonego zera', () => {
    expect(passMargin(
      { criterionId: 'logp-window', propertyId: 'logP', verdict: 'NOT_AVAILABLE', observed: null, observedStatus: 'REQUIRES_EXTERNAL_ENGINE', detail: '' },
      constraints.criteria[1]!,
    )).toBeNull();
  });
});

describe('kandydat kruchy jest odróżniony od solidnego', () => {
  const robust = candidate('robust', [property('molecularWeight', 100, 'COMPUTED'), property('logP', 2.5, 'COMPUTED')]);
  const thin = candidate('thin', [property('molecularWeight', 498, 'COMPUTED'), property('logP', 2.5, 'COMPUTED')]);

  it('cienki margines jest wykryty i nazwany', () => {
    const report = falsifyCandidate(thin, assessCandidate(thin, constraints), constraints);

    expect(report.fragileCriteria).toContain('mw-ceiling');
    const check = report.checks.find((c) => c.checkId === 'margin:mw-ceiling')!;
    expect(check.kind).toBe('RUNNABLE_NOW');
    expect(check.fragile).toBe(true);
    expect(check.finding).toMatch(/could flip it/i);
  });

  it('solidny kandydat nie jest oznaczony jako kruchy', () => {
    const report = falsifyCandidate(robust, assessCandidate(robust, constraints), constraints);
    expect(report.fragileCriteria).toHaveLength(0);
    expect(report.robustnessStatement).toMatch(/no thin margins/i);
  });

  it('przetrwanie dostępnych testów NIE jest dowodem poprawności', () => {
    const report = falsifyCandidate(robust, assessCandidate(robust, constraints), constraints);
    expect(report.robustnessStatement).toMatch(/not evidence of correctness/i);
  });
});

describe('nic nie zastępuje eksperymentu', () => {
  const withSafety = candidate('s', [
    property('molecularWeight', 100, 'COMPUTED'),
    property('logP', 2, 'COMPUTED'),
    property('safety', null, 'REQUIRES_EXPERIMENT'),
    property('targetAffinity', null, 'REQUIRES_EXTERNAL_ENGINE'),
  ]);

  it('bezpieczeństwo jest wymienione jako droga obalenia, której NIE da się tu przejść', () => {
    const report = falsifyCandidate(withSafety, assessCandidate(withSafety, constraints), constraints);
    const check = report.checks.find((c) => c.checkId === 'unmeasured:safety')!;

    expect(check.kind).toBe('REQUIRES_EXTERNAL');
    expect(check.finding).toMatch(/requires experimental measurement/i);
    // Krytyczne: taki test NIGDY nie jest RUNNABLE_NOW.
    expect(report.checks.filter((c) => c.kind === 'RUNNABLE_NOW').every((c) => c.checkId.startsWith('margin:'))).toBe(true);
  });

  it('raport liczy nieprzetestowane drogi obalenia zamiast je pomijać', () => {
    const report = falsifyCandidate(withSafety, assessCandidate(withSafety, constraints), constraints);
    expect(report.robustnessStatement).toMatch(/way\(s\) of refuting it remain untested/i);
  });

  it('kryterium nieocenione jest "nietestowane", nie "zdane"', () => {
    const noLogp = candidate('n', [property('molecularWeight', 100, 'COMPUTED'), property('logP', null, 'REQUIRES_EXTERNAL_ENGINE')]);
    const report = falsifyCandidate(noLogp, assessCandidate(noLogp, constraints), constraints);
    const check = report.checks.find((c) => c.checkId === 'unevaluated:logp-window')!;

    expect(check.kind).toBe('REQUIRES_EXTERNAL');
    expect(check.finding).toMatch(/neither passed nor failed/i);
  });
});

describe('raport wsadowy zbiera kruchość i luki', () => {
  it('wskazuje kruchych kandydatów i wspólne nieprzetestowane drogi obalenia', () => {
    const a = candidate('a', [property('molecularWeight', 499, 'COMPUTED'), property('logP', 2, 'COMPUTED'), property('safety', null, 'REQUIRES_EXPERIMENT')]);
    const b = candidate('b', [property('molecularWeight', 50, 'COMPUTED'), property('logP', 2, 'COMPUTED'), property('safety', null, 'REQUIRES_EXPERIMENT')]);
    const assessments = [a, b].map((c) => assessCandidate(c, constraints));

    const batch = falsifyBatch([a, b], assessments, constraints);
    expect(batch.fragileCandidateIds).toEqual(['a']);
    expect(batch.untestedRefutations).toContain('unmeasured:safety');
    expect(batch.perCandidate).toHaveLength(2);
  });

  it('kandydat nieutrzymany nie dostaje deklaracji odporności', () => {
    const failing = candidate('f', [property('molecularWeight', 900, 'COMPUTED'), property('logP', 2, 'COMPUTED')]);
    const report = falsifyCandidate(failing, assessCandidate(failing, constraints), constraints);
    expect(report.robustnessStatement).toMatch(/no robustness claim applies/i);
  });
});
