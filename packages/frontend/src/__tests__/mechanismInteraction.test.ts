import { describe, expect, it } from 'vitest';
import { assessJointIntervention, runJointIntervention } from '../core/agent/mechanismInteraction';
import { runAutonomousDiscovery } from '../core/agent/discoveryLoop';
import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal } from '../core/agent/worldGoalIntent';

/**
 * MECHANISM INTERACTION — checked against the real `genesis-backup-generator`
 * fixture C3 already used for the MECHANISM competing-models audit
 * (`competingModels.test.ts`): `h:fuel-efficiency~RELATION_FLIP` and
 * `h:load-shedding~RELATION_FLIP`, both genuinely `SUPPORTED` at strength 0.5,
 * neither ever consolidating. The open question that audit left standing:
 * does applying both together give the sum of their separate effects?
 *
 * Answer, measured on the real solver: NO. See `mechanismInteraction.ts`'s
 * own module doc for the mechanistic reason (`fuelRateLPerHr = loadKw ×
 * specificFuelConsumptionLPerKwh` is a PRODUCT of the two levers, so cutting
 * both at once compounds their fractional rate reductions rather than adding
 * their absolute fuel-remaining effects).
 */
describe('mechanism interaction — real generator fixture, additivity measured not assumed', () => {
  function generatorRun() {
    const goal = `Minimise ${Object.keys(GENESIS_GENERATOR_CATALOG.metricPhrases)[0]!}, at most 10 experiments.`;
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_GENERATOR_CATALOG);
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_GENERATOR_CATALOG);
    if ('error' in plan) throw new Error(`expected a runnable plan, got: ${plan.error}`);
    return runAutonomousDiscovery(plan);
  }

  it('grounds the fixture: two independent effects, individually measured by the real loop', () => {
    const result = generatorRun();
    const fuelRound = result.rounds.find((r) => r.hypothesisId === 'h:fuel-efficiency~RELATION_FLIP')!;
    const loadRound = result.rounds.find((r) => r.hypothesisId === 'h:load-shedding~RELATION_FLIP')!;
    expect(fuelRound.strength).toBe(0.5);
    expect(loadRound.strength).toBe(0.5);
    expect(fuelRound.objectiveBaseline).toBeCloseTo(40.0, 6);
    expect(fuelRound.effect).toBeCloseTo(22.91666666666655, 6);
    expect(loadRound.effect).toBeCloseTo(29.333333333333236, 6);
  });

  it('the real joint arm does NOT read the naive additive sum — a genuine sub-additive interaction', () => {
    const result = generatorRun();
    const fuelRound = result.rounds.find((r) => r.hypothesisId === 'h:fuel-efficiency~RELATION_FLIP')!;
    const loadRound = result.rounds.find((r) => r.hypothesisId === 'h:load-shedding~RELATION_FLIP')!;
    const fuelHyp = GENESIS_GENERATOR_CATALOG.levers.find((l) => l.leverId === 'lever:fuel-efficiency')!.hypothesis('fuelRemainingL', 'minimize');
    const loadHyp = GENESIS_GENERATOR_CATALOG.levers.find((l) => l.leverId === 'lever:load-shedding')!.hypothesis('fuelRemainingL', 'minimize');

    const { baseline, jointObserved } = runJointIntervention({
      buildWorld: GENESIS_GENERATOR_CATALOG.buildWorld,
      decisionAtTick: GENESIS_GENERATOR_CATALOG.decisionAtTick,
      horizonTick: GENESIS_GENERATOR_CATALOG.horizonTick,
      dt: GENESIS_GENERATOR_CATALOG.dt,
      entityId: fuelHyp.entityId,
      metric: 'fuelRemainingL',
      applyA: fuelHyp.apply,
      applyB: loadHyp.apply,
      strength: 0.5,
    });

    expect(baseline).toBeCloseTo(40.0, 6);
    // MEASURED: the real joint arm — not assumed, not derived from A and B alone.
    expect(jointObserved).toBeCloseTo(87.66666666666642, 6);

    const assessment = assessJointIntervention({
      baseline: baseline!,
      effectA: fuelRound.effect!,
      effectB: loadRound.effect!,
      jointObserved: jointObserved!,
      tolerance: 0.02,
    });

    expect(assessment.naiveAdditivePrediction).toBeCloseTo(92.24999999999994, 6);
    // The real joint result is ~5% below the naive additive prediction — well
    // outside a 2% band, so this is reported as a real interaction, not noise.
    expect(assessment.interaction).toBe('SUB_ADDITIVE');
    expect(assessment.deviation).toBeLessThan(0);
    expect(assessment.reason).toContain('LESS than the sum');
  });

  it('classifies within the declared tolerance as ADDITIVE, not a false interaction', () => {
    // Pure classifier check: same effect sizes, a joint reading close enough
    // to the naive sum must NOT be reported as an interaction — a 1%
    // deviation inside a declared 5% band is additive by that band's own
    // definition, not a smaller "real" effect this module invented a
    // threshold to detect.
    const assessment = assessJointIntervention({
      baseline: 40, effectA: 20, effectB: 20, jointObserved: 79.6, tolerance: 0.05,
    });
    expect(assessment.naiveAdditivePrediction).toBe(80);
    expect(assessment.interaction).toBe('ADDITIVE');
  });

  it('detects super-additive synergy in the direction the sign says, not just "not additive"', () => {
    const assessment = assessJointIntervention({
      baseline: 40, effectA: 20, effectB: 20, jointObserved: 90, tolerance: 0.05,
    });
    expect(assessment.interaction).toBe('SUPER_ADDITIVE');
    expect(assessment.deviation).toBeGreaterThan(0);
    expect(assessment.reason).toContain('MORE than the sum');
  });

  it('reports INCONCLUSIVE rather than a fabricated ratio when both individual effects are zero', () => {
    const assessment = assessJointIntervention({ baseline: 40, effectA: 0, effectB: 0, jointObserved: 40, tolerance: 0.05 });
    expect(assessment.interaction).toBe('INCONCLUSIVE');
    expect(assessment.relativeDeviation).toBeNull();
  });
});
