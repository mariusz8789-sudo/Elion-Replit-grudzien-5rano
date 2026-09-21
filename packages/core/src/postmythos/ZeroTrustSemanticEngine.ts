/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../knowledge/EvidenceLedger.js';
export type AssertionKind = 'INTERVAL' | 'EXCLUSION' | 'EQUALITY';
export interface Assertion { readonly id: string; readonly kind: AssertionKind; readonly subject: string; readonly metric: string; readonly lo?: number; readonly hi?: number; readonly other?: string; readonly value?: number; readonly provenanceHash: string; }
export type Verdict = 'ACCEPT' | 'ISOLATE';
export interface CheckResult { readonly verdict: Verdict; readonly assertionId: string; readonly proofTrace: readonly string[]; readonly rule: string; readonly anomalyId: string | null; }
/** Zero-Trust Semantic Engine: decidable consistency fragment (interval overlap, mutual exclusion, equality clash).
 *  Bounded formal checker with explicit proof traces — NOT a full FOL theorem prover (honest scope). */
export class ZeroTrustSemanticEngine {
  private store: Assertion[] = [];
  private anomalies: CheckResult[] = [];
  private seq = 0;
  accept(axiom: Omit<Assertion, 'id'>): Assertion { const a: Assertion = { ...axiom, id: 'AX-' + (++this.seq).toString(36).toUpperCase() }; this.store.push(a); return a; }
  check(incoming: Omit<Assertion, 'id'>): CheckResult {
    const id = 'IN-' + sha256hex(stableStringify(incoming)).slice(0, 10).toUpperCase();
    const trace: string[] = []; let rule = 'NO_CONFLICT';
    for (const a of this.store) {
      if (a.subject !== incoming.subject || a.metric !== incoming.metric) continue;
      if (a.kind === 'INTERVAL' && incoming.kind === 'INTERVAL' && a.lo !== undefined && a.hi !== undefined && incoming.lo !== undefined && incoming.hi !== undefined) {
        if (incoming.lo > a.hi || incoming.hi < a.lo) { trace.push(a.id + ':INTERVAL_DISJOINT'); rule = 'INTERVAL_CONTRADICTION'; }
      }
      if (a.kind === 'EXCLUSION' && incoming.kind === 'EXCLUSION' && a.other && incoming.other && a.other === incoming.other && a.subject === incoming.subject) { trace.push(a.id + ':DOUBLE_EXCLUSION'); rule = 'EXCLUSION_VIOLATION'; }
      if (a.kind === 'EQUALITY' && incoming.kind === 'EQUALITY' && a.value !== undefined && incoming.value !== undefined && Math.abs(a.value - incoming.value) > 1e-9) { trace.push(a.id + ':EQUALITY_CLASH'); rule = 'EQUALITY_CONTRADICTION'; }
    }
    if (trace.length > 0) {
      const res: CheckResult = { verdict: 'ISOLATE', assertionId: id, proofTrace: trace, rule, anomalyId: 'AN-' + sha256hex(stableStringify({ id, trace })).slice(0, 10).toUpperCase() };
      this.anomalies.push(res);
      return res;
    }
    this.store.push({ ...incoming, id });
    return { verdict: 'ACCEPT', assertionId: id, proofTrace: [], rule, anomalyId: null };
  }
  getAnomalies(): readonly CheckResult[] { return this.anomalies; }
  getStore(): readonly Assertion[] { return this.store; }
}
