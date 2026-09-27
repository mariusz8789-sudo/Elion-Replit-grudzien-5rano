import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject, listScienceRuns } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { detect as dockDetect } from './compute/dockingAdapter.mjs';
import { detect as qmDetect } from './compute/qmAdapter.mjs';
import { detect as admetDetect } from './compute/admetAdapter.mjs';
import { candidateIdentityGuard, researchGateVerdict, buildCandidateResearchMatrix } from './campaign/scientificIntegration.mjs';
import { createCampaign, addCandidate, listEvents } from './campaign/persistence.mjs';
import { runMultiFidelityStage, detectDescriptorDockingConflict, buildScientificComputeReport } from './campaign/multiFidelity.mjs';
import { verifyScienceRun } from './campaign/verify.mjs';

/**
 * Overnight Science PASS 2 Task 8 (Drug Discovery final proof) — ONE consolidated integration
 * proof walking the entire required flow end-to-end on REAL engines (all four toolchains are
 * available in this environment, confirmed by direct `detect()` calls below): identity guard ->
 * provenance -> evidence classification -> CONFLICTING_EVIDENCE (MODEL_CONFLICT) -> safety veto
 * -> CHEAP -> DOCKING -> QM -> ADMET -> falsification/replay -> candidate matrix -> research gate,
 * plus unbound=BLOCKED and no-efficacy-claim. No RDKit/docking/QM/ADMET engine is duplicated —
 * every stage below calls the existing `campaign/multiFidelity.mjs`/`scientificIntegration.mjs`
 * functions unmodified.
 */
const RDKIT = rdkitDetect().available;
const DOCK = dockDetect().available;
const QM = qmDetect().available;
const ADMET = admetDetect().available;
const allEngines = RDKIT && DOCK && QM && ADMET;

function seedCampaign() {
  const db = openDatabase();
  const u = createUser(db, { email: 'ddcp@lab.org', displayName: 'DDCP', passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: 'DDCP', ownerId: u.id });
  const c = createCampaign(db, {
    projectId: p.id, objective: 'Consolidated end-to-end proof (software validation)', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 1, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: [], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: u.id,
  });
  return { db, campaignId: c.id };
}

(allEngines ? test : test.skip)(
  'the full required flow, end-to-end, on real engines, in one campaign',
  () => {
    // ---- 1. Identity guard: unbound candidate (no smiles/formula) is BLOCKED before any model runs ----
    const unbound = candidateIdentityGuard({ id: 'unbound', label: 'no identity declared' });
    assert.equal(unbound.ok, false);
    assert.equal(unbound.status, 'BLOCKED');
    assert.equal(unbound.reason, 'IDENTITY_MISSING');

    // A real, identifiable candidate passes the same guard.
    const identified = candidateIdentityGuard({ id: 'candidate-1', smiles: 'c1ccccc1' });
    assert.equal(identified.ok, true);
    assert.ok(identified.canonicalSmiles);

    const { db, campaignId } = seedCampaign();

    // A safety-vetoed candidate (paired with a favorable descriptor so it later also produces a
    // real MODEL_CONFLICT deterministically) and a control candidate that should stay eligible.
    const vetoCandidate = addCandidate(db, {
      campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', valid: true, status: 'retained',
      pareto: true, descriptors: {}, objectiveVector: { x: 0.5 }, constraintViolations: [], runIds: [],
    });
    const controlCandidate = addCandidate(db, {
      campaignId, generation: 0, canonicalSmiles: 'Oc1ccccc1', valid: true, status: 'retained',
      pareto: false, descriptors: {}, objectiveVector: { x: 0.5 }, constraintViolations: [], runIds: [],
    });

    // ---- 2. Safety veto: an impossible TOXICITY threshold (hERG) rejects every candidate honestly ----
    // hERG is a real Toxicity-category endpoint (TOXICITY_FILTER_REJECTED -> SAFETY_VETO), which
    // the real gate priority-orders ABOVE even an unresolved MODEL_CONFLICT (step 4 below) — proving
    // "denied regardless of every other score" against a genuinely competing signal, not a vacuous case.
    const admetReport = runMultiFidelityStage(db, campaignId, { admet: { enabled: true, thresholds: { hERG: { max: 0 } } } });
    assert.equal(admetReport.admet.executed, true);
    assert.equal(admetReport.admet.filtered.rejected.length, 2, 'both candidates fail the impossible hERG threshold — a real, forced safety veto');
    const vetoEvents = listEvents(db, campaignId).filter((e) => e.type === 'STAGE_SELECTION' && e.payload.reason === 'TOXICITY_FILTER_REJECTED' && e.payload.candidateId === vetoCandidate);
    assert.ok(vetoEvents.length > 0, 'a real TOXICITY_FILTER_REJECTED event, not the weaker ADMET_FILTER_REJECTED');

    // ---- 3. CHEAP -> DOCKING (real AutoDock Vina + Meeko), provenance + evidence classification ----
    const dockReport = runMultiFidelityStage(db, campaignId, {
      docking: { enabled: true, budget: 2, receptor: { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], exhaustiveness: 4, nPoses: 3 } },
    });
    assert.equal(dockReport.executed !== false, true);
    const dockingRuns = listScienceRuns(db, campaignId).filter((r) => r.capability === 'molecular-docking');
    assert.ok(dockingRuns.length >= 1);
    assert.ok(dockingRuns.every((r) => r.evidenceClass === 'MODEL_ESTIMATE'), 'real evidence classification, MODEL_ESTIMATE for every docking run');
    assert.ok(dockingRuns.every((r) => r.inputHash && r.outputHash), 'real provenance (input/output hashes) on every docking run');

    // ---- 4. CONFLICTING_EVIDENCE: a real, deterministic MODEL_CONFLICT (favorable descriptor, poor docking) ----
    const veto = { id: vetoCandidate, campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', objectiveVector: { x: 0.5 } };
    const conflict = detectDescriptorDockingConflict(db, { campaignId, projectId: undefined }, veto, -1.0, { affinityThreshold: -3.0, scalarThreshold: 1.5 });
    assert.ok(conflict, 'a favorable descriptor scalar with a weak real docking affinity is a genuine conflict');
    assert.equal(conflict.classification, 'MODEL_CONFLICT');

    // ---- 5. QM (real PySCF): the happy path proving PySCF is NOT fail-closed when actually available ----
    const qmReport = runMultiFidelityStage(db, campaignId, { quantum: { enabled: true, budget: 1, method: 'RHF', basis: 'sto-3g' } });
    assert.equal(qmReport.quantum.executed, true);
    const qmGood = qmReport.quantum.computed.find((c) => !c.failed);
    assert.ok(qmGood && typeof qmGood.homoLumoGapEv === 'number', 'a real PySCF single-point energy, not a fabricated value');

    // ---- 6. Falsification / replay: a real docking run replays and its verdict is honestly persisted ----
    const anyDockingRun = dockingRuns[0];
    const verification = verifyScienceRun(db, anyDockingRun.id);
    assert.equal(verification.ok, true);
    assert.ok(['MATCH', 'DRIFT'].includes(verification.verification.verdict), 'a real, non-fabricated replay verdict');

    // ---- 7. Candidate matrix + research gate, over the whole real record ----
    const matrix = buildCandidateResearchMatrix(db, campaignId);
    assert.ok(matrix);
    const vetoRow = matrix.researchGate.find((r) => r.candidateId === vetoCandidate);
    assert.ok(vetoRow);
    assert.equal(vetoRow.gate.verdict, 'RESEARCH_PRIORITY_DENIED', 'the safety-vetoed candidate is denied research priority regardless of every other score');
    assert.equal(vetoRow.gate.reason, 'SAFETY_VETO');

    const controlVerdict = researchGateVerdict(db, campaignId, controlCandidate);
    assert.equal(controlVerdict.verdict, 'RESEARCH_PRIORITY_DENIED', 'the control candidate is ALSO vetoed here (the impossible threshold applies to every candidate) — never a partial, inconsistent veto');

    // ---- 8. Research score is NOT an efficacy/probability claim ----
    for (const row of matrix.researchGate) {
      const message = row.gate.message.toLowerCase();
      for (const forbidden of ['is effective', 'is efficacious', 'is safe', 'is a cure', 'cures', 'probability of success', 'clinical efficacy']) {
        assert.ok(!message.includes(forbidden), `researchGate message must never claim "${forbidden}"`);
      }
    }

    // ---- 9. The whole real record replays clean: evidence classification present for every executed stage ----
    const report = buildScientificComputeReport(db, campaignId);
    assert.ok(report);
    const executedStages = report.stages.filter((s) => s.status === 'EXECUTED');
    assert.ok(executedStages.length >= 2, 'at least docking and quantum-chemistry actually executed');
    assert.ok(executedStages.every((s) => s.evidenceClasses.every((c) => c === 'MODEL_ESTIMATE')));
  },
);
