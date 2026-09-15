/**
 * D-105 — custody and measurement tests for the full 8/8 A2 delivery.
 *
 * Negative-first where the delivery failed, and pinned where it succeeded.
 * The most important assertions here are the ones that would break if someone
 * later relaxed custody to "it parses, ship it": this delivery contains a
 * structure that parses cleanly AND is provably wrong, so parse-success is
 * asserted NOT to imply custody.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const custody = await import(path.join(HERE, '../../../scripts/d105-a2-custody.mjs'));
const measurement = await import(path.join(HERE, '../../../scripts/d105-noise-floor-verified.mjs'));

test('A2 arrived 8/8 and exactly two chunks verify byte-exactly', () => {
  const r = custody.checkAllChunks();
  assert.equal(r.length, 8);
  assert.deepEqual(r.filter((c) => c.custody === 'VERIFIED').map((c) => c.chunk), [5, 6]);
  assert.deepEqual(r.filter((c) => c.custody !== 'VERIFIED').map((c) => c.chunk), [1, 2, 3, 4, 7, 8]);
});

test('chunk 1 is still short exactly one row, and A1 names which', () => {
  const c1 = custody.checkAllChunks()[0];
  assert.equal(c1.receivedRows, 17);
  assert.equal(c1.declaredRows, 18);
  assert.deepEqual(c1.missingFromDelivery, ['CHEMBL4088708']);
});

test('every other chunk has the declared row count, keys and ordering', () => {
  for (const c of custody.checkAllChunks().slice(1)) {
    assert.equal(c.receivedRows, c.declaredRows, `chunk ${c.chunk} row count`);
    assert.ok(c.firstKeyMatch && c.lastKeyMatch, `chunk ${c.chunk} keys`);
    assert.ok(c.sortedById, `chunk ${c.chunk} ordering`);
    assert.deepEqual(c.foreignToA1, [], `chunk ${c.chunk} foreign ids`);
  }
});

test('the frozen D-076/077 pin agrees with 6 of 7 overlapping structures', () => {
  const p = custody.pinCrossCheck();
  assert.equal(p.overlap, 7);
  assert.equal(p.agree, 6);
  assert.equal(p.disagree.length, 1);
});

test('the one disagreement is a deleted run that still parses — corruption here is SILENT', () => {
  const [d] = custody.pinCrossCheck().disagree;
  assert.equal(d.id, 'CHEMBL414357');
  assert.equal(d.chunk, 2);
  assert.equal(d.pinnedLength - d.deliveredLength, 28);
  // Pure deletion: nothing was substituted in its place.
  assert.equal(d.deliveredInItsPlace, '');
  assert.equal(d.absentFromDelivery, 'H](CCC(=O)O)NC(=O)CNC(=O)[C@');
  // This is the assertion that forbids "it parses, therefore it is fine".
  assert.equal(d.deliveredStillParses, true);
});

test('RDKit rejects four delivered structures, all in failed chunks', () => {
  const r = custody.rdkitParseReport();
  assert.equal(r.unparseableCount, 4);
  const failed = new Set(custody.coverage().chunksFailed);
  for (const u of r.unparseable) assert.ok(failed.has(u.chunk), `${u.id} is in chunk ${u.chunk}`);
  assert.equal(r.empty, 2);
});

test('parse success does not confer custody: failed chunks are excluded in full', () => {
  const verified = custody.verifiedSmiles();
  const all = custody.allDeliveredSmiles();
  // 293 structures parse, but only the byte-verified chunks may be used.
  assert.equal(custody.rdkitParseReport().parsed, 293);
  for (const [id, { chunk }] of all) {
    if (custody.coverage().chunksFailed.includes(chunk)) {
      assert.ok(!verified.has(id), `${id} from failed chunk ${chunk} must not be usable`);
    }
  }
});

test('coverage: 87 of 300 A1 molecules carry a custody-verified structure', () => {
  const c = custody.coverage();
  assert.equal(c.a1Molecules, 300);
  assert.equal(c.custodyVerifiedStructures, 87);
  assert.equal(c.structuresFromVerifiedChunks, 82);
  assert.equal(c.structuresFromFrozenPin, 7);
  assert.equal(c.countedInBothSources, 2);
  assert.equal(c.moleculesStillWithoutVerifiedStructure, 213);
  assert.equal(c.complete, false);
});

test('the two declared notRetrieved structures are absent, not invented', () => {
  const usable = custody.usableSmiles();
  for (const id of custody.A2_DECLARED_NOT_RETRIEVED) {
    assert.ok(!usable.has(id) || usable.get(id) === '', `${id} must carry no structure`);
  }
});

test('the missing row CHEMBL4088708 was not reconstructed', () => {
  assert.equal(custody.usableSmiles().has('CHEMBL4088708'), false);
});

test('CAMP reaches 16 replicate groups — real progress, still under the sealed threshold', () => {
  const m = measurement.measure();
  assert.equal(m.perFamily.CAMP.groups, 16);
  assert.equal(m.perFamily.CAMP.status, 'NOT_MEASURED');
  // The prereg minimum is 20 and is NOT adjusted to meet a result.
  assert.ok(m.perFamily.CAMP.groups < 20);
});

test('C1 stays NOT_CLOSED and no family reached MEASURED', () => {
  const m = measurement.measure();
  assert.equal(m.c1Closed, false);
  assert.deepEqual(m.measuredFamilies, []);
  for (const v of Object.values(m.perFamily)) assert.equal(v.status, 'NOT_MEASURED');
});

test('the measurement uses real structure identity, never molecule_chembl_id', () => {
  const src = readFileSync(path.join(HERE, '../../../scripts/d105-noise-floor-verified.mjs'), 'utf8');
  // moleculeId appears only as a LOOKUP KEY into the SMILES map, never as the
  // identity handed to replicateGroups.
  assert.ok(src.includes('canonicalSmiles: s'));
  assert.ok(!/standardType:\s*r\.moleculeId|canonicalSmiles:\s*r\.moleculeId/.test(src));
});

test('the sealed prereg fingerprint is carried through unchanged', async () => {
  const prereg = await import(path.join(HERE, '../../../scripts/d102-readout-family-prereg.mjs'));
  assert.equal(prereg.PREREG_FINGERPRINT, 'f475467a12dff413');
});

test('the custody module exposes no repair or reconstruction helper', () => {
  const names = Object.keys(custody).map((n) => n.toLowerCase());
  for (const banned of ['repair', 'fix', 'reconstruct', 'patch', 'strip', 'bruteforce', 'variants']) {
    assert.ok(!names.some((n) => n.includes(banned)), `unexpected export matching ${banned}`);
  }
});
