import type { KnowledgeCorpusFile } from '../knowledge/registry';

/**
 * Evidence-first contract for the Aging / Senescence / Cancer Discovery Lab.
 *
 * It intentionally scores the completeness and quality of declared evidence,
 * never biological efficacy, patient benefit, toxicity, or treatment priority.
 */
export const AGING_EVIDENCE_RANKING_VERSION = '1.0.0';

export type AgingEpistemicStatus =
  | 'FACT_PEER_REVIEWED'
  | 'PRECLINICAL'
  | 'CLINICAL_EVIDENCE'
  | 'CORRELATION'
  | 'MECHANISTIC_HYPOTHESIS'
  | 'OPEN_PROBLEM'
  | 'SPECULATIVE'
  | 'NEGATIVE_RESULT';

export type AgingEvidenceDisposition = 'DATA_REQUIRED' | 'EVIDENCE_REVIEW_REQUIRED';

export interface AgingEvidenceSource {
  sourceId: string;
  title: string;
  epistemicStatus: AgingEpistemicStatus;
  /** Stable external identifier, DOI, PMID, registry identifier, or retained ingestion ID. */
  provenanceReference: string;
}

/**
 * All fields are user- or expert-supplied assessments in [0, 1].
 * They express coverage/quality of the evidence record, not a biological property.
 */
export interface AgingCandidateEvidenceInput {
  candidateId: string;
  label: string;
  knowledgeSources: readonly AgingEvidenceSource[];
  evidenceQuality?: number;
  reproducibilityCoverage?: number;
  mechanismCoverage?: number;
  safetyCoverage?: number;
  oncogenicRiskCharacterization?: number;
  dataCoverage?: number;
  declaredLimitations: readonly string[];
}

export interface AgingEvidenceRankingRow {
  candidateId: string;
  label: string;
  disposition: AgingEvidenceDisposition;
  /** 0–100 completeness of the supplied evidence record, never efficacy or benefit. */
  evidenceReadinessScore: number | null;
  missingFields: readonly string[];
  epistemicStatuses: readonly AgingEpistemicStatus[];
  sourceCount: number;
  disclaimer: string;
}

export interface AgingDataRequirement {
  contractVersion: string;
  domainId: 'biology-aging-lab';
  status: 'DATA_REQUIRED';
  requestedModel: string;
  requiredData: readonly string[];
  requiredProvenance: readonly string[];
  limitation: string;
}

const REQUIRED_SCORE_FIELDS = [
  'evidenceQuality',
  'reproducibilityCoverage',
  'mechanismCoverage',
  'safetyCoverage',
  'oncogenicRiskCharacterization',
  'dataCoverage',
] as const;

type EvidenceScoreField = (typeof REQUIRED_SCORE_FIELDS)[number];

const WEIGHTS: Readonly<Record<EvidenceScoreField, number>> = {
  evidenceQuality: 0.25,
  reproducibilityCoverage: 0.20,
  mechanismCoverage: 0.15,
  safetyCoverage: 0.15,
  oncogenicRiskCharacterization: 0.15,
  dataCoverage: 0.10,
};

const DISCLAIMER = 'Wynik porządkuje wyłącznie kompletność i jakość zadeklarowanych dowodów. Nie przewiduje skuteczności biologicznej, nie ocenia ryzyka pacjenta i nie stanowi rekomendacji terapii.';

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function scoreValue(input: AgingCandidateEvidenceInput, field: EvidenceScoreField): number | undefined {
  return input[field];
}

function requiredFieldGaps(input: AgingCandidateEvidenceInput): string[] {
  const missing: string[] = REQUIRED_SCORE_FIELDS.filter((field) => scoreValue(input, field) === undefined);
  if (input.knowledgeSources.length === 0) missing.unshift('knowledgeSources');
  return missing;
}

function validateInput(input: AgingCandidateEvidenceInput): void {
  if (!input.candidateId.trim()) throw new Error('Aging evidence ranking requires candidateId.');
  if (!input.label.trim()) throw new Error('Aging evidence ranking requires a non-empty label.');
  for (const field of REQUIRED_SCORE_FIELDS) {
    const value = scoreValue(input, field);
    if (value !== undefined && !isUnitInterval(value)) {
      throw new Error(`${field} must be a finite number in [0, 1].`);
    }
  }
}

/**
 * Deterministically computes evidence-record completeness. A non-complete record
 * stays DATA_REQUIRED rather than receiving a fabricated biological score.
 */
export function rankAgingEvidenceCandidates(
  candidates: readonly AgingCandidateEvidenceInput[],
): readonly AgingEvidenceRankingRow[] {
  const rows = candidates.map((candidate) => {
    validateInput(candidate);
    const missingFields = requiredFieldGaps(candidate);
    const statuses = [...new Set(candidate.knowledgeSources.map((source) => source.epistemicStatus))].sort();

    if (missingFields.length > 0) {
      return {
        candidateId: candidate.candidateId,
        label: candidate.label,
        disposition: 'DATA_REQUIRED' as const,
        evidenceReadinessScore: null,
        missingFields,
        epistemicStatuses: statuses,
        sourceCount: candidate.knowledgeSources.length,
        disclaimer: `${DISCLAIMER} Brakuje wymaganych danych do audytowalnego porównania.`,
      };
    }

    const weightedCoverage = REQUIRED_SCORE_FIELDS.reduce((total, field) => {
      return total + (scoreValue(candidate, field) as number) * WEIGHTS[field];
    }, 0);

    return {
      candidateId: candidate.candidateId,
      label: candidate.label,
      disposition: 'EVIDENCE_REVIEW_REQUIRED' as const,
      evidenceReadinessScore: Math.round(weightedCoverage * 10000) / 100,
      missingFields: [],
      epistemicStatuses: statuses,
      sourceCount: candidate.knowledgeSources.length,
      disclaimer: `${DISCLAIMER} Każdy kandydat wymaga niezależnego przeglądu eksperckiego oraz zwalidowanego modelu lub danych przed eksperymentem.`,
    };
  });

  return rows.sort((left, right) => {
    const leftScore = left.evidenceReadinessScore ?? -1;
    const rightScore = right.evidenceReadinessScore ?? -1;
    return rightScore - leftScore || left.candidateId.localeCompare(right.candidateId);
  });
}

/** Explicit seam for a future validated biological model; it does not run a simulation. */
export function createAgingModelDataRequirement(requestedModel: string): AgingDataRequirement {
  if (!requestedModel.trim()) throw new Error('requestedModel is required.');
  return {
    contractVersion: AGING_EVIDENCE_RANKING_VERSION,
    domainId: 'biology-aging-lab',
    status: 'DATA_REQUIRED',
    requestedModel,
    requiredData: [
      'model-specific measured input dataset',
      'cell type and experimental context',
      'validated endpoint definitions',
      'baseline and control observations',
      'replication plan',
    ],
    requiredProvenance: [
      'source identifier and license',
      'dataset version and content hash',
      'assay/protocol metadata',
      'quality-control record',
      'privacy status',
      'expert review record',
    ],
    limitation: 'Genesis nie uruchamia modelu biologicznego ani nie tworzy wyniku zastępczego, dopóki nie są dostępne odpowiednie dane i zwalidowany solver.',
  };
}

/** Keeps the source corpus explicit when producing an Aging Lab discovery protocol. */
export const AGING_LAB_KNOWLEDGE_SOURCE: KnowledgeCorpusFile = 'biology-aging-senescence-cancer.md';
