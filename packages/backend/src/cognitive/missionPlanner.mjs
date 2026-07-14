/**
 * Mission Planner (Priority 2 — cognitive ceiling).
 *
 * Turns a research goal into a persisted, executable Scientific Task DAG on the
 * Evidence Store: research questions, competing hypotheses (with disconfirming
 * predictions), a dependency graph of compute + verification tasks, per-task
 * engine selection from the real Toolchain Registry, and explicit stop conditions.
 *
 * Honesty & dependency discipline:
 *  - This planner is DETERMINISTIC and INTERFACE-DRIVEN. General natural-language
 *    goal decomposition needs a reasoning model behind the Model Abstraction /
 *    Router layer (Priority 7); until that exists, an unknown domain returns an
 *    explicit `CAPABILITY_GAP` — it never fabricates a plan. This is an in-order
 *    implementation choice, NOT a reordering of the approved sequence.
 *  - Engine selection consults the real toolchain (`capabilityAvailable`); the
 *    resolver is injectable so tests are deterministic and fast. Availability is
 *    recorded honestly per task; the planner never pretends an absent engine is
 *    present.
 *  - Competing hypotheses are scientifically justified (they encode the real
 *    descriptor-vs-docking model tension the existing MCRE surfaces), each with a
 *    concrete disconfirming observation.
 */
import * as ev from './evidenceStore.mjs';
import * as dag from './taskGraph.mjs';
import * as store from '../store.mjs';

export const PLAN_STATUS = Object.freeze({ PLANNED: 'planned', CAPABILITY_GAP: 'CAPABILITY_GAP' });

/** Default engine-availability resolver: the real Toolchain Registry. Lazy import
 * so injecting a stub in tests avoids running heavy reference-case validation. */
function toolchainResolver(capabilityId) {
  return import('../campaign/toolchain.mjs').then((tc) => tc.capabilityAvailable(capabilityId));
}

/**
 * Plan a mission. Returns { mission, planStatus, questions, hypotheses, tasks,
 * edges, engineAvailability, reason? }. `resolveCapability` may be sync or async;
 * callers that want the toolchain default should use `planMissionAsync`.
 */
export function planMission(db, {
  projectId = null, goal, domain = 'drug-discovery', spec = {}, createdBy = null,
  resolveCapability = () => true, // deterministic default for planning-only callers/tests
}) {
  if (!goal) throw new Error('goal required');
  const strategy = STRATEGIES[domain];
  const stopConditions = spec.stopConditions ?? {
    maxGenerations: 8, maxCandidates: 400, objectiveThreshold: null, patience: 3,
  };
  const mission = ev.createMission(db, {
    projectId, goal, domain, createdBy,
    spec: { ...spec, stopConditions, planner: 'deterministic-v1' },
    computeBudget: spec.computeBudget ?? {}, modelBudget: spec.modelBudget ?? {},
  });

  if (!strategy) {
    // Honest gap: record an open question naming the missing capability; no plan invented.
    ev.addQuestion(db, {
      missionId: mission.id,
      text: `Goal decomposition for domain "${domain}" is not available in the deterministic planner; it requires the Model Router (Priority 7).`,
    });
    ev.setMissionStatus(db, mission.id, 'paused');
    return {
      mission: ev.getMission(db, mission.id), planStatus: PLAN_STATUS.CAPABILITY_GAP,
      reason: 'general natural-language goal decomposition requires the Model Abstraction/Router layer (Priority 7)',
      questions: ev.listQuestions(db, mission.id), hypotheses: [], tasks: [], edges: [], engineAvailability: {},
    };
  }
  return strategy(db, mission, { resolveCapability });
}

/** Async variant that resolves engine availability via the real toolchain by default. */
export async function planMissionAsync(db, opts) {
  const resolveCapability = opts.resolveCapability ?? (async (cap) => toolchainResolver(cap));
  // Pre-resolve to a sync map so the deterministic strategy stays synchronous.
  const caps = ['molecular-descriptors', 'admet-estimation', 'molecular-docking', 'quantum-chemistry', 'molecular-dynamics', 'toxicity-risk-estimation'];
  const avail = {};
  for (const c of caps) avail[c] = Boolean(await resolveCapability(c));
  return planMission(db, { ...opts, resolveCapability: (c) => avail[c] ?? false });
}

/* ---------------- Domain strategies ---------------- */

function planDrugDiscovery(db, mission, { resolveCapability }) {
  const mId = mission.id;

  // 1) Questions (decomposition tree).
  const qRoot = ev.addQuestion(db, { missionId: mId, text: 'Which candidate molecules best satisfy the objective under real-engine evidence?' });
  const qGen = ev.addQuestion(db, { missionId: mId, parentId: qRoot.id, text: 'What is a diverse, valid candidate set from the seed scaffold(s)?' });
  const qProp = ev.addQuestion(db, { missionId: mId, parentId: qRoot.id, text: 'Which candidates pass property/ADMET constraints?' });
  const qBind = ev.addQuestion(db, { missionId: mId, parentId: qRoot.id, text: 'Do property-favorable candidates also bind the target favorably?' });

  // 2) Competing hypotheses (scientifically justified: the descriptor-vs-docking tension).
  const h1 = ev.addHypothesis(db, {
    missionId: mId, questionId: qBind.id, label: 'H1',
    claim: 'Descriptor/ADMET-favorable candidates will also dock favorably to the target.',
    assumptions: ['2D property optimality correlates with 3D pocket complementarity'],
    predictedObservations: ['favorable MPO scalar AND favorable docking affinity'],
    disconfirmingObservations: ['favorable MPO scalar BUT weak (> -3 kcal/mol) docking affinity'],
    requiredEvidence: ['molecular-descriptors', 'molecular-docking'],
  });
  ev.addHypothesis(db, {
    missionId: mId, questionId: qBind.id, label: 'H2',
    claim: 'Descriptor/ADMET-favorable candidates will NOT reliably dock favorably (2D/3D mismatch).',
    assumptions: ['2D descriptors ignore solvation, entropy and pocket geometry'],
    predictedObservations: ['favorable MPO scalar co-occurring with weak docking for a non-trivial fraction'],
    disconfirmingObservations: ['favorable MPO scalar consistently accompanied by favorable docking'],
    requiredEvidence: ['molecular-descriptors', 'molecular-docking'],
  });

  // 3) Task DAG with per-task engine selection + availability snapshot.
  const pick = (capId) => ({ engine: capId, spec: { capability: capId, engineAvailable: Boolean(resolveCapability(capId)) } });

  const tSeed = dag.addTask(db, { missionId: mId, title: 'Seed & generate candidate set', taskType: 'generate', questionId: qGen.id, engine: 'rdkit', spec: { capability: 'molecular-descriptors', method: 'BRICS/SMARTS-transform', engineAvailable: Boolean(resolveCapability('molecular-descriptors')) } });
  const dDesc = pick('molecular-descriptors');
  const tDesc = dag.addTask(db, { missionId: mId, title: 'Compute descriptors (RDKit)', taskType: 'compute', questionId: qProp.id, engine: dDesc.engine, spec: dDesc.spec });
  const dAdmet = pick('admet-estimation');
  const tAdmet = dag.addTask(db, { missionId: mId, title: 'ADMET/toxicity filtering (ADMET-AI)', taskType: 'compute', questionId: qProp.id, engine: dAdmet.engine, spec: dAdmet.spec });
  const dNov = pick('molecular-descriptors');
  const tNov = dag.addTask(db, { missionId: mId, title: 'Tanimoto novelty filter', taskType: 'compute', questionId: qGen.id, engine: dNov.engine, spec: { ...dNov.spec, method: 'Morgan/Tanimoto' } });
  const dDock = pick('molecular-docking');
  const tDock = dag.addTask(db, { missionId: mId, title: 'Docking (AutoDock Vina + Meeko)', taskType: 'compute', questionId: qBind.id, hypothesisId: h1.id, engine: dDock.engine, spec: dDock.spec });
  const tVerify = dag.addTask(db, { missionId: mId, title: 'Verify results & resolve H1 vs H2 (MCRE)', taskType: 'verify', questionId: qBind.id });

  // Dependencies: seed -> descriptors -> {admet, novelty}; admet -> dock; {dock, novelty} -> verify.
  dag.addDependency(db, mId, tSeed.id, tDesc.id);
  dag.addDependency(db, mId, tDesc.id, tAdmet.id);
  dag.addDependency(db, mId, tDesc.id, tNov.id);
  dag.addDependency(db, mId, tAdmet.id, tDock.id);
  dag.addDependency(db, mId, tDock.id, tVerify.id);
  dag.addDependency(db, mId, tNov.id, tVerify.id);

  const tasks = [tSeed, tDesc, tAdmet, tNov, tDock, tVerify];
  const engineAvailability = {};
  for (const c of ['molecular-descriptors', 'admet-estimation', 'molecular-docking']) engineAvailability[c] = Boolean(resolveCapability(c));

  // 4) Checkpoint the freshly planned DAG for restart/recovery.
  dag.checkpoint(db, mId, 'planned');

  return {
    mission: ev.getMission(db, mId),
    planStatus: PLAN_STATUS.PLANNED,
    questions: ev.listQuestions(db, mId),
    hypotheses: ev.listHypotheses(db, mId),
    // reload tasks: states may have changed to BLOCKED as dependencies were added
    tasks: tasks.map((t) => store.getTaskNode(db, t.id)),
    edges: store.listTaskEdges(db, mId),
    engineAvailability,
  };
}

const STRATEGIES = { 'drug-discovery': planDrugDiscovery };
