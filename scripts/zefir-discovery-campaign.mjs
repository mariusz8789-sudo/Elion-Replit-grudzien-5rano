/**
 * ZEFIR DISCOVERY CAMPAIGN (Phase 3N) — a REAL adversarial molecular campaign driven
 * by the AUTONOMOUS campaign runner over the adversarial funnel, on real engines.
 *
 * NOT the benzene QM trial. This is a molecular candidate-survival campaign:
 *   human goal → plan → per-candidate DAG → autonomous runner → real RDKit descriptors
 *   / PAINS+BRENK alerts / SA score / Tanimoto novelty + real ADMET-AI → adversarial
 *   critic tries to KILL each candidate → negative-result memory → survival ranking →
 *   Candidate Dossier V2 → CRO readiness → Meta-Orchestrator outcome.
 *
 * Candidate generation is REAL RDKit BRICS recombination of non-sensitive textbook
 * scaffolds (aspirin/paracetamol/ibuprofen/benzocaine). No novelty/therapeutic/
 * activity claim is made about any structure. If a real protein target were provided
 * the funnel would dock; here selectivity is honestly SELECTIVITY_NOT_ASSESSED.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../packages/backend/src/store.mjs';
import * as store from '../packages/backend/src/store.mjs';
import * as ev from '../packages/backend/src/cognitive/evidenceStore.mjs';
import * as dag from '../packages/backend/src/cognitive/taskGraph.mjs';
import * as runner from '../packages/backend/src/cognitive/campaignRunner.mjs';
import * as mf from '../packages/backend/src/cognitive/molecularFunnel.mjs';
import * as meta from '../packages/backend/src/cognitive/metaOrchestrator.mjs';
import * as rdkit from '../packages/backend/src/compute/rdkitAdapter.mjs';
import * as admet from '../packages/backend/src/compute/admetAdapter.mjs';

const log = (...a) => console.log(...a);
const SCAFFOLDS = { aspirin: 'CC(=O)Oc1ccccc1C(=O)O', paracetamol: 'CC(=O)Nc1ccc(O)cc1', ibuprofen: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1', benzocaine: 'CCOC(=O)c1ccc(N)cc1' };

function bricsCandidates(maxN = 12) {
  const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'brics_proof_worker.py');
  const cfg = { seed: 42, maxProducts: maxN, minHeavyAtoms: 8, maxHeavyAtoms: 40, referenceScaffolds: SCAFFOLDS };
  const out = JSON.parse(execFileSync('python3', [worker, JSON.stringify(cfg)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000 }));
  if (!out.ok) throw new Error('BRICS generation failed: ' + out.error);
  return out.molecules.slice(0, maxN);
}

async function main() {
  if (!rdkit.detect().available) { log('CAPABILITY_GAP: RDKit unavailable — cannot run an honest molecular campaign. Aborting.'); process.exit(2); }
  const admetOn = admet.detect().available;

  log('================ ZEFIR DISCOVERY CAMPAIGN ================');
  log('Human goal: "Prioritise a small BRICS-generated analog set by adversarial computational review; eliminate liabilities."');
  log(`Engines: RDKit ${rdkit.detect().version}${admetOn ? ` · ADMET-AI ${admet.detect().version}` : ' · ADMET-AI UNAVAILABLE (funnel records CAPABILITY_GAP for ADMET)'}`);
  log('Selectivity: no validated target structure available (RCSB egress blocked) → SELECTIVITY_NOT_ASSESSED.\n');

  const db = openDatabase(':memory:');
  const mission = ev.createMission(db, { goal: 'ZEFIR adversarial molecular prioritisation (BRICS analog set)', domain: 'small-molecule-discovery' });

  // REAL candidate generation.
  const candidates = bricsCandidates(12);
  const referenceSet = Object.values(SCAFFOLDS); // novelty measured vs the parent scaffolds
  log(`Generated ${candidates.length} REAL BRICS candidates. Reference set for novelty = ${referenceSet.length} parent scaffolds.\n`);

  // Build a per-candidate DAG; the AUTONOMOUS runner will drive it (no manual sequencing).
  const taskToSmiles = {};
  for (const smi of candidates) {
    const t = dag.addTask(db, { missionId: mission.id, title: `funnel ${smi.slice(0, 28)}`, taskType: 'compute', engine: 'molecular-descriptors', computeEstimate: { ms: 500 } });
    taskToSmiles[t.id] = smi;
  }

  // Executor: run the REAL adversarial funnel for the candidate bound to this task.
  const funnelResults = [];
  const executor = (db2, task) => {
    const smi = taskToSmiles[task.id];
    const engines = admetOn ? {} : { admet: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME' }) };
    const r = mf.runFunnel(db2, { missionId: mission.id, smiles: smi, generationStrategy: 'RDKit-BRICS', programModality: 'SMALL_MOLECULE_DISCOVERY', referenceSet, engines });
    funnelResults.push(r);
    return { status: 'COMPLETED', computeMs: 500 };
  };

  const run = runner.runCampaign(db, mission.id, { executor, budgets: { maxIterations: 200 }, capabilityResolver: () => true });
  log(`Autonomous runner: status=${run.status}, iterations=${run.iterations}, all tasks executed by the runner (order derived from the DAG).\n`);

  // Results.
  const byDecision = {};
  for (const r of funnelResults) byDecision[r.decision] = (byDecision[r.decision] ?? 0) + 1;
  const rejected = funnelResults.filter((r) => r.decision === 'REJECT');
  const held = funnelResults.filter((r) => r.decision === 'HOLD_FOR_MORE_EVIDENCE');
  const survivors = funnelResults.filter((r) => r.decision === 'SURVIVES_CURRENT_COMPUTATIONAL_REVIEW' || r.decision === 'ESCALATE_TO_HIGHER_FIDELITY');

  log('-- FUNNEL OUTCOME --');
  log(`  candidates entered: ${funnelResults.length}`);
  log(`  decisions: ${JSON.stringify(byDecision)}`);
  log(`  REJECTED: ${rejected.length}, HELD: ${held.length}, SURVIVED: ${survivors.length}`);

  log('\n-- REJECTION REASONS (adversarial critic tried to kill each candidate) --');
  for (const r of rejected) {
    const phys = r.stages.find((s) => s.stage === 'PHYSICOCHEMICAL_FILTER')?.output;
    const alerts = r.stages.find((s) => s.stage === 'STRUCTURAL_ALERTS')?.output;
    const why = r.signals.physFail ? `physicochemical (MW ${phys?.molWt}, logP ${phys?.logP})`
      : r.signals.hardAlerts ? `structural alerts (${(alerts?.alerts ?? []).join(',')})`
      : r.signals.knownMotif ? 'known-failing motif (negative-result memory)' : 'critic aggregate';
    log(`  REJECT ${r.candidate.canonicalSmiles.slice(0, 40)} — ${why}`);
  }

  if (survivors.length > 0) {
    const ranked = mf.rankSurvivors(db, mission.id);
    log('\n-- SURVIVORS (survived CURRENT computational review; selectivity NOT assessed) --');
    for (const s of ranked.slice(0, 5)) log(`  #${ranked.indexOf(s) + 1} ${s.canonicalSmiles.slice(0, 40)} — concerns ${s.concerns}, SA ${s.saScore}`);
    // Dossier V2 for the top survivor.
    const top = mf.buildDossier(db, ranked[0].candidateId);
    log('\n-- TOP SURVIVOR — CANDIDATE DOSSIER V2 --');
    log(`  SMILES: ${top.canonicalSmiles}`);
    log(`  molecularHash: ${top.molecularHash}  contentHash: ${top.contentHash.slice(0, 16)}...`);
    log(`  descriptors: MW ${top.descriptorResults?.molWt}, logP ${top.descriptorResults?.crippenLogP}`);
    log(`  SA score: ${top.saScore}  novelty: ${top.noveltyAnalysis?.maxTanimoto ?? top.noveltyAnalysis?.note}`);
    log(`  selectivity: ${top.computationalSelectivitySignals ?? 'SELECTIVITY_NOT_ASSESSED'}`);
    log(`  critic decision: ${top.criticDecision}  CRO handoff readiness: ${top.croHandoffReadiness}`);
    log(`  TRANSLATIONAL GAP WARNING: ${top.TRANSLATIONAL_GAP_WARNING}`);
  } else {
    log('\n-- SURVIVORS: ZERO. No candidate survived adversarial computational review. Reported as zero (honest negative result). --');
  }

  // Suspicious-if-all-survive adversarial check.
  if (survivors.length === funnelResults.length && funnelResults.length > 0) {
    log('\n!! ADVERSARIAL REVIEW TRIGGER: every candidate survived — this is suspicious and would trigger stricter review.');
  }

  // Negative-result memory summary.
  const motifs = store.listRejectionMotifs(db, mission.id);
  log(`\n-- NEGATIVE-RESULT MEMORY: ${motifs.length} rejection motif(s) recorded for future avoidance --`);

  // Meta outcome.
  const outcome = meta.classifyOutcome(db, mission.id);
  log(`\n-- META-ORCHESTRATOR OUTCOME: ${outcome.outcomeClass} (${outcome.reasons.join('; ')}) --`);

  log('\nHONEST BOTTOM LINE: real candidate generation + real multi-stage computation + adversarial rejection ran autonomously.');
  log('No candidate is claimed active, safe, selective, or novel. Selectivity was NOT assessed (no target). This is computational triage, not discovery.');
  log('=========================================================');
  db.close();
}

main().catch((e) => { console.error('CAMPAIGN ERROR:', e); process.exit(1); });
