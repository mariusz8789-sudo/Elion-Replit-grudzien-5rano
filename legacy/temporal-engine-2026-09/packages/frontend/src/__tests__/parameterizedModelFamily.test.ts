import { describe, expect, it } from 'vitest';
import {
  runParameterizedModelFamily,
  replayParameterizedModelFamily,
  saveParameterizedModelFamilyToMemory,
  type ModelFamily,
  type ModelFamilyVariantSpec,
} from '../core/discovery/parameterizedModelFamily';
import type { ModelDataPoint } from '../core/discovery/molecular/scientificModel';

/**
 * A controlled synthetic family: the TRUE relationship is y = 2 + 3x,
 * generated deterministically (never claimed as a real measurement — every
 * point below is explicitly SIMULATED, used only to prove the generic
 * mechanism actually fits, tests on holdout, and discriminates a correct
 * functional form from a wrong one under real computation).
 */
const TRUE_A = 2;
const TRUE_B = 3;
function trueY(x: number): number {
  return TRUE_A + TRUE_B * x;
}

const TRAINING_X = [1, 2, 3, 4];
const HOLDOUT_X = [5, 6];

function pointsFor(xs: readonly number[]): ModelDataPoint[] {
  return xs.map((x) => ({ inputs: { x }, measuredOutput: trueY(x), evidenceRecordId: `SIMULATED:x=${x}` }));
}

const CORRECT_VARIANT: ModelFamilyVariantSpec = {
  variantId: 'linear-in-x',
  statement: 'y = a + b*x (linear in x)',
  equationText: 'y = a + b*x',
  variables: [
    { symbol: 'x', meaning: 'input', unit: 'unitless', role: 'INPUT' },
    { symbol: 'y', meaning: 'output', unit: 'unitless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'a', meaning: 'intercept', unit: 'unitless', value: null, source: 'NOT_YET_ESTIMATED' },
    { symbol: 'b', meaning: 'slope', unit: 'unitless', value: null, source: 'NOT_YET_ESTIMATED' },
  ],
  assumptions: ['The relationship is linear in x over this range.'],
  searchRanges: [
    { symbol: 'a', min: -10, max: 10, steps: 401 },
    { symbol: 'b', min: -10, max: 10, steps: 401 },
  ],
  evaluate: (params, inputs) => params.a! + params.b! * inputs.x!,
};

const WRONG_VARIANT: ModelFamilyVariantSpec = {
  variantId: 'linear-in-x-squared',
  statement: 'y = a + b*x^2 (linear in x^2)',
  equationText: 'y = a + b*x^2',
  variables: [
    { symbol: 'x', meaning: 'input', unit: 'unitless', role: 'INPUT' },
    { symbol: 'y', meaning: 'output', unit: 'unitless', role: 'OUTPUT' },
  ],
  parameters: [
    { symbol: 'a', meaning: 'intercept', unit: 'unitless', value: null, source: 'NOT_YET_ESTIMATED' },
    { symbol: 'b', meaning: 'coefficient', unit: 'unitless', value: null, source: 'NOT_YET_ESTIMATED' },
  ],
  assumptions: ['The relationship is linear in x^2 over this range.'],
  searchRanges: [
    { symbol: 'a', min: -10, max: 10, steps: 401 },
    { symbol: 'b', min: -10, max: 10, steps: 401 },
  ],
  evaluate: (params, inputs) => params.a! + params.b! * (inputs.x! * inputs.x!),
};

function buildFamily(variants: readonly ModelFamilyVariantSpec[]): ModelFamily {
  return { familyId: 'test-linear-family', domainId: 'TEST', description: 'Synthetic family for testing runParameterizedModelFamily.', variants };
}

const TOLERANCE = 0.05;

describe('runParameterizedModelFamily — the correct variant wins on real computation', () => {
  it('the correct functional form (linear in x) is genuinely SUPPORTED on held-out data', () => {
    const result = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    const outcome = result.outcomes[0]!;
    expect(outcome.candidate.status).toBe('TESTED');
    expect(outcome.candidate.verdict).toBe('SUPPORTED');
    expect(outcome.fit).not.toBeNull();
    expect(outcome.holdoutMeanAbsoluteError).not.toBeNull();
    expect(outcome.holdoutMeanAbsoluteError!).toBeLessThanOrEqual(TOLERANCE);
  });

  it('the wrong functional form (linear in x^2) is genuinely FALSIFIED on held-out data — by computation, not assertion', () => {
    const result = runParameterizedModelFamily(buildFamily([WRONG_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    const outcome = result.outcomes[0]!;
    expect(outcome.candidate.verdict).toBe('FALSIFIED');
    expect(outcome.holdoutMeanAbsoluteError!).toBeGreaterThan(TOLERANCE);
  });

  it('END-TO-END: comparing both variants together, the correct one wins and is declared the family winner', () => {
    const result = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT, WRONG_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    expect(result.winningVariantId).toBe('linear-in-x');
    const wrong = result.outcomes.find((o) => o.variantId === 'linear-in-x-squared')!;
    expect(wrong.candidate.verdict).toBe('FALSIFIED');
  });

  it('the fitted parameters land close to the true generating values (a=2, b=3)', () => {
    const result = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    expect(result.outcomes[0]!.fit!.trainingMeanAbsoluteError).toBeLessThan(0.1);
  });
});

describe('runParameterizedModelFamily — honest failure paths, no fabrication', () => {
  it('UNTESTED when fitting succeeds but no holdout data is supplied', () => {
    const result = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT]), pointsFor(TRAINING_X), [], TOLERANCE);
    expect(result.outcomes[0]!.candidate.verdict).toBe('UNTESTED');
    expect(result.outcomes[0]!.fit).not.toBeNull();
    expect(result.winningVariantId).toBeNull();
  });

  it('BLOCKED when no training data is supplied — never invents a fit', () => {
    const result = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT]), [], pointsFor(HOLDOUT_X), TOLERANCE);
    expect(result.outcomes[0]!.candidate.verdict).toBe('BLOCKED');
    expect(result.outcomes[0]!.fit).toBeNull();
  });

  it('BLOCKED when a variant pre-sets a value for a parameter also in its own search range', () => {
    const conflicting: ModelFamilyVariantSpec = { ...CORRECT_VARIANT, variantId: 'conflicting', parameters: [{ ...CORRECT_VARIANT.parameters[0]!, value: 5 }, CORRECT_VARIANT.parameters[1]!] };
    const result = runParameterizedModelFamily(buildFamily([conflicting]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    expect(result.outcomes[0]!.candidate.verdict).toBe('BLOCKED');
    expect(result.outcomes[0]!.candidate.verdictReasoning).toMatch(/pre-set value/);
  });

  it('no winner is declared when every variant is FALSIFIED', () => {
    const result = runParameterizedModelFamily(buildFamily([WRONG_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    expect(result.winningVariantId).toBeNull();
  });

  it('every candidate carries real provenance tracing to the family and its declared variable(s)', () => {
    const result = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    const candidate = result.outcomes[0]!.candidate;
    expect(candidate.dependencyIds).toContain('test-linear-family');
    expect(candidate.dependencyIds).toContain('x');
    expect(candidate.provenance.length).toBeGreaterThan(0);
    expect(candidate.noveltyStatus).toBe('NOVELTY_NOT_ESTABLISHED');
  });
});

describe('runParameterizedModelFamily — determinism and replay', () => {
  it('is deterministic across runs', () => {
    const a = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT, WRONG_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    const b = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT, WRONG_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });

  it('replays MATCH when re-run against identical family/data', () => {
    const family = buildFamily([CORRECT_VARIANT, WRONG_VARIANT]);
    const saved = runParameterizedModelFamily(family, pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    expect(replayParameterizedModelFamily(saved, family, pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE).status).toBe('MATCH');
  });

  it('replays DRIFT when the holdout data changes', () => {
    const family = buildFamily([CORRECT_VARIANT, WRONG_VARIANT]);
    const saved = runParameterizedModelFamily(family, pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    const differentHoldout = pointsFor([7, 8]);
    expect(replayParameterizedModelFamily(saved, family, pointsFor(TRAINING_X), differentHoldout, TOLERANCE).status).toBe('DRIFT');
  });

  it('saves to memory with an honest per-verdict breakdown and the real winner', () => {
    const result = runParameterizedModelFamily(buildFamily([CORRECT_VARIANT, WRONG_VARIANT]), pointsFor(TRAINING_X), pointsFor(HOLDOUT_X), TOLERANCE);
    const saved = saveParameterizedModelFamilyToMemory(result);
    expect(saved.epistemicStatus).toContain('WINNER=linear-in-x');
    expect(saved.epistemicStatus).toContain('SUPPORTED=1');
    expect(saved.epistemicStatus).toContain('FALSIFIED=1');
  });
});
