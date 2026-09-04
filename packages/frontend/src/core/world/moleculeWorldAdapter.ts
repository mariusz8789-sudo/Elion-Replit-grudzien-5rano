import { EventRegistry } from '../events/eventRegistry';
import { replaySavedHypothesisLoopAsync, type HypothesisLoopResult } from '../experimentFabric/hypothesisLoop';
import type { ExperimentRun } from '../experimentFabric/types';
import {
  buildWorldState, type ReplayState, type ScientificProperty, type WorldEntity, type WorldState,
} from './scientificWorldState';

/**
 * MOLECULAR / CHEMISTRY WORLD ADAPTER — the THIRD domain proving
 * `ScientificWorldState` is genuinely generic (epidemiology, particle
 * physics, now molecular chemistry), reusing this branch's own canonical
 * epistemic vocabulary (`HypothesisLoopResult`) rather than a new one.
 *
 * Built on the existing, real, backend RDKit model
 * (`chem-rdkit-descriptors`, `router.ts` — capability `BACKEND_REAL_ENGINE`,
 * the same real Python RDKit process the PySCF adapter's sibling backend
 * executor already calls). No chemistry is computed here: every property
 * below is read verbatim from a real `ExperimentRun.result.outputs` that
 * `executePreregisteredHypothesesAsync` already produced by calling the
 * existing `executeScientificBackendExperiment`.
 *
 * SCIENTIFIC HONESTY BOUNDARY (deliberate and explicit): RDKit reports
 * TOPOLOGICAL / COMPUTATIONAL descriptors of a 2D structure — molecular
 * weight, LogP, ring counts, TPSA, Lipinski flags. These are read as
 * `ScientificProperty` values on a `molecule` entity, and NOTHING ELSE.
 * This adapter does not, and must not, invent or infer: potency, binding
 * affinity, toxicity, ADMET, bioactivity, or any clinical/pharmacological
 * meaning. Every one of those concepts is listed in `notModeled` on every
 * projected state — not because they're momentarily missing, but because
 * this model never computes them and no other validated Genesis module is
 * wired into this adapter to supply them.
 */
export const MOLECULE_WORLD_ADAPTER_VERSION = '1.0.0';

/** Exactly the fields `chem-rdkit-descriptors` actually reports (router.ts / rdkit backend adapter) — nothing added, nothing inferred. */
const RDKIT_NUMERIC_FIELDS: readonly { key: string; unit?: string }[] = [
  { key: 'molWt', unit: 'g/mol' },
  { key: 'exactMolWt', unit: 'g/mol' },
  { key: 'crippenLogP' },
  { key: 'hbd' },
  { key: 'hba' },
  { key: 'rotatableBonds' },
  { key: 'ringCount' },
  { key: 'aromaticRings' },
  { key: 'fractionCsp3' },
  { key: 'tpsa', unit: 'Å²' },
  { key: 'heavyAtomCount' },
  { key: 'heteroatomCount' },
  { key: 'formalCharge' },
  { key: 'lipinskiViolations' },
];

/**
 * Scientific concepts this adapter (and the underlying `chem-rdkit-descriptors`
 * model) does NOT compute — declared explicitly so a consumer never has to
 * guess whether an absence means "not modeled" or "forgot to look it up."
 */
const CHEMISTRY_NOT_MODELED = [
  'binding-affinity', 'target-potency', 'toxicity', 'admet',
  'biological-activity', 'clinical-relevance', 'synthesis-feasibility',
  'assay-observation', '3d-conformation',
] as const;

function moleculeEntityFor(run: ExperimentRun): WorldEntity | null {
  const smiles = run.request.parameters.smiles;
  if (typeof smiles !== 'string') return null;
  const canonicalSmiles = run.result.outputs.canonicalSmiles;
  const molecularFormula = run.result.outputs.molecularFormula;
  const properties: ScientificProperty[] = [];
  for (const field of RDKIT_NUMERIC_FIELDS) {
    const value = run.result.outputs[field.key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      properties.push({ key: field.key, value, ...(field.unit === undefined ? {} : { unit: field.unit }) });
    }
  }
  if (typeof canonicalSmiles === 'string') properties.push({ key: 'canonicalSmiles', value: canonicalSmiles });
  if (typeof molecularFormula === 'string') properties.push({ key: 'molecularFormula', value: molecularFormula });
  return {
    // Stable, deterministic id: the REQUESTED smiles (not a re-derived hash), so replay always addresses the same entity.
    ref: { kind: 'molecule', id: smiles },
    label: typeof molecularFormula === 'string' ? molecularFormula : smiles,
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
 * Projects a real, executed molecular `HypothesisLoopResult` (from a
 * `chem-rdkit-descriptors` `HypothesisProblem`) into an ordered
 * `WorldState[]`, one per real `ExperimentRun` that produced a molecule
 * entity. Runs whose result carries no usable `smiles`/outputs (BLOCKED,
 * INCONCLUSIVE, or a non-numeric echo) are skipped — never backfilled with
 * an invented descriptor.
 *
 * Ordering is DETERMINISTIC: `loopResult.allRuns` is itself already an
 * ordered, deterministic array (arm order from `designScientificExperiment`,
 * then repetition order) — this function preserves that order and adds no
 * sort of its own that could vary between equal-content runs.
 */
export function projectMoleculeWorldStates(loopResult: HypothesisLoopResult): WorldState[] {
  const worldId = `chemistry:${loopResult.preregistration.set.problem.problemId}`;
  const registry = new EventRegistry({ modelId: loopResult.preregistration.set.problem.modelId, experimentId: loopResult.preregistration.preregistrationId });
  let previousEventId: string | null = null;

  const states: WorldState[] = [];
  loopResult.allRuns.forEach((run, index) => {
    if (run.result.status !== 'completed') return;
    const entity = moleculeEntityFor(run);
    if (!entity) return;

    const event = registry.add({
      type: 'chemistry.descriptor.computed',
      timestamp: index,
      affectedEntities: [entity.ref],
      parameters: { smiles: String(run.request.parameters.smiles), molWt: run.result.outputs.molWt ?? null },
      parentEventId: previousEventId,
      experimentId: run.runId,
      provenance: { origin: 'model', modelId: run.provenance.modelId, experimentId: run.runId, notes: run.result.summary },
    });
    previousEventId = event.id;

    states.push(buildWorldState({
      worldId, domainId: 'CHEMISTRY', tick: index,
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
      notModeled: [...CHEMISTRY_NOT_MODELED],
    }));
  });

  return states;
}

/** Async variant that also fills in the real replay verdict (requires re-executing the backend hypothesis loop). Kept separate from the sync projector so a caller who already knows the replay status (e.g. it just ran the loop) is not forced into a second network round trip. */
export async function projectMoleculeWorldStatesWithReplay(loopResult: HypothesisLoopResult): Promise<WorldState[]> {
  const states = projectMoleculeWorldStates(loopResult);
  if (states.length === 0) return states;
  const replay = await replayStateFor(loopResult);
  return states.map((state) => ({ ...state, replay }));
}
