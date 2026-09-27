/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger } from './EvidenceLedger.js';
import { sha256hex, stableStringify } from './EvidenceLedger.js';
import { LaypersonAssistant } from './LaypersonAssistant.js';
import { huntContradictions, type Contradiction } from './contradictionHunter.js';
import { generateCuriosityQuestions, type CuriosityQuestion } from './curiosity.js';
import type { ClaimStatus, EvidenceRecord, LaypersonAnswer } from './evidenceTypes.js';

/**
 * TRUTH RESPONSE — the delivered pack's answer shape (status, evidence,
 * uncertainty, contradictions, missing evidence, next tests, provenance)
 * composed from the canonical pieces: LaypersonAssistant (the answer and
 * its sources, "Nie wiem" when nothing matches), contradictionHunter (what
 * disagrees), curiosity (what is missing and what to test next). Nothing
 * is answered from this module's own words; a boundary question with no
 * evidence in the ledger is INSUFFICIENT_EVIDENCE — never a hypothesis
 * dressed up as an answer.
 */

export type TruthStatus = 'VERIFIED_SOURCE' | 'CANDIDATE' | 'UNVERIFIED' | 'REJECTED' | 'INSUFFICIENT_EVIDENCE' | 'ROLE_REFUSED';

export interface TruthResponse {
  readonly question: string;
  readonly status: TruthStatus;
  readonly answer: string;
  readonly confidenceLevel: LaypersonAnswer['confidenceLevel'];
  readonly evidence: readonly { readonly url: string; readonly status: ClaimStatus; readonly sourceKind: string }[];
  readonly contradictions: readonly Contradiction[];
  readonly missingEvidence: readonly string[];
  readonly nextTests: readonly CuriosityQuestion[];
  readonly provenanceIds: readonly string[];
  readonly disclaimer: string;
  readonly fingerprint: string;
}

function statusOf(a: LaypersonAnswer): TruthStatus {
  if (a.roleRefusal) return 'ROLE_REFUSED';
  if (a.saidIdontKnow || !a.sources.length) return 'INSUFFICIENT_EVIDENCE';
  const statuses = a.sources.map((s) => s.status);
  if (statuses.includes('verified')) return 'VERIFIED_SOURCE';
  if (statuses.includes('candidate')) return 'CANDIDATE';
  if (statuses.includes('unverified')) return 'UNVERIFIED';
  return 'REJECTED';
}

function tokens(text: string): string[] { return text.toLowerCase().split(/[^a-z0-9ąćęłńóśźż]+/i).filter((w) => w.length > 3); }

/** Records whose claim shares content words with the question — the same matching discipline the assistant uses, exposed for provenance. */
export function relatedRecords(records: readonly EvidenceRecord[], question: string): readonly EvidenceRecord[] {
  const q = tokens(question);
  if (!q.length) return [];
  return records.filter((r) => { const c = r.claim.toLowerCase(); return q.some((w) => c.includes(w)); });
}

export function buildTruthResponse(ledger: EvidenceLedger, question: string): TruthResponse {
  const answer = new LaypersonAssistant(ledger).answer(question);
  const active = ledger.getActive();
  const related = relatedRecords(active, question);
  const relatedIds = new Set(related.map((r) => r.id));
  const contradictions = huntContradictions(active).contradictions.filter((c) => c.recordIds.some((id) => relatedIds.has(id)));
  const curiosity = generateCuriosityQuestions(related, { limit: 6 });
  const status = statusOf(answer);
  const missingEvidence: string[] = [];
  if (status === 'INSUFFICIENT_EVIDENCE') missingEvidence.push('brak zapisów w bazie dowodów pasujących do pytania — potrzebne źródło pierwotne lub obserwacja');
  if (status === 'CANDIDATE' || status === 'UNVERIFIED') missingEvidence.push('brak niezależnego, zweryfikowanego źródła — status pozostaje kandydacki');
  if (contradictions.length) missingEvidence.push(`${contradictions.length} nierozstrzygnięte sprzeczności między źródłami`);
  const provenanceIds = related.map((r) => r.id).sort();
  const response = { question, status, answer: answer.answer, confidenceLevel: answer.confidenceLevel, evidence: answer.sources.map((s) => ({ url: s.url, status: s.status, sourceKind: s.sourceKind })), contradictions, missingEvidence, nextTests: curiosity.questions, provenanceIds, disclaimer: answer.disclaimer };
  return { ...response, fingerprint: sha256hex(stableStringify({ question, status, provenanceIds, contradictions: contradictions.map((c) => c.contradictionId), nextTests: curiosity.questions.map((q) => q.questionId) })) };
}

/** Plain-text rendering for a chat turn (Polish), every section present even when empty — silence is never implied consent. */
export function renderTruthResponsePl(r: TruthResponse): string {
  const lines = [
    r.answer,
    `Status: ${r.status} · pewność: ${r.confidenceLevel}`,
    r.evidence.length ? `Dowody:\n${r.evidence.map((e) => `• ${e.url} — ${e.status} (${e.sourceKind})`).join('\n')}` : 'Dowody: brak zapisów.',
    r.contradictions.length ? `Sprzeczności (${r.contradictions.length}):\n${r.contradictions.slice(0, 4).map((c) => `• ${c.reason}`).join('\n')}` : 'Sprzeczności: nie wykryto.',
    r.missingEvidence.length ? `Brakujące dowody:\n${r.missingEvidence.map((m) => `• ${m}`).join('\n')}` : 'Brakujące dowody: nie zidentyfikowano.',
    r.nextTests.length ? `Następne testy:\n${r.nextTests.slice(0, 4).map((q) => `• ${q.text}`).join('\n')}` : 'Następne testy: brak pytań wyprowadzonych z bazy.',
    `Pochodzenie: ${r.provenanceIds.length ? r.provenanceIds.join(', ') : 'brak'} · odcisk ${r.fingerprint.slice(0, 12)}`,
    r.disclaimer,
  ];
  return lines.join('\n');
}
