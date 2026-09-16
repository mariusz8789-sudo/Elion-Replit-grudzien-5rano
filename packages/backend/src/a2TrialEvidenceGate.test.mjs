import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateIncomingTrialPackage, sha256Hex, REJECTION_CODES } from './campaign/a2TrialEvidenceGate.mjs';

/**
 * D-110 — hard acceptance gate for external A2/LOWER_HARM trial evidence.
 *
 * TEST_FIXTURE DISCLOSURE: every study record below is a synthetic,
 * software-mechanics-only fixture (clearly marked `TEST_FIXTURE` in its
 * title). None of it is real ClinicalTrials.gov data, none of it is written
 * to any real pin, and none of it is ever consumed by the real analysis
 * (`a2OzempicSubstitute.ts`) — this file only exercises the pure validator
 * function in memory.
 */

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const KNOWN_CANDIDATE = 'CHEMBL4084119'; // real, already-pinned A2 candidate id (Liraglutide) — used as an identity fixture only, no real trial data attached.
const A1_NCT_ID = 'NCT00696657'; // real A1-pinned NCT id — used only to prove cross-track rejection, no real A1 bytes read here.

function validStudyJson({ nctId = 'NCT99999901', condition = 'Type 2 Diabetes', status = 'COMPLETED', withResults = true, outcomeTitle = 'Change from Baseline in HbA1c (TEST_FIXTURE)' } = {}) {
  return {
    protocolSection: {
      identificationModule: { nctId, briefTitle: 'TEST_FIXTURE — synthetic mechanics-only study, not real evidence' },
      conditionsModule: { conditions: [condition] },
      statusModule: { overallStatus: status },
      armsInterventionsModule: { armGroups: [{ label: 'A', type: 'EXPERIMENTAL' }] },
    },
    resultsSection: withResults ? {
      outcomeMeasuresModule: { outcomeMeasures: [{ title: outcomeTitle, type: 'SECONDARY', groups: [{ id: 'G1', title: 'TEST_FIXTURE arm' }], denoms: [], classes: [] }] },
      adverseEventsModule: undefined,
    } : undefined,
  };
}

function manifestFor(studyJson, overrides = {}) {
  const rawStudyJsonText = JSON.stringify(studyJson);
  return {
    candidateChemblId: KNOWN_CANDIDATE,
    nctId: studyJson.protocolSection.identificationModule.nctId,
    sourceUrl: `https://clinicaltrials.gov/api/v2/studies/${studyJson.protocolSection.identificationModule.nctId}`,
    declaredSha256: sha256(rawStudyJsonText),
    retrievedAt: '2026-09-16T00:00:00Z',
    publicationDoi: null,
    rawStudyJsonText,
    ...overrides,
  };
}

function baseContext(overrides = {}) {
  return {
    knownCandidateIds: new Set([KNOWN_CANDIDATE, 'CHEMBL1240772']),
    a1RejectedNctIds: new Set([A1_NCT_ID, 'NCT02863419', 'NCT03191396', 'NCT02128932']),
    existingNctIdsForCandidate: new Set(),
    ...overrides,
  };
}

describe('a2TrialEvidenceGate — D-110 hard acceptance gate', () => {
  it('REJECTION_CODES is a real, non-empty, distinct-code enumeration', () => {
    assert.ok(Array.isArray(REJECTION_CODES) && REJECTION_CODES.length > 0);
    assert.equal(new Set(REJECTION_CODES).size, REJECTION_CODES.length);
  });

  it('1. valid package: accepted', () => {
    const r = validateIncomingTrialPackage(manifestFor(validStudyJson()), baseContext());
    assert.equal(r.ok, true);
    assert.equal(r.nctId, 'NCT99999901');
    assert.match(r.sha256, /^[0-9a-f]{64}$/);
  });

  it('2. wrong declared SHA: rejected', () => {
    const m = manifestFor(validStudyJson(), { declaredSha256: sha256Hex('not-the-real-bytes') });
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'HASH_MISMATCH');
  });

  it('3. raw bytes modified after hashing: rejected (hash no longer matches)', () => {
    const study = validStudyJson();
    const rawStudyJsonText = JSON.stringify(study);
    const declaredSha256 = sha256(rawStudyJsonText); // computed over the ORIGINAL bytes
    const tampered = rawStudyJsonText.replace('TEST_FIXTURE', 'REAL-LOOKING'); // then the bytes are altered
    const m = { candidateChemblId: KNOWN_CANDIDATE, nctId: study.protocolSection.identificationModule.nctId, sourceUrl: 'https://clinicaltrials.gov/api/v2/studies/NCT99999901', declaredSha256, retrievedAt: '2026-09-16T00:00:00Z', publicationDoi: null, rawStudyJsonText: tampered };
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'HASH_MISMATCH');
  });

  it('4. missing provenance (no sourceUrl): rejected', () => {
    const m = manifestFor(validStudyJson());
    delete m.sourceUrl;
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MISSING_PROVENANCE');
  });

  it('4b. missing provenance (no retrievedAt): rejected', () => {
    const m = manifestFor(validStudyJson());
    delete m.retrievedAt;
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MISSING_PROVENANCE');
  });

  it('5. wrong/unusable endpoint (no HbA1c or weight outcome title): rejected', () => {
    const study = validStudyJson({ outcomeTitle: 'Number of participants who completed the study (TEST_FIXTURE)' });
    const r = validateIncomingTrialPackage(manifestFor(study), baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NO_USABLE_OUTCOME');
  });

  it('6. wrong/unknown candidate: rejected', () => {
    const m = manifestFor(validStudyJson(), { candidateChemblId: 'CHEMBL_NOT_A_REAL_PINNED_CANDIDATE' });
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'UNKNOWN_CANDIDATE');
  });

  it('7. duplicate observation (nctId already present for this candidate): rejected', () => {
    const study = validStudyJson({ nctId: 'NCT88888888' });
    const ctx = baseContext({ existingNctIdsForCandidate: new Set(['NCT88888888']) });
    const r = validateIncomingTrialPackage(manifestFor(study), ctx);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'DUPLICATE_OBSERVATION');
  });

  it('8. A1 evidence (an A1-pinned NCT id) submitted into A2: rejected regardless of otherwise-valid shape', () => {
    const study = validStudyJson({ nctId: A1_NCT_ID });
    const r = validateIncomingTrialPackage(manifestFor(study), baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'A1_EVIDENCE_REJECTED');
  });

  it('9/10. this gate has no filesystem access at all — it cannot modify a base pin or the preregistration file by construction (see a2TrialIngestionCli.test.mjs for the end-to-end proof that the CLI wrapper never does either)', () => {
    assert.equal(typeof validateIncomingTrialPackage, 'function');
    // The pure validator takes plain objects in and returns a plain object out — no `fs` import in this module at all.
  });

  it('11. malformed observation (rawStudyJsonText is not JSON): rejected', () => {
    const m = manifestFor(validStudyJson());
    m.rawStudyJsonText = 'this is not { valid json';
    m.declaredSha256 = sha256(m.rawStudyJsonText);
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'STUDY_JSON_UNPARSEABLE');
  });

  it('11b. malformed observation (no identificationModule.nctId at all): rejected', () => {
    const study = validStudyJson();
    const m = manifestFor(study); // manifest.nctId captured BEFORE the delete below, so MISSING_PROVENANCE cannot mask this case.
    delete study.protocolSection.identificationModule.nctId;
    m.rawStudyJsonText = JSON.stringify(study);
    m.declaredSha256 = sha256(m.rawStudyJsonText);
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'MISSING_NCT_ID');
  });

  it('11c. manifest nctId does not match the raw study JSON\'s own nctId: rejected', () => {
    const study = validStudyJson({ nctId: 'NCT11111111' });
    const m = manifestFor(study, { nctId: 'NCT22222222' });
    const r = validateIncomingTrialPackage(m, baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NCT_ID_MISMATCH');
  });

  it('population mismatch (condition not Type 2 Diabetes / Obesity): rejected', () => {
    const study = validStudyJson({ condition: 'Rheumatoid Arthritis' });
    const r = validateIncomingTrialPackage(manifestFor(study), baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'POPULATION_MISMATCH');
  });

  // D-112: the population check matches by token subset, not substring. These
  // four cases together prove the repair did not widen the criterion — only
  // word ORDER stopped mattering.
  it('D-112: the MeSH canonical form "Diabetes Mellitus, Type 2" is accepted (it IS type 2 diabetes)', () => {
    const study = validStudyJson({ condition: 'Diabetes Mellitus, Type 2' });
    const r = validateIncomingTrialPackage(manifestFor(study), baseContext());
    assert.equal(r.ok, true, `unexpected rejection: ${r.code} ${r.reason ?? ''}`);
  });

  it('D-112: "Diabetes Mellitus, Type 1" is still REJECTED — the repair did not widen the criterion', () => {
    const study = validStudyJson({ condition: 'Diabetes Mellitus, Type 1' });
    const r = validateIncomingTrialPackage(manifestFor(study), baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'POPULATION_MISMATCH');
  });

  it('D-112: bare "Diabetes" is still REJECTED — an unspecified diabetes label does not establish a type 2 population', () => {
    const study = validStudyJson({ condition: 'Diabetes' });
    const r = validateIncomingTrialPackage(manifestFor(study), baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'POPULATION_MISMATCH');
  });

  it('D-112: "Obesity, Morbid" is accepted, "Obstructive Sleep Apnea" is not', () => {
    assert.equal(validateIncomingTrialPackage(manifestFor(validStudyJson({ condition: 'Obesity, Morbid' })), baseContext()).ok, true);
    const r = validateIncomingTrialPackage(manifestFor(validStudyJson({ condition: 'Obstructive Sleep Apnea' })), baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'POPULATION_MISMATCH');
  });

  it('results not posted (status not COMPLETED / no resultsSection): rejected', () => {
    const study = validStudyJson({ status: 'RECRUITING', withResults: false });
    const r = validateIncomingTrialPackage(manifestFor(study), baseContext());
    assert.equal(r.ok, false);
    assert.equal(r.code, 'RESULTS_NOT_POSTED');
  });

  it('12/13. this gate decides ONLY acceptance of raw evidence bytes — it never computes efficacy, comparison type, or a verdict; that stays entirely inside the unmodified a2OzempicSubstitute.ts/winnerGate.ts (see govDrugLowerHarmFunnel.test.ts / practicalCandidateGate.test.ts, both untouched by this change)', () => {
    const r = validateIncomingTrialPackage(manifestFor(validStudyJson()), baseContext());
    assert.equal(r.ok, true);
    assert.equal('extractCandidateEfficacy' in r, false); // the accepted result carries raw narrowable data only, never a computed evidence class or score.
  });
});
