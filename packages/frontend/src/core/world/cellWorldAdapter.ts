import { EventRegistry } from '../events/eventRegistry';
import { replaySavedHypothesisLoopAsync, type HypothesisLoopResult } from '../experimentFabric/hypothesisLoop';
import type { ExperimentRun } from '../experimentFabric/types';
import {
  buildWorldState, type ReplayState, type ScientificProperty, type WorldEntity, type WorldState,
} from './scientificWorldState';

/**
 * CELL / POPULATION BIOLOGY WORLD ADAPTER — the reference implementation
 * for a generalized Scientific Object across domains (epidemiology,
 * particle physics, molecular chemistry, now cell population dynamics),
 * reusing this codebase's own canonical epistemic vocabulary
 * (`HypothesisLoopResult`) rather than a new one.
 *
 * Built on the existing, real, local `biology-logistic` model
 * (`router.ts` / `executor.ts` case `'biology-logistic'`), which computes
 * the EXACT closed-form solution of the logistic growth equation
 * dN/dt = rN(1−N/K): N(t) = K/(1+((K−N₀)/N₀)e^(−rt))
 * (`core/modelGraph/logisticGrowthGraph.ts`). No cell biology is computed
 * here: every property below is read verbatim from a real
 * `ExperimentRun.result.outputs` that `executePreregisteredHypotheses`
 * already produced by calling that model graph.
 *
 * SCIENTIFIC HONESTY BOUNDARY (deliberate and explicit): this is a
 * SIMPLIFIED, unstructured population model (constant r and K; no age
 * structure, delay, predation, or stochasticity — see the model graph's
 * own `honesty: 'simplified'` note). It is a SIMULATED population count,
 * never a measured cell count, an assay observation, or a claim about any
 * real organism or cell line. `notModeled` on every projected state
 * declares this explicitly.
 */
export const CELL_WORLD_ADAPTER_VERSION = '1.0.0';

/** Exactly the fields the `biology-logistic` model graph actually reports (`executor.ts`) — nothing added, nothing inferred. */
const LOGISTIC_NUMERIC_FIELDS: readonly { key: string; unit?: string }[] = [
  { key: 'populationAtT', unit: 'osobn.' },
  { key: 'fractionOfCapacity', unit: '%' },
];

const CELL_POPULATION_NOT_MODELED = [
  'age-structure', 'cell-cycle-phase', 'gene-expression', 'cell-death', 'cell-differentiation',
  'stochasticity', 'spatial-structure', 'predation', 'nutrient-depletion',
] as const;

function cellPopulationEntityFor(run: ExperimentRun): WorldEntity | null {
  const growthRate = run.request.parameters.growthRate;
  if (typeof growthRate !== 'number') return null;
  const properties: ScientificProperty[] = [];
  for (const field of LOGISTIC_NUMERIC_FIELDS) {
    const value = run.result.outputs[field.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      properties.push({ key: field.key, value, ...(field.unit === undefined ? {} : { unit: field.unit }) });
    }
  }
  const carryingCapacity = run.request.parameters.carryingCapacity;
  if (typeof carryingCapacity === 'number') properties.push({ key: 'carryingCapacity', value: carryingCapacity, unit: 'osobn.' });
  properties.push({ key: 'growthRate', value: growthRate, unit: '1/czas' });
  return {
    // Stable, deterministic id: the REQUESTED growth rate (not a re-derived hash), so replay always addresses the same entity.
    ref: { kind: 'cell-population', id: `r=${growthRate}` },
    label: `Populacja komórek (r=${growthRate})`,
    properties,
  };
}

function replayStateFor(loopResult: HypothesisLoopResult): Promise<ReplayState> {
  return (async () => {
    if (!loopResult.preregistrationIntact.intact) return { status: 'BLOCKED' as const, message: loopResult.preregistrationIntact.reason };
    const replay = await replaySavedHypothesisLoopAsync({
      contractVersion: loopResult.contractVersion,
      preregistrationId: loopResult.preregistration.preregistrationId,
      preregistrationFingerprint: loopResult.preregistration.preregistrationFingerprint,
      createdAt: loopResult.preregistration.createdAt,
      anchor: loopResult.preregistration.anchor,
      problem: loopResult.preregistration.set.problem,
      hypotheses: loopResult.preregistration.hypotheses,
      outcomes: loopResult.outcomes.map((o) => ({ hypothesisId: o.hypothesisId, status: o.status, observedMetric: o.observedMetric, baselineMetric: o.baselineMetric, evidencePackId: o.evidencePackId, evidenceChainId: o.evidenceChainId })),
      discrimination: { ranking: loopResult.discrimination.ranking, winnerHypothesisId: loopResult.discrimination.winnerHypothesisId, decisive: loopResult.discrimination.decisive },
      loopFingerprint: '',
    });
    return { status: replay.status, message: replay.reason };
  })();
}

/**
 * Projects a real, executed cell-population `HypothesisLoopResult` (from a
 * `biology-logistic` `HypothesisProblem`) into an ordered `WorldState[]`,
 * one per real `ExperimentRun` that produced a cell-population entity.
 * Runs whose result carries no usable `growthRate`/outputs (BLOCKED,
 * INCONCLUSIVE) are skipped — never backfilled with an invented count.
 *
 * Ordering is DETERMINISTIC: `loopResult.allRuns` is itself already an
 * ordered, deterministic array (arm order from `designScientificExperiment`,
 * then repetition order) — this function preserves that order and adds no
 * sort of its own that could vary between equal-content runs.
 */
export function projectCellWorldStates(loopResult: HypothesisLoopResult): WorldState[] {
  const worldId = `cell:${loopResult.preregistration.set.problem.problemId}`;
  const registry = new EventRegistry({ modelId: loopResult.preregistration.set.problem.modelId, experimentId: loopResult.preregistration.preregistrationId });
  let previousEventId: string | null = null;

  const states: WorldState[] = [];
  loopResult.allRuns.forEach((run, index) => {
    if (run.result.status !== 'completed') return;
    const entity = cellPopulationEntityFor(run);
    if (!entity) return;

    const event = registry.add({
      type: 'cell.population.simulated',
      timestamp: index,
      affectedEntities: [entity.ref],
      parameters: { growthRate: run.request.parameters.growthRate, populationAtT: run.result.outputs.populationAtT ?? null },
      parentEventId: previousEventId,
      experimentId: run.runId,
      provenance: { origin: 'model', modelId: run.provenance.modelId, experimentId: run.runId, notes: run.result.summary },
    });
    previousEventId = event.id;

    states.push(buildWorldState({
      worldId, domainId: 'CELL_BIOLOGY', tick: index,
      entities: [entity],
      relations: [],
      observations: [{
        observationId: `obs:${event.id}`, tick: index, statement: run.result.summary,
        measurements: entity.properties
          .filter((p): p is ScientificProperty & { value: number } => typeof p.value === 'number')
          .map((p) => ({ key: p.key, value: p.value, ...(p.unit === undefined ? {} : { unit: p.unit }), tick: index, entity: entity.ref, provenance: [event.id] })),
        provenance: [event.id],
      }],
      events: [event],
      experiment: { experimentId: run.runId, status: 'COMPLETED', runs: [run] },
      epistemic: loopResult,
      evidence: [],
      replay: null, // filled below once, after all states are built (one shared replay verdict for the whole run set)
      notModeled: [...CELL_POPULATION_NOT_MODELED],
    }));
  });

  return states;
}

/** Async variant that also fills in the real replay verdict (requires re-executing the hypothesis loop). Kept separate from the sync projector so a caller who already knows the replay status (e.g. it just ran the loop) is not forced into a second computation. */
export async function projectCellWorldStatesWithReplay(loopResult: HypothesisLoopResult): Promise<WorldState[]> {
  const states = projectCellWorldStates(loopResult);
  if (states.length === 0) return states;
  const replay = await replayStateFor(loopResult);
  return states.map((state) => ({ ...state, replay }));
}
