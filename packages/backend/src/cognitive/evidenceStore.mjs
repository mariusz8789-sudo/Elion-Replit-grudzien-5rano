/**
 * Evidence Store (Priority 1 — cognitive ceiling, Genesis Cognitive Architecture v3).
 *
 * Semantic layer over the v9 persistence tables (store.mjs). This is the canonical
 * scientific memory: missions, research questions, competing hypotheses, and a
 * generic append-only Evidence object with explicit epistemic status, provenance,
 * content identity and verification state. It is NOT chat memory and it never
 * persists private chain-of-thought — only conclusions, evidence, structured
 * decisions and verification artifacts.
 *
 * Design constraints honored:
 *  - Provenance is reused, not reinvented: content identity = `canonicalHash`
 *    (provenance.mjs), whose byte-for-byte semantics the forensic audit fixed as
 *    load-bearing. We NEVER fabricate a hash and NEVER collapse epistemic states
 *    into a single confidence score.
 *  - Long-horizon continuation: every entity persists; `reconstructMissionState`
 *    reloads a mission and reports the unresolved frontier so a restart continues
 *    instead of resetting scientific understanding.
 *  - Honesty: epistemic status is a required, validated field. Confidence is
 *    optional and nullable — absence is honest, a fabricated number is not.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';

/**
 * Canonical epistemic status vocabulary. Distinguishes HOW something is known,
 * never a single blurred confidence. Superset that unifies the previously
 * fragmented verify/tool/evidence_class enums (see GENESIS_COGNITIVE_GAP_ANALYSIS.md).
 */
export const EPISTEMIC_STATUS = Object.freeze({
  OBSERVED: 'OBSERVED', // directly measured/observed
  COMPUTED: 'COMPUTED', // produced by a real engine execution (MODEL_ESTIMATE)
  INFERRED: 'INFERRED', // derived by reasoning over other evidence
  HYPOTHESIZED: 'HYPOTHESIZED', // a proposed claim, not yet tested
  PUBLISHER_REPORTED: 'PUBLISHER_REPORTED', // metric/value reported by an external source
  SUPPORTED: 'SUPPORTED', // evidence increases support, not yet verified
  PROVISIONAL: 'PROVISIONAL', // accepted tentatively pending verification
  UNVERIFIED: 'UNVERIFIED',
  VERIFIED: 'VERIFIED', // independently verified (e.g. replay MATCH)
  CONTRADICTED: 'CONTRADICTED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
  BLOCKED_BY_RESOURCES: 'BLOCKED_BY_RESOURCES',
  CAPABILITY_GAP: 'CAPABILITY_GAP',
});
const EPISTEMIC_SET = new Set(Object.values(EPISTEMIC_STATUS));
export function isEpistemicStatus(s) {
  return EPISTEMIC_SET.has(s);
}

export const MISSION_STATUS = Object.freeze({
  ACTIVE: 'active', PAUSED: 'paused', COMPLETED: 'completed', FAILED: 'failed', SUPERSEDED: 'superseded',
});
export const QUESTION_STATUS = Object.freeze({
  OPEN: 'open', ANSWERED: 'answered', REJECTED: 'rejected', SUPERSEDED: 'superseded', BLOCKED: 'blocked',
});
export const HYPOTHESIS_STATUS = Object.freeze({
  OPEN: 'open', SUPPORTED: 'supported', CONTRADICTED: 'contradicted', ACCEPTED: 'accepted', REJECTED: 'rejected', SUPERSEDED: 'superseded',
});

const EVIDENCE_KINDS = new Set([
  'observation', 'finding', 'measurement', 'citation', 'contradiction', 'artifact-ref', 'computation', 'verification',
]);

/* ---------------- Missions ---------------- */

export function createMission(db, { projectId = null, goal, domain = null, spec = {}, computeBudget = {}, modelBudget = {}, createdBy = null }) {
  if (!goal || typeof goal !== 'string') throw new Error('mission goal is required');
  const contentHash = canonicalHash({ goal, domain, spec });
  return store.saveMission(db, { projectId, goal, domain, spec, computeBudget, modelBudget, createdBy, status: MISSION_STATUS.ACTIVE, contentHash });
}
export function getMission(db, id) { return store.getMission(db, id); }
export function setMissionStatus(db, id, status) {
  if (!Object.values(MISSION_STATUS).includes(status)) throw new Error(`invalid mission status: ${status}`);
  return store.updateMission(db, id, { status });
}

/* ---------------- Research questions ---------------- */

export function addQuestion(db, { missionId, text, parentId = null }) {
  if (!missionId) throw new Error('missionId required');
  if (!text) throw new Error('question text required');
  const contentHash = canonicalHash({ text, parentId });
  return store.saveQuestion(db, { missionId, text, parentId, status: QUESTION_STATUS.OPEN, contentHash });
}
export function answerQuestion(db, id, answer) {
  return store.updateQuestion(db, id, { status: QUESTION_STATUS.ANSWERED, answer, contentHash: canonicalHash({ answer }) });
}
export function setQuestionStatus(db, id, status) {
  if (!Object.values(QUESTION_STATUS).includes(status)) throw new Error(`invalid question status: ${status}`);
  return store.updateQuestion(db, id, { status });
}
export function listQuestions(db, missionId) { return store.listQuestions(db, missionId); }

/* ---------------- Hypotheses ---------------- */

export function addHypothesis(db, {
  missionId, questionId = null, label = null, claim,
  assumptions = [], predictedObservations = [], disconfirmingObservations = [], requiredEvidence = [],
  epistemicStatus = EPISTEMIC_STATUS.HYPOTHESIZED, confidence = null,
}) {
  if (!missionId) throw new Error('missionId required');
  if (!claim) throw new Error('hypothesis claim required');
  if (!isEpistemicStatus(epistemicStatus)) throw new Error(`invalid epistemic status: ${epistemicStatus}`);
  const contentHash = canonicalHash({ claim, assumptions, predictedObservations, disconfirmingObservations });
  return store.saveHypothesis(db, {
    missionId, questionId, label, claim, assumptions, predictedObservations, disconfirmingObservations,
    requiredEvidence, epistemicStatus, confidence, status: HYPOTHESIS_STATUS.OPEN, contentHash,
  });
}
export function getHypothesis(db, id) { return store.getHypothesis(db, id); }
export function listHypotheses(db, missionId) { return store.listHypotheses(db, missionId); }
/** Update a hypothesis's epistemic/lifecycle status from evidence. Confidence stays optional. */
export function updateHypothesisStatus(db, id, { epistemicStatus = null, status = null, confidence = undefined }) {
  const cur = store.getHypothesis(db, id);
  if (!cur) return null;
  if (epistemicStatus && !isEpistemicStatus(epistemicStatus)) throw new Error(`invalid epistemic status: ${epistemicStatus}`);
  if (status && !Object.values(HYPOTHESIS_STATUS).includes(status)) throw new Error(`invalid hypothesis status: ${status}`);
  return store.updateHypothesis(db, id, {
    epistemicStatus: epistemicStatus ?? cur.epistemicStatus,
    status: status ?? cur.status,
    confidence: confidence === undefined ? cur.confidence : confidence,
  });
}
/** Supersede h1 by h2 (both persist; supersession is a relation, never a deletion). */
export function supersedeHypothesis(db, oldId, newId) {
  store.updateHypothesis(db, oldId, { status: HYPOTHESIS_STATUS.SUPERSEDED, epistemicStatus: EPISTEMIC_STATUS.SUPERSEDED, supersededBy: newId });
  return store.getHypothesis(db, oldId);
}

/* ---------------- Evidence (append-only) ---------------- */

/**
 * Record an evidence object. `content` is the scientific payload (numbers, units,
 * observation); its `canonicalHash` is the content identity (tamper-evident). The
 * epistemic status is required and validated. Links (hypothesis/question/task/
 * scienceRun/parentEvidence) capture provenance and relationships.
 */
export function recordEvidence(db, {
  missionId, kind, epistemicStatus, content = {},
  source = null, sourceLocation = null, origin = null,
  scienceRunId = null, hypothesisId = null, questionId = null, taskId = null, parentEvidenceId = null,
  confidence = null, verificationStatus = EPISTEMIC_STATUS.UNVERIFIED, artifacts = [],
}) {
  if (!missionId) throw new Error('missionId required');
  if (!EVIDENCE_KINDS.has(kind)) throw new Error(`invalid evidence kind: ${kind}`);
  if (!isEpistemicStatus(epistemicStatus)) throw new Error(`invalid epistemic status: ${epistemicStatus}`);
  const contentHash = canonicalHash(content);
  return store.saveEvidence(db, {
    missionId, kind, epistemicStatus, content, contentHash, source, sourceLocation, origin,
    scienceRunId, hypothesisId, questionId, taskId, parentEvidenceId, confidence, verificationStatus, artifacts,
  });
}
export function getEvidence(db, id) { return store.getEvidence(db, id); }
export function listEvidence(db, missionId, opts) { return store.listEvidence(db, missionId, opts); }
/** True iff the stored content still hashes to the recorded content_hash (tamper check). */
export function verifyEvidenceIntegrity(db, id) {
  const e = store.getEvidence(db, id);
  if (!e) return { ok: false, error: 'not_found' };
  const recomputed = canonicalHash(e.content);
  return { ok: recomputed === e.contentHash, recomputed, stored: e.contentHash };
}
export function setEvidenceVerification(db, id, verificationStatus) {
  if (!isEpistemicStatus(verificationStatus)) throw new Error(`invalid verification status: ${verificationStatus}`);
  return store.updateEvidenceVerification(db, id, verificationStatus);
}

/* ---------------- Long-horizon reconstruction ---------------- */

/**
 * Reload a mission's full research state so a restart continues from the correct
 * execution frontier. `frontier` (READY tasks) is delegated to the task-graph
 * module by the caller to avoid a circular import; pass it in, or call
 * taskGraph.executionFrontier(db, missionId) separately. Returns unresolved
 * questions, live hypotheses, evidence/ mutation counts and the latest checkpoint.
 */
export function reconstructMissionState(db, missionId, { frontier = null } = {}) {
  const mission = store.getMission(db, missionId);
  if (!mission) return null;
  const questions = store.listQuestions(db, missionId);
  const hypotheses = store.listHypotheses(db, missionId);
  const evidence = store.listEvidence(db, missionId);
  const mutations = store.listWorkflowMutations(db, missionId);
  const tasks = store.listTaskNodes(db, missionId);
  const openQuestions = questions.filter((q) => q.status === QUESTION_STATUS.OPEN);
  const liveHypotheses = hypotheses.filter((h) => h.status === HYPOTHESIS_STATUS.OPEN || h.status === HYPOTHESIS_STATUS.SUPPORTED);
  const byState = {};
  for (const t of tasks) byState[t.state] = (byState[t.state] ?? 0) + 1;
  return {
    mission,
    counts: {
      questions: questions.length,
      openQuestions: openQuestions.length,
      hypotheses: hypotheses.length,
      liveHypotheses: liveHypotheses.length,
      evidence: evidence.length,
      workflowMutations: mutations.length,
      tasks: tasks.length,
      tasksByState: byState,
    },
    openQuestions,
    liveHypotheses,
    frontier, // READY task ids, provided by task-graph layer
    latestCheckpoint: store.latestMissionCheckpoint(db, missionId),
  };
}
