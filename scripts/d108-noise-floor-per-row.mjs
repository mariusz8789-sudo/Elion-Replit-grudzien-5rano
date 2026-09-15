#!/usr/bin/env node
/**
 * D-108 — noise floor on CHUNK-level PLUS ROW-level custody-verified identity.
 *
 * D-105/106/107's measurement (`d105-noise-floor-verified.mjs`) is left
 * completely untouched — it is a sealed artifact and its own record of what
 * was true when it ran. This is a SEPARATE, additive measurement: it takes
 * everything D-105 already trusts (chunks 3, 5, 6 + the frozen D-076/077 pin)
 * and adds the individual rows that `d108-per-row-custody.mjs` verified inside
 * chunks that fail at the chunk level. Nothing here loosens custody — a row
 * only enters if its own received bytes hash to a value the supplier declared
 * for that specific row (RAW_VERIFIED). Rows only verified after applying the
 * declared channel correction remain quarantined and are NOT used, per D-108's
 * own module-level contract.
 *
 * Where a molecule has BOTH a chunk-level source and a per-row source (which
 * happens for molecules that are also in the frozen pin), the PIN wins — same
 * rule as `usableSmiles()`, because the pin is the older, independently
 * custody-verified record.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PREREG, PREREG_FINGERPRINT, SUSPECT_FLAT_VALUE_ASSAYS, UNVERIFIED_LABEL_ASSAYS } from './d102-readout-family-prereg.mjs';
import { readoutFamilyOf } from './d102-readout-classifier.mjs';
import { coverage as chunkCoverage, usableSmiles as chunkUsableSmiles, a1MoleculeIds } from './d105-a2-custody.mjs';
import { rawVerifiedRows, summary as rowSummary } from './d108-per-row-custody.mjs';
import { replicateGroups, noiseFloorStatus, REPLICATE_RULE } from '../packages/backend/src/campaign/replicateGrouping.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A1_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a1');
const A3_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a3');

// Deliberately duplicated (not imported) from d105-noise-floor-verified.mjs:
// that file is a sealed artifact and is left untouched by this work.
function loadA1() {
  const rows = [];
  for (const f of readdirSync(A1_DIR).filter((x) => x.endsWith('.psv')).sort()) {
    for (const line of readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
      if (!line) continue;
      const p = line.split('|');
      rows.push({ activityId: p[0], moleculeId: p[1], assayId: p[2], standardType: p[3], standardValue: Number(p[5]) });
    }
  }
  return rows;
}

function loadA3() {
  const byAssay = new Map();
  for (const f of readdirSync(A3_DIR).filter((x) => x.endsWith('.psv')).sort()) {
    for (const line of readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
      if (!line) continue;
      const p = line.split('|');
      byAssay.set(p[0], { description: p[5] });
    }
  }
  return byAssay;
}

/** Chunk-level usable structures, PLUS raw-verified per-row structures. Pin wins ties. */
export function combinedUsableSmiles() {
  const map = new Map();
  for (const [id, smiles] of rawVerifiedRows()) map.set(id, smiles);
  // chunkUsableSmiles already applies "pin wins over chunk", so layering it on
  // top here preserves that precedence for anything it also covers.
  for (const [id, smiles] of chunkUsableSmiles()) map.set(id, smiles);
  return map;
}

export function combinedCoverage() {
  const chunk = chunkCoverage();
  const rows = rowSummary();
  const combined = combinedUsableSmiles();
  const a1 = a1MoleculeIds();
  const newFromRows = [...combined.keys()].filter((id) => a1.has(id) && !chunkUsableSmiles().has(id));
  return {
    a1Molecules: chunk.a1Molecules,
    chunkLevelStructures: chunk.custodyVerifiedStructures,
    additionalFromPerRowCustody: newFromRows.length,
    combinedCustodyVerifiedStructures: [...combined.keys()].filter((id) => a1.has(id)).length,
    moleculesStillWithoutVerifiedStructure: chunk.a1Molecules - [...combined.keys()].filter((id) => a1.has(id)).length,
    rowLevel: rows,
  };
}

export function measure() {
  const a1 = loadA1();
  const a3 = loadA3();
  const smiles = combinedUsableSmiles();
  const cov = combinedCoverage();

  let excludedNoVerifiedSmiles = 0;
  let excludedUnverifiedLabel = 0;
  const classified = [];
  for (const r of a1) {
    if (r.standardType !== 'EC50') continue;
    if (UNVERIFIED_LABEL_ASSAYS.includes(r.assayId)) { excludedUnverifiedLabel += 1; continue; }
    const s = smiles.get(r.moleculeId);
    if (!s) { excludedNoVerifiedSmiles += 1; continue; }
    const desc = a3.get(r.assayId);
    if (!desc) continue;
    classified.push({
      canonicalSmiles: s,
      standardType: readoutFamilyOf(desc.description),
      assayId: r.assayId,
      pActivity: 9 - Math.log10(r.standardValue),
      suspectFlat: SUSPECT_FLAT_VALUE_ASSAYS.includes(r.assayId),
    });
  }

  const byFamily = new Map();
  for (const r of classified) {
    if (!byFamily.has(r.standardType)) byFamily.set(r.standardType, []);
    byFamily.get(r.standardType).push(r);
  }

  const perFamily = {};
  for (const [family, rows] of byFamily) {
    const g = replicateGroups(rows.filter((r) => !r.suspectFlat), family);
    const status = noiseFloorStatus(g);
    perFamily[family] = {
      rows: rows.length,
      molecules: g.molecules,
      groups: g.groups.length,
      status: status.status,
      medianSpread: status.status === 'MEASURED' ? status.medianSpread : null,
      medianSd: status.status === 'MEASURED' ? status.medianSd : null,
    };
  }

  const measured = Object.entries(perFamily).filter(([, v]) => v.status === 'MEASURED');
  return {
    coverage: cov,
    excludedNoVerifiedSmiles,
    excludedUnverifiedLabel,
    rowsInMeasurement: classified.length,
    perFamily,
    measuredFamilies: measured.map(([k]) => k),
    c1Closed: measured.length > 0,
  };
}

function main() {
  console.log('=== D-108 — NOISE FLOOR on chunk-level + per-row custody-verified identity ===\n');
  console.log(`prereg: ${PREREG.id}  fingerprint ${PREREG_FINGERPRINT}  (unchanged)\n`);

  const m = measure();
  const c = m.coverage;
  console.log(`chunk-level custody-verified structures: ${c.chunkLevelStructures}`);
  console.log(`additional structures from per-row custody (chunks that fail at chunk level): ${c.additionalFromPerRowCustody}`);
  console.log(`  row-level summary: ${JSON.stringify(c.rowLevel)}`);
  console.log(`combined custody-verified structures: ${c.combinedCustodyVerifiedStructures}/${c.a1Molecules}\n`);

  console.log(`rows excluded — no custody-verified canonicalSmiles: ${m.excludedNoVerifiedSmiles}`);
  console.log(`rows excluded — unverified assay label (D-101): ${m.excludedUnverifiedLabel}`);
  console.log(`rows entering the measurement: ${m.rowsInMeasurement}\n`);

  console.log(`per-family (identity = real canonicalSmiles via replicateGrouping.mjs):`);
  for (const [family, v] of Object.entries(m.perFamily)) {
    console.log(`  ${family.padEnd(16)} rows=${String(v.rows).padStart(3)}  molecules=${String(v.molecules).padStart(3)}  groups=${String(v.groups).padStart(3)}  ${v.status}${v.medianSpread !== null ? `  medianSpread=${v.medianSpread.toFixed(4)}  medianSd=${v.medianSd.toFixed(4)}` : ''}`);
  }

  const artifact = {
    id: 'D-108-NOISE-FLOOR-PER-ROW',
    kind: 'SEALED_MEASUREMENT',
    supersedes: 'D-105/106/107 (adds per-row-verified structures on top; chunk-level methodology unchanged)',
    identityKey: 'canonicalSmiles (real, via replicateGrouping.mjs — no substitute)',
    prereg: { id: PREREG.id, fingerprint: PREREG_FINGERPRINT },
    coverage: m.coverage,
    rowsExcludedNoVerifiedSmiles: m.excludedNoVerifiedSmiles,
    rowsExcludedUnverifiedLabel: m.excludedUnverifiedLabel,
    rowsInMeasurement: m.rowsInMeasurement,
    perFamily: m.perFamily,
    minGroupsForNoiseFloor: REPLICATE_RULE.minGroupsForNoiseFloor,
    c1Status: m.c1Closed ? 'CLOSED' : 'NOT_CLOSED',
    c1Reason: m.c1Closed
      ? `readout families reaching ${REPLICATE_RULE.minGroupsForNoiseFloor}+ replicate groups under real structure identity: ${m.measuredFamilies.join(', ')}`
      : `no readout family reached ${REPLICATE_RULE.minGroupsForNoiseFloor} groups under real structure identity`,
    computedAt: new Date().toISOString(),
  };
  artifact.artifactHash = canonicalHash({ ...artifact, artifactHash: undefined });

  const out = path.join(REPO, 'packages', 'backend', 'src', 'campaign', 'glp1r-d108-noise-floor-per-row.json');
  writeFileSync(out, JSON.stringify(artifact, null, 2));
  console.log(`\nsealed artifact -> ${path.relative(REPO, out)}  hash ${artifact.artifactHash.slice(0, 16)}…`);
  console.log(`\nC1 STATUS: ${artifact.c1Status}`);
  console.log(`  reason: ${artifact.c1Reason}`);
}

if (process.argv[1] && process.argv[1].endsWith('d108-noise-floor-per-row.mjs')) main();
