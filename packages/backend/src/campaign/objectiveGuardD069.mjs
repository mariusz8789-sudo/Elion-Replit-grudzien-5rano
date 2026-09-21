/**
 * D-069 OPTION A — OBJECTIVE VECTOR GUARD (frozen decision, enforced in code).
 *
 * `runCampaign` reads `campaign.objectiveVector` from the DATABASE
 * (`orchestrator.mjs`: `campaign.objectiveVector.length ? campaign.objectiveVector
 * : adapter.DEFAULT_OBJECTIVES`; persisted as `objective_vector_json`,
 * `persistence.mjs:20`) — a caller can set arbitrary objectives per campaign
 * WITHOUT touching any code. Two real properties of the existing pipeline
 * make that a live way to defeat D-069 Option A if left unchecked:
 *
 *  1. `pareto.mjs::hypervolume2D` reads `p[0]`/`p[1]` only. A campaign with
 *     more than two objectives does not error — it silently truncates the
 *     stopping criterion to its first two dimensions
 *     (`metricsSnapshot`/`recomputePareto` in orchestrator.mjs both do
 *     `Object.values(r.objectiveVector)` positionally).
 *  2. Nothing stops an objective's `targetProperty` from naming a
 *     MODEL_ESTIMATE prediction term — which would fold a model estimate
 *     into the very hypervolume/Pareto metric D-069 froze as untouched.
 *
 * This guard makes both cases fail closed instead of silently corrupting
 * the campaign's own stopping criterion. It is pure and side-effect free;
 * `orchestrator.mjs::runCampaign` is the real caller.
 */

export function assertCampaignObjectivesD069(objectives, frozenPredictionTerms) {
  const list = objectives ?? [];
  const bad = list.filter((o) => frozenPredictionTerms.includes(o.targetProperty));
  if (bad.length > 0) {
    return {
      ok: false,
      code: 'OBJECTIVE_IS_PREDICTION_TERM',
      reason: `objectives contain prediction term(s): ${bad.map((o) => o.targetProperty).join(', ')} — D-069 Option A: predictions are frozen hard filters applied BEFORE Pareto, never objectives`,
    };
  }
  if (list.length !== 2) {
    return {
      ok: false,
      code: 'OBJECTIVE_COUNT_NOT_TWO',
      reason: `hypervolume2D reads p[0],p[1] only (pareto.mjs); ${list.length} objective(s) would be silently truncated instead of corrupting the stopping criterion`,
    };
  }
  return { ok: true };
}
