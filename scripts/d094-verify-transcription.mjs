#!/usr/bin/env node
/**
 * D-094 — verifies the transcribed A1 chunks and measures what they imply.
 *
 * Runs three things that are genuinely separable:
 *   1. CUSTODY   — do the bytes hash to what was declared, in the declared order
 *   2. POLICY    — does every row satisfy the selection rule that was declared
 *                  BEFORE transmission
 *   3. STRUCTURE — what does the within-group spread actually consist of
 *
 * (3) is the reason this script exists. A median spread is trivial to compute
 * and would be the wrong number to publish: see the WITHDRAWN note below.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a1');

/** Declared by the supplier, alongside the bytes. Checked, never assumed. */
export const DECLARED_CHUNKS = Object.freeze([
  { file: 'A1-chunk-01.psv', rows: 121, sha256: '5cba441b861af0817c56a68d9e4cc0281b550b26058763eaf79e4b47cdadbabf', firstKey: 829513, lastKey: 22772070 },
  { file: 'A1-chunk-02.psv', rows: 112, sha256: '371521e2b85e120056ccc4036ab010a7073a51de59b6b3b0b5db39e2c13e3358', firstKey: 22772071, lastKey: 25542027 },
]);
export const DECLARED_TOTAL_ROWS = 757;
export const DECLARED_TOTAL_CHUNKS = 7;

const FIELDS = ['activity_id', 'molecule_chembl_id', 'assay_chembl_id', 'standard_type', 'standard_relation',
  'standard_value', 'standard_units', 'pchembl_value', 'document_chembl_id', 'assay_type',
  'action_type', 'data_validity_comment', 'potential_duplicate'];

export function parseChunk(text) {
  return text.split('\n').filter((l) => l.length > 0).map((line) => {
    const parts = line.split('|');
    if (parts.length !== FIELDS.length) throw new Error(`FAIL_CLOSED[FIELD_COUNT]: ${parts.length} fields, expected ${FIELDS.length}`);
    return Object.fromEntries(FIELDS.map((f, i) => [f, parts[i]]));
  });
}

/** nM -> pActivity. The only transform applied, and it is reversible. */
export const pActivity = (nM) => 9 - Math.log10(Number(nM));

export function verifyCustody() {
  const present = readdirSync(DIR).filter((f) => f.endsWith('.psv')).sort();
  return DECLARED_CHUNKS.map((d) => {
    if (!present.includes(d.file)) return { ...d, status: 'NOT_RECEIVED' };
    const bytes = readFileSync(path.join(DIR, d.file));
    const actual = createHash('sha256').update(bytes).digest('hex');
    const rows = parseChunk(bytes.toString('utf8'));
    return {
      file: d.file,
      hashMatch: actual === d.sha256,
      actualSha256: actual,
      rowsMatch: rows.length === d.rows,
      actualRows: rows.length,
      firstKeyMatch: Number(rows[0].activity_id) === d.firstKey,
      lastKeyMatch: Number(rows[rows.length - 1].activity_id) === d.lastKey,
      status: actual === d.sha256 ? 'VERIFIED' : 'HASH_MISMATCH',
    };
  });
}

export function loadReceived() {
  const rows = [];
  for (const d of DECLARED_CHUNKS) {
    try { rows.push(...parseChunk(readFileSync(path.join(DIR, d.file), 'utf8'))); } catch { /* not received */ }
  }
  return rows;
}

/** The rule declared before transmission. Every clause is checked; none is waived. */
export function verifyPolicy(rows) {
  const fail = (name, predicate) => ({ name, offenders: rows.filter(predicate).length });
  const ids = rows.map((r) => Number(r.activity_id));
  return [
    fail('standard_type is EC50', (r) => r.standard_type !== 'EC50'),
    fail('standard_relation is "="', (r) => r.standard_relation !== '='),
    fail('standard_units present', (r) => r.standard_units === ''),
    fail('data_validity_comment empty (row would be REJECTED)', (r) => r.data_validity_comment !== ''),
    fail('potential_duplicate unset (row would be REJECTED)', (r) => r.potential_duplicate !== ''),
    fail('pActivity within [3,12]', (r) => { const p = pActivity(r.standard_value); return !(p >= 3 && p <= 12); }),
    fail('pchembl_value agrees with standard_value', (r) => r.pchembl_value !== '' && Math.abs(pActivity(r.standard_value) - Number(r.pchembl_value)) > 0.02),
    { name: 'activity_id strictly ascending, no duplicates', offenders: ids.filter((v, i) => i > 0 && v <= ids[i - 1]).length },
  ];
}

/**
 * Decomposes the within-group spread. This is NOT a noise-floor measurement and
 * the median it prints is explicitly WITHDRAWN as such — see D-094. It is here
 * to show what the spread is made of, which is the opposite of publishing it.
 */
export function decomposeSpread(rows) {
  const byMolecule = new Map();
  for (const r of rows) {
    if (!byMolecule.has(r.molecule_chembl_id)) byMolecule.set(r.molecule_chembl_id, []);
    byMolecule.get(r.molecule_chembl_id).push(r);
  }
  const groups = [...byMolecule.entries()].filter(([, rs]) => new Set(rs.map((r) => r.assay_chembl_id)).size >= 2);
  const spreadOf = (rs) => { const p = rs.map((r) => pActivity(r.standard_value)); return Math.max(...p) - Math.min(...p); };
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

  const mixedFormat = groups.filter(([, rs]) => new Set(rs.map((r) => r.assay_type)).size > 1);
  const pureFormat = groups.filter(([, rs]) => new Set(rs.map((r) => r.assay_type)).size === 1);
  const singlePaper = groups.filter(([, rs]) => new Set(rs.map((r) => r.document_chembl_id)).size === 1);

  return {
    groups: groups.length,
    medianSpreadAllGroups: median(groups.map(([, rs]) => spreadOf(rs))),
    medianSpreadMixedAssayType: median(mixedFormat.map(([, rs]) => spreadOf(rs))),
    medianSpreadSingleAssayType: median(pureFormat.map(([, rs]) => spreadOf(rs))),
    groupsMixingFunctionalAndBinding: mixedFormat.length,
    groupsWithinOnePaper: singlePaper.length,
    medianSpreadWithinOnePaper: median(singlePaper.map(([, rs]) => spreadOf(rs))),
    worst: groups.map(([m, rs]) => ({ molecule: m, spread: spreadOf(rs), assayTypes: [...new Set(rs.map((r) => r.assay_type))].join('+'), papers: new Set(rs.map((r) => r.document_chembl_id)).size }))
      .sort((a, b) => b.spread - a.spread).slice(0, 5),
  };
}

function main() {
  console.log('=== D-094 — TRANSCRIPTION VERIFICATION ===\n');
  console.log('1. CUSTODY');
  const custody = verifyCustody();
  for (const c of custody) {
    console.log(`  ${c.status.padEnd(14)} ${c.file}  rows=${c.actualRows}/${DECLARED_CHUNKS.find((d) => d.file === c.file).rows} hash=${c.hashMatch ? 'MATCH' : 'MISMATCH'} firstKey=${c.firstKeyMatch} lastKey=${c.lastKeyMatch}`);
  }
  const rows = loadReceived();
  console.log(`  received ${rows.length} of ${DECLARED_TOTAL_ROWS} declared rows (${custody.length}/${DECLARED_TOTAL_CHUNKS} chunks)\n`);

  console.log('2. POLICY (declared before transmission)');
  const policy = verifyPolicy(rows);
  for (const p of policy) console.log(`  ${p.offenders === 0 ? 'OK      ' : 'VIOLATED'} ${p.name}${p.offenders ? ` — ${p.offenders} rows` : ''}`);
  console.log();

  console.log('3. SPREAD DECOMPOSITION — not a noise floor, see D-094');
  const s = decomposeSpread(rows);
  console.log(`  replicate groups in received rows          : ${s.groups}`);
  console.log(`  median within-group spread                 : ${s.medianSpreadAllGroups.toFixed(4)} pActivity   [WITHDRAWN as a noise floor]`);
  console.log(`  groups mixing functional and binding assays : ${s.groupsMixingFunctionalAndBinding} of ${s.groups}`);
  console.log(`  median spread, mixed assay_type            : ${s.medianSpreadMixedAssayType.toFixed(4)}`);
  console.log(`  median spread, single assay_type           : ${s.medianSpreadSingleAssayType.toFixed(4)}`);
  console.log(`  groups entirely within ONE paper           : ${s.groupsWithinOnePaper}`);
  console.log(`  median spread within one paper             : ${s.medianSpreadWithinOnePaper.toFixed(4)}   <- same lab, same day, same label`);
  console.log('\n  worst groups:');
  for (const w of s.worst) console.log(`    ${w.molecule.padEnd(16)} spread ${w.spread.toFixed(2)} log  assay_type=${w.assayTypes}  papers=${w.papers}`);

  const custodyOk = custody.every((c) => c.status === 'VERIFIED' && c.rowsMatch && c.firstKeyMatch && c.lastKeyMatch);
  const policyOk = policy.every((p) => p.offenders === 0);
  console.log(`\nCUSTODY ${custodyOk ? 'VERIFIED' : 'FAILED'} · POLICY ${policyOk ? 'CLEAN' : 'VIOLATED'} · SET A1 INCOMPLETE (${rows.length}/${DECLARED_TOTAL_ROWS})`);
  console.log('NOISE FLOOR: NOT_MEASURED — the received grouping is not readout-homogeneous (D-094)');
  return custodyOk && policyOk ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('d094-verify-transcription.mjs')) process.exit(main());
