import { fingerprint } from './hash.js';
import type { KnowledgeClaim, KnowledgeGap } from './types.js';
import type { HashPort } from '../hashReplay/hashPort.js';
import { toD141ClaimState, type EpistemicLabel } from '../historicalEpistemic/epistemicTaxonomy.js';

/** Fix area 5: `epistemicLabel` now comes from the ONE canonical
 * `EpistemicLabel` type instead of a locally re-declared union, and the
 * label→claim-state mapping is `toD141ClaimState` (shared with World Director's own
 * policy reconciliation) instead of duplicated inline logic. */
export interface WorldDirectorMetaInput {
  readonly requestId: string;
  readonly worldId: string;
  readonly mode: 'SCIENTIFIC' | 'HISTORICAL_RECONSTRUCTION' | 'CINEMATIC';
  readonly epistemicLabel: EpistemicLabel;
  readonly warnings: readonly string[];
  readonly provenanceRefs?: readonly string[];
}

export interface WorldDirectorMetaAssessment {
  readonly claims: readonly KnowledgeClaim[];
  readonly gaps: readonly KnowledgeGap[];
}

export function assessWorldDirectorRun(input: WorldDirectorMetaInput, hashPort?: HashPort): WorldDirectorMetaAssessment {
  const state = toD141ClaimState(input.epistemicLabel);
  const provenance = (input.provenanceRefs ?? []).map((sourceId) => ({ sourceId }));
  const claims: KnowledgeClaim[] = [{
    claimId: `world:${input.worldId}:epistemic`,
    subject: input.worldId,
    predicate: 'representation_status',
    value: input.epistemicLabel,
    state,
    provenance,
    scope: input.mode,
  }];
  const gaps = input.warnings.map((warning, index): KnowledgeGap => ({
    gapId: `world-gap:${fingerprint({ requestId: input.requestId, index, warning }, hashPort)}`,
    question: `Resolve World Director warning: ${warning}`,
    reason: warning,
    relatedClaimIds: claims.map((claim) => claim.claimId),
    priority: input.mode === 'SCIENTIFIC' ? 'HIGH' : 'MEDIUM',
    status: 'OPEN',
  }));
  return { claims, gaps };
}
