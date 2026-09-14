import { DEFAULT_EVIDENCE_CLASS_RANK, type EvidenceClass } from '../agent/evidenceProvenance';
import type { A2ComparisonType, A2EfficacyEvidence } from '../biotechData/a2OzempicSubstitute';

/**
 * Shared audit-layer classification (mirrors `a2AdjudicationReferenceImplementation.ts`'s
 * own "decision-inert" `evidenceProvenance.ts` annotation, D-047): maps
 * A2's own comparison-type vocabulary onto the shared `EvidenceClass`
 * union for the orchestrator's evidence inventory. Never fed back into
 * `falsifyCandidate`/`scoreCandidate`/`selectWinner` — those keep deciding
 * from `A2ComparisonType` exactly as before. Extracted here (D-059) so
 * both `govLowerHarmAdapters.ts` and `govE2E01Adapters.ts` reuse the same
 * one mapping instead of each carrying its own copy.
 */
export function evidenceClassOf(comparisonType: A2ComparisonType): EvidenceClass {
  if (comparisonType === 'DIRECT_HEAD_TO_HEAD') return 'DIRECT_RANDOMISED';
  if (comparisonType === 'NAIVE_INDIRECT') return 'INDIRECT_RANDOMISED';
  return 'UNVERIFIED';
}

/** The strongest evidence class among a candidate's own efficacy entries. */
export function strongestEvidenceClassForEfficacy(efficacy: readonly A2EfficacyEvidence[]): EvidenceClass {
  let best: EvidenceClass = 'UNVERIFIED';
  for (const e of efficacy) {
    const cls = evidenceClassOf(e.comparisonType);
    if (DEFAULT_EVIDENCE_CLASS_RANK[cls] > DEFAULT_EVIDENCE_CLASS_RANK[best]) best = cls;
  }
  return best;
}
