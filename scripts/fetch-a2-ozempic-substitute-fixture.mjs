#!/usr/bin/env node
/**
 * A2 — real fetch+pin for the mechanism-derived Ozempic-substitute
 * candidate space. Mirrors fetch-a1-glp1-fixture.mjs's discipline (live
 * resolution, never hardcoded identities; narrow extraction + SHA-256
 * provenance; job-log dump as the real transport since CI artifact blob
 * storage is unreachable from the sandbox that reconstructs it — see
 * docs/DECISIONS.md D-028), generalized from A1's two fixed drugs to
 * however many real candidates the mechanism query returns.
 *
 * PIPELINE (matches A2_PREREGISTRATION exactly, sealed before this ran):
 *   1. Resolve GLP-1R/GIPR/GCGR live; assert against the sealed ids.
 *   2. Pull EVERY qualifying activity at all three targets (full pagination
 *      via ChEMBL's own page_meta.next — confirmed real by recon round 2),
 *      filtered by the sealed assay-inclusion rule. This is the actual
 *      mechanism-derived candidate space: no drug name is ever the query.
 *   3. Batch-resolve max_phase for every distinct candidate molecule
 *      (molecule_chembl_id__in, confirmed real by recon round 2); keep only
 *      max_phase >= the sealed threshold, excluding the reference drug.
 *   4. For each surviving candidate, search ClinicalTrials.gov by NAME
 *      (unavoidable — trials are not indexed by ChEMBL id) across the
 *      sealed population list; fetch full study detail (arms + HbA1c/body
 *      weight outcome measures + resultsSection.adverseEventsModule) for
 *      any hit with posted results.
 *
 * Usage: node scripts/fetch-a2-ozempic-substitute-fixture.mjs
 * Writes narrow, MINIFIED JSON (this dataset is materially larger than
 * A1's — minified to keep the job-log dump compact) + one meta.json under
 * $GENESIS_A2_FIXTURE_DIR (default artifacts/a2-ozempic-substitute), and
 * prints every written file's exact content between
 * `-----BEGIN A2 FILE <name>-----`/`-----END A2 FILE <name>-----` markers.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { narrowTrialDetail } from './lib/a2TrialNarrowing.mjs';

const CHEMBL_BASE = 'https://www.ebi.ac.uk/chembl/api/data';
const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2';

const EXPECTED_TARGETS = {
  glp1r: 'CHEMBL1784',
  gipr: 'CHEMBL4383',
  gcgr: 'CHEMBL1985',
};
const REFERENCE_MOLECULE_ID = 'CHEMBL2108724'; // semaglutide — excluded from its own candidate space
const MIN_MAX_PHASE = 2;
const QUALIFYING_STANDARD_TYPES = new Set(['IC50', 'EC50', 'Ki', 'Kd']);
const TRIAL_POPULATIONS = ['Type 2 Diabetes', 'Obesity'];
const MAX_TRIALS_PER_CANDIDATE = 3;

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`FETCH-ERROR ${url} status=${res.status} body(first 300)=${text.slice(0, 300)}`);
  }
  return { json: JSON.parse(text), rawSha256: sha256(text), rawBytes: Buffer.byteLength(text, 'utf8') };
}

async function resolveTarget(synonym, expectedId, label) {
  const url = `${CHEMBL_BASE}/target.json?target_synonym__icontains=${encodeURIComponent(synonym)}&target_type=SINGLE%20PROTEIN&organism=Homo%20sapiens&limit=20`;
  const { json } = await getJson(url);
  const match = (json.targets ?? []).find((t) => t.target_chembl_id === expectedId);
  if (match === undefined) {
    throw new Error(`RESOLVE-MISMATCH: live resolution for ${label} did not find sealed id ${expectedId} among candidates from ${url}. Live ChEMBL data moved — do not silently proceed.`);
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

/** Full pagination via ChEMBL's own page_meta.next (confirmed real by recon round 2). Returns only fields this analysis reads. */
async function fetchAllQualifyingActivities(targetChemblId, targetKey) {
  const rows = [];
  let url = `${CHEMBL_BASE}/activity.json?target_chembl_id=${targetChemblId}&standard_type__in=IC50,EC50,Ki,Kd&limit=1000`;
  let totalRaw = 0;
  let pages = 0;
  while (url !== null) {
    const { json } = await getJson(url);
    const activities = json.activities ?? [];
    totalRaw += activities.length;
    pages += 1;
    for (const a of activities) {
      if (!qualifies(a)) continue;
      rows.push({ moleculeChemblId: a.molecule_chembl_id, valueNM: Number(a.standard_value), targetKey });
    }
    const next = json.page_meta?.next ?? null;
    url = next === null ? null : `https://www.ebi.ac.uk${next}`;
  }
  console.log(`  ${targetKey} (${targetChemblId}): ${pages} page(s), ${totalRaw} raw activities, ${rows.length} qualifying`);
  return rows;
}

async function batchResolveMaxPhase(moleculeIds) {
  const resolved = new Map();
  const CHUNK = 40;
  for (let i = 0; i < moleculeIds.length; i += CHUNK) {
    const chunk = moleculeIds.slice(i, i + CHUNK);
    const url = `${CHEMBL_BASE}/molecule.json?molecule_chembl_id__in=${chunk.join(',')}&limit=${CHUNK}`;
    const { json } = await getJson(url);
    for (const m of json.molecules ?? []) {
      resolved.set(m.molecule_chembl_id, { prefName: m.pref_name, maxPhase: m.max_phase, moleculeType: m.molecule_type });
    }
  }
  return resolved;
}

async function searchTrialsByDrugName(name) {
  const found = [];
  for (const condition of TRIAL_POPULATIONS) {
    const url = `${CTGOV_BASE}/studies?query.intr=${encodeURIComponent(name)}&query.cond=${encodeURIComponent(condition)}&filter.overallStatus=COMPLETED&aggFilters=results:with&pageSize=5&fields=NCTId,BriefTitle,HasResults`;
    const { json } = await getJson(url);
    for (const study of json.studies ?? []) {
      const nctId = study.protocolSection?.identificationModule?.nctId;
      if (nctId !== undefined && !found.includes(nctId)) found.push(nctId);
      if (found.length >= MAX_TRIALS_PER_CANDIDATE) break;
    }
    if (found.length >= MAX_TRIALS_PER_CANDIDATE) break;
  }
  return found;
}

async function fetchTrialDetail(nctId) {
  const url = `${CTGOV_BASE}/studies/${nctId}`;
  const { json, rawSha256, rawBytes } = await getJson(url);
  const narrow = narrowTrialDetail(json);
  return { narrow, url, rawSha256, rawBytes };
}

function median(sorted) {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function main() {
  const outDir = process.env.GENESIS_A2_FIXTURE_DIR ?? 'artifacts/a2-ozempic-substitute';
  await mkdir(outDir, { recursive: true });

  const meta = { retrievedAt: new Date().toISOString(), files: {} };
  const dumpEntries = [];

  async function writeFixtureFile(fileName, obj) {
    const content = JSON.stringify(obj);
    await writeFile(join(outDir, fileName), content, 'utf8');
    dumpEntries.push([fileName, content]);
    return sha256(content);
  }

  console.log('=== A2 FETCH: resolving mechanism targets ===');
  const glp1r = await resolveTarget('GLP-1', EXPECTED_TARGETS.glp1r, 'GLP-1R');
  const gipr = await resolveTarget('GIP', EXPECTED_TARGETS.gipr, 'GIPR');
  const gcgr = await resolveTarget('Glucagon receptor', EXPECTED_TARGETS.gcgr, 'GCGR');
  console.log(`  GLP-1R=${glp1r.chemblId} GIPR=${gipr.chemblId} GCGR=${gcgr.chemblId}`);
  meta.files['targets.json'] = { narrowSha256: await writeFixtureFile('targets.json', { glp1r, gipr, gcgr }) };

  console.log('=== A2 FETCH: mechanism-derived candidate space (all qualifying activities) ===');
  const allRows = [
    ...(await fetchAllQualifyingActivities(glp1r.chemblId, 'glp1r')),
    ...(await fetchAllQualifyingActivities(gipr.chemblId, 'gipr')),
    ...(await fetchAllQualifyingActivities(gcgr.chemblId, 'gcgr')),
  ];

  const byMolecule = new Map();
  for (const row of allRows) {
    if (row.moleculeChemblId === REFERENCE_MOLECULE_ID) continue;
    if (!byMolecule.has(row.moleculeChemblId)) byMolecule.set(row.moleculeChemblId, { glp1r: [], gipr: [], gcgr: [] });
    byMolecule.get(row.moleculeChemblId)[row.targetKey].push(row.valueNM);
  }
  console.log(`  distinct candidate molecules (excluding reference drug): ${byMolecule.size}`);

  console.log('=== A2 FETCH: batch-resolving max_phase for every distinct candidate molecule ===');
  const moleculeIds = [...byMolecule.keys()];
  const resolvedMolecules = await batchResolveMaxPhase(moleculeIds);
  console.log(`  resolved ${resolvedMolecules.size}/${moleculeIds.length}`);

  const survivingCandidates = [];
  for (const [id, potencies] of byMolecule) {
    const info = resolvedMolecules.get(id);
    if (info === undefined) continue;
    if (!(Number(info.maxPhase) >= MIN_MAX_PHASE)) continue;
    survivingCandidates.push({
      moleculeChemblId: id,
      prefName: info.prefName,
      moleculeType: info.moleculeType,
      maxPhase: Number(info.maxPhase),
      medianPotencyNMByTarget: {
        glp1r: potencies.glp1r.length > 0 ? median([...potencies.glp1r].sort((a, b) => a - b)) : null,
        gipr: potencies.gipr.length > 0 ? median([...potencies.gipr].sort((a, b) => a - b)) : null,
        gcgr: potencies.gcgr.length > 0 ? median([...potencies.gcgr].sort((a, b) => a - b)) : null,
      },
      qualifyingAssayCounts: { glp1r: potencies.glp1r.length, gipr: potencies.gipr.length, gcgr: potencies.gcgr.length },
    });
  }
  console.log(`  candidates surviving max_phase>=${MIN_MAX_PHASE}: ${survivingCandidates.length}`);
  for (const c of survivingCandidates) console.log(`    ${c.moleculeChemblId} "${c.prefName}" maxPhase=${c.maxPhase} type=${c.moleculeType}`);
  meta.files['candidates.json'] = { narrowSha256: await writeFixtureFile('candidates.json', survivingCandidates) };

  console.log('=== A2 FETCH: searching ClinicalTrials.gov per candidate ===');
  const candidatesWithTrials = [];
  for (const candidate of survivingCandidates) {
    const nctIds = await searchTrialsByDrugName(candidate.prefName);
    console.log(`  ${candidate.prefName}: ${nctIds.length} trial(s) found -> ${JSON.stringify(nctIds)}`);
    const trials = [];
    for (const nctId of nctIds) {
      const trial = await fetchTrialDetail(nctId);
      trials.push(trial.narrow);
      meta.files[`trial-${nctId}.json`] = { url: trial.url, rawSha256: trial.rawSha256, rawBytes: trial.rawBytes };
    }
    if (trials.length > 0) {
      candidatesWithTrials.push({ moleculeChemblId: candidate.moleculeChemblId, prefName: candidate.prefName, trialNctIds: nctIds });
      const trialsFileName = `trials-${candidate.moleculeChemblId}.json`;
      meta.files[trialsFileName] = { narrowSha256: await writeFixtureFile(trialsFileName, trials) };
    }
  }
  meta.files['candidates-with-trials.json'] = { narrowSha256: await writeFixtureFile('candidates-with-trials.json', candidatesWithTrials) };

  const metaJson = JSON.stringify(meta);
  await writeFile(join(outDir, 'meta.json'), metaJson, 'utf8');
  dumpEntries.push(['meta.json', metaJson]);

  console.log('=== A2 FETCH DONE ===');
  console.log(`A2-FETCH SUMMARY files=${dumpEntries.length} candidates=${survivingCandidates.length} candidatesWithTrials=${candidatesWithTrials.length} outDir=${outDir}`);

  console.log('=== A2 FIXTURE DUMP (for reconstruction from job log) ===');
  for (const [fileName, content] of dumpEntries) {
    console.log(`-----BEGIN A2 FILE ${fileName}-----`);
    console.log(content);
    console.log(`-----END A2 FILE ${fileName}-----`);
  }
  console.log('=== A2 FIXTURE DUMP END ===');
}

main().catch((err) => {
  console.error('A2 FETCH FAILED:', err);
  process.exit(1);
});
