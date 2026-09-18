/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock } from '../knowledge/evidenceTypes.js';
import { EvidenceLedger, stableStringify, sha256hex, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
export interface TemporalEdge {
  readonly edgeId: string; readonly s: string; readonly p: string; readonly o: string;
  readonly validFrom: number; readonly validTo: number | null; readonly txAt: number;
  readonly provenanceHash: string; readonly edgeHash: string;
}
export interface OperatorActionRequest { readonly requestId: string; readonly actorId: string; readonly action: string; readonly targetId: string; readonly at: number; status: 'PENDING_SECOND_CONTROL' | 'APPROVED' | 'BLOCKED'; readonly secondActorId: string | null; }
/** Mythos Substrate: temporal knowledge graph (valid-time/transaction-time) anchored in EvidenceLedger + dual-control operator audit. */
export class MythosSubstrate {
  private edges: TemporalEdge[] = [];
  private chain: string[] = [];
  private actions = new Map<string, OperatorActionRequest>();
  private seq = 0;
  constructor(private clock: Clock, private ledger: EvidenceLedger) {}
  addEdge(s: string, p: string, o: string, validFrom: number, validTo: number | null, source: NewEvidenceInput): TemporalEdge {
    const rec = this.ledger.addRecord(source).record;
    const txAt = this.clock.now();
    const prev = this.chain.length ? this.chain[this.chain.length - 1] : 'GENESIS';
    const edgeHash = sha256hex(stableStringify({ s, p, o, validFrom, validTo, txAt, provenanceHash: rec.contentHash, prev }));
    this.chain.push(edgeHash);
    const edge: TemporalEdge = { edgeId: 'TE-' + (++this.seq).toString(36).toUpperCase(), s, p, o, validFrom, validTo, txAt, provenanceHash: rec.contentHash, edgeHash };
    this.edges.push(edge);
    return edge;
  }
  edgesAt(time: number): readonly TemporalEdge[] { return this.edges.filter(e => e.validFrom <= time && (e.validTo === null || e.validTo >= time)); }
  verifyChain(): { ok: boolean; errors: readonly string[] } {
    const errors: string[] = []; let prev = 'GENESIS';
    for (const e of this.edges) {
      const expect = sha256hex(stableStringify({ s: e.s, p: e.p, o: e.o, validFrom: e.validFrom, validTo: e.validTo, txAt: e.txAt, provenanceHash: e.provenanceHash, prev }));
      if (expect !== e.edgeHash) errors.push('EDGE_HASH_MISMATCH:' + e.edgeId);
      if (prev !== 'GENESIS' && !this.chain.includes(prev)) errors.push('CHAIN_GAP:' + e.edgeId);
      prev = e.edgeHash;
    }
    return { ok: errors.length === 0, errors };
  }
  requestAction(actorId: string, action: string, targetId: string): OperatorActionRequest {
    const req: OperatorActionRequest = { requestId: 'OA-' + (++this.seq).toString(36).toUpperCase(), actorId, action, targetId, at: this.clock.now(), status: 'PENDING_SECOND_CONTROL', secondActorId: null };
    this.actions.set(req.requestId, req);
    return req;
  }
  approveSecond(requestId: string, secondActorId: string): OperatorActionRequest | null {
    const r = this.actions.get(requestId);
    if (!r || r.status !== 'PENDING_SECOND_CONTROL') return null;
    if (secondActorId === r.actorId) { const blocked: OperatorActionRequest = { ...r, status: 'BLOCKED' }; this.actions.set(requestId, blocked); return blocked; }
    const approved: OperatorActionRequest = { ...r, status: 'APPROVED', secondActorId };
    this.actions.set(requestId, approved);
    return approved;
  }
  getActions(): readonly OperatorActionRequest[] { return [...this.actions.values()]; }
}
