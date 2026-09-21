#!/usr/bin/env node
/**
 * A3 — Government Research population stratification: a small, targeted
 * follow-up fetch over trials ALREADY pinned for A2, not a new candidate or
 * trial search.
 *
 * The A2 pin (docs/DECISIONS.md D-029) narrowed ClinicalTrials.gov trial
 * detail records to {nctId, briefTitle, arms, hba1cOutcomes, weightOutcomes,
 * adverseEvents} — it never retained the trial's own, real, structured
 * `protocolSection.conditionsModule.conditions` field, even though the
 * fetch script queried CT.gov separately for "Type 2 Diabetes" and
 * "Obesity" (scripts/fetch-a2-ozempic-substitute-fixture.mjs
 * TRIAL_POPULATIONS). Which query FOUND a trial was never recorded either,
 * and is not a substitute for the trial's own declared conditions anyway
 * (a trial can appear under a condition search without being LIMITED to
 * that condition).
 *
 * A3's government mandate requires population to be a real, structured
 * input, matched against real per-trial data — never guessed from
 * `briefTitle` substrings (that would be an INFERENCE, not a FACT). This
 * script re-fetches only the `conditions` field for the fixed set of 31
 * NCT ids already used by the sealed A2 dataset (12 candidate trial sets +
 * the semaglutide safety reference), so population matching is a real,
 * retrievable FACT rather than a text-pattern guess. No preregistered A2
 * criterion or threshold changes; no new candidate discovered.
 *
 * Usage: node scripts/fetch-a3-trial-conditions.mjs
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2';

// The exact, fixed NCT id set already pinned for A2 (D-029) — extracted
// from candidates-with-trials.json + the semaglutide safety reference.
// Not re-derived here on purpose: re-querying CT.gov by drug name again
// could silently pick up a DIFFERENT trial set than what A2 already
// analyzed, which would make A3's population tags apply to the wrong data.
const A2_NCT_IDS = [
  'NCT00518882', 'NCT00631488', 'NCT00806234', 'NCT00855439', 'NCT00871572',
  'NCT00902161', 'NCT01136798', 'NCT01241448', 'NCT01373450', 'NCT01607450',
  'NCT01856595', 'NCT02004886', 'NCT02091362', 'NCT02175121', 'NCT02533453',
  'NCT02548585', 'NCT02554877', 'NCT02759107', 'NCT03172494', 'NCT03244800',
  'NCT03322631', 'NCT03596177', 'NCT03985293', 'NCT03987919', 'NCT04093752',
  'NCT04426474', 'NCT04552470', 'NCT04616027', 'NCT05048719', 'NCT05659537',
  'NCT05872620',
];

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`FETCH-ERROR ${url} status=${res.status} body(first 300)=${text.slice(0, 300)}`);
  return { json: JSON.parse(text), rawSha256: sha256(text), rawBytes: Buffer.byteLength(text, 'utf8') };
}

async function main() {
  const outDir = process.env.GENESIS_A3_FIXTURE_DIR ?? 'artifacts/a3-government';
  await mkdir(outDir, { recursive: true });

  console.log(`=== A3 FETCH: real conditionsModule.conditions for ${A2_NCT_IDS.length} already-pinned A2 NCT ids ===`);
  const byNctId = {};
  const provenance = {};
  for (const nctId of A2_NCT_IDS) {
    const url = `${CTGOV_BASE}/studies/${nctId}?fields=NCTId,Condition`;
    const { json, rawSha256, rawBytes } = await getJson(url);
    const identification = json.protocolSection?.identificationModule ?? {};
    const conditions = json.protocolSection?.conditionsModule?.conditions ?? [];
    if (identification.nctId !== nctId) throw new Error(`nctId mismatch for ${nctId}: got ${identification.nctId}`);
    byNctId[nctId] = conditions;
    provenance[nctId] = { url, rawSha256, rawBytes };
    console.log(`  ${nctId}: ${JSON.stringify(conditions)}`);
  }

  const content = JSON.stringify(byNctId);
  const fileName = 'trial-conditions.json';
  await writeFile(join(outDir, fileName), content, 'utf8');
  const narrowSha256 = sha256(content);

  const metaContent = JSON.stringify({ retrievedAt: new Date().toISOString(), source: 'ClinicalTrials.gov API v2, studies/{nctId}?fields=NCTId,Condition', files: { [fileName]: { narrowSha256, perNctIdProvenance: provenance } } });

  console.log(`A3-CONDITIONS-FETCH SUMMARY count=${A2_NCT_IDS.length} narrowSha256=${narrowSha256}`);
  console.log(`-----BEGIN A3 FILE ${fileName}-----`);
  console.log(content);
  console.log(`-----END A3 FILE ${fileName}-----`);
  console.log('-----BEGIN A3 FILE meta.json-----');
  console.log(metaContent);
  console.log('-----END A3 FILE meta.json-----');
}

main().catch((err) => {
  console.error('A3 CONDITIONS FETCH FAILED:', err);
  process.exit(1);
});
