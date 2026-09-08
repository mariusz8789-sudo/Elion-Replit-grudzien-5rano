import { describe, expect, it } from 'vitest';
import { runWorldDiscovery } from '../core/agent/worldDiscoverySession';
import { GENESIS_FLOOD_CATALOG, parseWorldDiscoveryGoal, resolveWorldLeverCatalog } from '../core/agent/worldGoalIntent';
import {
  GENESIS_CHEMISTRY_CATALOG,
  GENESIS_CHEMISTRY_CATALOG_ID,
  GENESIS_CHEMISTRY_OBJECTIVE_METRIC,
} from '../core/agent/chemistryLeverCatalog';

/**
 * THE DISCOVERY ENGINE, PROVEN ON A SECOND DOMAIN.
 *
 * Every real discovery run in this repo's history had been against the flood
 * city. The engine is written domain-agnostically — no file in
 * `discoveryLoop.ts`/`worldCounterfactual.ts` mentions a floodplain — but
 * "written generic" and "has run on a second domain" are different claims, and
 * only the second one is evidence. These tests are that evidence.
 *
 * The domain is deliberately as unlike the flood city as this repo allows:
 * molecular chemistry rather than civil hydrology, an Arrhenius rate law rather
 * than a volume-conserving planar fill, a metric that decays monotonically
 * toward zero rather than one that peaks.
 *
 * Every number asserted below was measured from the real solver first and only
 * then written down — never the other way round.
 */
describe('discovery engine on chemistry (second domain)', () => {
  it('runs a real chemistry search through the SAME seam the flood city uses', () => {
    const state = runWorldDiscovery('Minimise the remaining fraction, at most 4 experiments.', GENESIS_CHEMISTRY_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    // A real world was built, forked and advanced — not a stub.
    expect(state.result.domainId).toBe('chemistry-kinetics');
    expect(state.result.rounds.length).toBeGreaterThan(0);
    for (const round of state.result.rounds) {
      expect(round.branchId).toBeTruthy();
      // A real objective reading came off the solver at the horizon, in both arms.
      expect(Number.isFinite(round.objectiveBaseline!)).toBe(true);
      expect(Number.isFinite(round.objectiveObserved!)).toBe(true);
    }
  });

  it('finds heating supported — the real Arrhenius effect, measured not assumed', () => {
    const state = runWorldDiscovery('Minimise the remaining fraction by heating, at most 4 experiments.', GENESIS_CHEMISTRY_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:temperature');
    const first = state.result.rounds[0]!;
    // Measured: baseline 0.1503 remaining at horizon 12, heated to 800 K 2.63e-3.
    // Heating must move the metric DOWN, and by a lot.
    expect(first.objectiveObserved!).toBeLessThan(first.objectiveBaseline!);
    expect(first.objectiveBaseline!).toBeCloseTo(0.1503, 3);
  });

  it('finds the catalyst supported — lowering the activation barrier really moves the metric', () => {
    const state = runWorldDiscovery('Minimise the remaining fraction by adding a catalyst, at most 4 experiments.', GENESIS_CHEMISTRY_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:catalyst');
    const first = state.result.rounds[0]!;
    // Measured: Ea 120 -> 100 kJ/mol takes the remaining fraction to ~1.9e-19 at
    // horizon 12, against a 0.1503 baseline. A far larger effect than heating,
    // which is what putting the change inside the same exponential does.
    expect(first.objectiveObserved!).toBeLessThan(first.objectiveBaseline!);
    expect(first.objectiveObserved!).toBeLessThan(1e-15);
  });

  it('REFUTES the mass hypothesis — first-order decay really is independent of how much substance there is', () => {
    const state = runWorldDiscovery('Minimise the remaining fraction by increasing the mass, at most 4 experiments.', GENESIS_CHEMISTRY_CATALOG);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') return;

    // The engine recovered a real property of the rate law from the solver's own
    // behaviour: C(t)/C(0) = exp(-kt) does not depend on the amount present.
    // This is a genuine negative result, not a strawman — mass is a real declared
    // property of the substance that a thorough search has to actually test.
    expect(state.result.bestSupported).toHaveLength(0);
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:substance-mass');

    const first = state.result.rounds[0]!;
    // Measured: byte-identical to baseline at the horizon. Not "close" — equal.
    expect(first.objectiveObserved!).toBe(first.objectiveBaseline!);
  });

  it('parses a chemistry goal without any flood vocabulary leaking in', () => {
    const intent = parseWorldDiscoveryGoal('Minimise the remaining fraction by heating.', GENESIS_CHEMISTRY_CATALOG);
    expect(intent.objectiveMetric).toBe(GENESIS_CHEMISTRY_OBJECTIVE_METRIC);
    expect(intent.direction).toBe('minimize');
    expect(intent.requestedLeverIds).toEqual(['lever:temperature']);
    expect(intent.unresolved).toHaveLength(0);

    // The flood catalog cannot read this sentence — proof the two vocabularies
    // are genuinely per-world and not a shared global dictionary.
    const wrongWorld = parseWorldDiscoveryGoal('Minimise the remaining fraction by heating.', GENESIS_FLOOD_CATALOG);
    expect(wrongWorld.objectiveMetric).toBeNull();
    expect(wrongWorld.unresolved).toContain('OBJECTIVE_METRIC');
  });

  it('is registered for replay, so a saved chemistry run can be rebuilt from its id alone', () => {
    // Replay stores a catalogId rather than the catalog (which holds functions),
    // so a domain that is not in the registry is silently unreplayable.
    expect(resolveWorldLeverCatalog(GENESIS_CHEMISTRY_CATALOG_ID)).toBe(GENESIS_CHEMISTRY_CATALOG);
  });

  it('runs BOTH domains through one unchanged entry point — the genericity claim, as evidence', () => {
    const chemistry = runWorldDiscovery('Minimise the remaining fraction by heating, at most 2 experiments.', GENESIS_CHEMISTRY_CATALOG);
    const flood = runWorldDiscovery('Minimise peak flood depth by infiltration, at most 2 experiments.', GENESIS_FLOOD_CATALOG);

    expect(chemistry.kind).toBe('COMPLETE');
    expect(flood.kind).toBe('COMPLETE');
    if (chemistry.kind !== 'COMPLETE' || flood.kind !== 'COMPLETE') return;

    // Same function, same result shape, genuinely different sciences underneath.
    expect(chemistry.result.domainId).toBe('chemistry-kinetics');
    expect(flood.result.domainId).toBe('flood-hydrology');
    expect(chemistry.result.domainId).not.toBe(flood.result.domainId);
    expect(chemistry.result.rounds.length).toBeGreaterThan(0);
    expect(flood.result.rounds.length).toBeGreaterThan(0);
  });
});
