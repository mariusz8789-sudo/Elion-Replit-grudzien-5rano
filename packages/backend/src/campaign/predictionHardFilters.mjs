/**
 * D-069 OPTION A — PREDICTION HARD FILTERS (frozen decision).
 *
 * MODEL_ESTIMATE predictions (ADMET-AI/Chemprop, docking) may NEVER become
 * an objective term: `campaign/pareto.mjs::hypervolume2D` and the campaign's
 * `objectiveVector` (`drugAdapter.mjs::objectiveVector`,
 * `orchestrator.mjs::metricsSnapshot`) are a validated stopping criterion,
 * and folding a model estimate into that vector would be Goodharting on the
 * model rather than discovering anything real. A model estimate's honest
 * epistemic role is narrower: it can rule a candidate OUT, never rank
 * candidates IN. This module is exactly that: a pure filter applied to the
 * candidate LIST, before Pareto/hypervolume ever see it. It never touches
 * `objectiveVector` or any candidate's descriptors.
 *
 * FROZEN BEFORE USE. Thresholds are read from a file whose `ruleFingerprint`
 * must equal the fingerprint the caller froze via
 * `core/agent/genesisAdjudicationProtocol.ts::freeze` (the SAME real,
 * unmodified D-047 freeze every other domain in this repo uses — no second
 * freeze mechanism, no locally invented hash). Missing or mismatched file =
 * fail closed; this module never falls back to "no filter".
 */

import { readFileSync, existsSync } from 'node:fs';

export const FROZEN_PREDICTION_THRESHOLDS_PATH = process.env.GENESIS_PREDICTION_THRESHOLDS ?? 'campaign/frozen-prediction-thresholds.json';

/**
 * Reads one prediction term from the shape `multiFidelity.mjs` actually
 * produces: `admetOut`/`toxOut` are `{ [endpointKey]: number }` — a bare
 * number, units held separately in `admetUnits`/`toxUnits`
 * (`multiFidelity.mjs::splitAdmetPrediction`) — and docking's affinity is
 * `bestAffinityKcalMol` (`multiFidelity.mjs:98`). `p.admet`/`p.tox` are the
 * caller's own projection of those two outputs onto one candidate; this
 * function does not assume where the caller got them, only their shape.
 */
function readTerm(p, term) {
  if (term === 'bestAffinityKcalMol') return Number.isFinite(p?.affinityKcalMol) ? p.affinityKcalMol : null;
  const v = p?.admet?.[term] ?? p?.tox?.[term];
  return Number.isFinite(v) ? v : null;
}

/**
 * Loads the frozen thresholds file and verifies its `ruleFingerprint`
 * against the one the caller froze via `genesisAdjudicationProtocol.ts`.
 * Fails closed on: file missing, unreadable, or fingerprint mismatch — the
 * mismatch case reuses the SAME check `execute()`'s own HARK guard performs
 * (a rule may not change after freeze), rather than a second definition of
 * "mismatch".
 */
export function loadFrozenPredictionThresholds(path = FROZEN_PREDICTION_THRESHOLDS_PATH, expectedRuleFingerprint) {
  if (!existsSync(path)) {
    return { ok: false, code: 'RULE_NOT_FROZEN', reason: 'frozen prediction thresholds file missing — refuse to gate candidates on unfrozen model estimates' };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { ok: false, code: 'RULE_NOT_FROZEN', reason: 'frozen prediction thresholds file unreadable' };
  }
  if (typeof raw.ruleFingerprint !== 'string' || raw.ruleFingerprint === '') {
    return { ok: false, code: 'RULE_NOT_FROZEN', reason: 'thresholds file carries no ruleFingerprint — was never produced by a real freeze()' };
  }
  if (expectedRuleFingerprint !== undefined && raw.ruleFingerprint !== expectedRuleFingerprint) {
    return { ok: false, code: 'RULE_MISMATCH', reason: `thresholds file ruleFingerprint (${raw.ruleFingerprint}) does not match the frozen rule (${expectedRuleFingerprint}) — a rule may not change after freeze` };
  }
  if (!Array.isArray(raw.terms) || raw.terms.length === 0) {
    return { ok: false, code: 'RULE_NOT_FROZEN', reason: 'thresholds file carries no terms' };
  }
  return { ok: true, thresholds: raw };
}

/**
 * Applies the frozen threshold terms as a hard filter over `candidates`.
 * Candidates that pass come back UNCHANGED (same object reference) — this
 * function never derives, adds, or mutates a descriptor, objectiveVector,
 * or score. A candidate with no prediction, or a prediction missing a
 * required term, is rejected with an explicit code — never silently
 * admitted and never silently dropped without a reason.
 */
export function applyPredictionHardFilters(candidates, predictionsFor, thresholds) {
  const survivors = [];
  const rejections = [];
  for (const c of candidates) {
    const p = predictionsFor(c.canonicalSmiles);
    const codes = [];
    if (!p) {
      codes.push('PREDICTION_MISSING');
    } else {
      for (const t of thresholds.terms) {
        const v = readTerm(p, t.term);
        if (v === null) {
          codes.push(`TERM_MISSING:${t.term}`);
          continue;
        }
        if (t.kind === 'max' && v > t.value) codes.push(`${t.term}_ABOVE_MAX`);
        if (t.kind === 'min' && v < t.value) codes.push(`${t.term}_BELOW_MIN`);
      }
    }
    if (codes.length > 0) rejections.push({ canonicalSmiles: c.canonicalSmiles, codes });
    else survivors.push(c);
  }
  return { survivors, rejections };
}
