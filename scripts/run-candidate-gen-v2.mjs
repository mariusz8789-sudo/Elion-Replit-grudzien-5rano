/**
 * Run the Candidate Generation Engine v2 with REAL RDKit + ADMET-AI, then WRITE the Discovery
 * Dossier + full ranking to disk. Task completion = Genesis itself generates >= 100 candidates,
 * evaluates them through RDKit and ADMET, ranks them, and saves the dossier.
 *
 *   node scripts/run-candidate-gen-v2.mjs [--min 100] [--out <dir>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCandidateGenerationV2 } from '../packages/backend/src/cognitive/candidateGenV2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MIN = Number(opt('--min', '100'));
const OUT = path.resolve(opt('--out', path.resolve(__dirname, '../campaigns/candidate-gen-v2')));

console.log(`=== Candidate Generation Engine v2 — generating >= ${MIN} candidates with REAL RDKit + ADMET-AI ===`);
const t0 = Date.now();
const result = runCandidateGenerationV2({
  minCandidates: MIN,
  scientificQuestion: 'Deterministic computational triage of RDKit-enumerated analogues around benign seed scaffolds.',
});

console.log('Engine matrix:', JSON.stringify(result.engineMatrix));
if (result.status !== 'COMPLETED_RANKED') {
  console.error(`FAIL: status=${result.status} — ${result.reason ?? 'insufficient candidates'} (nothing fabricated).`);
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'discovery-dossier.json'), JSON.stringify(result.dossier, null, 2));
writeFileSync(path.join(OUT, 'ranking.json'), JSON.stringify(result.ranking, null, 2));
writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify(result.candidates.map((c) => ({
  candidateId: c.candidateId, smiles: c.canonicalSmiles, generation: c.generation, parent: c.parentSmiles,
  transformation: c.transformation, seed: c.seedName,
  descriptors: c.engineOutputs.rdkit?.descriptors ?? null, nAlerts: c.engineOutputs.rdkit?.nAlerts ?? null,
  saScore: c.engineOutputs.rdkit?.saScore ?? null, admetOk: c.engineOutputs.admet?.ok ?? false,
})), null, 2));

const durMs = Date.now() - t0;
console.log(`Generated ${result.candidates.length} candidates in ${result.generationsUsed} generation(s) from ${result.seeds.length} seed(s).`);
console.log(`Evaluated: RDKit ${result.dossier.evaluation.rdkitEvaluated}, ADMET ${result.dossier.evaluation.admetEvaluated}, with alerts ${result.dossier.evaluation.withStructuralAlerts}.`);
console.log(`Ranked ${result.ranking.length} candidates (${result.dossier.rankingPolicyVersion}). Top 5:`);
for (const r of result.ranking.slice(0, 5)) console.log(`  #${r.rank} ${r.candidateId} ${r.canonicalSmiles} score ${r.finalScore} (druglike ${r.druglikeness}, sa ${r.saAccessibility}, qed ${r.admetQed})`);
console.log(`Dossier hash: ${result.dossier.dossierHash.slice(0, 16)}…`);
console.log(`DID GENESIS DISCOVER A DRUG? ${result.dossier.didGenesisDiscoverADrug}`);
console.log(`Wrote: ${path.join(OUT, 'discovery-dossier.json')} (+ ranking.json, candidates.json) in ${(durMs / 1000).toFixed(1)}s`);
