/**
 * Meta-Orchestrator (Priority 10 — cognitive ceiling).
 *
 * Observes whole scientific campaigns: summarizes mission outcomes, classifies
 * failure into DISTINCT causes (never one generic failure), records strategy
 * outcomes, and scores strategies across runs so Genesis learns OPERATIONALLY from
 * history — measured aggregates, not a pretend neural retrain. A recommended
 * strategy change carries traceable reasons + evidence (mission) references.
 */
import * as store from '../store.mjs';
import * as we from './workflowEngine.mjs';
import * as funnel from './molecularFunnel.mjs';

export const OUTCOME_CLASS = Object.freeze({
  SUCCESS: 'SUCCESS',
  MISSION_FAILURE: 'MISSION_FAILURE',
  STRATEGY_FAILURE: 'STRATEGY_FAILURE',
  ENGINE_FAILURE: 'ENGINE_FAILURE',
  MODEL_FAILURE: 'MODEL_FAILURE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  CAPABILITY_GAP: 'CAPABILITY_GAP',
  // A survival funnel that ran every candidate to a terminal adversarial decision
  // but retained no survivor: a VALID, decisive negative result — neither a
  // scientific discovery (SUCCESS) nor a mission failure. Honest third state.
  FUNNEL_COMPLETE: 'FUNNEL_COMPLETE',
});

/** A stable signature of the approach a mission took (for cross-run comparison). */
export function strategyKey(db, missionId) {
  const m = store.getMission(db, missionId);
  const planner = m?.spec?.planner ?? 'unknown';
  return `${m?.domain ?? 'unknown'}::${planner}`;
}

/** Campaign-level metrics from persisted state. `informationGainProxy` is an
 * explicitly-labelled proxy (verified evidence + contradictions + eliminated
 * hypotheses), NOT an information-theoretic measure. */
export function summarizeMission(db, missionId) {
  const hyps = store.listHypotheses(db, missionId);
  const evidence = store.listEvidence(db, missionId);
  const tasks = store.listTaskNodes(db, missionId);
  const mutations = store.listWorkflowMutations(db, missionId);
  const eliminated = hyps.filter((h) => h.status === 'rejected' || h.status === 'contradicted').length;
  const revised = hyps.filter((h) => h.epistemicStatus === 'PROVISIONAL').length;
  const verifiedEvidence = evidence.filter((e) => e.verificationStatus === 'VERIFIED').length;
  const contradictions = evidence.filter((e) => e.verificationStatus === 'CONTRADICTED').length
    + hyps.filter((h) => h.status === 'contradicted').length;
  const verificationAttempts = evidence.filter((e) => e.verificationStatus === 'VERIFIED' || e.verificationStatus === 'CONTRADICTED').length;
  const failedTasks = tasks.filter((t) => t.state === 'FAILED');
  const computeMs = tasks.reduce((s, t) => s + (Number(t.computeActual?.durationMs) || 0), 0);
  return {
    hypotheses: hyps.length, eliminated, revised, verifiedEvidence, contradictions,
    verificationSuccessRate: verificationAttempts ? verifiedEvidence / verificationAttempts : null,
    failedTaskPatterns: failedTasks.map((t) => t.taskType),
    workflowMutations: mutations.length,
    computeMs,
    informationGainProxy: verifiedEvidence + contradictions + eliminated,
  };
}

/** Classify the mission outcome into a SPECIFIC cause. Deterministic priority ladder. */
export function classifyOutcome(db, missionId) {
  const m = store.getMission(db, missionId);
  if (!m) return { outcomeClass: OUTCOME_CLASS.MISSION_FAILURE, reasons: ['mission not found'] };
  const tasks = store.listTaskNodes(db, missionId);
  const engineTasks = tasks.filter((t) => t.engine);
  const modelDecisions = store.listModelDecisions(db, { missionId });
  const hyps = store.listHypotheses(db, missionId);
  const metrics = summarizeMission(db, missionId);
  const strat = we.evaluateStrategy(db, missionId);
  const openQ = store.listQuestions(db, missionId).filter((q) => q.status === 'open').length;
  const reasons = [];

  if (engineTasks.length > 0 && engineTasks.every((t) => t.spec?.engineAvailable === false)) {
    reasons.push('every compute task has an unavailable engine (BLOCKED_BY_RUNTIME)');
    return { outcomeClass: OUTCOME_CLASS.CAPABILITY_GAP, reasons, metrics };
  }
  if (metrics.failedTaskPatterns.length > 0) {
    reasons.push(`${metrics.failedTaskPatterns.length} task(s) FAILED during execution`);
    return { outcomeClass: OUTCOME_CLASS.ENGINE_FAILURE, reasons, metrics };
  }
  const reasoningDecisions = modelDecisions.filter((d) => d.role === 'REASONING' || d.role === 'CRITIC');
  if (reasoningDecisions.length > 0 && reasoningDecisions.every((d) => d.status !== 'selected') && hyps.length === 0) {
    reasons.push('no reasoning/critic model provider was available and no hypotheses were produced');
    return { outcomeClass: OUTCOME_CLASS.MODEL_FAILURE, reasons, metrics };
  }
  const accepted = hyps.some((h) => h.status === 'accepted' || h.status === 'supported');
  if (metrics.verifiedEvidence > 0 && accepted) {
    reasons.push(`${metrics.verifiedEvidence} verified evidence item(s) and an accepted/supported hypothesis`);
    return { outcomeClass: OUTCOME_CLASS.SUCCESS, reasons, metrics };
  }
  if (metrics.verifiedEvidence === 0 && openQ > 0) {
    reasons.push('no verified evidence yet and open questions remain');
    return { outcomeClass: OUTCOME_CLASS.INSUFFICIENT_EVIDENCE, reasons, metrics };
  }
  if (strat.verdict === 'FAILING' || strat.verdict === 'STALLED') {
    reasons.push(`strategy verdict ${strat.verdict} with ${metrics.workflowMutations} mutation(s) applied`);
    return { outcomeClass: OUTCOME_CLASS.STRATEGY_FAILURE, reasons, metrics };
  }

  // Adversarial funnel campaigns are NOT hypothesis-driven — they KILL candidates.
  // The generic ladder above (which keys off accepted hypotheses / verified evidence)
  // is blind to funnel state, so a correctly-run funnel that rejects every candidate
  // would wrongly fall through to MISSION_FAILURE. Judge a funnel by whether each
  // candidate reached a TERMINAL adversarial decision (a CRITIC stage, or a terminal
  // REJECTED validity stage for invalid SMILES). Decisive rejection is the funnel
  // working as designed — a valid negative result, never a mission failure.
  const funnelCandidates = store.listFunnelCandidates(db, missionId);
  if (funnelCandidates.length > 0) {
    const isDecided = (c) => {
      const stages = store.listFunnelStages(db, c.id);
      return stages.some((s) => s.stage === funnel.STAGE.CRITIC || s.status === funnel.STAGE_STATUS.REJECTED);
    };
    const decided = funnelCandidates.filter(isDecided);
    const survivors = funnelCandidates.filter((c) => c.status === 'surviving').length;
    const rejected = funnelCandidates.filter((c) => c.status === 'rejected').length;
    if (decided.length === funnelCandidates.length) {
      if (survivors >= 1) {
        reasons.push(`adversarial funnel completed: ${survivors} candidate(s) survived every adversarial stage`);
        return { outcomeClass: OUTCOME_CLASS.SUCCESS, reasons, metrics };
      }
      reasons.push(`adversarial funnel completed decisively: all ${funnelCandidates.length} candidate(s) reached a terminal decision and were adversarially rejected (${rejected} rejected) — a VALID negative result, not a mission failure`);
      return { outcomeClass: OUTCOME_CLASS.FUNNEL_COMPLETE, reasons, metrics };
    }
    if (decided.length > 0) {
      reasons.push(`adversarial funnel partially complete: ${decided.length}/${funnelCandidates.length} candidate(s) reached a terminal decision — honestly incomplete`);
      return { outcomeClass: OUTCOME_CLASS.INSUFFICIENT_EVIDENCE, reasons, metrics };
    }
    // decided.length === 0: candidates exist but none reached any decision → genuine failure (fall through).
  }

  reasons.push('mission incomplete without a more specific cause');
  return { outcomeClass: OUTCOME_CLASS.MISSION_FAILURE, reasons, metrics };
}

/** Score in [0,1] from metrics + outcome (measured, deterministic). */
export function scoreFromMetrics(outcomeClass, metrics) {
  if (outcomeClass === OUTCOME_CLASS.SUCCESS) {
    const rate = metrics.verificationSuccessRate ?? 0;
    return Math.min(1, 0.6 + 0.4 * rate);
  }
  // A decisive funnel completion with no survivor is a valid negative result: mid-range,
  // not credited as a discovery (so it never inflates a generation strategy's success).
  if (outcomeClass === OUTCOME_CLASS.FUNNEL_COMPLETE) return 0.5;
  if (outcomeClass === OUTCOME_CLASS.INSUFFICIENT_EVIDENCE) return 0.3;
  if (outcomeClass === OUTCOME_CLASS.STRATEGY_FAILURE) return 0.2;
  if (outcomeClass === OUTCOME_CLASS.CAPABILITY_GAP) return 0.1; // not the strategy's fault, but no result
  return 0.0; // engine/model/mission failure
}

/** Record a mission's strategy outcome (append-only) for cross-run learning. */
export function recordOutcome(db, missionId) {
  const key = strategyKey(db, missionId);
  const m = store.getMission(db, missionId);
  const { outcomeClass, reasons, metrics } = classifyOutcome(db, missionId);
  const score = scoreFromMetrics(outcomeClass, metrics);
  return store.saveStrategyRecord(db, { missionId, strategyKey: key, domain: m?.domain ?? null, outcomeClass, score, metrics, reasons });
}

/** Aggregate a strategy's history across runs. */
export function scoreStrategy(db, key) {
  const recs = store.listStrategyRecords(db, { strategyKey: key });
  if (recs.length === 0) return { strategyKey: key, runs: 0, meanScore: null, successRate: null };
  const successes = recs.filter((r) => r.outcomeClass === 'SUCCESS').length;
  const meanScore = recs.reduce((s, r) => s + (r.score ?? 0), 0) / recs.length;
  const byClass = {};
  for (const r of recs) byClass[r.outcomeClass] = (byClass[r.outcomeClass] ?? 0) + 1;
  return { strategyKey: key, runs: recs.length, meanScore, successRate: successes / recs.length, byClass };
}

/** Recommend the best-scoring strategy for a domain, with traceable reasons + mission refs. */
export function recommendStrategy(db, domain) {
  const recs = store.listStrategyRecords(db, { domain });
  if (recs.length === 0) return { domain, recommendation: null, reason: 'no prior strategy history for this domain (CAPABILITY_GAP for recommendation)' };
  const keys = [...new Set(recs.map((r) => r.strategyKey))];
  const scored = keys.map((k) => scoreStrategy(db, k)).sort((a, b) => (b.meanScore ?? 0) - (a.meanScore ?? 0));
  const best = scored[0];
  const evidenceRefs = recs.filter((r) => r.strategyKey === best.strategyKey).map((r) => r.missionId);
  return {
    domain, recommendation: best.strategyKey,
    reason: `highest mean score ${best.meanScore?.toFixed(3)} over ${best.runs} run(s), success rate ${(best.successRate * 100).toFixed(0)}%`,
    evidenceRefs, ranking: scored,
  };
}
