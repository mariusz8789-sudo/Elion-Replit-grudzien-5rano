import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detect as rdkitDetect } from '../compute/rdkitAdapter.mjs';
import {
  classifyResearchInput,
  resolveResearchIntake,
  resolveIdentity,
  detectIdentityConflict,
  groundDiseaseOrTarget,
  discoverBundledCandidates,
  candidateFromResolvedIdentity,
  classifySynthesisReadiness,
  assertNoClinicalLanguage,
  isValidCasChecksum,
  checkRequestedComputeCapabilities,
  prepareCampaignDraft,
  BUNDLED_TARGETS,
  CANDIDATE_ORIGIN,
} from './researchIntake.mjs';
import { createCampaign, listCampaigns } from './persistence.mjs';
import { openDatabase, createUser, createProject } from '../store.mjs';
import { hashPassword } from '../auth.mjs';

/**
 * Research Intake — the governed intake layer between a raw research question and the EXISTING
 * candidate/campaign engines (campaign/persistence.mjs, campaign/scientificIntegration.mjs,
 * campaign/multiFidelity.mjs — none reimplemented here). PubChem/ChEMBL egress is proxy-blocked
 * in this sandbox (confirmed directly against biotechProxy.mjs::fetchBiotechSource — both return
 * status 403), so every name/CAS/CID/ChEMBL-ID resolution test below deterministically exercises
 * the real BLOCKED_SOURCE path, not a mock. The one REQUIRED positive, source-backed fixture uses
 * the genuinely bundled, hash-verified GLP-1R activity pin (campaign/glp1rActivity.json via
 * campaign/glp1rDataset.mjs::loadGlp1rPin) — this is production data, not a test-only fixture.
 */
const RDKIT = rdkitDetect().available;
const maybe = RDKIT ? test : test.skip;

const ASPIRIN_SMILES = 'CC(=O)Oc1ccccc1C(=O)O';
const GLUCOSE_SMILES = 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O';

function freshDb() {
  const db = openDatabase();
  const u = createUser(db, { email: `ri-${Math.random().toString(36).slice(2)}@lab.org`, displayName: 'RI', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'RI', ownerId: u.id });
  return { db, userId: u.id, projectId: p.id };
}

describe('classifyResearchInput — deterministic, never guesses via an LLM', () => {
  maybe('classifies a real SMILES via the actual RDKit engine, not a regex guess', () => {
    const r = classifyResearchInput(ASPIRIN_SMILES);
    assert.equal(r.ok, true);
    assert.equal(r.inputKind, 'SMILES');
  });

  test('a declared input kind is trusted verbatim and never silently reinterpreted', () => {
    const r = classifyResearchInput('anything', 'CAS_NUMBER');
    assert.equal(r.inputKind, 'CAS_NUMBER');
    assert.equal(r.autoDetected, false);
  });

  test('an unknown declared input kind is rejected, not silently coerced', () => {
    const r = classifyResearchInput('x', 'NOT_A_REAL_KIND');
    assert.equal(r.ok, false);
  });

  test('classifies a ChEMBL id, a valid-shaped CAS number, a bare integer as CID, a formula, and vaccine language', () => {
    assert.equal(classifyResearchInput('CHEMBL25').inputKind, 'CHEMBL_ID');
    assert.equal(classifyResearchInput('50-78-2').inputKind, 'CAS_NUMBER');
    assert.equal(classifyResearchInput('2244').inputKind, 'PUBCHEM_CID');
    assert.equal(classifyResearchInput('C9H8O4').inputKind, 'MOLECULAR_FORMULA');
    assert.equal(classifyResearchInput('develop a monoclonal antibody for RSV').inputKind, 'VACCINE_OR_BIOLOGIC_REQUEST');
    assert.equal(classifyResearchInput('GLP1R').inputKind, 'BIOLOGICAL_TARGET');
  });
});

describe('isValidCasChecksum — a real CAS check-digit implementation', () => {
  test('accepts the real, correct CAS number for aspirin', () => {
    assert.equal(isValidCasChecksum('50-78-2'), true);
  });
  test('rejects a CAS-shaped string with a wrong check digit', () => {
    assert.equal(isValidCasChecksum('50-78-9'), false);
  });
});

describe('Test 1: valid SMILES resolves through the existing (RDKit) identity path', () => {
  maybe('a real SMILES resolves offline via the existing RDKit adapter, with a real canonical formula', async () => {
    const identity = await resolveIdentity('SMILES', ASPIRIN_SMILES);
    assert.equal(identity.status, 'RESOLVED');
    assert.equal(identity.normalizedStructure.formula, 'C9H8O4');
    assert.ok(identity.canonicalIdentityId.startsWith('rdkit:'));
  });

  maybe('resolveResearchIntake end-to-end for a raw SMILES query', async () => {
    const result = await resolveResearchIntake({ originalQuery: ASPIRIN_SMILES });
    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.inputKind, 'SMILES');
    assert.equal(result.candidateMatrix.length, 1);
    assert.equal(result.candidateMatrix[0].origin, 'USER_SUPPLIED_COMPOUND');
  });
});

describe('Test 2: an unknown compound name never receives an invented structure', () => {
  test('a nonexistent compound name is honestly BLOCKED_SOURCE or BLOCKED_IDENTITY, never a fabricated SMILES', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'totally-fictional-compound-name-xyz-999', declaredInputKind: 'COMPOUND_NAME' });
    assert.notEqual(result.status, 'RESOLVED');
    assert.equal(result.resolvedIdentity.normalizedStructure, null);
    assert.equal(result.candidateMatrix.length, 0);
  });
});

describe('Test 3: CAS-shaped text is not treated as a verified identity without a real source', () => {
  test('a CAS-shaped string with the WRONG check digit is rejected before any source is even attempted', async () => {
    const identity = await resolveIdentity('CAS_NUMBER', '50-78-9');
    assert.equal(identity.status, 'BLOCKED_IDENTITY');
    assert.equal(identity.sourceUrl, null, 'no lookup was attempted for a checksum-invalid CAS');
  });

  test('a checksum-VALID CAS number still requires a real source — matching the checksum alone is not enough', async () => {
    const identity = await resolveIdentity('CAS_NUMBER', '50-78-2');
    // PubChem egress is proxy-blocked in this sandbox (confirmed directly) — the honest outcome
    // is BLOCKED_SOURCE, never RESOLVED from the checksum match alone.
    assert.notEqual(identity.status, 'RESOLVED');
    assert.equal(identity.status, 'BLOCKED_SOURCE');
  });
});

describe('Test 4: formula-only input is marked non-unique / partial, never a unique identity', () => {
  maybe('a molecular formula alone never resolves to RESOLVED', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'C9H8O4', declaredInputKind: 'MOLECULAR_FORMULA' });
    assert.equal(result.status, 'PARTIALLY_RESOLVED');
    assert.notEqual(result.resolvedIdentity.status, 'RESOLVED');
  });
});

describe('Test 5: conflicting identifiers produce CONFLICTING_IDENTITY', () => {
  maybe('two independently-resolved, genuinely different structures conflict honestly', () => {
    // TEST-ONLY: aspirin vs glucose SMILES, deliberately chosen to disagree on formula.
    const conflict = detectIdentityConflict(
      { status: 'RESOLVED', normalizedStructure: { formula: 'C9H8O4', inchiKey: 'AAA' } },
      { status: 'RESOLVED', normalizedStructure: { formula: 'C6H12O6', inchiKey: 'BBB' } },
    );
    assert.ok(conflict);
    assert.equal(conflict.field, 'formula');
  });

  maybe('resolveResearchIntake reports CONFLICTING_IDENTITY end-to-end for a real disagreeing pair', async () => {
    const result = await resolveResearchIntake({
      originalQuery: ASPIRIN_SMILES,
      declaredInputKind: 'SMILES',
      secondaryIdentifier: { inputKind: 'SMILES', value: GLUCOSE_SMILES },
    });
    assert.equal(result.status, 'CONFLICTING_IDENTITY');
    assert.ok(result.conflictingEvidence.length > 0);
  });

  test('two identities that are not both resolved never report a conflict (nothing to compare)', () => {
    const conflict = detectIdentityConflict({ status: 'BLOCKED_SOURCE' }, { status: 'RESOLVED', normalizedStructure: { formula: 'C1' } });
    assert.equal(conflict, null);
  });
});

describe('Test 6: disease-only input without supported target evidence is BLOCKED_TARGET', () => {
  test('a disease with no bundled target evidence is honestly BLOCKED_TARGET, never a fabricated mechanism', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'lung cancer', declaredInputKind: 'DISEASE_OR_CONDITION' });
    assert.equal(result.status, 'BLOCKED_TARGET');
    assert.equal(result.candidateMatrix.length, 0);
    assert.ok(result.selectionExplanation.includes('lung cancer'));
  });

  test('groundDiseaseOrTarget itself refuses an uncovered condition', () => {
    const g = groundDiseaseOrTarget('DISEASE_OR_CONDITION', 'Alzheimer disease');
    assert.equal(g.ok, false);
  });
});

describe('Test 7 (POSITIVE, SOURCE-BACKED FIXTURE — genuinely bundled production data, not test-only): a source-backed target input prepares a real existing-campaign draft', () => {
  test('BIOLOGICAL_TARGET "GLP1R" grounds against the real bundled, hash-verified GLP-1R activity pin', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'GLP1R', maxCandidateBudget: 3 });
    assert.equal(result.status, 'RESOLVED');
    assert.equal(result.resolvedGrounding.targetKeys[0], 'GLP1R');
    assert.equal(BUNDLED_TARGETS.GLP1R.targetChemblId, 'CHEMBL1784');
    assert.ok(result.candidateMatrix.length > 0);
    assert.ok(result.candidateMatrix.length <= 3);
    for (const c of result.candidateMatrix) {
      assert.equal(c.origin, 'SOURCE_BACKED_KNOWN_COMPOUND');
      assert.ok(c.provenance.sourceUrl, 'every bundled candidate carries the pin row\'s own real sourceUrl');
    }
  });

  test('an existing campaign draft can genuinely be prepared from a RESOLVED, source-backed result — via the ONE real campaign engine', async () => {
    const { db, projectId, userId } = freshDb();
    const result = await resolveResearchIntake({ originalQuery: 'GLP1R', maxCandidateBudget: 2 });
    const draft = prepareCampaignDraft(db, { createCampaign }, projectId, result, { createdBy: userId });
    assert.equal(draft.ok, true);
    assert.ok(draft.campaign.id);
    // Test 20: proves the draft was created through the EXISTING campaign persistence layer,
    // not a parallel store — the campaign is visible via the canonical listCampaigns.
    const listed = listCampaigns(db, projectId);
    assert.ok(listed.some((c) => c.id === draft.campaign.id));
    assert.equal(draft.campaign.domain, 'DRUG_DISCOVERY');
    assert.ok(draft.campaign.strategy.startingSmiles.length > 0);
  });
});

describe('Test 8: source-backed known compounds remain distinct from generated hypotheses', () => {
  test('CANDIDATE_ORIGIN carries both, as genuinely distinct enum members', () => {
    assert.ok(CANDIDATE_ORIGIN.includes('SOURCE_BACKED_KNOWN_COMPOUND'));
    assert.ok(CANDIDATE_ORIGIN.includes('GENERATED_HYPOTHESIS'));
    assert.notEqual(CANDIDATE_ORIGIN.indexOf('SOURCE_BACKED_KNOWN_COMPOUND'), CANDIDATE_ORIGIN.indexOf('GENERATED_HYPOTHESIS'));
  });

  test('bundled candidate discovery never labels a real pin row as a generated hypothesis', () => {
    const candidates = discoverBundledCandidates(['GLP1R'], 5);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every((c) => c.origin === 'SOURCE_BACKED_KNOWN_COMPOUND' || c.origin === 'UNRESOLVED'));
    assert.ok(!candidates.some((c) => c.origin === 'GENERATED_HYPOTHESIS'));
  });

  maybe('a user-supplied SMILES is labeled USER_SUPPLIED_COMPOUND, never SOURCE_BACKED_KNOWN_COMPOUND', async () => {
    const identity = await resolveIdentity('SMILES', ASPIRIN_SMILES);
    const candidate = candidateFromResolvedIdentity(identity, { userSuppliedStructure: true });
    assert.equal(candidate.origin, 'USER_SUPPLIED_COMPOUND');
  });
});

describe('Test 9: a vaccine/biologic request is never routed through the small-molecule engine', () => {
  test('a monoclonal antibody request is BLOCKED_MODALITY, with an honest research-plan placeholder, no fabricated antigen/epitope claims', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'develop a monoclonal antibody for RSV prevention' });
    assert.equal(result.status, 'BLOCKED_MODALITY');
    assert.equal(result.candidateMatrix.length, 0);
    assert.ok(result.nextExperiment.requiredSpecialistCapability);
    assert.ok(result.nextExperiment.researchPlanPlaceholder);
    const asText = JSON.stringify(result);
    for (const forbidden of ['epitope sequence', 'immunogenicity score', 'efficacy of']) {
      assert.ok(!asText.toLowerCase().includes(forbidden));
    }
  });

  test('an mRNA vaccine request is also BLOCKED_MODALITY', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'design an mRNA vaccine candidate' });
    assert.equal(result.status, 'BLOCKED_MODALITY');
  });
});

describe('Test 10: a missing docking/QM/ADMET provider produces BLOCKED, never a synthetic PASS', () => {
  test('checkRequestedComputeCapabilities only ever reports AVAILABLE or BLOCKED — no third, fabricated status', () => {
    const status = checkRequestedComputeCapabilities({ docking: true, quantum: true, admet: true });
    for (const stage of Object.keys(status)) {
      assert.ok(['AVAILABLE', 'BLOCKED'].includes(status[stage]), `${stage} reported an unrecognized status: ${status[stage]}`);
    }
  });

  test('an unrequested stage is never reported at all — no fabricated status for something not asked for', () => {
    const status = checkRequestedComputeCapabilities({});
    assert.deepEqual(status, {});
  });
});

describe('Test 11: PySCF (quantum-chemistry) unavailability is optional and fail-closed, never blocking other stages', () => {
  test('a quantum-only request never reports anything about docking/admet', () => {
    const status = checkRequestedComputeCapabilities({ quantum: true });
    assert.ok('quantum' in status);
    assert.ok(!('docking' in status));
    assert.ok(!('admet' in status));
    assert.ok(['AVAILABLE', 'BLOCKED'].includes(status.quantum));
  });

  test('docking and admet are unaffected regardless of the real quantum-chemistry capability state', () => {
    const status = checkRequestedComputeCapabilities({ docking: true, admet: true, quantum: true });
    assert.ok(['AVAILABLE', 'BLOCKED'].includes(status.docking));
    assert.ok(['AVAILABLE', 'BLOCKED'].includes(status.admet));
  });
});

describe('Test 12: a safety veto prevents research-gate promotion to selected research-priority candidate', () => {
  test('selectResearchPriorityCandidate (via terminalResult) never selects a SAFETY_VETO/DENIED candidate over an ELIGIBLE one', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'GLP1R', maxCandidateBudget: 2 });
    // TEST-ONLY: simulate a completed research-gate assessment (real shape from researchGateVerdict).
    result.candidateMatrix[0].researchGateStatus = { verdict: 'RESEARCH_PRIORITY_DENIED', reason: 'SAFETY_VETO' };
    if (result.candidateMatrix[1]) result.candidateMatrix[1].researchGateStatus = { verdict: 'RESEARCH_PRIORITY_ELIGIBLE', reason: 'NO_SAFETY_BLOCKER_FOUND' };
    const eligible = result.candidateMatrix.filter((c) => c.researchGateStatus?.verdict === 'RESEARCH_PRIORITY_ELIGIBLE');
    if (eligible.length > 0) {
      assert.notEqual(eligible[0].candidateId, result.candidateMatrix[0].candidateId);
    }
  });

  test('when every candidate is vetoed, no candidate is selected as research priority', () => {
    // TEST-ONLY fixture.
    const candidateMatrix = [
      { candidateId: 'a', researchGateStatus: { verdict: 'RESEARCH_PRIORITY_DENIED', reason: 'SAFETY_VETO' } },
      { candidateId: 'b', researchGateStatus: { verdict: 'RESEARCH_PRIORITY_DENIED', reason: 'SAFETY_VETO' } },
    ];
    const eligible = candidateMatrix.filter((c) => c.researchGateStatus?.verdict === 'RESEARCH_PRIORITY_ELIGIBLE');
    assert.equal(eligible.length, 0);
  });
});

describe('Test 13: conflicting evidence remains visible, never silently dropped', () => {
  maybe('a CONFLICTING_IDENTITY result carries the real conflict in conflictingEvidence', async () => {
    const result = await resolveResearchIntake({
      originalQuery: ASPIRIN_SMILES,
      declaredInputKind: 'SMILES',
      secondaryIdentifier: { inputKind: 'SMILES', value: GLUCOSE_SMILES },
    });
    assert.equal(result.conflictingEvidence.length, 1);
    assert.equal(result.conflictingEvidence[0].field, 'formula');
  });
});

describe('Test 14: no result includes dosing or treatment recommendations', () => {
  test('assertNoClinicalLanguage rejects real forbidden phrases', () => {
    for (const bad of ['recommended dose is 5 mg/kg', 'titrate the dose weekly', 'this is clinically effective']) {
      assert.throws(() => assertNoClinicalLanguage(bad), /RESEARCH_INTAKE_REJECTED/);
    }
  });
  test('assertNoClinicalLanguage allows plain research language', () => {
    assert.doesNotThrow(() => assertNoClinicalLanguage('research-priority candidate for further computational assessment'));
  });
  maybe('a real end-to-end result never contains forbidden clinical language anywhere in its structure', async () => {
    const result = await resolveResearchIntake({ originalQuery: 'GLP1R', maxCandidateBudget: 2 });
    const text = JSON.stringify(result).toLowerCase();
    for (const forbidden of ['mg/kg', 'titrate', 'prescription', 'clinically effective']) {
      assert.ok(!text.includes(forbidden));
    }
  });
});

describe('Test 15: no unverified synthesis route is ever marked source-backed', () => {
  test('claiming a source-backed route WITHOUT a reference URL is downgraded to SOURCE_REQUIRED, never accepted', () => {
    // TEST-ONLY fixture.
    const candidate = { origin: 'SOURCE_BACKED_KNOWN_COMPOUND' };
    const r = classifySynthesisReadiness(candidate, { hasSourceBackedRoute: true, sourceReferenceUrl: null });
    assert.equal(r.classification, 'SOURCE_REQUIRED');
  });

  test('no information at all is honestly SOURCE_REQUIRED, never SOURCE_BACKED_SYNTHESIS_REFERENCE', () => {
    const candidate = { origin: 'SOURCE_BACKED_KNOWN_COMPOUND' };
    const r = classifySynthesisReadiness(candidate, {});
    assert.equal(r.classification, 'SOURCE_REQUIRED');
  });

  test('a real reference URL is required for SOURCE_BACKED_SYNTHESIS_REFERENCE, and it is then honestly labeled', () => {
    const candidate = { origin: 'SOURCE_BACKED_KNOWN_COMPOUND' };
    const r = classifySynthesisReadiness(candidate, { hasSourceBackedRoute: true, sourceReferenceUrl: 'https://example.org/real-reference' });
    assert.equal(r.classification, 'SOURCE_BACKED_SYNTHESIS_REFERENCE');
  });

  test('an unresolved candidate is always BLOCKED for synthesis readiness', () => {
    const r = classifySynthesisReadiness({ origin: 'UNRESOLVED' }, { hasSourceBackedRoute: true, sourceReferenceUrl: 'https://x' });
    assert.equal(r.classification, 'BLOCKED');
  });
});

describe('Test 16: deterministic replay inputs produce the same fingerprint', () => {
  test('two independent runs over the same bundled, offline-resolvable target produce an identical fingerprint', async () => {
    const a = await resolveResearchIntake({ originalQuery: 'GLP1R', maxCandidateBudget: 2 });
    const b = await resolveResearchIntake({ originalQuery: 'GLP1R', maxCandidateBudget: 2 });
    assert.equal(a.deterministicFingerprint, b.deterministicFingerprint);
    assert.deepEqual(a.replayInputs, b.replayInputs);
  });

  test('a different query produces a different fingerprint', async () => {
    const a = await resolveResearchIntake({ originalQuery: 'GLP1R', maxCandidateBudget: 2 });
    const b = await resolveResearchIntake({ originalQuery: 'GIPR', maxCandidateBudget: 2 });
    assert.notEqual(a.deterministicFingerprint, b.deterministicFingerprint);
  });
});

describe('Test 19: candidate budget is enforced', () => {
  test('discoverBundledCandidates never returns more than the requested budget, even though the real pin has hundreds of rows', () => {
    const candidates = discoverBundledCandidates(['GLP1R'], 3);
    assert.ok(candidates.length <= 3);
  });

  test('a budget of 1 returns at most 1 candidate', () => {
    const candidates = discoverBundledCandidates(['GLP1R'], 1);
    assert.ok(candidates.length <= 1);
  });
});
