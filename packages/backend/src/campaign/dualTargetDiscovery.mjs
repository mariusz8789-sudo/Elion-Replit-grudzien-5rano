/**
 * D-081 — DUAL-TARGET (GLP-1R + GIPR) joint objective layer.
 *
 * ======================= WHY A JOINT LAYER AT ALL =========================
 *
 * Tirzepatide is a dual GIP/GLP-1 receptor agonist. A candidate scored only at
 * GLP-1R has not been compared to tirzepatide's mechanism at all. This module
 * is where "is this a plausible next-generation alternative to tirzepatide"
 * becomes a question with a shape, and where the honest answer today is that
 * the question cannot yet be asked of any candidate.
 *
 * ================== WHAT THIS MODULE REFUSES TO DO ========================
 *
 * 1. `score = glp1rScore + giprScore` — REFUSED. Two potencies at two
 *    different receptors are not commensurable quantities; adding them
 *    invents a unit that does not exist and lets a strong GLP-1R number hide
 *    a dead GIPR number. Each objective below stays a SEPARATE axis and
 *    ranking is Pareto-dominance over the axis vector (reusing
 *    `pareto.mjs::paretoFrontIndices`, the same front the molecular campaign
 *    already uses), never a weighted scalar.
 * 2. Mixing MODEL_ESTIMATE with EVIDENCE. Every axis carries an explicit
 *    `kind`. A predicted activity is `MODEL_ESTIMATE`; a measured potency
 *    from the pinned A2 table is `MEASURED`; a computed descriptor is
 *    `COMPUTED_PROPERTY`. `rankDualTarget` will not place a MODEL_ESTIMATE
 *    and a MEASURED value on the same axis for different candidates, because
 *    that comparison would silently upgrade a prediction into an observation.
 * 3. Proceeding on a half-available mechanism. If either receptor axis is
 *    unavailable, the joint layer is `MECHANISM_INCOMPLETE` and produces NO
 *    ranking at all. A candidate cannot be "provisionally dual" — being dual
 *    is the hypothesis under test, not a default.
 *
 * ========================= TODAY'S REAL STATE =============================
 *
 * GLP-1R: model exists (D-077/D-079) but is BLOCKED by its own frozen gate at
 * MAE 1.0425 > MAX_MAE 1.0. GIPR: BLOCKED for lack of data — two activity
 * rows exist in the whole repository against a MIN_TRAIN of 150, and ChEMBL
 * egress is refused by proxy policy. So both receptor axes are unavailable,
 * and this layer reports MECHANISM_INCOMPLETE with both reasons named. That
 * is the scientifically correct output, and it is computed, not hardcoded:
 * `assessDualTargetAxes` asks the two capability probes at call time.
 */

import { canonicalHash } from '../provenance.mjs';
import { paretoFrontIndices } from './pareto.mjs';

export const DUAL_TARGET_CONTRACT_VERSION = 'dual-target-v1';

/** How a number reached an axis. Never collapsed into one word. */
export const VALUE_KIND = Object.freeze({
  MEASURED: 'MEASURED',
  MODEL_ESTIMATE: 'MODEL_ESTIMATE',
  COMPUTED_PROPERTY: 'COMPUTED_PROPERTY',
  UNAVAILABLE: 'UNAVAILABLE',
});

/**
 * The objectives, declared explicitly with direction and rationale — the
 * directive's "zaprojektuj jawnie", not an implicit sum. `decisive: true`
 * means an unavailable axis BLOCKS the joint layer rather than being skipped.
 */
export const DUAL_TARGET_OBJECTIVES = Object.freeze([
  Object.freeze({ id: 'GLP1R_ACTIVITY', direction: 'maximize', unit: 'pActivity', decisive: true, why: 'half of the tirzepatide mechanism; without it the candidate is not a comparator at all' }),
  Object.freeze({ id: 'GIPR_ACTIVITY', direction: 'maximize', unit: 'pActivity', decisive: true, why: 'the other half; a GLP-1R-only candidate is a semaglutide analogue, not a tirzepatide alternative' }),
  Object.freeze({ id: 'RECEPTOR_BALANCE', direction: 'minimize', unit: '|dpActivity|', decisive: false, why: 'tirzepatide is imbalanced by design (GIP-biased); this axis reports the imbalance rather than assuming a target ratio, and is NOT decisive because no frozen rule in this repository declares what the right balance is' }),
  Object.freeze({ id: 'LIABILITY_BURDEN', direction: 'minimize', unit: 'frozen-rule hits', decisive: true, why: 'the mission asks for a LOWER selected adverse-effect burden (molecularLiabilities.mjs, frozen thresholds)' }),
  Object.freeze({ id: 'DEVELOPABILITY', direction: 'minimize', unit: 'ADMET risk proxy', decisive: false, why: 'a computed proxy from the existing multi-fidelity ADMET stage; a proxy is not a developability finding, so it informs ranking without gating it' }),
  Object.freeze({ id: 'STRUCTURAL_FEASIBILITY', direction: 'minimize', unit: 'RDKit rejections', decisive: true, why: 'an unparseable or unsanitizable structure is not a candidate' }),
  Object.freeze({ id: 'NOVELTY', direction: 'maximize', unit: 'prior-art status', decisive: true, why: 'a rediscovery is not a discovery; an UNSEARCHED prior art axis blocks rather than counts as novel' }),
]);

export const DUAL_TARGET_OBJECTIVE_FINGERPRINT = canonicalHash(DUAL_TARGET_OBJECTIVES.map((o) => [o.id, o.direction, o.decisive])).slice(0, 16);

/**
 * Asks both receptor capability probes and reports, per axis, whether a joint
 * comparison is possible AT ALL. Probes are injected so this stays testable
 * without RDKit/pins, and so a test can prove the AVAILABLE branch really
 * exists rather than being unreachable code.
 */
export function assessDualTargetAxes({ glp1rProbe, giprProbe, priorArtSearched = false }) {
  const glp1r = glp1rProbe();
  const gipr = giprProbe();
  const axes = [];
  const blockers = [];

  const receptor = (id, probe) => {
    const available = probe.available === true;
    axes.push({ id, available, kind: available ? VALUE_KIND.MODEL_ESTIMATE : VALUE_KIND.UNAVAILABLE, code: probe.code ?? null, reasons: Object.freeze([...(probe.reasons ?? [])]) });
    if (!available) blockers.push({ code: `${id}_UNAVAILABLE`, detail: probe.reasons?.[0] ?? probe.code ?? 'no reason reported' });
  };
  receptor('GLP1R_ACTIVITY', glp1r);
  receptor('GIPR_ACTIVITY', gipr);

  const bothReceptors = axes.every((a) => a.available);
  axes.push({
    id: 'RECEPTOR_BALANCE', available: bothReceptors,
    kind: bothReceptors ? VALUE_KIND.MODEL_ESTIMATE : VALUE_KIND.UNAVAILABLE,
    code: bothReceptors ? null : 'REQUIRES_BOTH_RECEPTOR_AXES',
    reasons: Object.freeze(bothReceptors ? [] : ['a selectivity/balance number needs BOTH receptor predictions on the SAME candidate; one of them is unavailable, and a balance computed against a missing number would be fiction']),
  });

  if (!priorArtSearched) {
    blockers.push({ code: 'PRIOR_ART_UNVERIFIABLE', detail: 'prior-art search is unreachable from this runtime, so novelty was never observed — absence of a hit is not evidence of novelty' });
  }

  return Object.freeze({
    contractVersion: DUAL_TARGET_CONTRACT_VERSION,
    objectiveFingerprint: DUAL_TARGET_OBJECTIVE_FINGERPRINT,
    axes: Object.freeze(axes.map(Object.freeze)),
    mechanismComplete: bothReceptors,
    blockers: Object.freeze(blockers),
    status: bothReceptors && blockers.length === 0 ? 'JOINT_COMPARISON_POSSIBLE' : 'MECHANISM_INCOMPLETE',
  });
}

/**
 * Pareto ranking over the declared objective vector — REUSES
 * `pareto.mjs::paretoFrontIndices` (minimization), so maximize-direction axes
 * are negated on the way in rather than a second front implementation being
 * written here.
 *
 * FAIL-CLOSED in three ways before any ranking happens:
 *   MECHANISM_INCOMPLETE  a decisive axis is unavailable
 *   MIXED_VALUE_KINDS     one axis holds a MEASURED value for one candidate
 *                         and a MODEL_ESTIMATE for another — ranking those
 *                         against each other would launder a prediction into
 *                         an observation
 *   NO_CANDIDATES         nothing to rank
 */
export function rankDualTarget(candidates, assessment) {
  if (assessment.status !== 'JOINT_COMPARISON_POSSIBLE') {
    return Object.freeze({ ok: false, code: 'MECHANISM_INCOMPLETE', reasons: Object.freeze(assessment.blockers.map((b) => `${b.code}: ${b.detail}`)), front: Object.freeze([]) });
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return Object.freeze({ ok: false, code: 'NO_CANDIDATES', reasons: Object.freeze(['no candidate survived the earlier stages to be ranked']), front: Object.freeze([]) });
  }

  const decisive = DUAL_TARGET_OBJECTIVES.filter((o) => o.decisive || candidates.every((c) => c.objectives?.[o.id] !== undefined));
  for (const o of decisive) {
    const kinds = new Set(candidates.map((c) => c.objectives?.[o.id]?.kind ?? VALUE_KIND.UNAVAILABLE));
    if (kinds.has(VALUE_KIND.UNAVAILABLE)) {
      return Object.freeze({ ok: false, code: 'AXIS_UNAVAILABLE_FOR_A_CANDIDATE', reasons: Object.freeze([`axis ${o.id} is unavailable for at least one candidate`]), front: Object.freeze([]) });
    }
    if (kinds.size > 1) {
      return Object.freeze({ ok: false, code: 'MIXED_VALUE_KINDS', reasons: Object.freeze([`axis ${o.id} mixes ${[...kinds].join(' and ')} across candidates — a model estimate and a measurement are not comparable on one axis`]), front: Object.freeze([]) });
    }
  }

  // NON-FINITE VALUES ARE REFUSED, NOT COERCED. Two real defects were found
  // here by probing rather than reading: `Number(null)` is 0, so a missing
  // measurement silently became a real measurement of zero (and on a minimize
  // axis it would have WON); and `NaN` makes every comparison false, so a
  // garbage value was never dominated and entered the Pareto front unbeaten.
  // A value that is not a finite number is missing data, and missing data
  // blocks the ranking rather than scoring anywhere in it.
  for (const c of candidates) {
    for (const o of decisive) {
      const raw = c.objectives?.[o.id]?.value;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return Object.freeze({
          ok: false,
          code: 'NON_FINITE_AXIS_VALUE',
          reasons: Object.freeze([`candidate "${c.id}" carries ${raw === null ? 'null' : String(raw)} on axis ${o.id}; a missing or non-finite value is missing data, never a score of zero`]),
          front: Object.freeze([]),
        });
      }
    }
  }

  const vectors = candidates.map((c) => decisive.map((o) => {
    const v = c.objectives[o.id].value;
    return o.direction === 'maximize' ? -v : v;
  }));
  const frontIdx = paretoFrontIndices(vectors);
  return Object.freeze({
    ok: true,
    axesUsed: Object.freeze(decisive.map((o) => o.id)),
    front: Object.freeze(frontIdx.map((i) => candidates[i])),
    /** Never "the best candidate": a Pareto front is a set of non-dominated points, not a winner. */
    note: 'Pareto front over the declared dual-target objectives. Membership of this front is NOT a verdict and NOT a winner; it only means no other ranked candidate dominated this one on every axis.',
  });
}

/**
 * The joint-layer verdict. Its CEILING is DUAL_TARGET_MODEL_ESTIMATE — this
 * function has no branch that can return WINNER, by construction. Promotion
 * is decided elsewhere, by the canonical Winner Gate, from evidence rather
 * than from model output.
 */
export function dualTargetVerdict(assessment, ranking) {
  const blockers = [...assessment.blockers];
  if (!ranking.ok && ranking.code) blockers.push({ code: ranking.code, detail: ranking.reasons?.[0] ?? '' });
  const outcome = blockers.length === 0 && ranking.ok && ranking.front.length > 0 ? 'DUAL_TARGET_MODEL_ESTIMATE' : 'NO_DUAL_TARGET_CANDIDATE';
  return Object.freeze({
    outcome,
    blockers: Object.freeze(blockers),
    ceiling: 'DUAL_TARGET_MODEL_ESTIMATE',
    claimBoundary:
      'Even the best possible output of this layer is a COMPUTATIONAL model estimate at two receptors. It is not affinity data, not a cellular assay, not an animal result and not a clinical finding. No output of this module may be described as a tirzepatide or Mounjaro replacement.',
    fingerprint: canonicalHash({ outcome, blockers, objectiveFingerprint: assessment.objectiveFingerprint }).slice(0, 16),
  });
}
