import { describe, expect, it } from 'vitest';

import { runAutonomousInquiry, type InquiryLoopInput, type ParameterHypothesis } from '../core/agent/inquiryLoop';

/**
 * THE LOOP IS DOMAIN-AGNOSTIC — the same `runAutonomousInquiry`, unchanged, on
 * two more of the commercially important domains Genesis already models. If any
 * chemistry-specific shortcut had crept into the loop, these would not run at
 * all; that is what this file is for, as much as the science it shows.
 *
 * BIOLOGY — logistic population growth, `biology-logistic`. A real and
 * well-known confounding: growth rate r and carrying capacity K trade off, so
 * different (r, K) pairs pass through the SAME population at one time and
 * separate later as each curve bends toward its own ceiling. It is exactly why
 * a growth experiment reports a CURVE rather than one time point, and it makes
 * "when should I measure next" a real question.
 *
 * PHYSICS — relativistic energy, `particle-relativistic-energy`. Deliberately
 * NOT degenerate: one unknown (the rest mass), so one measurement settles it.
 * The loop must therefore stop after a single round instead of manufacturing a
 * second experiment to look busy. A loop that always runs to its budget would
 * not be choosing experiments, and this is the case that catches that.
 *
 * NOT CLAIMED, in either case: nothing here is a finding about a real organism
 * or a real particle. Each is a claim about which parameter assignment survives
 * contact with the named model, which is what the loop's own `limitations` say.
 */

// --- BIOLOGY ---------------------------------------------------------------
// All four pairs pass through N = 200 at t = 10 (initial population 10), then
// diverge: the K = 300 curve is already flattening while the K = 2000 curve is
// still climbing.
const GROWTH_CURVES = [
  { id: 'h:K300', r: 0.40604, K: 300 },
  { id: 'h:K500', r: 0.34870, K: 500 },
  { id: 'h:K1000', r: 0.32088, K: 1000 },
  { id: 'h:K2000', r: 0.30961, K: 2000 },
] as const;

const GROWTH_HYPOTHESES: readonly ParameterHypothesis[] = GROWTH_CURVES.map((c) => ({
  hypothesisId: c.id,
  statement: `This culture grows at r = ${c.r} toward a carrying capacity of ${c.K}`,
  claimedValues: { growthRate: c.r, carryingCapacity: c.K },
  priorConfidence: 0.5,
}));

function growthInquiry(curve: (typeof GROWTH_CURVES)[number]): InquiryLoopInput {
  return {
    question: 'What growth rate and carrying capacity does this culture actually have?',
    system: {
      systemId: `culture-${curve.id}`,
      label: 'Unmeasured culture, initial population 10',
      modelId: 'biology-logistic',
      hiddenParameters: { growthRate: curve.r, carryingCapacity: curve.K },
      probeParameterId: 'timeElapsed',
      candidateProbeValues: [10, 11, 12, 13, 14, 15, 20, 30, 50],
      fixedParameters: { initialPopulation: 10 },
      observedMetric: 'populationAtT',
      agreementTolerance: 0.15,
    },
    hypotheses: GROWTH_HYPOTHESES,
    openingProbeValue: 12,
    maxRounds: 4,
  };
}

describe('inquiryLoop on biology — growth-rate / carrying-capacity confounding', () => {
  const small = runAutonomousInquiry(growthInquiry(GROWTH_CURVES[0]));   // K = 300
  const large = runAutonomousInquiry(growthInquiry(GROWTH_CURVES[3]));   // K = 2000

  it('runs on the biology model with no change to the loop', () => {
    expect(small.domainId).toBe('biology');
    expect(small.modelId).toBe('biology-logistic');
    expect(small.rounds[0].engine).toBe('genesis-model-graph@1.0.0');
  });

  it('cannot settle it in one measurement — the confounding is real', () => {
    const standing = small.rounds[0].beliefsAfter.filter((b) => b.status !== 'FALSIFIED_WITHIN_PROTOCOL');
    expect(standing.length).toBeGreaterThan(1);
  });

  it('PROOF OF AUTONOMY in biology: a different culture, a different next measurement time', () => {
    expect(small.rounds[0].probeValue).toBe(12);
    expect(large.rounds[0].probeValue).toBe(12);
    expect(large.rounds[0].beliefsBefore).toEqual(small.rounds[0].beliefsBefore);
    expect(small.rounds[0].observed).not.toBe(large.rounds[0].observed);

    // Different observation -> different survivors -> different next experiment.
    expect(small.rounds[0].nextSelection.probeValue).toBe(13);
    expect(large.rounds[0].nextSelection.probeValue).toBe(15);
    expect(small.rounds[1].probeValue).toBe(13);
    expect(large.rounds[1].probeValue).toBe(15);
  });

  it('converges on the curve the culture actually has', () => {
    expect(small.survivingHypothesisIds).toEqual(['h:K300']);
    expect(large.survivingHypothesisIds).toEqual(['h:K2000']);
  });

  it('does not turn a model result into a claim about a real organism', () => {
    expect(small.limitations.join(' ')).toContain('not the same as being true of any real substance, organism or apparatus');
  });
});

// --- PHYSICS ---------------------------------------------------------------

const MASSES = [
  { id: 'h:electron', mass: 0.511 },
  { id: 'h:muon', mass: 105.66 },
  { id: 'h:proton', mass: 938.27 },
] as const;

function massInquiry(hiddenMass: number): InquiryLoopInput {
  return {
    question: 'Which rest mass does this particle have?',
    system: {
      systemId: `beam-${hiddenMass}`,
      label: 'Unidentified particle in a beam',
      modelId: 'particle-relativistic-energy',
      hiddenParameters: { restMassMeV: hiddenMass },
      probeParameterId: 'velocityFraction',
      candidateProbeValues: [0.1, 0.5, 0.866, 0.99],
      fixedParameters: {},
      observedMetric: 'totalEnergyMeV',
      agreementTolerance: 0.25,
    },
    hypotheses: MASSES.map((m) => ({
      hypothesisId: m.id,
      statement: `The particle's rest mass is ${m.mass} MeV/c²`,
      claimedValues: { restMassMeV: m.mass },
      priorConfidence: 1 / 3,
    })),
    maxRounds: 4,
    openingProbeValue: 0.866,
  };
}

describe('inquiryLoop on physics — a question one experiment really can settle', () => {
  const result = runAutonomousInquiry(massInquiry(105.66));

  it('runs on the physics model with no change to the loop', () => {
    expect(result.domainId).toBe('particle');
    expect(result.modelId).toBe('particle-relativistic-energy');
  });

  it('stops after ONE round instead of manufacturing a second experiment', () => {
    expect(result.rounds).toHaveLength(1);
    expect(result.stopReason).toBe('NO_CONTENDERS_LEFT');
    expect(result.survivingHypothesisIds).toEqual(['h:muon']);
    expect(result.falsifiedHypothesisIds).toEqual(['h:electron', 'h:proton']);
  });

  it('says WHY there is nothing left to run, rather than proposing a probe anyway', () => {
    expect(result.nextExperiment.probeValue).toBeNull();
    expect(result.nextExperiment.rule).toBe('NO_CONTENDERS_LEFT');
    expect(result.nextExperiment.why).toContain('h:muon');
    expect(result.openQuestions).toEqual([]);
  });
});
