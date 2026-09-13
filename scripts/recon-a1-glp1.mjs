#!/usr/bin/env node
/**
 * A1 RECON ROUND 2 (temporary, CI-only). Round 1 confirmed: GLP-1R target
 * CHEMBL1784; compound ids (semaglutide CHEMBL2108724, liraglutide
 * CHEMBL4084119, metformin CHEMBL1431, insulin glargine CHEMBL1201497);
 * activity record shape; and the real resultsSection shape via NCT03191396
 * (SUSTAIN 7), which has both a semaglutide and a liraglutide HbA1c arm in
 * one trial. This round: fix the ClinicalTrials.gov search query (round 1's
 * AREA[Conditions] syntax 400'd), enumerate further qualifying trials per
 * drug (need >=2 per drug per the sealed preregistration), and pull the
 * dispersionType/paramType/unitOfMeasure/denoms fields round 1 only listed
 * the keys of, not the values.
 */

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
  console.log('=== A1 RECON ROUND 2 ===\n');

  // --- fixed search: query.cond + query.intr as separate params ---
  console.log('--- ClinicalTrials.gov search, corrected query, per drug ---');
  const perDrugNctIds = {};
  for (const drug of ['semaglutide', 'liraglutide']) {
    const url = `${CTGOV_BASE}/studies?query.intr=${encodeURIComponent(drug)}&query.cond=${encodeURIComponent('Type 2 Diabetes')}&filter.overallStatus=COMPLETED&aggFilters=results:with&pageSize=20&fields=NCTId,BriefTitle,Phase,StudyType,PrimaryCompletionDate,HasResults`;
    const result = await getJson(url);
    console.log(`  ${drug}: totalCount=${result?.totalCount ?? 'n/a'}`);
    const ids = [];
    for (const study of result?.studies ?? []) {
      const id = study.protocolSection?.identificationModule;
      console.log(`    NCT=${id?.nctId} title="${id?.briefTitle}" hasResults=${study.hasResults}`);
      if (id?.nctId) ids.push(id.nctId);
    }
    perDrugNctIds[drug] = ids;
  }
  console.log('');

  // --- search for a semaglutide-vs-insulin-glargine trial (negative control §13) ---
  console.log('--- ClinicalTrials.gov search: semaglutide vs insulin glargine (negative control) ---');
  {
    const url = `${CTGOV_BASE}/studies?query.intr=semaglutide+insulin+glargine&query.cond=${encodeURIComponent('Type 2 Diabetes')}&filter.overallStatus=COMPLETED&aggFilters=results:with&pageSize=10&fields=NCTId,BriefTitle,HasResults`;
    const result = await getJson(url);
    console.log(`  totalCount=${result?.totalCount ?? 'n/a'}`);
    for (const study of result?.studies ?? []) {
      const id = study.protocolSection?.identificationModule;
      console.log(`    NCT=${id?.nctId} title="${id?.briefTitle}" hasResults=${study.hasResults}`);
    }
  }
  console.log('');

  // --- full HbA1c outcome-measure detail for NCT03191396 (values, not just keys) ---
  console.log('--- NCT03191396 (SUSTAIN 7) HbA1c outcome measure, FULL detail ---');
  const study = await getJson(`${CTGOV_BASE}/studies/NCT03191396`);
  const outcomes = study?.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
  const hba1c = outcomes.find((o) => /change in hba1c/i.test(o.title ?? ''));
  if (hba1c) {
    console.log('  type:', hba1c.type);
    console.log('  paramType:', hba1c.paramType);
    console.log('  dispersionType:', hba1c.dispersionType);
    console.log('  unitOfMeasure:', hba1c.unitOfMeasure);
    console.log('  timeFrame:', hba1c.timeFrame);
    console.log('  groups:', JSON.stringify((hba1c.groups ?? []).map((g) => ({ id: g.id, title: g.title }))));
    console.log('  denoms:', JSON.stringify(hba1c.denoms ?? []).slice(0, 800));
    console.log('  classes[0].categories[0].measurements:', JSON.stringify(hba1c.classes?.[0]?.categories?.[0]?.measurements ?? []));
  } else {
    console.log('  NOT FOUND — titles were:', outcomes.map((o) => o.title).join(' | '));
  }
  console.log('');

  // --- for each candidate NCT id found above (capped), check if it too has an HbA1c change-from-baseline outcome ---
  console.log('--- Checking each candidate trial for a usable HbA1c outcome measure ---');
  const allCandidates = [...new Set([...(perDrugNctIds.semaglutide ?? []), ...(perDrugNctIds.liraglutide ?? [])])].filter((id) => id !== 'NCT03191396').slice(0, 12);
  for (const nct of allCandidates) {
    const s = await getJson(`${CTGOV_BASE}/studies/${nct}?fields=protocolSection.identificationModule,protocolSection.armsInterventionsModule,resultsSection.outcomeMeasuresModule`);
    const title = s?.protocolSection?.identificationModule?.briefTitle ?? '(unknown)';
    const oms = s?.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
    const hit = oms.find((o) => /hba1c|glycated haemoglobin|glycosylated hemoglobin/i.test(o.title ?? ''));
    console.log(`  ${nct} "${title}": ${oms.length} outcome measure(s); HbA1c found=${!!hit}${hit ? ` title="${hit.title}"` : ''}`);
  }

  console.log('\n=== A1 RECON ROUND 2 DONE ===');
}

main().catch((err) => {
  console.error('RECON FAILED:', err);
  process.exit(1);
});
