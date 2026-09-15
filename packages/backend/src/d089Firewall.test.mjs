import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalHash } from './provenance.mjs';
import { loadGlp1rValidationGate, GLP1R_GATE_PATH } from './campaign/glp1rQsar.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(path.join(HERE, 'campaign', f), 'utf8'));

/* ------------------------------------- ITEM 2/3: SEALED DIAGNOSTIC ARTIFACT */

test('D-089 Diagnostic-0 is sealed and its hash re-verifies', () => {
  const sealed = read('glp1r-d089-diagnostic0.sealed.json');
  assert.equal(canonicalHash(sealed.artifact), sealed.artifactHash, 'the sealed artifact was edited after sealing');
  assert.equal(sealed.artifact.testSplitRead, false);
  assert.equal(sealed.artifact.representationAttemptsConsumed, 0);
});

test('the 1.7618 endpoint gap carries its dataset pin, method and definitions', () => {
  const a = read('glp1r-d089-diagnostic0.sealed.json').artifact;
  assert.equal(a.measurements.cross_endpoint_gap_median, 1.7618);
  assert.equal(a.datasetPinSha256, '5533d8b8940987fde860cd3438882e0b1bc509bc810f75f1cff4302530e69244');
  assert.equal(a.measurements.molecules_with_multiple_endpoint_types, 65);
  // the compared families must be DEFINED, not assumed
  assert.ok(a.endpointFamilyDefinitions.EC50.length > 20);
  assert.ok(a.endpointFamilyDefinitions.IC50.length > 20);
  assert.match(a.endpointFamilyDefinitions.comparisonMade, /EC50.*vs.*IC50/);
});

test('the WITHDRAWN 1.1212 noise floor is recorded as withdrawn, not quoted as a result', () => {
  const a = read('glp1r-d089-diagnostic0.sealed.json').artifact;
  assert.equal(a.measurements.true_replicate_sd_median, undefined, 'a withdrawn number must not sit among the measurements');
  assert.match(a.notMeasured.true_replicate_sd_median, /WITHDRAWN/);
  assert.equal(a.measurements.true_replicate_groups, 6);
});

test('ITEM 3: the status is CONSTRAINT_CONFLICT, and no impossibility proof is claimed', () => {
  const a = read('glp1r-d089-diagnostic0.sealed.json').artifact;
  assert.equal(a.status, 'CONSTRAINT_CONFLICT');
  assert.notEqual(a.status, 'IMPOSSIBILITY_PROOF');
  assert.match(a.statusRationale.whatIsNOTEstablished, /MAE <= 1\.0 is unachievable/);
  // the enumeration that IS established must be exhaustive: 2^3 - 1 subsets
  assert.equal(a.exhaustiveEndpointSubsetScan.results.length, 7);
  assert.equal(a.exhaustiveEndpointSubsetScan.anyHomogeneousSubsetSatisfyingFloors, false);
  const homogeneousPassing = a.exhaustiveEndpointSubsetScan.results.filter((r) => r.homogeneous && r.sizeOk);
  assert.deepEqual(homogeneousPassing, [], 'if any homogeneous subset passes, the conflict claim is false');
});

test('ITEM 4: the extension size 53 is PROPOSED with a shown derivation, not a diagnostic result', () => {
  const e = read('glp1r-d089-diagnostic0.sealed.json').artifact.extensionRequirement;
  assert.match(e.status, /PROPOSED/);
  assert.match(e.status, /HUMAN DECISION/);
  assert.equal(e.derivation.N, 53);
  // the derivation must rest on MEASURED proportions, not the nominal 60/20/20
  assert.equal(e.derivation.measuredAllocationEC50Only.train, 118);
  assert.equal(e.derivation.measuredAllocationEC50Only.test, 32);
  assert.ok(Math.abs(e.derivation.measuredAllocationEC50Only.pTrain - 0.6082) < 1e-4);
  assert.notEqual(e.derivation.measuredAllocationEC50Only.pTest, 0.2, 'the nominal 20% is NOT what the split actually allocates');
  assert.match(e.caveat, /EXPECTATION/);
  assert.match(e.qualitativeRequirement, /endpoint-HOMOGENEOUS/);
});

/* ------------------------------------------ ITEM 5: LAST-ATTEMPT FIREWALL */

test('ITEM 5: Diagnostic-0 consumed NO representation attempt; budget stands at 1 of 2', () => {
  const prereg = read('glp1r-d088-prereg.json');
  assert.equal(prereg.prereg.attemptBudget.max, 2);
  assert.equal(prereg.prereg.attemptBudget.consumedByThisExperiment, 1);
  const diag = read('glp1r-d089-diagnostic0.sealed.json').artifact;
  assert.equal(diag.representationAttemptsConsumed, 0);
  // remaining = max - D088 - diagnostics
  assert.equal(prereg.prereg.attemptBudget.max - prereg.prereg.attemptBudget.consumedByThisExperiment - diag.representationAttemptsConsumed, 1);
});

test('ITEM 5: the D-088 seal is intact — no agent re-sealed or edited it', () => {
  const prereg = read('glp1r-d088-prereg.json');
  assert.equal(canonicalHash(prereg.prereg).slice(0, 16), prereg.preregFingerprint);
  assert.equal(prereg.preregFingerprint, 'fc6cf73e63a9e569');
  assert.equal(prereg.prereg.sealedBy, 'HUMAN');
  assert.equal(prereg.prereg.approvalProvenance.agentMayNotSelfApprove, true);
});

test('ITEM 5: Strategy B and any endpoint-family change require a NEW human seal', () => {
  const diag = read('glp1r-d089-diagnostic0.sealed.json').artifact;
  const prereg = read('glp1r-d088-prereg.json').prereg;
  // D-088 forbids a third arm without a new seal
  assert.match(prereg.armsAreExhaustive, /NEW human-sealed preregistration/);
  // and the diagnostic does not itself authorise any strategy
  assert.equal(diag.extensionRequirement.status.includes('HUMAN DECISION'), true);
  // the endpoint families are DEFINITIONS in a sealed artifact: changing which
  // family the model fits changes the sealed comparison, so it cannot be an
  // agent-side edit without breaking the artifact hash (asserted above).
  assert.ok(Object.keys(diag.endpointFamilyDefinitions).length >= 4);
});

/* ------------------------------------------- GATE CONSTANTS ARE UNTOUCHED */

test('gate constants are UNCHANGED and MIN_R2 is 0.25 (never the 25 typo)', () => {
  const g = loadGlp1rValidationGate(GLP1R_GATE_PATH);
  assert.equal(g.ok, true);
  assert.equal(g.ruleFingerprint, 'd2f77a7e6042f0fc');
  assert.equal(g.gate.MIN_TRAIN, 150);
  assert.equal(g.gate.MIN_TEST, 40);
  assert.equal(g.gate.MAX_MAE, 1.0);
  assert.equal(g.gate.MIN_R2, 0.25);
  assert.notEqual(g.gate.MIN_R2, 25);
  const sealed = read('glp1r-d089-diagnostic0.sealed.json').artifact;
  assert.deepEqual(sealed.gateConstants, { MIN_TRAIN: 150, MIN_TEST: 40, MAX_MAE: 1.0, MIN_R2: 0.25 });
  assert.equal(sealed.gateConstantsChanged, false);
});

/* ------------------------------------------------- ITEM 6: EGRESS HONESTY */

test('ITEM 6: every acquisition source is EGRESS_BLOCKED with no fabricated counts or hashes', () => {
  const acq = read('glp1r-d089-diagnostic0.sealed.json').artifact.acquisitionStatus;
  assert.ok(acq.results.length >= 4);
  for (const r of acq.results) assert.equal(r.status, 'EGRESS_BLOCKED');
  assert.match(acq.conclusion, /No rows retrieved, no hashes computed, no scaffold counts derived/);
  // and target identity must NOT be asserted as verified
  assert.match(acq.conclusion, /remains a declaration, not a verified fact/);
});

/* ------------------------------------- D-091: SEALED DIAGNOSTIC-1 ARTIFACT */

test('D-091 Diagnostic-1 is sealed and its hash re-verifies', () => {
  const sealed = read('glp1r-d091-diagnostic1.sealed.json');
  assert.equal(canonicalHash(sealed.artifact), sealed.artifactHash, 'the sealed artifact was edited after sealing');
});

test('D-091 consumed no attempt, read no test split, fitted no model', () => {
  const a = read('glp1r-d091-diagnostic1.sealed.json').artifact;
  assert.equal(a.representationAttemptsConsumed, 0);
  assert.equal(a.testSplitRead, false);
  assert.equal(a.modelFitted, false);
  assert.equal(a.gateConstantsChanged, false);
  assert.equal(a.pinsChanged, false);
  assert.equal(a.winnerGateChanged, false);
});

test('D-091 reconciles with the D-089 seal and reports NOT_MEASURED everywhere', () => {
  const a = read('glp1r-d091-diagnostic1.sealed.json').artifact;
  assert.equal(a.measurements.EC50.replicateGroups, 4);
  assert.equal(a.measurements.IC50.replicateGroups, 2);
  assert.equal(a.measurements.KI.replicateGroups, 0);
  assert.equal(a.measurements.totalReplicateGroups, 6);
  for (const ep of ['EC50', 'IC50', 'KI']) assert.equal(a.measurements[ep].status, 'NOT_MEASURED');
  assert.equal(a.result.status, 'NOT_MEASURED');
  // the D-089 aggregate it must agree with
  const d089 = read('glp1r-d089-diagnostic0.sealed.json').artifact;
  assert.equal(d089.measurements.true_replicate_groups, a.measurements.totalReplicateGroups);
});

test('D-091 does NOT upgrade CONSTRAINT_CONFLICT into an impossibility claim', () => {
  const a = read('glp1r-d091-diagnostic1.sealed.json').artifact;
  assert.match(a.consequenceForTheResearchQuestion.answer, /UNDECIDABLE FROM THIS PIN/);
  assert.match(a.consequenceForTheResearchQuestion.answer, /NOT upgraded to an impossibility claim/);
  assert.equal(a.scientificStateUnchanged.NO_WINNER, true);
  assert.equal(a.scientificStateUnchanged.recipe, 'LOCKED');
  assert.equal(a.scientificStateUnchanged.d088AttemptBudget, '1 of 2 remaining');
});

test('D-091 records the assayId provenance it verified, including the inert-guard reasoning', () => {
  const v = read('glp1r-d091-diagnostic1.sealed.json').artifact.assayIdProvenanceVerification;
  assert.equal(v.distinctAssayIds, 25);
  assert.equal(v.nullOrEmptyAssayIds, 0);
  assert.equal(v.assaysCarryingMoreThanOneEndpointType, 0);
  assert.equal(v.moleculeAssayPairsAppearingMoreThanOnce, 0);
  assert.match(v.consequence, /currently REDUNDANT/);
  assert.match(v.consequence, /inert is not a guard that is unnecessary/);
});
