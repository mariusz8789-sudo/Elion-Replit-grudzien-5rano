/**
 * REAL MULTI-FIDELITY VALIDATION CAMPAIGN (Priority 14).
 *
 * Runs the maximum validated scientific pipeline available in THIS runtime:
 *   RDKit descriptors -> Pareto/diversity filter -> docking (if AVAILABLE)
 *   -> quantum chemistry (if AVAILABLE) -> MCRE cross-engine conflict.
 *
 * Reports EXACTLY which stages executed and, for blocked stages, the exact
 * blocker. This is a software-validation campaign on documented non-novel
 * reference chemicals — NOT a drug discovery, NOT a therapeutic/clinical claim.
 * All docking/QM outputs are MODEL_ESTIMATE. Docking uses a small-molecule rigid
 * receptor stand-in because a canonical protein-ligand structure requires RCSB
 * egress that is blocked by policy here.
 *
 * One reproducible command:  npm run campaign:validate
 */
import { openDatabase, createUser, createProject, listScienceRuns } from '../packages/backend/src/store.mjs';
import { hashPassword } from '../packages/backend/src/auth.mjs';
import { availableTransformations } from '../packages/backend/src/campaign/drugAdapter.mjs';
import { createCampaign, listCandidates, listEvents, getCampaign } from '../packages/backend/src/campaign/persistence.mjs';
import { runCampaign } from '../packages/backend/src/campaign/orchestrator.mjs';
import { runMultiFidelityStage } from '../packages/backend/src/campaign/multiFidelity.mjs';
import { listToolchain } from '../packages/backend/src/campaign/toolchain.mjs';
import { probeEnvironment } from '../packages/backend/src/compute/scienceEnv.mjs';

const bar = (t) => `\n${'='.repeat(70)}\n${t}\n${'='.repeat(70)}`;

function main() {
  console.log(bar('GENESIS — MULTI-FIDELITY VALIDATION CAMPAIGN (software validation)'));

  const env = probeEnvironment();
  if (env.ok) {
    console.log(`\nRuntime: ${env.runtime.os} ${env.runtime.arch}, Python ${env.runtime.python}, ${env.runtime.cpuCount} CPU, GPU=${env.runtime.gpu}`);
  }

  console.log('\nVerified toolchain (runtime reference-case validation):');
  const tc = listToolchain();
  for (const t of tc) {
    console.log(`  ${t.engineName.padEnd(26)} ${t.status.padEnd(16)} ${t.version ?? ''}`);
  }
  const has = (cap) => tc.find((t) => t.capabilityId === cap)?.status === 'AVAILABLE';
  const dockAvail = has('molecular-docking');
  const qmAvail = has('quantum-chemistry');

  const t0 = Date.now();
  const db = openDatabase();
  const u = createUser(db, { email: 'validation@genesis.lab', displayName: 'Validation', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'Validation Campaign', ownerId: u.id });
  const tx = availableTransformations();
  const campaign = createCampaign(db, {
    projectId: p.id,
    objective: 'Multi-fidelity software-validation: MPO descriptors + docking + QM (not a therapeutic claim)',
    domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 3, maxGeneratedCandidates: 60 },
    stopping: { patience: 2, minImprovement: 1e-3, diversityFloor: 0.12 },
    strategy: { startingSmiles: ['c1ccccc1', 'Oc1ccccc1', 'Nc1ccccc1'], transformationWeights: Object.fromEntries(tx.map((t) => [t, 1])), parentSelection: 'pareto' },
    createdBy: u.id,
  });

  // Stage 1 (cheap): RDKit descriptor campaign with adaptive Pareto search.
  console.log(bar('STAGE 1 — RDKit descriptors + Pareto/diversity (cheap)'));
  const summary = runCampaign(db, campaign.id);
  const cands = listCandidates(db, campaign.id);
  const retained = cands.filter((c) => c.status === 'retained');
  console.log(`  candidates generated: ${cands.length}, retained: ${retained.length}, Pareto: ${summary.paretoCount}`);
  console.log(`  hypervolume: ${summary.hypervolumeStart.toFixed(2)} -> ${summary.hypervolumeEnd.toFixed(2)}, stop: ${summary.stopReason}`);

  // Stage 2 (medium): docking on selected Pareto candidates.
  console.log(bar('STAGE 2 — Molecular docking (medium; Pareto-selected, budgeted)'));
  const mf = runMultiFidelityStage(db, campaign.id, {
    docking: { enabled: true, budget: 3, mode: 'pareto', receptor: { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], exhaustiveness: 8, nPoses: 5 } },
    quantum: { enabled: true, budget: 2, mode: 'pareto', method: 'RHF', basis: 'sto-3g' },
  }, { log: (s, i) => process.stdout.write(`  · ${s} ${JSON.stringify(i)}\n`) });

  if (mf.docking?.executed) {
    console.log(`  docking executed: selected ${mf.docking.selected}, not-selected ${mf.docking.notSelected}`);
    for (const d of mf.docking.docked) {
      console.log(`    ${d.smiles}: ${d.failed ? `FAILED (${d.error})` : `${d.bestAffinityKcalMol} kcal/mol (MODEL_ESTIMATE)`}`);
    }
  } else {
    console.log(`  docking BLOCKED: ${mf.docking?.blocker} (${dockAvail ? 'unexpected' : 'engine unavailable in runtime'})`);
  }

  console.log(bar('STAGE 3 — Quantum chemistry (expensive; Pareto-selected, budgeted)'));
  if (mf.quantum?.executed) {
    for (const q of mf.quantum.computed) {
      console.log(`    ${q.smiles}: ${q.failed ? `FAILED (${q.error})` : `HOMO-LUMO gap ${q.homoLumoGapEv} eV, dipole ${q.dipoleDebye} D (MODEL_ESTIMATE)`}`);
    }
  } else {
    console.log(`  quantum BLOCKED: ${mf.quantum?.blocker} (${qmAvail ? 'unexpected' : 'engine unavailable in runtime'})`);
  }

  console.log(bar('MCRE — cross-engine model conflicts'));
  if (mf.conflicts.length === 0) {
    console.log('  no descriptor-vs-docking conflicts detected this run (candidates agreed within thresholds)');
  } else {
    for (const c of mf.conflicts) {
      console.log(`  MODEL_CONFLICT ${c.smiles}: MPO ${c.resultA.value} (favorable) vs docking ${c.resultB.value} kcal/mol (weak) -> ${c.recommendation}`);
    }
  }

  const scienceRuns = listScienceRuns(db, campaign.id);
  const events = listEvents(db, campaign.id);
  const finalCamp = getCampaign(db, campaign.id);

  console.log(bar('EXECUTION REPORT (measured; MODEL_ESTIMATE only, no therapeutic claims)'));
  const report = {
    wallClockMs: Date.now() - t0,
    stagesExecuted: ['rdkit-descriptors', ...(mf.docking?.executed ? ['docking'] : []), ...(mf.quantum?.executed ? ['quantum'] : [])],
    stagesBlocked: [
      ...(mf.docking && !mf.docking.executed ? [`docking:${mf.docking.blocker}`] : []),
      ...(mf.quantum && !mf.quantum.executed ? [`quantum:${mf.quantum.blocker}`] : []),
    ],
    candidatesPerStage: {
      rdkit: cands.length,
      docking: mf.docking?.executed ? mf.docking.docked.length : 0,
      quantum: mf.quantum?.executed ? mf.quantum.computed.length : 0,
    },
    scientificRunsHeavy: scienceRuns.length,
    dockingRuns: scienceRuns.filter((r) => r.capability === 'molecular-docking').length,
    quantumRuns: scienceRuns.filter((r) => r.capability === 'quantum-chemistry').length,
    modelConflicts: mf.conflicts.length,
    rawArtifacts: scienceRuns.reduce((n, r) => n + r.artifacts.length, 0),
    stopReason: finalCamp.stopReason,
    events: events.length,
  };
  for (const [k, v] of Object.entries(report)) console.log(`  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);

  console.log('\nHONEST FRAMING: docking/QM values are MODEL_ESTIMATE for THIS run. No binding');
  console.log('affinity, ADMET, toxicity, therapeutic or clinical claim is made. Docking used a');
  console.log('small-molecule rigid receptor stand-in (RCSB egress blocked); it validates the');
  console.log('SOFTWARE PIPELINE, not a protein target.\n');

  const ok = report.stagesExecuted.includes('rdkit-descriptors') && scienceRuns.length >= 1;
  console.log(`RESULT: ${ok ? 'PASS — multi-fidelity pipeline executed on real engines.' : 'FAIL'}`);
  process.exitCode = ok ? 0 : 1;
}

main();
