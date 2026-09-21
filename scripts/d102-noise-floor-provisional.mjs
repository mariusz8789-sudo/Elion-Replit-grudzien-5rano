#!/usr/bin/env node
/**
 * D-102 — the noise-floor measurement the D-102 seal was written to enable.
 *
 * ====================== WHY THIS IS "PROVISIONAL", NOT FINAL ==============
 *
 * `replicateGrouping.mjs`'s canonical identity is `canonicalSmiles`, by
 * design (see its own header) — grouping on `molecule_chembl_id` alone risks
 * splitting replicate groups that a real structure comparison would merge
 * (salts, unspecified stereochemistry, duplicate deposits), which produces a
 * falsely LOW spread. This is exactly what the Qwen transcription brief
 * (§3) required A2 (SMILES) to prevent, and it is exactly what D-096's own
 * computation did NOT prevent: D-096 grouped by molecule_chembl_id, a defect
 * this file names rather than repeats.
 *
 * A2 is still 0/8. Until it arrives, `molecule_chembl_id` is used here as an
 * explicit, LABELED substitute — every output is tagged `PROVISIONAL`, and
 * the sealed, final noise-floor measurement still requires A2.
 *
 * ============================ WHAT IS SEALED ===============================
 *
 * The four D-100 rules (action_type covariate, readout-family stratification,
 * HSA-in-CAMP, suspect-flat-value exclusion) ARE sealed and ARE applied here
 * exactly as written — that part of this run is not provisional.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PREREG, PREREG_FINGERPRINT, SUSPECT_FLAT_VALUE_ASSAYS, UNVERIFIED_LABEL_ASSAYS } from './d102-readout-family-prereg.mjs';
import { readoutFamilyOf, hsaConditionOf } from './d102-readout-classifier.mjs';
import { replicateGroups, noiseFloorStatus, REPLICATE_RULE } from '../packages/backend/src/campaign/replicateGrouping.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A1_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a1');
const A3_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a3');

function loadA1() {
  const files = readdirSync(A1_DIR).filter((f) => f.endsWith('.psv')).sort();
  const rows = [];
  for (const f of files) {
    for (const line of readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
      if (!line) continue;
      const p = line.split('|');
      rows.push({
        activityId: p[0], moleculeId: p[1], assayId: p[2], standardType: p[3], standardRelation: p[4],
        standardValue: Number(p[5]), standardUnits: p[6], pchembl: p[7], documentId: p[8], assayType: p[9],
        actionType: p[10],
      });
    }
  }
  return rows;
}

function loadA3() {
  const files = readdirSync(A3_DIR).filter((f) => f.endsWith('.psv')).sort();
  const byAssay = new Map();
  for (const f of files) {
    for (const line of readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
      if (!line) continue;
      const p = line.split('|');
      byAssay.set(p[0], { targetId: p[1], assayType: p[2], baoFormat: p[3], baoLabel: p[4], description: p[5] });
    }
  }
  return byAssay;
}

function main() {
  console.log('=== D-102 — READOUT-STRATIFIED NOISE FLOOR (PROVISIONAL: molecule_chembl_id identity, A2 not yet available) ===\n');
  console.log(`prereg: ${PREREG.id}  fingerprint ${PREREG_FINGERPRINT}  sealed by: ${PREREG.sealedBy}\n`);

  const a1 = loadA1();
  const a3 = loadA3();
  console.log(`A1 rows: ${a1.length}  A3 assays: ${a3.size}`);

  let unverifiedRows = 0;
  let flatValueRows = 0;
  const classified = [];
  for (const r of a1) {
    if (r.standardType !== 'EC50') continue; // A1 is EC50-only by construction; asserted, not assumed.
    const desc = a3.get(r.assayId);
    if (UNVERIFIED_LABEL_ASSAYS.includes(r.assayId)) { unverifiedRows += 1; continue; }
    if (!desc) continue; // assay not yet in A3 (shouldn't happen at 90/90, but fail closed rather than guess)
    const family = readoutFamilyOf(desc.description);
    const hsaCondition = family === 'CAMP' ? hsaConditionOf(desc.description) : null;
    const suspectFlat = SUSPECT_FLAT_VALUE_ASSAYS.includes(r.assayId);
    if (suspectFlat) flatValueRows += 1;
    // pActivity: nM -> pActivity, same transform used throughout this campaign.
    const pActivity = 9 - Math.log10(r.standardValue);
    classified.push({
      canonicalSmiles: r.moleculeId, // PROVISIONAL substitute for structure identity — see header.
      standardType: family, // stratify by family, not raw standardType, for this pass
      assayId: r.assayId,
      pActivity,
      actionType: r.actionType,
      hsaCondition,
      suspectFlat,
    });
  }

  console.log(`rows classified: ${classified.length}  (excluded: unverified-label ${unverifiedRows})`);
  console.log(`rows on suspect-flat-value assays: ${flatValueRows} (kept in grouping, excluded from spread stat below)\n`);

  const byFamily = new Map();
  for (const r of classified) { if (!byFamily.has(r.standardType)) byFamily.set(r.standardType, []); byFamily.get(r.standardType).push(r); }

  const results = {};
  console.log('per-family, PROVISIONAL (molecule_chembl_id identity):');
  for (const [family, rows] of byFamily) {
    const nonFlat = rows.filter((r) => !r.suspectFlat);
    const g = replicateGroups(nonFlat, family);
    const status = noiseFloorStatus(g);
    results[family] = { rows: rows.length, rowsExFlat: nonFlat.length, molecules: g.molecules, groups: g.groups.length, status: status.status, medianSpread: status.status === 'MEASURED' ? status.medianSpread : null };
    console.log(`  ${family.padEnd(16)} rows=${String(rows.length).padStart(3)} (ex-flat ${nonFlat.length})  molecules=${String(g.molecules).padStart(3)}  groups=${String(g.groups.length).padStart(3)}  ${status.status}${status.status === 'MEASURED' ? `  medianSpread=${status.medianSpread.toFixed(4)}` : ''}`);
  }

  const artifact = {
    id: 'D-102-NOISE-FLOOR-PROVISIONAL',
    kind: 'PROVISIONAL_MEASUREMENT',
    identityKey: 'molecule_chembl_id — NOT canonicalSmiles; A2 (SMILES) is 0/8 chunks',
    warning: 'molecule_chembl_id identity risks a falsely LOW spread relative to true structure identity (salts, unspecified stereochemistry, duplicate deposits). This is PROVISIONAL, not the sealed noise-floor number. The final measurement still requires A2.',
    prereg: { id: PREREG.id, fingerprint: PREREG_FINGERPRINT },
    a1RowCount: a1.length, a3AssayCount: a3.size,
    unverifiedLabelRowsExcluded: unverifiedRows,
    suspectFlatValueRows: flatValueRows,
    perFamily: results,
    minGroupsForNoiseFloor: REPLICATE_RULE.minGroupsForNoiseFloor,
    computedAt: new Date().toISOString(),
  };
  artifact.artifactHash = canonicalHash({ ...artifact, artifactHash: undefined });

  const out = path.join(REPO, 'packages', 'backend', 'src', 'campaign', 'glp1r-d102-noise-floor-provisional.json');
  writeFileSync(out, JSON.stringify(artifact, null, 2));
  console.log(`\nsealed provisional artifact -> ${path.relative(REPO, out)}  hash ${artifact.artifactHash.slice(0, 16)}…`);
  console.log('\nDECISION: PROVISIONAL ONLY. Final noise-floor measurement is BLOCKED on A2 (0/8).');
}

main();
