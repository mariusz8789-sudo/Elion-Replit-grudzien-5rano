/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * THE SCIENTIST CHALLENGE PACK (D-164) — what a sceptical professional scientist is
 * handed so they can try to destroy the claim.
 *
 * It is built to be attacked. Every section exists because a reviewer would ask for it:
 * the question, the hypothesis, why this subject and not the competitors, the canonical
 * identity, the mechanism with its sources, the predicted property with its model's own
 * applicability-domain standing, the frozen protocol, the Evidence Pack, Replay, EVERY
 * negative result, the uncertainty, the exact falsification criterion, the minimum next
 * experiment with its value of information, and — stated as plainly as the positive case
 * — what a positive result would NOT mean.
 *
 * TWO PACKS, as the IP gate requires. `full` is the private pack for our own scientist.
 * `public` carries no structure: candidate id, structure hash, mechanism, methodology,
 * results and the Replay proof.
 *
 * IT CANNOT MANUFACTURE A SUBJECT. `verdict` is copied from the winner gate's own result
 * and is never recomputed here; a pack whose gate verdict is NO_CANDIDATE says so in its
 * first field and names the gate that stopped it. There is no code path in this module
 * that upgrades a verdict, and none that fills an absent section with prose.
 *
 * NOTHING IS SPECIFIC TO ONE TARGET OR ONE DISEASE. The caller supplies the campaign.
 */

import { canonicalHash } from '../provenance.mjs';
import { assertNonOperational } from './chemistryHandoffPackage.mjs';
import { GATE_VERDICTS } from './candidateWinnerGate.mjs';

export const CHALLENGE_PACK_KIND = 'GENESIS_SCIENTIST_CHALLENGE_PACK';
export const CHALLENGE_PACK_VERSION = 1;

/** Phrases no pack may ever contain. Enforced on the serialised pack, not just intended. */
export const FORBIDDEN_PHRASES = Object.freeze([
  'ai cured', 'drug discovered', 'clinically proven', 'zero side effects',
  'no side effects', 'signed evidence', 'open source engine', 'cure for',
]);

/**
 * Throws if the pack contains a phrase that overclaims. There is no exemption: a pack
 * that needs to quote one of these has to paraphrase it instead.
 */
export function assertNoOverclaiming(pack, { where = 'challenge pack' } = {}) {
  const text = JSON.stringify(pack).toLowerCase();
  const hits = FORBIDDEN_PHRASES.filter((p) => text.includes(p));
  if (hits.length > 0) throw new Error(`${where} contains forbidden phrase(s): ${hits.join(', ')}`);
  return true;
}

const UNKNOWN = (reason, whatWouldCloseIt) => Object.freeze({ status: 'UNKNOWN', value: null, reason, whatWouldCloseIt });

const filled = (v) => {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object' && typeof v.status === 'string') return !['UNKNOWN', 'BLOCKED', 'INCOMPLETE'].includes(v.status);
  if (typeof v === 'string') return v.trim() !== '';
  return true;
};

/**
 * One proposed experiment's value of information. The five questions are the owner's own,
 * and an experiment that cannot answer them is not proposed: it is reported as not
 * proposable and why.
 */
export function labValueOfInformation({
  id, assay, whatIsLearned, canChangeADecision, whichCandidateItEliminates,
  cheaperRouteToSameInformation, publicDataAlreadyAnswersIt, costClass = 'UNKNOWN',
}) {
  const record = {
    id,
    assay,
    whatIsLearned,
    canChangeADecision,
    whichCandidateItEliminates,
    cheaperRouteToSameInformation,
    publicDataAlreadyAnswersIt,
    costClass,
  };
  const missing = Object.entries(record).filter(([, v]) => v === null || v === undefined || v === '').map(([k]) => k);
  const proposable = missing.length === 0 && canChangeADecision === true && publicDataAlreadyAnswersIt === false;
  return {
    ...record,
    complete: missing.length === 0,
    missing,
    proposable,
    notProposableBecause: proposable ? null
      : missing.length > 0 ? `incomplete value-of-information record: ${missing.join(', ')}`
        : publicDataAlreadyAnswersIt === true ? 'public data already answers it — a chemist must not be sent to the bench for it'
          : 'it cannot change a decision',
  };
}

/**
 * A laboratory validation plan item. Every field is the caller's own, frozen BEFORE the
 * measurement; this function adds no number and no tolerance of its own.
 */
export function laboratoryValidationStep({
  id, parameter, assayType, unit, rangeOrTolerance,
  modelValueFrozenBeforeTheExperiment, whatTheRealMeasurementWillBe,
  rawFilesToKeep, hashing, qualityControl, secondPersonReview,
  modelVersusMeasurementComparison, evidenceProposal, whatWouldFalsifyTheCandidacy,
  valueOfInformation,
}) {
  const body = {
    id,
    parameter,
    assayType,
    unit,
    rangeOrTolerance,
    modelValueFrozenBeforeTheExperiment,
    whatTheRealMeasurementWillBe,
    rawFilesToKeep,
    hashing,
    qualityControl,
    secondPersonReview,
    modelVersusMeasurementComparison,
    evidenceProposal,
    whatWouldFalsifyTheCandidacy,
    labValueOfInformation: valueOfInformation,
    isClinical: false,
    isClinicalNote: 'An in-vitro or physicochemical measurement on a substance. Not a clinical investigation, not a study in humans, and never described as one.',
    executionAuthority: 'EXTERNAL_LAB_AND_ACCOUNTABLE_HUMAN_ONLY',
    operationalProcedure: 'NOT_INCLUDED — the laboratory designs execution under its own procedures, safety rules and regulations',
  };
  const required = ['parameter', 'assayType', 'unit', 'rangeOrTolerance', 'modelValueFrozenBeforeTheExperiment', 'whatTheRealMeasurementWillBe', 'rawFilesToKeep', 'hashing', 'qualityControl', 'secondPersonReview', 'modelVersusMeasurementComparison', 'evidenceProposal', 'whatWouldFalsifyTheCandidacy'];
  const missing = required.filter((k) => !filled(body[k]));
  return { ...body, status: missing.length === 0 ? 'READY_FOR_EXTERNAL_REVIEW' : 'INCOMPLETE', missingFields: missing };
}

/**
 * Builds the pack.
 *
 * @param {object} input
 * @param {object} input.gateResult the winner gate's own result object, copied not recomputed
 * @param {object} input.campaign { question, hypothesis, phenotype, target, preregistrationRefs }
 * @param {object} [input.chemistryHandoff] the result of buildChemistryHandoffPackage
 * @param {object} [input.baselineMatrix]
 * @param {object[]} [input.negativeResults] every result that did not go our way
 * @param {object[]} [input.competitorsRejected]
 * @param {object[]} [input.laboratoryPlan] laboratoryValidationStep() items
 * @param {object[]} [input.mechanismMap]
 * @param {object} [input.costToDecision]
 */
export function buildScientistChallengePack(input) {
  const {
    gateResult, campaign = {}, chemistryHandoff = null, baselineMatrix = null,
    negativeResults = [], competitorsRejected = [], laboratoryPlan = [],
    mechanismMap = [], costToDecision = null, tracks = null,
  } = input ?? {};

  if (!gateResult || typeof gateResult.verdict !== 'string') return { ok: false, code: 'NO_GATE_RESULT' };
  if (!GATE_VERDICTS.includes(gateResult.verdict)) return { ok: false, code: 'UNKNOWN_GATE_VERDICT', detail: gateResult.verdict };

  const hasSubject = gateResult.verdict === 'COMPUTATIONAL_CANDIDATE' || gateResult.verdict === 'LEAD_FOR_FURTHER_VALIDATION';

  const fullBody = {
    kind: CHALLENGE_PACK_KIND,
    contractVersion: CHALLENGE_PACK_VERSION,
    packVisibility: 'PRIVATE_FULL',

    // The first thing a reviewer reads is the verdict and what stopped it.
    verdict: gateResult.verdict,
    verdictCopiedFrom: { gateRuleFingerprint: gateResult.gateRuleFingerprint, resultFingerprint: gateResult.resultFingerprint },
    verdictIsNeverRecomputedHere: true,
    whatStoppedIt: gateResult.verdict === 'COMPUTATIONAL_CANDIDATE' ? null : gateResult.reason,
    blockingFailures: gateResult.blockingFailures ?? [],
    otherFailures: gateResult.otherFailures ?? [],
    safetyVeto: gateResult.safetyVeto ?? null,

    candidateId: gateResult.candidateId ?? null,
    track: gateResult.track ?? null,
    tracksConsidered: tracks ?? UNKNOWN('the caller supplied no track survey', 'a survey of track A existing/repurposing, track B known families and track C novel computational leads'),

    scientificQuestion: filled(campaign.question) ? campaign.question : UNKNOWN('no campaign question was supplied', 'the campaign objective'),
    hypothesis: filled(campaign.hypothesis) ? campaign.hypothesis : UNKNOWN('no hypothesis was supplied', 'the campaign preregistration'),
    phenotype: campaign.phenotype ?? null,
    target: campaign.target ?? null,
    preregistrationRefs: campaign.preregistrationRefs ?? [],

    whyThisSubjectWasChosen: hasSubject
      ? (filled(campaign.whyThisSubject) ? campaign.whyThisSubject : UNKNOWN('no selection rationale was supplied', 'the gate result plus the ordering that produced it'))
      : { status: 'NOT_APPLICABLE', value: null, reason: 'nothing was chosen: the gate returned no subject', whatWouldCloseIt: 'a candidate that reaches at least LEAD_FOR_FURTHER_VALIDATION' },
    whyTheCompetitorsWereRejected: competitorsRejected.length > 0 ? competitorsRejected : UNKNOWN('no competitor rejection record was supplied', 'a gate result per competitor'),

    canonicalIdentity: chemistryHandoff?.full?.items
      ? {
        candidateId: chemistryHandoff.full.candidateId,
        canonicalSmiles: chemistryHandoff.full.items.canonicalSmiles,
        inchi: chemistryHandoff.full.items.inchi,
        inchiKey: chemistryHandoff.full.items.inchiKey,
        molecularFormula: chemistryHandoff.full.items.molecularFormula,
        molecularWeight: chemistryHandoff.full.items.molecularWeight,
        stereochemistry: chemistryHandoff.full.items.stereochemistry,
        structureHash: chemistryHandoff.full.structureHash,
        purpose: chemistryHandoff.full.purpose,
      }
      : UNKNOWN('no chemistry handoff package was supplied', 'a structure, and a runtime that can compute its identity'),

    mechanism: mechanismMap.length > 0 ? mechanismMap : UNKNOWN('no mechanism map was supplied', 'per target: biological rationale, human expression, pathway, expected phenotype, known modulators, human evidence, safety liabilities, cross-reactivity, known failed programmes and the uncertainty'),

    predictedProperty: gateResult.axes ?? UNKNOWN('no axis evidence was supplied', 'the gate result\'s own axis projection'),
    predictedPropertyCaveat: 'Every axis above carries its own evidence status. An axis whose status is UNKNOWN or BLOCKED is not a neutral axis and not a favourable one. No axis is summed with any other.',

    baselineMatrix: baselineMatrix ?? UNKNOWN('no baseline matrix was supplied', 'the pinned human comparator record'),

    frozenProtocol: campaign.frozenProtocol ?? UNKNOWN('no frozen protocol was supplied', 'a preregistration committed before the run it governs'),
    evidencePack: campaign.evidencePack ?? UNKNOWN('no Evidence Pack projection was supplied', 'an Evidence Pack covering every science run relied on, including the negative ones'),
    replay: campaign.replay ?? UNKNOWN('no Replay projection was supplied', 'a canonical Replay verification per science run'),

    // The section a marketing document would omit.
    everyNegativeResult: negativeResults.length > 0 ? negativeResults : UNKNOWN('no negative results were supplied — which for a real campaign is itself suspicious', 'the campaign\'s failed arms, refuted hypotheses and wrong frozen predictions'),
    negativeResultsAreNotOptional: 'A pack with no negative results is either a campaign that never tested anything or a pack that hid them. This field is required and a reviewer should treat its absence as a defect.',

    uncertainty: campaign.uncertainty ?? UNKNOWN('no uncertainty projection was supplied', 'the campaign\'s own uncertainty record'),

    exactFalsificationCriterion: filled(campaign.falsificationCriterion)
      ? campaign.falsificationCriterion
      : UNKNOWN('no falsification criterion was supplied', 'a criterion frozen before the measurement that would decide against the subject'),

    minimumNextExperiment: laboratoryPlan.length > 0 ? laboratoryPlan[0] : UNKNOWN('no next experiment was proposed', 'the cheapest experiment that can falsify the key hypothesis'),
    laboratoryPlan: laboratoryPlan.length > 0 ? laboratoryPlan : UNKNOWN('no laboratory plan was supplied', 'at least one preregistered measurement with a frozen model value'),
    laboratoryWorkRequiredNow: laboratoryPlan.some((s) => s.status === 'READY_FOR_EXTERNAL_REVIEW' && s.labValueOfInformation?.proposable === true),

    whatAPositiveResultMeans: campaign.whatAPositiveResultMeans ?? UNKNOWN('not stated', 'the campaign\'s own reading of its primary endpoint'),
    whatAPositiveResultDoesNotMean: [
      'Not that the substance is a medicine. A measurement on a substance is not a therapeutic effect.',
      'Not that the substance is safe or tolerable. Neither follows from any in-vitro or computed value.',
      'Not that adverse effects are absent. That is a clinical finding and nothing in this pack reaches a clinical finding.',
      'Not that the computational model was right in general. One agreeing measurement is one agreeing measurement.',
      ...(campaign.whatAPositiveResultDoesNotMean ?? []),
    ],
    whatANegativeResultMeans: campaign.whatANegativeResultMeans ?? UNKNOWN('not stated', 'the campaign\'s own falsification rule'),

    chemistryHandoffStatus: chemistryHandoff?.status ?? 'ABSENT',
    chemistryHandoffMissingItems: chemistryHandoff?.missingItems ?? null,
    chemistryHandoff: chemistryHandoff?.full ?? null,

    ipReview: gateResult.ipReview ?? 'IP_REVIEW_REQUIRED',
    costToDecision: costToDecision ?? UNKNOWN('no cost-to-decision record was supplied', 'the discovery-timing stages for this campaign'),

    enginesAreNotOpenSourceClaim: 'This pack makes no licensing claim about any engine. Each engine\'s own licence governs its use.',
    unsigned: true,
    unsignedReason: 'There is no signing key in this system. This pack is UNSIGNED and its integrity rests on the hashes it carries.',
    claimBoundary: 'A computational result and the state of the evidence around it. Not a measurement in any organism, not a medicine, not safety clearance, and never a claim that adverse effects are absent.',
    howToAttackThisPack: [
      'Check that the gate rule fingerprint in verdictCopiedFrom is the one in the repository, and that it was frozen before the result.',
      'Check that every axis you would have relied on is not UNKNOWN. Most of them are.',
      'Check the model\'s applicability-domain standing for this subject, not just whether the model passed a gate.',
      'Read everyNegativeResult first. If it is short, ask what is missing.',
      'Check that no two numbers in the baseline matrix come from different populations, doses or trials without the limitation beside them.',
      'Try to find a cheaper way to get the information the minimum next experiment claims to buy. If you find one, the experiment should not be run.',
    ],
  };

  const publicBody = {
    kind: CHALLENGE_PACK_KIND,
    contractVersion: CHALLENGE_PACK_VERSION,
    packVisibility: 'PUBLIC_NO_STRUCTURE',
    verdict: gateResult.verdict,
    candidateId: gateResult.candidateId ?? null,
    structureHash: chemistryHandoff?.full?.structureHash ?? null,
    structureWithheld: true,
    structureWithheldReason: (gateResult.ipReview ?? 'IP_REVIEW_REQUIRED') === 'IP_REVIEW_REQUIRED'
      ? 'IP_REVIEW_REQUIRED: no SMILES, InChI, InChIKey, formula, structure file or chemistry handoff appears in a public pack until a review clears it.'
      : 'A public pack carries no structure by default.',
    scientificQuestion: fullBody.scientificQuestion,
    hypothesis: fullBody.hypothesis,
    mechanism: fullBody.mechanism,
    methodology: campaign.methodology ?? UNKNOWN('no methodology projection was supplied', 'the campaign preregistration and its engine list'),
    results: campaign.publicResults ?? UNKNOWN('no public result projection was supplied', 'the campaign\'s sealed results, including the negative ones'),
    everyNegativeResult: fullBody.everyNegativeResult,
    replayProof: fullBody.replay,
    whatStoppedIt: fullBody.whatStoppedIt,
    whatAPositiveResultDoesNotMean: fullBody.whatAPositiveResultDoesNotMean,
    chemistryHandoffIncluded: false,
    ipReview: fullBody.ipReview,
    unsigned: true,
    claimBoundary: fullBody.claimBoundary,
  };

  assertNoOverclaiming(fullBody, { where: 'the private challenge pack' });
  assertNoOverclaiming(publicBody, { where: 'the public pack' });
  assertNonOperational(fullBody, { where: 'the private challenge pack' });
  assertNonOperational(publicBody, { where: 'the public pack' });

  const publicText = JSON.stringify(publicBody);
  const smiles = chemistryHandoff?.full?.items?.canonicalSmiles;
  if (typeof smiles === 'string' && smiles !== '' && publicText.includes(smiles)) {
    throw new Error('the public pack leaked the structure');
  }

  return {
    ok: true,
    verdict: gateResult.verdict,
    full: { ...fullBody, packFingerprint: canonicalHash(fullBody).slice(0, 16) },
    public: { ...publicBody, packFingerprint: canonicalHash(publicBody).slice(0, 16) },
  };
}
