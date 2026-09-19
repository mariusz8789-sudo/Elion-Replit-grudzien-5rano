/**
 * GENESIS SCIENTIFIC WORLDS V3 — the evidence-sink contract the human-lab
 * instruments write through. Copied verbatim from the delivered
 * `execution/contracts.ts` (only the three types the humanLab modules use);
 * the canonical implementation behind it is the kernel's EvidenceLedger
 * (see ../biologyRunners.ts).
 */
export interface EvidenceRecordInput {
  readonly sourceUrl: string;
  readonly sourceTimestamp?: string | null;
  readonly claim: string;
  readonly claimType: string;
  readonly confidence: number;
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface EvidenceSink {
  addRecord(input: EvidenceRecordInput): { readonly record: { readonly id: string; readonly contentHash: string } };
  verify?(): { readonly ok: boolean; readonly errors: readonly string[] };
}

export interface EvidenceRef {
  readonly id: string;
  readonly contentHash: string;
}
