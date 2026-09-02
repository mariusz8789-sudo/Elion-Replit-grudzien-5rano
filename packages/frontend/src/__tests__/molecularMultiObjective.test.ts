import { describe, expect, it } from 'vitest';
import {
  candidateObjectives,
  dominates,
  objectiveValueFor,
  paretoFrontIndices,
  rankMultiObjective,
  type Objective,
} from '../core/discovery/molecular/multiObjective';
import { assessCandidate } from '../core/discovery/molecular/screening';
import type { DiscoveryConstraints, MoleculeCandidate, MoleculeProperty } from '../core/discovery/molecular/types';

/**
 * ETAP 6 — MULTI-OBJECTIVE RANKING.
 *
 * The central property under test: a metric with no real value never
 * influences a ranking, in either direction.
 */
function property(propertyId: string, value: number | null, status: MoleculeProperty['status']): MoleculeProperty {
  return { propertyId, value, status, unit: '', engine: value === null ? null : 'test-engine' };
}

function candidate(id: string, formula: string, properties: MoleculeProperty[]): MoleculeCandidate {
  return {
    candidateId: id,
    formula,
    structure: { status: 'ACTUAL_SOURCE', canonicalSmiles: `SMILES_${id}`, engine: 'test' },
    parentFormula: null,
    transformation: null,
    properties,
    origin: 'SEED',
  };
}

const objectives: readonly Objective[] = [
  { objectiveId: 'low-mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'smaller is preferred here' },
  { objectiveId: 'logp-near-2', propertyId: 'logP', direction: 'target', targetValue: 2, rationale: 'target lipophilicity' },
];

const constraints: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'O'],
  maxHeavyAtoms: 50,
  criteria: [{ criterionId: 'mw-ok', propertyId: 'molecularWeight', op: 'lte', value: 500, required: true, rationale: 'test' }],
};

describe('metryka bez wartości nie wpływa na ranking', () => {
  it('właściwość REQUIRES_EXTERNAL_ENGINE jest nieocenialna, nie zerowa', () => {
    const c = candidate('a', 'C6H6', [property('logP', null, 'REQUIRES_EXTERNAL_ENGINE')]);
    const value = objectiveValueFor(c, objectives[1]!);

    expect(value.evaluable).toBe(false);
    if (value.evaluable) return;
    expect(value.reason).toMatch(/cannot influence ranking/i);
    // KLUCZOWE: brak wartości nie staje się liczbą.
    expect((value as unknown as { cost?: number }).cost).toBeUndefined();
  });

  it('brak właściwości w ogóle też jest nieocenialny', () => {
    const value = objectiveValueFor(candidate('a', 'C6H6', []), objectives[0]!);
    expect(value.evaluable).toBe(false);
  });

  it('REQUIRES_EXPERIMENT nigdy nie wchodzi do rankingu', () => {
    const c = candidate('a', 'C6H6', [property('safety', null, 'REQUIRES_EXPERIMENT')]);
    const safetyObjective: Objective = { objectiveId: 'safe', propertyId: 'safety', direction: 'maximise', rationale: 'test' };
    expect(objectiveValueFor(c, safetyObjective).evaluable).toBe(false);
  });

  it('kierunki celu są przeliczane na koszt (mniej = lepiej)', () => {
    const c = candidate('a', 'C6H6', [property('molecularWeight', 100, 'COMPUTED'), property('logP', 3, 'COMPUTED')]);
    const objs = candidateObjectives(c, objectives);

    const mw = objs.values.find((v) => v.objectiveId === 'low-mw')!;
    const logp = objs.values.find((v) => v.objectiveId === 'logp-near-2')!;
    expect(mw.evaluable && mw.cost).toBe(100);
    // target 2, wartość 3 → koszt = |3-2| = 1
    expect(logp.evaluable && logp.cost).toBe(1);
  });
});

describe('dominacja Pareto zgadza się z implementacją backendu', () => {
  it('podstawowe własności dominacji', () => {
    expect(dominates([1, 1], [2, 2])).toBe(true);
    expect(dominates([1, 2], [2, 1])).toBe(false);
    expect(dominates([1, 1], [1, 1])).toBe(false);
    expect(dominates([1, 1], [1, 2])).toBe(true);
  });

  it('front Pareto jest identyczny z campaign/pareto.mjs na tych samych wektorach', async () => {
    // Nie zakładamy zgodności — sprawdzamy ją względem realnego modułu backendu.
    // Ścieżka bezwzględna: import przez zmienną gubi bazę relatywną.
    const { pathToFileURL } = await import('node:url');
    const path = (await import('node:path')).default;
    const backendPath = pathToFileURL(path.resolve(__dirname, '../../../backend/src/campaign/pareto.mjs')).href;
    const backend = (await import(/* @vite-ignore */ backendPath)) as {
      paretoFrontIndices: (v: number[][]) => number[];
      dominates: (a: number[], b: number[]) => boolean;
    };
    const cases = [
      [[1, 5], [2, 3], [3, 1], [4, 4]],
      [[1, 1], [1, 1], [2, 2]],
      [[5, 5]],
      [[1, 9], [9, 1], [5, 5], [2, 2]],
      [[0, 0], [1, 0], [0, 1]],
    ];

    for (const vectors of cases) {
      const mine = paretoFrontIndices(vectors);
      const theirs = backend.paretoFrontIndices(vectors);
      expect([...mine], JSON.stringify(vectors)).toEqual([...theirs]);
      for (const [a, b] of [[vectors[0]!, vectors[1] ?? vectors[0]!]]) {
        expect(dominates(a, b)).toBe(backend.dominates(a, b));
      }
    }
  });
});

describe('ranking wielokryterialny rozdziela cztery losy kandydata', () => {
  const good = candidate('good', 'C6H6', [property('molecularWeight', 100, 'COMPUTED'), property('logP', 2, 'COMPUTED')]);
  const dominated = candidate('dom', 'C7H8', [property('molecularWeight', 200, 'COMPUTED'), property('logP', 4, 'COMPUTED')]);
  const tradeoff = candidate('trade', 'C8H8', [property('molecularWeight', 90, 'COMPUTED'), property('logP', 5, 'COMPUTED')]);
  const failing = candidate('fail', 'C9H8', [property('molecularWeight', 900, 'COMPUTED'), property('logP', 2, 'COMPUTED')]);
  const missing = candidate('miss', 'C5H6', [property('molecularWeight', 80, 'COMPUTED'), property('logP', null, 'REQUIRES_EXTERNAL_ENGINE')]);

  const all = [good, dominated, tradeoff, failing, missing];
  const assessments = all.map((c) => assessCandidate(c, constraints));
  const result = rankMultiObjective(all, assessments, objectives, constraints);

  it('kandydat odrzucony przez kryteria zostaje odrzucony mimo dobrych celów', () => {
    const entry = result.ranked.find((r) => r.candidateId === 'fail')!;
    expect(entry.outcome).toBe('REJECTED');
    expect(entry.justification).toMatch(/cannot rescue a candidate/i);
    expect(entry.onParetoFront).toBe(false);
  });

  it('kandydat z brakującym celem jest BLOCKED, nie po cichu pominięty', () => {
    const entry = result.ranked.find((r) => r.candidateId === 'miss')!;
    expect(entry.outcome).toBe('BLOCKED');
    expect(entry.missingObjectives).toContain('logp-near-2');
    expect(entry.justification).toMatch(/comparison of different things/i);
  });

  it('front zawiera kandydatów niezdominowanych, a nie tylko jednego "zwycięzcę"', () => {
    // good (100, |2-2|=0) i trade (90, |5-2|=3) to realny kompromis: żaden nie
    // dominuje drugiego. dom (200, 2) jest zdominowany przez good.
    expect(result.retained.filter((r) => r.onParetoFront).map((r) => r.candidateId).sort()).toEqual(['good', 'trade']);
    expect(result.ranked.find((r) => r.candidateId === 'dom')!.onParetoFront).toBe(false);
    expect(result.ranked.find((r) => r.candidateId === 'dom')!.justification).toMatch(/dominated/i);
  });

  it('kompletny podział: nic nie ginie między kategoriami', () => {
    const total = result.retained.length + result.rejected.length + result.unevaluable.length + result.blocked.length;
    expect(total).toBe(all.length);
  });

  it('zastrzeżenie mówi, ILE celów faktycznie policzono', () => {
    expect(result.frontCaveat).toMatch(/Pareto front computed over 2 of 2/);
  });
});

describe('gdy nic nie da się porównać, ranking tego nie ukrywa', () => {
  it('wszystkie cele nieocenialne → BLOCKED i jawne zastrzeżenie', () => {
    const c1 = candidate('a', 'C6H6', [property('molecularWeight', 100, 'COMPUTED'), property('logP', null, 'REQUIRES_EXTERNAL_ENGINE')]);
    const c2 = candidate('b', 'C7H8', [property('molecularWeight', 110, 'COMPUTED'), property('logP', null, 'REQUIRES_EXTERNAL_ENGINE')]);
    const onlyLogp: readonly Objective[] = [{ objectiveId: 'logp-near-2', propertyId: 'logP', direction: 'target', targetValue: 2, rationale: 't' }];

    const result = rankMultiObjective([c1, c2], [c1, c2].map((c) => assessCandidate(c, constraints)), onlyLogp, constraints);

    expect(result.retained).toHaveLength(0);
    expect(result.blocked).toHaveLength(2);
    expect(result.objectivesNeverEvaluable).toEqual(['logp-near-2']);
    expect(result.frontCaveat).toMatch(/No Pareto front was computed/i);
  });

  it('zero zadeklarowanych celów nie udaje rankingu', () => {
    const c = candidate('a', 'C6H6', [property('molecularWeight', 100, 'COMPUTED')]);
    const result = rankMultiObjective([c], [assessCandidate(c, constraints)], [], constraints);

    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]!.justification).toMatch(/No objectives were declared/i);
  });
});
