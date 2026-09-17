/**
 * A1 (GLP-1 substitution) — real-data pin. Fetches, from the live ChEMBL and
 * ClinicalTrials.gov APIs, exactly the records `a1Glp1Preregistration.ts`'s
 * sealed inclusion criteria need to compute a verdict, and freezes them with
 * SHA-256 provenance — mirroring `fetch-b1-defra-aurn-fixture.mjs`'s
 * fetch-then-narrow-extract-then-hash pattern for a bulk, multi-record pull
 * (this is not a single-activity anchor like `chembl-activity-189031.json`;
 * it is ~20-60 ChEMBL activities per compound and 4 full clinical-trial
 * result sets).
 *
 * TARGET AND COMPOUND IDs ARE RESOLVED LIVE, NOT HARDCODED, per the
 * handoff's explicit instruction — `scripts/recon-a1-glp1.mjs` confirmed
 * CHEMBL1784 / CHEMBL2108724 / CHEMBL4084119 / CHEMBL1431 only as
 * reconnaissance to pick a viable resolution QUERY; this script re-derives
 * those same IDs itself, at fetch time, from that query, and FAILS LOUDLY
 * if the live resolution disagrees with what recon found (a mismatch would
 * mean ChEMBL's own data moved under us, which is exactly the kind of thing
 * a silent hardcode would hide).
 *
 * The 4 ClinicalTrials.gov studies are a fixed list (NCT ids), because which
 * TRIALS qualify is itself part of the preregistered inclusion criteria
 * (§6 requireArmLevelHbA1cWithSpreadAndN, posted results, T2DM population)
 * and recon already verified all 4 satisfy it — enumerating the search
 * again here would let a later, unrelated new trial silently change which
 * evidence enters the analysis, which the preregistration's fixed hypothesis
 * set is specifically meant to prevent.
 *
 * Usage: node scripts/fetch-a1-glp1-fixture.mjs
 * Writes narrow JSON + one meta.json under $GENESIS_A1_FIXTURE_DIR (default
 * artifacts/a1-glp1) AND prints every written file's exact content into the
 * job log between `-----BEGIN A1 FILE <name>-----` / `-----END A1 FILE
 * <name>-----` markers. This dump is the real transport: `a4f4314` (the
 * Kepler fixture) found the CI artifact-upload blob storage URL is not
 * reachable from the sandbox that later reconstructs these files either, so
 * — unlike fetch-b1-defra-aurn-fixture.mjs's ~300-400KB/site-year CSVs,
 * which truly need the artifact path — this fixture (12 small JSON files,
 * well under 50KB total) is printed verbatim instead. It is still uploaded
 * as a build artifact too (belt-and-suspenders for anyone who CAN reach
 * blob storage), but reconstruction from the job log is the documented path.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CHEMBL_BASE = 'https://www.ebi.ac.uk/chembl/api/data';
const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2';

const EXPECTED_TARGET_CHEMBL_ID = 'CHEMBL1784';
const COMPOUNDS = [
  { key: 'semaglutide', prefName: 'SEMAGLUTIDE', expectedChemblId: 'CHEMBL2108724' },
  { key: 'liraglutide', prefName: 'LIRAGLUTIDE', expectedChemblId: 'CHEMBL4084119' },
  { key: 'metformin', prefName: 'METFORMIN', expectedChemblId: 'CHEMBL1431' },
];

/** Fixed by the preregistered inclusion criteria — see file header. */
const TRIAL_NCT_IDS = ['NCT03191396', 'NCT02863419', 'NCT00696657', 'NCT02128932'];

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function getJsonWithHash(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`FETCH-ERROR ${url} status=${res.status} body(first 300)=${text.slice(0, 300)}`);
  }
  return { json: JSON.parse(text), rawSha256: sha256(text), rawBytes: Buffer.byteLength(text, 'utf8') };
}

async function resolveTarget() {
  const url = `${CHEMBL_BASE}/target.json?target_synonym__icontains=GLP-1&target_type=SINGLE%20PROTEIN&organism=Homo%20sapiens&limit=20`;
  const { json, rawSha256, rawBytes } = await getJsonWithHash(url);
  const targets = json.targets ?? [];
  const match = targets.find((t) => /glucagon-like peptide 1 receptor/i.test(t.pref_name ?? ''));
  if (!match) {
    throw new Error(`RESOLVE-ERROR: no GLP-1 receptor target found among ${targets.length} candidates from ${url}`);
  }
  if (match.target_chembl_id !== EXPECTED_TARGET_CHEMBL_ID) {
    throw new Error(
      `RESOLVE-MISMATCH: live resolution found target ${match.target_chembl_id}, recon found ${EXPECTED_TARGET_CHEMBL_ID}. Live ChEMBL data moved — do not silently proceed.`,
    );
  }
  return {
    narrow: { targetChemblId: match.target_chembl_id, prefName: match.pref_name, organism: match.organism, targetType: match.target_type },
    url,
    rawSha256,
    rawBytes,
  };
}

async function resolveCompound(compound) {
  const url = `${CHEMBL_BASE}/molecule.json?pref_name__iexact=${encodeURIComponent(compound.prefName)}&limit=5`;
  const { json, rawSha256, rawBytes } = await getJsonWithHash(url);
  const molecules = json.molecules ?? [];
  const match = molecules.find((m) => (m.pref_name ?? '').toUpperCase() === compound.prefName);
  if (!match) {
    throw new Error(`RESOLVE-ERROR: no molecule named "${compound.prefName}" found from ${url}`);
  }
  if (match.molecule_chembl_id !== compound.expectedChemblId) {
    throw new Error(
      `RESOLVE-MISMATCH: live resolution found ${compound.key}=${match.molecule_chembl_id}, recon found ${compound.expectedChemblId}. Live ChEMBL data moved — do not silently proceed.`,
    );
  }
  return {
    narrow: {
      moleculeChemblId: match.molecule_chembl_id,
      prefName: match.pref_name,
      moleculeType: match.molecule_type,
      maxPhase: match.max_phase,
    },
    url,
    rawSha256,
    rawBytes,
  };
}

async function fetchActivities(targetChemblId, moleculeChemblId) {
  const url = `${CHEMBL_BASE}/activity.json?molecule_chembl_id=${moleculeChemblId}&target_chembl_id=${targetChemblId}&limit=1000`;
  const { json, rawSha256, rawBytes } = await getJsonWithHash(url);
  const activities = json.activities ?? [];
  const narrow = activities.map((a) => ({
    activityId: a.activity_id,
    assayChemblId: a.assay_chembl_id,
    assayDescription: a.assay_description ?? null,
    standardType: a.standard_type ?? null,
    standardRelation: a.standard_relation ?? null,
    standardValue: a.standard_value ?? null,
    standardUnits: a.standard_units ?? null,
    pchemblValue: a.pchembl_value ?? null,
    targetOrganism: a.target_organism ?? null,
    documentYear: a.document_year ?? null,
    dataValidityComment: a.data_validity_comment ?? null,
    potentialDuplicate: a.potential_duplicate ?? null,
  }));
  return { narrow, url, rawSha256, rawBytes, totalCount: json.page_meta?.total_count ?? activities.length };
}

async function fetchTrial(nctId) {
  const url = `${CTGOV_BASE}/studies/${nctId}`;
  const { json, rawSha256, rawBytes } = await getJsonWithHash(url);
  const identification = json.protocolSection?.identificationModule ?? {};
  const arms = json.protocolSection?.armsInterventionsModule?.armGroups ?? [];
  const outcomes = json.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
  const hba1cOutcomes = outcomes.filter((o) => /hba1c|glycated haemoglobin|glycosylated hemoglobin/i.test(o.title ?? ''));
  const narrow = {
    nctId: identification.nctId,
    briefTitle: identification.briefTitle,
    arms: arms.map((a) => ({ label: a.label, type: a.type, description: a.description ?? null })),
    hba1cOutcomes: hba1cOutcomes.map((o) => ({
      title: o.title,
      type: o.type,
      paramType: o.paramType,
      dispersionType: o.dispersionType,
      unitOfMeasure: o.unitOfMeasure,
      timeFrame: o.timeFrame ?? null,
      groups: (o.groups ?? []).map((g) => ({ id: g.id, title: g.title })),
      denoms: o.denoms ?? [],
      classes: o.classes ?? [],
    })),
  };
  return { narrow, url, rawSha256, rawBytes };
}

async function main() {
  const outDir = process.env.GENESIS_A1_FIXTURE_DIR ?? 'artifacts/a1-glp1';
  await mkdir(outDir, { recursive: true });

  const meta = { retrievedAt: new Date().toISOString(), files: {} };
  // The whole fixture is well under 50KB (12 small JSON files) — unlike the
  // B1 DEFRA CSVs (~300-400KB/site-year, needed the artifact-upload path)
  // this is small enough to print verbatim into the job log and reconstruct
  // from log text, the same fallback `a4f4314` used for the Kepler fixture
  // after finding the artifact blob storage URL is unreachable from the
  // sandbox that later reads these logs back.
  const dumpEntries = [];

  async function writeFixtureFile(fileName, content) {
    await writeFile(join(outDir, fileName), content, 'utf8');
    dumpEntries.push([fileName, content]);
    return sha256(content);
  }

  console.log('=== A1 FETCH: resolving target ===');
  const target = await resolveTarget();
  const targetJson = JSON.stringify(target.narrow, null, 2);
  meta.files['target.json'] = { url: target.url, rawSha256: target.rawSha256, rawBytes: target.rawBytes, narrowSha256: await writeFixtureFile('target.json', targetJson) };
  console.log(`  target resolved: ${target.narrow.targetChemblId} "${target.narrow.prefName}"`);

  console.log('=== A1 FETCH: resolving compounds + activities ===');
  for (const compound of COMPOUNDS) {
    const resolved = await resolveCompound(compound);
    const fileName = `compound-${compound.key}.json`;
    const compoundJson = JSON.stringify(resolved.narrow, null, 2);
    meta.files[fileName] = { url: resolved.url, rawSha256: resolved.rawSha256, rawBytes: resolved.rawBytes, narrowSha256: await writeFixtureFile(fileName, compoundJson) };
    console.log(`  ${compound.key} resolved: ${resolved.narrow.moleculeChemblId}`);

    const activities = await fetchActivities(target.narrow.targetChemblId, resolved.narrow.moleculeChemblId);
    const activitiesFileName = `activities-${compound.key}.json`;
    const activitiesJson = JSON.stringify(activities.narrow, null, 2);
    meta.files[activitiesFileName] = {
      url: activities.url,
      rawSha256: activities.rawSha256,
      rawBytes: activities.rawBytes,
      narrowSha256: await writeFixtureFile(activitiesFileName, activitiesJson),
      totalCount: activities.totalCount,
      extractedCount: activities.narrow.length,
    };
    console.log(`  ${compound.key} activities vs GLP-1R: ${activities.narrow.length} extracted (totalCount=${activities.totalCount})`);
  }

  console.log('=== A1 FETCH: clinical trials ===');
  for (const nctId of TRIAL_NCT_IDS) {
    const trial = await fetchTrial(nctId);
    const fileName = `trial-${nctId}.json`;
    const trialJson = JSON.stringify(trial.narrow, null, 2);
    meta.files[fileName] = { url: trial.url, rawSha256: trial.rawSha256, rawBytes: trial.rawBytes, narrowSha256: await writeFixtureFile(fileName, trialJson), hba1cOutcomeCount: trial.narrow.hba1cOutcomes.length };
    console.log(`  ${nctId}: "${trial.narrow.briefTitle}" — ${trial.narrow.hba1cOutcomes.length} HbA1c outcome measure(s)`);
  }

  const metaJson = JSON.stringify(meta, null, 2);
  await writeFile(join(outDir, 'meta.json'), metaJson, 'utf8');
  dumpEntries.push(['meta.json', metaJson]);

  console.log('=== A1 FETCH DONE ===');
  console.log(`A1-FETCH SUMMARY files=${dumpEntries.length} outDir=${outDir}`);

  console.log('=== A1 FIXTURE DUMP (for reconstruction from job log — see fetch-a1-glp1-fixture.mjs header) ===');
  for (const [fileName, content] of dumpEntries) {
    console.log(`-----BEGIN A1 FILE ${fileName}-----`);
    console.log(content);
    console.log(`-----END A1 FILE ${fileName}-----`);
  }
  console.log('=== A1 FIXTURE DUMP END ===');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('A1 FETCH FAILED:', err);
    process.exit(1);
  });
}
