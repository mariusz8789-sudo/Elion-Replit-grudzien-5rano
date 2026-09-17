/* Proprietary / All Rights Reserved - Genesis OS */
import { createHash } from 'node:crypto';
import type { Clock, EvidenceRecord, LedgerEntry, Proposal, ProvenanceInfo, ClaimType } from './evidenceTypes.js';
import { KNOWLEDGE_DISCLAIMER } from './evidenceTypes.js';
import { classifyClaim } from './classifyClaim.js';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface NewEvidenceInput { readonly sourceUrl: string; readonly sourceTimestamp: string | null; readonly claim: string; readonly claimType: ClaimType; readonly confidence: number; readonly provenance: ProvenanceInfo; }
export interface AddResult { readonly record: EvidenceRecord; readonly deduped: boolean; }
/** Append-only, hash-chained, versioned evidence ledger with propose-only publication gate. */
export class EvidenceLedger {
  private entries: LedgerEntry[] = [];
  private records = new Map<string, EvidenceRecord>();
  private byHash = new Map<string, EvidenceRecord>();
  private proposals = new Map<string, Proposal>();
  private activeIds: string[] = [];
  private version = 1;
  constructor(private clock: Clock) {}
  contentHashOf(i: NewEvidenceInput): string { return sha256hex(stableStringify({ sourceUrl: i.sourceUrl, claim: i.claim, claimType: i.claimType, sourceTimestamp: i.sourceTimestamp, provenance: i.provenance })); }
  private buildRecord(i: NewEvidenceInput, contentHash: string): EvidenceRecord {
    const status = classifyClaim({ claimType: i.claimType, sourceKind: i.provenance.sourceKind, independentSourceIds: i.provenance.independentSourceIds, confidence: i.confidence });
    return { id: 'EV-' + contentHash.slice(0, 12), sourceUrl: i.sourceUrl, sourceTimestamp: i.sourceTimestamp, claim: i.claim, claimType: i.claimType, confidence: i.confidence, status, retrievedAt: this.clock.now(), contentHash, provenance: i.provenance, disclaimer: KNOWLEDGE_DISCLAIMER };
  }
  private append(kind: LedgerEntry['kind'], rec: EvidenceRecord): void {
    const prev = this.entries.length ? this.entries[this.entries.length - 1].hash : 'GENESIS';
    const at = this.clock.now(); const index = this.entries.length;
    this.entries.push(Object.freeze({ index, kind, recordId: rec.id, contentHash: rec.contentHash, prevHash: prev, hash: sha256hex(stableStringify({ index, kind, recordId: rec.id, contentHash: rec.contentHash, prevHash: prev, at })), at }));
  }
  addRecord(i: NewEvidenceInput): AddResult {
    const contentHash = this.contentHashOf(i);
    const existing = this.byHash.get(contentHash);
    if (existing) return { record: existing, deduped: true };
    const rec = this.buildRecord(i, contentHash);
    this.records.set(rec.id, rec); this.byHash.set(contentHash, rec); this.activeIds.push(rec.id);
    this.append('ADD', rec); return { record: rec, deduped: false };
  }
  /** Propose-only: creates a pending proposal; nothing enters the active base until publish(). */
  propose(i: NewEvidenceInput): string {
    const contentHash = this.contentHashOf(i);
    const rec = this.byHash.get(contentHash) ?? this.buildRecord(i, contentHash);
    const proposalId = 'PR-' + sha256hex(stableStringify({ contentHash, at: this.clock.now(), n: this.proposals.size })).slice(0, 12);
    this.proposals.set(proposalId, { proposalId, record: rec, status: 'pending', approverId: null });
    this.append('PROPOSE', rec); return proposalId;
  }
  publish(proposalId: string, approverId: string): EvidenceRecord | null {
    const p = this.proposals.get(proposalId); if (!p || p.status !== 'pending') return null;
    this.proposals.set(proposalId, { ...p, status: 'approved', approverId });
    if (!this.byHash.has(p.record.contentHash)) { this.records.set(p.record.id, p.record); this.byHash.set(p.record.contentHash, p.record); this.activeIds.push(p.record.id); }
    this.append('PUBLISH', p.record); this.version += 1; return p.record;
  }
  rejectProposal(proposalId: string, approverId: string): boolean {
    const p = this.proposals.get(proposalId); if (!p || p.status !== 'pending') return false;
    this.proposals.set(proposalId, { ...p, status: 'discarded', approverId }); this.append('REJECT', p.record); return true;
  }
  getActive(): readonly EvidenceRecord[] { return this.activeIds.map(id => this.records.get(id)!); }
  getVersion(): number { return this.version; }
  getProposals(): readonly Proposal[] { return [...this.proposals.values()]; }
  getEntries(): readonly LedgerEntry[] { return this.entries; }
  verifyLedger(): { ok: boolean; errors: readonly string[] } {
    const errors: string[] = []; let prev = 'GENESIS';
    for (const e of this.entries) { if (e.prevHash !== prev) errors.push('CHAIN_BREAK@' + e.index);
      if (e.hash !== sha256hex(stableStringify({ index: e.index, kind: e.kind, recordId: e.recordId, contentHash: e.contentHash, prevHash: e.prevHash, at: e.at }))) errors.push('HASH_MISMATCH@' + e.index); prev = e.hash; }
    return { ok: errors.length === 0, errors };
  }
}
