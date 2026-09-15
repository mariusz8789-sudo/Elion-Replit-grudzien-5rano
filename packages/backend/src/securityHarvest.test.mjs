import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { chainAppend, verifyChain, SECURITY_EVENTS, CHAIN_GENESIS } from './security/auditChain.mjs';
import { watchGates, watchPins, watchWinnerFabrication, watchEvidenceRank, watchHark, runIntegrityWatchdogs, FROZEN_GATE_FINGERPRINTS } from './security/scientificIntegrity.mjs';
import { familyOf, assertSingleEndpointFamily, partitionByFamily } from './campaign/endpointFamily.mjs';
import { parseAssayDescription, assessIndependence, partitionAssays } from './campaign/sourceIndependence.mjs';
import { parseDelimited, parseBindingDb, UNIPROT_ACCESSION_RE, DECLARED_TARGET_ACCESSIONS } from './campaign/bindingDbImport.mjs';
import { extensionManifest, currentExtensionManifests, extensionSummary, assertBasePinsUntouched, readBasePinDigest, BASE_PIN_META } from './campaign/extensionManifest.mjs';
import { pinEntry, buildPinManifest } from './campaign/pinManifest.mjs';
import { allowlistedBiotechUrl } from './biotechProxy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GLP1R_SHA = '5533d8b8940987fde860cd3438882e0b1bc509bc810f75f1cff4302530e69244';
const GIPR_SHA = '24bac802ce9a65a6c83bb7e4dbe4567aff97f9a5eecf99c26c369876426b87ba';

/* ------------------------------------------------------------------ audit chain */

test('AUDIT CHAIN: a mutated payload is detected — the exact case the reviewed version missed', () => {
  // The reviewed candidate canonicalized with JSON.stringify(v, Object.keys(v).sort()),
  // whose second argument is a REPLACER ARRAY. Nested payload keys were filtered out,
  // so every payload hashed as {} and this mutation went undetected.
  let chain = chainAppend(Object.freeze([]), { event: 'AUTH_FAIL', actor: 'sys', payload: { u: 'x' }, at: 1 });
  chain = chainAppend(chain, { event: 'PERMISSION_DENY', actor: 'u1', payload: { p: 'pin.write' }, at: 2 });
  assert.equal(verifyChain(chain).ok, true);

  const tampered = chain.map((e, i) => (i === 0 ? { ...e, payload: { u: 'tampered' } } : e));
  const v = verifyChain(tampered);
  assert.equal(v.ok, false);
  assert.equal(v.code, 'CHAIN_TAMPERED_AT_0');
});

test('AUDIT CHAIN: deleting a record breaks the chain rather than shortening it quietly', () => {
  let chain = chainAppend(Object.freeze([]), { event: 'AUTH_FAIL', actor: 'a', payload: null, at: 1 });
  chain = chainAppend(chain, { event: 'RATE_LIMITED', actor: 'b', payload: null, at: 2 });
  assert.equal(verifyChain([chain[1]]).code, 'CHAIN_SEQ_GAP_AT_0');
});

test('AUDIT CHAIN: an empty chain is not evidence of integrity', () => {
  assert.equal(verifyChain([]).ok, false);
  assert.equal(verifyChain([]).code, 'CHAIN_EMPTY');
});

test('AUDIT CHAIN: an unknown event type is refused, so the enum cannot silently grow', () => {
  assert.throws(() => chainAppend([], { event: 'SOMETHING_NEW', actor: 'x', at: 1 }), /UNKNOWN_SECURITY_EVENT/);
  assert.ok(SECURITY_EVENTS.includes('WINNER_FABRICATION_ATTEMPT'));
  assert.equal(CHAIN_GENESIS, 'genesis');
});

test('AUDIT CHAIN: the clock is supplied by the caller so the chain replays', () => {
  assert.throws(() => chainAppend([], { event: 'AUTH_FAIL', actor: 'x' }), /AUDIT_TIMESTAMP_REQUIRED/);
});

/* -------------------------------------------------------- integrity watchdogs */

test('WATCHDOG: the real frozen gates on disk are untampered', () => {
  assert.deepEqual(watchGates(), []);
});

test('WATCHDOG: relaxing MAX_MAE — the edit that would make the failing model pass — is caught', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gate-'));
  const raw = JSON.parse(readFileSync(path.join(HERE, 'campaign', 'glp1r-validation-gate.json'), 'utf8'));
  raw.gate.MAX_MAE = 1.1;
  const p = path.join(dir, 'g.json');
  writeFileSync(p, JSON.stringify(raw));
  const events = watchGates({ GLP1R: p }, { GLP1R: FROZEN_GATE_FINGERPRINTS.GLP1R });
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'GATE_TAMPERED');
});

test('WATCHDOG: a DECLARED pin that is ABSENT fails — the D-083 inversion is not reintroduced', () => {
  // The reviewed package proposed `live[k] !== undefined && live[k] !== BASE[k]`,
  // under which a missing pin passes. It delegates to verifyPinManifest instead.
  const glp = pinEntry({ pinId: 'GLP1R', role: 'base', target: 'CHEMBL1784', species: 'Homo sapiens', normalizedSha256: GLP1R_SHA, rows: 287 });
  const gip = pinEntry({ pinId: 'GIPR', role: 'base', target: 'CHEMBL4383', species: 'Homo sapiens', normalizedSha256: GIPR_SHA, rows: 233 });
  const manifest = buildPinManifest([glp, gip]);

  assert.deepEqual(watchPins(manifest, { GLP1R: GLP1R_SHA, GIPR: GIPR_SHA }), []);
  const missing = watchPins(manifest, { GLP1R: GLP1R_SHA });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].event, 'PIN_MISSING');
  assert.equal(missing[0].pinId, 'GIPR');
});

test('WATCHDOG: a WinnerRecord without a canonical PROMOTE is a fabrication attempt', () => {
  assert.deepEqual(watchWinnerFabrication(null, 'NO_PROMOTION'), []);
  assert.deepEqual(watchWinnerFabrication({ id: 'w' }, 'PROMOTE'), []);
  assert.equal(watchWinnerFabrication({ id: 'w' }, 'NO_PROMOTION')[0].event, 'WINNER_FABRICATION_ATTEMPT');
});

test('WATCHDOG: promotion below the required evidence rank is a fabrication attempt', () => {
  assert.deepEqual(watchEvidenceRank({ maxRank: 10 }), []);
  assert.equal(watchEvidenceRank({ maxRank: 2 })[0].event, 'WINNER_FABRICATION_ATTEMPT');
});

test('WATCHDOG: analysis diverging from the sealed preregistration is HARKing', () => {
  assert.deepEqual(watchHark('abc', 'abc'), []);
  assert.equal(watchHark('abc', 'def')[0].event, 'HARK_MISMATCH');
});

test('WATCHDOG: the composite run is clean against the real repository state', () => {
  const r = runIntegrityWatchdogs({ preregFingerprint: 'x', analysisFingerprint: 'x' });
  assert.equal(r.clean, true, JSON.stringify(r.events));
});

/* ------------------------------------------------------------- endpoint family */

test('ENDPOINT FAMILY: Ki and Kd classify as AFFINITY regardless of case', () => {
  // A first version of familyOf uppercased the input and compared it against
  // the mixed-case literals 'Ki'/'Kd', so the two commonest ChEMBL endpoints
  // classified as UNKNOWN. Found by running it.
  for (const t of ['Ki', 'ki', 'KI', 'Kd', 'EC50', 'ic50']) assert.equal(familyOf(t), 'AFFINITY', t);
  for (const t of ['POTENCY', 'potency', 'AC50']) assert.equal(familyOf(t), 'POTENCY', t);
  assert.equal(familyOf('WEIRD'), null);
  assert.equal(familyOf(null), null);
});

test('ENDPOINT FAMILY: POTENCY rows offered to the affinity-sealed gate are REFUSED, not filtered', () => {
  const rows = [{ standardType: 'EC50' }, ...Array.from({ length: 3000 }, () => ({ standardType: 'POTENCY' }))];
  const r = assertSingleEndpointFamily(rows, 'AFFINITY');
  assert.equal(r.ok, false);
  assert.equal(r.counts.POTENCY, 3000);
  assert.match(r.reasons.join(' '), /ENDPOINT_FAMILY_MIXING/);
  // and the refusal is loud rather than a silent drop
  assert.match(r.reasons.join(' '), /not a larger dataset/);
});

test('ENDPOINT FAMILY: an unclassified endpoint type fails closed', () => {
  assert.equal(assertSingleEndpointFamily([{ standardType: 'SOMETHING_NEW' }]).ok, false);
  assert.equal(assertSingleEndpointFamily([{ standardType: 'EC50' }]).ok, true);
});

test('ENDPOINT FAMILY: partitioning routes each family to its own bucket', () => {
  const p = partitionByFamily([{ standardType: 'Ki' }, { standardType: 'POTENCY' }, { standardType: 'ZZZ' }]);
  assert.equal(p.AFFINITY.length, 1);
  assert.equal(p.POTENCY.length, 1);
  assert.equal(p.UNCLASSIFIED.length, 1);
});

/* --------------------------------------------------------- source independence */

test('SOURCE INDEPENDENCE: a ChEMBL deposit re-served by PubChem is a duplicate, not a new row', () => {
  const meta = parseAssayDescription({ PC_AssayContainer: [{ assay: { descr: { aid: { id: 2240461 }, aid_source: { db: { name: 'ChEMBL', source_id: { str: 'CHEMBL6113419' } } }, name: 'GIPR cAMP' } } }] });
  const a = assessIndependence(meta);
  assert.equal(a.independent, false);
  assert.equal(a.code, 'CROSS_SOURCE_DUPLICATE');
  assert.match(a.reason, /count the same observations twice/);
});

test('SOURCE INDEPENDENCE: unknown provenance fails closed rather than counting as new', () => {
  const meta = parseAssayDescription({ PC_AssayContainer: [{ assay: { descr: { aid: { id: 5 }, name: 'x' } } }] });
  assert.equal(assessIndependence(meta).independent, false);
});

test('SOURCE INDEPENDENCE: a genuinely different source is admitted', () => {
  const meta = parseAssayDescription({ PC_AssayContainer: [{ assay: { descr: { aid: { id: 9 }, aid_source: { db: { name: 'Tocris', source_id: { str: 'T1' } } }, name: 'x' } } }] });
  assert.equal(assessIndependence(meta).independent, true);
});

test('SOURCE INDEPENDENCE: a payload of the wrong shape throws instead of guessing', () => {
  assert.throws(() => parseAssayDescription({}), /PUBCHEM_SHAPE_MISMATCH/);
  assert.throws(() => parseAssayDescription(null), /PUBCHEM_SHAPE_MISMATCH/);
});

test('SOURCE INDEPENDENCE: partitioning separates admissible from duplicate', () => {
  const p = partitionAssays([
    { aid: 1, sourceDb: 'ChEMBL', sourceId: 'C1', name: 'a' },
    { aid: 2, sourceDb: 'Tocris', sourceId: 'T1', name: 'b' },
  ]);
  assert.equal(p.independent.length, 1);
  assert.equal(p.duplicates.length, 1);
});

/* ------------------------------------------------------------- BindingDB parse */

test('BINDINGDB: the UniProt grammar accepts isoforms and 10-character accessions', () => {
  // The reviewed regex /^[A-Z0-9]{6}$(-\d+)?$/ has `$` in the MIDDLE, so the
  // isoform suffix it was written to permit can never match, and every
  // 10-character accession was rejected as an invalid target.
  for (const ok of ['P43220', 'P48546', 'P48546-1', 'A0A024R1R8']) assert.ok(UNIPROT_ACCESSION_RE.test(ok), ok);
  for (const bad of ['bad', '', 'PPPPPP']) assert.equal(UNIPROT_ACCESSION_RE.test(bad), false, bad);
});

test('BINDINGDB: the parser refuses to run without a declared target accession', () => {
  assert.throws(() => parseBindingDb('a\tb\n1\t2', {}), /EXPECTED_ACCESSION_REQUIRED/);
  assert.throws(() => parseBindingDb('a\tb\n1\t2', { expectedAccession: 'P43119x' }), /EXPECTED_ACCESSION_REQUIRED/);
});

test('BINDINGDB: declared accessions are marked UNVERIFIED because egress is refused here', () => {
  // Guards against a wrong target silently becoming authoritative. The reviewed
  // instructions named P43119 (the prostacyclin receptor) as GLP-1R.
  assert.equal(DECLARED_TARGET_ACCESSIONS.GLP1R.verified, false);
  assert.equal(DECLARED_TARGET_ACCESSIONS.GIPR.verified, false);
  assert.equal(DECLARED_TARGET_ACCESSIONS.GLP1R.accession, 'P43220');
  assert.notEqual(DECLARED_TARGET_ACCESSIONS.GLP1R.accession, 'P43119');
});

test('BINDINGDB: the unit comes from the header, never from the neighbouring column', () => {
  // The reviewed parser read `r[col(ep) + 1]`, which on its own fixture was the
  // PMID column; every row was then rejected as an unknown unit.
  const tsv = [
    'Ligand SMILES\tOrganism\tUniProt (SwissProt) Acc.\tKi (nM)\tPMID\tBindingDB ID',
    'CCO\tHomo sapiens\tP48546\t10\t123\t1',
  ].join('\n');
  const r = parseBindingDb(tsv, { expectedAccession: 'P48546' });
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].standardUnits, 'nM');
  assert.equal(r.rows[0].pmid, '123');
  assert.ok(Math.abs(r.rows[0].pActivity - 8) < 1e-9);
});

test('BINDINGDB: wrong target, non-human, censored and empty rows are each refused with their own reason', () => {
  const tsv = [
    'Ligand SMILES\tOrganism\tUniProt (SwissProt) Acc.\tKi (nM)\tPMID\tBindingDB ID',
    'CCO\tHomo sapiens\tP48546\t10\t1\t1',
    'CCN\tRattus norvegicus\tP48546\t10\t\t2',
    'CCC\tHomo sapiens\tP43220\t10\t\t3',
    'CCO\tHomo sapiens\tP48546\t>10000\t\t4',
    '\tHomo sapiens\tP48546\t10\t\t5',
  ].join('\n');
  const r = parseBindingDb(tsv, { expectedAccession: 'P48546' });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rejected.nonHuman, 1);
  assert.equal(r.rejected.targetMismatch, 1);
  assert.equal(r.rejected.censoredValue, 1);
  assert.equal(r.rejected.noSmiles, 1);
});

test('BINDINGDB: a file with no recognizable endpoint column fails closed', () => {
  const tsv = 'Ligand SMILES\tOrganism\tUniProt (SwissProt) Acc.\nCCO\tHomo sapiens\tP48546';
  const r = parseBindingDb(tsv, { expectedAccession: 'P48546' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NO_RECOGNIZED_ENDPOINT_COLUMN');
});

test('BINDINGDB: RFC4180 quoting survives embedded separators, doubled quotes, CRLF and BOM', () => {
  assert.deepEqual(parseDelimited('a,b\n"x,y","z""q"\n')[1], ['x,y', 'z"q']);
  assert.deepEqual(parseDelimited('a,b\r\n1,2\r\n')[1], ['1', '2']);
  assert.deepEqual(parseDelimited('﻿a,b\n1,2')[0], ['a', 'b']);
  assert.deepEqual(parseDelimited('a\tb\n1\t2', '\t')[1], ['1', '2']);
});

/* ------------------------------------------------------------ extension manifests */

test('EXTENSION MANIFEST: nothing claims a hash for bytes that were never retrieved', () => {
  const manifests = currentExtensionManifests();
  assert.ok(manifests.length > 0);
  for (const m of manifests) {
    if (m.status !== 'READY') {
      assert.equal(m.rawSha256, null, m.id);
      assert.equal(m.normalizedSha256, null, m.id);
    }
  }
  assert.equal(extensionSummary(manifests).fabricatedHashes, 0);
  assert.equal(extensionSummary(manifests).anyReady, false);
});

test('EXTENSION MANIFEST: a non-READY manifest carrying a digest is refused outright', () => {
  assert.throws(() => extensionManifest({ id: 'X', status: 'HOLD', normalizedSha256: 'a'.repeat(64), source: 's' }), /HASH_WITHOUT_BYTES/);
  assert.throws(() => extensionManifest({ id: 'Y', status: 'READY', source: 's' }), /READY_WITHOUT_DIGEST/);
  assert.throws(() => extensionManifest({ id: 'Z', status: 'INVENTED', source: 's' }), /UNKNOWN_EXTENSION_STATUS/);
});

test('EXTENSION MANIFEST: the POTENCY family is on HOLD, never merged into the sealed gate', () => {
  const potency = currentExtensionManifests().find((m) => m.id === 'GLP1R_POTENCY_FAMILY_V1');
  assert.equal(potency.status, 'HOLD');
  assert.match(potency.holdReason, /may NOT be concatenated/);
});

test('EXTENSION MANIFEST: base pin digests are read from disk and drift is detected', () => {
  assert.equal(readBasePinDigest(BASE_PIN_META.GLP1R).sha256, GLP1R_SHA);
  assert.equal(readBasePinDigest(BASE_PIN_META.GIPR).sha256, GIPR_SHA);
  assert.equal(assertBasePinsUntouched({ GLP1R: GLP1R_SHA, GIPR: GIPR_SHA }).ok, true);
  const drift = assertBasePinsUntouched({ GIPR: '0'.repeat(64) });
  assert.equal(drift.ok, false);
  assert.equal(drift.events[0].event, 'PIN_DRIFT');
});

test('EXTENSION MANIFEST: a missing pin file is reported, not treated as unchanged', () => {
  const r = assertBasePinsUntouched({ GLP1R: GLP1R_SHA }, { GLP1R: path.join(tmpdir(), 'does-not-exist-'+Date.now()+'.json') });
  assert.equal(r.ok, false);
  assert.equal(r.events[0].event, 'PIN_MISSING');
});

/* --------------------------------------------------------------- egress policy */

test('EGRESS: the existing allowlist is exact-host, so the IPv6 loopback bypass is impossible', () => {
  // The reviewed package proposed a NEW ssrfGuard using a private-range regex.
  // Measured: it passed `https://[::1]/` because URL.hostname keeps the
  // brackets, and it BLOCKED `https://fda.gov/` because the hostname starts
  // with "fd". The existing exact-host allowlist has neither failure mode, so
  // no second guard was introduced.
  assert.equal(allowlistedBiotechUrl('https://[::1]/rest/pug/compound/x'), null);
  assert.equal(allowlistedBiotechUrl('http://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/x'), null);
  assert.equal(allowlistedBiotechUrl('https://evil.com/rest/pug/compound/x'), null);
  assert.equal(allowlistedBiotechUrl('https://pubchem.ncbi.nlm.nih.gov/cgi-bin/evil'), null);
  assert.ok(allowlistedBiotechUrl('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/1/property/CanonicalSMILES/JSON'));
  assert.ok(allowlistedBiotechUrl('https://www.ebi.ac.uk/chembl/api/data/activity.json'));
});
