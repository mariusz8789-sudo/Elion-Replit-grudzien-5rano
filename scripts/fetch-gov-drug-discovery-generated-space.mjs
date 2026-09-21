#!/usr/bin/env node
/**
 * GOV-DRUG-DISCOVERY-E2E-01 — pin the FULL GENERATED candidate space.
 *
 * A2's fetch (docs/DECISIONS.md D-029) computed this exact set as an
 * intermediate step and then threw it away: it kept only the 20 molecules
 * that survived `max_phase >= 2`. That discarded stage IS the generated
 * candidate space, and it is the thing E2E-01's T1 assertion is about —
 * that Genesis CONSTRUCTS candidates from mechanism rather than choosing
 * from a list somebody handed it.
 *
 * So this script re-runs A2's identical mechanism query (same three
 * targets, same sealed assay-inclusion rule, same full pagination) and
 * pins EVERY distinct qualifying molecule, with per-candidate provenance,
 * BEFORE any clinical-development gate is applied. No new criterion, no
 * drug name anywhere in the generation path, no new target.
 *
 * It deliberately does NOT hard-fail on a small result. If the real
 * generated space came back below E2E01_GENERATION_METHOD's thresholds,
 * that is a real finding the T1 test must report as a FAILURE — not
 * something this script should hide by refusing to write the file.
 *
 * Usage: node scripts/fetch-gov-drug-discovery-generated-space.mjs
 * Writes minified JSON + meta.json under $GENESIS_E2E01_FIXTURE_DIR
 * (default artifacts/gov-drug-discovery-e2e) and prints every written file
 * between `-----BEGIN E2E01 FILE <name>-----`/`-----END E2E01 FILE <name>-----`
 * markers, which is the real transport out of CI (D-028: artifact blob
 * storage is unreachable from the sandbox that reconstructs these).
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHEMBL_BASE = 'https://www.ebi.ac.uk/chembl/api/data';

// Identical to A2's sealed generation inputs — restated here only because a
// fetch script cannot import the TypeScript preregistration, and asserted
// against it by govDrugDiscoveryE2E.test.ts.
const EXPECTED_TARGETS = { glp1r: 'CHEMBL1784', gipr: 'CHEMBL4383', gcgr: 'CHEMBL1985' };
const REFERENCE_MOLECULE_ID = 'CHEMBL2108724';
const QUALIFYING_STANDARD_TYPES = new Set(['IC50', 'EC50', 'Ki', 'Kd']);

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`FETCH-ERROR ${url} status=${res.status} body(first 300)=${text.slice(0, 300)}`);
  return { json: JSON.parse(text), rawSha256: sha256(text), rawBytes: Buffer.byteLength(text, 'utf8') };
}

async function resolveTarget(synonym, expectedId, label) {
  const url = `${CHEMBL_BASE}/target.json?target_synonym__icontains=${encodeURIComponent(synonym)}&target_type=SINGLE%20PROTEIN&organism=Homo%20sapiens&limit=20`;
  const { json } = await getJson(url);
  const match = (json.targets ?? []).find((t) => t.target_chembl_id === expectedId);
  if (match === undefined) {
    throw new Error(`RESOLVE-MISMATCH: live resolution for ${label} did not find sealed id ${expectedId}. Live ChEMBL data moved — do not silently proceed.`);
  }
  return { chemblId: match.target_chembl_id, prefName: match.pref_name };
}

function qualifies(activity) {
  if (activity.standard_type === null || !QUALIFYING_STANDARD_TYPES.has(activity.standard_type)) return false;
  if (activity.standard_units !== 'nM') return false;
  if (activity.target_organism !== 'Homo sapiens') return false;
  if (activity.data_validity_comment !== null && activity.data_validity_comment !== undefined) return false;
  if (activity.potential_duplicate !== null && activity.potential_duplicate !== undefined && activity.potential_duplicate !== 0) return false;
  if (activity.standard_relation !== '=') return false;
  const v = Number(activity.standard_value);
  return Number.isFinite(v) && v > 0;
}

async function fetchAllQualifyingActivities(targetChemblId, targetKey) {
  const rows = [];
  let url = `${CHEMBL_BASE}/activity.json?target_chembl_id=${targetChemblId}&standard_type__in=IC50,EC50,Ki,Kd&limit=1000`;
  let totalRaw = 0;
  let pages = 0;
  const pageHashes = [];
  while (url !== null) {
    const { json, rawSha256 } = await getJson(url);
    const activities = json.activities ?? [];
    totalRaw += activities.length;
    pages += 1;
    pageHashes.push(rawSha256);
    for (const a of activities) {
      if (!qualifies(a)) continue;
      rows.push({ moleculeChemblId: a.molecule_chembl_id, valueNM: Number(a.standard_value), targetKey, assayChemblId: a.assay_chembl_id ?? null });
    }
    const next = json.page_meta?.next ?? null;
    url = next === null ? null : `https://www.ebi.ac.uk${next}`;
  }
  console.log(`  ${targetKey} (${targetChemblId}): ${pages} page(s), ${totalRaw} raw activities, ${rows.length} qualifying`);
  return { rows, pages, totalRaw, pageHashes };
}

async function batchResolveMolecules(moleculeIds) {
  const resolved = new Map();
  const CHUNK = 40;
  for (let i = 0; i < moleculeIds.length; i += CHUNK) {
    const chunk = moleculeIds.slice(i, i + CHUNK);
    const url = `${CHEMBL_BASE}/molecule.json?molecule_chembl_id__in=${chunk.join(',')}&limit=${CHUNK}`;
    const { json } = await getJson(url);
    for (const m of json.molecules ?? []) {
      resolved.set(m.molecule_chembl_id, {
        prefName: m.pref_name ?? null,
        maxPhase: m.max_phase === null || m.max_phase === undefined ? null : Number(m.max_phase),
        moleculeType: m.molecule_type ?? null,
      });
    }
  }
  return resolved;
}

function median(sorted) {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function main() {
  const outDir = process.env.GENESIS_E2E01_FIXTURE_DIR ?? 'artifacts/gov-drug-discovery-e2e';
  await mkdir(outDir, { recursive: true });
  const retrievalTime = new Date().toISOString();

  console.log('=== E2E-01 GENERATION: resolving mechanism targets live ===');
  const glp1r = await resolveTarget('GLP-1', EXPECTED_TARGETS.glp1r, 'GLP-1R');
  const gipr = await resolveTarget('GIP', EXPECTED_TARGETS.gipr, 'GIPR');
  const gcgr = await resolveTarget('Glucagon receptor', EXPECTED_TARGETS.gcgr, 'GCGR');
  console.log(`  GLP-1R=${glp1r.chemblId} GIPR=${gipr.chemblId} GCGR=${gcgr.chemblId}`);

  console.log('=== E2E-01 GENERATION: every qualifying activity at all three targets (NO drug name is ever the query) ===');
  const perTarget = {
    glp1r: await fetchAllQualifyingActivities(glp1r.chemblId, 'glp1r'),
    gipr: await fetchAllQualifyingActivities(gipr.chemblId, 'gipr'),
    gcgr: await fetchAllQualifyingActivities(gcgr.chemblId, 'gcgr'),
  };
  const allRows = [...perTarget.glp1r.rows, ...perTarget.gipr.rows, ...perTarget.gcgr.rows];

  const byMolecule = new Map();
  for (const row of allRows) {
    if (row.moleculeChemblId === REFERENCE_MOLECULE_ID) continue;
    if (row.moleculeChemblId === null || row.moleculeChemblId === undefined) continue;
    if (!byMolecule.has(row.moleculeChemblId)) byMolecule.set(row.moleculeChemblId, { glp1r: [], gipr: [], gcgr: [], assays: new Set() });
    const entry = byMolecule.get(row.moleculeChemblId);
    entry[row.targetKey].push(row.valueNM);
    if (row.assayChemblId !== null) entry.assays.add(row.assayChemblId);
  }
  console.log(`  GENERATED distinct molecules (reference drug excluded): ${byMolecule.size}`);

  console.log('=== E2E-01 GENERATION: batch-resolving identity + max_phase for EVERY generated molecule ===');
  const moleculeIds = [...byMolecule.keys()];
  const resolved = await batchResolveMolecules(moleculeIds);
  console.log(`  resolved ${resolved.size}/${moleculeIds.length}`);

  const generated = [];
  for (const [id, potencies] of byMolecule) {
    const info = resolved.get(id) ?? { prefName: null, maxPhase: null, moleculeType: null };
    generated.push({
      moleculeChemblId: id,
      prefName: info.prefName,
      moleculeType: info.moleculeType,
      maxPhase: info.maxPhase,
      medianPotencyNMByTarget: {
        glp1r: potencies.glp1r.length > 0 ? median([...potencies.glp1r].sort((a, b) => a - b)) : null,
        gipr: potencies.gipr.length > 0 ? median([...potencies.gipr].sort((a, b) => a - b)) : null,
        gcgr: potencies.gcgr.length > 0 ? median([...potencies.gcgr].sort((a, b) => a - b)) : null,
      },
      qualifyingAssayCounts: { glp1r: potencies.glp1r.length, gipr: potencies.gipr.length, gcgr: potencies.gcgr.length },
      distinctAssayCount: potencies.assays.size,
      generatedBy: 'GENERATOR',
      provenance: {
        source: 'ChEMBL Web Services /activity + /molecule',
        identifier: id,
        retrievalTime,
      },
    });
  }
  generated.sort((a, b) => (a.moleculeChemblId < b.moleculeChemblId ? -1 : 1));

  const withPhase2Plus = generated.filter((c) => c.maxPhase !== null && c.maxPhase >= 2).length;
  console.log(`  generated=${generated.length}  of which max_phase>=2 (A2's tier-1 gate): ${withPhase2Plus}`);
  console.log(`  T1 thresholds are asserted by the TEST, not by this script: minimumGeneratedSetSize=60, minimumOutsidePinnedSetSize=20`);

  const generatedContent = JSON.stringify(generated);
  const generatedSha = sha256(generatedContent);
  await writeFile(join(outDir, 'generated-candidate-space.json'), generatedContent, 'utf8');

  const meta = {
    scenarioId: 'GOV-DRUG-DISCOVERY-E2E-01',
    retrievedAt: retrievalTime,
    source: 'ChEMBL Web Services',
    generationQuery: {
      targets: { glp1r: glp1r.chemblId, gipr: gipr.chemblId, gcgr: gcgr.chemblId },
      endpoint: '/activity.json?target_chembl_id=<id>&standard_type__in=IC50,EC50,Ki,Kd (full pagination via page_meta.next)',
      assayInclusion: 'organism=Homo sapiens, standard_units=nM, standard_relation="=", no data_validity_comment, no potential_duplicate',
      excludedMoleculeIds: [REFERENCE_MOLECULE_ID],
      noDrugNameQuery: true,
    },
    perTargetPages: {
      glp1r: { pages: perTarget.glp1r.pages, rawActivities: perTarget.glp1r.totalRaw, qualifying: perTarget.glp1r.rows.length, pageSha256: perTarget.glp1r.pageHashes },
      gipr: { pages: perTarget.gipr.pages, rawActivities: perTarget.gipr.totalRaw, qualifying: perTarget.gipr.rows.length, pageSha256: perTarget.gipr.pageHashes },
      gcgr: { pages: perTarget.gcgr.pages, rawActivities: perTarget.gcgr.totalRaw, qualifying: perTarget.gcgr.rows.length, pageSha256: perTarget.gcgr.pageHashes },
    },
    counts: { generated: generated.length, maxPhase2Plus: withPhase2Plus },
    files: { 'generated-candidate-space.json': { narrowSha256: generatedSha } },
  };
  const metaContent = JSON.stringify(meta);
  await writeFile(join(outDir, 'meta.json'), metaContent, 'utf8');

  console.log(`E2E01-GENERATION SUMMARY generated=${generated.length} narrowSha256=${generatedSha}`);
  console.log('-----BEGIN E2E01 FILE generated-candidate-space.json-----');
  console.log(generatedContent);
  console.log('-----END E2E01 FILE generated-candidate-space.json-----');
  console.log('-----BEGIN E2E01 FILE meta.json-----');
  console.log(metaContent);
  console.log('-----END E2E01 FILE meta.json-----');
}

main().catch((err) => {
  console.error('E2E01 GENERATION FETCH FAILED:', err);
  process.exit(1);
});
