/**
 * GENESIS SCIENTIFIC HYPOTHESIS CANDIDATE
 *
 * Projects a reviewable candidate statement from an existing DiscoveryAnalysis
 * and a real ScientificEvidenceChain. It never executes a model, searches for
 * data, invents a source, creates a protocol, chooses parameter values, or
 * claims a discovery. A human scientist must independently review and
 * preregister any follow-up hypothesis.
 */

import { canonicalJson, fnv1a } from '../events/hash';
import type { DiscoveryAnalysis, DiscoveryFinding } from './discovery';
import type { HypothesisKnowledgeReference, ScientificEvidenceChain } from './scientificDiscovery';

export const SCIENTIFIC_HYPOTHESIS_CANDIDATE_VERSION = '1.0.0';

export type HypothesisCandidateStatus =
  | 'CANDIDATE_READY'
  | 'BLOCKED_NO_REVIEWABLE_FINDING'
  | 'BLOCKED_INCOMPATIBLE_EVIDENCE'
  | 'BLOCKED_UNREPRODUCIBLE_EVIDENCE';

export interface ScientificHypothesisCandidate {
  contractVersion: string;
  candidateId: string;
  status: HypothesisCandidateStatus;
  /** The existing, real Evidence Chain on which this candidate is based. */
  evidenceId: string;
  evidenceProvenanceFingerprint: string;
  modelId: string;
  domainId: string;
  parameterKey: string;
  outputKey: string;
  observation?: {
    kind: DiscoveryFinding['kind'];
    pearsonR: number;
    runIds: readonly string[];
    runFingerprints: readonly string[];
  };
  /** Present only when status is CANDIDATE_READY; strictly model-bounded. */
  candidateStatement?: string;
  knowledgeReferences: readonly HypothesisKnowledgeReference[];
  requiredNextStep: string;
  selectionFingerprint: string;
  disclaimer: string;
}

function result(
  analysis: DiscoveryAnalysis,
  evidence: ScientificEvidenceChain,
  status: HypothesisCandidateStatus,
  requiredNextStep: string,
  finding?: DiscoveryFinding,
): ScientificHypothesisCandidate {
  const knownRuns = new Map(evidence.allRuns.map((run) => [run.runId, run]));
  const runIds = finding?.runIds ?? [];
  const linkedRuns = runIds.map((runId) => knownRuns.get(runId)).filter((run): run is NonNullable<typeof run> => run !== undefined);
  const pearsonR = finding?.evidence.pearsonR;
  const canFormStatement = status === 'CANDIDATE_READY' && typeof pearsonR === 'number' && Number.isFinite(pearsonR);
  const direction = typeof pearsonR === 'number' && pearsonR < 0 ? 'ujemną' : 'dodatnią';
  const candidateStatement = !canFormStatement ? undefined : [
    `W granicach modelu '${evidence.design.hypothesis.modelId}' oraz istniejącej prerejestrowanej serii runów zaobserwowano ${direction} korelację`,
    `między '${analysis.parameterKey}' a '${analysis.outputKey}' (r=${pearsonR.toFixed(3)}).`,
    'Jest to kandydat do niezależnej prerejestrowanej replikacji i review, nie twierdzenie przyczynowe ani odkrycie.',
  ].join(' ');
  const selectionFingerprint = `hyp_candidate_${fnv1a(canonicalJson({
    version: SCIENTIFIC_HYPOTHESIS_CANDIDATE_VERSION,
    evidence: evidence.provenanceFingerprint,
    analysis: {
      modelId: analysis.modelId,
      parameterKey: analysis.parameterKey,
      outputKey: analysis.outputKey,
      finding: finding === undefined ? null : { kind: finding.kind, evidence: finding.evidence, runIds: finding.runIds },
    },
    status,
  }))}`;
  return {
    contractVersion: SCIENTIFIC_HYPOTHESIS_CANDIDATE_VERSION,
    candidateId: selectionFingerprint,
    status,
    evidenceId: evidence.evidenceId,
    evidenceProvenanceFingerprint: evidence.provenanceFingerprint,
    modelId: evidence.design.hypothesis.modelId,
    domainId: evidence.design.hypothesis.domainId,
    parameterKey: analysis.parameterKey,
    outputKey: analysis.outputKey,
    ...(finding === undefined || typeof pearsonR !== 'number' ? {} : {
      observation: {
        kind: finding.kind,
        pearsonR,
        runIds,
        runFingerprints: linkedRuns.map((run) => run.provenance.runFingerprint),
      },
    }),
    ...(candidateStatement === undefined ? {} : { candidateStatement }),
    knowledgeReferences: evidence.design.hypothesis.knowledgeReferences,
    requiredNextStep,
    selectionFingerprint,
    disclaimer: 'Kandydat jest deterministyczną projekcją istniejącej obserwacji z realnych runów. Nie uruchamia eksperymentu, nie tworzy nowej hipotezy formalnej, nie wskazuje przyczynowości i wymaga niezależnego scientific review oraz prerejestracji przed follow-up execution.',
  };
}

/**
 * Forms a candidate only from a reviewable, source-bound observed correlation
 * that exactly matches a reproducible real Evidence Chain.
 */
export function formulateScientificHypothesisCandidate(
  analysis: DiscoveryAnalysis,
  evidence: ScientificEvidenceChain,
): ScientificHypothesisCandidate {
  if (
    evidence.createdFromRealRunsOnly !== true
    || analysis.modelId !== evidence.design.hypothesis.modelId
    || analysis.outputKey !== evidence.design.primaryMetric
  ) {
    return result(
      analysis,
      evidence,
      'BLOCKED_INCOMPATIBLE_EVIDENCE',
      'Dopasuj analizę do tego samego modelu i primary metric w realnym Evidence Chain przed formułowaniem kandydata.',
    );
  }
  if (evidence.arms.some((arm) => arm.reproduction !== 'MATCH')) {
    return result(
      analysis,
      evidence,
      'BLOCKED_UNREPRODUCIBLE_EVIDENCE',
      'Wyjaśnij drift lub wykonaj brakujące powtórzenia; bez zgodnych arms Genesis nie formułuje kandydata hipotezy.',
    );
  }
  const finding = analysis.findings.find((entry) => entry.kind === 'observed-correlation' && entry.verdict === 'REQUIRES_SCIENTIFIC_REVIEW');
  if (!finding || typeof finding.evidence.pearsonR !== 'number' || finding.runIds.length < 3 || finding.runIds.some((runId) => !evidence.allRuns.some((run) => run.runId === runId))) {
    return result(
      analysis,
      evidence,
      'BLOCKED_NO_REVIEWABLE_FINDING',
      'Brak audytowalnej obserwacji korelacji z co najmniej trzema runami tego Evidence Chain; Genesis nie formułuje kandydata.',
    );
  }
  return result(
    analysis,
    evidence,
    'CANDIDATE_READY',
    'Niezależny naukowy review musi ocenić założenia, source-bound limitations i potencjalne confounders; dopiero potem człowiek prerejestruje osobny follow-up protocol.',
    finding,
  );
}

/** Deterministic replay: identical analysis and evidence return the same candidate fingerprint. */
export function replayScientificHypothesisCandidate(
  analysis: DiscoveryAnalysis,
  evidence: ScientificEvidenceChain,
): ScientificHypothesisCandidate {
  return formulateScientificHypothesisCandidate(analysis, evidence);
}
