/**
 * Competing Hypothesis Engine (Priority 4 — cognitive ceiling).
 *
 * Generates SETS of genuinely competing, falsifiable hypotheses for a research
 * question, and evaluates them against evidence with Popperian discipline: a
 * single satisfied disconfirming prediction contradicts a hypothesis (failure is
 * information). Never lets the first plausible explanation become truth by default.
 *
 * Determinism & honesty:
 *  - Predictions and disconfirming observations are STRUCTURED predicates
 *    ({metric, op, value}) so evaluation against evidence is deterministic and
 *    auditable — not an LLM vibe. Confidence stays optional and is never fabricated.
 *  - General natural-language hypothesis generation needs a reasoning model behind
 *    the Model Router (Priority 7); an unknown template returns an explicit
 *    CAPABILITY_GAP rather than inventing hypotheses. In-order choice, not a reorder.
 *  - This engine PROPOSES and applies deterministic falsification logic; independent
 *    adversarial critics (proposer != sole judge) are Priority 5 and build on this.
 */
import * as ev from './evidenceStore.mjs';
import * as store from '../store.mjs';

const OPS = Object.freeze({
  '<': (a, b) => a < b, '<=': (a, b) => a <= b,
  '>': (a, b) => a > b, '>=': (a, b) => a >= b,
  '==': (a, b) => a === b, '!=': (a, b) => a !== b,
});

/**
 * Evaluate a structured predicate {metric, op, value} against an observation map.
 * Returns true/false when the metric is present and the op is known, else null
 * (not evaluable — honestly distinct from false).
 */
export function evalPredicate(pred, obs) {
  if (!pred || typeof pred !== 'object' || !(pred.metric in (obs ?? {}))) return null;
  const fn = OPS[pred.op];
  if (!fn) return null;
  return fn(obs[pred.metric], pred.value);
}

/* ---------------- Generation ---------------- */

const GENERATORS = { 'descriptor-vs-binding': genDescriptorVsBinding };

/**
 * Generate a competing-hypothesis set. Returns { status, hypotheses, reason? }.
 * status: 'generated' | 'CAPABILITY_GAP'.
 */
export function generateCompetingHypotheses(db, { missionId, questionId = null, template = 'descriptor-vs-binding', params = {} }) {
  if (!missionId) throw new Error('missionId required');
  const gen = GENERATORS[template];
  if (!gen) {
    return {
      status: 'CAPABILITY_GAP', hypotheses: [],
      reason: `no deterministic generator for template "${template}"; general hypothesis generation requires the Model Router (Priority 7)`,
    };
  }
  return { status: 'generated', hypotheses: gen(db, missionId, questionId, params) };
}

function genDescriptorVsBinding(db, missionId, questionId, params) {
  const strong = params.strongAffinityKcalMol ?? -6.0; // favorable docking threshold
  const weak = params.weakAffinityKcalMol ?? -3.0; // weak/no binding threshold
  const h1 = ev.addHypothesis(db, {
    missionId, questionId, label: 'H1',
    claim: 'Descriptor/ADMET-favorable candidates also bind the target favorably.',
    assumptions: ['2D property optimality tracks 3D pocket complementarity'],
    predictedObservations: [{ metric: 'dockingAffinity', op: '<=', value: strong }],
    disconfirmingObservations: [{ metric: 'dockingAffinity', op: '>', value: weak }],
    requiredEvidence: ['molecular-descriptors', 'molecular-docking'],
  });
  const h2 = ev.addHypothesis(db, {
    missionId, questionId, label: 'H2',
    claim: 'Descriptor/ADMET-favorable candidates do NOT reliably bind (2D/3D mismatch).',
    assumptions: ['descriptors ignore solvation, entropy and pocket geometry'],
    predictedObservations: [{ metric: 'dockingAffinity', op: '>', value: weak }],
    disconfirmingObservations: [{ metric: 'dockingAffinity', op: '<=', value: strong }],
    requiredEvidence: ['molecular-descriptors', 'molecular-docking'],
  });
  return [h1, h2];
}

/* ---------------- Evaluation (Popperian) ---------------- */

/**
 * Evaluate open hypotheses against recorded evidence. A single satisfied
 * disconfirming prediction → CONTRADICTED (falsification dominates). Otherwise a
 * satisfied prediction → SUPPORTED. Updates each hypothesis's epistemic + lifecycle
 * status and returns a per-hypothesis tally. Deterministic; confidence untouched.
 */
export function evaluateHypothesesAgainstEvidence(db, missionId, { questionId = null } = {}) {
  const hyps = store.listHypotheses(db, missionId)
    .filter((h) => (questionId ? h.questionId === questionId : true) && h.status === 'open');
  const evidence = store.listEvidence(db, missionId);
  const observations = evidence
    .map((e) => (e.content && typeof e.content === 'object' ? e.content : null))
    .filter(Boolean);

  const results = [];
  for (const h of hyps) {
    let supported = 0; let contradicted = 0; let evaluated = 0;
    for (const obs of observations) {
      for (const p of h.disconfirmingObservations ?? []) {
        const r = evalPredicate(p, obs);
        if (r !== null) { evaluated++; if (r === true) contradicted++; }
      }
      for (const p of h.predictedObservations ?? []) {
        const r = evalPredicate(p, obs);
        if (r !== null) { evaluated++; if (r === true) supported++; }
      }
    }
    let epistemicStatus = h.epistemicStatus;
    let status = h.status;
    if (contradicted > 0) { epistemicStatus = ev.EPISTEMIC_STATUS.CONTRADICTED; status = 'contradicted'; }
    else if (supported > 0) { epistemicStatus = ev.EPISTEMIC_STATUS.SUPPORTED; status = 'supported'; }
    if (epistemicStatus !== h.epistemicStatus || status !== h.status) {
      ev.updateHypothesisStatus(db, h.id, { epistemicStatus, status });
    }
    results.push({ hypothesisId: h.id, label: h.label, supported, contradicted, evaluated, epistemicStatus, status });
  }
  return results;
}

export const HYPOTHESIS_TEMPLATES = Object.freeze(Object.keys(GENERATORS));
