import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { canonicalJson } from '../events/hash';
import type { ExperimentRunResult, ExperimentRunner, SessionInputs } from './experimentSession';
import { epidemicParamsFrom, type EpidemicArtifact, type LabArtifact } from './experimentRunners';
import { buildEpidemicWorld, makeEpidemicSEIRSolver } from '../worldModel/domains/epidemicSEIR';
import type { EpidemicPoint } from '../epidemic/sir';

/**
 * SCIENTIFIC WORLDS — EPIDEMIOLOGY CITY RUNNER (SW-4).
 *
 * The city's ONE experiment, `epidemic-seir-city`, is computed by the REAL
 * `core/worldModel/domains/epidemicSEIR.ts` domain: a `WorldGraph` carrying
 * one population entity, advanced tick by tick through
 * `makeEpidemicSEIRSolver` — the SAME `DomainSolver` contract every other
 * World Model domain (hydraulics, electrical, chemistry kinetics) already
 * implements, wrapping the SAME `core/epidemic/sir.ts` RK4 integrator the
 * physics lab's own `seir-epidemic` experiment (`experimentRunners.ts`) uses.
 * This is not a second epidemiology engine: it is the existing engine,
 * reached through the existing ECS/WorldGraph seam instead of calling
 * `simulateEpidemic` directly, proving "command -> agent -> session flow in
 * the epidemiology city via existing worldModel (SEIR)" for real.
 *
 * The result is typed as the EXISTING `EpidemicArtifact`
 * (`experimentRunners.ts`) — `AgentLabScene3D` already knows how to draw an
 * `artifact.kind === 'epidemic'` payload, so no second renderer is needed
 * for this world either.
 */

export type CityExperimentId = 'epidemic-seir-city';

export function isCityExperiment(experimentId: string): experimentId is CityExperimentId {
  return experimentId === 'epidemic-seir-city';
}

function num(v: unknown, fallback: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }

const SOURCE = (worldId: string) => `genesis://city/epidemic-seir/${worldId}`;

export function createCityExperimentRunner(worldId: string, ledger: EvidenceLedger): ExperimentRunner<LabArtifact> {
  return (experimentId, seed, inputs: SessionInputs): ExperimentRunResult<LabArtifact> => {
    if (!isCityExperiment(experimentId)) throw new Error(`unknown experiment ${experimentId}`);

    const params = epidemicParamsFrom(inputs);
    const days = Math.max(30, Math.min(400, Math.round(num(inputs.days, 180))));

    // The real World Model seam: a WorldGraph carrying one population entity, advanced by the
    // real epidemicSEIR.ts DomainSolver — not a re-derived epidemic model.
    const { graph, populationId } = buildEpidemicWorld({ populationId: `city-${worldId}-${seed}`, params });
    const solver = makeEpidemicSEIRSolver(params);
    const initial = graph.tryGetEntity(populationId)!.domainState!;
    const series: EpidemicPoint[] = [{ t: 0, S: initial.S, E: initial.E, I: initial.I, R: initial.R, D: initial.D }];
    let peakInfected = initial.I;
    let peakDay = 0;

    for (let tick = 1; tick <= days; tick++) {
      const entity = graph.tryGetEntity(populationId)!;
      const result = solver(entity, { dt: 1, tick, graph });
      graph.updateEntity(populationId, result.patch, tick);
      const state = graph.tryGetEntity(populationId)!.domainState!;
      const point: EpidemicPoint = { t: state.t, S: state.S, E: state.E, I: state.I, R: state.R, D: state.D };
      series.push(point);
      if (point.I > peakInfected) { peakInfected = point.I; peakDay = tick; }
    }

    const last = series[series.length - 1];
    const totalInfected = params.population - last.S;

    const record = ledger.addRecord({
      sourceUrl: SOURCE(worldId), sourceTimestamp: null,
      claim: `Epidemiology city SEIR run (World Model) population=${params.population} r0=${params.r0} days=${days} peakInfected=${Math.round(peakInfected)} peakDay=${peakDay} params=${canonicalJson(params)}`,
      claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'genesis-worldmodel-epidemic-seir-runner', independentSourceIds: [] },
    });

    const artifact: EpidemicArtifact = { kind: 'epidemic', series, params };
    return {
      outputs: {
        r0: params.r0, population: params.population, days,
        peakInfected: Math.round(peakInfected), peakDay,
        totalInfected: Math.round(totalInfected), finalDead: Math.round(last.D),
      },
      evidenceHashes: [record.record.contentHash],
      epistemicStatus: 'SIMULATION',
      engineLabel: 'WORLD_MODEL_EPIDEMIC_SEIR_RK4',
      steps: ['World Model WorldGraph (one population entity)', 'epidemicSEIR.ts DomainSolver, real RK4 (core/epidemic/sir.ts)', `${days} daily ticks`, 'ledger commit'],
      artifact,
    };
  };
}
