/**
 * GENERIC target-activity dataset engine: ingestion, human-only
 * normalization, fail-closed custody. Extracted unchanged (behaviour for
 * behaviour) from `glp1rDataset.mjs` when the GIPR track needed the same
 * machinery — D-081. `glp1rDataset.mjs` and `giprDataset.mjs` are now thin
 * PER-TARGET BINDINGS over this file: they supply the pin paths and the
 * target label, nothing else. There is exactly one normalization engine and
 * one custody engine in this repository, not one per target.
 *
 * ============================== THE CENTRAL FACT ==========================
 *
 * `CHEMBL5862` is Rattus norvegicus GLP-1R, NOT human — verified live against
 * the ChEMBL API in the session that specified the GLP-1R module
 * (target_organism = "Rattus norvegicus", tax_id 10116). This engine
 * therefore NEVER trusts a remembered target id as "the" human target for any
 * target. Human specificity is decided per row, from the row's own
 * `target_organism` field (`=== 'Homo sapiens'`, exact match, not a
 * substring/locale guess), because that field is what ChEMBL itself records
 * against the assay. An `expectedTargetId` may additionally be supplied at
 * ingestion time — RESOLVED BY A HUMAN OR A CI RECON STEP AGAINST THE LIVE
 * API, never hardcoded here — to further narrow to one specific target id
 * once organism has already filtered to human. This rule is target-agnostic
 * and applies to GIPR exactly as it applies to GLP-1R.
 *
 * ============================== CUSTODY =====================================
 *
 * FAIL-CLOSED, mirroring `tirzepatideBaseline.mjs` and
 * `chemotypeSimilarityAxis.mjs`: raw pinned bytes are sha256'd at pin time,
 * the digest is written to a sidecar `*.meta.json`, and every later read
 * re-hashes the bytes on disk and refuses anything that does not match. There
 * is no "unverified but usable" custody state — an artifact with no recorded
 * hash, or a hash that does not match, is BLOCKED, never a degraded-but-
 * readable state. (An earlier proposal used a `PINNED_UNVERIFIED_HASH`
 * custody status that let axis computation proceed on an unverified pin; this
 * repository does not build that state.)
 *
 * Manual/offline ingestion is the intended path in this runtime: ChEMBL
 * egress is refused at the agent proxy (verified live again for D-081:
 * www.ebi.ac.uk CONNECT rejected by organization policy), so the ingest
 * scripts read a human-supplied local JSON artifact rather than fetching one.
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { validate as rdkitValidate } from '../compute/rdkitAdapter.mjs';
import { sha256Hex } from '../determinism.mjs';

export const HUMAN_ORGANISM = 'Homo sapiens';

/** Standard activity types this module knows how to normalize onto a pActivity scale. */
const ACCEPTED_TYPES = Object.freeze(['EC50', 'IC50', 'KI', 'PEC50', 'PIC50', 'PKI']);

/** Sane pActivity bounds (1 mM to 1 pM). Outside this range a value is very likely a units/parsing error, not real biology. */
export const PACTIVITY_MIN = 3;
export const PACTIVITY_MAX = 12;


/**
 * Accepts a number, or a string that is ENTIRELY a plain decimal number —
 * because the real ChEMBL REST API serializes numeric fields as JSON strings
 * ("0.055", not 0.055), and refusing them would reject real data over a wire
 * format rather than over anything scientific.
 *
 * STRICT ON PURPOSE. `Number('>100')` is NaN but `Number(' 5 ')` is 5 and
 * `Number('')` is 0, so a bare coercion would silently admit padded junk and
 * turn an empty field into a real-looking zero. The regex admits only
 * `-?digits[.digits][e±digits]`, so a censored value (`>100`, `<1`, `~5`), a
 * value with a unit glued on (`5 nM`), a range (`1-2`) or an empty string all
 * still return null and are counted as rejections.
 *
 * WHAT THIS CANNOT DO: this artifact carries no `standard_relation` column, so
 * a value that was censored UPSTREAM and stored as a bare number is
 * indistinguishable from an exact measurement here. That limit is recorded in
 * D-077 rather than papered over.
 */
export function strictNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converts one (standardType, standardValue, standardUnits) triple to a
 * pActivity (-log10 of the molar concentration). Types already on a log
 * scale (P-prefixed) pass through as-is. Returns null — never a fabricated
 * number — for anything this function cannot convert unambiguously.
 */
export function toPActivity(standardType, standardValue, standardUnits) {
  const value = strictNumeric(standardValue);
  if (value === null) return null;
  const type = String(standardType ?? '').toUpperCase();
  if (type.startsWith('P')) return value;
  const unit = String(standardUnits ?? '').toUpperCase();
  const molarPerUnit = { NM: 1e-9, UM: 1e-6, 'µM': 1e-6, MM: 1e-3, M: 1 };
  const factor = molarPerUnit[unit];
  if (factor === undefined) return null;
  const molar = value * factor;
  if (!(molar > 0)) return null;
  // `+ 0` normalizes the IEEE-754 negative zero that -log10(1) produces.
  // JSON.stringify writes -0 as "0", so leaving it would make an in-memory
  // row and its pinned form differ — a small but real replay wart.
  return -Math.log10(molar) + 0;
}

/**
 * Normalizes raw ChEMBL-activity-shaped rows into a pinnable target-activity
 * table. Every rejection reason is counted, never silently dropped. Nothing
 * here invents a SMILES, a value, or a target id: an unresolvable row is
 * excluded, and the row count in `dropped` is the honest record of that.
 *
 * `validateSmiles`/`canonicalize` are injected (matching
 * `chemotypeSimilarityAxis.mjs::loadPinnedActives`'s pattern) so this stays
 * testable without a live RDKit process.
 */
export function normalizeActivityRows(
  rawRows,
  {
    humanOnly = true,
    expectedTargetId = null,
    /** Provenance the whole artifact carries (`{ sourceUrl, fetchedAt }`); individual rows override it when they state their own. */
    datasetProvenance = {},
    canonicalize = (s) => {
      const r = rdkitValidate(s);
      return r.ok ? r.canonicalSmiles : null;
    },
  } = {},
) {
  const dropped = {
    nonHuman: 0, badTarget: 0, missingSmiles: 0, unparseableSmiles: 0,
    unsupportedType: 0, missingValue: 0, badUnits: 0, outOfRange: 0,
    duplicate: 0, missingProvenance: 0,
  };
  const rows = [];
  const seen = new Set();
  const resolvedTargetIds = new Set();

  for (const r of Array.isArray(rawRows) ? rawRows : []) {
    const organism = typeof r?.target_organism === 'string' ? r.target_organism : '';
    if (humanOnly && organism !== HUMAN_ORGANISM) { dropped.nonHuman += 1; continue; }
    if (expectedTargetId && r?.target_chembl_id !== expectedTargetId) { dropped.badTarget += 1; continue; }

    const rawSmiles = typeof r?.canonical_smiles === 'string' ? r.canonical_smiles : null;
    if (!rawSmiles) { dropped.missingSmiles += 1; continue; }
    const canonicalSmiles = canonicalize(rawSmiles);
    if (!canonicalSmiles) { dropped.unparseableSmiles += 1; continue; }

    const type = String(r?.standard_type ?? '').toUpperCase();
    if (!ACCEPTED_TYPES.includes(type)) { dropped.unsupportedType += 1; continue; }

    const pActivity = toPActivity(type, r?.standard_value, r?.standard_units);
    if (pActivity === null) {
      // Distinguish "no numeric value at all" from "value present but units unrecognized" for an honest dropped count.
      if (strictNumeric(r?.standard_value) === null) dropped.missingValue += 1; else dropped.badUnits += 1;
      continue;
    }
    if (pActivity < PACTIVITY_MIN || pActivity > PACTIVITY_MAX) { dropped.outOfRange += 1; continue; }

    // Provenance may be carried per row OR inherited from the dataset the rows
    // came in (a fetched artifact normally states its source once, at the top,
    // not on all 287 rows). Inheriting is not a relaxation: the requirement
    // that every KEPT row ends up with a sourceUrl and a sourceId is unchanged,
    // and a dataset that states no source cannot satisfy it for any row.
    const sourceUrl = typeof r?.sourceUrl === 'string' ? r.sourceUrl : datasetProvenance.sourceUrl;
    const sourceId = typeof r?.sourceId === 'string' ? r.sourceId : (r?.assay_chembl_id ?? null);
    if (!sourceUrl || !sourceId) { dropped.missingProvenance += 1; continue; }

    const dedupKey = `${canonicalSmiles}|${r?.assay_chembl_id ?? ''}|${type}`;
    if (seen.has(dedupKey)) { dropped.duplicate += 1; continue; }
    seen.add(dedupKey);

    resolvedTargetIds.add(r?.target_chembl_id ?? null);
    rows.push(Object.freeze({
      canonicalSmiles,
      moleculeId: r?.molecule_chembl_id ?? null,
      targetId: r?.target_chembl_id ?? null,
      targetOrganism: organism,
      assayId: r?.assay_chembl_id ?? null,
      standardType: type,
      standardValue: strictNumeric(r.standard_value),
      standardUnits: r?.standard_units ?? null,
      pActivity,
      pchemblValue: strictNumeric(r?.pchembl_value),
      sourceId,
      sourceUrl,
      // A provenance LABEL on this row, not a new epistemic taxonomy: it says
      // how the bytes reached this repository. `user-supplied-reference` is the
      // honest default in this runtime, where ChEMBL egress is blocked and a
      // human hands over the artifact.
      sourceKind: typeof r?.sourceKind === 'string' ? r.sourceKind : 'user-supplied-reference',
      fetchedAt: typeof r?.fetchedAt === 'string' ? r.fetchedAt : (datasetProvenance.fetchedAt ?? null),
    }));
  }

  return {
    rows: Object.freeze(rows),
    dropped: Object.freeze(dropped),
    resolvedTargetIds: Object.freeze([...resolvedTargetIds].filter((id) => id != null)),
    kept: rows.length,
    seen: Array.isArray(rawRows) ? rawRows.length : 0,
  };
}

/** Writes the pin + a sidecar meta.json carrying the raw-byte sha256 (tirzepatideBaseline.mjs/chemotypeSimilarityAxis.mjs convention). */
export function writeActivityPin(rows, { jsonPath, metaPath, resolvedTargetIds = [] }) {
  const json = JSON.stringify(rows, null, 2);
  writeFileSync(jsonPath, json, 'utf8');
  const sha256 = sha256Hex(Buffer.from(json, 'utf8'));
  const meta = { sha256, n: rows.length, resolvedTargetIds, pinnedAt: new Date().toISOString() };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  return { contentSha256: sha256, n: rows.length };
}

/**
 * Fail-closed pin loader. Every failure mode is a distinct code, never a
 * silent empty result: PIN_MISSING, PIN_UNREADABLE, PIN_UNVERIFIED (no
 * recorded hash), PIN_HASH_DRIFT (bytes changed since pinning), PIN_EMPTY,
 * PIN_PROVENANCE_INCOMPLETE (a kept row lost its organism/provenance
 * somehow — defensive; normalizeGlp1rRows should never emit one).
 */
export function loadActivityPin({ jsonPath, metaPath, targetLabel = 'target', ingestHint = '' }) {
  if (!existsSync(jsonPath) || !existsSync(metaPath)) {
    return { ok: false, code: 'PIN_MISSING', reason: `no pinned ${targetLabel} human activity artifact in this runtime — ChEMBL egress is refused by the agent proxy here, so it has never been fetched${ingestHint ? `; ${ingestHint}` : ''}` };
  }
  let raw;
  let meta;
  try {
    raw = readFileSync(jsonPath, 'utf8');
    meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch (err) {
    return { ok: false, code: 'PIN_UNREADABLE', reason: String(err?.message ?? err).slice(0, 200) };
  }
  if (typeof meta?.sha256 !== 'string' || meta.sha256.length === 0) {
    return { ok: false, code: 'PIN_UNVERIFIED', reason: `meta.json records no sha256 for the ${targetLabel} pin — refusing to trust an unverified pin` };
  }
  const digest = sha256Hex(Buffer.from(raw, 'utf8'));
  if (digest !== meta.sha256) {
    return { ok: false, code: 'PIN_HASH_DRIFT', reason: `${targetLabel} pin sha256 ${digest} != pinned ${meta.sha256} — refusing to read a drifted artifact` };
  }
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch (err) {
    return { ok: false, code: 'PIN_UNREADABLE', reason: String(err?.message ?? err).slice(0, 200) };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, code: 'PIN_EMPTY', reason: `pinned ${targetLabel} activity table is empty` };
  }
  if (!rows.every((r) => r.targetOrganism === HUMAN_ORGANISM && r.sourceId && r.sourceUrl)) {
    return { ok: false, code: 'PIN_PROVENANCE_INCOMPLETE', reason: 'a pinned row is missing organism/provenance — pin was not produced by normalizeActivityRows()' };
  }
  return { ok: true, rows: Object.freeze(rows), contentSha256: digest, n: rows.length };
}
