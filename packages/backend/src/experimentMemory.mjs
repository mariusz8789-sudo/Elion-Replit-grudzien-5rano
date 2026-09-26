/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * SCIENTIFIC MEMORY — the server side of the constitution's §7 (memory) and of preregistration.
 *
 * Two kinds of immutable record live in `experiment_records`, hash-chained per campaign:
 *
 *  PREREGISTRATION — the hypothesis and its falsification criteria, written BEFORE the campaign runs.
 *    The server refuses one for a campaign whose engines have already produced results (a criterion
 *    invented after the numbers are known is not a criterion), refuses a second one that differs from
 *    the first, and recomputes the declared fingerprint from the declared content, so a client cannot
 *    store a hash that does not belong to the criteria it stored.
 *
 *  SESSION — the sealed result of a run: the verdict, the per-criterion observations, the canonical
 *    state hash, the evidence entries and the engine-replay verdict. Before it is stored the server
 *    CHECKS it against the preregistration: same fingerprint, same criterion ids, and — holding the
 *    frozen criticality itself — it re-derives the verdict from the reported statuses with the same
 *    rule the lab uses. Both the check and the server's own derivation are stored in the record. The
 *    verdict is therefore never a claim the client is trusted on, and no language model takes part.
 *
 * What this module does NOT do: it does not run engines, does not judge whether a measurement is
 * right, and does not decide science. It records what was registered, what came back, and whether the
 * two agree.
 */
import { canonicalJson, fnv1a, sha256Hex } from './determinism.mjs';
import {
  appendExperimentRecord, getExperimentPreregistration, listExperimentRecords, listScienceRuns,
  verifyExperimentRecordChain,
} from './store.mjs';
import { listEvents } from './campaign/persistence.mjs';

export const PREREGISTRATION = 'PREREGISTRATION';
export const SESSION = 'SESSION';
export const VERDICTS = ['SUPPORTED', 'WEAKENED', 'FALSIFIED', 'UNRESOLVED'];
export const CRITERION_STATUSES = ['MET', 'NOT_MET', 'UNRESOLVED'];
const EVIDENCE_CLASSES = ['REAL_ENGINE_OUTPUT', 'MODEL_ESTIMATE', 'REFERENCE_DATA', 'SIMULATED', 'DERIVED'];
const STR = (v) => typeof v === 'string' && v.trim().length > 0;

/** The fingerprint the lab freezes: fnv1a over the canonical criteria, target and statement. */
export function hypothesisFingerprint(h) {
  return fnv1a(canonicalJson({ subject: h.subject, target: h.target, statement: h.statement, criteria: h.criteria }));
}

function validateHypothesis(h) {
  if (!h || typeof h !== 'object') return 'hypothesis_required';
  if (!STR(h.subject)) return 'subject_required';
  if (!STR(h.statement)) return 'statement_required';
  if (!h.target || !STR(h.target.targetId)) return 'target_required';
  if (!Array.isArray(h.criteria) || h.criteria.length === 0) return 'criteria_required';
  for (const c of h.criteria) {
    if (!c || !STR(c.id) || !STR(c.label)) return 'criterion_shape';
    if (typeof c.critical !== 'boolean') return 'criterion_criticality_required';
    if (c.threshold !== null && !Number.isFinite(c.threshold)) return 'criterion_threshold_invalid';
    if (!EVIDENCE_CLASSES.includes(c.evidence)) return 'criterion_evidence_class_invalid';
  }
  if (new Set(h.criteria.map((c) => c.id)).size !== h.criteria.length) return 'criterion_ids_not_unique';
  return null;
}

/**
 * Has this campaign already produced engine results? Preregistration is only preregistration if the
 * answer is no. The signals are the canonical ones: the campaign's own status, its append-only event
 * log and its persisted Science Runs.
 */
export function campaignHasExecuted(db, campaign) {
  if (campaign.status !== 'created') return { executed: true, reason: `campaign_status_${campaign.status}` };
  if (listScienceRuns(db, campaign.id).length > 0) return { executed: true, reason: 'science_runs_present' };
  const events = listEvents(db, campaign.id);
  if (events.length > 0) return { executed: true, reason: `campaign_events_present:${events.length}` };
  return { executed: false, reason: null };
}

/**
 * The verdict rule, applied by the server to the PREREGISTERED criticality and the REPORTED statuses.
 * Same order as the lab: a failed falsifier decides first, then anything unevaluable, then all-met.
 */
export function deriveVerdict(results, criticalIds) {
  const critical = new Set(criticalIds);
  const criticalFailed = results.filter((r) => r.status === 'NOT_MET' && critical.has(r.id));
  const unresolved = results.filter((r) => r.status === 'UNRESOLVED');
  const failed = results.filter((r) => r.status === 'NOT_MET');
  if (criticalFailed.length) return { verdict: 'FALSIFIED', rule: `critical criterion not met: ${criticalFailed.map((r) => r.id).join(', ')}` };
  if (unresolved.length) return { verdict: 'UNRESOLVED', rule: `unevaluable criteria: ${unresolved.map((r) => r.id).join(', ')}` };
  if (!failed.length) return { verdict: 'SUPPORTED', rule: 'every registered criterion met' };
  return { verdict: 'WEAKENED', rule: `criticals met, non-critical not met: ${failed.map((r) => r.id).join(', ')}` };
}

/**
 * Writes the campaign's preregistration. Idempotent for an identical hypothesis; refused for a
 * different one, and refused once the campaign has run.
 */
export function preregisterExperiment(db, { projectId, campaign, hypothesis, userId = null }) {
  const invalid = validateHypothesis(hypothesis);
  if (invalid) return { ok: false, error: invalid };
  const fingerprint = hypothesisFingerprint(hypothesis);
  if (STR(hypothesis.fingerprint) && hypothesis.fingerprint !== fingerprint) {
    return { ok: false, error: 'fingerprint_mismatch', declared: hypothesis.fingerprint, recomputed: fingerprint };
  }
  const existing = getExperimentPreregistration(db, campaign.id);
  if (existing) {
    if (existing.fingerprint === fingerprint) return { ok: true, status: 'ALREADY_REGISTERED', record: existing };
    return { ok: false, error: 'preregistration_immutable', record: existing, recomputed: fingerprint };
  }
  const executed = campaignHasExecuted(db, campaign);
  if (executed.executed) return { ok: false, error: 'campaign_already_executed', reason: executed.reason };
  const body = {
    kind: PREREGISTRATION,
    campaignId: campaign.id,
    subject: hypothesis.subject,
    statement: hypothesis.statement,
    target: hypothesis.target,
    criteria: hypothesis.criteria,
    plan: Array.isArray(hypothesis.plan) ? hypothesis.plan : [],
    fingerprint,
  };
  const record = appendExperimentRecord(db, {
    projectId, campaignId: campaign.id, kind: PREREGISTRATION, fingerprint,
    contentHash: sha256Hex(canonicalJson(body)), body, createdBy: userId,
  });
  return { ok: true, status: 'REGISTERED', record };
}

function checkAgainstPreregistration(prereg, session) {
  if (!prereg) return { preregCheck: 'MISSING', reason: 'no preregistration was stored before this run' };
  if (session.hypothesisFingerprint !== prereg.fingerprint) {
    return { preregCheck: 'FINGERPRINT_MISMATCH', reason: `session was judged against ${session.hypothesisFingerprint}, registered ${prereg.fingerprint}` };
  }
  const registered = [...prereg.body.criteria.map((c) => c.id)].sort();
  const judged = [...session.criteria.map((c) => c.id)].sort();
  if (canonicalJson(registered) !== canonicalJson(judged)) {
    return { preregCheck: 'CRITERIA_MISMATCH', reason: `registered ${registered.join(',')}, judged ${judged.join(',')}` };
  }
  return { preregCheck: 'MATCH', reason: null };
}

function validateSession(s) {
  if (!s || typeof s !== 'object') return 'session_required';
  if (!STR(s.hypothesisFingerprint)) return 'hypothesis_fingerprint_required';
  if (!VERDICTS.includes(s.verdict)) return 'verdict_invalid';
  if (!STR(s.stateHash)) return 'state_hash_required';
  if (!Array.isArray(s.criteria) || s.criteria.length === 0) return 'criteria_required';
  for (const c of s.criteria) {
    if (!STR(c.id) || !CRITERION_STATUSES.includes(c.status)) return 'criterion_result_shape';
  }
  return null;
}

/**
 * Seals a finished run into scientific memory. The record stores the client's verdict, the server's
 * own derivation of it from the preregistered criticality, and how the session compares with the
 * preregistration — so a disagreement is visible in the record instead of being resolved silently.
 * Re-posting the identical session returns the stored record (`deduped`), never a second row.
 */
export function sealExperimentSession(db, { projectId, campaign, session, userId = null }) {
  const invalid = validateSession(session);
  if (invalid) return { ok: false, error: invalid };
  const prereg = getExperimentPreregistration(db, campaign.id);
  const { preregCheck, reason } = checkAgainstPreregistration(prereg, session);
  const criticalIds = prereg ? prereg.body.criteria.filter((c) => c.critical).map((c) => c.id) : [];
  // Without a preregistration there is no registered criticality, so the server cannot derive a
  // verdict at all — it says so rather than assuming every criterion is a falsifier.
  const derived = prereg && preregCheck === 'MATCH' ? deriveVerdict(session.criteria, criticalIds) : null;
  const verdictCheck = derived === null ? 'NOT_DERIVABLE' : derived.verdict === session.verdict ? 'MATCH' : 'CLIENT_VERDICT_DIFFERS';
  const body = {
    kind: SESSION,
    campaignId: campaign.id,
    subject: session.subject ?? prereg?.body.subject ?? null,
    hypothesisFingerprint: session.hypothesisFingerprint,
    preregistrationId: prereg?.id ?? null,
    preregCheck,
    preregCheckReason: reason,
    reportedVerdict: session.verdict,
    reportedRule: STR(session.rule) ? session.rule : null,
    serverVerdict: derived?.verdict ?? null,
    serverRule: derived?.rule ?? null,
    verdictCheck,
    criteria: session.criteria.map((c) => ({ id: c.id, status: c.status, observed: c.observed ?? null })),
    stateHash: session.stateHash,
    target: session.target ?? null,
    candidate: session.candidate ?? null,
    engines: Array.isArray(session.engines) ? session.engines : [],
    evidence: Array.isArray(session.evidence) ? session.evidence : [],
    blocked: Array.isArray(session.blocked) ? session.blocked : [],
    engineReplay: session.engineReplay ?? null,
    sessionReplay: session.sessionReplay ?? null,
    durationMs: Number.isFinite(session.durationMs) ? session.durationMs : null,
  };
  const contentHash = sha256Hex(canonicalJson(body));
  const already = listExperimentRecords(db, campaign.id, SESSION).find((r) => r.contentHash === contentHash);
  if (already) return { ok: true, status: 'ALREADY_SEALED', deduped: true, record: already };
  const record = appendExperimentRecord(db, {
    projectId, campaignId: campaign.id, kind: SESSION, fingerprint: session.stateHash,
    contentHash, body, preregistrationId: prereg?.id ?? null, preregCheck, createdBy: userId,
  });
  return { ok: true, status: 'SEALED', deduped: false, record };
}

/** Everything a client needs to show a campaign's memory: what was registered, what was sealed, chain state. */
export function readExperimentMemory(db, campaignId) {
  const records = listExperimentRecords(db, campaignId);
  return {
    preregistration: records.find((r) => r.kind === PREREGISTRATION) ?? null,
    sessions: records.filter((r) => r.kind === SESSION),
    chain: verifyExperimentRecordChain(db, campaignId),
  };
}
