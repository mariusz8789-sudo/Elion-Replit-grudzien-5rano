/**
 * WorkflowMutation records (Priority 1 ontology; the mutation *engine* is Priority 3).
 *
 * A workflow mutation is an explicit, append-only, evidence-backed object — never a
 * silent rewrite of the research plan. This module persists the record with all
 * mandated fields (reason, triggering observations, previous workflow hash,
 * proposed change, expected benefit, actual result, rollback, verification status)
 * and a content hash. The caller supplies `previousWorkflowHash` from
 * taskGraph.workflowHash(db, missionId) so this module needs no graph import.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';

export const MUTATION_VERIFICATION = Object.freeze({
  UNVERIFIED: 'UNVERIFIED', VERIFIED: 'VERIFIED', REGRESSED: 'REGRESSED', ROLLED_BACK: 'ROLLED_BACK',
});

/**
 * Record a proposed workflow mutation. `expectedBenefit` should carry the
 * decision inputs (expected information gain, compute-cost delta, risk delta).
 * `rollback` should carry enough to revert (e.g. task ids to un-supersede).
 */
export function recordWorkflowMutation(db, {
  missionId, reason, triggeringEvidence = [], previousWorkflowHash = null,
  proposed = {}, expectedBenefit = {}, rollback = {},
}) {
  if (!missionId) throw new Error('missionId required');
  if (!reason) throw new Error('mutation reason required');
  const contentHash = canonicalHash({ reason, previousWorkflowHash, proposed, expectedBenefit });
  return store.saveWorkflowMutation(db, {
    missionId, reason, triggeringEvidence, previousWorkflowHash, proposed, expectedBenefit, rollback,
    verificationStatus: MUTATION_VERIFICATION.UNVERIFIED, contentHash,
  });
}

/** Close the loop: record the mutation's actual measured result + verification verdict. */
export function completeWorkflowMutation(db, id, { actualResult, verificationStatus }) {
  if (verificationStatus && !Object.values(MUTATION_VERIFICATION).includes(verificationStatus)) {
    throw new Error(`invalid mutation verification status: ${verificationStatus}`);
  }
  return store.updateWorkflowMutationResult(db, id, { actualResult, verificationStatus });
}

export function listWorkflowMutations(db, missionId) {
  return store.listWorkflowMutations(db, missionId);
}
