/**
 * GENESIS AUTONOMOUS DISCOVERY FORGE — Grand Challenge run (Final WOW Mandate, Phases 16–17).
 *
 * Runs ONE bounded computational Grand Challenge through the REAL Autonomous Discovery Forge
 * with REAL RDKit engines (SMARTS-reaction analogue generation, descriptors, structural
 * alerts, synthetic accessibility, Tanimoto novelty). No live model, no live literature, no
 * receptor → reasoning/docking/MD/QM are honestly capability-blocked, never faked.
 *
 * Candidate generation is REAL RDKit recombination around NON-SENSITIVE textbook scaffolds
 * (aspirin/ibuprofen/paracetamol). NO therapeutic, activity, novelty, or safety claim is made
 * about any structure. Output is COMPUTATIONAL CANDIDATES only — hypotheses for validation.
 */
import { openDatabase } from '../packages/backend/src/store.mjs';
import * as store from '../packages/backend/src/store.mjs';
import * as ctrl from '../packages/backend/src/cognitive/discoveryController.mjs';

const log = (...a) => console.log(...a);
const hr = () => log('─'.repeat(72));

/* ---------------- Grand Challenge Selection Matrix (Phase 16) ---------------- */
const CRITERIA = ['DATA_AVAILABILITY', 'STRUCTURAL_TRACTABILITY', 'ENGINE_COMPATIBILITY', 'EVIDENCE_QUALITY', 'CAMPAIGN_BOUNDEDNESS', 'NOVELTY_SEARCH_FEASIBILITY', 'VALIDATION_PATH_CLARITY'];
// Scores 0–5, assigned from HONEST feasibility given installed engines + no external access.
const CHALLENGES = [
  { id: 'developability-analogues', name: 'Computational developability optimization of analogues around a known non-sensitive scaffold', scores: [5, 5, 5, 4, 5, 2, 4] },
  { id: 'kinase-inhibitor-docking', name: 'Structure-based kinase inhibitor discovery (requires real receptor)', scores: [3, 4, 2, 3, 3, 2, 4], note: 'ENGINE_COMPATIBILITY low: no prepared receptor available → docking capability-blocked' },
  { id: 'antibiotic-denovo', name: 'De novo antibiotic scaffold discovery', scores: [2, 2, 2, 2, 1, 1, 2], note: 'unbounded, needs live literature + assays' },
  { id: 'covid-protease', name: 'SARS-CoV-2 main protease inhibitor campaign', scores: [3, 4, 2, 3, 3, 2, 3], note: 'needs real 6LU7-class structure + live prior art' },
  { id: 'solubility-repair', name: 'Computational solubility/developability repair of a flagged scaffold', scores: [5, 5, 5, 3, 5, 2, 3] },
];
function totalScore(c) { return c.scores.reduce((a, b) => a + b, 0); }

log('=== GRAND CHALLENGE SELECTION MATRIX ===');
log(['challenge'.padEnd(46), ...CRITERIA.map((c) => c.slice(0, 4)), 'TOT'].join(' '));
for (const c of CHALLENGES) log([c.id.padEnd(46), ...c.scores.map((s) => String(s).padStart(4)), String(totalScore(c)).padStart(4)].join(' '));
const selected = CHALLENGES.slice().sort((a, b) => totalScore(b) - totalScore(a))[0];
hr();
log(`SELECTED: ${selected.id} (score ${totalScore(selected)})`);
log(`RATIONALE: highest feasibility given installed engines and NO external access — real RDKit`);
log(`  analogue generation + developability metrics are fully available; docking/MD/QM/live`);
log(`  literature are honestly out of scope here. Bounded, falsifiable computational result.`);
log('NOT chosen: docking/protease challenges (no real receptor → would require faking docking).');
hr();

/* ---------------- Run the campaign through the REAL forge ---------------- */
const db = openDatabase(':memory:');
const seeds = [
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1' },
  { name: 'paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1' },
];
const challenge = {
  grandChallenge: 'Computational developability optimization of analogues around non-sensitive textbook scaffolds',
  scope: 'small-molecule, computational-only, no therapeutic/activity claim',
  maxMolWt: 320, maxAlerts: 0, maxLogP: 3.2,
};

log('RUNNING autonomous campaign (real RDKit engines)…');
const result = ctrl.runCampaign(db, { projectId: 'grand-challenge', challenge, seeds, maxGenerations: 3, maxCandidatesPerGen: 14, referenceSet: seeds.map((s) => s.smiles) });

const ev = store.listDiscoveryEvents(db, result.campaignId);
const first = (t) => ev.find((e) => e.type === t);
const all = (t) => ev.filter((e) => e.type === t);

/* ---------------- WOW PROOF ARTIFACTS (Phase 17) ---------------- */
hr(); log('=== WOW PROOF ARTIFACTS ===');
const init = first('CAMPAIGN_INIT');
log(`1. initial plan hash:        ${init.payload.planHash.slice(0, 24)}…`);
const cohorts = all('COHORT');
const g0 = cohorts.find((c) => c.generation === 0);
log(`2. Generation 0 cohort:      ${g0.payload.candidates.length} candidates via [${g0.payload.transformsUsed.join(', ')}]`);
const f0 = all('FUNNEL').find((f) => f.generation === 0);
const g0surv = f0.payload.results.filter((r) => r.status === 'SURVIVED_STAGE').length;
const g0rej = f0.payload.results.filter((r) => r.status === 'REJECTED').length;
log(`3. Generation 0 results:     ${g0surv} survived, ${g0rej} rejected (real RDKit descriptors/alerts)`);
const sampleRej = f0.payload.results.find((r) => r.status === 'REJECTED');
log(`4. observed weakness:        e.g. "${sampleRej?.rejectReason ?? '(none)'}"`);
const necroEv = first('NECROPOLIS');
log(`5. Necropolis event:         ${necroEv ? necroEv.payload.recorded.length + ' failed region(s) recorded' : 'none'}`);
const mut = first('PLAN_MUTATION');
log(`6. plan mutation trigger:    ${mut?.payload.trigger} → ${mut?.payload.mutationType}`);
log(`   rationale:                ${mut?.payload.rationale.join('; ')}`);
log(`7. new plan hash:            ${mut?.payload.newPlanHash.slice(0, 24)}…  (changed: ${mut?.payload.previousPlanHash !== mut?.payload.newPlanHash})`);
const g1 = cohorts.find((c) => c.generation === 1);
log(`8. Generation 1 cohort:      ${g1 ? g1.payload.candidates.length + ' candidates via [' + g1.payload.transformsUsed.join(', ') + ']' : 'n/a'}`);
if (g1) {
  const via0 = [...new Set(g0.payload.candidates.map((c) => c.via))].sort();
  const via1 = [...new Set(g1.payload.candidates.map((c) => c.via))].sort();
  log(`9. lineage difference:       gen0 transforms {${via0.join(',')}} → gen1 {${via1.join(',')}}`);
  const avoided = g1.payload.skipped.filter((s) => /necropolis_dead_end/.test(s.reason));
  log(`10. failed regions avoided:  ${avoided.length} candidate(s) skipped as known dead ends in gen1`);
  const f1 = all('FUNNEL').find((f) => f.generation === 1);
  log(`11. Generation 1 results:    ${f1.payload.results.filter((r) => r.status === 'SURVIVED_STAGE').length} survived`);
}
const critic = first('CRITIC');
log(`12. critic output:           ${critic ? critic.payload.critiques.reduce((n, c) => n + c.critiques.length, 0) + ' criticisms; ' + critic.payload.critiques.filter((c) => c.demoted).length + ' demotion(s)' : 'none'}`);
const fals = first('FALSIFICATION');
log(`13. falsification task:       ${fals ? fals.payload.task.testType + ' (' + fals.payload.task.costClass + ')' : 'none'}`);
log(`14. stop decision:           ${result.status} (${result.stopReason})`);
log(`15. ranked candidates:       ${result.finalists.length} computational finalist(s)`);
result.finalists.slice(0, 3).forEach((f, i) => log(`     #${i + 1} ${f.candidate.canonicalStructure}  rank=${f.computationalRankScore} novelty=${f.novelty.status}`));

/* ---------------- Dossier (Phase 15) ---------------- */
const dossier = ctrl.buildDossier(db, result.campaignId);
log(`16. Discovery Dossier:       ${dossier.provenance.events} events, ${dossier.rankedComputationalCandidates.length} ranked; hash ${dossier.dossierHash.slice(0, 16)}…`);
log(`    engines executed:        ${dossier.enginesExecuted.join(', ')}`);
log(`    engines blocked:         ${dossier.enginesSkipped.map((e) => e.engine + '(' + e.decision + ')').join(', ')}`);
hr();

const wowPass = mut && mut.payload.previousPlanHash !== mut.payload.newPlanHash && g1 &&
  JSON.stringify([...new Set(g0.payload.candidates.map((c) => c.via))].sort()) !== JSON.stringify([...new Set(g1.payload.candidates.map((c) => c.via))].sort());
log(`WOW PROOF: ${wowPass ? 'PASS' : 'FAIL'} — the campaign ${wowPass ? 'CHANGED its plan because of results it observed' : 'did not adapt'}.`);
log('CLAIM (narrowest defensible): autonomous COMPUTATIONAL CAMPAIGN ADAPTATION — not autonomous');
log('scientific discovery, not experimental validation, not AGI.');
log(`\n${dossier.limitationStatement}`);
db.close();
process.exit(wowPass ? 0 : 1);
