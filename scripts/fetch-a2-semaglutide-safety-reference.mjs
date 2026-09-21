#!/usr/bin/env node
/**
 * A2 — a small, targeted follow-up fetch, not a new candidate search.
 *
 * The main A2 pin (docs/DECISIONS.md D-029) found that NONE of the 12
 * real candidate trials it captured contain a semaglutide arm, so no
 * candidate's adverse-event categories could be numerically compared to
 * semaglutide from that dataset alone — a real, disclosed gap, not
 * something discovered by looking for a convenient result. This was
 * already planned infrastructure: `scripts/recon-a2-ozempic-substitute.mjs`
 * confirmed NCT03987919 (SURPASS-2, a real tirzepatide-vs-semaglutide
 * head-to-head, also used for A1's adverseEventsModule shape recon) has
 * real semaglutide-arm safety data from the START of A2, before any
 * candidate result was seen — this script just pulls it in full.
 *
 * No preregistered criterion or threshold changes: this only supplies the
 * reference data the ALREADY-SEALED safety comparison rule needs to run.
 *
 * Usage: node scripts/fetch-a2-semaglutide-safety-reference.mjs
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CTGOV_BASE = 'https://clinicaltrials.gov/api/v2';
const REFERENCE_NCT_ID = 'NCT03987919';

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  if (!res.ok) throw new Error(`FETCH-ERROR ${url} status=${res.status} body(first 300)=${text.slice(0, 300)}`);
  return { json: JSON.parse(text), rawSha256: sha256(text), rawBytes: Buffer.byteLength(text, 'utf8') };
}

function narrowOutcome(o) {
  return {
    title: o.title,
    type: o.type,
    paramType: o.paramType ?? null,
    dispersionType: o.dispersionType ?? null,
    unitOfMeasure: o.unitOfMeasure ?? null,
    groups: (o.groups ?? []).map((g) => ({ id: g.id, title: g.title })),
    denoms: o.denoms ?? [],
    classes: (o.classes ?? []).slice(0, 1),
  };
}

function narrowEvent(e) {
  return {
    term: e.term,
    organSystem: e.organSystem ?? null,
    stats: (e.stats ?? []).map((s) => ({ groupId: s.groupId, numEvents: s.numEvents ?? null, numAffected: s.numAffected ?? null, numAtRisk: s.numAtRisk ?? null })),
  };
}

async function main() {
  const outDir = process.env.GENESIS_A2_FIXTURE_DIR ?? 'artifacts/a2-ozempic-substitute';
  await mkdir(outDir, { recursive: true });

  const url = `${CTGOV_BASE}/studies/${REFERENCE_NCT_ID}`;
  const { json, rawSha256, rawBytes } = await getJson(url);
  const identification = json.protocolSection?.identificationModule ?? {};
  const arms = json.protocolSection?.armsInterventionsModule?.armGroups ?? [];
  const outcomes = json.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
  const hba1cOutcomes = outcomes.filter((o) => /hba1c|glycated haemoglobin|glycosylated hemoglobin/i.test(o.title ?? ''));
  const weightOutcomes = outcomes.filter((o) => /body weight|weight loss|change in weight/i.test(o.title ?? ''));
  const aem = json.resultsSection?.adverseEventsModule;
  const narrow = {
    nctId: identification.nctId,
    briefTitle: identification.briefTitle,
    arms: arms.map((a) => ({ label: a.label, type: a.type })),
    hba1cOutcomes: hba1cOutcomes.map(narrowOutcome),
    weightOutcomes: weightOutcomes.map(narrowOutcome),
    adverseEvents: aem === undefined ? null : {
      frequencyThreshold: aem.frequencyThreshold ?? null,
      eventGroups: (aem.eventGroups ?? []).map((g) => ({ id: g.id, title: g.title, deathsNumAffected: g.deathsNumAffected ?? null, seriousNumAffected: g.seriousNumAffected ?? null, seriousNumAtRisk: g.seriousNumAtRisk ?? null, otherNumAffected: g.otherNumAffected ?? null, otherNumAtRisk: g.otherNumAtRisk ?? null })),
      seriousEvents: (aem.seriousEvents ?? []).map(narrowEvent),
      otherEvents: (aem.otherEvents ?? []).map(narrowEvent),
    },
  };

  const content = JSON.stringify(narrow);
  const fileName = `reference-semaglutide-${REFERENCE_NCT_ID}.json`;
  await writeFile(join(outDir, fileName), content, 'utf8');
  const narrowSha256 = sha256(content);

  console.log(`title: "${narrow.briefTitle}"`);
  console.log(`arms: ${JSON.stringify(narrow.arms)}`);
  console.log(`semaglutide event groups: ${JSON.stringify((narrow.adverseEvents?.eventGroups ?? []).filter((g) => /semaglutide/i.test(g.title)))}`);
  console.log(`A2-REFERENCE-FETCH SUMMARY url=${url} rawSha256=${rawSha256} rawBytes=${rawBytes} narrowSha256=${narrowSha256}`);
  console.log(`-----BEGIN A2 FILE ${fileName}-----`);
  console.log(content);
  console.log(`-----END A2 FILE ${fileName}-----`);
}

main().catch((err) => {
  console.error('A2 REFERENCE FETCH FAILED:', err);
  process.exit(1);
});
