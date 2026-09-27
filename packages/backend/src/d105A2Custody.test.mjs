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
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const custody = await import(pathToFileURL(path.join(HERE, '../../../scripts/d105-a2-custody.mjs')).href);
const measurement = await import(pathToFileURL(path.join(HERE, '../../../scripts/d105-noise-floor-verified.mjs')).href);

test('A2 arrived 8/8; after one re-transmission three chunks verify byte-exactly', () => {
  const r = custody.checkAllChunks();
  assert.equal(r.length, 8);
  assert.deepEqual(r.filter((c) => c.custody === 'VERIFIED').map((c) => c.chunk), [3, 5, 6]);
  assert.deepEqual(r.filter((c) => c.custody !== 'VERIFIED').map((c) => c.chunk), [1, 2, 4, 7, 8]);
});

test('a chunk is adopted only by hash, never by looking better', () => {
  for (const c of custody.checkAllChunks()) {
    if (c.custody === 'VERIFIED') assert.ok(c.adoptedAttempt, `chunk ${c.chunk} must name its adopted attempt`);
    else assert.equal(c.adoptedAttempt, null, `chunk ${c.chunk} must adopt nothing`);
  }
});

test('the re-transmission supplied the row chunk 1 had lost', () => {
  const c1 = custody.checkAllChunks()[0];
  assert.equal(c1.receivedRows, 18);
  assert.equal(c1.declaredRows, 18);
  assert.deepEqual(c1.missingFromDelivery, []);
});

test('chunk 2 reproduced identical bytes across two transmissions — the corruption is deterministic', () => {
  const d = custody.attemptDisagreements().find((x) => x.chunk === 2);
  assert.equal(d.verdict, 'IDENTICAL_ACROSS_ATTEMPTS');
  // And it still misses the declared hash, so re-sending will not fix it.
  assert.equal(custody.checkAllChunks()[1].hashMatch, false);
});

test('chunk 4 disagrees with itself in BOTH directions, so neither attempt is the source', () => {
  const d = custody.attemptDisagreements().find((x) => x.chunk === 4);
  assert.equal(d.verdict, 'DIFFERING_ATTEMPTS');
  assert.equal(d.disagreesInBothDirections, true);
  assert.ok(d.attempt2Longer > 0 && d.attempt2Shorter > 0);
});

test('the verified chunk-3 attempt is SHORTER than the rejected one — longer is not truer', () => {
  const d = custody.attemptDisagreements().find((x) => x.chunk === 3);
  const row = d.rows.find((r) => r.id === 'CHEMBL4753375');
  assert.ok(row.attempt2Length < row.attempt1Length);
  // Attempt 2 is the one whose bytes hash to the declared value.
  assert.equal(custody.checkAllChunks()[2].custody, 'VERIFIED');
});

test('every chunk has the declared row count, keys and ordering', () => {
  for (const c of custody.checkAllChunks()) {
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

test('every RDKit-unparseable structure sits in a chunk that already failed on hash', () => {
  const r = custody.rdkitParseReport();
  const failed = new Set(custody.coverage().chunksFailed);
  for (const u of r.unparseable) assert.ok(failed.has(u.chunk), `${u.id} is in chunk ${u.chunk}`);
  assert.equal(r.empty, 2);
});

test('parse success does not confer custody: failed chunks are excluded in full', () => {
  const verified = custody.verifiedSmiles();
  const all = custody.allDeliveredSmiles();
  // Nearly every structure parses; only the byte-verified chunks may be used.
  assert.ok(custody.rdkitParseReport().parsed > 290);
  for (const [id, { chunk }] of all) {
    if (custody.coverage().chunksFailed.includes(chunk)) {
      assert.ok(!verified.has(id), `${id} from failed chunk ${chunk} must not be usable`);
    }
  }
});

test('coverage: 99 of 300 A1 molecules carry a custody-verified structure', () => {
  const c = custody.coverage();
  assert.equal(c.a1Molecules, 300);
  assert.equal(c.custodyVerifiedStructures, 99);
  assert.equal(c.structuresFromVerifiedChunks, 94);
  assert.equal(c.structuresFromFrozenPin, 7);
  assert.equal(c.countedInBothSources, 2);
  assert.equal(c.moleculesStillWithoutVerifiedStructure, 201);
  assert.equal(c.complete, false);
});

test('the two declared notRetrieved structures are absent, not invented', () => {
  const usable = custody.usableSmiles();
  for (const id of custody.A2_DECLARED_NOT_RETRIEVED) {
    assert.ok(!usable.has(id) || usable.get(id) === '', `${id} must carry no structure`);
  }
});

test('CHEMBL4088708 was never reconstructed; it arrived, in a chunk that still fails custody', () => {
  // It is present in the delivery now, but chunk 1 does not verify, so it is
  // not usable. Arriving is not the same as being verified.
  assert.ok(custody.allDeliveredSmiles().has('CHEMBL4088708'));
  assert.equal(custody.verifiedSmiles().has('CHEMBL4088708'), false);
});

test('CAMP clears the sealed threshold: 28 groups against a required 20', () => {
  const m = measurement.measure();
  assert.equal(m.perFamily.CAMP.groups, 28);
  assert.equal(m.perFamily.CAMP.status, 'MEASURED');
  assert.ok(m.perFamily.CAMP.groups >= 20);
});

test('C1 is CLOSED, on CAMP alone, with every other family still NOT_MEASURED', () => {
  const m = measurement.measure();
  assert.equal(m.c1Closed, true);
  assert.deepEqual(m.measuredFamilies, ['CAMP']);
  for (const [family, v] of Object.entries(m.perFamily)) {
    if (family !== 'CAMP') assert.equal(v.status, 'NOT_MEASURED');
  }
});

test('the measured CAMP noise floor sits ON the frozen MAX_MAE, not below it', () => {
  const m = measurement.measure();
  const gate = JSON.parse(readFileSync(
    path.join(HERE, 'campaign/glp1r-validation-gate.json'), 'utf8'));
  const maxMae = gate.MAX_MAE ?? gate.rules?.MAX_MAE ?? gate.gate?.MAX_MAE;
  assert.equal(maxMae, 1);
  // medianSd 1.0005 vs MAX_MAE 1.0: the gate asks a model to predict the
  // endpoint more precisely than the endpoint measures itself. Pinned so the
  // fact cannot quietly disappear — and NOT acted on by moving either number.
  assert.ok(m.perFamily.CAMP.medianSd >= maxMae,
    `noise floor ${m.perFamily.CAMP.medianSd} vs MAX_MAE ${maxMae}`);
  assert.equal(m.perFamily.CAMP.medianSd, 1.0005);
  assert.equal(m.perFamily.CAMP.medianSpread, 1.4949);
});

test('the measurement uses real structure identity, never molecule_chembl_id', () => {
  const src = readFileSync(path.join(HERE, '../../../scripts/d105-noise-floor-verified.mjs'), 'utf8');
  // moleculeId appears only as a LOOKUP KEY into the SMILES map, never as the
  // identity handed to replicateGroups.
  assert.ok(src.includes('canonicalSmiles: s'));
  assert.ok(!/standardType:\s*r\.moleculeId|canonicalSmiles:\s*r\.moleculeId/.test(src));
});

test('the sealed prereg fingerprint is carried through unchanged', async () => {
  const prereg = await import(pathToFileURL(path.join(HERE, '../../../scripts/d102-readout-family-prereg.mjs')).href);
  assert.equal(prereg.PREREG_FINGERPRINT, 'f475467a12dff413');
});

test('the custody module exposes no repair or reconstruction helper', () => {
  const names = Object.keys(custody).map((n) => n.toLowerCase());
  for (const banned of ['repair', 'fix', 'reconstruct', 'patch', 'strip', 'bruteforce', 'variants']) {
    assert.ok(!names.some((n) => n.includes(banned)), `unexpected export matching ${banned}`);
  }
});

test('chunks 7 and 8 were re-transmitted and still fail; chunk 8 got WORSE', () => {
  const r = custody.checkAllChunks();
  for (const n of [7, 8]) {
    const c = r.find((x) => x.chunk === n);
    assert.equal(c.attempts, 2, `chunk ${n} attempts`);
    assert.equal(c.custody, 'FAILED', `chunk ${n} custody`);
  }
  // Chunk 8's second attempt carries two MORE corrupted structures than its first.
  const boron = custody.aromaticBoronArtifacts();
  const a1 = boron.hits.filter((h) => h.file.endsWith('attempt1.psv')).length;
  const a2 = boron.hits.filter((h) => h.file.endsWith('attempt2.psv')).length;
  assert.equal(a1, 2);
  assert.equal(a2, 4);
});

test('the channel signature is a single-character c -> b substitution', () => {
  const boron = custody.aromaticBoronArtifacts();
  // Lowercase b is aromatic BORON; every hit sits in one identical context.
  assert.deepEqual(boron.contexts, ['2ccc(Cb3cccc(']);
  assert.ok(boron.count > 0);
});

test('boron is NOT the only defect, so patching it would hide the rest', () => {
  const boron = custody.aromaticBoronArtifacts();
  // Chunks that fail custody while carrying no boron artifact at all prove the
  // channel does more than c -> b. This is why no repair is attempted.
  assert.ok(boron.failedChunksWithNoBoronArtifact.includes(7),
    'chunk 7 fails with zero boron artifacts');
  assert.ok(boron.failedChunksWithNoBoronArtifact.length >= 3);
});

test('after every re-transmission, custody still admits exactly three chunks', () => {
  const c = custody.coverage();
  assert.deepEqual(c.chunksVerified, [3, 5, 6]);
  assert.deepEqual(c.chunksFailed, [1, 2, 4, 7, 8]);
  assert.equal(c.rowsDelivered, 300);
  assert.equal(c.custodyVerifiedStructures, 99);
});
