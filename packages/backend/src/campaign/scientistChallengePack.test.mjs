import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORBIDDEN_PHRASES, assertNoOverclaiming, buildScientistChallengePack,
  labValueOfInformation, laboratoryValidationStep,
} from './scientistChallengePack.mjs';
import { EXTERNAL_RECORD_KEYS } from './chemistryHandoffPackage.mjs';
import { evaluateCandidateWinnerGate } from './candidateWinnerGate.mjs';

/**
 * D-164 — the scientist challenge pack, proved negative-first.
 *
 * The pack's job is to be attackable, so the properties worth proving are the ones that
 * stop it being marketing: that it copies the gate's verdict and cannot upgrade it, that
 * it refuses to overclaim, that a pack with no negative results says that is a defect,
 * that the public pack leaks no structure, and that an experiment which public data
 * already answers is not proposable.
 */

const noCandidateGate = () => {
  const r = evaluateCandidateWinnerGate({
    candidateId: 'G-X',
    track: 'A_EXISTING_OR_REPURPOSING',
    identity: { canonicalSmiles: '', inchi: '', inchiKey: '', molecularFormula: '', molWt: null, formalCharge: null, stereochemistry: null },
    fatalSafetyCriteria: [{ id: 'F', result: 'NOT_MET' }],
  });
  assert.equal(r.ok, true);
  return r.result;
};

describe('the pack copies the verdict and cannot upgrade it', () => {
  test('a NO_CANDIDATE gate result yields a NO_CANDIDATE pack that names what stopped it', () => {
    const gateResult = noCandidateGate();
    const p = buildScientistChallengePack({ gateResult });
    assert.equal(p.ok, true);
    assert.equal(p.verdict, 'NO_CANDIDATE');
    assert.equal(p.full.verdict, 'NO_CANDIDATE');
    assert.ok(p.full.whatStoppedIt.includes('IDENTITY'));
    assert.equal(p.full.verdictIsNeverRecomputedHere, true);
    assert.equal(p.full.verdictCopiedFrom.resultFingerprint, gateResult.resultFingerprint);
  });

  test('a verdict the gate does not define is refused', () => {
    assert.equal(buildScientistChallengePack({ gateResult: { verdict: 'FINAL_WINNER' } }).code, 'UNKNOWN_GATE_VERDICT');
    assert.equal(buildScientistChallengePack({}).code, 'NO_GATE_RESULT');
  });

  test('with no subject, the selection rationale is NOT_APPLICABLE rather than prose', () => {
    const p = buildScientistChallengePack({ gateResult: noCandidateGate(), campaign: { whyThisSubject: 'because it looks promising' } });
    assert.equal(p.full.whyThisSubjectWasChosen.status, 'NOT_APPLICABLE');
    assert.match(p.full.whyThisSubjectWasChosen.reason, /nothing was chosen/);
  });
});

describe('it refuses to overclaim', () => {
  test('every forbidden phrase is caught', () => {
    for (const phrase of FORBIDDEN_PHRASES) {
      assert.throws(() => assertNoOverclaiming({ note: `the result is ${phrase} here` }), /forbidden phrase/);
    }
  });

  test('a campaign field carrying a forbidden phrase stops the pack being built', () => {
    assert.throws(
      () => buildScientistChallengePack({ gateResult: noCandidateGate(), campaign: { question: 'has the drug discovered a cure?' } }),
      /forbidden phrase/,
    );
  });

  test('the pack states what a positive result does NOT mean, unconditionally', () => {
    const p = buildScientistChallengePack({ gateResult: noCandidateGate() });
    const text = p.full.whatAPositiveResultDoesNotMean.join(' ');
    assert.match(text, /is a medicine/);
    assert.match(text, /adverse effects are absent/);
    assert.equal(p.full.unsigned, true);
    assert.match(p.full.claimBoundary, /never a claim that adverse effects are absent/);
  });

  test('it makes no licensing claim about any engine', () => {
    const p = buildScientistChallengePack({ gateResult: noCandidateGate() });
    assert.match(p.full.enginesAreNotOpenSourceClaim, /no licensing claim/);
  });
});

describe('negative results are not optional', () => {
  test('an empty list is reported UNKNOWN and called suspicious, not omitted', () => {
    const p = buildScientistChallengePack({ gateResult: noCandidateGate(), negativeResults: [] });
    assert.equal(p.full.everyNegativeResult.status, 'UNKNOWN');
    assert.match(p.full.everyNegativeResult.reason, /itself suspicious/);
    assert.match(p.full.negativeResultsAreNotOptional, /treat its absence as a defect/);
  });

  test('a supplied list is carried verbatim, and the public pack carries it too', () => {
    const negatives = [{ decision: 'D-162', result: 'the model collapses outside its series' }];
    const p = buildScientistChallengePack({ gateResult: noCandidateGate(), negativeResults: negatives });
    assert.deepEqual(p.full.everyNegativeResult, negatives);
    assert.deepEqual(p.public.everyNegativeResult, negatives);
  });
});

describe('the public pack', () => {
  test('it carries no structure and declares why', () => {
    const p = buildScientistChallengePack({ gateResult: noCandidateGate() });
    assert.equal(p.public.structureWithheld, true);
    assert.equal(p.public.chemistryHandoffIncluded, false);
    // The gate's own diagnostic names the FIELD `canonicalSmiles` as missing, which is a
    // field name and not a structure. What must never appear is a structure VALUE.
    const text = JSON.stringify(p.public);
    assert.ok(!/"canonicalSmiles"\s*:\s*"[^"]+"/.test(text), 'the public pack must carry no structure value');
    assert.ok(!text.includes('InChI='), 'the public pack must carry no InChI');
  });

  test('a leaked structure throws rather than being published', () => {
    const gateResult = noCandidateGate();
    const smiles = 'CC(=O)Oc1ccccc1C(=O)O';
    assert.throws(
      () => buildScientistChallengePack({
        gateResult,
        chemistryHandoff: { status: 'INCOMPLETE', missingItems: [], full: { candidateId: 'G-X', structureHash: 'abc', purpose: 'X', items: { canonicalSmiles: smiles } } },
        // the leak: the structure smuggled into a field the public pack copies
        campaign: { methodology: `fitted on ${smiles}` },
      }),
      /leaked the structure/,
    );
  });
});

describe('the value-of-information record', () => {
  test('an experiment public data already answers is not proposable', () => {
    const v = labValueOfInformation({
      id: 'L', assay: 'a', whatIsLearned: 'x', canChangeADecision: true,
      whichCandidateItEliminates: 'y', cheaperRouteToSameInformation: 'NONE', publicDataAlreadyAnswersIt: true,
    });
    assert.equal(v.proposable, false);
    assert.match(v.notProposableBecause, /public data already answers it/);
  });

  test('an experiment that cannot change a decision is not proposable', () => {
    const v = labValueOfInformation({
      id: 'L', assay: 'a', whatIsLearned: 'x', canChangeADecision: false,
      whichCandidateItEliminates: 'y', cheaperRouteToSameInformation: 'NONE', publicDataAlreadyAnswersIt: false,
    });
    assert.equal(v.proposable, false);
    assert.match(v.notProposableBecause, /cannot change a decision/);
  });

  test('an incomplete record names its missing fields', () => {
    const v = labValueOfInformation({ id: 'L', assay: 'a', whatIsLearned: '', canChangeADecision: true, whichCandidateItEliminates: null, cheaperRouteToSameInformation: 'NONE', publicDataAlreadyAnswersIt: false });
    assert.equal(v.complete, false);
    assert.deepEqual(v.missing.sort(), ['whatIsLearned', 'whichCandidateItEliminates']);
  });
});

describe('a laboratory validation step', () => {
  const base = {
    id: 'LAB-1', parameter: 'P', assayType: 'A', unit: 'U', rangeOrTolerance: 'the laboratory\'s own window, declared first',
    modelValueFrozenBeforeTheExperiment: 'BLOCKED: no usable model value exists', whatTheRealMeasurementWillBe: 'an observed curve',
    rawFilesToKeep: ['raw output'], hashing: 'sha256 at transfer', qualityControl: 'reference and blank',
    secondPersonReview: 'a second qualified person refits independently',
    modelVersusMeasurementComparison: 'BLOCKED with its reason', evidenceProposal: 'one proposal per raw file',
    whatWouldFalsifyTheCandidacy: 'no response observed',
    valueOfInformation: labValueOfInformation({ id: 'L', assay: 'A', whatIsLearned: 'x', canChangeADecision: true, whichCandidateItEliminates: 'y', cheaperRouteToSameInformation: 'NONE', publicDataAlreadyAnswersIt: false }),
  };

  test('a complete step is READY_FOR_EXTERNAL_REVIEW, never authorised here', () => {
    const s = laboratoryValidationStep(base);
    assert.equal(s.status, 'READY_FOR_EXTERNAL_REVIEW');
    assert.equal(s.executionAuthority, 'EXTERNAL_LAB_AND_ACCOUNTABLE_HUMAN_ONLY');
    assert.match(s.operationalProcedure, /NOT_INCLUDED/);
  });

  test('it is never called clinical', () => {
    const s = laboratoryValidationStep(base);
    assert.equal(s.isClinical, false);
    assert.match(s.isClinicalNote, /Not a clinical investigation/);
  });

  test('a step missing a field says which, rather than reading complete', () => {
    const s = laboratoryValidationStep({ ...base, qualityControl: '', secondPersonReview: null });
    assert.equal(s.status, 'INCOMPLETE');
    assert.deepEqual(s.missingFields.sort(), ['qualityControl', 'secondPersonReview']);
  });
});

describe('the one exemption to the non-operational guard is a closed set', () => {
  test('exactly the verbatim third-party record keys are exempt', () => {
    assert.deepEqual([...EXTERNAL_RECORD_KEYS].sort(), [
      'adverseEventEndpoints', 'armA', 'armB', 'armTitle', 'arms', 'baselineMatrix',
      'bodyWeightEndpoints', 'briefTitle', 'directRandomisedWeightComparisons',
      'endpointDefinition', 'outcomeTitle', 'referenceHeadToHead', 'trials', 'unitOfMeasure',
    ]);
  });

  test('synthesis text in a field that is NOT exempt still stops the pack', () => {
    assert.throws(
      () => buildScientistChallengePack({ gateResult: noCandidateGate(), campaign: { uncertainty: 'reflux for 12 h' } }),
      /operational synthesis content/,
    );
  });
});

describe('determinism', () => {
  test('the same input yields the same pack fingerprints', () => {
    const gateResult = noCandidateGate();
    const a = buildScientistChallengePack({ gateResult });
    const b = buildScientistChallengePack({ gateResult });
    assert.equal(a.full.packFingerprint, b.full.packFingerprint);
    assert.equal(a.public.packFingerprint, b.public.packFingerprint);
  });
});
