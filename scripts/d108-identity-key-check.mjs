#!/usr/bin/env node
/**
 * D-108 — runs `identityKeyMonitor.ts`'s collision logic against the REAL
 * combined (chunk-level + per-row) usable structure set, via RDKit's real
 * InChIKey computation (rdkitAdapter.descriptors → rdkit_worker.py, D-074/076).
 *
 * The collision-detection logic itself is ported inline rather than imported,
 * because `identityKeyMonitor.ts` is TypeScript (frontend) and this is a
 * plain Node script (backend tooling) with no bundler step here — same
 * boundary reason as `mounjaroRecipeEntry.node.ts`. The TWO implementations
 * are kept in sync by the shared test fixture in
 * `identityKeyMonitor.test.ts`, which pins the exact same collision the
 * TypeScript module's own tests assert on.
 *
 * Monitor-only: this script writes a report artifact and changes nothing.
 * `replicateGrouping.mjs` still keys on canonicalSmiles, unmodified.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { combinedUsableSmiles, combinedCoverage } from './d108-noise-floor-per-row.mjs';
import { a1MoleculeIds } from './d105-a2-custody.mjs';
import { descriptors } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collisionReport(structures) {
  const byInchiKey = new Map();
  const distinctSmiles = new Set();
  for (const s of structures) {
    distinctSmiles.add(s.canonicalSmiles);
    if (!byInchiKey.has(s.inchiKey)) byInchiKey.set(s.inchiKey, { smiles: new Set(), ids: [] });
    const entry = byInchiKey.get(s.inchiKey);
    entry.smiles.add(s.canonicalSmiles);
    entry.ids.push(s.moleculeId);
  }
  const collisions = [];
  for (const [inchiKey, entry] of byInchiKey) {
    if (entry.smiles.size > 1) {
      collisions.push({ inchiKey, canonicalSmilesVariants: [...entry.smiles].sort(), moleculeIds: entry.ids.sort() });
    }
  }
  collisions.sort((a, b) => a.inchiKey.localeCompare(b.inchiKey));
  return {
    structureCount: structures.length,
    distinctCanonicalSmiles: distinctSmiles.size,
    distinctInchiKeys: byInchiKey.size,
    potentialGroupSplits: distinctSmiles.size - byInchiKey.size,
    collisions,
  };
}

function main() {
  console.log('=== D-108 — identity key collision check on the combined usable set ===\n');
  const smiles = combinedUsableSmiles();
  const a1 = a1MoleculeIds();
  const structures = [];
  const a1Structures = [];
  let unparseable = 0;
  let noInchi = 0;
  for (const [moleculeId, canonicalSmiles] of smiles) {
    const r = descriptors(canonicalSmiles);
    if (!r.ok) { unparseable += 1; continue; }
    if (!r.data?.inchiKey) { noInchi += 1; continue; }
    const entry = { moleculeId, canonicalSmiles, inchiKey: r.data.inchiKey };
    structures.push(entry);
    if (a1.has(moleculeId)) a1Structures.push(entry);
  }

  // Checked on BOTH sets deliberately: the full usable set (every structure
  // this repo currently holds custody-verified — the frozen pin plus A2) is
  // the stronger check, since a collision anywhere in it is a collision this
  // repo's data can produce. The A1-only subset is what the D-108 measurement
  // actually scores, and is reported separately so the counts are not
  // conflated with `combinedCoverage()`'s narrower, A1-scoped figure.
  const reportFull = collisionReport(structures);
  const reportA1 = collisionReport(a1Structures);
  console.log(`structures checked (full usable set): ${structures.length}  (unparseable: ${unparseable}, no InChIKey: ${noInchi})`);
  console.log(`  distinct canonicalSmiles: ${reportFull.distinctCanonicalSmiles}  distinct InChIKeys: ${reportFull.distinctInchiKeys}  collisions: ${reportFull.collisions.length}`);
  console.log(`structures checked (A1-scoped, matches combinedCoverage): ${a1Structures.length} / ${combinedCoverage().combinedCustodyVerifiedStructures}`);
  console.log(`  distinct canonicalSmiles: ${reportA1.distinctCanonicalSmiles}  distinct InChIKeys: ${reportA1.distinctInchiKeys}  collisions: ${reportA1.collisions.length}`);
  for (const c of reportFull.collisions) console.log(`  FULL SET: ${c.inchiKey}: ${JSON.stringify(c.canonicalSmilesVariants)} <- ${c.moleculeIds.join(', ')}`);

  const artifact = {
    id: 'D-108-IDENTITY-KEY-MONITOR',
    kind: 'MONITOR_REPORT',
    currentIdentityKey: 'canonicalSmiles',
    fullUsableSet: reportFull,
    a1ScopedSet: reportA1,
    a1MoleculeCount: a1.size,
    computedAt: new Date().toISOString(),
  };
  artifact.artifactHash = canonicalHash({ ...artifact, artifactHash: undefined });
  const out = path.join(REPO, 'packages', 'backend', 'src', 'campaign', 'glp1r-d108-identity-key-report.json');
  writeFileSync(out, JSON.stringify(artifact, null, 2));
  console.log(`\nreport -> ${path.relative(REPO, out)}  hash ${artifact.artifactHash.slice(0, 16)}…`);
}

main();
