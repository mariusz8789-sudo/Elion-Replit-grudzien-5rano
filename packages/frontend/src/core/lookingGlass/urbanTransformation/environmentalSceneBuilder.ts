import { fnv1a, canonicalJson } from '../../events/hash';
import { buildEpidemicWorld, makeEpidemicSEIRSolver } from '../../worldModel/domains/epidemicSEIR';
import { epidemicParamsFrom } from '../../scientificWorlds/experimentRunners';
import type { EpidemicPoint } from '../../epidemic/sir';

/**
 * ENVIRONMENTAL SCENE BUILDER — the ENVIRONMENTAL domain of the generic
 * scene pipeline. Reuses the EXACT same real World Model seam SW-4's
 * `cityRunners.ts` already proved (`buildEpidemicWorld` + a `WorldGraph`
 * population entity advanced tick-by-tick through the real
 * `makeEpidemicSEIRSolver` DomainSolver, wrapping `core/epidemic/sir.ts`'s
 * RK4 integrator) — not a second epidemiology/environmental engine. Today's
 * coverage is exactly the epidemic-spread environmental system; other
 * requests (flood, ecosystem, solar system) resolve to CAPABILITY_GAP at the
 * orchestrator level rather than being silently mapped onto epidemic spread.
 */
export interface EnvironmentalSceneResult {
  readonly status: 'COMPLETED';
  readonly systemLabel: string;
  readonly series: readonly EpidemicPoint[];
  readonly fingerprint: string;
}

export function buildEnvironmentalScene(_prompt: string, days = 30): EnvironmentalSceneResult {
  const params = epidemicParamsFrom({});
  const { graph, populationId } = buildEpidemicWorld({ populationId: `scene-environmental-${days}`, params });
  const solver = makeEpidemicSEIRSolver(params);
  const initial = graph.tryGetEntity(populationId)!.domainState!;
  const series: EpidemicPoint[] = [{ t: 0, S: initial.S, E: initial.E, I: initial.I, R: initial.R, D: initial.D }];
  for (let tick = 1; tick <= days; tick++) {
    const entity = graph.tryGetEntity(populationId)!;
    const result = solver(entity, { dt: 1, tick, graph });
    graph.updateEntity(populationId, result.patch, tick);
    const state = graph.tryGetEntity(populationId)!.domainState!;
    series.push({ t: state.t, S: state.S, E: state.E, I: state.I, R: state.R, D: state.D });
  }
  return {
    status: 'COMPLETED',
    systemLabel: 'epidemic-spread environmental system (real SEIR RK4)',
    series,
    fingerprint: fnv1a(canonicalJson({ domain: 'ENVIRONMENTAL', days, series })),
  };
}
