/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceRecord } from './evidenceTypes.js';
import { sha256hex, stableStringify } from './EvidenceLedger.js';

/**
 * CONTRADICTION HUNTER — a pure scan over active ledger records for claims
 * that cannot all be right. It never decides which side is right and never
 * touches a status: a contradiction is a reportable OBJECT (both record ids,
 * the key, the values, the reason) that downstream gates consume as
 * `unresolvedContradictions` (practicalCandidateGate) and the curiosity
 * layer turns into questions. Three detectors, all deterministic:
 *
 *  1. NUMERIC_DISAGREEMENT — the same `key=value` token (r0=2.5, peakDay=41,
 *     aPm=564) reported with different values by different sources.
 *  2. POLARITY_CONFLICT — two claims sharing most content words where exactly
 *     one carries a negation marker (not / no / nie / brak / never / żaden).
 *  3. STATUS_CONFLICT — the same claim text carried by one `rejected` and one
 *     non-rejected record.
 */

export type ContradictionKind = 'NUMERIC_DISAGREEMENT' | 'POLARITY_CONFLICT' | 'STATUS_CONFLICT';
export type ContradictionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Contradiction {
  readonly contradictionId: string;
  readonly kind: ContradictionKind;
  readonly recordIds: readonly [string, string];
  readonly sources: readonly [string, string];
  readonly key?: string;
  readonly values?: readonly [number, number];
  readonly relativeDifference?: number;
  readonly severity: ContradictionSeverity;
  readonly reason: string;
  /** Always true: the hunter reports, it never resolves. */
  readonly unresolved: true;
}

export interface ContradictionReport {
  readonly scanned: number;
  readonly contradictions: readonly Contradiction[];
  readonly fingerprint: string;
}

const NUMERIC_TOKEN = /\b([a-zA-Z_][\w.]*)\s*[=:]\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)\b/g;
const NEGATION = /(^|\s)(not|no|never|nie|brak|żaden|zaden|nigdy)(\s|$)/i;
const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'is', 'are', 'and', 'or', 'to', 'for', 'with', 'i', 'w', 'z', 'na', 'do', 'że', 'ze', 'jest', 'są', 'sa', 'not', 'no', 'never', 'nie', 'brak', 'żaden', 'zaden', 'nigdy']);
const IGNORED_KEYS = new Set(['seed', 'seedBase', 'logicalTime', 'requestedAtLogicalTime', 'index', 'id']);

function hostOf(url: string): string { const m = url.match(/^[a-z]+:\/\/([^/?#]+)/i); return m ? m[1].toLowerCase() : url; }
function contentWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/provenance=\{.*$/, '').split(/[^a-z0-9ąćęłńóśźż.]+/i).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d/.test(w)));
}
function numericClaims(record: EvidenceRecord): Map<string, number> {
  const out = new Map<string, number>();
  const body = record.claim.replace(/provenance=\{.*$/, '');
  for (const m of body.matchAll(NUMERIC_TOKEN)) { const key = m[1]; if (IGNORED_KEYS.has(key)) continue; const v = Number(m[2]); if (Number.isFinite(v) && !out.has(key)) out.set(key, v); }
  return out;
}
function severityOf(rel: number): ContradictionSeverity { return rel > 0.2 ? 'HIGH' : rel > 0.05 ? 'MEDIUM' : 'LOW'; }
function idOf(kind: ContradictionKind, a: string, b: string, key?: string): string { return `ctr-${sha256hex(stableStringify({ kind, a, b, key: key ?? null })).slice(0, 12)}`; }

export function huntContradictions(records: readonly EvidenceRecord[]): ContradictionReport {
  const active = [...records].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const found: Contradiction[] = [];
  const seen = new Set<string>();
  const push = (c: Contradiction): void => { if (!seen.has(c.contradictionId)) { seen.add(c.contradictionId); found.push(c); } };
  const numerics = active.map((r) => ({ r, nums: numericClaims(r), words: contentWords(r.claim), negated: NEGATION.test(r.claim.replace(/provenance=\{.*$/, '')) }));
  for (let i = 0; i < numerics.length; i++) {
    for (let j = i + 1; j < numerics.length; j++) {
      const A = numerics[i]; const B = numerics[j];
      if (hostOf(A.r.sourceUrl) === hostOf(B.r.sourceUrl)) continue; // one source disagreeing with itself is a self-inconsistency, not a cross-source contradiction
      // 1. numeric disagreement on a shared key
      for (const [key, va] of A.nums) {
        const vb = B.nums.get(key);
        if (vb === undefined || va === vb) continue;
        const rel = Math.abs(va - vb) / Math.max(Math.abs(va), Math.abs(vb), 1e-12);
        push({ contradictionId: idOf('NUMERIC_DISAGREEMENT', A.r.id, B.r.id, key), kind: 'NUMERIC_DISAGREEMENT', recordIds: [A.r.id, B.r.id], sources: [hostOf(A.r.sourceUrl), hostOf(B.r.sourceUrl)], key, values: [va, vb], relativeDifference: +rel.toFixed(6), severity: severityOf(rel), reason: `${key} reported as ${va} by ${hostOf(A.r.sourceUrl)} and ${vb} by ${hostOf(B.r.sourceUrl)}`, unresolved: true });
      }
      // 2. polarity conflict on near-identical wording
      if (A.negated !== B.negated && A.words.size >= 4 && B.words.size >= 4) {
        let shared = 0; for (const w of A.words) if (B.words.has(w)) shared++;
        const overlap = shared / Math.min(A.words.size, B.words.size);
        if (overlap >= 0.75) push({ contradictionId: idOf('POLARITY_CONFLICT', A.r.id, B.r.id), kind: 'POLARITY_CONFLICT', recordIds: [A.r.id, B.r.id], sources: [hostOf(A.r.sourceUrl), hostOf(B.r.sourceUrl)], severity: 'HIGH', reason: `one source affirms and the other negates the same statement (${Math.round(overlap * 100)}% shared content words)`, unresolved: true });
      }
      // 3. status conflict on the same claim text
      if (A.r.claim === B.r.claim && (A.r.status === 'rejected') !== (B.r.status === 'rejected')) {
        push({ contradictionId: idOf('STATUS_CONFLICT', A.r.id, B.r.id), kind: 'STATUS_CONFLICT', recordIds: [A.r.id, B.r.id], sources: [hostOf(A.r.sourceUrl), hostOf(B.r.sourceUrl)], severity: 'MEDIUM', reason: `the same claim is ${A.r.status} in one record and ${B.r.status} in another`, unresolved: true });
      }
    }
  }
  found.sort((a, b) => (a.contradictionId < b.contradictionId ? -1 : 1));
  return { scanned: active.length, contradictions: found, fingerprint: sha256hex(stableStringify(found.map((c) => c.contradictionId))) };
}

/** The labels practicalCandidateGate expects in `unresolvedContradictions`. */
export function unresolvedContradictionLabels(report: ContradictionReport): readonly string[] {
  return report.contradictions.map((c) => `${c.kind}:${c.key ?? c.recordIds.join('/')}:${c.severity}`);
}
