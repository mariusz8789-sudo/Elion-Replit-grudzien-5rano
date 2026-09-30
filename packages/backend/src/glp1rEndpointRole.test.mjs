import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyAssayRole, ENDPOINT_ROLES } from './campaign/glp1rEndpointRole.mjs';

const rec = (description, extra = {}) => ({ record: { targetId: 'CHEMBL1784', assayType: 'F', bao: 'BAO_0000219', format: 'cell-based format', description }, ...extra });

test('D-151 acceptance 1: a binding-only assay never becomes agonism', () => {
  const r = classifyAssayRole(rec('Displacement of [125I]-GLP1 from human GLP1 receptor expressed in BHK cells'));
  assert.equal(r.role, 'BINDING_AFFINITY');
  assert.notEqual(r.role, 'FUNCTIONAL_AGONISM');
});

test('D-151 acceptance 2: an EC50 is not agonism by itself — a bare potency line stays UNKNOWN', () => {
  // The standardType is deliberately not an input: this description backs 36 EC50 rows in the real pin.
  const r = classifyAssayRole(rec('Potency measured using recombinant human GLP-1 receptor expressed in Baby Hamster Kidney (BHK)cells'));
  assert.equal(r.role, 'UNKNOWN');
  assert.equal(r.reason, 'NO_READOUT_AND_NO_MECHANISM_NAMED');
});

test('agonism plus a cAMP readout is the only route to FUNCTIONAL_AGONISM', () => {
  const r = classifyAssayRole(rec('Agonist activity at human GLP1R expressed in CHO cells assessed as stimulation of cAMP production'));
  assert.equal(r.role, 'FUNCTIONAL_AGONISM');
  assert.equal(r.reason, 'AGONISM_STATED_AND_CAMP_READOUT_NAMED');
  assert.equal(r.speciesStated, true);
  assert.equal(r.heterologousSystem, true);
});

test('a non-cAMP transducer is functional but not agonism on the Gs arm', () => {
  const arrestin = classifyAssayRole(rec('Agonist activity at human GLP-1R expressed in PathHunter CHO-K1 cells assessed as induction of beta-arrestin 2 recruitment'));
  assert.equal(arrestin.role, 'OTHER_FUNCTIONAL');
  const internalisation = classifyAssayRole(rec('Agonist activity at FAP-tagged human GLP-1R expressed in HEK293 cells assessed as receptor internalization'));
  assert.equal(internalisation.role, 'OTHER_FUNCTIONAL');
});

test('allosteric modulation is not agonism', () => {
  const r = classifyAssayRole(rec('Positive allosteric modulation of human recombinant GLP1 receptor expressed in 9-3-H cells by calcium mobilization assay'));
  assert.equal(r.role, 'OTHER_FUNCTIONAL');
  assert.equal(r.reason, 'ALLOSTERIC_MODULATION_NOT_AGONISM');
});

test('no description means BLOCKED_BY_DATA_ACCESS, never a guess', () => {
  for (const input of [undefined, { record: null }, rec('   ')]) {
    const r = classifyAssayRole(input);
    assert.equal(r.role, 'UNKNOWN');
    assert.equal(r.reason, 'BLOCKED_BY_DATA_ACCESS');
  }
});

test('an unstated receptor origin is recorded, not silently read as human', () => {
  const r = classifyAssayRole(rec('Agonist activity at GLP-1R (unknown origin) expressed in CHO cells assessed as increase in cAMP production'));
  assert.equal(r.role, 'FUNCTIONAL_AGONISM');
  assert.equal(r.speciesStated, false, 'species must not be assumed human when the description says unknown origin');
});

test('conflicting signals resolve to UNKNOWN rather than to a preferred role', () => {
  const r = classifyAssayRole(rec('Agonist activity assessed as cAMP accumulation; receptor density confirmed by saturation binding with [125I]-GLP-1'));
  assert.equal(r.role, 'UNKNOWN');
  assert.equal(r.reason, 'CONFLICTING_SIGNALS');
});

test('every returned role is one of the four declared roles', () => {
  const samples = ['Agonist activity ... cAMP production', 'Displacement of [125I]-GLP1', 'Potency measured using recombinant receptor', 'beta-arrestin 2 recruitment'];
  for (const s of samples) assert.ok(ENDPOINT_ROLES.includes(classifyAssayRole(rec(s)).role));
});
