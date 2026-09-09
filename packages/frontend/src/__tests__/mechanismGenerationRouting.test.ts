import { describe, expect, it } from 'vitest';

import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { toMechanismRun } from '../core/agent/discoveryStrategies';
import { runDiscoveryWithJointGeneration } from '../core/agent/mechanismGeneration';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal } from '../core/agent/worldGoalIntent';
import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';

/**
 * P0 — MECHANISM GENERATION THROUGH THE FRONT DOOR.
 *
 * `mechanismGeneration.test.ts` proves the joint arm works when called
 * directly. This proves the asymmetry is closed: one routed `runDiscovery` call
 * carries
 *
 *   MECHANISM tested → rival survivors → compose a lever nobody declared
 *     → fresh forked experiment → assessment → a SECOND StrategyRun
 *
 * reported beside the first exactly as the PARAMETER path already does, and not
 * merged into it.
 */

const GOAL = 'Maximise remaining fuel, at most 12 experiments.';

describe('runDiscovery — MECHANISM composes a lever and reports it as a second run', () => {
  it('THE DEFINING BEHAVIOUR: rival survivors, a composed mechanism, a real joint arm', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });
    if (outcome.status !== 'RAN') throw new Error(`expected RAN: ${outcome.admission.why}`);

    // The state that makes composing the informative question.
    expect(outcome.run.surviving).toEqual(['h:fuel-efficiency', 'h:load-shedding']);
    expect(outcome.run.untested).toEqual([]);

    expect(outcome.noGenerationReason).toBeNull();
    const generated = outcome.generated!;
    if (generated.kind !== 'COMPOSED_MECHANISM') throw new Error('expected a composed mechanism');

    // A mechanism nobody declared, named after the two that compose it.
    expect(generated.derived.hypothesisId).toBe('h:fuel-efficiency+h:load-shedding');
    expect(GENESIS_GENERATOR_CATALOG.levers.map((l) => l.leverId)).not.toContain(
      generated.derived.hypothesisId,
    );
  });

  it('the continuation is a real StrategyRun, with the additive claim as its PREDICTION', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    const generated = outcome.generated!;
    if (generated.kind !== 'COMPOSED_MECHANISM') throw new Error('expected a composed mechanism');

    const round = generated.run.rounds[0]!;
    expect(generated.run.shape).toBe('MECHANISM');
    expect(generated.run.rounds).toHaveLength(1);

    // Every number below came off the real fork, and the verdict is decided
    // against the composed hypothesis's OWN prediction — the two effects summed.
    expect(round.reference).toBeCloseTo(40.0, 6);
    expect(round.verdicts[0]!.predicted).toBeCloseTo(144.5, 3);
    expect(round.observed).toBeCloseTo(126.1667, 3);

    // Sub-additive, so the "they compose independently" claim is REFUTED — in
    // the shared vocabulary, with no new status word.
    expect(round.verdicts[0]!.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(generated.run.falsified).toEqual(['h:fuel-efficiency+h:load-shedding']);
    expect(generated.run.surviving).toEqual([]);
    expect(generated.assessment.interaction).toBe('SUB_ADDITIVE');

    // A refuted additivity claim leaves a real open question, named.
    expect(generated.run.openQuestions.join(' ')).toContain('do not compose independently');
  });

  it('reports "worth doing" separately from "additive" — they are different findings', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');
    const generated = outcome.generated!;
    if (generated.kind !== 'COMPOSED_MECHANISM') throw new Error('expected a composed mechanism');

    // Sub-additive AND still better than either lever alone. Collapsing these
    // into one verdict would lose the fact a planner actually needs.
    expect(generated.assessment.interaction).toBe('SUB_ADDITIVE');
    expect(generated.betterThanBestSingle).toBe(true);
  });

  it('the first run is BYTE-FOR-BYTE what a direct strategy call produces', () => {
    const outcome = runDiscovery({ shape: 'MECHANISM', goal: GOAL, catalog: GENESIS_GENERATOR_CATALOG });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    const plan = buildWorldDiscoveryPlan(parseWorldDiscoveryGoal(GOAL, GENESIS_GENERATOR_CATALOG), GENESIS_GENERATOR_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const direct = toMechanismRun(runDiscoveryWithJointGeneration(plan).first);

    expect(outcome.run.resultFingerprint).toBe(direct.resultFingerprint);
    expect(outcome.run.rounds).toEqual(direct.rounds);
    expect(outcome.run.surviving).toEqual(direct.surviving);
    expect(outcome.run.stopReason).toBe(direct.stopReason);
  });
});
