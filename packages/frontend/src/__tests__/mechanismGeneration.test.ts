import { describe, expect, it } from 'vitest';

import { runDiscoveryWithJointGeneration } from '../core/agent/mechanismGeneration';
import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal, GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';
import type { WorldLeverCatalog } from '../core/agent/worldGoalIntent';
import type { DiscoveryLoopInput } from '../core/agent/discoveryLoop';

/**
 * P0 — MECHANISM GENERATION: a lever nobody declared, tested on the real solver.
 *
 * The MECHANISM loop could already revise a CRITERION after a falsification
 * (`~RELATION_FLIP`), but never reach for a different intervention: every
 * `apply` it can run is one the catalog declared. This is the first mechanism
 * Genesis composes for itself — two declared levers pulled together — and the
 * point of running it rather than computing it is that combinations are
 * measurably NOT additive.
 *
 * Real WorldGraph forks throughout, on `genesis-backup-generator`.
 */

function planFor(catalog: WorldLeverCatalog, goal: string): DiscoveryLoopInput {
  const plan = buildWorldDiscoveryPlan(parseWorldDiscoveryGoal(goal, catalog), catalog);
  if ('error' in plan) throw new Error(`expected a plan, got: ${plan.error}`);
  return plan;
}

const GENERATOR_GOAL = 'Maximise remaining fuel, at most 12 experiments.';

describe('runDiscoveryWithJointGeneration — Genesis composes a mechanism and runs it', () => {
  it('THE DEFINING BEHAVIOUR: two levers survive, Genesis proposes BOTH and measures the combination', () => {
    const outcome = runDiscoveryWithJointGeneration(planFor(GENESIS_GENERATOR_CATALOG, GENERATOR_GOAL));

    // The state that makes combining the informative next question: the run
    // tested every declared lever and two of them independently held up.
    expect(outcome.first.bestSupported.map((b) => b.hypothesisId)).toEqual([
      'h:fuel-efficiency',
      'h:load-shedding',
    ]);
    expect(outcome.first.beliefs.filter((b) => b.status === 'UNTESTED')).toEqual([]);

    expect(outcome.noGenerationReason).toBeNull();
    const generated = outcome.generated!;

    // A mechanism nobody declared, named after the two that compose it.
    expect(generated.derived.hypothesisId).toBe('h:fuel-efficiency+h:load-shedding');
    expect(generated.derived.parentHypothesisIds).toEqual(['h:fuel-efficiency', 'h:load-shedding']);
    expect(GENESIS_GENERATOR_CATALOG.levers.map((l) => l.leverId)).not.toContain(
      generated.derived.hypothesisId,
    );
  });

  it('THE FINDING: the combination is real, and 17.5% below what assuming additivity would promise', () => {
    const outcome = runDiscoveryWithJointGeneration(planFor(GENESIS_GENERATOR_CATALOG, GENERATOR_GOAL));
    const { assessment } = outcome.generated!;

    // Every number below came off a real fork of the real world.
    expect(assessment.baseline).toBeCloseTo(40.0, 6);
    expect(assessment.effectA).toBeCloseTo(45.8333, 3); // fuel-efficiency alone
    expect(assessment.effectB).toBeCloseTo(58.6667, 3); // load-shedding alone

    // What a planner assuming independent mechanisms would predict...
    expect(assessment.naiveAdditivePrediction).toBeCloseTo(144.5, 3);
    // ...and what actually happens when you do both.
    expect(assessment.jointObserved).toBeCloseTo(126.1667, 3);

    expect(assessment.interaction).toBe('SUB_ADDITIVE');
    expect(assessment.relativeDeviation).toBeCloseTo(-0.1754, 3);
    // 18.3 L of fuel a naive additive planner would have over-promised.
    expect(assessment.deviation).toBeCloseTo(-18.3333, 3);
  });

  it('doing both still beats the better single lever — a separate question from additivity, answered from measurement', () => {
    const outcome = runDiscoveryWithJointGeneration(planFor(GENESIS_GENERATOR_CATALOG, GENERATOR_GOAL));
    const generated = outcome.generated!;

    // Sub-additive does NOT mean "not worth doing": the joint arm reads 126.17
    // against the best single arm's 98.67. Genesis reports both facts rather
    // than collapsing them into one verdict.
    expect(generated.betterThanBestSingle).toBe(true);
    const bestSingleObserved = Math.max(
      ...outcome.first.rounds
        .filter((r) => r.strength === generated.derived.strength && r.objectiveObserved !== null)
        .map((r) => r.objectiveObserved!),
    );
    expect(generated.assessment.jointObserved).toBeGreaterThan(bestSingleObserved);
  });

  it('refuses when a single explanation survived — there is nothing to combine', () => {
    const outcome = runDiscoveryWithJointGeneration(
      planFor(GENESIS_FLOOD_CATALOG, 'Minimise peak flood depth, at most 8 experiments.'),
    );
    expect(outcome.first.bestSupported.map((b) => b.hypothesisId)).toEqual(['h:infiltration']);
    expect(outcome.generated).toBeNull();
    expect(outcome.noGenerationReason).toContain('SINGLE_EXPLANATION');
  });

  it('the additivity band is declared, not discovered: a wide enough band reports ADDITIVE', () => {
    // Same measurement, a band wide enough to cover a 17.5% deviation. This is
    // the same discipline `agreementTolerance` carries everywhere else — the
    // verdict is relative to a declared band, and saying so beats implying a
    // statistical test this repository has no methodology for.
    const wide = runDiscoveryWithJointGeneration(planFor(GENESIS_GENERATOR_CATALOG, GENERATOR_GOAL), {
      tolerance: 0.25,
    });
    expect(wide.generated!.assessment.interaction).toBe('ADDITIVE');
    // The underlying numbers did not move — only the band did.
    expect(wide.generated!.assessment.jointObserved).toBeCloseTo(126.1667, 3);
  });
});
