import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * LEVEL 3, SECTION 3: "do not invent coupling where no validated coupling
 * exists." Forking the composite world and changing ONLY the chemistry
 * substance's temperature must leave the epidemic and hydraulic entities
 * byte-identical between branches — proof that these are genuinely
 * independent subsystems inside one shared world, not secretly wired
 * together.
 */
describe('Cross-domain isolation: an intervention in one domain never leaks into another', () => {
  it('a chemistry-only intervention diverges the substance but leaves epidemiology and hydraulics identical across branches', () => {
    const world = buildGenesisCityWorld();
    const registry = new TemporalBranchRegistry();
    const base = new TemporalEngine(world.graph, { label: 'base', registry });
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);

    for (let i = 0; i < 3; i++) base.advance(3600, updater);

    const hotter = base.forkBranch(3, 'hotter-substance', (g) => {
      const current = g.getEntity(world.substanceId);
      g.updateEntity(world.substanceId, { physics: { ...current.physics!, temperatureK: (current.physics!.temperatureK ?? 0) + 200 } });
    });

    for (let i = 0; i < 3; i++) base.advance(3600, updater);
    for (let i = 0; i < 3; i++) hotter.advance(3600, updater);

    const baseSubstance = base.graph.getEntity(world.substanceId);
    const hotterSubstance = hotter.graph.getEntity(world.substanceId);
    expect(canonicalJson(baseSubstance)).not.toBe(canonicalJson(hotterSubstance));
    expect(hotterSubstance.chemical!.concentrationFraction!).toBeLessThan(baseSubstance.chemical!.concentrationFraction!);

    // Untouched domains: identical evolution on both branches, because nothing couples them to chemistry.
    const basePopulation = base.graph.getEntity(world.populationId);
    const hotterPopulation = hotter.graph.getEntity(world.populationId);
    expect(canonicalJson(basePopulation)).toBe(canonicalJson(hotterPopulation));

    const basePumpPipe = base.graph.getEntity(world.pumpPipeId);
    const hotterPumpPipe = hotter.graph.getEntity(world.pumpPipeId);
    expect(canonicalJson(basePumpPipe)).toBe(canonicalJson(hotterPumpPipe));
  });

  it('a hydraulics-only intervention leaves chemistry and epidemiology identical across branches', () => {
    const world = buildGenesisCityWorld();
    const registry = new TemporalBranchRegistry();
    const base = new TemporalEngine(world.graph, { label: 'base', registry });
    const router = makeGenesisCityRouter(world.epidemicParams);
    const updater = makeGenesisCityUpdater(router);

    base.advance(3600, updater);
    const higherFlow = base.forkBranch(1, 'higher-flow', (g) => {
      const current = g.getEntity(world.pumpPipeId);
      g.updateEntity(world.pumpPipeId, { domainState: { ...current.domainState, volumetricFlow: current.domainState!.volumetricFlow * 3 } });
    });

    base.advance(3600, updater);
    higherFlow.advance(3600, updater);

    expect(canonicalJson(base.graph.getEntity(world.pumpPipeId))).not.toBe(canonicalJson(higherFlow.graph.getEntity(world.pumpPipeId)));
    expect(canonicalJson(base.graph.getEntity(world.substanceId))).toBe(canonicalJson(higherFlow.graph.getEntity(world.substanceId)));
    expect(canonicalJson(base.graph.getEntity(world.populationId))).toBe(canonicalJson(higherFlow.graph.getEntity(world.populationId)));
  });
});
