/**
 * ONE-COMMAND full discovery campaign v2 (Phase 3 + benchmark Phase 5), no manual intervention:
 *   Evidence → Target Intelligence → Candidate Generator v2 → RDKit → ADMET → Docking →
 *   Truth Engine → MCRE → Necropolis → Workflow Mutation → Discovery Dossier
 *
 *   node scripts/run-discovery-campaign-v2.mjs [--min 100] [--dock 5] [--bundle <dir>] [--structure <pdb|cif>] [--out <dir>]
 *
 * Evidence defaults to the SHA-256-verified fixture bundle (labelled TEST_FIXTURE). Docking runs on
 * a real/verified structure if supplied; otherwise a synthetic VALID complex (TEST_FIXTURE) is built
 * so the REAL Vina pipeline executes end-to-end. Real data is used the moment it is supplied.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as docking from '../packages/backend/src/compute/dockingAdapter.mjs';
import { ingestBundle } from '../packages/backend/src/corpus/corpusIngest.mjs';
import { buildClaimRegistry } from '../packages/backend/src/cognitive/evidenceIntelligence.mjs';
import { runDiscoveryCampaignV2 } from '../packages/backend/src/cognitive/discoveryCampaignV2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MIN = Number(opt('--min', '100'));
const MAX = opt('--max', null);
const DOCK_N = Number(opt('--dock', '5'));
const FIXTURE = path.resolve(__dirname, '../packages/backend/test-fixtures/genesis-scientific-evidence-bundle-v1');
const BUNDLE = path.resolve(opt('--bundle', FIXTURE));
const OUT = path.resolve(opt('--out', path.resolve(__dirname, '../campaigns/discovery-campaign-v2')));
const isFixtureBundle = BUNDLE === FIXTURE;

const t0 = Date.now();
console.log('=== FULL DISCOVERY CAMPAIGN v2 (real RDKit + ADMET-AI + AutoDock Vina) ===');

// Structure for docking: supplied real/verified structure, else a synthetic VALID complex (real Vina).
const structArg = opt('--structure', null);
let structure = null; let structureFormat = 'pdb'; let structureOrigin;
if (structArg) {
  structure = readFileSync(structArg, 'utf8');
  structureFormat = structArg.endsWith('.cif') || structArg.endsWith('.mmcif') ? 'mmcif' : 'pdb';
  structureOrigin = `SUPPLIED (${path.basename(structArg)})`;
} else {
  const c = docking.buildReferenceComplex({ sequence: 'ACDEFGHIKLMNPQR', ligandSmiles: 'c1ccc2ccccc2c1', seed: 42 });
  if (c.ok) { structure = c.structure; structureOrigin = 'TEST_FIXTURE synthetic complex (pipeline validation; real Vina)'; }
  else { structureOrigin = `docking unavailable: ${c.error}`; }
}
console.log('Docking structure:', structureOrigin);

// Evidence-backed target from the bundle's bioactivity record (so the target gate has support).
const ing = ingestBundle(BUNDLE, { campaignId: 'discovery-campaign-v2' });
const bioRec = ing.evidenceRecords.find((e) => e.entityType === 'BioactivityRecord');
if (!bioRec) { console.error('FAIL CLOSED: bundle has no bioactivity evidence.'); process.exit(2); }
const claims = [{ text: isFixtureBundle ? 'fixture target shows fixture-assay activity' : 'target has reported small-molecule bioactivity in the acquired evidence', supportingEvidenceIds: [bioRec.evidenceId], claimType: 'BIOACTIVITY' }];
const { registry } = buildClaimRegistry(claims, ing.evidenceRecords);
const target = { targetName: isFixtureBundle ? '[TEST FIXTURE] synthetic target' : 'target (from acquired evidence)', claimIds: [registry[0].claimId], structureAvailable: Boolean(structure), mechanismRationale: 'evidence-backed bioactivity claim', cheapestFalsification: 'assay', knownChemicalMatter: true };

const result = runDiscoveryCampaignV2({
  campaignId: 'discovery-campaign-v2', bundleRoot: BUNDLE,
  structure, structureFormat, targetHypotheses: [target], supplementalClaims: claims,
  minCandidates: MIN, ...(MAX ? { maxCandidates: Number(MAX) } : {}), dockTopN: DOCK_N,
});

console.log('Status:', result.status);
console.log('Stages:'); for (const s of result.stages) console.log(`  ${s.stage.padEnd(20)} ${s.status}${s.detail ? ' — ' + s.detail : ''}`);
if (result.status !== 'COMPLETED') { console.error('Campaign did not complete (fail closed).'); process.exit(2); }

const durMs = Date.now() - t0;
const b = result.benchmark;
mkdirSync(OUT, { recursive: true });
const dossier = { ...result.dossier, benchmarkExecutionMs: durMs };
writeFileSync(path.join(OUT, 'discovery-dossier.json'), JSON.stringify(dossier, null, 2));
// Compact, commit-friendly benchmark: full detail for the docked candidates only.
const compact = {
  schema: dossier.schema, campaign: dossier.campaign, primaryTarget: dossier.primaryTarget, targetGate: dossier.targetGate,
  evidence: dossier.evidence, stages: dossier.stages, engineMatrix: dossier.engineMatrix, truthEngineGate: dossier.truthEngineGate,
  necropolisDelta: dossier.necropolisDelta, workflowMutation: dossier.workflowMutation, benchmark: dossier.benchmark,
  dockedCandidates: dossier.candidates.filter((c) => c.docking.status === 'DOCKED'),
  scientificLimitations: dossier.scientificLimitations, didGenesisDiscoverADrug: dossier.didGenesisDiscoverADrug,
  didGenesisDiscoverADrugExplanation: dossier.didGenesisDiscoverADrugExplanation, dossierHash: dossier.dossierHash, benchmarkExecutionMs: durMs,
};
writeFileSync(path.join(OUT, 'benchmark.json'), JSON.stringify(compact, null, 2));

console.log('\n── BENCHMARK ─────────────────────────────────────────────');
console.log('  candidates generated :', b.candidatesGenerated);
console.log('  candidates rejected  :', b.candidatesRejected);
console.log('  candidates surviving :', b.candidatesSurviving);
console.log('  docked (real Vina)   :', b.dockedCount);
console.log('  real engines executed:', b.realEnginesExecuted.join(', '));
console.log('  blocked engines      :', b.blockedEngines.length ? b.blockedEngines.join(', ') : 'none');
console.log('  execution time       :', (durMs / 1000).toFixed(1) + 's');
console.log('  Truth Engine gate    :', result.truthGate.decision);
console.log('  MCRE conflicts       :', result.conflicts.length);
console.log('  workflow mutation    :', result.workflowMutation.mutated ? 'MUTATED — ' + result.workflowMutation.reason : 'unchanged');
console.log('  ranking top 3        :');
for (const r of b.rankingTop10.slice(0, 3)) console.log(`     #${r.rank} ${r.candidateId} ${r.smiles} score ${r.finalScore}`);
const docked = result.dossier.candidates.filter((c) => c.docking.status === 'DOCKED').slice(0, 3);
if (docked.length) { console.log('  docked survivors     :'); for (const c of docked) console.log(`     ${c.candidateId} ${c.structure} → ${c.docking.bestAffinityKcalMol} kcal/mol (MODEL_ESTIMATE, ${c.docking.nPoses} poses)`); }
console.log('  dossier hash         :', result.dossier.dossierHash.slice(0, 16) + '…');
console.log('  DID GENESIS FIND A DRUG?', result.dossier.didGenesisDiscoverADrug);
console.log('  dossier written      :', path.join(OUT, 'discovery-dossier.json'));
