#!/usr/bin/env node
/**
 * D-105 — custody for the full 8/8 A2 structure dictionary.
 *
 * Every figure is recomputed from the pinned bytes under
 * data/transcription/glp1r-a2/. Nothing is copied from the delivery note.
 *
 * Three independent checks, in increasing strength:
 *   1. sha256 per chunk, under the convention that verified all seven A1
 *      chunks byte-exactly (rows only, LF, one trailing LF).
 *   2. RDKit parse, via the repo's existing rdkitAdapter.validate — a SMILES
 *      the toolkit rejects is corrupt, no judgement needed.
 *   3. Cross-check against the frozen D-076/077 pin, which is custody-verified
 *      ground truth already in this repository.
 *
 * Check 3 is what makes this delivery's failure mode legible: it caught a
 * structure whose bytes differ from the pin by a deleted 28-character run and
 * which STILL PARSES as a valid molecule. Corruption in this channel can be
 * silent and chemistry-valid, so "the SMILES parses" is not a substitute for
 * custody, and a chunk whose hash does not match must be treated as unknown in
 * full — not spot-checked into acceptance.
 *
 * There is deliberately no repair path here. Reconstructing a dropped run,
 * or re-splitting rows until a hash matches, is guess-and-check against a
 * known target (D-099, D-101).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate } from '../packages/backend/src/compute/rdkitAdapter.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A1_DIR = join(ROOT, 'data/transcription/glp1r-a1');
const A2_DIR = join(ROOT, 'data/transcription/glp1r-a2');
const PIN_PATH = join(ROOT, 'packages/backend/src/campaign/glp1rActivity.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * These reads are pure over frozen files, and rdkitParseReport() spawns one
 * RDKit process per structure. Memoised so the test suite pays for each exactly
 * once; the values themselves are unaffected.
 */
const memo = new Map();
const once = (key, fn) => {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key);
};

/** What the supplier declared, per chunk. Claims, verified below. */
export const A2_DECLARED = Object.freeze([
  Object.freeze({ n: 1, rows: 18, firstKey: 'CHEMBL2108724', lastKey: 'CHEMBL4098061', sha256: '0ee287d34316b4e222982e1daa3c7be0e4aab897a09be1e763e3dee9d6b36340' }),
  Object.freeze({ n: 2, rows: 17, firstKey: 'CHEMBL4098545', lastKey: 'CHEMBL4533613', sha256: '73d267bdbfcd0bbd9a5bd156e92ea1c20ffd7c07688115f7e5c63842d9ce976f' }),
  Object.freeze({ n: 3, rows: 12, firstKey: 'CHEMBL4556788', lastKey: 'CHEMBL4757461', sha256: 'ab5099478fda9de28200c8661384b7965b1f85a6f78a9045ababbe5304ae21ba' }),
  Object.freeze({ n: 4, rows: 11, firstKey: 'CHEMBL4757600', lastKey: 'CHEMBL4787910', sha256: '58fea53f27b1b40dae0757d7fec276f044be91504b658e01b4050ee58d47cc60' }),
  Object.freeze({ n: 5, rows: 15, firstKey: 'CHEMBL4788056', lastKey: 'CHEMBL5183336', sha256: '32c6d9e63482a4195729ffeb72523db365a4b281afbe4a749497ed9c128651b4' }),
  Object.freeze({ n: 6, rows: 68, firstKey: 'CHEMBL5187044', lastKey: 'CHEMBL5840270', sha256: 'd27693d5892a2201b04dd21bb92b55e9befc8a8f8edd7d55d957980a3244f64a' }),
  Object.freeze({ n: 7, rows: 106, firstKey: 'CHEMBL5844419', lastKey: 'CHEMBL6039318', sha256: '11fb68690ee60a5fd4e329fef1c5bb3f51e5036e55b797e0e9f1a1b1fabf03e4' }),
  Object.freeze({ n: 8, rows: 53, firstKey: 'CHEMBL6041508', lastKey: 'CHEMBL6176273', sha256: '37946708137ee26dfaccfa3cd5891f4ada8772c21cc573eaf551c25df6b7d96d' }),
]);

export const A2_DECLARED_TOTAL_ROWS = 300;
export const A2_DECLARED_NOT_RETRIEVED = Object.freeze(['CHEMBL2108724', 'CHEMBL5314341']);

/** The convention under which all seven A1 chunks verified byte-exactly. */
export const CHUNK_HASH_CONVENTION = Object.freeze({
  content: 'data rows only, no header lines',
  separator: 'LF',
  trailingNewline: true,
});

export function a1MoleculeIds() {
  return once('a1', () => {
  const ids = new Set();
  for (const file of readdirSync(A1_DIR).filter((f) => f.endsWith('.psv'))) {
    for (const line of readFileSync(join(A1_DIR, file), 'utf8').split('\n')) {
      if (line.trim()) ids.add(line.split('|')[1]);
    }
  }
  return ids;
  });
}

/** The frozen, already-custody-verified structures from D-076/077. */
export function pinnedSmiles() {
  return once('pin', () => {
  const map = new Map();
  for (const r of JSON.parse(readFileSync(PIN_PATH, 'utf8'))) {
    if (r.moleculeId && r.canonicalSmiles) map.set(r.moleculeId, r.canonicalSmiles);
  }
  return map;
  });
}

function readChunk(n) {
  const bytes = readFileSync(join(A2_DIR, `A2-chunk-0${n}.received.psv`));
  const rows = bytes.toString('utf8').split('\n').filter((l) => l.length > 0);
  return { bytes, rows };
}

/** Per-chunk custody: hash, declared shape, and what A1 says belongs here. */
export function checkChunk(declared) {
  const { bytes, rows } = readChunk(declared.n);
  const ids = rows.map((r) => r.split('|')[0]);
  const sorted = [...a1MoleculeIds()].sort()
    .filter((id) => id >= declared.firstKey && id <= declared.lastKey);
  const got = new Set(ids);
  const received = sha256(bytes);

  return {
    chunk: declared.n,
    declaredRows: declared.rows,
    receivedRows: rows.length,
    rowCountMatch: rows.length === declared.rows,
    firstKeyMatch: ids[0] === declared.firstKey,
    lastKeyMatch: ids[ids.length - 1] === declared.lastKey,
    sortedById: ids.every((v, i) => v === [...ids].sort()[i]),
    declaredSha256: declared.sha256,
    receivedSha256: received,
    hashMatch: received === declared.sha256,
    missingFromDelivery: sorted.filter((id) => !got.has(id)),
    foreignToA1: ids.filter((id) => !a1MoleculeIds().has(id)),
    emptySmiles: rows.filter((r) => r.split('|')[1] === '').map((r) => r.split('|')[0]),
    custody: rows.length === declared.rows && received === declared.sha256 ? 'VERIFIED' : 'FAILED',
  };
}

export function checkAllChunks() {
  return once('chunks', () => A2_DECLARED.map(checkChunk));
}

/** Only rows from chunks whose bytes verify may be used as structure identity. */
export function verifiedSmiles() {
  const map = new Map();
  for (const result of checkAllChunks()) {
    if (result.custody !== 'VERIFIED') continue;
    for (const row of readChunk(result.chunk).rows) {
      const i = row.indexOf('|');
      const smiles = row.slice(i + 1);
      if (smiles) map.set(row.slice(0, i), smiles);
    }
  }
  return map;
}

/** Every delivered row, verified or not — used only to characterise damage. */
export function allDeliveredSmiles() {
  const map = new Map();
  for (const d of A2_DECLARED) {
    for (const row of readChunk(d.n).rows) {
      const i = row.indexOf('|');
      map.set(row.slice(0, i), { smiles: row.slice(i + 1), chunk: d.n });
    }
  }
  return map;
}

/**
 * RDKit parse over every delivered structure. A rejected SMILES is corrupt;
 * an accepted one is NOT thereby custody-verified — see the header.
 */
export function rdkitParseReport() {
  return once('rdkit', () => {
  const unparseable = [];
  let parsed = 0;
  let empty = 0;
  for (const [id, { smiles, chunk }] of allDeliveredSmiles()) {
    if (!smiles) { empty += 1; continue; }
    if (validate(smiles).ok) parsed += 1;
    else unparseable.push({ id, chunk });
  }
  return { parsed, empty, unparseable, unparseableCount: unparseable.length };
  });
}

/**
 * Compare every delivered structure that also exists in the frozen pin.
 * The pin is ground truth: a disagreement is the delivery's defect.
 */
export function pinCrossCheck() {
  return once('pinCross', () => {
  const pin = pinnedSmiles();
  const agree = [];
  const disagree = [];
  for (const [id, { smiles, chunk }] of allDeliveredSmiles()) {
    if (!pin.has(id)) continue;
    if (pin.get(id) === smiles) agree.push(id);
    else {
      const p = pin.get(id);
      let i = 0;
      while (i < p.length && i < smiles.length && p[i] === smiles[i]) i += 1;
      let j = 0;
      while (j < p.length - i && j < smiles.length - i && p[p.length - 1 - j] === smiles[smiles.length - 1 - j]) j += 1;
      disagree.push({
        id,
        chunk,
        pinnedLength: p.length,
        deliveredLength: smiles.length,
        commonPrefix: i,
        commonSuffix: j,
        absentFromDelivery: p.slice(i, p.length - j),
        deliveredInItsPlace: smiles.slice(i, smiles.length - j),
        /** The damaged string still parses — corruption here is silent. */
        deliveredStillParses: validate(smiles).ok,
      });
    }
  }
  return { overlap: agree.length + disagree.length, agree: agree.length, disagree };
  });
}

/** How much structure identity survives custody, counted against A1's 300. */
export function coverage() {
  return once('coverage', () => {
  const results = checkAllChunks();
  const verified = verifiedSmiles();
  const a1 = a1MoleculeIds();
  const pin = pinnedSmiles();
  const usable = new Set([...verified.keys()].filter((id) => a1.has(id)));
  for (const id of a1) if (pin.has(id)) usable.add(id);

  const fromChunks = [...a1].filter((id) => verified.has(id));
  const fromPin = [...a1].filter((id) => pin.has(id));
  return {
    a1Molecules: a1.size,
    chunksVerified: results.filter((r) => r.custody === 'VERIFIED').map((r) => r.chunk),
    chunksFailed: results.filter((r) => r.custody !== 'VERIFIED').map((r) => r.chunk),
    rowsDelivered: results.reduce((n, r) => n + r.receivedRows, 0),
    declaredTotalRows: A2_DECLARED_TOTAL_ROWS,
    structuresFromVerifiedChunks: fromChunks.length,
    structuresFromFrozenPin: fromPin.length,
    countedInBothSources: fromChunks.filter((id) => pin.has(id)).length,
    custodyVerifiedStructures: usable.size,
    moleculesStillWithoutVerifiedStructure: a1.size - usable.size,
    complete: usable.size === a1.size,
  };
  });
}

/**
 * The structure identity map the measurement is allowed to use: verified A2
 * chunks plus the frozen pin. Where both carry a molecule, the PIN wins —
 * it is the older, independently custody-verified record.
 */
export function usableSmiles() {
  const map = new Map(verifiedSmiles());
  for (const [id, smiles] of pinnedSmiles()) map.set(id, smiles);
  return map;
}
