#!/usr/bin/env node
/**
 * D-103 — the FINAL, sealed noise-floor measurement: real structure identity
 * via replicateGrouping.mjs, no substitute. Supersedes D-102's PROVISIONAL
 * pass for the molecules this can cover.
 *
 * ============================ A2 STATUS ===================================
 *
 * A2 (bulk SMILES for A1's 300 molecules) is 0/8 chunks — never delivered.
 * Checked before writing anything here, and found nowhere else:
 *   - no A2 files under data/transcription/
 *   - no .smi/.sdf/SMILES cache anywhere in the repo outside the frozen pin
 *   - egress to every chemistry host (EBI, UniProt, PubChem, NCBI eutils,
 *     BindingDB, NCI cactus resolver, OPSIN) still returns http=000,
 *     "gateway answered 403 to CONNECT (policy denial)" — unchanged from
 *     D-092b's CHANNEL_CONSTRAINT
 *   - RDKit is installed locally, but it is a cheminformatics TOOLKIT
 *     (canonicalisation, fingerprints, scaffolds) — it has no database of
 *     ChEMBL structures and cannot supply a SMILES for a molecule_chembl_id
 *     it has never been given
 *
 * What WAS found: 7 of A1's 300 molecules already have a real, previously
 * ingested and custody-verified canonicalSmiles, because they also appear in
 * the frozen GLP-1R pin from D-076/077 (`glp1rActivity.json`). That is real
 * data already in this repository, not fabricated, not a substitute — used
 * here exactly as far as it goes, and no further.
 *
 * The other 293 molecules have NO canonicalSmiles anywhere this container can
 * reach. No SMILES was invented for them. Rows on those molecules are
 * excluded from this file's measurement and counted, not guessed.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PREREG, PREREG_FINGERPRINT, SUSPECT_FLAT_VALUE_ASSAYS, UNVERIFIED_LABEL_ASSAYS } from './d102-readout-family-prereg.mjs';
import { readoutFamilyOf } from './d102-readout-classifier.mjs';
import { replicateGroups, noiseFloorStatus, REPLICATE_RULE } from '../packages/backend/src/campaign/replicateGrouping.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A1_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a1');
const A3_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a3');
const PIN_PATH = path.join(REPO, 'packages', 'backend', 'src', 'campaign', 'glp1rActivity.json');

function loadA1() {
  const files = readdirSync(A1_DIR).filter((f) => f.endsWith('.psv')).sort();
  const rows = [];
  for (const f of files) {
    for (const line of readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
      if (!line) continue;
      const p = line.split('|');
      rows.push({ activityId: p[0], moleculeId: p[1], assayId: p[2], standardType: p[3], standardValue: Number(p[5]) });
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
      byAssay.set(p[0], { description: p[5] });
    }
  }
  return byAssay;
}
function loadRealSmiles() {
  const pin = JSON.parse(readFileSync(PIN_PATH, 'utf8'));
  const map = new Map();
  for (const r of pin) if (r.moleculeId && r.canonicalSmiles) map.set(r.moleculeId, r.canonicalSmiles);
  return map;
}

function main() {
  console.log('=== D-103 — FINAL NOISE FLOOR: real canonicalSmiles identity, no substitute ===\n');
  console.log(`prereg: ${PREREG.id}  fingerprint ${PREREG_FINGERPRINT}\n`);

  const a1 = loadA1();
  const a3 = loadA3();
  const realSmiles = loadRealSmiles();
  const a1Molecules = new Set(a1.map((r) => r.moleculeId));
  const coveredMolecules = [...a1Molecules].filter((m) => realSmiles.has(m));

  console.log(`A2 status: 0/8 chunks delivered. No SMILES cache or egress available (see file header).`);
  console.log(`Real, previously-verified canonicalSmiles found for ${coveredMolecules.length} of ${a1Molecules.size} A1 molecules, via the frozen D-076/077 pin.`);
  console.log(`Molecules WITHOUT canonicalSmiles: ${a1Molecules.size - coveredMolecules.length} — excluded below, not guessed.\n`);

  let excludedNoSmiles = 0, excludedUnverifiedLabel = 0;
  const classified = [];
  for (const r of a1) {
    if (r.standardType !== 'EC50') continue;
    if (UNVERIFIED_LABEL_ASSAYS.includes(r.assayId)) { excludedUnverifiedLabel += 1; continue; }
    const smiles = realSmiles.get(r.moleculeId);
    if (!smiles) { excludedNoSmiles += 1; continue; }
    const desc = a3.get(r.assayId);
    if (!desc) continue;
    const family = readoutFamilyOf(desc.description);
    const pActivity = 9 - Math.log10(r.standardValue);
    const suspectFlat = SUSPECT_FLAT_VALUE_ASSAYS.includes(r.assayId);
    classified.push({ canonicalSmiles: smiles, standardType: family, assayId: r.assayId, pActivity, suspectFlat });
  }

  console.log(`rows excluded — no canonicalSmiles available: ${excludedNoSmiles}`);
  console.log(`rows excluded — unverified assay label (D-101): ${excludedUnverifiedLabel}`);
  console.log(`rows entering the FINAL measurement: ${classified.length}\n`);

  const byFamily = new Map();
  for (const r of classified) { if (!byFamily.has(r.standardType)) byFamily.set(r.standardType, []); byFamily.get(r.standardType).push(r); }

  const results = {};
  console.log('per-family, FINAL (real canonicalSmiles identity via replicateGrouping.mjs):');
  for (const [family, rows] of byFamily) {
    const nonFlat = rows.filter((r) => !r.suspectFlat);
    const g = replicateGroups(nonFlat, family);
    const status = noiseFloorStatus(g);
    results[family] = { rows: rows.length, molecules: g.molecules, groups: g.groups.length, status: status.status, medianSpread: status.status === 'MEASURED' ? status.medianSpread : null };
    console.log(`  ${family.padEnd(16)} rows=${String(rows.length).padStart(3)}  molecules=${String(g.molecules).padStart(3)}  groups=${String(g.groups.length).padStart(3)}  ${status.status}`);
  }

  const anyMeasured = Object.values(results).some((r) => r.status === 'MEASURED');
  const c1Closed = anyMeasured; // C1 = "noise floor is measurable on real structure identity for at least one readout family"

  const artifact = {
    id: 'D-103-NOISE-FLOOR-FINAL', kind: 'SEALED_MEASUREMENT', identityKey: 'canonicalSmiles (real, via replicateGrouping.mjs — no substitute)',
    prereg: { id: PREREG.id, fingerprint: PREREG_FINGERPRINT },
    a2Status: 'NOT_DELIVERED — 0/8 chunks; no cache, no egress; 7/300 molecules covered incidentally by the pre-existing frozen D-076/077 pin',
    a1MoleculeCount: a1Molecules.size, moleculesWithRealSmiles: coveredMolecules.length, moleculesWithoutSmiles: a1Molecules.size - coveredMolecules.length,
    coveredMoleculeIds: coveredMolecules.sort(),
    rowsExcludedNoSmiles: excludedNoSmiles, rowsExcludedUnverifiedLabel: excludedUnverifiedLabel, rowsInMeasurement: classified.length,
    perFamily: results, minGroupsForNoiseFloor: REPLICATE_RULE.minGroupsForNoiseFloor,
    c1Status: c1Closed ? 'CLOSED' : 'NOT_CLOSED',
    c1Reason: c1Closed ? 'at least one readout family reached MEASURED under real structure identity' : `no readout family reached ${REPLICATE_RULE.minGroupsForNoiseFloor} groups under real structure identity — data volume, not methodology, is the blocker (only ${coveredMolecules.length}/${a1Molecules.size} molecules have a real SMILES)`,
    computedAt: new Date().toISOString(),
  };
  artifact.artifactHash = canonicalHash({ ...artifact, artifactHash: undefined });

  const out = path.join(REPO, 'packages', 'backend', 'src', 'campaign', 'glp1r-d103-noise-floor-final.json');
  writeFileSync(out, JSON.stringify(artifact, null, 2));
  console.log(`\nsealed FINAL artifact -> ${path.relative(REPO, out)}  hash ${artifact.artifactHash.slice(0, 16)}…`);
  console.log(`\nC1 STATUS: ${artifact.c1Status}`);
  console.log(`  reason: ${artifact.c1Reason}`);
}

main();
