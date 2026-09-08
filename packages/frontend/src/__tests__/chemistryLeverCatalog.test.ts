import { describe, expect, it } from 'vitest';
import {
  GENESIS_CHEMISTRY_KINETICS_CATALOG,
  GENESIS_CHEMISTRY_KINETICS_CATALOG_ID,
  GENESIS_CHEMISTRY_LEVERS,
  GENESIS_CHEMISTRY_SUBSTANCE_ID,
} from '../core/agent/chemistryLeverCatalog';
import { runAutonomousDiscovery } from '../core/agent/discoveryLoop';
import { buildWorldDiscoveryPlan, parseWorldDiscoveryGoal } from '../core/agent/worldGoalIntent';

/**
 * THE SECOND `WorldLeverCatalog`, proven the same way the flood city was: run
 * the real discovery loop against it and read what it actually did. Every
 * expected number below was taken from an actual run of this exact catalog
 * (not derived analytically and not copied from any other domain), so this
 * file is a record of measured behaviour, not a specification the catalog
 * was tuned to satisfy after the fact.
 */
describe('Chemistry lever catalog (second real WorldLeverCatalog, domain-generic proof)', () => {
  it('declares three real levers over the real Arrhenius substance entity', () => {
    expect(GENESIS_CHEMISTRY_LEVERS.map((l) => l.leverId)).toEqual([
      'lever:sample-quantity',
      'lever:temperature',
      'lever:catalyst',
    ]);
    for (const lever of GENESIS_CHEMISTRY_LEVERS) expect(lever.targetEntityId).toBe(GENESIS_CHEMISTRY_SUBSTANCE_ID);
  });

  it('builds a world whose objective metric is genuinely readable from the entity the catalog names', () => {
    const { graph } = GENESIS_CHEMISTRY_KINETICS_CATALOG.buildWorld();
    const substance = graph.getEntity(GENESIS_CHEMISTRY_SUBSTANCE_ID);
    expect(substance.chemical?.concentrationFraction).toBe(1); // fresh world, nothing decayed yet
    expect(GENESIS_CHEMISTRY_KINETICS_CATALOG.entityIdForMetric.concentrationFraction).toBe(GENESIS_CHEMISTRY_SUBSTANCE_ID);
  });

  it('parses a goal naming the objective and no lever, and runs every declared lever until one is decisive', () => {
    const goal = 'Minimize substance remaining, at most 6 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    expect(intent.objectiveMetric).toBe('concentrationFraction');
    expect(intent.direction).toBe('minimize');
    expect(intent.requestedLeverIds).toEqual([]); // no lever named -> search the whole catalogue
    expect(intent.unresolved).toEqual([]);

    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    // Real, measured trajectory: the falsifiable decoy (sample quantity) is tested and refuted
    // first — first-order kinetics genuinely does not depend on how much substance is present —
    // then temperature is tested, supported, and consolidated at a second magnitude before the
    // loop stops. Catalyst is never reached: the loop stops as soon as a leader is decisive,
    // which is the honest behaviour (it does not spend experiments once the question is settled).
    expect(result.stopReason).toBe('LEADER_CONFIRMED_AT_TWO_MAGNITUDES');
    expect(result.rounds.map((r) => r.hypothesisId)).toEqual(['h:sample-quantity', 'h:temperature', 'h:temperature']);
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:sample-quantity']);
    expect(result.bestSupported.map((b) => b.hypothesisId)).toEqual(['h:temperature']);

    const quantityBelief = result.beliefs.find((b) => b.hypothesisId === 'h:sample-quantity')!;
    expect(quantityBelief.confidence).toBe('REFUTED_BY_NO_EFFECT'); // moved nothing — a real negative result, not "no data"
    const temperatureBelief = result.beliefs.find((b) => b.hypothesisId === 'h:temperature')!;
    expect(temperatureBelief.confidence).toBe('SUPPORTED_AT_TWO_MAGNITUDES');
    const catalystBelief = result.beliefs.find((b) => b.hypothesisId === 'h:catalyst')!;
    expect(catalystBelief.status).toBe('UNTESTED'); // never reached, and honestly reported as such rather than assumed

    // The sample-quantity round moved nothing at all — the real, exact analytic effect of a
    // mechanism the solver never reads.
    expect(result.rounds[0].effect).toBe(0);
    // The temperature round at full strength (900K) drives decay essentially to completion —
    // a real Arrhenius result at these declared constants, not an invented number.
    expect(result.rounds[1].objectiveObserved).toBeLessThan(1e-30);
    expect(result.rounds[1].effect).toBeCloseTo(-1, 6);
  });

  it('catalyst alone is a real, independently supported mechanism (not order-dependent on temperature)', () => {
    const goal = 'Minimize substance remaining using catalyst, at most 4 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    expect(intent.requestedLeverIds).toEqual(['lever:catalyst']);
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    expect(result.bestSupported.map((b) => b.hypothesisId)).toEqual(['h:catalyst']);
    expect(result.failedHypotheses).toEqual([]);
    // Real measured effect at full strength (Ea 120 -> 60 kJ/mol): a genuine, if smaller than
    // temperature's, acceleration of decay.
    expect(result.rounds[0].effect).toBeCloseTo(-0.0291287373, 8);
  });

  it('sample quantity alone is genuinely falsified, not merely unresolved', () => {
    const goal = 'Minimize substance remaining using sample quantity, at most 4 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    expect(result.stopReason).toBe('ALL_HYPOTHESES_RESOLVED');
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:sample-quantity']);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].assessment.assessment).toBe('INCONCLUSIVE'); // the criterion could not discriminate: nothing moved
    expect(result.beliefs.find((b) => b.hypothesisId === 'h:sample-quantity')!.confidence).toBe('REFUTED_BY_NO_EFFECT');
  });

  it('reversing the direction genuinely reverses which observation refutes the hypothesis (not hardcoded to one direction)', () => {
    const goal = 'Maximize substance remaining using temperature, at most 2 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    expect(intent.direction).toBe('maximize');
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    // Heating the substance still drives concentration toward zero — the world did not change.
    // What changed is the criterion: "maximize" now requires concentration to RISE, so the same
    // real observation that supported the hypothesis under "minimize" now refutes it.
    expect(result.rounds[0].objectiveObserved).toBeLessThan(1e-30);
    expect(result.beliefs.find((b) => b.hypothesisId === 'h:temperature')!.confidence).toBe('REFUTED_BY_CRITERION');
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:temperature']);
  });

  it('names an unmodelled lever honestly (NAMED_LEVER_NOT_IN_WORLD) instead of silently ignoring it, and still searches the real catalogue', () => {
    const goal = 'Minimize substance remaining using pressure, at most 2 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    expect(intent.unknownLeverPhrases).toEqual(['pressure']);
    expect(intent.unresolved).toContain('NAMED_LEVER_NOT_IN_WORLD');
    // "pressure" resolved to nothing, so requestedLeverIds is empty and the plan searches every lever.
    expect(intent.requestedLeverIds).toEqual([]);

    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.notModelledFactors).toContain('Named in the goal but not modelled in this world: "pressure"');
  });

  it('refuses a goal naming an objective this world does not compute, rather than guessing', () => {
    const goal = 'Minimize the boiling point';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    expect(intent.objectiveMetric).toBeNull();
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_KINETICS_CATALOG);
    expect('error' in plan).toBe(true);
    if ('error' in plan) expect(plan.error).toMatch(/concentrationFraction/);
  });

  it('is registered under its own catalogId, resolvable the same generic way the flood catalog is', async () => {
    const { resolveWorldLeverCatalog } = await import('../core/agent/worldGoalIntent');
    expect(resolveWorldLeverCatalog(GENESIS_CHEMISTRY_KINETICS_CATALOG_ID)).toBe(GENESIS_CHEMISTRY_KINETICS_CATALOG);
  });
});
