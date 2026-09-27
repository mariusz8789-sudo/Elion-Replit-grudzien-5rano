/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceRecord } from './evidenceTypes.js';
import { sha256hex, stableStringify } from './EvidenceLedger.js';
import { huntContradictions, type Contradiction, type ContradictionReport } from './contradictionHunter.js';

/**
 * CURIOSITY — questions Genesis asks ITSELF, derived from gaps in the ledger,
 * never invented. Every question cites the records that raise it and carries
 * INSUFFICIENT_EVIDENCE until an experiment or a source answers it. Ranking
 * is the codebase's lexicographic discipline (kind order, then oldest
 * evidence first, then id) — no scoring.
 *
 *  RESOLVE_CONTRADICTION   two sources disagree (contradictionHunter).
 *  INDEPENDENT_CONFIRMATION a candidate/unverified claim rests on one host.
 *  MODEL_TO_OBSERVATION     a numeric key exists only as a model output —
 *                           nothing observed has ever been recorded for it.
 */

export type CuriosityKind = 'RESOLVE_CONTRADICTION' | 'INDEPENDENT_CONFIRMATION' | 'MODEL_TO_OBSERVATION';

export interface CuriosityQuestion {
  readonly questionId: string;
  readonly kind: CuriosityKind;
  readonly text: string;
  readonly subjectKeys: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
  readonly epistemicStatus: 'INSUFFICIENT_EVIDENCE';
}

export interface CuriosityReport {
  readonly questions: readonly CuriosityQuestion[];
  readonly contradictions: ContradictionReport;
  readonly fingerprint: string;
}

const KIND_ORDER: readonly CuriosityKind[] = ['RESOLVE_CONTRADICTION', 'INDEPENDENT_CONFIRMATION', 'MODEL_TO_OBSERVATION'];
const NUMERIC_TOKEN = /\b([a-zA-Z_][\w.]*)\s*[=:]\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)\b/g;
const IGNORED_KEYS = new Set(['seed', 'seedBase', 'logicalTime', 'requestedAtLogicalTime', 'index', 'id']);

function hostOf(url: string): string { const m = url.match(/^[a-z]+:\/\/([^/?#]+)/i); return m ? m[1].toLowerCase() : url; }
function keysOf(r: EvidenceRecord): string[] { const out: string[] = []; for (const m of r.claim.replace(/provenance=\{.*$/, '').matchAll(NUMERIC_TOKEN)) if (!IGNORED_KEYS.has(m[1]) && !out.includes(m[1])) out.push(m[1]); return out; }
function qid(kind: CuriosityKind, ids: readonly string[], key: string | null): string { return `q-${sha256hex(stableStringify({ kind, ids, key })).slice(0, 12)}`; }
function shortClaim(r: EvidenceRecord): string { const c = r.claim.replace(/provenance=\{.*$/, '').trim(); return c.length > 90 ? `${c.slice(0, 87)}…` : c; }

function fromContradiction(c: Contradiction): CuriosityQuestion {
  const text = c.kind === 'NUMERIC_DISAGREEMENT'
    ? `Która wartość ${c.key} jest prawdziwa: ${c.values?.[0]} (${c.sources[0]}) czy ${c.values?.[1]} (${c.sources[1]})? Jaki eksperyment lub niezależne źródło rozstrzyga?`
    : c.kind === 'POLARITY_CONFLICT'
      ? `Źródła ${c.sources[0]} i ${c.sources[1]} twierdzą przeciwnie. Które twierdzenie wytrzymuje próbę falsyfikacji?`
      : `To samo twierdzenie jest odrzucone w jednym zapisie i nieodrzucone w innym — na jakiej podstawie?`;
  return { questionId: qid('RESOLVE_CONTRADICTION', c.recordIds, c.key ?? null), kind: 'RESOLVE_CONTRADICTION', text, subjectKeys: c.key ? [c.key] : [], evidenceIds: c.recordIds, rationale: c.reason, epistemicStatus: 'INSUFFICIENT_EVIDENCE' };
}

export function generateCuriosityQuestions(records: readonly EvidenceRecord[], opts: { readonly limit?: number } = {}): CuriosityReport {
  const contradictions = huntContradictions(records);
  const questions: CuriosityQuestion[] = contradictions.contradictions.map(fromContradiction);
  const byClaim = new Map<string, EvidenceRecord[]>();
  for (const r of records) { const list = byClaim.get(r.claim) ?? []; list.push(r); byClaim.set(r.claim, list); }
  // Single-host candidate / unverified claims.
  for (const [claim, list] of byClaim) {
    const hosts = new Set(list.map((r) => hostOf(r.sourceUrl)));
    const weakest = [...list].sort((a, b) => a.retrievedAt - b.retrievedAt || (a.id < b.id ? -1 : 1))[0];
    if (hosts.size === 1 && (weakest.status === 'candidate' || weakest.status === 'unverified') && weakest.claimType !== 'model') {
      questions.push({ questionId: qid('INDEPENDENT_CONFIRMATION', [weakest.id], null), kind: 'INDEPENDENT_CONFIRMATION', text: `Czy niezależne źródło (inne niż ${[...hosts][0]}) potwierdza: „${shortClaim(weakest)}”?`, subjectKeys: keysOf(weakest), evidenceIds: list.map((r) => r.id), rationale: `status ${weakest.status}; one host (${[...hosts][0]}); claim=${claim.slice(0, 40)}`, epistemicStatus: 'INSUFFICIENT_EVIDENCE' });
    }
  }
  // Numeric keys that exist only as model outputs.
  const observedKeys = new Set<string>(); const modelKeys = new Map<string, EvidenceRecord[]>();
  for (const r of records) for (const k of keysOf(r)) { if (r.claimType === 'observation') observedKeys.add(k); else if (r.claimType === 'model') { const l = modelKeys.get(k) ?? []; l.push(r); modelKeys.set(k, l); } }
  for (const [key, list] of [...modelKeys.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (observedKeys.has(key)) continue;
    const first = [...list].sort((a, b) => a.retrievedAt - b.retrievedAt || (a.id < b.id ? -1 : 1))[0];
    questions.push({ questionId: qid('MODEL_TO_OBSERVATION', [first.id], key), kind: 'MODEL_TO_OBSERVATION', text: `${key} istnieje tylko jako wynik modelu (${list.length} ${list.length === 1 ? 'zapis' : 'zapisy'}). Jaka obserwacja mogłaby go potwierdzić lub obalić?`, subjectKeys: [key], evidenceIds: list.map((r) => r.id).sort(), rationale: `no observation record carries ${key}`, epistemicStatus: 'INSUFFICIENT_EVIDENCE' });
  }
  questions.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.questionId < b.questionId ? -1 : 1));
  const limited = questions.slice(0, opts.limit ?? 24);
  return { questions: limited, contradictions, fingerprint: sha256hex(stableStringify(limited.map((q) => q.questionId))) };
}

/** Cognitive-core proposals (kind GOAL, source RULE): the proposal gate validates them like any other proposer's output. */
export function curiosityGoalProposals(report: CuriosityReport): readonly { readonly kind: 'GOAL'; readonly payload: { readonly id: string; readonly description: string; readonly priority: 'HIGH' | 'MEDIUM' | 'LOW'; readonly targetEntityIds: readonly string[] }; readonly source: 'RULE'; readonly epistemicStatus: 'INSUFFICIENT_EVIDENCE' }[] {
  return report.questions.map((q) => ({ kind: 'GOAL' as const, payload: { id: `goal:${q.questionId}`, description: q.text, priority: q.kind === 'RESOLVE_CONTRADICTION' ? 'HIGH' as const : q.kind === 'INDEPENDENT_CONFIRMATION' ? 'MEDIUM' as const : 'LOW' as const, targetEntityIds: q.evidenceIds }, source: 'RULE' as const, epistemicStatus: 'INSUFFICIENT_EVIDENCE' as const }));
}
