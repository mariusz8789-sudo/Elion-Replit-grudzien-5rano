#!/usr/bin/env node
/**
 * D-105 — noise floor on CUSTODY-VERIFIED structure identity only.
 *
 * Supersedes D-103's coverage (7 molecules) because A2 arrived 8/8 and two of
 * its eight chunks verify byte-exactly. Supersedes nothing else: the prereg,
 * the replicate rule, the readout classifier, the split and the Winner Gate
 * are used exactly as sealed. Only the SMILES source got bigger.
 *
 * Structure identity comes from `usableSmiles()`: the byte-verified A2 chunks
 * plus the frozen D-076/077 pin. The six failed chunks are NOT used, and the
 * reason is measured rather than assumed — see D-105's pin cross-check, where
 * a delivered structure in a failed chunk differs from the frozen pin by a
 * deleted 28-character run AND still parses as a valid molecule. Corruption in
 * that channel is silent, so a failed chunk is unusable in full; there is no
 * spot-check that could rescue it.
 *
 * No SMILES is invented, repaired, or substituted. molecule_chembl_id is not
 * used as identity anywhere in this file.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PREREG, PREREG_FINGERPRINT, SUSPECT_FLAT_VALUE_ASSAYS, UNVERIFIED_LABEL_ASSAYS } from './d102-readout-family-prereg.mjs';
import { readoutFamilyOf } from './d102-readout-classifier.mjs';
import { coverage, usableSmiles } from './d105-a2-custody.mjs';
import { replicateGroups, noiseFloorStatus, REPLICATE_RULE } from '../packages/backend/src/campaign/replicateGrouping.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const A1_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a1');
const A3_DIR = path.join(REPO, 'data', 'transcription', 'glp1r-a3');

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

export function measure() {
  const a1 = loadA1();
  const a3 = loadA3();
  const smiles = usableSmiles();
  const cov = coverage();

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
  console.log('=== D-105 — NOISE FLOOR on custody-verified structure identity ===\n');
  console.log(`prereg: ${PREREG.id}  fingerprint ${PREREG_FINGERPRINT}  (unchanged)\n`);

  const m = measure();
  const c = m.coverage;
  console.log(`A2 delivered 8/8 chunks (${c.rowsDelivered} rows of a declared ${c.declaredTotalRows}).`);
  console.log(`  chunks byte-verified : ${c.chunksVerified.join(', ')}`);
  console.log(`  chunks failing custody: ${c.chunksFailed.join(', ')} — not used`);
  console.log(`custody-verified structures for A1 molecules: ${c.custodyVerifiedStructures}/${c.a1Molecules}`);
  console.log(`  from verified A2 chunks: ${c.structuresFromVerifiedChunks}`);
  console.log(`  from the frozen D-076/077 pin: ${c.structuresFromFrozenPin} (${c.countedInBothSources} counted in both)`);
  console.log(`molecules still without a verified structure: ${c.moleculesStillWithoutVerifiedStructure}\n`);

  console.log(`rows excluded — no custody-verified canonicalSmiles: ${m.excludedNoVerifiedSmiles}`);
  console.log(`rows excluded — unverified assay label (D-101): ${m.excludedUnverifiedLabel}`);
  console.log(`rows entering the measurement: ${m.rowsInMeasurement}\n`);

  console.log(`per-family (identity = real canonicalSmiles via replicateGrouping.mjs):`);
  for (const [family, v] of Object.entries(m.perFamily)) {
    console.log(`  ${family.padEnd(16)} rows=${String(v.rows).padStart(3)}  molecules=${String(v.molecules).padStart(3)}  groups=${String(v.groups).padStart(3)}  ${v.status}${v.medianSpread !== null ? `  medianSpread=${v.medianSpread.toFixed(4)}` : ''}`);
  }

  const artifact = {
    id: 'D-105-NOISE-FLOOR-VERIFIED',
    kind: 'SEALED_MEASUREMENT',
    supersedes: 'D-103-NOISE-FLOOR-FINAL (coverage only; methodology unchanged)',
    identityKey: 'canonicalSmiles (real, via replicateGrouping.mjs — no substitute)',
    prereg: { id: PREREG.id, fingerprint: PREREG_FINGERPRINT },
    a2Status: `8/8 chunks delivered; ${m.coverage.chunksVerified.length}/8 byte-verified (chunks ${m.coverage.chunksVerified.join(', ')}); chunks ${m.coverage.chunksFailed.join(', ')} failed custody and are excluded in full`,
    coverage: m.coverage,
    rowsExcludedNoVerifiedSmiles: m.excludedNoVerifiedSmiles,
    rowsExcludedUnverifiedLabel: m.excludedUnverifiedLabel,
    rowsInMeasurement: m.rowsInMeasurement,
    perFamily: m.perFamily,
    minGroupsForNoiseFloor: REPLICATE_RULE.minGroupsForNoiseFloor,
    c1Status: m.c1Closed ? 'CLOSED' : 'NOT_CLOSED',
    c1Reason: m.c1Closed
      ? `readout families reaching ${REPLICATE_RULE.minGroupsForNoiseFloor}+ replicate groups under real structure identity: ${m.measuredFamilies.join(', ')}`
      : `no readout family reached ${REPLICATE_RULE.minGroupsForNoiseFloor} groups under real structure identity — data volume, not methodology (${m.coverage.custodyVerifiedStructures}/${m.coverage.a1Molecules} molecules carry a custody-verified structure)`,
    computedAt: new Date().toISOString(),
  };
  artifact.artifactHash = canonicalHash({ ...artifact, artifactHash: undefined });

  const out = path.join(REPO, 'packages', 'backend', 'src', 'campaign', 'glp1r-d105-noise-floor-verified.json');
  writeFileSync(out, JSON.stringify(artifact, null, 2));
  console.log(`\nsealed artifact -> ${path.relative(REPO, out)}  hash ${artifact.artifactHash.slice(0, 16)}…`);
  console.log(`\nC1 STATUS: ${artifact.c1Status}`);
  console.log(`  reason: ${artifact.c1Reason}`);
}

if (process.argv[1] && process.argv[1].endsWith('d105-noise-floor-verified.mjs')) main();
