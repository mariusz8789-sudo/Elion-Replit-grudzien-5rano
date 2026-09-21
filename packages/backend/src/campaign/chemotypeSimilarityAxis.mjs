/**
 * D-075 — GLP1R_CHEMOTYPE_SIMILARITY: a COMPUTATIONAL SCREENING PROXY.
 *
 * ========================= WHAT THIS AXIS IS NOT =========================
 *
 * It is NOT an efficacy predictor. It is NOT a measured or modelled activity.
 * It CANNOT close `EFFICACY_AXIS_UNAVAILABLE`, and it can NEVER justify a
 * target-potency objective. Structural resemblance to an active compound is
 * not activity: activity cliffs are routine, and two molecules one atom apart
 * can differ by orders of magnitude at a receptor.
 *
 * What it IS: Tanimoto similarity (Morgan r=2, 2048 bits) between a candidate
 * and a set of pinned, confirmed GLP-1R actives, computed by the SAME RDKit
 * worker command (`similarity`) that has existed in this repo all along and
 * simply had no Node caller until `rdkitAdapter.mjs::similarity` was added.
 * Its honest use is triage — ordering and screening a generated population —
 * never adjudication.
 *
 * THE GUARD IS IN CODE, NOT IN A COMMENT. `assertNotEfficacyAxis()` below
 * throws if any caller tries to present this axis as the decisive
 * TARGET_RELEVANT_ACTIVITY axis, and `axisContribution()` returns the axis
 * name tagged with its evidence class so a consumer cannot lose the
 * distinction by passing a bare string around.
 *
 * FAIL CLOSED ON DATA. The pinned actives artifact does not exist in this
 * runtime (ChEMBL is unreachable, HTTP 403, so the pinning job has never
 * run here). Every entry point below therefore returns BLOCKED today — and
 * BLOCKED is a real answer, never a zero and never a silent skip.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { similarity as rdkitSimilarity, validate as rdkitValidate } from '../compute/rdkitAdapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const CHEMOTYPE_SIMILARITY_AXIS = 'GLP1R_CHEMOTYPE_SIMILARITY';
export const TARGET_RELEVANT_ACTIVITY_AXIS = 'TARGET_RELEVANT_ACTIVITY';

export const CHEMOTYPE_HONESTY_NOTE =
  'Tanimoto similarity (Morgan r=2, 2048 bits) to pinned confirmed GLP-1R actives. A COMPUTATIONAL SCREENING PROXY for triage only: structural resemblance is not activity (activity cliffs are routine). It is not a measured or modelled potency, it does not close EFFICACY_AXIS_UNAVAILABLE, and it can never establish a target-potency objective.';

export const PINNED_ACTIVES_PATH = path.join(HERE, 'pinnedActives.json');
export const PINNED_ACTIVES_META_PATH = path.join(HERE, 'pinnedActives.meta.json');

/**
 * Hard guard: this axis may never be handed to a consumer as the decisive
 * activity axis. Throws rather than returning false, because a caller that
 * got this far has already made a category error.
 */
export function assertNotEfficacyAxis(axisName) {
  if (axisName === TARGET_RELEVANT_ACTIVITY_AXIS) {
    throw new Error(
      `FAIL_CLOSED[CHEMOTYPE_IS_NOT_EFFICACY]: ${CHEMOTYPE_SIMILARITY_AXIS} is a screening proxy and may never be presented as ${TARGET_RELEVANT_ACTIVITY_AXIS}. The GLP-1R efficacy predictor remains a separate, open blocker.`,
    );
  }
  return axisName;
}

/**
 * Loads the pinned actives artifact, fail-closed on every failure mode:
 * absent, hash drift, empty, unparseable SMILES, incomplete provenance.
 * `validateSmiles` is injected so this stays testable without RDKit.
 */
export function loadPinnedActives({
  jsonPath = PINNED_ACTIVES_PATH,
  metaPath = PINNED_ACTIVES_META_PATH,
  validateSmiles = (s) => rdkitValidate(s).ok,
} = {}) {
  if (!existsSync(jsonPath) || !existsSync(metaPath)) {
    return {
      ok: false, code: 'PIN_MISSING',
      reason: 'pinned GLP-1R actives artifact absent — it has never been produced in this runtime because ChEMBL is unreachable (HTTP 403); a network-enabled CI runner must fetch and pin it with human-verified source ids',
    };
  }
  let raw;
  let meta;
  try {
    raw = readFileSync(jsonPath, 'utf8');
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (err) {
    return { ok: false, code: 'PIN_UNREADABLE', reason: String(err?.message ?? err).slice(0, 200) };
  }
  const digest = createHash('sha256').update(raw).digest('hex');
  if (typeof meta?.sha256 !== 'string' || meta.sha256.length === 0) {
    return { ok: false, code: 'PIN_UNVERIFIED', reason: 'meta records no sha256 for the actives artifact' };
  }
  if (digest !== meta.sha256) {
    return { ok: false, code: 'PIN_HASH_DRIFT', reason: `actives sha256 ${digest} != pinned ${meta.sha256} — refusing to read a drifted artifact` };
  }
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch (err) {
    return { ok: false, code: 'PIN_UNREADABLE', reason: String(err?.message ?? err).slice(0, 200) };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, code: 'PIN_EMPTY', reason: 'pinned actives list is empty' };
  }
  const actives = [];
  for (const r of rows) {
    if (typeof r?.canonicalSmiles !== 'string' || !validateSmiles(r.canonicalSmiles)) {
      return { ok: false, code: 'PIN_PARSE_FAIL', reason: `row ${r?.label ?? '(unlabelled)'}: canonicalSmiles absent or not parseable by RDKit` };
    }
    if (!r.label || !r.sourceId || !r.sourceUrl || !r.fetchedAt) {
      return { ok: false, code: 'PIN_PROVENANCE_INCOMPLETE', reason: `row ${r.label ?? '(unlabelled)'}: missing label/sourceId/sourceUrl/fetchedAt` };
    }
    actives.push(Object.freeze({
      label: r.label, canonicalSmiles: r.canonicalSmiles,
      potencyNm: Number.isFinite(r.potencyNm) ? r.potencyNm : null,
      sourceId: r.sourceId, sourceUrl: r.sourceUrl, fetchedAt: r.fetchedAt,
    }));
  }
  return { ok: true, actives: Object.freeze(actives), contentSha256: digest };
}

/**
 * Computes the axis for one structure against the pinned actives. Returns the
 * single nearest active and its Tanimoto. A structure RDKit cannot compare is
 * UNAVAILABLE, never 0 — "no overlap" and "could not be computed" are
 * different facts (the same distinction `structuralSimilarity.ts` already
 * draws on the frontend side).
 */
export function computeChemotypeSimilarity(smiles, pinned, { similarityFn = rdkitSimilarity } = {}) {
  const base = {
    axis: CHEMOTYPE_SIMILARITY_AXIS, unit: 'tanimoto', uncertainty: null,
    evidenceClass: 'COMPUTATIONAL', honestyNote: CHEMOTYPE_HONESTY_NOTE,
    isEfficacyPredictor: false,
  };
  if (!pinned?.ok) {
    return Object.freeze({ ...base, status: 'BLOCKED', value: null, nearest: null, sameScaffold: null, provenance: pinned?.reason ?? 'no pinned actives', blockedReason: pinned?.code ?? 'PIN_MISSING' });
  }
  let best = null;
  let comparisons = 0;
  for (const a of pinned.actives) {
    const r = similarityFn(smiles, a.canonicalSmiles);
    if (!r?.ok || !Number.isFinite(r.tanimoto)) continue;
    comparisons += 1;
    if (best === null || r.tanimoto > best.value) best = { value: r.tanimoto, label: a.label, sameScaffold: r.sameScaffold ?? null };
  }
  if (best === null) {
    return Object.freeze({ ...base, status: 'UNAVAILABLE', value: null, nearest: null, sameScaffold: null, provenance: `0/${pinned.actives.length} comparisons computable`, blockedReason: 'SIMILARITY_UNCOMPUTABLE' });
  }
  return Object.freeze({
    ...base, status: 'AVAILABLE', value: best.value, nearest: best.label, sameScaffold: best.sameScaffold,
    provenance: `nearest of ${comparisons} pinned GLP-1R active(s): ${best.label}; RDKit Morgan r=2/2048 Tanimoto`,
  });
}

/**
 * What this axis contributes to a comparable-axis set — tagged, so a consumer
 * cannot pass a bare axis name around and lose the evidence class. Returns an
 * empty list unless the axis is genuinely AVAILABLE.
 */
export function axisContribution(axisResult) {
  if (axisResult?.status !== 'AVAILABLE') return Object.freeze([]);
  return Object.freeze([Object.freeze({
    axis: assertNotEfficacyAxis(axisResult.axis),
    evidenceClass: axisResult.evidenceClass,
    decisive: false,
    closesEfficacyAxis: false,
  })]);
}

/**
 * Frozen chemotype screening gate. Refuses without a frozen rule; refuses on
 * an unavailable axis. Never invents a default minimum — an absent rule is an
 * error, not "no gate".
 */
export function applyChemotypeGate(axisResult, frozenRule) {
  if (!frozenRule || typeof frozenRule.minTanimoto !== 'number') {
    return { ok: false, code: 'RULE_MISSING', reason: 'no frozen chemotype rule supplied — refusing to invent a screening threshold' };
  }
  if (axisResult?.status !== 'AVAILABLE') {
    return { ok: false, code: 'AXIS_UNAVAILABLE', reason: axisResult?.blockedReason ?? axisResult?.status ?? 'no axis result' };
  }
  if (axisResult.value < frozenRule.minTanimoto) {
    return { ok: false, code: 'CHEMOTYPE_BELOW_FROZEN_MIN', value: axisResult.value, min: frozenRule.minTanimoto };
  }
  return { ok: true, value: axisResult.value, nearest: axisResult.nearest };
}
