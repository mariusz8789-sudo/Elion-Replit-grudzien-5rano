/**
 * GENESIS SCIENTIFIC NEXT-EXPERIMENT SELECTOR
 *
 * Selects one already preregistered candidate protocol after an auditable
 * ScientificEvidenceChain. It does not generate a hypothesis, request,
 * parameter value, model, output, result or execution. The candidate pool is
 * supplied by the caller and every eligible candidate is an existing immutable
 * ScientificExperimentDesign.
 */

import { canonicalJson, fnv1a } from '../events/hash';
import type {
  ExperimentArm,
  ScientificEvidenceChain,
  ScientificExperimentDesign,
} from './scientificDiscovery';

export const SCIENTIFIC_NEXT_EXPERIMENT_VERSION = '1.0.0';

export type NextExperimentSelectionStatus =
  | 'SELECTED'
  | 'NO_ELIGIBLE_CANDIDATE'
  | 'BLOCKED_INCONCLUSIVE_EVIDENCE'
  | 'BLOCKED_UNREPRODUCIBLE_EVIDENCE';

export type CandidateEligibilityStatus =
  | 'ELIGIBLE'
  | 'DUPLICATE_PROTOCOL'
  | 'DOMAIN_OR_MODEL_MISMATCH'
  | 'PRIMARY_METRIC_MISMATCH';

export interface NextExperimentCandidateEvaluation {
  candidateDesignId: string;
  candidateProtocolFingerprint: string;
  status: CandidateEligibilityStatus;
  /** Count of candidate arm requests not already executed in the evidence chain. */
  novelArmCount: number;
  reason: string;
}

export interface NextExperimentSelection {
  contractVersion: string;
  selectionId: string;
  status: NextExperimentSelectionStatus;
  /** The existing Evidence Chain that gates the decision. */
  evidenceId: string;
  evidenceProvenanceFingerprint: string;
  evaluatedCandidateProtocolFingerprints: readonly string[];
  candidateEvaluations: readonly NextExperimentCandidateEvaluation[];
  /** The original immutable candidate design, never a generated request. */
  selectedDesign?: ScientificExperimentDesign;
  selectionFingerprint: string;
  rationale: string;
  disclaimer: string;
}

export interface NextExperimentSelectionInput {
  evidence: ScientificEvidenceChain;
  /** Existing immutable, preregistered candidate protocols only. */
  candidates: readonly ScientificExperimentDesign[];
}

function armRequestKey(arm: ExperimentArm): string {
  return canonicalJson({
    domainId: arm.request.domainId,
    modelId: arm.request.modelId ?? null,
    operation: arm.request.operation,
    parameters: arm.request.parameters,
    seed: arm.request.seed ?? null,
  });
}

function completedRequestKeys(evidence: ScientificEvidenceChain): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const run of evidence.allRuns) {
    if (run.result.status !== 'completed') continue;
    keys.add(canonicalJson({
      domainId: run.request.domainId,
      modelId: run.request.modelId ?? null,
      operation: run.request.operation,
      parameters: run.request.parameters,
      seed: run.request.seed ?? null,
    }));
  }
  return keys;
}

function candidateEvaluation(
  evidence: ScientificEvidenceChain,
  candidate: ScientificExperimentDesign,
  executed: ReadonlySet<string>,
): NextExperimentCandidateEvaluation {
  const base = {
    candidateDesignId: candidate.designId,
    candidateProtocolFingerprint: candidate.protocolFingerprint,
  };
  if (candidate.protocolFingerprint === evidence.design.protocolFingerprint) {
    return { ...base, status: 'DUPLICATE_PROTOCOL', novelArmCount: 0, reason: 'Kandydat jest dokładnie tym samym prerejestrowanym protokołem co już oceniony Evidence Chain.' };
  }
  if (
    candidate.hypothesis.domainId !== evidence.design.hypothesis.domainId
    || candidate.hypothesis.modelId !== evidence.design.hypothesis.modelId
  ) {
    return { ...base, status: 'DOMAIN_OR_MODEL_MISMATCH', novelArmCount: 0, reason: 'Kandydat wskazuje inną domenę lub model; Model-vs-Model jest osobnym, niewdrożonym protokołem.' };
  }
  if (candidate.primaryMetric !== evidence.design.primaryMetric) {
    return { ...base, status: 'PRIMARY_METRIC_MISMATCH', novelArmCount: 0, reason: 'Kandydat ma inną główną metrykę niż Evidence Chain, więc nie jest porównywalnym następnym krokiem.' };
  }
  const novelArmCount = candidate.arms.filter((arm) => !executed.has(armRequestKey(arm))).length;
  return {
    ...base,
    status: 'ELIGIBLE',
    novelArmCount,
    reason: novelArmCount > 0
      ? 'Kandydat jest prerejestrowany, zgodny z domeną/modelem/metrką i wnosi nieuruchomione punkty protokołu.'
      : 'Kandydat jest prerejestrowany i zgodny, ale wszystkie jego arm requests były już wykonane w Evidence Chain.',
  };
}

function selectionResult(
  input: NextExperimentSelectionInput,
  status: NextExperimentSelectionStatus,
  evaluations: readonly NextExperimentCandidateEvaluation[],
  selectedDesign: ScientificExperimentDesign | undefined,
  rationale: string,
): NextExperimentSelection {
  const selectionFingerprint = `next_${fnv1a(canonicalJson({
    version: SCIENTIFIC_NEXT_EXPERIMENT_VERSION,
    evidence: input.evidence.provenanceFingerprint,
    status,
    candidates: evaluations.map((evaluation) => ({
      protocol: evaluation.candidateProtocolFingerprint,
      status: evaluation.status,
      novelArmCount: evaluation.novelArmCount,
    })),
    selectedProtocol: selectedDesign?.protocolFingerprint ?? null,
  }))}`;
  return {
    contractVersion: SCIENTIFIC_NEXT_EXPERIMENT_VERSION,
    selectionId: selectionFingerprint,
    status,
    evidenceId: input.evidence.evidenceId,
    evidenceProvenanceFingerprint: input.evidence.provenanceFingerprint,
    evaluatedCandidateProtocolFingerprints: evaluations.map((evaluation) => evaluation.candidateProtocolFingerprint),
    candidateEvaluations: evaluations,
    ...(selectedDesign === undefined ? {} : { selectedDesign }),
    selectionFingerprint,
    rationale,
    disclaimer: 'Selection wybiera wyłącznie już prerejestrowany kandydat. Nie generuje hipotezy, parametru, requestu, wyniku ani eksperymentu. Wymaga osobnego potwierdzenia i realnego execution przed powstaniem nowego Evidence Chain.',
  };
}

/**
 * Selects a next protocol only after completed, reproducible evidence. Eligible
 * candidates are ranked deterministically by number of unexecuted arms
 * (descending), then by protocol fingerprint (lexical ascending). This is a
 * transparent coverage heuristic, not Bayesian optimization or discovery.
 */
export function selectNextScientificExperiment(input: NextExperimentSelectionInput): NextExperimentSelection {
  const evidence = input.evidence;
  const evaluations = input.candidates
    .map((candidate) => candidateEvaluation(evidence, candidate, completedRequestKeys(evidence)))
    .sort((left, right) => left.candidateProtocolFingerprint.localeCompare(right.candidateProtocolFingerprint));

  if (evidence.assessment.assessment === 'INCONCLUSIVE') {
    return selectionResult(
      input,
      'BLOCKED_INCONCLUSIVE_EVIDENCE',
      evaluations,
      undefined,
      'Evidence Chain jest nierozstrzygający; Genesis nie wybiera kolejnego protokołu na podstawie nieukończonych lub niejednoznacznych danych.',
    );
  }
  if (evidence.arms.some((arm) => arm.reproduction !== 'MATCH')) {
    return selectionResult(
      input,
      'BLOCKED_UNREPRODUCIBLE_EVIDENCE',
      evaluations,
      undefined,
      'Evidence Chain nie ma zgodnych powtórzeń dla każdego armu; Genesis nie promuje kandydata przed wyjaśnieniem driftu lub braku execution.',
    );
  }

  const candidateByFingerprint = new Map(input.candidates.map((candidate) => [candidate.protocolFingerprint, candidate]));
  const eligible = evaluations
    .filter((evaluation) => evaluation.status === 'ELIGIBLE' && evaluation.novelArmCount > 0)
    .sort((left, right) => right.novelArmCount - left.novelArmCount
      || left.candidateProtocolFingerprint.localeCompare(right.candidateProtocolFingerprint));
  const chosen = eligible[0] === undefined ? undefined : candidateByFingerprint.get(eligible[0].candidateProtocolFingerprint);

  if (!chosen) {
    return selectionResult(
      input,
      'NO_ELIGIBLE_CANDIDATE',
      evaluations,
      undefined,
      'Brak zgodnego, prerejestrowanego kandydata z nowym arm request. Genesis nie generuje kolejnego eksperymentu automatycznie.',
    );
  }
  return selectionResult(
    input,
    'SELECTED',
    evaluations,
    chosen,
    `Wybrano istniejący prerejestrowany protocol '${chosen.designId}' z ${eligible[0].novelArmCount} nieuruchomionymi arm request(s). Wybór jest deterministycznym rankingiem pokrycia, nie wynikiem ani odkryciem.`,
  );
}

/** Replay is deterministic: identical evidence and candidate pool produce identical selectionFingerprint. */
export function replayNextScientificExperimentSelection(input: NextExperimentSelectionInput): NextExperimentSelection {
  return selectNextScientificExperiment(input);
}
