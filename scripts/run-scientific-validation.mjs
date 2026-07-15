/**
 * Scientific Validation Suite — ONE command (Phases 1–5). Runs every measurable benchmark, validates
 * a real campaign's outputs (Phase 4: run a small real campaign twice, validate its dossier + prove
 * bit-identical reproducibility), scores readiness (Phase 5), and generates the publication package
 * (Phase 3: figures, tables, methodology, report, supplementary, machine-readable benchmark report,
 * reproducibility manifest). Deterministic and honest — no fabricated metrics.
 *
 *   node scripts/run-scientific-validation.mjs [--out <dir>] [--no-docking]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { runValidationSuite } from '../packages/backend/src/validation/suite.mjs';
import { scoreReadiness } from '../packages/backend/src/validation/readiness.mjs';
import { generatePublicationPackage } from '../packages/backend/src/validation/publications.mjs';
import { validateResearchQuality } from '../packages/backend/src/validation/researchQuality.mjs';
import { runDiscoveryCampaignV2 } from '../packages/backend/src/cognitive/discoveryCampaignV2.mjs';
import { ingestBundle } from '../packages/backend/src/corpus/corpusIngest.mjs';
import { buildClaimRegistry } from '../packages/backend/src/cognitive/evidenceIntelligence.mjs';
import * as docking from '../packages/backend/src/compute/dockingAdapter.mjs';
import * as rdkit from '../packages/backend/src/compute/rdkitAdapter.mjs';
import * as admet from '../packages/backend/src/compute/admetAdapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(opt('--out', path.resolve(__dirname, '../campaigns/scientific-validation')));
const WITH_DOCKING = !argv.includes('--no-docking');
const FIXTURE = path.resolve(__dirname, '../packages/backend/test-fixtures/genesis-scientific-evidence-bundle-v1');

console.log('=== GENESIS SCIENTIFIC VALIDATION SUITE ===');

// ── Phase 4 — run a small REAL campaign twice, validate its dossier + prove reproducibility ──────
function campaignOpts() {
  const ing = ingestBundle(FIXTURE, { campaignId: 'validation-campaign' });
  const bio = ing.evidenceRecords.find((e) => e.entityType === 'BioactivityRecord');
  const claims = [{ text: 'fixture target shows fixture-assay activity', supportingEvidenceIds: [bio.evidenceId], claimType: 'BIOACTIVITY' }];
  const { registry } = buildClaimRegistry(claims, ing.evidenceRecords);
  const target = { targetName: '[TEST FIXTURE] validation target', claimIds: [registry[0].claimId], structureAvailable: WITH_DOCKING, mechanismRationale: 'evidence-backed', cheapestFalsification: 'assay', knownChemicalMatter: true };
  let structure = null;
  if (WITH_DOCKING) { const c = docking.buildReferenceComplex({ sequence: 'ACDEFGHIKLMN', ligandSmiles: 'c1ccc2ccccc2c1', seed: 42 }); if (c.ok) structure = c.structure; }
  return { campaignId: 'validation-campaign', bundleRoot: FIXTURE, structure, targetHypotheses: [target], supplementalClaims: claims, minCandidates: 16, maxCandidates: 20, dockTopN: WITH_DOCKING ? 2 : 0 };
}

console.log('[phase4] running a small real campaign (twice) to validate outputs + reproducibility…');
const o = campaignOpts();
const d1 = runDiscoveryCampaignV2(o);
const d2 = runDiscoveryCampaignV2(o);
const campaignReproducible = d1.dossier.dossierHash === d2.dossier.dossierHash;
const rqCampaign = validateResearchQuality(d1.dossier);
console.log(`[phase4] dossier researchQuality ${rqCampaign.passedChecks}/${rqCampaign.totalChecks}; campaignReproducible=${campaignReproducible}; docking=${d1.dossier.summaries.docking.status}`);

// ── Phases 1/2/5 — measurable benchmarks + readiness (research-quality on the real dossier) ──────
console.log('[phase1-2] running benchmarks (descriptor / reproducibility / recovery / Truth / MCRE)…');
const suite = runValidationSuite({ dossier: d1.dossier });
suite.metrics.reproducibility.push({ metric: 'reproducibility', label: 'campaign', runs: 2, reproducible: campaignReproducible, hash: d1.dossier.dossierHash });
suite.researchQuality = rqCampaign;
if (d1.dossier.summaries.docking.status === 'EXECUTED' && !suite.enginesExecuted.some((e) => /Vina/.test(e))) suite.enginesExecuted.push('AutoDock Vina');
suite.readiness = scoreReadiness({
  descriptorAccuracy: suite.metrics.descriptorAccuracy, reproducibility: suite.metrics.reproducibility,
  rankingRecovery: suite.metrics.rankingRecovery, truth: suite.metrics.truth, mcre: suite.metrics.mcre,
  researchQuality: rqCampaign, enginesExecuted: suite.enginesExecuted, blockedEngines: suite.blockedEngines,
});
suite.campaignValidation = { candidateRanking: d1.dossier.benchmark.rankingTop10.length, dossierResearchQuality: { pass: rqCampaign.pass, score: rqCampaign.score }, campaignReproducible, dossierHash: d1.dossier.dossierHash };

// ── Phase 3 — publication package ─────────────────────────────────────────────────────────────
const meta = {
  generatedAt: process.env.GENESIS_VALIDATION_TS ?? '(run timestamp omitted for deterministic hashing)',
  engineVersions: { RDKit: rdkit.detect().version ?? (rdkit.detect().available ? 'available' : 'blocked'), 'ADMET-AI': admet.detect().version ?? (admet.detect().available ? 'available' : 'blocked'), Vina: docking.detect().vinaVersion ?? (docking.detect().available ? 'available' : 'blocked') },
  node: process.version, resultHash: canonicalHash(suite),
};
const pkg = generatePublicationPackage(suite, meta);

// ── Write the package ─────────────────────────────────────────────────────────────────────────
mkdirSync(path.join(OUT, 'figures'), { recursive: true });
mkdirSync(path.join(OUT, 'tables'), { recursive: true });
for (const [name, svg] of Object.entries(pkg.figures)) writeFileSync(path.join(OUT, 'figures', name), svg);
for (const [name, txt] of Object.entries(pkg.tables)) writeFileSync(path.join(OUT, 'tables', name), txt);
writeFileSync(path.join(OUT, 'METHODOLOGY.md'), pkg.methodology);
writeFileSync(path.join(OUT, 'VALIDATION_REPORT.md'), pkg.validationReport);
writeFileSync(path.join(OUT, 'benchmark-report.json'), JSON.stringify(pkg.benchmarkReport, null, 2));
writeFileSync(path.join(OUT, 'reproducibility-package.json'), JSON.stringify(pkg.reproducibility, null, 2));
writeFileSync(path.join(OUT, 'supplementary.json'), JSON.stringify(pkg.supplementary, null, 2));

// ── Summary ───────────────────────────────────────────────────────────────────────────────────
const m = suite.metrics;
const reproRate = m.reproducibility.filter((r) => r.reproducible).length / m.reproducibility.length;
console.log('\n── VALIDATION SUMMARY ─────────────────────────────────────');
console.log(`  descriptor correctness : MAE ${m.descriptorAccuracy.mae} g/mol, Pearson r=${m.descriptorAccuracy.pearsonR}, pass=${m.descriptorAccuracy.pass}`);
console.log(`  reproducibility        : ${(reproRate * 100).toFixed(0)}% (${m.reproducibility.map((r) => r.label).join(', ')})`);
console.log(`  ranking recovery       : ROC-AUC ${m.rankingRecovery.rocAuc}, P=${m.rankingRecovery.precision}, R=${m.rankingRecovery.recall} (${m.rankingRecovery.labelProvenance})`);
console.log(`  ranking stability      : ${m.rankingStability.stable ? 'STABLE' : 'unstable'} (Spearman ${m.rankingStability.spearmanRho})`);
console.log(`  Truth Engine           : accuracy ${m.truth.accuracy}, consistency ${m.truth.consistency} (n=${m.truth.n})`);
console.log(`  MCRE                   : accuracy ${m.mcre.accuracy}, consistency ${m.mcre.consistency} (n=${m.mcre.n})`);
console.log(`  campaign validation    : researchQuality ${rqCampaign.passedChecks}/${rqCampaign.totalChecks}, reproducible=${campaignReproducible}`);
console.log(`  real engines executed  : ${suite.enginesExecuted.join(', ')}`);
console.log(`  readiness (overall)    : ${suite.readiness.overallBand} (${suite.readiness.overall})`);
for (const [k, v] of Object.entries(suite.readiness.dimensions)) console.log(`     ${k.padEnd(9)} ${v.band} (${v.score})`);
console.log(`  package written        : ${OUT}`);
console.log('  DID GENESIS DISCOVER A DRUG? NO — computational validation only.');
