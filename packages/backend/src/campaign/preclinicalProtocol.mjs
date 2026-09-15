/**
 * D-082 — PRECLINICAL CANDIDATE PROTOCOL: the artifact a NEW molecule can
 * actually receive.
 *
 * ===================== THE DESIGN HOLE THIS CLOSES ========================
 *
 * D-081 established that `mounjaroResearchRecipe.ts` can never issue a recipe
 * for a newly generated compound — not from weak data, but STRUCTURALLY. The
 * canonical Winner Gate requires at least one observation at or above
 * INDIRECT_RANDOMISED (rank 9); computation ranks COMPUTATIONAL (rank 2); and
 * a molecule that was invented last week has no randomised trial behind it by
 * definition. So "ResearchRecipe" is, correctly, an artifact for repositioning
 * compounds that already carry clinical evidence.
 *
 * That left new candidates with NOTHING to hand a laboratory — which is how
 * projects end up quietly loosening a gate. This module is the honest
 * alternative: a deliberately WEAKER artifact that says exactly what was
 * computed, exactly what was not, and exactly which wet-lab experiment would
 * raise each axis to a rank the canonical gate would actually accept.
 *
 * ==================== WHY IT CANNOT BE MISTAKEN FOR ONE ===================
 *
 *   - Its `kind` is `PRECLINICAL_CANDIDATE_PROTOCOL`. Nothing else.
 *   - It carries NO `recipe` and NO `winnerRecord` property, and the builder
 *     REJECTS input carrying either, so one cannot be smuggled in through a
 *     spread.
 *   - `gateLock.winnerRecordPossibleNow` and `gateLock.recipePossibleNow` are
 *     hard `false`, written by this module, never by the caller.
 *   - Every axis must declare evidenceClass COMPUTATIONAL or MODEL_ESTIMATE.
 *     Anything stronger is REFUSED here: a randomised observation does not
 *     belong in a preclinical protocol, it belongs in front of the real gate.
 *   - `requiredWetLab` must be non-empty. A protocol that asks for no
 *     experiment is a conclusion wearing a protocol's clothes.
 *
 * This module does not promote anything and has no path to promotion.
 * Promotion happens only where it already happened: the canonical gate, on
 * real evidence, through `mounjaroResearchRecipe.ts`.
 */

import { canonicalHash } from '../provenance.mjs';

export const PROTOCOL_KIND = 'PRECLINICAL_CANDIDATE_PROTOCOL';
export const PROTOCOL_CONTRACT_VERSION = 'preclinical-protocol-v1';

/** The only evidence classes a computational protocol may carry on an axis. */
export const ALLOWED_AXIS_EVIDENCE = Object.freeze(['COMPUTATIONAL', 'MODEL_ESTIMATE']);

/** Ranks a wet-lab experiment could plausibly reach. Never DIRECT_RANDOMISED — one assay is not a trial. */
export const ALLOWED_WETLAB_RANKS = Object.freeze(['OBSERVATIONAL', 'INDIRECT_RANDOMISED']);

export const PROTOCOL_DISCLAIMER =
  'PRECLINICAL COMPUTATIONAL PROTOCOL. This is not a medicine, not a treatment, not a dose and not a clinical recommendation. Every number in it is computed, not measured. It exists to tell a laboratory exactly which experiment to run next and what each result would license — nothing in it licenses anything on its own.';

function fail(code, detail) {
  return { ok: false, code, detail };
}

/**
 * Builds the protocol, or refuses with an exact code. Refusals are returned,
 * not thrown, so a caller handling many candidates records each rejection
 * rather than losing the batch to one bad input.
 */
export function buildPreclinicalProtocol(input) {
  if (!input || typeof input !== 'object') return fail('INVALID_INPUT', 'no input object');

  // The anti-smuggling check, on the INPUT — where a caller could actually put
  // one — rather than on an object this function just built itself.
  if ('recipe' in input) return fail('INPUT_CARRIES_RECIPE', 'a preclinical protocol may not carry or wrap a ResearchRecipe');
  if ('winnerRecord' in input) return fail('INPUT_CARRIES_WINNER_RECORD', 'a preclinical protocol may not carry or wrap a WinnerRecord');
  if ('gateLock' in input) return fail('INPUT_OVERRIDES_GATE_LOCK', 'gateLock is written by this module and may not be supplied');

  const { candidateId, canonicalSmiles, scaffold } = input;
  if (typeof candidateId !== 'string' || candidateId.length === 0) return fail('NO_CANDIDATE_ID', 'a protocol needs a subject');
  if (typeof canonicalSmiles !== 'string' || canonicalSmiles.length === 0) return fail('NO_STRUCTURE', 'a protocol with no structure is a protocol for nothing');

  const axes = Array.isArray(input.axes) ? input.axes : [];
  if (axes.length === 0) return fail('NO_AXES', 'a protocol with no computed axis reports nothing');
  for (const a of axes) {
    if (!ALLOWED_AXIS_EVIDENCE.includes(a?.evidenceClass)) {
      return fail('AXIS_EVIDENCE_TOO_STRONG', `axis "${a?.axis}" declares evidenceClass "${a?.evidenceClass}"; a preclinical protocol may only carry ${ALLOWED_AXIS_EVIDENCE.join(' or ')}. Stronger evidence belongs in front of the canonical Winner Gate, not in here.`);
    }
  }

  const requiredWetLab = Array.isArray(input.requiredWetLab) ? input.requiredWetLab : [];
  if (requiredWetLab.length === 0) return fail('NO_WETLAB_REQUESTED', 'a protocol that asks for no experiment is a conclusion in disguise');
  for (const w of requiredWetLab) {
    if (typeof w?.assay !== 'string' || w.assay.length === 0) return fail('WETLAB_WITHOUT_ASSAY', 'every requested experiment must name its assay');
    if (!ALLOWED_WETLAB_RANKS.includes(w?.rankIfPassed)) {
      return fail('WETLAB_RANK_INVALID', `requested experiment "${w?.id}" claims rankIfPassed "${w?.rankIfPassed}"; allowed: ${ALLOWED_WETLAB_RANKS.join(', ')}`);
    }
  }

  const body = {
    kind: PROTOCOL_KIND,
    contractVersion: PROTOCOL_CONTRACT_VERSION,
    candidateId,
    canonicalSmiles,
    scaffold: typeof scaffold === 'string' ? scaffold : null,
    axes: axes.map((a) => Object.freeze({
      axis: String(a.axis),
      value: Number.isFinite(a.value) ? a.value : null,
      uncertainty: Number.isFinite(a.uncertainty) ? a.uncertainty : null,
      evidenceClass: a.evidenceClass,
      outOfDomain: a.outOfDomain === true,
      // An axis whose model is BLOCKED is reported as blocked, not omitted —
      // the absence of a number is itself the finding.
      blockedReason: typeof a.blockedReason === 'string' ? a.blockedReason : null,
    })),
    falsificationSurvived: Object.freeze([...(input.falsificationSurvived ?? [])].map(String)),
    falsificationOpen: Object.freeze([...(input.falsificationOpen ?? [])].map(String)),
    noveltyStatus: ['PRIOR_ART_UNVERIFIED', 'NOVEL_VS_PINNED', 'REDISCOVERY'].includes(input.noveltyStatus)
      ? input.noveltyStatus
      : 'PRIOR_ART_UNVERIFIED',
    requiredWetLab: requiredWetLab.map((w) => Object.freeze({ id: String(w.id ?? w.assay), assay: w.assay, rankIfPassed: w.rankIfPassed, whyItRaisesRank: String(w.whyItRaisesRank ?? 'a real measurement replaces a model estimate on this axis') })),
    provenance: Object.freeze([...(input.provenance ?? [])].map(String)),
    // Written HERE, never by the caller. Both literally false.
    gateLock: Object.freeze({
      winnerRecordPossibleNow: false,
      recipePossibleNow: false,
      why: 'every axis in this artifact is COMPUTATIONAL or MODEL_ESTIMATE; the canonical Winner Gate requires at least one observation at or above INDIRECT_RANDOMISED, which no amount of computation reaches',
    }),
    disclaimer: PROTOCOL_DISCLAIMER,
  };

  return { ok: true, protocol: Object.freeze({ ...body, protocolFingerprint: canonicalHash(body).slice(0, 16) }) };
}

/** The invariant a test — or a reviewer — checks on any protocol in hand. */
export function protocolInvariantHolds(p) {
  return !!p
    && p.kind === PROTOCOL_KIND
    && !('recipe' in p)
    && !('winnerRecord' in p)
    && p.gateLock?.winnerRecordPossibleNow === false
    && p.gateLock?.recipePossibleNow === false
    && Array.isArray(p.requiredWetLab) && p.requiredWetLab.length > 0
    && p.axes.every((a) => ALLOWED_AXIS_EVIDENCE.includes(a.evidenceClass));
}
