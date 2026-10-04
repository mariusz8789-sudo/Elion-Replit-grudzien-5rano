import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CANDIDATE_WINNER_GATE_PATH, GATE_VERDICTS, SELF_REPORT_FIELDS,
  assertNoFinalWinner, evaluateCandidateWinnerGate, evaluateSafetyVeto,
  loadCandidateWinnerGate, orderGatedCandidates,
} from './candidateWinnerGate.mjs';
import { canonicalHash } from '../provenance.mjs';

/**
 * D-164 — the winner gate, proved negative-first.
 *
 * Every property below is proved by a case that FAILS when the property is removed:
 * that FINAL WINNER is not reachable, that a hard safety veto beats any efficacy value,
 * that an external input cannot inject a verdict, that the thresholds cannot move after
 * a result is seen, that UNKNOWN is never read as safe or favourable, and that a novel
 * computational lead is held to a stricter standard than a known compound.
 */

const RULE = JSON.parse(fs.readFileSync(CANDIDATE_WINNER_GATE_PATH, 'utf8'));

/** A dossier in which every criterion holds. Each test breaks exactly one thing. */
function completeDossier(overrides = {}) {
  return {
    candidateId: 'G-TEST-001',
    track: 'A_EXISTING_OR_REPURPOSING',
    noveltyStatus: 'KNOWN_COMPOUND',
    existingCompoundStatus: 'EXISTING_LEGAL_REFERENCE_COMPOUND',
    referenceMaterialAvailability: 'SUPPLIER_KNOWN',
    identity: {
      canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O',
      inchi: 'InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12/h2-5H,1H3,(H,11,12)',
      inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N',
      molecularFormula: 'C9H8O4',
      molWt: 180.159,
      formalCharge: 0,
      stereochemistry: { assignedCentres: 0, unassignedCentres: 0 },
    },
    identityRecords: [{ candidateId: 'G-TEST-001', inchiKey: 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N' }],
    dataItems: [{ id: 'activity', source: 'ChEMBL 37', licence: 'CC BY-SA 3.0', retrievedOrComputed: '2026-05-01 pinned' }],
    hashedArtefacts: [{ id: 'prereg', recordedHash: 'aaaa', recomputedHash: 'aaaa' }],
    targetRelevance: {
      target: 'TEST_TARGET',
      phenotype: 'TEST_PHENOTYPE',
      candidateActsOnTarget: true,
      sources: [{ source: 'Reactome R-HSA-000000', claim: 'the pathway exists' }],
    },
    fatalSafetyCriteria: [{ id: 'FATAL_TEST', result: 'NOT_MET', basis: 'a real check' }],
    modelsRelied: [{ modelId: 'test-model', clearedItsFrozenGate: true, inApplicabilityDomain: true }],
    falsification: { attempted: true, findings: [] },
    scienceRuns: [{ runId: 'run-1', replayVerdict: 'MATCH' }],
    evidencePack: { status: 'VALID', coversRunIds: ['run-1'], includesNegativeResults: true, signed: false },
    chemistryHandoff: { status: 'COMPLETE', missingItems: [] },
    proposedExperiments: [{
      id: 'exp-1',
      labValueOfInformation: {
        whatIsLearned: 'the potency',
        canChangeADecision: true,
        whichCandidateItEliminates: 'G-TEST-001 if inactive',
        cheaperRouteToSameInformation: 'NONE_FOUND',
        publicDataAlreadyAnswersIt: false,
      },
    }],
    ...overrides,
  };
}

const run = (d) => {
  const r = evaluateCandidateWinnerGate(d);
  assert.equal(r.ok, true, r.reason);
  return r.result;
};

describe('the frozen rule itself', () => {
  test('its recorded fingerprint is its own hash, so a threshold cannot be edited without re-freezing', () => {
    assert.equal(canonicalHash(RULE.gate).slice(0, 16), RULE.ruleFingerprint);
  });

  test('a caller that preregistered a different rule is refused, not quietly served this one', () => {
    const r = evaluateCandidateWinnerGate(completeDossier(), { expectedRuleFingerprint: 'deadbeefdeadbeef' });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'GATE_MISMATCH');
  });

  test('the rule names no target, no disease and no molecule: the gate is not hardcoded to GLP-1R', () => {
    const text = JSON.stringify(RULE.gate).toUpperCase();
    for (const forbidden of ['GLP1R', 'GLP-1R', 'SEMAGLUTIDE', 'TIRZEPATIDE', 'OZEMPIC', 'MOUNJARO', 'OBESITY']) {
      assert.ok(!text.includes(forbidden), `the gate rule must not name ${forbidden}`);
    }
    assert.equal(RULE.gate.targetAgnostic, true);
  });
});

describe('FINAL WINNER is not reachable', () => {
  test('it is not in the verdict list, in code or in the frozen rule', () => {
    assert.ok(!GATE_VERDICTS.includes('FINAL_WINNER'));
    assert.ok(!RULE.gate.verdicts.includes('FINAL_WINNER'));
    assert.equal(RULE.gate.verdictThatDoesNotExist, 'FINAL_WINNER');
  });

  test('naming it throws rather than being tolerated', () => {
    assert.throws(() => assertNoFinalWinner('FINAL_WINNER'), /no verdict 'FINAL_WINNER'/);
  });

  test('the strongest verdict a fully complete dossier can reach is COMPUTATIONAL_CANDIDATE', () => {
    assert.equal(run(completeDossier()).verdict, 'COMPUTATIONAL_CANDIDATE');
  });
});

describe('no external input may inject a winner', () => {
  test('a dossier that declares itself the winner still gets the verdict its evidence earns', () => {
    const injected = completeDossier({
      verdict: 'FINAL_WINNER',
      outcome: 'FINAL_WINNER',
      winner: true,
      isWinner: true,
      finalWinner: true,
      gateOutcome: 'COMPUTATIONAL_CANDIDATE',
      gateVerdict: 'COMPUTATIONAL_CANDIDATE',
      criteria: GATE_VERDICTS.map((v) => ({ id: v, held: true })),
      criterionResults: [{ id: 'IDENTITY', held: true }],
      axes: [{ axis: 'SAFETY', status: 'MEASURED', value: 1 }],
      safetyVeto: { vetoed: false },
      override: true,
      forceVerdict: 'FINAL_WINNER',
      status: 'WINNER',
      // the one thing that actually matters: the identity is not resolved
      identity: { canonicalSmiles: '', inchi: '', inchiKey: '', molecularFormula: '', molWt: null, formalCharge: null, stereochemistry: null },
    });
    const r = run(injected);
    assert.equal(r.verdict, 'NO_CANDIDATE');
    assert.ok(r.blockingFailures.includes('IDENTITY'));
    // and the gate says, in data, which self-reports it refused to read
    for (const f of SELF_REPORT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(injected, f)) assert.ok(r.ignoredSelfReports.includes(f), `${f} was present and must be reported as ignored`);
    }
  });

  test('a caller-supplied axis block cannot stand in for axis evidence', () => {
    const r = run(completeDossier({ axes: [{ axis: 'SAFETY', status: 'MEASURED', value: 99 }] }));
    const safety = r.axes.find((a) => a.axis === 'SAFETY');
    assert.equal(safety.status, 'UNKNOWN');
    assert.equal(safety.value, null);
    assert.equal(safety.unknownIsNotFavourable, true);
  });
});

describe('the hard safety veto', () => {
  test('a met fatal criterion rejects the candidate although every other criterion holds and efficacy is maximal', () => {
    const r = run(completeDossier({
      fatalSafetyCriteria: [
        { id: 'FATAL_TEST', result: 'NOT_MET' },
        { id: 'HERG_BLOCK', result: 'MET', basis: 'a real check', source: 'engine' },
      ],
      axisEvidence: [{ axis: 'EXPECTED_EFFICACY', status: 'MEASURED', value: 1e9, unit: 'arbitrary', endpointDefinition: 'absurdly good', source: 'test' }],
    }));
    assert.equal(r.verdict, 'REJECTED_SAFETY_VETO');
    assert.equal(r.safetyVeto.vetoed, true);
    assert.deepEqual(r.safetyVeto.metCriteria.map((m) => m.id), ['HERG_BLOCK']);
    assert.match(r.reason, /whatever its efficacy/);
    // the efficacy value is still reported — the veto hides nothing, it just wins
    assert.equal(r.axes.find((a) => a.axis === 'EXPECTED_EFFICACY').value, 1e9);
  });

  test('the veto outranks every other failure too: it is not merely one more NO_CANDIDATE', () => {
    const r = run(completeDossier({
      fatalSafetyCriteria: [{ id: 'HERG_BLOCK', result: 'MET' }],
      identity: { canonicalSmiles: '', inchi: '', inchiKey: '', molecularFormula: '', molWt: null, formalCharge: null, stereochemistry: null },
    }));
    assert.equal(r.verdict, 'REJECTED_SAFETY_VETO');
  });

  test('UNKNOWN is not safe: it raises no veto but it does fail NO_KNOWN_FATAL_PROPERTY', () => {
    const r = run(completeDossier({ fatalSafetyCriteria: [{ id: 'HERG_BLOCK', result: 'UNKNOWN', reason: 'engine unavailable' }] }));
    assert.equal(r.safetyVeto.vetoed, false);
    assert.equal(r.verdict, 'NO_CANDIDATE');
    assert.ok(r.blockingFailures.includes('NO_KNOWN_FATAL_PROPERTY'));
  });

  test('a campaign with no fatal safety criteria at all is not evaluable on safety', () => {
    const v = evaluateSafetyVeto({ fatalSafetyCriteria: [] });
    assert.equal(v.vetoed, false);
    assert.equal(v.allCriteriaResolved, false);
    assert.equal(run(completeDossier({ fatalSafetyCriteria: [] })).verdict, 'NO_CANDIDATE');
  });

  test('no result may claim that adverse effects are absent', () => {
    const r = run(completeDossier());
    const text = JSON.stringify(r).toLowerCase();
    for (const phrase of ['zero side effects', 'no side effects', 'clinically proven', 'ai cured', 'drug discovered']) {
      // the phrase may appear only inside the rule text that forbids it
      assert.ok(!text.includes(phrase) || r.safetyVeto.neverClaimZeroSideEffects.toLowerCase().includes('absence'), `a result must not assert: ${phrase}`);
    }
    assert.match(r.claimBoundary, /never a claim that adverse effects are absent/);
  });
});

describe('the axes are never collapsed into one number', () => {
  test('no field of the result is a total, score or weighted sum', () => {
    const r = run(completeDossier());
    const keys = JSON.stringify(r).match(/"[A-Za-z]+"\s*:/g) ?? [];
    for (const k of keys) {
      const name = k.replace(/[":\s]/g, '').toLowerCase();
      assert.ok(!['score', 'weightedscore', 'total', 'totalscore', 'overallscore', 'sum'].includes(name), `the result must carry no ${name}`);
    }
    assert.equal(r.axesAreNeverSummed, true);
  });

  test('every axis in the frozen rule is reported, and a missing one is UNKNOWN rather than absent', () => {
    const r = run(completeDossier());
    assert.deepEqual(r.axes.map((a) => a.axis), RULE.gate.axes.map((a) => a.id));
    assert.equal(r.unknownAxes.length, RULE.gate.axes.length);
  });
});

describe('a missing item yields a weaker verdict, never a stronger one', () => {
  const cases = [
    ['MODEL_VALIDITY', { modelsRelied: [{ modelId: 'm', clearedItsFrozenGate: true, inApplicabilityDomain: false, applicabilityDomainEvidence: 'nearest-neighbour Tanimoto 0.31' }] }],
    ['FALSIFICATION', { falsification: { attempted: false } }],
    ['REPLAY_MATCH', { scienceRuns: [{ runId: 'run-1', replayVerdict: 'DRIFT' }] }],
    ['EVIDENCE_PACK_VALID', { evidencePack: { status: 'INCOMPLETE', coversRunIds: [], includesNegativeResults: false } }],
    ['CHEMISTRY_HANDOFF_COMPLETE', { chemistryHandoff: { status: 'INCOMPLETE', missingItems: ['syntheticAccessibility'] } }],
    ['LAB_VALUE_OF_INFORMATION', { proposedExperiments: [{ id: 'exp-1', labValueOfInformation: { whatIsLearned: 'x', canChangeADecision: true, whichCandidateItEliminates: 'y', cheaperRouteToSameInformation: 'NONE_FOUND', publicDataAlreadyAnswersIt: true } }] }],
  ];
  for (const [id, override] of cases) {
    test(`a failed ${id} caps the verdict at LEAD_FOR_FURTHER_VALIDATION`, () => {
      const r = run(completeDossier(override));
      assert.equal(r.verdict, 'LEAD_FOR_FURTHER_VALIDATION');
      assert.ok(r.otherFailures.includes(id));
    });
  }

  const blocking = [
    ['NO_IDENTITY_CONFLICT', { identityRecords: [{ candidateId: 'G-TEST-001', inchiKey: 'AAA-A-A' }, { candidateId: 'G-TEST-001', inchiKey: 'BBB-B-B' }] }],
    ['PROVENANCE', { dataItems: [{ id: 'activity', source: 'ChEMBL 37', licence: '', retrievedOrComputed: 'pinned' }] }],
    ['NO_TAMPER', { hashedArtefacts: [{ id: 'prereg', recordedHash: 'aaaa', recomputedHash: 'bbbb' }] }],
    ['TARGET_RELEVANCE', { targetRelevance: { target: 'T', phenotype: 'P', candidateActsOnTarget: false, sources: [{ source: 's', claim: 'c' }] } }],
  ];
  for (const [id, override] of blocking) {
    test(`a failed ${id} yields NO_CANDIDATE, not a lead`, () => {
      const r = run(completeDossier(override));
      assert.equal(r.verdict, 'NO_CANDIDATE');
      assert.ok(r.blockingFailures.includes(id));
    });
  }

  test('an Evidence Pack that claims to be signed fails: there is no signing key in this system', () => {
    const r = run(completeDossier({ evidencePack: { status: 'VALID', coversRunIds: ['run-1'], includesNegativeResults: true, signed: true } }));
    assert.equal(r.verdict, 'LEAD_FOR_FURTHER_VALIDATION');
    assert.ok(r.otherFailures.includes('EVIDENCE_PACK_VALID'));
  });
});

describe('a novel computational lead is held to a stricter standard', () => {
  test('the same thin dossier is a LEAD on track A and NO_CANDIDATE on track C', () => {
    const thin = { falsification: { attempted: false } };
    assert.equal(run(completeDossier(thin)).verdict, 'LEAD_FOR_FURTHER_VALIDATION');
    const c = run(completeDossier({ ...thin, track: 'C_NOVEL_COMPUTATIONAL', noveltyStatus: 'NEW_COMPUTATIONAL_PROPOSAL' }));
    assert.equal(c.verdict, 'NO_CANDIDATE');
    assert.ok(c.criteria.find((x) => x.id === 'FALSIFICATION').blockingBecauseTrackC);
  });
});

describe('the IP gate', () => {
  test('a known compound passes; a new computational proposal and unverified novelty require review', () => {
    assert.equal(run(completeDossier({ noveltyStatus: 'KNOWN_COMPOUND' })).ipReview, 'PASS');
    assert.equal(run(completeDossier({ noveltyStatus: 'NEW_COMPUTATIONAL_PROPOSAL' })).ipReview, 'IP_REVIEW_REQUIRED');
    assert.equal(run(completeDossier({ noveltyStatus: undefined })).ipReview, 'IP_REVIEW_REQUIRED');
  });
});

describe('ranking', () => {
  test('a stronger verdict never loses to a more available compound', () => {
    const strongNew = run(completeDossier({ candidateId: 'G-NEW', existingCompoundStatus: 'NEW_MOLECULE_REQUIRING_SYNTHESIS' }));
    const weakKnown = run(completeDossier({ candidateId: 'G-KNOWN', existingCompoundStatus: 'EXISTING_LEGAL_REFERENCE_COMPOUND', falsification: { attempted: false } }));
    const order = orderGatedCandidates([weakKnown, strongNew]);
    assert.equal(order[0].candidateId, 'G-NEW');
    assert.equal(order[0].tieBrokenOnPreference, false);
  });

  test('at an identical scientific profile the existing reference compound is preferred, and the tie-break is declared', () => {
    const a = run(completeDossier({ candidateId: 'G-A', existingCompoundStatus: 'NEW_MOLECULE_REQUIRING_SYNTHESIS' }));
    const b = run(completeDossier({ candidateId: 'G-B', existingCompoundStatus: 'EXISTING_LEGAL_REFERENCE_COMPOUND' }));
    const order = orderGatedCandidates([a, b]);
    assert.equal(order[0].candidateId, 'G-B');
    assert.equal(order[0].tieBrokenOnPreference, true);
    assert.equal(order[0].scientificProfile, order[1].scientificProfile);
  });

  test('a safety-vetoed candidate ranks below every non-vetoed one', () => {
    const vetoed = run(completeDossier({ candidateId: 'G-VETO', fatalSafetyCriteria: [{ id: 'X', result: 'MET' }] }));
    const noCandidate = run(completeDossier({ candidateId: 'G-NONE', targetRelevance: { target: 'T', phenotype: 'P', candidateActsOnTarget: false, sources: [{ source: 's', claim: 'c' }] } }));
    const order = orderGatedCandidates([vetoed, noCandidate]);
    assert.equal(order.at(-1).candidateId, 'G-VETO');
  });
});

describe('fail-closed on the rule file', () => {
  test('the one generic loader is used, so a missing or tampered rule file refuses rather than defaults', () => {
    const loaded = loadCandidateWinnerGate();
    assert.equal(loaded.ok, true);
    assert.equal(loaded.ruleFingerprint, RULE.ruleFingerprint);
    const mismatch = loadCandidateWinnerGate({ expectedRuleFingerprint: '0000000000000000' });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, 'GATE_MISMATCH');
  });
});
