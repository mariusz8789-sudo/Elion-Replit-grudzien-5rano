/**
 * Sandbox Lab (Priority 12 — cognitive ceiling).
 *
 * A mission can run an isolated campaign whose candidate evidence, hypotheses and
 * workflow mutations do NOT contaminate the main Evidence Store until promotion
 * rules allow. A sandbox result is NOT verified evidence. Promotion into a target
 * mission requires an explicit verification status and preserves provenance (content
 * hash + a parent-evidence link back to the sandbox origin). Every promotion /
 * rejection / hold is an append-only audit record.
 *
 * Isolation is by `mission_id`: a sandbox is its own mission (spec.sandbox = true),
 * so its evidence is naturally partitioned from the main mission until promoted.
 */
import * as store from '../store.mjs';
import * as ev from './evidenceStore.mjs';

export const PROMOTION_DECISION = Object.freeze({ PROMOTED: 'PROMOTED', REJECTED: 'REJECTED', HELD: 'HELD' });

/** Create an isolated sandbox mission linked to a parent (main) mission. */
export function createSandbox(db, { parentMissionId, goal, domain = null }) {
  const parent = store.getMission(db, parentMissionId);
  return ev.createMission(db, {
    projectId: parent?.projectId ?? null, goal: goal ?? `sandbox for ${parentMissionId}`, domain: domain ?? parent?.domain ?? null,
    spec: { sandbox: true, parentMissionId },
  });
}
export function isSandbox(mission) { return mission?.spec?.sandbox === true; }

/** Promotion rule from an evidence object's verification status. VERIFIED → PROMOTE;
 * CONTRADICTED/REJECTED → REJECT; anything else → HELD (not eligible yet). */
export function evaluatePromotion(evidence) {
  const v = evidence.verificationStatus;
  if (v === ev.EPISTEMIC_STATUS.VERIFIED) return { decision: PROMOTION_DECISION.PROMOTED, reason: 'evidence is VERIFIED' };
  if (v === ev.EPISTEMIC_STATUS.CONTRADICTED || v === ev.EPISTEMIC_STATUS.REJECTED) return { decision: PROMOTION_DECISION.REJECTED, reason: `evidence is ${v}` };
  return { decision: PROMOTION_DECISION.HELD, reason: `evidence is ${v}; not eligible for promotion (requires VERIFIED)` };
}

/**
 * Attempt to promote one sandbox evidence object into a target (main) mission.
 * Only VERIFIED evidence is copied; the copy carries a parent-evidence link and the
 * original content hash (provenance preserved). Every attempt is audited.
 */
export function promoteEvidence(db, sourceEvidenceId, { targetMissionId }) {
  const source = store.getEvidence(db, sourceEvidenceId);
  if (!source) return { ok: false, error: 'source_evidence_not_found' };
  const { decision, reason } = evaluatePromotion(source);

  let targetEvidenceId = null;
  if (decision === PROMOTION_DECISION.PROMOTED) {
    const promoted = ev.recordEvidence(db, {
      missionId: targetMissionId, kind: source.kind, epistemicStatus: source.epistemicStatus,
      content: source.content, // canonicalHash recomputed — must equal source.contentHash (provenance preserved)
      source: source.source, sourceLocation: `sandbox:${source.missionId}/${source.id}`, origin: 'promoted-from-sandbox',
      scienceRunId: source.scienceRunId, parentEvidenceId: source.id,
      verificationStatus: source.verificationStatus, artifacts: source.artifacts,
    });
    targetEvidenceId = promoted.id;
    // provenance invariant: the promoted copy hashes identically to the sandbox origin
    if (promoted.contentHash !== source.contentHash) {
      return { ok: false, error: 'provenance_mismatch', sourceHash: source.contentHash, promotedHash: promoted.contentHash };
    }
  }
  store.saveSandboxPromotion(db, { sandboxMissionId: source.missionId, sourceEvidenceId, targetMissionId, targetEvidenceId, decision, reason });
  return { ok: true, decision, reason, targetEvidenceId };
}

/** Promote all eligible evidence from a sandbox mission into a target mission. */
export function promoteMission(db, sandboxMissionId, targetMissionId) {
  const results = store.listEvidence(db, sandboxMissionId).map((e) => ({ sourceEvidenceId: e.id, ...promoteEvidence(db, e.id, { targetMissionId }) }));
  const summary = { promoted: 0, rejected: 0, held: 0 };
  for (const r of results) {
    if (r.decision === PROMOTION_DECISION.PROMOTED) summary.promoted++;
    else if (r.decision === PROMOTION_DECISION.REJECTED) summary.rejected++;
    else summary.held++;
  }
  return { summary, results };
}

export function listPromotions(db, sandboxMissionId) { return store.listSandboxPromotions(db, sandboxMissionId); }
