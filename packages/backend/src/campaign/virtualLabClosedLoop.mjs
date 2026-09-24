/**
 * Genesis Virtual Lab Closed Loop — the IN-SILICO computational experiment
 * loop:
 *
 *   research question -> source-backed candidate -> hypothesis
 *   -> virtual experiment plan -> existing real solver/tool adapter
 *   -> computational observation -> canonical Evidence proposal
 *   -> support / falsification / conflict -> next experiment
 *   -> deterministic replay
 *
 * Thin integration layer ONLY. It reuses, and never duplicates:
 *   - campaign_events persistence          -> ./persistence.mjs
 *   - the ONE toolchain/engine registry    -> ./toolchain.mjs
 *   - the ONE real single-candidate solver execution + Scientific Run
 *     persistence path (docking/QM/ADMET)  -> ./multiFidelity.mjs
 *   - the ONE real OpenMM/Biopython adapters (bounded MD reference case,
 *     real PDB structural validation) -> ../compute/mdAdapter.mjs,
 *     ../compute/proteinAdapter.mjs (this module persists their Scientific
 *     Runs directly — no campaign-level wrapper existed for them yet)
 *   - the ONE deterministic replay engine  -> ./verify.mjs
 *   - the ONE safety/research gate         -> ./scientificIntegration.mjs
 *   - the ONE clinical-language guard      -> ./researchIntake.mjs
 *   - the ONE EvidenceLedger propose seam  -> ../knowledgeApi.mjs (wired by api.mjs, not imported here)
 *   - the ONE remote execution contract    -> ../compute/scientificCapabilityContract.mjs +
 *     ../compute/remoteScientificWorkerClient.mjs (executeVirtualExperimentDispatched only):
 *     a configured private worker runs the engine, while this module still owns
 *     authorization, ScienceRun persistence, classification, Evidence and replay
 *
 * This module creates NO second campaign engine, NO second EvidenceLedger, NO
 * second toolchain/solver registry, NO second persistence system, and NO
 * autonomous loop: every stage (plan / execute / replay) is a single bounded
 * call an explicit caller must make. There is no recursive self-scheduling.
 *
 * ===================== SCIENTIFIC CLAIM BOUNDARY ==========================
 *
 * A virtual experiment is an IN-SILICO computational result. It is NEVER an
 * external wet-lab observation, a clinical observation, a physical
 * instrument measurement, or validated biological efficacy. It must remain
 * strictly distinct from packages/backend/src/campaign/labClosedLoop.mjs's
 * EXTERNAL laboratory observation path (untouched, not imported here — the
 * two domains are deliberately kept apart so an in-silico result can never
 * be mistaken for, or silently merged with, a real external measurement).
 */
import * as campaignStore from './persistence.mjs';
import { getScienceRun, saveScienceRun } from '../store.mjs';
import { sha256Hex16 as sha16, snapshotEnvironment } from '../provenance.mjs';
import { researchGateVerdict } from './scientificIntegration.mjs';
import { capabilityAvailable, getTool } from './toolchain.mjs';
import { dockCandidate, qmCandidate, admetToxicityStage } from './multiFidelity.mjs';
import { descriptors as rdkitDescriptors, embed3d } from '../compute/rdkitAdapter.mjs';
import * as md from '../compute/mdAdapter.mjs';
import * as protein from '../compute/proteinAdapter.mjs';
import * as meep from '../compute/meepAdapter.mjs';
import { verifyScienceRun, VERDICT as REPLAY_VERDICT } from './verify.mjs';
import { assertNoClinicalLanguage } from './researchIntake.mjs';
import {
  DISPATCH_STATE,
  WORKER_CONTRACT_VERSION,
  buildMolecularDynamicsRun,
  buildProteinStructureRun,
  buildScienceRunRecord,
  validateCapabilityInput,
} from '../compute/scientificCapabilityContract.mjs';
import { createRemoteScientificWorkerClient, resolveWorkerConfig, routeCapability } from '../compute/remoteScientificWorkerClient.mjs';

export const VIRTUAL_LAB_CONTRACT_VERSION = '1.0.0';

export const VIRTUAL_EVENT = Object.freeze({
  PLANNED: 'VIRTUAL_EXPERIMENT_PLANNED',
  RESULT: 'VIRTUAL_EXPERIMENT_RESULT',
  REPLAY: 'VIRTUAL_EXPERIMENT_REPLAY',
  EVIDENCE_PROPOSED: 'VIRTUAL_EXPERIMENT_EVIDENCE_PROPOSED',
  /** Audit record of a retryable remote-transport failure; deliberately NOT a RESULT, so a retry can still execute. */
  DISPATCH_FAILED: 'VIRTUAL_EXPERIMENT_DISPATCH_FAILED',
});

export const SCIENTIFIC_EXECUTION_EVENT = Object.freeze({
  EXPERIMENT_PLANNED: 'EXPERIMENT_PLANNED',
  INPUT_VALIDATED: 'INPUT_VALIDATED',
  ENGINE_SELECTED: 'ENGINE_SELECTED',
  ENGINE_OUTPUT_AVAILABLE: 'ENGINE_OUTPUT_AVAILABLE',
  RESULT_CREATED: 'RESULT_CREATED',
  EVIDENCE_PROPOSED: 'EVIDENCE_PROPOSED',
  REPLAY_MATCH: 'REPLAY_MATCH',
  REPLAY_DRIFT: 'REPLAY_DRIFT',
  REPLAY_BLOCKED: 'REPLAY_BLOCKED',
  EXECUTION_BLOCKED: 'EXECUTION_BLOCKED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  EXECUTION_COMPLETED: 'EXECUTION_COMPLETED',
});

/** Required execution statuses (exact vocabulary) — never manufacture a successful result. */
export const EXECUTION_STATUS = Object.freeze({
  EXECUTED: 'EXECUTED_COMPUTATIONAL_EXPERIMENT',
  BLOCKED_UNBOUND_ENGINE: 'BLOCKED_UNBOUND_ENGINE',
  BLOCKED_RUNTIME_UNAVAILABLE: 'BLOCKED_RUNTIME_UNAVAILABLE',
  BLOCKED_INVALID_INPUT: 'BLOCKED_INVALID_INPUT',
  FAILED_ENGINE: 'FAILED_ENGINE',
});

/** Required replay statuses, plus honest additional outcomes the task itself demands
 *  ("for engines that cannot guarantee deterministic replay, state the limitation
 *  explicitly rather than reporting MATCH") — collapsing these into MATCH/DRIFT would
 *  misrepresent what was actually observed, exactly as ./verify.mjs already documents. */
export const REPLAY_STATUS = Object.freeze({
  MATCH: 'REPLAY_MATCH',
  DRIFT: 'REPLAY_DRIFT',
  ENGINE_VERSION_CHANGED: 'REPLAY_ENGINE_VERSION_CHANGED',
  BLOCKED_BY_RUNTIME: 'REPLAY_BLOCKED_BY_RUNTIME',
  UNSUPPORTED: 'REPLAY_UNSUPPORTED',
  NOT_YET_REPLAYED: 'NOT_YET_REPLAYED',
});

/** The ONLY epistemic classifications an in-silico result may carry. */
export const EPISTEMIC_CLASSIFICATION = Object.freeze({
  COMPUTATIONAL_HYPOTHESIS: 'COMPUTATIONAL_HYPOTHESIS',
  IN_SILICO_SUPPORT: 'IN_SILICO_SUPPORT',
  IN_SILICO_CONFLICT: 'IN_SILICO_CONFLICT',
  UNKNOWN: 'UNKNOWN',
});
const ALLOWED_EPISTEMIC = new Set(Object.values(EPISTEMIC_CLASSIFICATION));

/** Explicitly forbidden — a virtual experiment must NEVER be classified as any of these. */
export const FORBIDDEN_EPISTEMIC_PROMOTIONS = Object.freeze([
  'IN_VITRO_OBSERVATION', 'IN_VIVO_OBSERVATION', 'CLINICAL_OBSERVATION', 'CLINICALLY_EFFECTIVE', 'LAB_MEASUREMENT',
]);

/** Fail closed: throws if a caller (or a future edit) ever tries to smuggle a forbidden classification through. */
function assertAllowedEpistemicClassification(value) {
  if (!ALLOWED_EPISTEMIC.has(value)) {
    throw new Error(`VIRTUAL_LAB_FORBIDDEN_EPISTEMIC_CLASSIFICATION: "${value}" is not one of ${[...ALLOWED_EPISTEMIC].join(', ')}`);
  }
  return value;
}

const CLAIM_BOUNDARY =
  'This is an in-silico computational result only. It is not an external wet-lab observation, ' +
  'not a clinical observation, not a physical instrument measurement, and not validated biological ' +
  'or clinical efficacy. It never becomes any of those by replay, accumulation, or comparison alone.';

/** Capabilities a caller may request. Exactly the toolchain's own capabilityId vocabulary — no
 *  competing capability list is introduced. */
const ALLOWED_CAPABILITIES = new Set([
  'molecular-descriptors', 'quantum-chemistry', 'molecular-dynamics', 'molecular-docking',
  'protein-structure-ingestion', 'maxwell-fdtd', 'admet-estimation', 'toxicity-risk-estimation',
]);

/** Capabilities that actually have a campaign-level, single-candidate, PERSISTED execution path
 *  today (multiFidelity.mjs for docking/QM/ADMET/toxicity; this module directly for descriptors/
 *  molecular-dynamics/protein-structure-ingestion). A capability absent from this set is a real
 *  toolchain member that may even be AVAILABLE at the raw-engine level, but has no wired campaign
 *  execution binding — BLOCKED_UNBOUND_ENGINE, never fabricated. */
const BOUND_CAPABILITIES = new Set([
  'molecular-descriptors', 'quantum-chemistry', 'molecular-docking', 'admet-estimation', 'toxicity-risk-estimation',
  'molecular-dynamics', 'protein-structure-ingestion', 'maxwell-fdtd',
]);

/** Bounded autonomy — a hard ceiling on virtual experiments per campaign. There is no autonomous
 *  loop in this module (every stage requires an explicit caller call), so this ceiling is the
 *  only thing standing between a well-meaning caller and an unbounded campaign. */
export const MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN = 25;

function boundedString(value, max = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function findEvent(db, campaignId, predicate) {
  return campaignStore.listEvents(db, campaignId).find(predicate) ?? null;
}
function requireCampaignCandidate(db, campaignId, candidateId) {
  const campaign = campaignStore.getCampaign(db, campaignId);
  if (!campaign) return { ok: false, error: 'campaign_not_found' };
  const candidate = campaignStore.getCandidate(db, candidateId);
  if (!candidate || candidate.campaignId !== campaignId) return { ok: false, error: 'candidate_not_found' };
  return { ok: true, campaign, candidate };
}

/**
 * VIRTUAL EXPERIMENT PLAN — stage 1. Validates the hypothesis text (reuses the existing
 * clinical-language guard — never invents its own), the requested capability, the safety
 * gate, and the per-campaign experiment ceiling. Persists a PLANNED event and returns a frozen
 * `executionId` the caller uses for `executeVirtualExperiment`.
 */
export function planVirtualExperiment(db, {
  projectId = null,
  campaignId,
  candidateId,
  hypothesis,
  requestedCapability,
  params = {},
  budget = {},
  expectation = null,
  requestedBy = null,
} = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const normalizedHypothesis = boundedString(hypothesis, 2000);
  if (!normalizedHypothesis) return { ok: false, error: 'hypothesis_required' };
  try {
    assertNoClinicalLanguage(normalizedHypothesis);
  } catch (err) {
    return { ok: false, error: 'BLOCKED_INVALID_INPUT', status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT, reason: String(err?.message ?? err) };
  }

  if (!ALLOWED_CAPABILITIES.has(requestedCapability)) {
    return { ok: false, error: 'unknown_capability', status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT };
  }

  const normalizedExpectation = expectation && typeof expectation === 'object'
    ? {
      outputKey: boundedString(expectation.outputKey, 120) || null,
      comparator: ['LTE', 'GTE', 'EQ_WITHIN'].includes(expectation.comparator) ? expectation.comparator : null,
      threshold: finiteOrNull(expectation.threshold),
      tolerance: finiteOrNull(expectation.tolerance) ?? 0,
    }
    : null;
  if (normalizedExpectation && (!normalizedExpectation.outputKey || !normalizedExpectation.comparator || normalizedExpectation.threshold === null)) {
    return { ok: false, error: 'invalid_expectation', status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT };
  }

  const normalizedBudget = {
    maxComputeSeconds: finiteOrNull(budget.maxComputeSeconds),
    maxExperiments: Math.min(finiteOrNull(budget.maxExperiments) ?? MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN, MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN),
  };

  // Bounded autonomy — never let a campaign accumulate unbounded virtual experiments.
  const existingResults = campaignStore.listEvents(db, campaignId).filter((e) => e.type === VIRTUAL_EVENT.RESULT);
  if (existingResults.length >= normalizedBudget.maxExperiments) {
    return { ok: false, error: 'BLOCKED_INVALID_INPUT', status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT, reason: `Per-campaign virtual-experiment budget (${normalizedBudget.maxExperiments}) already reached.` };
  }

  // Stop on safety veto — never plan a virtual experiment for a candidate the research gate
  // has vetoed on toxicity grounds.
  const gate = researchGateVerdict(db, campaignId, candidateId);
  if (gate.reason === 'SAFETY_VETO') {
    return { ok: false, error: 'BLOCKED_INVALID_INPUT', status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT, reason: 'Research gate SAFETY_VETO — a vetoed candidate may not be planned for a virtual experiment.' };
  }

  const inputFingerprint = sha16({
    v: VIRTUAL_LAB_CONTRACT_VERSION, campaignId, candidateId, hypothesis: normalizedHypothesis,
    requestedCapability, params, expectation: normalizedExpectation, budget: normalizedBudget,
  });
  const executionId = `VEXP-${inputFingerprint}`;

  const existing = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.PLANNED && e.payload?.executionId === executionId);
  if (existing) return { ok: true, deduped: true, eventId: existing.id, plan: existing.payload };

  const payload = {
    contractVersion: VIRTUAL_LAB_CONTRACT_VERSION,
    executionId, inputFingerprint,
    projectId, campaignId, candidateId,
    candidateSmiles: linked.candidate.canonicalSmiles,
    hypothesis: normalizedHypothesis,
    requestedCapability, params: params ?? {}, expectation: normalizedExpectation, budget: normalizedBudget,
    researchGate: { verdict: gate.verdict, reason: gate.reason },
    requestedBy: boundedString(requestedBy, 160) || null,
    status: 'PLANNED',
    clinicalEfficacy: 'UNKNOWN',
    claimBoundary: CLAIM_BOUNDARY,
  };
  const eventId = campaignStore.addEvent(db, { campaignId, generation: linked.candidate.generation, type: VIRTUAL_EVENT.PLANNED, payload });
  return { ok: true, deduped: false, eventId, plan: payload };
}

/** Dispatches to the ONE existing, real, campaign-level single-candidate execution+persistence
 *  path for the requested capability. Never fabricates a result; returns the same honest
 *  ok:false/BLOCKED_BY_RUNTIME shape the underlying adapters already use. */
function dispatchExecution(db, ctx, candidate, requestedCapability, params) {
  if (!BOUND_CAPABILITIES.has(requestedCapability)) {
    return { ok: false, blocked: EXECUTION_STATUS.BLOCKED_UNBOUND_ENGINE, reason: `No campaign-level execution binding exists for capability "${requestedCapability}" yet.` };
  }
  if (requestedCapability === 'protein-structure-ingestion') {
    const pdbText = typeof params?.pdbText === 'string' ? params.pdbText : '';
    if (pdbText.trim().length < 20) {
      return { ok: false, blocked: EXECUTION_STATUS.BLOCKED_INVALID_INPUT, reason: 'protein-structure-ingestion requires a real params.pdbText (PDB-format text, at least 20 characters) — this module never invents or fetches a structure on the caller\'s behalf.' };
    }
  }
  if (!capabilityAvailable(requestedCapability)) {
    return { ok: false, blocked: EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE, reason: `Toolchain reports "${requestedCapability}" is not AVAILABLE in this runtime.` };
  }

  if (requestedCapability === 'molecular-docking') {
    const r = dockCandidate(db, ctx, candidate, params?.receptor ?? null);
    return r.ok ? { ok: true, run: r.run } : { ok: false, engineFailure: true, reason: r.reason ?? r.error };
  }
  if (requestedCapability === 'quantum-chemistry') {
    const r = qmCandidate(db, ctx, candidate, { method: params?.method, basis: params?.basis });
    return r.ok ? { ok: true, run: r.run } : { ok: false, engineFailure: true, reason: r.reason ?? r.error };
  }
  if (requestedCapability === 'admet-estimation' || requestedCapability === 'toxicity-risk-estimation') {
    const r = admetToxicityStage(db, ctx, [candidate]);
    if (!r.executed) return { ok: false, blocked: EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE, reason: r.reason ?? r.blocker };
    const entry = r.results[0];
    if (!entry) return { ok: false, engineFailure: true, reason: 'admet_no_result' };
    const runId = requestedCapability === 'admet-estimation' ? entry.admetRunId : entry.toxicityRunId;
    return { ok: true, run: getScienceRun(db, runId) };
  }
  if (requestedCapability === 'molecular-descriptors') {
    const t0 = Date.now();
    const r = rdkitDescriptors(candidate.canonicalSmiles);
    if (!r.ok) return { ok: false, engineFailure: true, reason: r.reason ?? r.error };
    const snap = snapshotEnvironment();
    const run = saveScienceRun(db, {
      projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: candidate.id,
      engine: 'RDKit', engineVersion: r.engine ?? null, capability: 'molecular-descriptors',
      method: 'RDKit 2D descriptors', status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
      inputs: { smiles: candidate.canonicalSmiles }, outputs: r.data, units: {},
      provenance: { engine: `RDKit ${r.engine ?? ''}`.trim() },
      inputHash: sha16({ s: candidate.canonicalSmiles }), outputHash: sha16(r.data),
      artifacts: [], durationMs: Date.now() - t0, environmentHash: snap.ok ? snap.hash : null,
    });
    return { ok: true, run };
  }
  if (requestedCapability === 'molecular-dynamics') {
    // Bounded reference execution ONLY — the existing OpenMM adapter exposes no per-candidate
    // simulation entry point, only a documented reference case (TIP3P water box, minimization +
    // short NVT). This proves the real engine executes for real; it does not simulate the
    // campaign candidate's own structure (an honest limitation, surfaced below, not hidden).
    const rawSteps = params?.steps;
    const steps = Number.isFinite(rawSteps) ? Math.min(Math.max(Math.trunc(rawSteps), 100), 5000) : 300;
    const t0 = Date.now();
    const r = md.referenceCase({ steps });
    if (!r.ok) return { ok: false, engineFailure: true, reason: r.reason ?? r.error };
    const snap = snapshotEnvironment();
    // Same builder the remote path uses, so a local and a remote OpenMM run persist identically.
    const record = buildMolecularDynamicsRun({ steps, engineResult: r });
    const run = saveScienceRun(db, {
      projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: candidate.id,
      ...record.run, durationMs: Date.now() - t0, environmentHash: snap.ok ? snap.hash : null,
    });
    return { ok: true, run, extraLimitations: record.extraLimitations };
  }
  if (requestedCapability === 'protein-structure-ingestion') {
    const pdbText = typeof params?.pdbText === 'string' ? params.pdbText : '';
    const t0 = Date.now();
    const r = protein.validatePdb(pdbText);
    if (!r.ok) return { ok: false, engineFailure: true, reason: r.reason ?? r.error };
    const snap = snapshotEnvironment();
    const record = buildProteinStructureRun({ pdbText, report: r.report, version: r.version });
    const run = saveScienceRun(db, {
      projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: candidate.id,
      ...record.run, durationMs: Date.now() - t0, environmentHash: snap.ok ? snap.hash : null,
    });
    return { ok: true, run, extraLimitations: record.extraLimitations };
  }
  if (requestedCapability === 'maxwell-fdtd') {
    const input = {
      n1: params?.n1 ?? 1,
      n2: params?.n2 ?? 2,
      frequency: params?.frequency ?? 1,
      resolution: params?.resolution ?? 80,
    };
    const validated = validateCapabilityInput(requestedCapability, input);
    if (!validated.ok) return { ok: false, blocked: EXECUTION_STATUS.BLOCKED_INVALID_INPUT, reason: `maxwell-fdtd input is outside its bounded schema: ${validated.errors.join('; ')}` };
    const t0 = Date.now();
    const r = meep.interfaceTransmission(input);
    if (!r.ok) return { ok: false, engineFailure: true, reason: r.reason ?? r.error };
    const snap = snapshotEnvironment();
    const record = buildScienceRunRecord(requestedCapability, { input, result: { data: r.data, meta: r.meta }, engineVersion: r.version });
    const run = saveScienceRun(db, {
      projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: candidate.id,
      ...record.run, durationMs: Date.now() - t0, environmentHash: snap.ok ? snap.hash : null,
    });
    return { ok: true, run, extraLimitations: record.extraLimitations };
  }
  return { ok: false, blocked: EXECUTION_STATUS.BLOCKED_UNBOUND_ENGINE, reason: 'unreachable' };
}

function evaluateExpectation(outputs, expectation) {
  if (!expectation) return EPISTEMIC_CLASSIFICATION.COMPUTATIONAL_HYPOTHESIS;
  const actual = finiteOrNull(outputs?.[expectation.outputKey]);
  if (actual === null) return EPISTEMIC_CLASSIFICATION.UNKNOWN;
  let supported;
  if (expectation.comparator === 'LTE') supported = actual <= expectation.threshold;
  else if (expectation.comparator === 'GTE') supported = actual >= expectation.threshold;
  else supported = Math.abs(actual - expectation.threshold) <= expectation.tolerance;
  return supported ? EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT : EPISTEMIC_CLASSIFICATION.IN_SILICO_CONFLICT;
}

/**
 * VIRTUAL EXPERIMENT EXECUTION — stage 2. Re-validates the safety gate (the veto is enforced
 * continuously, not only at plan time), dispatches to the one real bound engine, and persists
 * the honest, never-fabricated result. Idempotent: an already-executed plan returns its
 * existing result rather than re-running the engine.
 */
export function executeVirtualExperiment(db, { campaignId, candidateId, executionId, executedBy = null } = {}) {
  const prepared = prepareExecution(db, { campaignId, candidateId, executionId });
  if (prepared.early) return prepared.early;
  return executeLocally(db, prepared, { executedBy, dispatch: null });
}

/** Shared by the local and routed entry points: tenancy link, plan lookup, idempotent result reuse. */
function prepareExecution(db, { campaignId, candidateId, executionId }) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return { early: linked };

  const plan = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.PLANNED && e.payload?.executionId === executionId);
  if (!plan || plan.payload?.candidateId !== candidateId) return { early: { ok: false, error: 'plan_not_found' } };

  const existingResult = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.RESULT && e.payload?.executionId === executionId);
  if (existingResult) return { early: { ok: true, deduped: true, eventId: existingResult.id, result: existingResult.payload } };
  return { linked, plan };
}

/** The veto is enforced continuously, not only at plan time — for local AND remote execution. */
function persistSafetyVetoIfAny(db, { linked, plan }, dispatch) {
  const gate = researchGateVerdict(db, plan.payload.campaignId, plan.payload.candidateId);
  if (gate.reason !== 'SAFETY_VETO') return null;
  return persistResult(db, linked, plan.payload, {
    status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT,
    reason: 'Research gate SAFETY_VETO at execution time.',
    ...(dispatch ? { dispatch: { ...dispatch, state: DISPATCH_STATE.BLOCKED_INVALID_INPUT } } : {}),
  });
}

function executeLocally(db, prepared, { executedBy, dispatch }) {
  const vetoed = persistSafetyVetoIfAny(db, prepared, dispatch);
  if (vetoed) return vetoed;
  const { linked, plan } = prepared;
  const t0 = Date.now();
  let outcome = dispatchExecution(db, { projectId: plan.payload.projectId, campaignId: plan.payload.campaignId, candidateId: plan.payload.candidateId }, linked.candidate, plan.payload.requestedCapability, plan.payload.params);
  const durationMs = Date.now() - t0;
  if (dispatch?.remoteCapable && outcome.blocked === EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE) {
    // No local engine AND no worker configured for it: say both, precisely.
    outcome = {
      ...outcome,
      dispatchState: DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED,
      reason: `${outcome.reason} No scientific worker is configured for it either (${dispatch.envName} is not set).`,
    };
  }
  return finalizeExecution(db, prepared, outcome, { durationMs, executedBy, dispatch });
}

/** Maps a persisted execution status onto the dispatch vocabulary for the route that produced it. */
function dispatchStateForStatus(status, mode) {
  if (status === EXECUTION_STATUS.EXECUTED) return mode;
  if (status === EXECUTION_STATUS.BLOCKED_INVALID_INPUT) return DISPATCH_STATE.BLOCKED_INVALID_INPUT;
  if (status === EXECUTION_STATUS.FAILED_ENGINE) return DISPATCH_STATE.ENGINE_FAILED;
  return DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE;
}

/**
 * The ONE place a completed dispatch becomes a persisted RESULT — local and remote alike — so
 * the scientific classification boundary (evaluateExpectation + the forbidden-promotion guard)
 * cannot differ between the two routes.
 */
function finalizeExecution(db, { linked, plan }, outcome, { durationMs, executedBy, dispatch }) {
  const p = plan.payload;
  const withDispatch = (extra) => (dispatch
    ? { ...extra, dispatch: { ...dispatch, state: outcome.dispatchState ?? dispatchStateForStatus(extra.status, dispatch.mode) } }
    : extra);

  if (!outcome.ok) {
    if (outcome.blocked) return persistResult(db, linked, p, withDispatch({ status: outcome.blocked, reason: outcome.reason, executedBy }));
    return persistResult(db, linked, p, withDispatch({ status: EXECUTION_STATUS.FAILED_ENGINE, reason: outcome.reason ?? 'engine_failed', executedBy }));
  }

  const run = outcome.run;
  const tool = getTool(toolIdForCapability(p.requestedCapability));
  const epistemicClassification = assertAllowedEpistemicClassification(evaluateExpectation(run.outputs, p.expectation));
  const budgetExceeded = p.budget?.maxComputeSeconds != null && durationMs / 1000 > p.budget.maxComputeSeconds;
  // A remotely executed engine is identified by what the worker proved it ran, not by
  // whatever happens (or does not happen) to be installed in this service.
  const selectedEngine = outcome.remoteEngine
    ? { toolId: outcome.remoteEngine.toolId, engineName: tool?.engineName ?? outcome.remoteEngine.name, engineVersion: outcome.remoteEngine.version }
    : tool ? { toolId: tool.toolId, engineName: tool.engineName, engineVersion: tool.version } : { toolId: null, engineName: run.engine, engineVersion: run.engineVersion };

  return persistResult(db, linked, p, withDispatch({
    status: EXECUTION_STATUS.EXECUTED,
    executedBy,
    scienceRunId: run.id,
    selectedEngine,
    derivedOutput: run.outputs,
    epistemicClassification,
    limitations: [
      ...(tool?.assumptions ? [tool.assumptions] : []),
      ...(outcome.extraLimitations ?? []),
      ...(budgetExceeded ? [`Measured compute time ${(durationMs / 1000).toFixed(2)}s exceeded the declared budget of ${p.budget.maxComputeSeconds}s.`] : []),
    ],
    provenanceRefs: outcome.provenanceRefs ?? [`science-run:${run.id}`, ...(tool?.fingerprint ? [`toolchain:${tool.fingerprint}`] : [])],
    outputFingerprint: run.outputHash,
    durationMs,
  }));
}

/* ------------------------- routed (local | private worker) execution ------------------------- */

/** Transport-level failures: audited, returned as retryable, and never persisted as a RESULT. */
const RETRYABLE_DISPATCH_STATES = new Set([
  DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED,
  DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE,
  DISPATCH_STATE.WORKER_TIMEOUT,
  DISPATCH_STATE.WORKER_RESPONSE_INVALID,
]);
const EXECUTION_STATUS_FOR_DISPATCH = Object.freeze({
  [DISPATCH_STATE.BLOCKED_INVALID_INPUT]: EXECUTION_STATUS.BLOCKED_INVALID_INPUT,
  [DISPATCH_STATE.ENGINE_FAILED]: EXECUTION_STATUS.FAILED_ENGINE,
  [DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE]: EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE,
  [DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED]: EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE,
  [DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE]: EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE,
  [DISPATCH_STATE.WORKER_TIMEOUT]: EXECUTION_STATUS.FAILED_ENGINE,
  [DISPATCH_STATE.WORKER_RESPONSE_INVALID]: EXECUTION_STATUS.FAILED_ENGINE,
});

const REMOTE_LIMITATION = (workerGroup) =>
  `Executed by the private "${workerGroup}" scientific worker (remote contract ${WORKER_CONTRACT_VERSION}). This service verified the engine identity, `
  + 'the input and output fingerprints and the result schema before persisting this ScienceRun. Replay re-executes through this service\'s canonical '
  + 'replay engine and reports REPLAY_BLOCKED_BY_RUNTIME where the engine is not installed here.';

/** Concurrent calls for the same execution share one in-flight dispatch (never two worker runs). */
const inFlightDispatches = new Map();

function blockedInput(reason, errors = null) {
  return { ok: false, state: DISPATCH_STATE.BLOCKED_INVALID_INPUT, status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT, reason: errors?.length ? `${reason} ${errors.join('; ')}` : reason };
}
function onlyKeys(params, allowed) {
  if (params === null || params === undefined) return { ok: true, value: {} };
  if (typeof params !== 'object' || Array.isArray(params)) return { ok: false, unexpected: ['params'] };
  const unexpected = Object.keys(params).filter((k) => !allowed.includes(k));
  return unexpected.length ? { ok: false, unexpected } : { ok: true, value: params };
}

/**
 * Builds the worker request for a governed plan — in THIS service, from the persisted candidate
 * and plan params only. Params are strict per capability: anything else (including an attempt to
 * pass outputs or a classification) blocks the experiment instead of being forwarded or ignored.
 */
function buildRemoteWorkerInput(capabilityId, candidate, rawParams) {
  const allowedParams = {
    'quantum-chemistry': ['method', 'basis'],
    'protein-structure-ingestion': ['pdbText'],
    'molecular-dynamics': ['steps'],
    'molecular-docking': ['receptor'],
    'admet-estimation': [],
    'toxicity-risk-estimation': [],
    'maxwell-fdtd': ['n1', 'n2', 'frequency', 'resolution'],
  }[capabilityId];
  const params = onlyKeys(rawParams, allowedParams ?? []);
  if (!params.ok) return blockedInput(`params contains fields that ${capabilityId} does not accept: ${params.unexpected.join(', ')}.`);
  const p = params.value;
  let input;

  if (capabilityId === 'quantum-chemistry') {
    // Geometry comes from this service's embedded RDKit (seeded ETKDG + MMFF, so a retry
    // produces the identical geometry and therefore the identical worker fingerprint).
    const emb = embed3d(candidate.canonicalSmiles);
    if (!emb.ok) {
      return emb.error === 'BLOCKED_BY_RUNTIME'
        ? { ok: false, state: DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE, status: EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE, reason: 'RDKit (embedded in this service) is required to prepare the 3D geometry sent to the quantum-chemistry worker.' }
        : { ok: false, state: DISPATCH_STATE.ENGINE_FAILED, status: EXECUTION_STATUS.FAILED_ENGINE, reason: 'embed_failed: RDKit could not embed a 3D geometry for this candidate.' };
    }
    input = {
      smiles: candidate.canonicalSmiles,
      method: p.method ?? 'RHF',
      basis: p.basis ?? 'sto-3g',
      charge: emb.charge ?? 0,
      forceField: emb.forceField,
      atoms: emb.atoms.map((a) => ({ element: a.element, x: a.x, y: a.y, z: a.z })),
    };
  } else if (capabilityId === 'protein-structure-ingestion') {
    const pdbText = typeof p.pdbText === 'string' ? p.pdbText : '';
    if (pdbText.trim().length < 20) {
      return blockedInput('protein-structure-ingestion requires a real params.pdbText (PDB-format text, at least 20 characters) — this module never invents or fetches a structure on the caller\'s behalf.');
    }
    input = { pdbText };
  } else if (capabilityId === 'molecular-dynamics') {
    const rawSteps = p.steps;
    input = { steps: Number.isFinite(rawSteps) ? Math.min(Math.max(Math.trunc(rawSteps), 100), 5000) : 300 };
  } else if (capabilityId === 'molecular-docking') {
    const receptorCheck = onlyKeys(p.receptor, ['receptorSmiles', 'receptorPdbqt', 'center', 'boxSize', 'exhaustiveness', 'nPoses', 'seed']);
    if (!receptorCheck.ok) return blockedInput(`params.receptor contains unsupported fields: ${receptorCheck.unexpected.join(', ')}.`);
    const r = receptorCheck.value;
    // Same defaults as multiFidelity.dockCandidate, so a remote dock asks for exactly what a local one would.
    input = {
      ligandSmiles: candidate.canonicalSmiles,
      ...(r.receptorSmiles !== undefined ? { receptorSmiles: r.receptorSmiles } : {}),
      ...(r.receptorPdbqt !== undefined ? { receptorPdbqt: r.receptorPdbqt } : {}),
      ...(r.center !== undefined ? { center: r.center } : {}),
      boxSize: r.boxSize ?? [22, 22, 22],
      exhaustiveness: r.exhaustiveness ?? 8,
      nPoses: r.nPoses ?? 5,
      seed: r.seed ?? 42,
    };
  } else if (capabilityId === 'admet-estimation' || capabilityId === 'toxicity-risk-estimation') {
    input = { smiles: candidate.canonicalSmiles };
  } else if (capabilityId === 'maxwell-fdtd') {
    input = {
      n1: p.n1 ?? 1,
      n2: p.n2 ?? 2,
      frequency: p.frequency ?? 1,
      resolution: p.resolution ?? 80,
    };
  } else {
    return blockedInput(`No remote execution contract exists for "${capabilityId}".`);
  }

  const validated = validateCapabilityInput(capabilityId, input);
  if (!validated.ok) return blockedInput(`The ${capabilityId} request is outside its bounded schema:`, validated.errors);
  return { ok: true, input };
}

async function executeRemotely(db, prepared, route, { workerConfig, client, executedBy }) {
  const { linked, plan } = prepared;
  const p = plan.payload;
  const dispatchBase = { mode: DISPATCH_STATE.REMOTE_EXECUTION, workerGroup: route.workerGroup, workerContractVersion: WORKER_CONTRACT_VERSION };

  const vetoed = persistSafetyVetoIfAny(db, prepared, dispatchBase);
  if (vetoed) return vetoed;

  const built = buildRemoteWorkerInput(p.requestedCapability, linked.candidate, p.params);
  if (!built.ok) {
    return persistResult(db, linked, p, { status: built.status, reason: built.reason, executedBy, dispatch: { ...dispatchBase, state: built.state } });
  }

  const workerClient = client ?? createRemoteScientificWorkerClient({ config: workerConfig });
  const t0 = Date.now();
  const outcome = await workerClient.execute({ capabilityId: p.requestedCapability, executionId: p.executionId, input: built.input });
  const durationMs = Date.now() - t0;

  // Everything below is synchronous, so the check and the writes cannot interleave with another
  // call in this process: an execution that completed meanwhile is reused, never persisted twice.
  const existing = findEvent(db, p.campaignId, (e) => e.type === VIRTUAL_EVENT.RESULT && e.payload?.executionId === p.executionId);
  if (existing) return { ok: true, deduped: true, eventId: existing.id, result: existing.payload };

  const dispatch = {
    ...dispatchBase,
    state: outcome.state,
    attempts: outcome.attempts ?? 1,
    httpStatus: outcome.httpStatus ?? null,
    ...(outcome.ok ? {
      inputFingerprint: outcome.inputFingerprint,
      outputFingerprint: outcome.outputFingerprint,
      environmentFingerprint: outcome.environmentFingerprint,
      engineFingerprint: outcome.engine.fingerprint,
      idempotentReplay: outcome.idempotentReplay,
      roundTripMs: outcome.roundTripMs,
    } : { error: outcome.error }),
  };

  if (!outcome.ok) {
    if (RETRYABLE_DISPATCH_STATES.has(outcome.state)) {
      const eventId = campaignStore.addEvent(db, {
        campaignId: p.campaignId,
        generation: linked.candidate.generation,
        type: VIRTUAL_EVENT.DISPATCH_FAILED,
        payload: {
          contractVersion: VIRTUAL_LAB_CONTRACT_VERSION,
          executionId: p.executionId, campaignId: p.campaignId, candidateId: p.candidateId,
          requestedCapability: p.requestedCapability,
          executedBy: boundedString(executedBy, 160) || null,
          dispatch, reason: outcome.reason ?? null, retryable: true,
          attemptedAt: new Date().toISOString(),
        },
      });
      return {
        ok: false, error: outcome.state, status: EXECUTION_STATUS_FOR_DISPATCH[outcome.state],
        reason: outcome.reason ?? outcome.error, retryable: true, eventId, dispatch,
      };
    }
    return persistResult(db, linked, p, {
      status: EXECUTION_STATUS_FOR_DISPATCH[outcome.state] ?? EXECUTION_STATUS.FAILED_ENGINE,
      reason: outcome.reason ?? outcome.error, executedBy, dispatch,
    });
  }

  const record = buildScienceRunRecord(p.requestedCapability, { input: built.input, result: outcome.result, engineVersion: outcome.engine.version });
  const run = saveScienceRun(db, {
    projectId: p.projectId, campaignId: p.campaignId, candidateId: p.candidateId,
    ...record.run,
    provenance: {
      ...record.run.provenance,
      execution: {
        mode: DISPATCH_STATE.REMOTE_EXECUTION,
        workerGroup: route.workerGroup,
        workerContractVersion: WORKER_CONTRACT_VERSION,
        executionId: p.executionId,
        inputFingerprint: outcome.inputFingerprint,
        outputFingerprint: outcome.outputFingerprint,
        environmentFingerprint: outcome.environmentFingerprint,
        engineFingerprint: outcome.engine.fingerprint,
      },
    },
    // The engine ran on the worker, so its duration and environment are the worker's.
    durationMs: outcome.durationMs,
    environmentHash: outcome.environmentFingerprint,
  });

  return finalizeExecution(db, prepared, {
    ok: true,
    run,
    remoteEngine: outcome.engine,
    extraLimitations: [...record.extraLimitations, REMOTE_LIMITATION(route.workerGroup)],
    provenanceRefs: [`science-run:${run.id}`, ...(outcome.engine.fingerprint ? [`worker-toolchain:${outcome.engine.fingerprint}`] : [])],
  }, { durationMs, executedBy, dispatch });
}

/**
 * Routed execution — the entry point for callers that may use private scientific workers
 * (api.mjs). Always returns a Promise.
 *
 * Routing (compute/remoteScientificWorkerClient.mjs::routeCapability):
 *   - RDKit descriptors and capabilities without a remote contract: LOCAL, unchanged.
 *   - A worker-capable capability whose group URL is NOT configured: LOCAL, unchanged; if the
 *     engine is not installed here either, the persisted result says BLOCKED_WORKER_NOT_CONFIGURED.
 *   - A worker-capable capability whose group URL IS configured: REMOTE. A failed remote call
 *     never falls back to a local or different engine — no capability currently permits that.
 */
export async function executeVirtualExperimentDispatched(db, { campaignId, candidateId, executionId, executedBy = null } = {}, {
  workerConfig = resolveWorkerConfig(),
  client = null,
} = {}) {
  const prepared = prepareExecution(db, { campaignId, candidateId, executionId });
  if (prepared.early) return prepared.early;

  const route = routeCapability(prepared.plan.payload.requestedCapability, workerConfig);
  if (route.route !== 'REMOTE') {
    const dispatch = route.remoteCapable
      ? { mode: DISPATCH_STATE.LOCAL_EXECUTION, workerGroup: null, remoteCapable: true, envName: route.envName }
      : { mode: DISPATCH_STATE.LOCAL_EXECUTION, workerGroup: null };
    return executeLocally(db, prepared, { executedBy, dispatch });
  }

  const key = `${campaignId}\u0000${executionId}`;
  const pending = inFlightDispatches.get(key);
  if (pending) return pending;
  const run = executeRemotely(db, prepared, route, { workerConfig, client, executedBy })
    .finally(() => inFlightDispatches.delete(key));
  inFlightDispatches.set(key, run);
  return run;
}

function toolIdForCapability(capabilityId) {
  const map = {
    'molecular-descriptors': 'rdkit', 'quantum-chemistry': 'pyscf', 'molecular-docking': 'vina',
    'admet-estimation': 'admet', 'toxicity-risk-estimation': 'toxicity',
    'molecular-dynamics': 'openmm', 'protein-structure-ingestion': 'biopython',
  };
  return map[capabilityId] ?? null;
}

function persistResult(db, linked, plan, extra) {
  const payload = {
    contractVersion: VIRTUAL_LAB_CONTRACT_VERSION,
    executionId: plan.executionId,
    campaignId: plan.campaignId,
    candidateId: plan.candidateId,
    hypothesis: plan.hypothesis,
    requestedCapability: plan.requestedCapability,
    executedBy: boundedString(extra.executedBy, 160) || null,
    scienceRunId: extra.scienceRunId ?? null,
    selectedEngine: extra.selectedEngine ?? null,
    derivedOutput: extra.derivedOutput ?? null,
    epistemicClassification: extra.epistemicClassification ?? EPISTEMIC_CLASSIFICATION.UNKNOWN,
    limitations: extra.limitations ?? [],
    provenanceRefs: extra.provenanceRefs ?? [],
    outputFingerprint: extra.outputFingerprint ?? null,
    replayStatus: REPLAY_STATUS.NOT_YET_REPLAYED,
    durationMs: extra.durationMs ?? 0,
    executedAt: new Date().toISOString(),
    status: extra.status,
    reason: extra.reason ?? null,
    clinicalEfficacy: 'UNKNOWN',
    claimBoundary: CLAIM_BOUNDARY,
    // Where the engine actually ran (LOCAL_EXECUTION | REMOTE_EXECUTION) and the precise dispatch
    // state. Present only for routed executions; the plain local entry point's payload is unchanged.
    ...(extra.dispatch ? { dispatch: extra.dispatch } : {}),
  };
  const eventId = campaignStore.addEvent(db, { campaignId: plan.campaignId, generation: linked.candidate.generation, type: VIRTUAL_EVENT.RESULT, payload });
  return { ok: true, deduped: false, eventId, result: payload };
}

/**
 * DETERMINISTIC REPLAY — stage 3. Reuses ./verify.mjs's `verifyScienceRun` — the ONE existing
 * re-execution + persisted-verification path — and maps its honest verdict vocabulary onto
 * this module's REPLAY_STATUS. Never collapses ENGINE_VERSION_CHANGED/BLOCKED_BY_RUNTIME/
 * REPLAY_UNSUPPORTED into MATCH.
 */
export function replayVirtualExperiment(db, { campaignId, candidateId, executionId } = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const resultEvent = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.RESULT && e.payload?.executionId === executionId);
  if (!resultEvent || resultEvent.payload?.candidateId !== candidateId) return { ok: false, error: 'result_not_found' };
  if (resultEvent.payload.status !== EXECUTION_STATUS.EXECUTED || !resultEvent.payload.scienceRunId) {
    return { ok: false, error: 'not_executed_cannot_replay' };
  }

  const verification = verifyScienceRun(db, resultEvent.payload.scienceRunId);
  if (!verification.ok) return { ok: false, error: verification.error ?? 'replay_failed' };

  const replayStatus = {
    [REPLAY_VERDICT.MATCH]: REPLAY_STATUS.MATCH,
    [REPLAY_VERDICT.DRIFT]: REPLAY_STATUS.DRIFT,
    [REPLAY_VERDICT.ENGINE_VERSION_CHANGED]: REPLAY_STATUS.ENGINE_VERSION_CHANGED,
    [REPLAY_VERDICT.BLOCKED_BY_RUNTIME]: REPLAY_STATUS.BLOCKED_BY_RUNTIME,
    [REPLAY_VERDICT.REPLAY_UNSUPPORTED]: REPLAY_STATUS.UNSUPPORTED,
  }[verification.verification.verdict] ?? REPLAY_STATUS.UNSUPPORTED;

  const payload = {
    contractVersion: VIRTUAL_LAB_CONTRACT_VERSION,
    executionId, campaignId, candidateId,
    scienceRunId: resultEvent.payload.scienceRunId,
    verificationId: verification.verification.id,
    underlyingVerdict: verification.verification.verdict,
    replayStatus,
    detail: verification.verification.detail,
    clinicalEfficacy: 'UNKNOWN',
    claimBoundary: CLAIM_BOUNDARY,
  };
  const eventId = campaignStore.addEvent(db, { campaignId, generation: linked.candidate.generation, type: VIRTUAL_EVENT.REPLAY, payload });
  return { ok: true, eventId, replay: payload };
}

/** Idempotent Evidence link, mirroring labClosedLoop.mjs's own linkLabEvidenceProposal pattern:
 *  proves the result is itself EXECUTED before persisting, and dedupes on (executionId, proposalId). */
export function linkVirtualExperimentEvidenceProposal(db, { campaignId, candidateId, executionId, proposalId, evidenceContentHash = null } = {}) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;
  const proposal = boundedString(proposalId, 200);
  if (!proposal) return { ok: false, error: 'proposal_id_required' };

  const resultEvent = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.RESULT && e.payload?.executionId === executionId);
  if (!resultEvent || resultEvent.payload?.candidateId !== candidateId) return { ok: false, error: 'result_not_found' };
  if (resultEvent.payload.status !== EXECUTION_STATUS.EXECUTED) return { ok: false, error: 'not_executed' };

  const existing = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.EVIDENCE_PROPOSED && e.payload?.executionId === executionId && e.payload?.proposalId === proposal);
  if (existing) return { ok: true, deduped: true, eventId: existing.id, link: existing.payload };

  const payload = { contractVersion: VIRTUAL_LAB_CONTRACT_VERSION, executionId, candidateId, proposalId: proposal, evidenceContentHash: boundedString(evidenceContentHash, 200) || null, mode: 'PROPOSE_ONLY', status: 'PENDING_HUMAN_PUBLICATION' };
  const eventId = campaignStore.addEvent(db, { campaignId, generation: linked.candidate.generation, type: VIRTUAL_EVENT.EVIDENCE_PROPOSED, payload });
  return { ok: true, deduped: false, eventId, link: payload };
}

/**
 * Builds a NewEvidenceInput-shaped proposal for a completed virtual experiment (and, when a
 * replay has already run, folds its verdict into the same claim). Produces data only; does not
 * call knowledgeApi itself (api.mjs wires it to `proposeStructuredEvidence`, the SAME seam
 * labClosedLoop.mjs's own bridge uses) and never publishes.
 */
export function buildVirtualExperimentEvidenceInput({ result, replay = null } = {}) {
  if (!result) return { ok: false, error: 'result_required' };
  if (result.status !== EXECUTION_STATUS.EXECUTED) return { ok: false, error: 'result_not_executed' };
  assertAllowedEpistemicClassification(result.epistemicClassification);

  const claimParts = [
    `In-silico computational experiment for candidate ${result.candidateId}:`,
    `hypothesis "${result.hypothesis}".`,
    `Capability ${result.requestedCapability} via ${result.selectedEngine?.engineName ?? 'unknown engine'} ${result.selectedEngine?.engineVersion ?? ''}.`.trim(),
    `Epistemic classification: ${result.epistemicClassification}.`,
  ];
  if (replay) claimParts.push(`Deterministic replay: ${replay.replayStatus}.`);
  claimParts.push(CLAIM_BOUNDARY);

  return {
    ok: true,
    input: {
      sourceUrl: `genesis://virtual-lab/science-run/${result.scienceRunId}`,
      sourceTimestamp: result.executedAt,
      claim: claimParts.join(' '),
      claimType: 'model',
      confidence: result.epistemicClassification === EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT ? 0.6
        : result.epistemicClassification === EPISTEMIC_CLASSIFICATION.IN_SILICO_CONFLICT ? 0.4 : 0.5,
      provenance: {
        sourceKind: 'dataset',
        retrievedBy: `genesis-virtual-lab-closed-loop/${VIRTUAL_LAB_CONTRACT_VERSION}`,
        independentSourceIds: [`science-run:${result.scienceRunId}`],
      },
    },
    boundary: CLAIM_BOUNDARY,
  };
}

/** In-silico-scoped next-action vocabulary — never names or generates a wet-lab protocol, dose,
 *  or treatment recommendation; "ESCALATE_TO_EXTERNAL_VALIDATION" only NAMES the honest next
 *  domain (packages/backend/src/campaign/labClosedLoop.mjs), it never creates a request there. */
export function deriveNextVirtualAction(dossier) {
  if (!dossier) return { action: 'BLOCKED', reason: 'DOSSIER_MISSING' };
  if (dossier.plans.length === 0) return { action: 'FORMULATE_HYPOTHESIS_AND_PLAN', reason: 'NO_PLAN' };

  const latestPlan = dossier.plans[dossier.plans.length - 1];
  const result = dossier.results.find((r) => r.payload.executionId === latestPlan.payload.executionId)?.payload ?? null;
  if (!result) {
    const failedDispatch = (dossier.dispatchFailures ?? []).some((f) => f.payload.executionId === latestPlan.payload.executionId);
    return { action: 'EXECUTE_VIRTUAL_EXPERIMENT', reason: failedDispatch ? 'REMOTE_DISPATCH_FAILED_RETRYABLE' : 'PLANNED_NOT_EXECUTED' };
  }

  if (result.status === EXECUTION_STATUS.BLOCKED_UNBOUND_ENGINE) return { action: 'ESCALATE_TO_EXTERNAL_VALIDATION', reason: 'NO_IN_SILICO_BINDING_FOR_CAPABILITY' };
  if (result.status === EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE) return { action: 'AWAIT_ENGINE_AVAILABILITY', reason: 'ENGINE_NOT_AVAILABLE_IN_RUNTIME' };
  if (result.status === EXECUTION_STATUS.BLOCKED_INVALID_INPUT) return { action: 'REVISE_HYPOTHESIS_OR_MODEL', reason: 'INVALID_INPUT_OR_SAFETY_VETO' };
  if (result.status === EXECUTION_STATUS.FAILED_ENGINE) return { action: 'RETRY_OR_REVISE_PLAN', reason: 'ENGINE_EXECUTION_FAILED' };

  const replay = [...dossier.replays].reverse().find((r) => r.payload.executionId === result.executionId)?.payload ?? null;
  if (!replay) return { action: 'REPLAY_FOR_REPRODUCIBILITY', reason: 'NOT_YET_REPLAYED' };
  if (replay.replayStatus === REPLAY_STATUS.DRIFT) return { action: 'INVESTIGATE_REPLAY_DRIFT', reason: 'REPLAY_DRIFT_DETECTED' };
  if (replay.replayStatus === REPLAY_STATUS.ENGINE_VERSION_CHANGED) return { action: 'REVALIDATE_AFTER_ENGINE_UPGRADE', reason: 'ENGINE_VERSION_CHANGED_SINCE_ORIGINAL_RUN' };
  if (replay.replayStatus === REPLAY_STATUS.BLOCKED_BY_RUNTIME) return { action: 'AWAIT_ENGINE_AVAILABILITY', reason: 'REPLAY_BLOCKED_BY_RUNTIME' };

  if (result.epistemicClassification === EPISTEMIC_CLASSIFICATION.COMPUTATIONAL_HYPOTHESIS) {
    return { action: 'FORM_TESTABLE_EXPECTATION', reason: 'RAW_OBSERVATION_NOT_YET_COMPARED' };
  }
  if (result.epistemicClassification === EPISTEMIC_CLASSIFICATION.IN_SILICO_CONFLICT) {
    return { action: 'REVISE_HYPOTHESIS_OR_MODEL', reason: 'IN_SILICO_CONFLICT' };
  }
  if (result.epistemicClassification === EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT) {
    return { action: 'ESCALATE_TO_EXTERNAL_VALIDATION', reason: 'REPRODUCIBLE_IN_SILICO_SUPPORT', claimBoundary: CLAIM_BOUNDARY };
  }
  return { action: 'RUN_ADDITIONAL_VIRTUAL_EXPERIMENT', reason: 'UNKNOWN_CLASSIFICATION' };
}

/**
 * Read-only projection of the append-only campaign records into the canonical
 * scientific lifecycle vocabulary. This is deliberately not another event
 * bus: every item points back to the campaign event that proves it happened.
 * Adapter progress/iteration events are absent until an adapter supplies real
 * telemetry; no percentages or solver steps are inferred here.
 */
export function projectScientificExecutionTimeline({ plans = [], results = [], replays = [], evidenceLinks = [], dispatchFailures = [] } = {}) {
  const timeline = [];
  const typeOrder = new Map([
    [SCIENTIFIC_EXECUTION_EVENT.INPUT_VALIDATED, 0],
    [SCIENTIFIC_EXECUTION_EVENT.EXPERIMENT_PLANNED, 1],
    [SCIENTIFIC_EXECUTION_EVENT.ENGINE_SELECTED, 2],
    [SCIENTIFIC_EXECUTION_EVENT.ENGINE_OUTPUT_AVAILABLE, 3],
    [SCIENTIFIC_EXECUTION_EVENT.RESULT_CREATED, 4],
    [SCIENTIFIC_EXECUTION_EVENT.EXECUTION_COMPLETED, 5],
    [SCIENTIFIC_EXECUTION_EVENT.EXECUTION_BLOCKED, 5],
    [SCIENTIFIC_EXECUTION_EVENT.EXECUTION_FAILED, 5],
    [SCIENTIFIC_EXECUTION_EVENT.EVIDENCE_PROPOSED, 6],
    [SCIENTIFIC_EXECUTION_EVENT.REPLAY_MATCH, 7],
    [SCIENTIFIC_EXECUTION_EVENT.REPLAY_DRIFT, 7],
    [SCIENTIFIC_EXECUTION_EVENT.REPLAY_BLOCKED, 7],
  ]);
  const detailText = (value) => {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return 'No additional detail recorded.';
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  const add = (source, type, detail, status = 'RECORDED') => {
    timeline.push({
      id: `${source.id}:${type}`,
      type,
      status,
      occurredAt: source.createdAt,
      executionId: source.payload?.executionId ?? null,
      sourceEventId: source.id,
      sourceEventType: source.type,
      detail: detailText(detail),
    });
  };

  for (const event of plans) {
    add(event, SCIENTIFIC_EXECUTION_EVENT.INPUT_VALIDATED, `Validated governed input ${event.payload.inputFingerprint}.`);
    add(event, SCIENTIFIC_EXECUTION_EVENT.EXPERIMENT_PLANNED, `Planned ${event.payload.requestedCapability}.`);
  }
  for (const event of results) {
    const result = event.payload;
    if (result.status === EXECUTION_STATUS.EXECUTED) {
      if (result.selectedEngine) {
        add(event, SCIENTIFIC_EXECUTION_EVENT.ENGINE_SELECTED, `${result.selectedEngine.engineName} ${result.selectedEngine.engineVersion ?? 'version unavailable'}.`);
      }
      add(event, SCIENTIFIC_EXECUTION_EVENT.ENGINE_OUTPUT_AVAILABLE, `Output fingerprint ${result.outputFingerprint ?? 'unavailable'}.`);
      add(event, SCIENTIFIC_EXECUTION_EVENT.RESULT_CREATED, `${result.epistemicClassification}; ScienceRun ${result.scienceRunId}.`);
      add(event, SCIENTIFIC_EXECUTION_EVENT.EXECUTION_COMPLETED, `Real bounded engine call completed in ${result.durationMs ?? 0} ms.`);
    } else if (result.status === EXECUTION_STATUS.FAILED_ENGINE) {
      add(event, SCIENTIFIC_EXECUTION_EVENT.EXECUTION_FAILED, result.reason ?? 'Engine execution failed.', 'FAILED');
    } else {
      add(event, SCIENTIFIC_EXECUTION_EVENT.EXECUTION_BLOCKED, `${result.status}: ${result.reason ?? 'Execution blocked.'}`, 'BLOCKED');
    }
  }
  for (const event of dispatchFailures) {
    const failed = event.payload;
    add(event, SCIENTIFIC_EXECUTION_EVENT.EXECUTION_BLOCKED, `${failed.dispatch?.state ?? 'REMOTE_DISPATCH_FAILED'} (retryable): ${failed.reason ?? 'Remote worker dispatch failed.'}`, 'BLOCKED');
  }
  for (const event of evidenceLinks) {
    add(event, SCIENTIFIC_EXECUTION_EVENT.EVIDENCE_PROPOSED, `Proposal ${event.payload.proposalId} is pending human publication.`);
  }
  for (const event of replays) {
    const replay = event.payload;
    const type = replay.replayStatus === REPLAY_STATUS.MATCH
      ? SCIENTIFIC_EXECUTION_EVENT.REPLAY_MATCH
      : replay.replayStatus === REPLAY_STATUS.DRIFT
        ? SCIENTIFIC_EXECUTION_EVENT.REPLAY_DRIFT
        : SCIENTIFIC_EXECUTION_EVENT.REPLAY_BLOCKED;
    add(event, type, replay.detail, type === SCIENTIFIC_EXECUTION_EVENT.REPLAY_MATCH ? 'RECORDED' : 'BLOCKED');
  }
  return timeline.sort((a, b) => a.occurredAt - b.occurredAt
    || (typeOrder.get(a.type) ?? 99) - (typeOrder.get(b.type) ?? 99)
    || a.id.localeCompare(b.id));
}

/** Read-only aggregate for API/UI and subsequent reasoning. Mirrors labClosedLoop.mjs's own
 *  buildLabValidationDossier shape/spirit without importing it (different event types/domain). */
export function buildVirtualLabDossier(db, campaignId, candidateId) {
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const events = campaignStore.listEvents(db, campaignId);
  const plans = events.filter((e) => e.type === VIRTUAL_EVENT.PLANNED && e.payload?.candidateId === candidateId);
  const results = events.filter((e) => e.type === VIRTUAL_EVENT.RESULT && e.payload?.candidateId === candidateId);
  const replays = events.filter((e) => e.type === VIRTUAL_EVENT.REPLAY && e.payload?.candidateId === candidateId);
  const evidenceLinks = events.filter((e) => e.type === VIRTUAL_EVENT.EVIDENCE_PROPOSED && e.payload?.candidateId === candidateId);
  const dispatchFailures = events.filter((e) => e.type === VIRTUAL_EVENT.DISPATCH_FAILED && e.payload?.candidateId === candidateId);

  const executionTimeline = projectScientificExecutionTimeline({ plans, results, replays, evidenceLinks, dispatchFailures });
  const dossier = { contractVersion: VIRTUAL_LAB_CONTRACT_VERSION, campaignId, candidateId, candidate: linked.candidate, plans, results, replays, evidenceLinks, dispatchFailures, executionTimeline, clinicalEfficacy: 'UNKNOWN', claimBoundary: CLAIM_BOUNDARY };
  return {
    ok: true,
    dossier: {
      ...dossier,
      nextAction: deriveNextVirtualAction(dossier),
      dossierFingerprint: sha16({
        v: VIRTUAL_LAB_CONTRACT_VERSION, campaignId, candidateId,
        executionIds: plans.map((e) => e.payload?.executionId),
        resultStatuses: results.map((e) => e.payload?.status),
        replayStatuses: replays.map((e) => e.payload?.replayStatus),
        evidenceProposalIds: evidenceLinks.map((e) => e.payload?.proposalId),
      }),
    },
  };
}
