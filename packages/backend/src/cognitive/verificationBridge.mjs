/**
 * Verification Bridge (Priority 6 — cognitive ceiling).
 *
 * Connects the mature, already-tested reproducibility engine (campaign/verify.mjs —
 * real engine replay with per-capability numerical tolerances and append-only audit)
 * to the Evidence Store's `verification_status`. Computed evidence that is backed by
 * a Scientific Run can now be independently replay-verified, and the resulting
 * verdict is mapped onto the evidence's epistemic verification state.
 *
 * Honesty:
 *  - Nothing is re-implemented: the real replay lives in campaign/verify.mjs and is
 *    exercised against real engines by campaignVerify.test.mjs (engine-gated). This
 *    bridge is a thin, fully-tested mapping; the `verifier` dependency is injectable
 *    so this module's own tests are deterministic and engine-independent.
 *  - Evidence not backed by a Scientific Run (agent findings, critiques) is honestly
 *    reported as REPLAY_UNSUPPORTED (verification not applicable) — never marked
 *    VERIFIED by fiat.
 */
import * as store from '../store.mjs';
import * as ev from './evidenceStore.mjs';
import * as realVerify from '../campaign/verify.mjs';

/** Replay verdict → Evidence Store epistemic verification status. */
export const VERDICT_TO_EPISTEMIC = Object.freeze({
  MATCH: ev.EPISTEMIC_STATUS.VERIFIED,
  DRIFT: ev.EPISTEMIC_STATUS.CONTRADICTED,
  ENGINE_VERSION_CHANGED: ev.EPISTEMIC_STATUS.CONTRADICTED,
  BLOCKED_BY_RUNTIME: ev.EPISTEMIC_STATUS.BLOCKED_BY_RESOURCES,
  REPLAY_UNSUPPORTED: ev.EPISTEMIC_STATUS.UNVERIFIED,
});
export function mapVerdict(verdict) {
  return VERDICT_TO_EPISTEMIC[verdict] ?? ev.EPISTEMIC_STATUS.UNVERIFIED;
}

/**
 * Replay-verify one evidence object via its backing Scientific Run and update its
 * verification_status. `verifier` defaults to the real campaign/verify.mjs.
 */
export function verifyEvidence(db, evidenceId, { verifier = realVerify } = {}) {
  const e = store.getEvidence(db, evidenceId);
  if (!e) return { ok: false, error: 'evidence_not_found' };
  if (!e.scienceRunId) {
    return {
      ok: true, evidenceId, scienceRunId: null, verdict: 'REPLAY_UNSUPPORTED',
      verificationStatus: e.verificationStatus,
      note: 'evidence is not backed by a Scientific Run; replay verification is not applicable',
    };
  }
  const res = verifier.verifyScienceRun(db, e.scienceRunId);
  if (!res.ok) return { ok: false, error: res.error ?? 'verification_failed', evidenceId, scienceRunId: e.scienceRunId };
  const verdict = res.verification.verdict;
  const verificationStatus = mapVerdict(verdict);
  ev.setEvidenceVerification(db, evidenceId, verificationStatus);
  return { ok: true, evidenceId, scienceRunId: e.scienceRunId, verdict, verificationStatus };
}

/** Replay-verify all Scientific-Run-backed evidence for a mission. */
export function verifyMissionEvidence(db, missionId, opts = {}) {
  return store.listEvidence(db, missionId)
    .filter((e) => e.scienceRunId)
    .map((e) => verifyEvidence(db, e.id, opts));
}
