import { describe, expect, it } from 'vitest';

import { updateConfidence, createHypothesis } from '../core/experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import {
  GROUNDING_CONTRIBUTION_WEIGHT,
  groundingContributionWeight,
  weightMagnitudeByGrounding,
} from '../core/worldModel/discovery/groundingWeight';
import type { GroundingLevel } from '../core/worldModel/ecs/types';

/**
 * ENGINE 07 — GROUNDING-WEIGHTED EVIDENCE CONTRIBUTION.
 *
 * The gap this closes: `GroundingLevel` is declared by every domain and
 * carried on every entity, but nothing read it when revising belief. These
 * tests hold the weighting to two properties that matter more than the exact
 * constants: (1) an entity nothing models cannot move belief as far as a
 * modelled one, and (2) worlds whose measured entity declares a real solver
 * behave EXACTLY as they did before this module existed.
 */

const CRITERION: FalsificationCriterion = {
  metric: 'infectious',
  relation: 'equal-within-tolerance',
  expectedValue: 100,
  tolerance: 10,
  rationale: 'Declared before the run, for this test fixture.',
};

describe('groundingContributionWeight — total over the declared enum, no silent default', () => {
  it('covers every GroundingLevel the ECS declares', () => {
    const declared: GroundingLevel[] = ['GROUNDED_EXACT', 'MODEL_ESTIMATE', 'PROCEDURAL_APPROXIMATION', 'UNGROUNDED_APPROXIMATION'];
    for (const level of declared) {
      const weight = groundingContributionWeight(level);
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
    }
    // A new enum member added without a weight would surface here as undefined.
    expect(Object.keys(GROUNDING_CONTRIBUTION_WEIGHT).sort()).toEqual([...declared].sort());
  });

  it('ranks grounded models at or above approximations — the whole point of the axis', () => {
    expect(groundingContributionWeight('GROUNDED_EXACT')).toBeGreaterThan(groundingContributionWeight('PROCEDURAL_APPROXIMATION'));
    expect(groundingContributionWeight('PROCEDURAL_APPROXIMATION')).toBeGreaterThan(groundingContributionWeight('UNGROUNDED_APPROXIMATION'));
  });

  it('leaves a real solver-advanced entity at full weight — existing behaviour is bit-identical', () => {
    expect(groundingContributionWeight('MODEL_ESTIMATE')).toBe(1);
    expect(groundingContributionWeight('GROUNDED_EXACT')).toBe(1);
    for (const magnitude of [0, 0.13, 0.5, 1]) {
      expect(weightMagnitudeByGrounding(magnitude, 'MODEL_ESTIMATE')).toBe(magnitude);
    }
  });
});

describe('weightMagnitudeByGrounding — stays inside updateConfidence\'s 0..1 contract', () => {
  it('scales an ungrounded reading down without ever leaving 0..1', () => {
    expect(weightMagnitudeByGrounding(1, 'UNGROUNDED_APPROXIMATION')).toBeCloseTo(0.25, 10);
    expect(weightMagnitudeByGrounding(0.8, 'PROCEDURAL_APPROXIMATION')).toBeCloseTo(0.4, 10);
  });

  it('clamps an out-of-range magnitude rather than propagating it', () => {
    expect(weightMagnitudeByGrounding(5, 'MODEL_ESTIMATE')).toBe(1);
    expect(weightMagnitudeByGrounding(-3, 'MODEL_ESTIMATE')).toBe(0);
  });

  it('returns 0 for ANY non-finite magnitude — NaN and Infinity alike contribute nothing rather than everything', () => {
    expect(weightMagnitudeByGrounding(Number.NaN, 'GROUNDED_EXACT')).toBe(0);
    // Infinity is not a measurement. Clamping it to 1 would let a broken
    // reading move belief maximally; contributing 0 is the honest choice.
    expect(weightMagnitudeByGrounding(Number.POSITIVE_INFINITY, 'GROUNDED_EXACT')).toBe(0);
    expect(weightMagnitudeByGrounding(Number.NEGATIVE_INFINITY, 'GROUNDED_EXACT')).toBe(0);
  });
});

describe('the real consequence: belief moves less on an entity nothing models', () => {
  it('the SAME measurement moves confidence strictly further on MODEL_ESTIMATE than on UNGROUNDED_APPROXIMATION', () => {
    const start = createHypothesis('h1', CRITERION, 0.5);
    const rawMagnitude = 1;

    const grounded = updateConfidence(
      start, 'SUPPORTED_WITHIN_PROTOCOL', weightMagnitudeByGrounding(rawMagnitude, 'MODEL_ESTIMATE'), 'grounded', 1,
    );
    const ungrounded = updateConfidence(
      start, 'SUPPORTED_WITHIN_PROTOCOL', weightMagnitudeByGrounding(rawMagnitude, 'UNGROUNDED_APPROXIMATION'), 'ungrounded', 1,
    );

    expect(grounded.confidence).toBeGreaterThan(ungrounded.confidence);
    expect(ungrounded.confidence).toBeGreaterThan(start.confidence); // still real evidence, just weaker
  });

  it('works in the falsifying direction too — an ungrounded reading cannot demolish a hypothesis on its own', () => {
    const start = createHypothesis('h2', CRITERION, 0.5);
    const grounded = updateConfidence(start, 'FALSIFIED_WITHIN_PROTOCOL', weightMagnitudeByGrounding(1, 'MODEL_ESTIMATE'), 'g', 1);
    const ungrounded = updateConfidence(start, 'FALSIFIED_WITHIN_PROTOCOL', weightMagnitudeByGrounding(1, 'UNGROUNDED_APPROXIMATION'), 'u', 1);

    expect(grounded.confidence).toBeLessThan(ungrounded.confidence);
    expect(ungrounded.confidence).toBeLessThan(start.confidence);
  });

  it('the weighting is recorded in the belief history, so it is auditable rather than silent', () => {
    const start = createHypothesis('h3', CRITERION, 0.5);
    const weighted = weightMagnitudeByGrounding(1, 'UNGROUNDED_APPROXIMATION');
    const after = updateConfidence(start, 'SUPPORTED_WITHIN_PROTOCOL', weighted, 'ungrounded reading', 1);

    expect(after.history).toHaveLength(1);
    expect(after.history[0]!.evidenceMagnitude).toBeCloseTo(0.25, 10);
  });

  it('adds no new verdict vocabulary — the assessment passed through is returned unchanged', () => {
    const start = createHypothesis('h4', CRITERION, 0.5);
    const after = updateConfidence(start, 'FALSIFIED_WITHIN_PROTOCOL', weightMagnitudeByGrounding(0.9, 'PROCEDURAL_APPROXIMATION'), 'r', 1);
    expect(after.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });
});

describe('wired into the REAL calibration loop, on the real epidemic world', () => {
  it('reads the measured entity\'s grounding off the actual world — declared MODEL_ESTIMATE, not assumed', async () => {
    const { epidemicInfectiousDaysSystem, EPIDEMIC_INFECTIOUS_DAYS_HYPOTHESES, EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK } =
      await import('../core/agent/epidemicInfectiousDaysCalibration');
    const { runAutonomousWorldCalibration } = await import('../core/agent/worldParameterCalibration');

    const result = runAutonomousWorldCalibration({
      question: 'How many infectious days does this population really have?',
      system: epidemicInfectiousDaysSystem(6),
      hypotheses: EPIDEMIC_INFECTIOUS_DAYS_HYPOTHESES,
      openingProbeTick: EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK,
      maxRounds: 2,
    });

    const outcomes = result.rounds.flatMap((round) => round.outcomes);
    expect(outcomes.length).toBeGreaterThan(0);

    for (const outcome of outcomes) {
      // Read from the real WorldGraph the SEIR domain built, where
      // epidemicSEIR.ts declares the population entity as MODEL_ESTIMATE.
      expect(outcome.measuredGrounding).toBe('MODEL_ESTIMATE');
      expect(outcome.groundingWeight).toBe(1);
      // The weighting identity holds exactly, so it can be audited rather than trusted.
      expect(outcome.evidenceMagnitude).toBeCloseTo(outcome.rawEvidenceMagnitude * outcome.groundingWeight, 12);
    }
  });

  it('a solver-advanced world is unaffected: every magnitude equals its raw value', async () => {
    const { epidemicInfectiousDaysSystem, EPIDEMIC_INFECTIOUS_DAYS_HYPOTHESES, EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK } =
      await import('../core/agent/epidemicInfectiousDaysCalibration');
    const { runAutonomousWorldCalibration } = await import('../core/agent/worldParameterCalibration');

    const result = runAutonomousWorldCalibration({
      question: 'How many infectious days does this population really have?',
      system: epidemicInfectiousDaysSystem(6),
      hypotheses: EPIDEMIC_INFECTIOUS_DAYS_HYPOTHESES,
      openingProbeTick: EPIDEMIC_INFECTIOUS_DAYS_OPENING_TICK,
      maxRounds: 2,
    });

    for (const outcome of result.rounds.flatMap((r) => r.outcomes)) {
      expect(outcome.evidenceMagnitude).toBe(outcome.rawEvidenceMagnitude);
    }
  });
});
