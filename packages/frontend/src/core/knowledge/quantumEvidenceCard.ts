import {
  getSupplementalKnowledge,
  type KnowledgeEpistemicStatus,
  type SupplementalKnowledgeRecord,
} from './supplementalRegistry';

export const QUANTUM_EVIDENCE_CARD_VERSION = '1.0.0';

export type QuantumEvidenceCardStatus =
  | 'PEER_REVIEWED_MEASUREMENT'
  | 'CLAIM_UNDER_REVIEW'
  | 'FICTIONAL_REFERENCE';

export interface QuantumEvidenceCardEntry {
  knowledgeId: string;
  title: string;
  status: QuantumEvidenceCardStatus;
  epistemicStatus: KnowledgeEpistemicStatus;
  statement: string;
  source: SupplementalKnowledgeRecord['source'];
  limitation: string;
  runnableModelIds: readonly string[];
  requiredSolver: string;
}

export interface QuantumEvidenceCard {
  contractVersion: string;
  topic: 'majorana-1-topological-qubit';
  entries: readonly QuantumEvidenceCardEntry[];
  disclaimer: string;
}

const CARD_RECORDS: readonly { knowledgeId: string; status: QuantumEvidenceCardStatus }[] = [
  { knowledgeId: 'majorana-1-parity-measurement', status: 'PEER_REVIEWED_MEASUREMENT' },
  { knowledgeId: 'majorana-1-topological-qubit-claim', status: 'CLAIM_UNDER_REVIEW' },
  { knowledgeId: 'majorana-film-time-travel-reference', status: 'FICTIONAL_REFERENCE' },
] as const;

function toEntry(
  record: SupplementalKnowledgeRecord,
  status: QuantumEvidenceCardStatus,
): QuantumEvidenceCardEntry {
  return {
    knowledgeId: record.id,
    title: record.title,
    status,
    epistemicStatus: record.epistemicStatus,
    statement: record.statement,
    source: record.source,
    limitation: record.limitation,
    runnableModelIds: record.realModelIds,
    requiredSolver: record.requiredSolver,
  };
}

/**
 * A read-only evidence card. It is intentionally unavailable unless every
 * source-bound record is registered, preventing a partial card from changing
 * the meaning of a scientific claim.
 */
export function createMajorana1QuantumEvidenceCard(): QuantumEvidenceCard | undefined {
  const entries = CARD_RECORDS.map(({ knowledgeId, status }) => {
    const record = getSupplementalKnowledge(knowledgeId);
    return record ? toEntry(record, status) : undefined;
  });
  if (entries.some((entry) => entry === undefined)) return undefined;

  return {
    contractVersion: QUANTUM_EVIDENCE_CARD_VERSION,
    topic: 'majorana-1-topological-qubit',
    entries: entries as readonly QuantumEvidenceCardEntry[],
    disclaimer: 'Karta rozdziela recenzowany pomiar, claim wymagający dalszej weryfikacji oraz fikcyjną analogię. Nie jest wynikiem solvera ani dowodem, że Genesis symuluje urządzenie Majorana 1.',
  };
}

/** Returns the card only when canonical router knowledge has selected a Majorana-related record. */
export function quantumEvidenceCardsForKnowledge(
  knowledgeIds: readonly string[],
): readonly QuantumEvidenceCard[] {
  const relevant = CARD_RECORDS.some(({ knowledgeId }) => knowledgeIds.includes(knowledgeId));
  const card = relevant ? createMajorana1QuantumEvidenceCard() : undefined;
  return card ? [card] : [];
}
