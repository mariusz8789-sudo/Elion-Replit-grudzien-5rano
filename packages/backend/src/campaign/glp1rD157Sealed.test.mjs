import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D-157 — guard on the assay-role audit layer. It must cover exactly D-152's blocked list, must
 * leave D-152's own files untouched, and must not quietly adopt its counterfactual arm.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (n) => JSON.parse(fs.readFileSync(path.join(HERE, n), 'utf8'));
const SEALED = read('glp1r-d157-assay-role-audit.sealed.json');
const PREREG = read('glp1r-d157-assay-role-audit-prereg.json');
const D152 = read('glp1r-d152-endpoint-scope.sealed.json');
const D152_ROLES = read('glp1r-assay-roles-d152.json');
const D153 = read('glp1r-d153-functional-model.sealed.json');

describe('D-157 assay-role audit layer', () => {
  test('it covers exactly the 16 assays D-152 could not classify', () => {
    assert.deepEqual(SEALED.assays.map((a) => a.assayId).sort(), [...D152.assays.blockedByDataAccess].sort());
    assert.deepEqual([...PREREG.sourceData.expectedSet].sort(), [...D152.assays.blockedByDataAccess].sort());
  });

  test('D-152\'s own role file still says what it said: every one of the 16 is UNKNOWN / BLOCKED_BY_DATA_ACCESS there', () => {
    for (const id of D152.assays.blockedByDataAccess) {
      assert.equal(D152_ROLES.assays[id].role, 'UNKNOWN');
      assert.equal(D152_ROLES.assays[id].reason, 'BLOCKED_BY_DATA_ACCESS');
    }
  });

  test('every new role is one the frozen rule can produce, with a reason and the text it read', () => {
    const allowed = new Set(['FUNCTIONAL_AGONISM', 'OTHER_FUNCTIONAL', 'BINDING_AFFINITY', 'UNKNOWN']);
    for (const a of SEALED.assays) {
      assert.ok(allowed.has(a.newRole), `${a.assayId}: ${a.newRole}`);
      assert.ok(a.newReason && a.newReason !== 'BLOCKED_BY_DATA_ACCESS', `${a.assayId} still has no description`);
      assert.ok(a.chembl.descriptionVerbatim.length > 10);
    }
  });

  test('the outcome matches the assays', () => {
    const anyFunctional = SEALED.assays.some((a) => a.newRole === 'FUNCTIONAL_AGONISM');
    assert.equal(SEALED.outcome, anyFunctional ? 'INTERPRETATION_CHANGED' : 'NO_INTERPRETATION_CHANGE');
  });

  test('the enlarged functional arm is reported, never adopted, and D-153 is left exactly as sealed', () => {
    assert.equal(SEALED.counterfactualFunctionalArm.status, 'REPORTED_NOT_ADOPTED');
    assert.match(SEALED.counterfactualFunctionalArm.d153Status, /stands exactly as sealed/);
    assert.equal(D153.dataset.functionalRows, 320);
    assert.equal(D153.dataset.functionalCompounds, 206);
  });

  test('every source file was hash-verified', () => {
    assert.equal(SEALED.sourceData.allHashesMatched, true);
    assert.equal(SEALED.sourceData.filesVerified, 17);
  });
});
