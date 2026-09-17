/**
 * D-103 — pins the FINAL (real canonicalSmiles identity) measurement's
 * structural invariants, including the C1 verdict and the reason it is not
 * closed. Does not re-derive the numbers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(readFileSync(path.join(HERE, 'campaign', 'glp1r-d103-noise-floor-final.json'), 'utf8'));

test('D-103: identity key is real canonicalSmiles, not a molecule-id substitute', () => {
  assert.equal(artifact.identityKey, 'canonicalSmiles (real, via replicateGrouping.mjs — no substitute)');
  assert.doesNotMatch(artifact.identityKey.toLowerCase(), /provisional|substitute for structure/);
});

test('D-103: A2 status is stated plainly — not delivered, not fabricated, partial coverage named and sourced', () => {
  assert.match(artifact.a2Status, /NOT_DELIVERED/);
  assert.match(artifact.a2Status, /0\/8/);
  assert.match(artifact.a2Status, /D-076\/077/);
});

test('D-103: exactly 7 of 300 A1 molecules have a real canonicalSmiles; the rest are excluded, not guessed', () => {
  assert.equal(artifact.a1MoleculeCount, 300);
  assert.equal(artifact.moleculesWithRealSmiles, 7);
  assert.equal(artifact.moleculesWithoutSmiles, 293);
  assert.equal(artifact.coveredMoleculeIds.length, 7);
});

test('D-103: C1 is NOT_CLOSED, for a stated data-volume reason — not a methodology failure', () => {
  assert.equal(artifact.c1Status, 'NOT_CLOSED');
  assert.match(artifact.c1Reason, /data volume, not methodology/);
});

test('D-103: no readout family reaches MEASURED under real structure identity', () => {
  for (const [family, r] of Object.entries(artifact.perFamily)) {
    assert.equal(r.status, 'NOT_MEASURED', family);
  }
});

test('D-103: carries the same sealed D-102 prereg fingerprint — no new, unsealed rule was introduced', () => {
  assert.equal(artifact.prereg.id, 'D-102-READOUT-FAMILY-PREREG');
  assert.equal(artifact.prereg.fingerprint, 'f475467a12dff413');
});

test('D-103: artifact hash present, tamper-detectable', () => {
  assert.equal(typeof artifact.artifactHash, 'string');
  assert.equal(artifact.artifactHash.length, 64);
});
