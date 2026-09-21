/* Proprietary / All Rights Reserved - Genesis OS */
import type { Clock, ClaimType, ProvenanceInfo } from './evidenceTypes.js';
import type { EvidenceLedger, NewEvidenceInput } from './EvidenceLedger.js';
export interface FetchedItem {
  readonly sourceUrl: string;
  readonly sourceTimestamp: string | null;
  readonly claim: string;
  readonly claimType: ClaimType;
  readonly confidence: number;
  readonly provenance: ProvenanceInfo;
}
/** Deterministic, injected source adapter (NO scraper and NO network in this module). */
export interface SourceAdapter {
  readonly sourceId: string;
  fetch(clock: Clock): readonly FetchedItem[];
}
/** Propose-only learning: creates proposals; publication only through ledger.publish(approver). */
export class ProposeOnlyLearner {
  constructor(private clock: Clock, private ledger: EvidenceLedger) {}
  runBatch(adapter: SourceAdapter): readonly string[] {
    const items = adapter.fetch(this.clock);
    const proposalIds: string[] = [];
    for (const it of items) {
      const input: NewEvidenceInput = { sourceUrl: it.sourceUrl, sourceTimestamp: it.sourceTimestamp, claim: it.claim, claimType: it.claimType, confidence: it.confidence, provenance: it.provenance };
      proposalIds.push(this.ledger.propose(input));
    }
    return proposalIds;
  }
}
