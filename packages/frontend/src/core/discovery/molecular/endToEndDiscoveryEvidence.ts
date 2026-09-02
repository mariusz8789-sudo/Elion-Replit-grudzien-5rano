import { buildDiscoveryEvidencePack } from './evidence';
import { exportEvidencePackRoCrate, verifyEvidencePackRoCrateRoundTrip } from '../../experimentFabric/evidencePackRoCrate';
import { proposeNextDiscoverySteps, type NextDiscoveryStep } from './nextStep';
import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import type { ScientificEvidencePack } from '../../experimentFabric/evidencePack';
import type { EndToEndDiscoveryResult } from './endToEndDiscovery';

/**
 * EVIDENCE, RO-CRATE, REPLAY AND SCIENTIFIC MEMORY for an end-to-end run.
 *
 * NO NEW PROVENANCE SYSTEM. `EndToEndDiscoveryResult.discovery` is already a
 * `DiscoveryResult`, so the existing Evidence Pack and RO-Crate exporters
 * consume it unchanged; replay follows the same save-inputs / recompute /
 * compare-fingerprint pattern as every other replay in this engine, importing
 * `SavedScenarioReplayStatus` verbatim rather than redeclaring the verdicts.
 *
 * REPLAY HONESTY: a run's numbers come from two external engines whose
 * presence and version differ between runtimes — real RDKit and real ADMET-AI.
 * The saved record therefore captures BOTH engine identities, and a replay
 * under a different engine set is BLOCKED rather than compared. Reproducing a
 * number with a different ADMET-AI version is a different experiment, and
 * calling it a MATCH would be the exact dishonesty this machinery exists to
 * prevent.
 */
export const END_TO_END_DISCOVERY_EVIDENCE_VERSION = '1.0.0';

export function buildEndToEndEvidencePack(result: EndToEndDiscoveryResult): ScientificEvidencePack {
  return buildDiscoveryEvidencePack(result.discovery);
}

export function exportEndToEndRoCrate(result: EndToEndDiscoveryResult): ReturnType<typeof exportEvidencePackRoCrate> {
  return exportEvidencePackRoCrate(buildEndToEndEvidencePack(result));
}

export function verifyEndToEndRoCrate(result: EndToEndDiscoveryResult, reloadedJson?: string) {
  return verifyEvidencePackRoCrateRoundTrip(buildEndToEndEvidencePack(result), reloadedJson);
}

export function nextExperiments(result: EndToEndDiscoveryResult): readonly NextDiscoveryStep[] {
  return proposeNextDiscoverySteps(result.discovery);
}

/**
 * The identity of a run, for replay. Engine identities are part of it: two
 * runs that agree on every input but ran on different engine versions are not
 * the same experiment.
 */
export interface SavedEndToEndRun {
  version: string;
  questionId: string;
  subject: string;
  rdkitEngine: string;
  admetEngine: string;
  resultFingerprint: string;
}

export function buildSavedEndToEndRun(result: EndToEndDiscoveryResult): SavedEndToEndRun {
  return {
    version: END_TO_END_DISCOVERY_EVIDENCE_VERSION,
    questionId: result.question.questionId,
    subject: result.referenceIdentity.name,
    rdkitEngine: result.referenceIdentity.engine,
    admetEngine: result.admet.engineId,
    resultFingerprint: result.resultFingerprint,
  };
}

export function isSavedEndToEndRun(value: unknown): value is SavedEndToEndRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  return typeof saved.version === 'string' && saved.version.length > 0
    && typeof saved.questionId === 'string' && saved.questionId.length > 0
    && typeof saved.subject === 'string' && saved.subject.length > 0
    && typeof saved.rdkitEngine === 'string' && saved.rdkitEngine.length > 0
    && typeof saved.admetEngine === 'string' && saved.admetEngine.length > 0
    && typeof saved.resultFingerprint === 'string' && saved.resultFingerprint.length > 0;
}

export interface EndToEndReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
}

/**
 * Compares a saved run against a freshly computed one.
 *
 * BLOCKED takes precedence over DRIFT on purpose: if the engines differ there
 * is nothing meaningful to compare, and reporting a fingerprint difference as
 * DRIFT would blame the chemistry for what is actually a change of runtime.
 */
export function replaySavedEndToEndRun(saved: unknown, current: EndToEndDiscoveryResult): EndToEndReplay {
  if (!isSavedEndToEndRun(saved)) {
    return { status: 'BLOCKED', reason: 'Saved end-to-end run is incomplete or corrupted — required identity fields are missing.' };
  }

  const now = buildSavedEndToEndRun(current);

  if (saved.questionId !== now.questionId || saved.subject !== now.subject) {
    return { status: 'BLOCKED', reason: `Saved run asks a different question (${saved.questionId} on ${saved.subject}) than the one recomputed (${now.questionId} on ${now.subject}).` };
  }

  if (saved.rdkitEngine !== now.rdkitEngine || saved.admetEngine !== now.admetEngine) {
    return {
      status: 'BLOCKED',
      reason: `Engine set differs: saved run used RDKit "${saved.rdkitEngine}" and ADMET "${saved.admetEngine}"; this runtime has "${now.rdkitEngine}" and "${now.admetEngine}". Values produced by different engine versions are not the same experiment.`,
    };
  }

  if (saved.resultFingerprint !== now.resultFingerprint) {
    return {
      status: 'DRIFT',
      reason: 'Same question, same subject and the same engines produced a different result fingerprint — the candidate set, the mechanism filtering or the Pareto front changed since the run was saved.',
    };
  }

  return { status: 'MATCH', reason: '' };
}

export function saveEndToEndRunToMemory(result: EndToEndDiscoveryResult): SavedExperiment {
  const front = result.topCandidates.map((c) => c.candidateId);

  return saveExperiment({
    labId: 'end-to-end-molecular-discovery',
    experimentId: `${result.question.questionId}:${result.resultFingerprint}`,
    experimentName: `${result.referenceIdentity.name} — end-to-end discovery run`,
    params: {
      questionId: result.question.questionId,
      subject: result.referenceIdentity.name,
      depth: result.discovery.batch.transformations.length,
      generationMethod: result.discovery.generationCapability.methodId,
    },
    stats: {
      generated: result.funnel.generated,
      rdkitValid: result.funnel.rdkitValid,
      screeningRetained: result.funnel.screeningRetained,
      admetEvaluable: result.funnel.admetEvaluable,
      mechanismNotExcluded: result.funnel.mechanismNotExcluded,
      mechanismExcluded: result.funnel.mechanismExcluded,
      paretoFront: result.funnel.paretoFront,
    },
    analysis: [
      { title: 'Question', kind: 'question', body: result.question.question },
      {
        title: 'Reference identity',
        kind: 'identity',
        body: result.referenceIdentity.resolved
          ? `${result.referenceIdentity.name}: ${result.referenceIdentity.molecularFormula}, InChIKey ${result.referenceIdentity.inchiKey ?? 'NOT_AVAILABLE'}, MW ${result.referenceIdentity.molecularWeight ?? 'NOT_AVAILABLE'}, formula cross-check ${result.referenceIdentity.formulaCrossCheck}.`
          : `NOT_AVAILABLE: ${result.referenceIdentity.reason}`,
      },
      { title: 'Reference comparison', kind: 'comparison', body: result.referenceComparisons.summary },
      {
        title: 'Filter funnel',
        kind: 'funnel',
        body: `generated ${result.funnel.generated}; RDKit-valid ${result.funnel.rdkitValid}; screening retained ${result.funnel.screeningRetained} `
          + `(rejected ${result.funnel.screeningRejected}, not-resolved ${result.funnel.screeningNotResolved}); ADMET-evaluable ${result.funnel.admetEvaluable}; `
          + `mechanism not-excluded ${result.funnel.mechanismNotExcluded} (excluded ${result.funnel.mechanismExcluded}, unevaluable ${result.funnel.mechanismUnevaluable}); `
          + `Pareto front ${result.funnel.paretoFront}.`,
      },
      { title: 'Pareto front', kind: 'top-candidates', body: front.length > 0 ? front.join(', ') : 'empty — no candidate could be evaluated on every declared objective' },
      { title: 'Limitations', kind: 'limitations', body: result.limitations.join(' ') },
    ],
    honesty: 'simplified',
    honestyNote:
      'Every candidate in this run was generated by a deterministic SMARTS enumerator and has no literature, no measured affinity and no experimental record. '
      + 'ADMET values are model predictions, not measurements. No candidate has been shown to act at any target, and nothing here is a claim of safety, efficacy or clinical equivalence to any reference compound.',
    epistemicStatus: `PARETO_FRONT=${result.funnel.paretoFront};MECHANISM_EXCLUDED=${result.funnel.mechanismExcluded};TARGET_AFFINITY=REQUIRES_EXPERIMENT`,
    assumptions: [
      'Mechanism prerequisites are necessary conditions derived from ingested records; passing them is not evidence of activity.',
      'CNS exposure bounds (TPSA, molecular weight) are declared campaign heuristics, not experimentally established thresholds.',
      'No live DOI/PubMed/PMC resolution was available, so every literature record traces to a named source that Genesis did not independently fetch.',
    ],
  });
}
