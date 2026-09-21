#!/usr/bin/env node
/**
 * GENUINE-AUTONOMOUS-DISCOVERY-E2E-01 — THE RUNNABLE DEMONSTRATOR.
 *
 *   node scripts/genuine-discovery-e2e-01.mjs
 *
 * Per the user's own choice at Krok 0 (this sandbox's network policy
 * blocks OpenAlex/Crossref/ChEMBL/ClinicalTrials.gov — confirmed by a
 * direct test, not assumed): this demonstrator substitutes the mandate's
 * "fresh external snapshot" with the already-pinned, already-verified QE4
 * and Kepler datasets Phase E already uses.
 *
 * TWO REAL SCENARIOS, ONE ACTUAL COMPARISON:
 *
 *  1. Kepler (a declared public anchor exists) — the pipeline reaches
 *     REPRODUCTION, exactly as Phase E's own TE5 already established.
 *
 *  2. QE4 (no declared public anchor) — Phase E's OWN novelty gate
 *     (noveltyGate.ts, Krok 1) labels this DISCOVERY from internal checks
 *     alone. Phase F's genuine-discovery pipeline, which REQUIRES external
 *     literature verification (L5/L6) before DISCOVERY is ever reachable,
 *     downgrades the exact same campaign to UNKNOWN once external search
 *     is confirmed unreachable — the single clearest, most concrete proof
 *     this file exists to produce: Genesis prefers NO_DISCOVERY (here,
 *     UNKNOWN) over a false discovery, even when an earlier, less strict
 *     layer of the same system would have said otherwise.
 *
 * Exit code 0 = every mandated property held.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH_MODULE = path.join(REPO, 'packages/frontend/src/core/agent/campaignOrchestrator.ts');
const ADAPTER_MODULE = path.join(REPO, 'packages/frontend/src/core/biotechData/domainAdapterRegistry.ts');
const ANCHOR_MODULE = path.join(REPO, 'packages/frontend/src/core/biotechData/externalAnchor.ts');
const GENUINE_MODULE = path.join(REPO, 'packages/frontend/src/core/agent/genuineDiscoveryOrchestrator.ts');

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

const work = mkdtempSync(path.join(tmpdir(), 'genesis-genuine-e2e01-'));
const entrySource = `
import { runAutonomousOrchestrator } from '${ORCH_MODULE}';
import { makeKeplerDomainAdapter, makeQe4DomainAdapter } from '${ADAPTER_MODULE}';
import { KEPLER_MARS_ANCHOR_ID } from '${ANCHOR_MODULE}';
import { runGenuineDiscoveryPipeline } from '${GENUINE_MODULE}';

const RIVAL = { id: 'rival', terms: [{ basis: 'CONSTANT' }], lineage: null };
const CLEAN = { representativeSampling: true, leakageChecked: true, knownUncontrolledConfounders: [], measurementInstrumentValidated: true, numericalPrecisionChecked: true, preprocessingDocumented: true, temporalOrderingRespected: true };
const BASE = { rivalSpec: RIVAL, structuralDeclaration: CLEAN, numberOfHypothesesTested: 1, multipleTestingCorrectionApplied: false };

export async function runE201() {
  const keplerTrace = runAutonomousOrchestrator({
    seedAdapter: makeKeplerDomainAdapter(), options: { maxRounds: 7, maxTerms: 2 }, maxCampaigns: 1,
    declaredPublicAnchorResolver: () => ({ anchorId: KEPLER_MARS_ANCHOR_ID, summary: "Kepler's third law -- established public knowledge." }),
  });
  const keplerCampaign = keplerTrace.campaigns[0];
  const keplerRecord = await runGenuineDiscoveryPipeline({
    campaign: keplerCampaign, literatureClients: [], matchThreshold: 0.5,
    discoveryDataset: { datasetId: 'kepler-disc', points: [] }, replicationDataset: null, ...BASE,
  });

  const qe4Trace = runAutonomousOrchestrator({ seedAdapter: makeQe4DomainAdapter(), options: { maxRounds: 6, maxTerms: 2 }, maxCampaigns: 1 });
  const qe4Campaign = qe4Trace.campaigns[0];
  const qe4Record = await runGenuineDiscoveryPipeline({
    campaign: qe4Campaign, literatureClients: [], matchThreshold: 0.5,
    discoveryDataset: { datasetId: 'qe4-disc', points: qe4Campaign.result.rounds.flatMap((r) => r.admittedX).map((x) => ({ x, y: 0, sigma: 1 })) },
    replicationDataset: null, ...BASE,
  });

  return {
    kepler: {
      phaseE_resultLabel: keplerCampaign.resultLabel,
      phaseF_status: keplerRecord.status,
      phaseF_noveltyOverall: keplerRecord.noveltyEvidence.overall,
      campaignFingerprint: keplerCampaign.result.campaignFingerprint,
      outcomeFingerprint: keplerRecord.outcomeFingerprint,
    },
    qe4: {
      phaseE_resultLabel: qe4Campaign.resultLabel,
      phaseE_noveltyLevel: qe4Campaign.noveltyAssessment.level,
      phaseF_status: qe4Record.status,
      phaseF_noveltyOverall: qe4Record.noveltyEvidence.overall,
      phaseF_limitations: qe4Record.noveltyEvidence.limitations,
      campaignFingerprint: qe4Campaign.result.campaignFingerprint,
      outcomeFingerprint: qe4Record.outcomeFingerprint,
    },
  };
}
`;
const entryNode = path.join(work, 'entry.node.mjs');
writeFileSync(entryNode, entrySource);
const bundle = path.join(work, 'e201.node.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  entryNode, '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${bundle}`,
  '--loader:.html=text', '--loader:.csv=text',
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });

console.log('GENESIS -- GENUINE-AUTONOMOUS-DISCOVERY-E2E-01');
console.log(`node ${process.version}`);
console.log('');

const mod = await import(bundle);
const result = await mod.runE201();
console.log(JSON.stringify(result, null, 2));
console.log('');

record('Kepler: Phase E already labels this REPRODUCTION', result.kepler.phaseE_resultLabel === 'REPRODUCTION', result.kepler.phaseE_resultLabel);
record('Kepler: Phase F agrees -- REPRODUCTION, overall=KNOWN', result.kepler.phaseF_status === 'REPRODUCTION' && result.kepler.phaseF_noveltyOverall === 'KNOWN', `${result.kepler.phaseF_status} / ${result.kepler.phaseF_noveltyOverall}`);
record('Kepler: campaign fingerprint matches the already-verified value from repro-demo (f4804820)', result.kepler.campaignFingerprint === 'f4804820', result.kepler.campaignFingerprint);

record('QE4: Phase E ALONE (noveltyGate.ts, internal checks only) labels this DISCOVERY', result.qe4.phaseE_resultLabel === 'DISCOVERY', result.qe4.phaseE_resultLabel);
record('QE4: Phase E\'s novelty level is NOVEL_WITHIN_CHECKED_CORPUS (bounded, but Phase E still allows DISCOVERY on it)', result.qe4.phaseE_noveltyLevel === 'NOVEL_WITHIN_CHECKED_CORPUS', result.qe4.phaseE_noveltyLevel);
record(
  'THE CORE FINDING: Phase F downgrades the SAME campaign to UNKNOWN once external verification (L5/L6) is confirmed unreachable -- never lets an unverified internal-only DISCOVERY through',
  result.qe4.phaseF_status === 'UNKNOWN' && result.qe4.phaseF_status !== 'DISCOVERY',
  `Phase E said ${result.qe4.phaseE_resultLabel}; Phase F says ${result.qe4.phaseF_status} (overall=${result.qe4.phaseF_noveltyOverall})`,
);
record('QE4: the downgrade carries a real, non-empty limitation, never a silent verdict change', result.qe4.phaseF_limitations.length > 0, result.qe4.phaseF_limitations.join(' | '));

record('Every outcome carries a real, non-empty fingerprint', result.kepler.outcomeFingerprint.length > 0 && result.qe4.outcomeFingerprint.length > 0, `${result.kepler.outcomeFingerprint} / ${result.qe4.outcomeFingerprint}`);

const failed = checks.filter((c) => !c.ok);
console.log('');
console.log(`RESULT: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:', failed.map((c) => c.name).join('; '));
  process.exit(1);
}
process.exit(0);
