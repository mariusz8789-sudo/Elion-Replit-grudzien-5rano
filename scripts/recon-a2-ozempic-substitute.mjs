#!/usr/bin/env node
/**
 * A2 RECON (temporary, CI-only). The sandbox cannot reach ChEMBL or
 * ClinicalTrials.gov directly (confirmed for A1 — same 403 pattern). This
 * confirms, before any preregistration threshold or fetch script is
 * written:
 *   1. Real ChEMBL target ids for GIP receptor and glucagon receptor (the
 *      other two incretin-axis targets a dual/triple agonist acts on,
 *      alongside GLP-1R CHEMBL1784 already confirmed for A1).
 *   2. That querying ChEMBL activities at GLP-1R for ALL molecules (not
 *      molecule_chembl_id-filtered to one compound) returns a real,
 *      mechanism-derived candidate list, not requiring any hand-picked name.
 *   3. Real ChEMBL ids for named dual/triple incretin agonists, resolved by
 *      name (never assumed), to confirm they appear in that same
 *      mechanism-derived list.
 *   4. The real field shape of ClinicalTrials.gov v2
 *      resultsSection.adverseEventsModule via a known real head-to-head
 *      trial (SURPASS-2, NCT03987919: tirzepatide vs semaglutide).
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
    console.log(`  JSON parse failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== A2 RECON ===\n');

  console.log('--- Resolve GIP receptor + glucagon receptor ChEMBL target ids ---');
  for (const [label, synonym] of [['GIP receptor', 'GIP'], ['Glucagon receptor', 'Glucagon receptor']]) {
    const url = `${CHEMBL_BASE}/target.json?target_synonym__icontains=${encodeURIComponent(synonym)}&target_type=SINGLE%20PROTEIN&organism=Homo%20sapiens&limit=20`;
    const result = await getJson(url);
    console.log(`  ${label}: totalCount=${result?.page_meta?.total_count ?? result?.targets?.length ?? 'n/a'}`);
    for (const t of (result?.targets ?? []).slice(0, 8)) {
      console.log(`    ${t.target_chembl_id} "${t.pref_name}" organism=${t.organism}`);
    }
  }
  console.log('');

  console.log('--- Resolve named dual/triple incretin agonists by exact name ---');
  const candidateNames = ['TIRZEPATIDE', 'RETATRUTIDE', 'COTADUTIDE', 'SURVODUTIDE', 'MAZDUTIDE', 'ORFORGLIPRON', 'EXENATIDE', 'DULAGLUTIDE', 'ALBIGLUTIDE', 'LIXISENATIDE'];
  const resolved = {};
  for (const name of candidateNames) {
    const url = `${CHEMBL_BASE}/molecule.json?pref_name__iexact=${encodeURIComponent(name)}&limit=3`;
    const result = await getJson(url);
    const molecules = result?.molecules ?? [];
    if (molecules.length > 0) {
      resolved[name] = molecules[0].molecule_chembl_id;
      console.log(`  ${name}: ${molecules[0].molecule_chembl_id} type=${molecules[0].molecule_type} maxPhase=${molecules[0].max_phase}`);
    } else {
      console.log(`  ${name}: NOT FOUND under this exact pref_name`);
    }
  }
  console.log('');

  console.log('--- Mechanism-derived candidate space: ALL molecules with activity at GLP-1R (CHEMBL1784) ---');
  {
    const url = `${CHEMBL_BASE}/activity.json?target_chembl_id=CHEMBL1784&standard_type__in=IC50,EC50,Ki,Kd&limit=1000`;
    const result = await getJson(url);
    const activities = result?.activities ?? [];
    console.log(`  totalCount=${result?.page_meta?.total_count ?? 'n/a'}, fetched=${activities.length}`);
    const distinctMolecules = new Set(activities.map((a) => a.molecule_chembl_id));
    console.log(`  distinct molecule_chembl_id count: ${distinctMolecules.size}`);
    const knownIds = new Set(Object.values(resolved));
    const foundKnown = [...distinctMolecules].filter((id) => knownIds.has(id));
    console.log(`  known dual/triple agonists present in this list: ${foundKnown.length} of ${knownIds.size} resolved -> ${JSON.stringify(foundKnown)}`);
    console.log(`  sample of 15 distinct molecule ids: ${JSON.stringify([...distinctMolecules].slice(0, 15))}`);
  }
  console.log('');

  console.log('--- ClinicalTrials.gov v2 resultsSection.adverseEventsModule shape (SURPASS-2, NCT03987919) ---');
  {
    const url = `${CTGOV_BASE}/studies/NCT03987919?fields=protocolSection.identificationModule,resultsSection.adverseEventsModule`;
    const result = await getJson(url);
    const id = result?.protocolSection?.identificationModule;
    console.log(`  title: "${id?.briefTitle}"`);
    const aem = result?.resultsSection?.adverseEventsModule;
    if (aem === undefined) {
      console.log('  NO adverseEventsModule in this response');
    } else {
      console.log(`  top-level keys: ${JSON.stringify(Object.keys(aem))}`);
      console.log(`  frequencyThreshold: ${aem.frequencyThreshold}`);
      console.log(`  eventGroups: ${JSON.stringify((aem.eventGroups ?? []).map((g) => ({ id: g.id, title: g.title, deathsNumAffected: g.deathsNumAffected, seriousNumAffected: g.seriousNumAffected, seriousNumAtRisk: g.seriousNumAtRisk, otherNumAffected: g.otherNumAffected, otherNumAtRisk: g.otherNumAtRisk })))}`);
      const seriousEvents = aem.seriousEvents ?? [];
      console.log(`  seriousEvents count: ${seriousEvents.length}`);
      if (seriousEvents[0]) console.log(`  sample seriousEvent: ${JSON.stringify(seriousEvents[0])}`);
      const otherEvents = aem.otherEvents ?? [];
      console.log(`  otherEvents count: ${otherEvents.length}`);
      if (otherEvents[0]) console.log(`  sample otherEvent: ${JSON.stringify(otherEvents[0])}`);
    }
  }

  console.log('--- ROUND 2: offset pagination proof on GLP-1R activities ---');
  {
    const url = `${CHEMBL_BASE}/activity.json?target_chembl_id=CHEMBL1784&standard_type__in=IC50,EC50,Ki,Kd&limit=200&offset=1000`;
    const result = await getJson(url);
    const activities = result?.activities ?? [];
    console.log(`  fetched=${activities.length} at offset=1000`);
    console.log(`  page_meta: ${JSON.stringify(result?.page_meta ?? null)}`);
    console.log(`  first activity_id at this offset: ${activities[0]?.activity_id ?? 'n/a'}`);
  }
  console.log('');

  console.log('--- ROUND 2: molecule_chembl_id__in batch resolution ---');
  {
    const ids = Object.values(resolved);
    const url = `${CHEMBL_BASE}/molecule.json?molecule_chembl_id__in=${ids.join(',')}&limit=50`;
    const result = await getJson(url);
    const molecules = result?.molecules ?? [];
    console.log(`  requested ${ids.length} ids, got back ${molecules.length} molecules`);
    for (const m of molecules) {
      console.log(`    ${m.molecule_chembl_id} "${m.pref_name}" type=${m.molecule_type} maxPhase=${m.max_phase}`);
    }
  }

  console.log('\n=== A2 RECON DONE ===');
}

main().catch((err) => {
  console.error('RECON FAILED:', err);
  process.exit(1);
});
