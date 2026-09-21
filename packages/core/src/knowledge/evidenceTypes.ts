/* Proprietary / All Rights Reserved - Genesis OS */
export interface Clock { now(): number; }
export type ClaimType = 'observation' | 'reported_claim' | 'hypothesis' | 'model' | 'conclusion';
export type ClaimStatus = 'unverified' | 'candidate' | 'verified' | 'rejected';
export type SourceKind = 'video' | 'document' | 'peer_reviewed' | 'archive' | 'dataset' | 'web';
export interface ProvenanceInfo { readonly sourceKind: SourceKind; readonly author?: string; readonly retrievedBy: string; readonly independentSourceIds: readonly string[]; }
export interface EvidenceRecord {
  readonly id: string; readonly sourceUrl: string; readonly sourceTimestamp: string | null;
  readonly claim: string; readonly claimType: ClaimType; readonly confidence: number; readonly status: ClaimStatus;
  readonly retrievedAt: number; readonly contentHash: string; readonly provenance: ProvenanceInfo; readonly disclaimer: string;
}
export interface LedgerEntry { readonly index: number; readonly kind: 'ADD' | 'PROPOSE' | 'PUBLISH' | 'REJECT'; readonly recordId: string; readonly contentHash: string; readonly prevHash: string; readonly hash: string; readonly at: number; }
export interface Proposal { readonly proposalId: string; readonly record: EvidenceRecord; readonly status: 'pending' | 'approved' | 'discarded'; readonly approverId: string | null; }
export interface LaypersonSource { readonly url: string; readonly sourceKind: SourceKind; readonly status: ClaimStatus; }
export interface LaypersonAnswer {
  readonly answer: string; readonly confidenceLevel: 'high' | 'medium' | 'low' | 'none';
  readonly sources: readonly LaypersonSource[]; readonly disclaimer: string;
  readonly clarifyingQuestions: readonly string[]; readonly saidIdontKnow: boolean; readonly roleRefusal: boolean;
}
export const KNOWLEDGE_DISCLAIMER = 'To jest pomoc edukacyjna, nie porada medyczna, prawna, finansowa ani inżynierska. Twierdzenia z filmów i narracji traktujemy jako hipotezy do weryfikacji, nie jako fakty.';
