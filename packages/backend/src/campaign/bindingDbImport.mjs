/**
 * D-084 — BindingDB import contract.
 *
 * BindingDB is the one plausible source of GIPR affinity rows that are NOT
 * ChEMBL deposits (see sourceIndependence.mjs). Its bulk files are behind a
 * manual download, and this runtime's egress is refused by proxy policy, so
 * NOTHING is fetched here. This module is the parser that runs when a file
 * is presented, and the refusals it enforces at that moment.
 *
 * =================== DEFECTS IN THE REVIEWED CANDIDATE ==================
 *
 * The reviewed package's parser was tested by running it, not by reading it,
 * and it failed its own test suite. Three separate defects:
 *
 *  1. UNIT FROM THE WRONG PLACE. It read the unit from the column to the
 *     RIGHT of the value: `(r[col(ep) + 1] ?? 'nM')`. BindingDB puts the unit
 *     in the HEADER — the column is literally named `Ki (nM)`. On the
 *     package's own fixture the adjacent column was PMID, so the unit parsed
 *     as "123", every row was rejected as unknownUnit, and the test expecting
 *     1 surviving row got 0.
 *
 *  2. A REGEX WITH `$` IN THE MIDDLE. `/^[A-Z0-9]{6}$(-\d+)?$/` anchors the
 *     end of input before the optional isoform group, so the isoform suffix it
 *     was written to allow can never match. Measured: `P48546` true,
 *     `P48546-1` FALSE. It also rejects every 10-character accession, so
 *     `A0A024R1R8` — a perfectly ordinary modern UniProt accession — was
 *     dropped as an invalid target.
 *
 *  3. A WRONG TARGET IDENTIFIER in the accompanying instructions: the
 *     download was specified "per UniProt P48546 / P43119". P48546 is GIPR,
 *     but the human GLP-1 receptor is P43220; P43119 is the prostacyclin
 *     receptor. Harvesting P43119 would have filled the GLP-1R pin with a
 *     different receptor entirely — the same class of error as the CHEMBL5862
 *     rat-GLP-1R mix-up this repository already has scar tissue from.
 *
 * Defect 3 is why no accession is hardcoded as "the target" below. The caller
 * DECLARES the accession it expects, and rows are checked against that
 * declaration. A wrong declaration then produces an empty import with a loud
 * reason, not a silently mis-targeted dataset.
 *
 * ============================ FAIL-CLOSED ENUM ==========================
 *   NO_RECOGNIZED_ENDPOINT_COLUMN   no `Ki (nM)`-shaped column in the header
 *   MISSING_REQUIRED_COLUMN         smiles / organism / accession absent
 *   TARGET_MISMATCH                 row's accession is not the declared one
 *   NON_HUMAN_ROW                   organism is not Homo sapiens
 *   CENSORED_VALUE                  `>100`, `<1`, `~5` — not a point estimate
 *   UNCONVERTIBLE_UNIT              unit the pActivity engine cannot place
 *   PACTIVITY_OUT_OF_RANGE          outside the existing 3..12 sanity bounds
 */

import { canonicalHash } from '../provenance.mjs';
import { HUMAN_ORGANISM, PACTIVITY_MIN, PACTIVITY_MAX, toPActivity } from './activityDataset.mjs';
import { familyOf } from './endpointFamily.mjs';

/**
 * Official UniProt accession grammar (UniProtKB manual), plus an optional
 * `-N` isoform suffix. Covers both the 6-character and 10-character forms.
 */
export const UNIPROT_ACCESSION_RE = /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-\d+)?$/;

/**
 * Target accessions this track cares about.
 *
 * MARKED UNVERIFIED ON PURPOSE. Egress is refused in this runtime, so these
 * could not be confirmed against rest.uniprot.org here. They are a DECLARATION
 * to be checked at ingest, not an authority: `parseBindingDb` compares rows
 * against whatever the caller passes, and the ingest script must verify the
 * accession against UniProt the moment egress exists.
 */
export const DECLARED_TARGET_ACCESSIONS = Object.freeze({
  GLP1R: Object.freeze({ accession: 'P43220', verified: false, note: 'human glucagon-like peptide 1 receptor — MUST be confirmed against UniProt before any pin is written' }),
  GIPR: Object.freeze({ accession: 'P48546', verified: false, note: 'human gastric inhibitory polypeptide receptor — MUST be confirmed against UniProt before any pin is written' }),
});

/** RFC4180 parser. Handles quoted separators, doubled quotes, CRLF, BOM, and TSV. */
export function parseDelimited(text, delimiter = ',') {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out = [];
  let row = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delimiter) { row.push(cur); cur = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cur); out.push(row); row = []; cur = '';
      continue;
    }
    cur += c;
  }
  if (cur !== '' || row.length > 0) { row.push(cur); out.push(row); }
  return out.filter((r) => r.length > 1 || r[0] !== '');
}

/** Header aliases seen across BindingDB's TSV exports. Matched case-insensitively. */
const SMILES_HEADERS = ['ligand smiles', 'smiles'];
const ORGANISM_HEADERS = ['target source organism according to curator or datasource', 'organism', 'target source organism'];
const ACCESSION_HEADERS = ['uniprot (swissprot) primary id of target chain', 'uniprot (swissprot) acc.', 'uniprot primary id', 'uniprot'];
const PMID_HEADERS = ['pmid', 'pubmed id'];
const RECORD_HEADERS = ['bindingdb reactant_set_id', 'bindingdb id'];

/** `Ki (nM)` -> { endpoint: 'Ki', unit: 'nM' }. The unit lives in the header, not a neighbouring cell. */
const ENDPOINT_HEADER_RE = /^\s*(ki|kd|ic50|ec50)\s*\(\s*([a-zµμ]+)\s*\)\s*$/i;

function findHeader(head, aliases) {
  return head.findIndex((h) => aliases.includes(String(h).trim().toLowerCase()));
}

/**
 * Parses a BindingDB export into normalized rows.
 *
 * `expectedAccession` is REQUIRED. There is no default target: a parser that
 * guesses which receptor it is reading is the defect described above.
 */
export function parseBindingDb(text, { expectedAccession, delimiter = '\t' } = {}) {
  if (typeof expectedAccession !== 'string' || !UNIPROT_ACCESSION_RE.test(expectedAccession)) {
    throw new Error(`FAIL_CLOSED[EXPECTED_ACCESSION_REQUIRED]: "${expectedAccession}" is not a UniProt accession; the caller must declare which receptor this file is supposed to contain`);
  }

  const table = parseDelimited(text, delimiter);
  if (table.length < 2) {
    return Object.freeze({ ok: false, code: 'MISSING_REQUIRED_COLUMN', rows: Object.freeze([]), rejected: Object.freeze({}), reasons: Object.freeze(['file has no data rows']) });
  }
  const head = table[0];

  const iSmiles = findHeader(head, SMILES_HEADERS);
  const iOrganism = findHeader(head, ORGANISM_HEADERS);
  const iAccession = findHeader(head, ACCESSION_HEADERS);
  const iPmid = findHeader(head, PMID_HEADERS);
  const iRecord = findHeader(head, RECORD_HEADERS);

  const endpointCols = [];
  head.forEach((h, idx) => {
    const m = ENDPOINT_HEADER_RE.exec(String(h));
    if (m) endpointCols.push({ idx, endpoint: m[1].toUpperCase() === 'KI' ? 'Ki' : m[1].toUpperCase() === 'KD' ? 'Kd' : m[1].toUpperCase(), unit: m[2] });
  });

  const missing = [];
  if (iSmiles < 0) missing.push('SMILES');
  if (iOrganism < 0) missing.push('organism');
  if (iAccession < 0) missing.push('UniProt accession');
  if (missing.length > 0) {
    return Object.freeze({ ok: false, code: 'MISSING_REQUIRED_COLUMN', rows: Object.freeze([]), rejected: Object.freeze({}), reasons: Object.freeze([`header lacks: ${missing.join(', ')}`]) });
  }
  if (endpointCols.length === 0) {
    return Object.freeze({ ok: false, code: 'NO_RECOGNIZED_ENDPOINT_COLUMN', rows: Object.freeze([]), rejected: Object.freeze({}), reasons: Object.freeze(['no column named like "Ki (nM)" was found; the unit is read from the header, never from a neighbouring cell']) });
  }

  const rejected = { targetMismatch: 0, nonHuman: 0, noSmiles: 0, censoredValue: 0, unconvertibleUnit: 0, outOfRange: 0, noEndpointValue: 0, foreignFamily: 0 };
  const rows = [];

  for (const r of table.slice(1)) {
    const accession = String(r[iAccession] ?? '').trim();
    if (accession !== expectedAccession) { rejected.targetMismatch += 1; continue; }
    const organism = String(r[iOrganism] ?? '').trim();
    if (!/^homo sapiens$/i.test(organism) && !/^human$/i.test(organism)) { rejected.nonHuman += 1; continue; }
    const smiles = String(r[iSmiles] ?? '').trim();
    if (smiles === '') { rejected.noSmiles += 1; continue; }

    let emitted = 0;
    for (const col of endpointCols) {
      const raw = String(r[col.idx] ?? '').trim();
      if (raw === '') continue;
      if (familyOf(col.endpoint) !== 'AFFINITY') { rejected.foreignFamily += 1; continue; }
      if (/^[<>~]/.test(raw)) { rejected.censoredValue += 1; continue; }
      const pActivity = toPActivity(col.endpoint, raw, col.unit);
      if (pActivity === null) {
        // strictNumeric already refused censored/garbage; a null here with a
        // numeric-looking value means the unit could not be placed.
        if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)) rejected.unconvertibleUnit += 1;
        else rejected.censoredValue += 1;
        continue;
      }
      if (pActivity < PACTIVITY_MIN || pActivity > PACTIVITY_MAX) { rejected.outOfRange += 1; continue; }
      rows.push(Object.freeze({
        canonicalSmiles: smiles,
        targetAccession: accession,
        organism: HUMAN_ORGANISM,
        standardType: col.endpoint,
        standardValue: raw,
        standardUnits: col.unit,
        pActivity,
        pmid: iPmid >= 0 ? (String(r[iPmid] ?? '').trim() || null) : null,
        recordId: iRecord >= 0 ? (String(r[iRecord] ?? '').trim() || null) : null,
        sourceDb: 'BindingDB',
      }));
      emitted += 1;
    }
    if (emitted === 0) rejected.noEndpointValue += 1;
  }

  return Object.freeze({
    ok: true,
    code: 'PARSED',
    expectedAccession,
    rows: Object.freeze(rows),
    rejected: Object.freeze(rejected),
    endpointColumns: Object.freeze(endpointCols.map((c) => Object.freeze({ endpoint: c.endpoint, unit: c.unit }))),
    parseFingerprint: canonicalHash({ n: rows.length, rejected, expectedAccession }).slice(0, 16),
    reasons: Object.freeze([]),
  });
}
