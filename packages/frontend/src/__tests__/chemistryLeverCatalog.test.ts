import { describe, expect, it } from 'vitest';
import {
  GENESIS_CHEMISTRY_CATALOG,
  GENESIS_CHEMISTRY_CATALOG_ID,
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
 *
 * PROVENANCE OF THIS FILE. It was ported from `claude/chemistry-discovery-verify-i30c1u`
 * (c46de7b9), which was written against a DIFFERENT, never-merged version of
 * `chemistryLeverCatalog.ts`. Main's catalogue is an independent implementation with
 * its own lever ids, its own baseline/full lever values and its own lever ORDER, so
 * every expectation here was re-measured against main rather than carried over. The
 * one place where that re-measurement changed a scientific claim — the branch's
 * `lever:sample-quantity` against main's `lever:substance-mass` — is recorded as
 * D-171 in docs/DECISIONS.md, not silently absorbed.
 */
describe('Chemistry lever catalog (second real WorldLeverCatalog, domain-generic proof)', () => {
  it('declares three real levers over the real Arrhenius substance entity', () => {
    expect(GENESIS_CHEMISTRY_LEVERS.map((l) => l.leverId)).toEqual([
      'lever:temperature',
      'lever:catalyst',
      'lever:substance-mass',
    ]);
    for (const lever of GENESIS_CHEMISTRY_LEVERS) expect(lever.targetEntityId).toBe(GENESIS_CHEMISTRY_SUBSTANCE_ID);
  });

  it('builds a world whose objective metric is genuinely readable from the entity the catalog names', () => {
    const { graph } = GENESIS_CHEMISTRY_CATALOG.buildWorld();
    const substance = graph.getEntity(GENESIS_CHEMISTRY_SUBSTANCE_ID);
    expect(substance.chemical?.concentrationFraction).toBe(1); // fresh world, nothing decayed yet
    expect(GENESIS_CHEMISTRY_CATALOG.entityIdForMetric.concentrationFraction).toBe(GENESIS_CHEMISTRY_SUBSTANCE_ID);
  });

  it('parses a goal naming the objective and no lever, and runs every declared lever', () => {
    const goal = 'Minimize remaining fraction, at most 6 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_CATALOG);
    expect(intent.objectiveMetric).toBe('concentrationFraction');
    expect(intent.direction).toBe('minimize');
    expect(intent.requestedLeverIds).toEqual([]); // no lever named -> search the whole catalogue
    expect(intent.unresolved).toEqual([]);

    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    // Real, measured trajectory on main's catalogue, in the catalogue's own lever order:
    // temperature is tested and consolidated at a second magnitude, then the catalyst is tested
    // and consolidated too, and only then is the declared no-effect mechanism (substance mass)
    // reached and refuted. Both real mechanisms end up supported — this world has two of them,
    // not one, so "a leader is decisive" does not mean "the rest go untested".
    expect(result.stopReason).toBe('LEADER_CONFIRMED_AT_TWO_MAGNITUDES');
    expect(result.rounds.map((r) => r.hypothesisId)).toEqual([
      'h:temperature',
      'h:temperature',
      'h:catalyst',
      'h:catalyst',
      'h:substance-mass',
    ]);
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:substance-mass']);
    expect(result.bestSupported.map((b) => b.hypothesisId)).toEqual(['h:temperature', 'h:catalyst']);

    // The substance-mass hypothesis moved the objective by exactly nothing, and the loop reports
    // that as a real negative result rather than as missing data. See D-171 for exactly what this
    // does and does not claim about sample quantity.
    const massBelief = result.beliefs.find((b) => b.hypothesisId === 'h:substance-mass')!;
    expect(massBelief.confidence).toBe('REFUTED_BY_NO_EFFECT');
    expect(result.rounds[4].effect).toBe(0);

    const temperatureBelief = result.beliefs.find((b) => b.hypothesisId === 'h:temperature')!;
    expect(temperatureBelief.confidence).toBe('SUPPORTED_AT_TWO_MAGNITUDES');
    const catalystBelief = result.beliefs.find((b) => b.hypothesisId === 'h:catalyst')!;
    expect(catalystBelief.status).toBe('SUPPORTED');
    expect(catalystBelief.confidence).toBe('SUPPORTED_AT_TWO_MAGNITUDES');

    // Real Arrhenius numbers at main's declared constants (750 K -> 800 K, Ea 120 kJ/mol),
    // measured from an actual run, not invented.
    expect(result.rounds[0].effect).toBeCloseTo(-0.1476710906, 9);
    expect(result.rounds[0].objectiveObserved).toBeCloseTo(0.0026273836, 9);
  });

  it('catalyst alone is a real, independently supported mechanism (not order-dependent on temperature)', () => {
    const goal = 'Minimize remaining fraction using catalyst, at most 4 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_CATALOG);
    expect(intent.requestedLeverIds).toEqual(['lever:catalyst']);
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    expect(result.bestSupported.map((b) => b.hypothesisId)).toEqual(['h:catalyst']);
    expect(result.failedHypotheses).toEqual([]);
    // Real measured effect at full strength (Ea 120 -> 100 kJ/mol on main): a genuine, and here
    // LARGER than temperature's, acceleration of decay.
    expect(result.rounds[0].effect).toBeCloseTo(-0.1502984742, 9);
  });

  it('substance mass alone is genuinely falsified, not merely unresolved', () => {
    const goal = 'Minimize remaining fraction using mass, at most 4 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_CATALOG);
    expect(intent.requestedLeverIds).toEqual(['lever:substance-mass']);
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    expect(result.stopReason).toBe('ALL_HYPOTHESES_RESOLVED');
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:substance-mass']);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].assessment.assessment).toBe('INCONCLUSIVE'); // the criterion could not discriminate: nothing moved
    expect(result.rounds[0].effect).toBe(0);
    expect(result.beliefs.find((b) => b.hypothesisId === 'h:substance-mass')!.confidence).toBe('REFUTED_BY_NO_EFFECT');
  });

  it('reversing the direction genuinely reverses which observation refutes the hypothesis (not hardcoded to one direction)', () => {
    const goal = 'Maximize remaining fraction using temperature, at most 2 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_CATALOG);
    expect(intent.direction).toBe('maximize');
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    const result = runAutonomousDiscovery(plan);

    // Heating the substance still drives concentration toward zero — the world did not change.
    // What changed is the criterion: "maximize" now requires concentration to RISE, so the same
    // real observation that supported the hypothesis under "minimize" now refutes it. The
    // observed value is bit-identical to the "minimize" run's first round, which is the point.
    expect(result.rounds[0].objectiveObserved).toBeCloseTo(0.0026273836, 9);
    expect(result.rounds[0].assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(result.beliefs.find((b) => b.hypothesisId === 'h:temperature')!.confidence).toBe('REFUTED_BY_CRITERION');
    expect(result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:temperature']);
  });

  it('names an unmodelled lever honestly (NAMED_LEVER_NOT_IN_WORLD) instead of silently ignoring it, and still searches the real catalogue', () => {
    const goal = 'Minimize remaining fraction using pressure, at most 2 experiments';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_CATALOG);
    expect(intent.unknownLeverPhrases).toEqual(['pressure']);
    expect(intent.unresolved).toContain('NAMED_LEVER_NOT_IN_WORLD');
    // "pressure" resolved to nothing, so requestedLeverIds is empty and the plan searches every lever.
    expect(intent.requestedLeverIds).toEqual([]);

    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
    if ('error' in plan) throw new Error(plan.error);
    expect(plan.notModelledFactors).toContain('Named in the goal but not modelled in this world: "pressure"');
  });

  it('refuses a goal naming an objective this world does not compute, rather than guessing', () => {
    const goal = 'Minimize the boiling point';
    const intent = parseWorldDiscoveryGoal(goal, GENESIS_CHEMISTRY_CATALOG);
    expect(intent.objectiveMetric).toBeNull();
    const plan = buildWorldDiscoveryPlan(intent, GENESIS_CHEMISTRY_CATALOG);
    expect('error' in plan).toBe(true);
    if ('error' in plan) expect(plan.error).toMatch(/concentrationFraction/);
  });

  it('is registered under its own catalogId, resolvable the same generic way the flood catalog is', async () => {
    const { resolveWorldLeverCatalog } = await import('../core/agent/worldGoalIntent');
    expect(resolveWorldLeverCatalog(GENESIS_CHEMISTRY_CATALOG_ID)).toBe(GENESIS_CHEMISTRY_CATALOG);
  });
});
