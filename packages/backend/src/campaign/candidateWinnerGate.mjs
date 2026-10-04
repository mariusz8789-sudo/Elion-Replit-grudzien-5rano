/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * THE PREREGISTERED WINNER GATE FOR A THERAPEUTIC COMPUTATIONAL CANDIDATE (D-164).
 *
 * WHAT IT IS. One pure function over a DOSSIER — the campaign's own persisted record,
 * projected by its caller — that answers a single question with one of four verdicts:
 *
 *   NO_CANDIDATE            a blocking criterion does not hold
 *   REJECTED_SAFETY_VETO    a preregistered fatal safety criterion is MET
 *   LEAD_FOR_FURTHER_VALIDATION   every blocking criterion holds, something else does not
 *   COMPUTATIONAL_CANDIDATE every criterion holds
 *
 * There is no fifth verdict. `FINAL WINNER` is not a value this module can return, is
 * not in the frozen rule's verdict list, and cannot be reached by any dossier, option
 * or external record — because a computation cannot establish that a molecule is a
 * medicine. `assertNoFinalWinner()` and the test suite both pin that.
 *
 * SAFETY IS NOT A FOOTNOTE AFTER EFFICACY. The axes are reported SEPARATELY, each with
 * its own evidence status, and there is no weighted total anywhere in this file. A
 * weighted total is precisely the mechanism by which a strong efficacy number hides an
 * unacceptable safety signal, so none is computed. The HARD SAFETY VETO is evaluated
 * FIRST and short-circuits everything: a met fatal safety criterion rejects the
 * candidate whatever its efficacy.
 *
 * NOTHING HERE IS SPECIFIC TO GLP-1R OR TO WEIGHT LOSS. The target, the axes' values,
 * and the fatal safety criteria all arrive in the dossier from the campaign's own
 * preregistration. Weight loss is the first demonstration campaign, not this gate's
 * subject.
 *
 * NO EXTERNAL INPUT MAY INJECT A WINNER. Every criterion is DERIVED from evidence
 * fields. A dossier may carry `verdict`, `outcome`, `winner`, `gateOutcome`,
 * `criteria`, `finalWinner` or any other self-report: this module reads none of them,
 * records that it saw them, and decides from the evidence alone.
 *
 * THRESHOLDS ARE NEVER CHANGED AFTER A RESULT IS SEEN. The criteria, the axis list, the
 * veto rule and the preference order live in `candidate-winner-gate.json`, loaded
 * through the ONE generic gate loader this repository has
 * (`campaign/validationGate.mjs::loadValidationGate`, D-081), which fails closed on a
 * missing file, a missing fingerprint, a fingerprint that does not match the file's own
 * hash (GATE_TAMPERED), or a fingerprint that is not the one the caller preregistered
 * (GATE_MISMATCH). This module has no path that evaluates against an unfrozen rule.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../provenance.mjs';
import { loadValidationGate } from './validationGate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const CANDIDATE_WINNER_GATE_PATH = path.join(HERE, 'candidate-winner-gate.json');

/**
 * The only verdicts that exist, ordered WEAKEST FIRST — and that order is the ranking
 * order. `REJECTED_SAFETY_VETO` is weakest because it is an affirmative rejection,
 * where `NO_CANDIDATE` is only an unmet requirement. `FINAL_WINNER` is deliberately
 * absent and cannot be added by a caller.
 */
export const GATE_VERDICTS = Object.freeze([
  'REJECTED_SAFETY_VETO',
  'NO_CANDIDATE',
  'LEAD_FOR_FURTHER_VALIDATION',
  'COMPUTATIONAL_CANDIDATE',
]);

/** Evidence status of one axis. UNKNOWN is never neutral and never favourable. */
export const AXIS_STATUSES = Object.freeze([
  'MEASURED', 'EXTERNAL_PUBLISHED', 'COMPUTATIONAL', 'MODEL_ESTIMATE', 'UNKNOWN', 'BLOCKED',
]);

/** Fields a dossier might carry that assert their own result. Read for nothing; reported. */
export const SELF_REPORT_FIELDS = Object.freeze([
  'verdict', 'outcome', 'winner', 'isWinner', 'finalWinner', 'gateOutcome', 'gateVerdict',
  'criteria', 'criterionResults', 'axes', 'safetyVeto', 'override', 'forceVerdict', 'status',
]);

/** Loads the frozen rule. Fails closed; never returns a default rule. */
export function loadCandidateWinnerGate({ expectedRuleFingerprint } = {}) {
  return loadValidationGate(CANDIDATE_WINNER_GATE_PATH, {
    targetLabel: 'candidate winner',
    expectedRuleFingerprint,
  });
}

/**
 * Throws if a caller ever tries to name a verdict this gate does not define. Exported so
 * the surrounding pipeline can assert the same thing at its own boundaries.
 */
export function assertNoFinalWinner(verdict) {
  if (!GATE_VERDICTS.includes(verdict)) {
    throw new Error(`candidate winner gate has no verdict '${verdict}' — the strongest verdict is COMPUTATIONAL_CANDIDATE`);
  }
  return verdict;
}

const bool = (v) => v === true;
const nonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const arr = (v) => (Array.isArray(v) ? v : []);

/* ----------------------------------------------------------------------------
 * The criteria. Each is a pure predicate over EVIDENCE fields of the dossier.
 * Each returns { held, detail } and never reads a self-reported verdict.
 * -------------------------------------------------------------------------- */

const IDENTITY_FIELDS = Object.freeze([
  'canonicalSmiles', 'inchi', 'inchiKey', 'molecularFormula', 'molWt', 'formalCharge', 'stereochemistry',
]);

function checkIdentity(d) {
  const id = d.identity ?? {};
  const missing = IDENTITY_FIELDS.filter((f) => {
    const v = id[f];
    if (f === 'molWt' || f === 'formalCharge') return !Number.isFinite(v);
    if (f === 'stereochemistry') return v === null || v === undefined;
    return !nonEmptyString(v);
  });
  return missing.length === 0
    ? { held: true, detail: `identity resolved: ${id.inchiKey}` }
    : { held: false, detail: `identity incomplete — missing ${missing.join(', ')}` };
}

function checkNoIdentityConflict(d) {
  const records = arr(d.identityRecords);
  if (records.length === 0) return { held: false, detail: 'no identity records to cross-check — a single unchecked identity is not a checked one' };
  const byCandidate = new Map();
  const byKey = new Map();
  for (const r of records) {
    if (!nonEmptyString(r.candidateId) || !nonEmptyString(r.inchiKey)) {
      return { held: false, detail: 'an identity record carries no candidateId or no inchiKey' };
    }
    const seenKeys = byCandidate.get(r.candidateId) ?? new Set();
    seenKeys.add(r.inchiKey);
    byCandidate.set(r.candidateId, seenKeys);
    const seenIds = byKey.get(r.inchiKey) ?? new Set();
    seenIds.add(r.candidateId);
    byKey.set(r.inchiKey, seenIds);
  }
  for (const [candidateId, keys] of byCandidate) {
    if (keys.size > 1) return { held: false, detail: `candidate ${candidateId} carries ${keys.size} different structures` };
  }
  for (const [key, ids] of byKey) {
    if (ids.size > 1) return { held: false, detail: `InChIKey ${key} appears under ${ids.size} different candidate ids` };
  }
  return { held: true, detail: `${records.length} identity record(s) agree` };
}

function checkProvenance(d) {
  const items = arr(d.dataItems);
  if (items.length === 0) return { held: false, detail: 'the dossier lists no data items, so provenance cannot be complete' };
  const bad = items.filter((i) => !nonEmptyString(i.source) || !nonEmptyString(i.licence) || !nonEmptyString(i.retrievedOrComputed));
  return bad.length === 0
    ? { held: true, detail: `${items.length} data item(s) each carry source, licence and a retrieval/computation record` }
    : { held: false, detail: `${bad.length} of ${items.length} data item(s) lack source, licence or a retrieval/computation record` };
}

function checkNoTamper(d, ruleFingerprint) {
  if (nonEmptyString(d.expectedGateRuleFingerprint) && d.expectedGateRuleFingerprint !== ruleFingerprint) {
    return { held: false, detail: `the campaign preregistered gate rule ${d.expectedGateRuleFingerprint}, the repository holds ${ruleFingerprint}` };
  }
  const artefacts = arr(d.hashedArtefacts);
  if (artefacts.length === 0) return { held: false, detail: 'no hashed artefact to verify — an unverifiable dossier is not a tamper-free one' };
  const bad = artefacts.filter((a) => !nonEmptyString(a.recordedHash) || !nonEmptyString(a.recomputedHash) || a.recordedHash !== a.recomputedHash);
  return bad.length === 0
    ? { held: true, detail: `${artefacts.length} artefact hash(es) recomputed equal` }
    : { held: false, detail: `${bad.length} artefact hash(es) differ from their record: ${bad.map((a) => a.id ?? '?').join(', ')}` };
}

function checkTargetRelevance(d) {
  const t = d.targetRelevance ?? {};
  if (!nonEmptyString(t.target)) return { held: false, detail: 'no target named' };
  if (!nonEmptyString(t.phenotype)) return { held: false, detail: 'no phenotype named' };
  const sources = arr(t.sources).filter((s) => nonEmptyString(s.source) && nonEmptyString(s.claim));
  if (sources.length === 0) return { held: false, detail: `no source-backed evidence links ${t.target} to ${t.phenotype}` };
  if (!bool(t.candidateActsOnTarget)) {
    return { held: false, detail: `${sources.length} source(s) link ${t.target} to ${t.phenotype}, but the dossier does not establish that this candidate acts on that target` };
  }
  return { held: true, detail: `${t.target} -> ${t.phenotype} backed by ${sources.length} source(s); candidate proposed to act on it` };
}

/**
 * THE HARD SAFETY VETO plus the no-known-fatal-property criterion, from the SAME
 * preregistered criterion list, so the two can never disagree.
 *
 * A criterion is one of:
 *   MET      -> veto. The candidate is REJECTED_SAFETY_VETO whatever its efficacy.
 *   NOT_MET  -> this criterion is satisfied.
 *   UNKNOWN  -> no veto (there is nothing to assert) but NO_KNOWN_FATAL_PROPERTY fails,
 *               unless the preregistration itself allowed this criterion to stand
 *               unevaluated.
 */
export function evaluateSafetyVeto(d) {
  const criteria = arr(d.fatalSafetyCriteria);
  if (criteria.length === 0) {
    return {
      vetoed: false,
      allCriteriaResolved: false,
      met: [],
      unknown: [],
      detail: 'the campaign preregistered no fatal safety criteria — a therapeutic candidate gate with no fatal safety criterion is not evaluable on safety',
    };
  }
  const met = [];
  const unknown = [];
  for (const c of criteria) {
    if (!nonEmptyString(c.id)) continue;
    if (c.result === 'MET') met.push({ id: c.id, basis: c.basis ?? null, source: c.source ?? null });
    else if (c.result !== 'NOT_MET') unknown.push({ id: c.id, reason: c.reason ?? c.result ?? 'UNKNOWN', unevaluatedAllowedByPrereg: bool(c.unevaluatedAllowedByPrereg) });
  }
  const blockingUnknown = unknown.filter((u) => !u.unevaluatedAllowedByPrereg);
  return {
    vetoed: met.length > 0,
    allCriteriaResolved: blockingUnknown.length === 0,
    met,
    unknown,
    detail: met.length > 0
      ? `HARD SAFETY VETO: ${met.map((m) => m.id).join(', ')} MET — efficacy is not consulted`
      : blockingUnknown.length > 0
        ? `${blockingUnknown.length} fatal safety criterion/criteria UNKNOWN: ${blockingUnknown.map((u) => u.id).join(', ')} — UNKNOWN is not safe`
        : `${criteria.length} fatal safety criterion/criteria all NOT_MET`,
  };
}

function checkModelValidity(d) {
  const models = arr(d.modelsRelied);
  if (models.length === 0) return { held: true, detail: 'no fitted model output is relied on, so there is no model validity to establish' };
  const problems = [];
  for (const m of models) {
    const name = m.modelId ?? m.modelVersion ?? '?';
    if (!bool(m.clearedItsFrozenGate)) problems.push(`${name}: did not clear its own frozen validation gate`);
    else if (m.inApplicabilityDomain !== true) {
      problems.push(`${name}: candidate is ${m.inApplicabilityDomain === false ? 'OUTSIDE' : 'of UNKNOWN standing in'} the model's measured applicability domain${nonEmptyString(m.applicabilityDomainEvidence) ? ` (${m.applicabilityDomainEvidence})` : ''}`);
    }
  }
  return problems.length === 0
    ? { held: true, detail: `${models.length} model(s) cleared their frozen gate with the candidate inside the measured applicability domain` }
    : { held: false, detail: problems.join('; ') };
}

function checkFalsification(d) {
  const f = d.falsification ?? {};
  if (!bool(f.attempted)) return { held: false, detail: 'no attempt was made to overturn the candidacy' };
  if (!Array.isArray(f.findings)) return { held: false, detail: 'falsification was attempted but its findings were not recorded' };
  return { held: true, detail: `falsification attempted; ${f.findings.length} finding(s) recorded` };
}

function checkReplayMatch(d) {
  const runs = arr(d.scienceRuns);
  if (runs.length === 0) return { held: false, detail: 'no science run to replay — an unreplayed dossier has no Replay match' };
  const bad = runs.filter((r) => r.replayVerdict !== 'MATCH');
  return bad.length === 0
    ? { held: true, detail: `${runs.length} science run(s) replayed MATCH` }
    : { held: false, detail: `${bad.length} of ${runs.length} science run(s) did not replay MATCH: ${bad.map((r) => `${r.runId ?? '?'}=${r.replayVerdict ?? 'MISSING'}`).join(', ')}` };
}

function checkEvidencePackValid(d) {
  const p = d.evidencePack ?? {};
  if (p.status !== 'VALID') return { held: false, detail: `Evidence Pack status ${p.status ?? 'ABSENT'}` };
  const runs = arr(d.scienceRuns).map((r) => r.runId).filter(nonEmptyString);
  const covered = new Set(arr(p.coversRunIds).filter(nonEmptyString));
  const missing = runs.filter((r) => !covered.has(r));
  if (missing.length > 0) return { held: false, detail: `Evidence Pack does not cover ${missing.length} science run(s): ${missing.join(', ')}` };
  if (!bool(p.includesNegativeResults)) return { held: false, detail: 'Evidence Pack does not include the negative results' };
  if (bool(p.signed)) return { held: false, detail: 'Evidence Pack claims to be signed — there is no signing key in this system, packages are UNSIGNED' };
  return { held: true, detail: `Evidence Pack VALID over ${covered.size} run(s), negative results included, UNSIGNED` };
}

function checkChemistryHandoffComplete(d) {
  const h = d.chemistryHandoff ?? {};
  if (h.status === 'COMPLETE') return { held: true, detail: 'chemistry handoff package COMPLETE' };
  const missing = arr(h.missingItems);
  return { held: false, detail: `chemistry handoff package ${h.status ?? 'ABSENT'}${missing.length ? ` — ${missing.length} item(s) missing: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ', …' : ''}` : ''}` };
}

function checkLabValueOfInformation(d) {
  const required = Object.freeze(['whatIsLearned', 'canChangeADecision', 'whichCandidateItEliminates', 'cheaperRouteToSameInformation', 'publicDataAlreadyAnswersIt']);
  const proposals = arr(d.proposedExperiments);
  if (proposals.length === 0) return { held: true, detail: 'no physical experiment is proposed, so no value-of-information record is owed' };
  const problems = [];
  for (const p of proposals) {
    const v = p.labValueOfInformation ?? {};
    const missing = required.filter((f) => v[f] === null || v[f] === undefined || v[f] === '');
    if (missing.length > 0) problems.push(`${p.id ?? '?'}: missing ${missing.join(', ')}`);
    else if (v.publicDataAlreadyAnswersIt === true) problems.push(`${p.id ?? '?'}: public data already answers it — a chemist must not be sent to the bench for it`);
    else if (v.canChangeADecision === false) problems.push(`${p.id ?? '?'}: cannot change a decision`);
  }
  return problems.length === 0
    ? { held: true, detail: `${proposals.length} proposed experiment(s) each carry a complete LAB_VALUE_OF_INFORMATION record` }
    : { held: false, detail: problems.join('; ') };
}

const CHECKS = Object.freeze({
  IDENTITY: checkIdentity,
  NO_IDENTITY_CONFLICT: checkNoIdentityConflict,
  PROVENANCE: checkProvenance,
  NO_TAMPER: checkNoTamper,
  TARGET_RELEVANCE: checkTargetRelevance,
  NO_KNOWN_FATAL_PROPERTY: null, // from the veto evaluation, so the two can never disagree
  MODEL_VALIDITY: checkModelValidity,
  FALSIFICATION: checkFalsification,
  REPLAY_MATCH: checkReplayMatch,
  EVIDENCE_PACK_VALID: checkEvidencePackValid,
  CHEMISTRY_HANDOFF_COMPLETE: checkChemistryHandoffComplete,
  LAB_VALUE_OF_INFORMATION: checkLabValueOfInformation,
});

/* ----------------------------------------------------------------------------
 * Axes. Reported separately, never summed.
 * -------------------------------------------------------------------------- */

function projectAxes(gate, d) {
  const supplied = new Map(arr(d.axisEvidence).map((a) => [a.axis, a]));
  return gate.axes.map((spec) => {
    const a = supplied.get(spec.id) ?? null;
    const status = a && AXIS_STATUSES.includes(a.status) ? a.status : 'UNKNOWN';
    return {
      axis: spec.id,
      direction: spec.direction,
      safetyAxis: spec.safetyAxis === true,
      status,
      value: a && status !== 'UNKNOWN' && status !== 'BLOCKED' ? (a.value ?? null) : null,
      unit: a?.unit ?? null,
      endpointDefinition: a?.endpointDefinition ?? null,
      source: a?.source ?? null,
      limitation: a?.limitation ?? null,
      // Stated on every axis so a reader cannot take an absent value as a good one.
      unknownIsNotFavourable: status === 'UNKNOWN' || status === 'BLOCKED',
    };
  });
}

/* ----------------------------------------------------------------------------
 * The gate.
 * -------------------------------------------------------------------------- */

/**
 * Evaluates one dossier. Pure: reads no file but the frozen rule, writes nothing,
 * and returns the same result for the same dossier.
 *
 * @param {object} dossier projection of the campaign's persisted evidence
 * @param {{ expectedRuleFingerprint?: string }} [options]
 */
export function evaluateCandidateWinnerGate(dossier, { expectedRuleFingerprint } = {}) {
  const loaded = loadCandidateWinnerGate({ expectedRuleFingerprint });
  if (!loaded.ok) return { ok: false, code: loaded.code, reason: loaded.reason };
  const { gate, ruleFingerprint } = loaded;

  const d = dossier && typeof dossier === 'object' ? dossier : {};

  // Self-reports are recorded and then ignored. This is the "no external input may
  // inject a winner" property, made visible rather than merely intended.
  const ignoredSelfReports = SELF_REPORT_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(d, f));

  const track = nonEmptyString(d.track) && Object.prototype.hasOwnProperty.call(gate.tracks, d.track)
    ? d.track
    : null;
  const trackCStrict = track === 'C_NOVEL_COMPUTATIONAL';

  // 1. THE HARD SAFETY VETO, FIRST. Nothing below it can lift it.
  const veto = evaluateSafetyVeto(d);

  // 2. Every criterion, derived from evidence.
  const criterionResults = gate.requiredCriteria.map((spec) => {
    let r;
    if (spec.id === 'NO_KNOWN_FATAL_PROPERTY') {
      r = veto.vetoed
        ? { held: false, detail: veto.detail }
        : { held: veto.allCriteriaResolved && arr(d.fatalSafetyCriteria).length > 0, detail: veto.detail };
    } else if (spec.id === 'NO_TAMPER') {
      r = checkNoTamper(d, ruleFingerprint);
    } else {
      r = CHECKS[spec.id](d);
    }
    return {
      id: spec.id,
      asks: spec.asks,
      // For track C every criterion is blocking: a novel structure carries less real
      // safety data and may not reach a candidate verdict on a thinner trail.
      blocking: trackCStrict ? true : spec.blocking === true,
      blockingBecauseTrackC: trackCStrict && spec.blocking !== true,
      held: r.held === true,
      detail: r.detail,
    };
  });

  const failedBlocking = criterionResults.filter((c) => c.blocking && !c.held);
  const failedOther = criterionResults.filter((c) => !c.blocking && !c.held);

  // 3. The verdict. The order of these branches IS the rule.
  let verdict;
  let reason;
  if (veto.vetoed) {
    verdict = 'REJECTED_SAFETY_VETO';
    reason = `${veto.detail}. A met fatal safety criterion rejects the candidate whatever its efficacy axis shows.`;
  } else if (failedBlocking.length > 0) {
    verdict = 'NO_CANDIDATE';
    reason = `${failedBlocking.length} blocking criterion/criteria do not hold: ${failedBlocking.map((c) => `${c.id} (${c.detail})`).join('; ')}`;
  } else if (failedOther.length > 0) {
    verdict = 'LEAD_FOR_FURTHER_VALIDATION';
    reason = `every blocking criterion holds, but ${failedOther.length} further criterion/criteria do not: ${failedOther.map((c) => `${c.id} (${c.detail})`).join('; ')}`;
  } else {
    verdict = 'COMPUTATIONAL_CANDIDATE';
    reason = 'every preregistered criterion holds. This is a computational candidate with an evidence trail, not a medicine and not a clinical finding.';
  }
  assertNoFinalWinner(verdict);

  const axes = projectAxes(gate, d);

  // 4. The IP gate. A new computational proposal, or unverified novelty, needs review
  //    before its structure is published anywhere.
  const novelty = d.noveltyStatus ?? 'PRIOR_ART_UNVERIFIED';
  const ipReview = novelty === 'KNOWN_COMPOUND' ? 'PASS' : 'IP_REVIEW_REQUIRED';

  const body = {
    kind: 'GENESIS_CANDIDATE_WINNER_GATE_RESULT',
    contractVersion: gate.contractVersion,
    gateRuleFingerprint: ruleFingerprint,
    candidateId: d.candidateId ?? null,
    track,
    trackStrictness: trackCStrict ? 'stricter: every criterion is blocking for a novel computational lead' : 'standard',
    verdict,
    reason,
    verdictsThatExist: GATE_VERDICTS,
    finalWinnerIsNotAVerdict: gate.whyFinalWinnerDoesNotExist,
    safetyVeto: {
      isHard: true,
      vetoed: veto.vetoed,
      metCriteria: veto.met,
      unknownCriteria: veto.unknown,
      detail: veto.detail,
      efficacyCannotOverrideIt: true,
      neverClaimZeroSideEffects: gate.safetyVeto.neverClaimZeroSideEffects,
    },
    criteria: criterionResults,
    blockingFailures: failedBlocking.map((c) => c.id),
    otherFailures: failedOther.map((c) => c.id),
    axes,
    axesAreNeverSummed: true,
    axesAreNeverSummedNote: gate.axesAreNeverSummedNote,
    unknownAxes: axes.filter((a) => a.status === 'UNKNOWN' || a.status === 'BLOCKED').map((a) => a.axis),
    preferenceOrderAtComparableScience: gate.preferenceOrderAtComparableScience,
    preferenceIsATieBreakOnly: gate.preferenceIsATieBreakOnly,
    referenceMaterialAvailability: d.referenceMaterialAvailability ?? 'UNKNOWN',
    existingCompoundStatus: d.existingCompoundStatus ?? 'UNKNOWN',
    noveltyStatus: novelty,
    ipReview,
    ignoredSelfReports,
    ignoredSelfReportsNote: 'These fields were present in the dossier and were NOT read. Every criterion above is derived from evidence fields; no external input can inject a verdict.',
    claimBoundary: 'A computational result about a structure and its evidence trail. Not a measurement of any molecule in any organism, not clinical efficacy, not safety clearance, and never a claim that adverse effects are absent.',
  };
  return { ok: true, result: { ...body, resultFingerprint: canonicalHash(body).slice(0, 16) } };
}

/**
 * Orders candidates that have ALREADY passed the gate. Science first: a candidate with a
 * stronger verdict never loses to a weaker one, and the commercial/availability preference
 * is a TIE-BREAK between candidates with the same verdict, the same failed criteria and the
 * same unknown axes. It computes no score and merges no axis.
 */
export function orderGatedCandidates(results) {
  const rank = (r) => GATE_VERDICTS.indexOf(r.verdict);
  const prefRank = (r) => {
    const order = r.preferenceOrderAtComparableScience ?? [];
    const i = order.indexOf(r.existingCompoundStatus);
    return i === -1 ? order.length : i;
  };
  const profile = (r) => `${r.verdict}|${[...r.blockingFailures, ...r.otherFailures].sort().join(',')}|${[...r.unknownAxes].sort().join(',')}`;
  const ordered = [...results].sort((a, b) => {
    const byVerdict = rank(b) - rank(a);
    if (byVerdict !== 0) return byVerdict;
    // Only a comparable scientific profile may be broken by the preference order.
    if (profile(a) === profile(b)) {
      const byPref = prefRank(a) - prefRank(b);
      if (byPref !== 0) return byPref;
    }
    return String(a.candidateId ?? '').localeCompare(String(b.candidateId ?? ''));
  });
  return ordered.map((r, i) => {
    // The preference order decided this position only if the neighbour it outranks has
    // the same scientific profile and a worse preference rank. Reported, not assumed.
    const next = ordered[i + 1] ?? null;
    const tieBroken = next !== null && profile(r) === profile(next) && prefRank(r) < prefRank(next);
    return {
      rank: i + 1,
      candidateId: r.candidateId,
      verdict: r.verdict,
      existingCompoundStatus: r.existingCompoundStatus,
      tieBrokenOnPreference: tieBroken,
      scientificProfile: profile(r),
    };
  });
}
