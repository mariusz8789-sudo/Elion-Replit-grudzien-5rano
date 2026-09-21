/**
 * D-102 — pins the provisional artifact's structural invariants. Does not
 * re-derive the numbers (that would just be running the classifier twice);
 * pins what the sealed run actually produced, so silent drift is caught.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(path.join(HERE, 'campaign', 'glp1r-d102-noise-floor-provisional.json'), 'utf8'));

test('D-102: artifact is explicitly labelled PROVISIONAL, never a final noise-floor claim', () => {
  assert.equal(artifact.kind, 'PROVISIONAL_MEASUREMENT');
  assert.match(artifact.identityKey, /NOT canonicalSmiles/);
  assert.match(artifact.warning, /falsely LOW spread/);
  assert.match(artifact.warning, /still requires A2/);
});

test('D-102: carries the sealed prereg fingerprint, not a re-derived one', () => {
  assert.equal(artifact.prereg.id, 'D-102-READOUT-FAMILY-PREREG');
  assert.equal(typeof artifact.prereg.fingerprint, 'string');
  assert.equal(artifact.prereg.fingerprint.length, 16);
});

test('D-102: unverified-label rows (A3 chunk-3 drift) are excluded from classification, not silently included', () => {
  assert.equal(artifact.unverifiedLabelRowsExcluded, 190);
});

test('D-102: every family in the taxonomy is reported, including OTHER for unmatched readouts (ERK etc.)', () => {
  const families = Object.keys(artifact.perFamily);
  assert.deepEqual(families.sort(), ['ARRESTIN', 'BINDING', 'CALCIUM', 'CAMP', 'INTERNALIZATION', 'OTHER'].sort());
});

test('D-102: CAMP family clears the frozen noise-floor threshold (>=20 groups) under this provisional identity', () => {
  assert.equal(artifact.perFamily.CAMP.status, 'MEASURED');
  assert.ok(artifact.perFamily.CAMP.groups >= artifact.minGroupsForNoiseFloor);
});

test('D-102: no family other than CAMP reaches MEASURED under this provisional pass', () => {
  for (const [family, r] of Object.entries(artifact.perFamily)) {
    if (family === 'CAMP') continue;
    assert.equal(r.status, 'NOT_MEASURED', family);
  }
});

test('D-102: artifact hash is present, so a hand-edit of this file is detectable', () => {
  assert.equal(typeof artifact.artifactHash, 'string');
  assert.equal(artifact.artifactHash.length, 64);
});
