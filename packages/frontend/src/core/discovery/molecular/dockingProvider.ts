import {
  isTargetAffinityMeaningful,
  type DockingResult,
  type DockingTransport,
  type ReceptorSpec,
} from './dockingTransport';
import { unavailableProperty, type MoleculeCandidate, type MoleculeProperty } from './types';

/**
 * DOCKING PROVIDER — turns real AutoDock Vina output into a discovery property,
 * but only where that output means something.
 *
 * TWO RULES, both enforced here rather than left to a caller:
 *
 * 1. A docking score is a MODEL_PREDICTION. Vina's empirical scoring function
 *    estimates a binding free energy; it does not measure one. No docking
 *    number is ever COMPUTED and none is ever evidence of binding.
 *
 * 2. A score is a TARGET AFFINITY only against a real 3D receptor. The backend
 *    adapter can dock against a small-molecule stand-in to exercise the
 *    pipeline, and that number is not about any biological target. It is
 *    reported under its own property id, `dockingPipelineScore`, and can never
 *    be read as `targetAffinity`.
 *
 * Rule 2 is the one that would otherwise let real software produce a
 * fabricated-looking result: the pipeline runs, a plausible kcal/mol comes
 * back, and nothing in the number itself reveals that it was docked against
 * the wrong thing.
 */
export const DOCKING_PROVIDER_VERSION = '1.0.0';

export const DOCKING_PROPERTY_IDS = ['targetAffinity', 'dockingPipelineScore'] as const;

export interface DockingBatchResult {
  engineId: string;
  available: boolean;
  reason: string;
  /** Results keyed by candidate id. */
  byCandidate: Readonly<Record<string, DockingResult>>;
  /** Candidates not docked, with why. Never silently skipped. */
  skipped: readonly { candidateId: string; reason: string }[];
  receptorKind: ReceptorSpec['kind'] | null;
  receptorProvenance: string | null;
}

export interface DockingBatchOptions {
  /** Hard ceiling on docking runs — Vina is the slowest engine here. */
  maxDocks?: number;
  seed?: number;
  exhaustiveness?: number;
}

/**
 * Docks a bounded set of candidates against one declared receptor.
 *
 * Candidates are processed in deterministic (sorted-SMILES) order with a fixed
 * seed, so the same batch produces the same scores.
 */
export function runDockingBatch(
  transport: DockingTransport,
  candidates: readonly MoleculeCandidate[],
  receptor: ReceptorSpec | null,
  options: DockingBatchOptions = {},
): DockingBatchResult {
  const maxDocks = options.maxDocks ?? 10;
  const detected = transport.detect();
  const engineId = detected.available ? detected.engine : `vina:unavailable:${transport.transportId}`;

  if (!detected.available) {
    return { engineId, available: false, reason: detected.reason, byCandidate: {}, skipped: [], receptorKind: null, receptorProvenance: null };
  }
  if (receptor === null) {
    return {
      engineId,
      available: true,
      reason: 'No receptor was declared. Docking requires a receptor; a target name is not one.',
      byCandidate: {},
      skipped: candidates.map((c) => ({ candidateId: c.candidateId, reason: 'No receptor declared for this question.' })),
      receptorKind: null,
      receptorProvenance: null,
    };
  }

  const byCandidate: Record<string, DockingResult> = {};
  const skipped: { candidateId: string; reason: string }[] = [];

  const ordered = [...candidates]
    .filter((c) => {
      if (c.structure.canonicalSmiles === null || c.structure.canonicalSmiles.length === 0) {
        skipped.push({ candidateId: c.candidateId, reason: 'No resolved structure; docking needs a ligand structure.' });
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.structure.canonicalSmiles ?? '').localeCompare(b.structure.canonicalSmiles ?? ''));

  for (const candidate of ordered) {
    if (Object.keys(byCandidate).length >= maxDocks) {
      skipped.push({ candidateId: candidate.candidateId, reason: `Exceeded the docking budget of ${maxDocks} runs for this batch.` });
      continue;
    }
    byCandidate[candidate.candidateId] = transport.dock({
      ligandSmiles: candidate.structure.canonicalSmiles!,
      receptor,
      seed: options.seed ?? 42,
      exhaustiveness: options.exhaustiveness ?? 8,
    });
  }

  return { engineId, available: true, reason: '', byCandidate, skipped, receptorKind: receptor.kind, receptorProvenance: receptor.provenance };
}

/**
 * Docking properties for one candidate.
 *
 * A real receptor yields `targetAffinity` as a MODEL_PREDICTION. A stand-in
 * yields `dockingPipelineScore` instead, and `targetAffinity` stays
 * unavailable with the reason — the score exists, but not as an answer to the
 * question that was asked.
 */
export function dockingPropertiesFor(candidate: MoleculeCandidate, batch: DockingBatchResult): MoleculeProperty[] {
  const blocked = (status: 'REQUIRES_EXTERNAL_ENGINE' | 'NOT_AVAILABLE') => [
    unavailableProperty('targetAffinity', status, 'kcal/mol'),
    unavailableProperty('dockingPipelineScore', status, 'kcal/mol'),
  ];

  if (!batch.available) return blocked('REQUIRES_EXTERNAL_ENGINE');

  const result = batch.byCandidate[candidate.candidateId];
  if (result === undefined || !result.ok) return blocked('NOT_AVAILABLE');

  const meaningful = isTargetAffinityMeaningful(result.receptorKind);
  const score: MoleculeProperty = {
    propertyId: meaningful.meaningful ? 'targetAffinity' : 'dockingPipelineScore',
    status: 'MODEL_PREDICTION',
    value: result.bestAffinityKcalMol,
    unit: 'kcal/mol',
    engine: result.engine,
  };

  return meaningful.meaningful
    ? [score, unavailableProperty('dockingPipelineScore', 'NOT_AVAILABLE', 'kcal/mol')]
    : [unavailableProperty('targetAffinity', 'NOT_AVAILABLE', 'kcal/mol'), score];
}

/** Replaces placeholder docking properties with real ones. */
export function withDockingProperties(
  candidates: readonly MoleculeCandidate[],
  batch: DockingBatchResult,
): readonly MoleculeCandidate[] {
  const replaced = new Set<string>(DOCKING_PROPERTY_IDS);
  return candidates.map((candidate) => ({
    ...candidate,
    properties: [
      ...candidate.properties.filter((p) => !replaced.has(p.propertyId)),
      ...dockingPropertiesFor(candidate, batch),
    ],
  }));
}

/** What this docking run did and did not establish. */
export function dockingLimitations(batch: DockingBatchResult): readonly string[] {
  if (!batch.available) {
    return [`Docking did not run: ${batch.reason}. No target-affinity value exists for any candidate.`];
  }
  if (batch.receptorKind === null) {
    return [batch.reason];
  }
  const notes = [
    'Docking scores are MODEL_PREDICTIONS from an empirical scoring function. A score is not a measured binding constant and is not evidence that binding occurs.',
  ];
  if (batch.receptorKind === 'SMALL_MOLECULE_STANDIN') {
    notes.push(
      'This run used a SMALL-MOLECULE STAND-IN receptor, not a biological target. The resulting scores exercise the docking pipeline and are reported as dockingPipelineScore; targetAffinity remains unavailable.',
    );
  } else {
    notes.push(`Receptor provenance: ${batch.receptorProvenance ?? 'not stated'}. Pose quality and box placement were not independently validated.`);
  }
  if (batch.skipped.length > 0) {
    notes.push(`${batch.skipped.length} candidate(s) were not docked (no structure, or the docking budget was reached); they carry no docking value.`);
  }
  return notes;
}
