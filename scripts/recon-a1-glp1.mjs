#!/usr/bin/env node
/**
 * A1 RECON (temporary, CI-only) — confirms the REAL shape of the ChEMBL and
 * ClinicalTrials.gov API v2 responses before writing the deterministic
 * fetch-and-pin script. Prints compact summaries only (field lists + a few
 * sample values, never a full response body) so this fits in one job log
 * without hitting GitHub's job-log read-back truncation ceiling — the same
 * constraint that shaped fetch-b1-defra-aurn-fixture.mjs.
 *
 * Runs ONLY in CI: the sandbox's own egress proxy blocks both hosts (verified
 * via curl and WebFetch before writing this — both EGRESS_BLOCKED).
 *
 * One-off: remove once its findings have informed
 * scripts/fetch-a1-glp1-fixture.mjs, mirroring the B1 DEFRA recon's own
 * lifecycle (see docs/DECISIONS.md).
 */

const CHEMBL_BASE = 'https://www.ebi.ac.uk/chembl/api/data';
const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2';

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) {
    console.log(`  HTTP ${res.status} for ${url}`);
    console.log(`  body (first 500 chars): ${text.slice(0, 500)}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.log(`  JSON parse failed for ${url}: ${err.message}`);
    console.log(`  body (first 500 chars): ${text.slice(0, 500)}`);
    return null;
  }
}

function summarizeKeys(obj, depth = 2, prefix = '') {
  if (obj === null || typeof obj !== 'object' || depth === 0) return;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const kind = Array.isArray(value) ? `array[${value.length}]` : typeof value;
    console.log(`    ${prefix}${key}: ${kind}`);
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      summarizeKeys(value[0], depth - 1, `${prefix}  ${key}[0].`);
    } else if (typeof value === 'object' && value !== null) {
      summarizeKeys(value, depth - 1, `${prefix}  ${key}.`);
    }
  }
}

async function main() {
  console.log('=== A1 RECON ===\n');

  // --- 1. Resolve GLP-1R target id (NOT hardcoded — resolved by query) ---
  console.log('--- ChEMBL target search: GLP-1 receptor, human ---');
  const targetUrl = `${CHEMBL_BASE}/target.json?target_synonym__icontains=GLP-1&organism=Homo+sapiens&limit=10`;
  const targets = await getJson(targetUrl);
  if (targets?.targets) {
    for (const t of targets.targets) {
      console.log(`  target_chembl_id=${t.target_chembl_id} pref_name="${t.pref_name}" type=${t.target_type} organism=${t.organism}`);
    }
  }
  console.log('');

  // --- 2. Resolve compound ids by name ---
  console.log('--- ChEMBL molecule search, per compound ---');
  const compounds = ['SEMAGLUTIDE', 'LIRAGLUTIDE', 'METFORMIN', 'INSULIN GLARGINE'];
  const resolvedIds = {};
  for (const name of compounds) {
    const url = `${CHEMBL_BASE}/molecule.json?pref_name__iexact=${encodeURIComponent(name)}&limit=5`;
    const result = await getJson(url);
    const mols = result?.molecules ?? [];
    console.log(`  ${name}: ${mols.length} match(es)`);
    for (const m of mols) {
      console.log(`    molecule_chembl_id=${m.molecule_chembl_id} pref_name="${m.pref_name}" max_phase=${m.max_phase} molecule_type=${m.molecule_type}`);
    }
    if (mols[0]) resolvedIds[name] = mols[0].molecule_chembl_id;
  }
  console.log('  resolved:', JSON.stringify(resolvedIds));
  console.log('');

  // --- 3. Activity search shape, for one resolved compound against the GLP-1R target (if resolved) ---
  const glp1rTarget = targets?.targets?.find((t) => /glucagon-like peptide 1 receptor/i.test(t.pref_name ?? '') && t.organism === 'Homo sapiens');
  console.log(`--- ChEMBL activity search shape (target=${glp1rTarget?.target_chembl_id ?? 'UNRESOLVED'}, compound=${resolvedIds.SEMAGLUTIDE ?? 'UNRESOLVED'}) ---`);
  if (glp1rTarget && resolvedIds.SEMAGLUTIDE) {
    const actUrl = `${CHEMBL_BASE}/activity.json?target_chembl_id=${glp1rTarget.target_chembl_id}&molecule_chembl_id=${resolvedIds.SEMAGLUTIDE}&limit=5`;
    const activities = await getJson(actUrl);
    console.log(`  page_meta: ${JSON.stringify(activities?.page_meta ?? {})}`);
    if (activities?.activities?.[0]) {
      console.log('  first activity record keys:');
      summarizeKeys(activities.activities[0], 1, '');
      console.log('  first activity sample:', JSON.stringify(activities.activities[0]).slice(0, 800));
    } else {
      console.log('  NO ACTIVITIES for this exact target+compound pair — will need to search without molecule filter and inspect manually.');
      const broadUrl = `${CHEMBL_BASE}/activity.json?target_chembl_id=${glp1rTarget.target_chembl_id}&limit=3&standard_type__in=IC50,EC50,Ki,Kd`;
      const broad = await getJson(broadUrl);
      console.log(`  broad search (no molecule filter) count: ${broad?.page_meta?.total_count ?? 'n/a'}`);
      if (broad?.activities?.[0]) console.log('  sample:', JSON.stringify(broad.activities[0]).slice(0, 600));
    }
  } else {
    console.log('  SKIPPED: target or compound id not resolved above.');
  }
  console.log('');

  // --- 4. ClinicalTrials.gov: search for T2DM trials with posted results ---
  console.log('--- ClinicalTrials.gov API v2: search, per drug ---');
  for (const drug of ['semaglutide', 'liraglutide']) {
    const url = `${CTGOV_BASE}/studies?query.term=${encodeURIComponent(drug)}+AND+AREA%5BConditions%5DType+2+Diabetes&filter.overallStatus=COMPLETED&aggFilters=results:with&pageSize=10&fields=NCTId,BriefTitle,Phase,StudyType,PrimaryCompletionDate,HasResults`;
    const result = await getJson(url);
    console.log(`  ${drug}: totalCount=${result?.totalCount ?? 'n/a'}`);
    for (const study of result?.studies ?? []) {
      const id = study.protocolSection?.identificationModule;
      console.log(`    NCT=${id?.nctId} title="${id?.briefTitle}" hasResults=${study.hasResults}`);
    }
  }
  console.log('');

  // --- 5. Full study shape for one known head-to-head trial (found via WebSearch: NCT03191396, SUSTAIN 7) ---
  console.log('--- ClinicalTrials.gov: full study shape for NCT03191396 (SUSTAIN 7, semaglutide vs liraglutide) ---');
  const studyUrl = `${CTGOV_BASE}/studies/NCT03191396`;
  const study = await getJson(studyUrl);
  if (study) {
    console.log('  top-level keys:', Object.keys(study).join(', '));
    console.log('  protocolSection keys:', Object.keys(study.protocolSection ?? {}).join(', '));
    console.log('  hasResults:', study.hasResults);
    const outcomes = study.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
    console.log(`  outcomeMeasures count: ${outcomes.length}`);
    const hba1c = outcomes.find((o) => /hba1c|glycated haemoglobin|glycosylated hemoglobin/i.test(o.title ?? ''));
    if (hba1c) {
      console.log('  HbA1c outcome measure found. title:', hba1c.title);
      console.log('  outcome measure keys:', Object.keys(hba1c).join(', '));
      console.log('  groups:', JSON.stringify(hba1c.groups ?? []).slice(0, 500));
      console.log('  classes[0] keys:', Object.keys((hba1c.classes ?? [])[0] ?? {}).join(', '));
      const cat0 = hba1c.classes?.[0]?.categories?.[0];
      console.log('  classes[0].categories[0] keys:', Object.keys(cat0 ?? {}).join(', '));
      console.log('  classes[0].categories[0].measurements sample:', JSON.stringify(cat0?.measurements ?? []).slice(0, 600));
    } else {
      console.log('  NO HbA1c-titled outcome found. All outcome titles:');
      for (const o of outcomes) console.log('   -', o.title);
    }
  }

  console.log('\n=== A1 RECON DONE ===');
}

main().catch((err) => {
  console.error('RECON FAILED:', err);
  process.exit(1);
});
