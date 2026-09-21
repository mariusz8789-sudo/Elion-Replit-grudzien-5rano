/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256HexSync } from './sha256.js';
import type { Clock, EvidenceRecord, LedgerEntry, Proposal, ProvenanceInfo, ClaimType } from './evidenceTypes.js';
import { KNOWLEDGE_DISCLAIMER } from './evidenceTypes.js';
import { classifyClaim } from './classifyClaim.js';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
/** SHA-256 hex of a UTF-8 string. Pure, isomorphic (browser + node); bit-identical to node:crypto — see sha256.test.ts. */
export const sha256hex = (t: string): string => sha256HexSync(t);
/** Deterministic PRNG (mulberry32), same as the copies in supreme/ and city-enterprise/; the postmythos engines import it from here. */
export const mulberry32 = (seed: number): (() => number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export interface NewEvidenceInput { readonly sourceUrl: string; readonly sourceTimestamp: string | null; readonly claim: string; readonly claimType: ClaimType; readonly confidence: number; readonly provenance: ProvenanceInfo; }
export interface AddResult { readonly record: EvidenceRecord; readonly deduped: boolean; }
/** The whole ledger as plain JSON: entries verbatim (their hashes fold the original `at`, so a restore reproduces the chain bit for bit), records, proposals, the active order and the version. */
export interface LedgerSnapshot { readonly schema: 'evidence-ledger-snapshot/1'; readonly version: number; readonly entries: readonly LedgerEntry[]; readonly records: readonly EvidenceRecord[]; readonly proposals: readonly Proposal[]; readonly activeIds: readonly string[]; }
export type LedgerAppendListener = (entry: LedgerEntry, ledger: EvidenceLedger) => void;
/** Append-only, hash-chained, versioned evidence ledger with propose-only publication gate. */
export class EvidenceLedger {
  private entries: LedgerEntry[] = [];
  private records = new Map<string, EvidenceRecord>();
  private byHash = new Map<string, EvidenceRecord>();
  private proposals = new Map<string, Proposal>();
  private activeIds: string[] = [];
  private version = 1;
  private listeners = new Set<LedgerAppendListener>();
  constructor(private clock: Clock) {}
  /** Called after every appended entry (the persistence hook). Returns the unsubscribe function. */
  onAppend(listener: LedgerAppendListener): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  toSnapshot(): LedgerSnapshot { return { schema: 'evidence-ledger-snapshot/1', version: this.version, entries: [...this.entries], records: [...this.records.values()], proposals: [...this.proposals.values()], activeIds: [...this.activeIds] }; }
  /** Rebuild from a snapshot. The chain is verified first: a broken or tampered snapshot is refused (thrown `LEDGER_SNAPSHOT_REJECTED: …`), never silently repaired. */
  static fromSnapshot(clock: Clock, snapshot: LedgerSnapshot): EvidenceLedger {
    if (!snapshot || snapshot.schema !== 'evidence-ledger-snapshot/1' || !Array.isArray(snapshot.entries)) throw new Error('LEDGER_SNAPSHOT_REJECTED: SCHEMA');
    const l = new EvidenceLedger(clock);
    l.entries = snapshot.entries.map((e) => Object.freeze({ ...e }));
    const v = l.verifyLedger(); if (!v.ok) throw new Error('LEDGER_SNAPSHOT_REJECTED: ' + v.errors.join(','));
    for (const r of snapshot.records) { l.records.set(r.id, r); l.byHash.set(r.contentHash, r); }
    for (const p of snapshot.proposals) l.proposals.set(p.proposalId, p);
    for (const id of snapshot.activeIds) { if (!l.records.has(id)) throw new Error('LEDGER_SNAPSHOT_REJECTED: ACTIVE_ID_UNKNOWN:' + id); }
    for (const e of l.entries) { if (e.kind === 'ADD' && !l.records.has(e.recordId)) throw new Error('LEDGER_SNAPSHOT_REJECTED: RECORD_MISSING:' + e.recordId); }
    l.activeIds = [...snapshot.activeIds]; l.version = Number.isFinite(snapshot.version) ? snapshot.version : 1;
    return l;
  }
  contentHashOf(i: NewEvidenceInput): string { return sha256hex(stableStringify({ sourceUrl: i.sourceUrl, claim: i.claim, claimType: i.claimType, sourceTimestamp: i.sourceTimestamp, provenance: i.provenance })); }
  private buildRecord(i: NewEvidenceInput, contentHash: string): EvidenceRecord {
    const status = classifyClaim({ claimType: i.claimType, sourceKind: i.provenance.sourceKind, independentSourceIds: i.provenance.independentSourceIds, confidence: i.confidence });
    return { id: 'EV-' + contentHash.slice(0, 12), sourceUrl: i.sourceUrl, sourceTimestamp: i.sourceTimestamp, claim: i.claim, claimType: i.claimType, confidence: i.confidence, status, retrievedAt: this.clock.now(), contentHash, provenance: i.provenance, disclaimer: KNOWLEDGE_DISCLAIMER };
  }
  private append(kind: LedgerEntry['kind'], rec: EvidenceRecord): void {
    const prev = this.entries.length ? this.entries[this.entries.length - 1].hash : 'GENESIS';
    const at = this.clock.now(); const index = this.entries.length;
    const entry = Object.freeze({ index, kind, recordId: rec.id, contentHash: rec.contentHash, prevHash: prev, hash: sha256hex(stableStringify({ index, kind, recordId: rec.id, contentHash: rec.contentHash, prevHash: prev, at })), at });
    this.entries.push(entry);
    for (const fn of this.listeners) fn(entry, this);
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
    this.version += 1; this.append('PUBLISH', p.record); return p.record; // version bumps before the append so a persistence listener snapshots the published state
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
