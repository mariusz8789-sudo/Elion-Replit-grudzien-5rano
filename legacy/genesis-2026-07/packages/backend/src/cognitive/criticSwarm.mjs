/**
 * Independent Critic Swarm (Priority 5 — cognitive ceiling).
 *
 * Genesis must actively try to DISPROVE its own hypotheses, and the component that
 * proposes a hypothesis must not be the sole authority that accepts it. This module
 * is that independent authority: a swarm of distinct, deterministic critic lenses,
 * each attacking a hypothesis from a different angle, whose votes decide
 * ACCEPT / REVISE / REJECT. The Hypothesis Engine proposes; the swarm judges.
 *
 * Determinism & honesty:
 *  - Each lens is a deterministic check over persisted evidence + the hypothesis
 *    structure — auditable, not an LLM opinion. Every critique is persisted as an
 *    evidence object linked to the hypothesis (append-only).
 *  - Richer, semantic critics (subtle confounders, causal-claim analysis in natural
 *    language) need reasoning models behind the Model Router (Priority 7); those are
 *    a declared CAPABILITY_GAP, not faked here. The deterministic lenses below cover
 *    the checkable failure modes: contradiction, unfalsifiability, missing
 *    alternatives, unstated assumptions, untested claims, numerical instability.
 */
import * as ev from './evidenceStore.mjs';
import * as store from '../store.mjs';
import { evalPredicate } from './hypothesisEngine.mjs';

export const CRITIQUE_VERDICT = Object.freeze({ PASS: 'pass', CONCERN: 'concern', FAIL: 'fail' });
export const SWARM_DECISION = Object.freeze({ ACCEPT: 'ACCEPT', REVISE: 'REVISE', REJECT: 'REJECT' });

/**
 * Independent critic lenses. Each: (h, ctx) => { lens, verdict, finding }.
 * ctx = { observations, siblingCount }.
 */
const LENSES = [
  function falsifiability(h) {
    const ok = Array.isArray(h.disconfirmingObservations) && h.disconfirmingObservations.length >= 1;
    return { lens: 'falsifiability', verdict: ok ? 'pass' : 'fail', finding: ok ? 'has a disconfirming prediction' : 'unfalsifiable: no disconfirming prediction' };
  },
  function contradictoryEvidence(h, ctx) {
    let contradicted = 0;
    for (const obs of ctx.observations) {
      for (const p of h.disconfirmingObservations ?? []) if (evalPredicate(p, obs) === true) contradicted++;
    }
    return { lens: 'contradictory-evidence', verdict: contradicted > 0 ? 'fail' : 'pass', finding: contradicted > 0 ? `${contradicted} observation(s) satisfy a disconfirming prediction` : 'no contradicting evidence' };
  },
  function alternativeExplanation(h, ctx) {
    const ok = ctx.siblingCount >= 1; // at least one competing hypothesis for the same question
    return { lens: 'alternative-explanation', verdict: ok ? 'pass' : 'concern', finding: ok ? 'competing hypothesis exists' : 'no competing alternative — first-plausible-explanation risk' };
  },
  function statedAssumptions(h) {
    const ok = Array.isArray(h.assumptions) && h.assumptions.length >= 1;
    return { lens: 'stated-assumptions', verdict: ok ? 'pass' : 'concern', finding: ok ? 'assumptions are stated' : 'assumptions not stated' };
  },
  function evidenceSufficiency(h, ctx) {
    const metrics = new Set((h.predictedObservations ?? []).map((p) => p.metric));
    if (metrics.size === 0) return { lens: 'evidence-sufficiency', verdict: 'concern', finding: 'no structured predictions to test' };
    const tested = ctx.observations.some((obs) => [...metrics].some((mm) => mm in obs));
    return { lens: 'evidence-sufficiency', verdict: tested ? 'pass' : 'concern', finding: tested ? 'predicted metric observed' : 'predicted metric never observed (untested claim)' };
  },
  function numericalStability(h, ctx) {
    const metrics = new Set((h.predictedObservations ?? []).concat(h.disconfirmingObservations ?? []).map((p) => p.metric));
    let bad = 0;
    for (const obs of ctx.observations) for (const mm of metrics) if (mm in obs && !Number.isFinite(obs[mm])) bad++;
    return { lens: 'numerical-stability', verdict: bad > 0 ? 'concern' : 'pass', finding: bad > 0 ? `${bad} non-finite metric value(s)` : 'metric values finite' };
  },
];

/** Aggregate critic votes into a decision. FAIL on falsifiability/contradiction, or
 * ≥2 fails, → REJECT; any other fail or concern → REVISE; all clear → ACCEPT. */
export function decide(critiques) {
  const fails = critiques.filter((c) => c.verdict === 'fail');
  const concerns = critiques.filter((c) => c.verdict === 'concern');
  const hardFail = fails.some((f) => f.lens === 'contradictory-evidence' || f.lens === 'falsifiability');
  if (hardFail || fails.length >= 2) return SWARM_DECISION.REJECT;
  if (fails.length >= 1 || concerns.length >= 1) return SWARM_DECISION.REVISE;
  return SWARM_DECISION.ACCEPT;
}

/**
 * Run the swarm on one hypothesis: persist each critique as evidence, aggregate a
 * decision, and update the hypothesis lifecycle (only the swarm can ACCEPT). Returns
 * { critiques, decision }.
 */
export function critiqueHypothesis(db, missionId, hypothesisId) {
  const h = store.getHypothesis(db, hypothesisId);
  if (!h) throw new Error(`hypothesis not found: ${hypothesisId}`);
  const observations = store.listEvidence(db, missionId)
    .map((e) => (e.content && typeof e.content === 'object' ? e.content : null))
    .filter(Boolean);
  const siblingCount = store.listHypotheses(db, missionId)
    .filter((x) => x.id !== h.id && x.questionId === h.questionId && h.questionId != null).length;
  const ctx = { observations, siblingCount };

  const critiques = LENSES.map((fn) => fn(h, ctx));
  // Persist each critique as an independent, append-only evidence object.
  for (const c of critiques) {
    ev.recordEvidence(db, {
      missionId, kind: 'finding', epistemicStatus: ev.EPISTEMIC_STATUS.INFERRED,
      content: { critic: c.lens, verdict: c.verdict, finding: c.finding },
      origin: 'agent', source: `critic:${c.lens}`, hypothesisId,
    });
  }
  const decision = decide(critiques);
  if (decision === SWARM_DECISION.REJECT) {
    ev.updateHypothesisStatus(db, hypothesisId, { status: 'rejected', epistemicStatus: ev.EPISTEMIC_STATUS.REJECTED });
  } else if (decision === SWARM_DECISION.ACCEPT) {
    ev.updateHypothesisStatus(db, hypothesisId, { status: 'accepted', epistemicStatus: ev.EPISTEMIC_STATUS.SUPPORTED });
  } else {
    // REVISE: keep open but mark provisional so it is not mistaken for accepted.
    ev.updateHypothesisStatus(db, hypothesisId, { epistemicStatus: ev.EPISTEMIC_STATUS.PROVISIONAL });
  }
  return { critiques, decision };
}

/** Critique every open/supported hypothesis for a mission (or one question). */
export function critiqueMission(db, missionId, { questionId = null } = {}) {
  const hyps = store.listHypotheses(db, missionId)
    .filter((h) => (questionId ? h.questionId === questionId : true) && (h.status === 'open' || h.status === 'supported' || h.status === 'contradicted'));
  return hyps.map((h) => ({ hypothesisId: h.id, label: h.label, ...critiqueHypothesis(db, missionId, h.id) }));
}
