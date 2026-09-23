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
 *   - the ONE deterministic replay engine  -> ./verify.mjs
 *   - the ONE safety/research gate         -> ./scientificIntegration.mjs
 *   - the ONE clinical-language guard      -> ./researchIntake.mjs
 *   - the ONE EvidenceLedger propose seam  -> ../knowledgeApi.mjs (wired by api.mjs, not imported here)
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
import { descriptors as rdkitDescriptors } from '../compute/rdkitAdapter.mjs';
import { verifyScienceRun, VERDICT as REPLAY_VERDICT } from './verify.mjs';
import { assertNoClinicalLanguage } from './researchIntake.mjs';

export const VIRTUAL_LAB_CONTRACT_VERSION = '1.0.0';

export const VIRTUAL_EVENT = Object.freeze({
  PLANNED: 'VIRTUAL_EXPERIMENT_PLANNED',
  RESULT: 'VIRTUAL_EXPERIMENT_RESULT',
  REPLAY: 'VIRTUAL_EXPERIMENT_REPLAY',
  EVIDENCE_PROPOSED: 'VIRTUAL_EXPERIMENT_EVIDENCE_PROPOSED',
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
 *  today (multiFidelity.mjs). A capability absent from this set is a real toolchain member that
 *  may even be AVAILABLE at the raw-engine level, but has no wired campaign execution binding —
 *  BLOCKED_UNBOUND_ENGINE, never fabricated. */
const BOUND_CAPABILITIES = new Set(['molecular-descriptors', 'quantum-chemistry', 'molecular-docking', 'admet-estimation', 'toxicity-risk-estimation']);

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
  const linked = requireCampaignCandidate(db, campaignId, candidateId);
  if (!linked.ok) return linked;

  const plan = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.PLANNED && e.payload?.executionId === executionId);
  if (!plan || plan.payload?.candidateId !== candidateId) return { ok: false, error: 'plan_not_found' };

  const existingResult = findEvent(db, campaignId, (e) => e.type === VIRTUAL_EVENT.RESULT && e.payload?.executionId === executionId);
  if (existingResult) return { ok: true, deduped: true, eventId: existingResult.id, result: existingResult.payload };

  const gate = researchGateVerdict(db, campaignId, candidateId);
  if (gate.reason === 'SAFETY_VETO') {
    return persistResult(db, linked, plan.payload, { status: EXECUTION_STATUS.BLOCKED_INVALID_INPUT, reason: 'Research gate SAFETY_VETO at execution time.' });
  }

  const t0 = Date.now();
  const dispatch = dispatchExecution(db, { projectId: plan.payload.projectId, campaignId, candidateId }, linked.candidate, plan.payload.requestedCapability, plan.payload.params);
  const durationMs = Date.now() - t0;

  if (!dispatch.ok) {
    if (dispatch.blocked) return persistResult(db, linked, plan.payload, { status: dispatch.blocked, reason: dispatch.reason, executedBy });
    return persistResult(db, linked, plan.payload, { status: EXECUTION_STATUS.FAILED_ENGINE, reason: dispatch.reason ?? 'engine_failed', executedBy });
  }

  const run = dispatch.run;
  const tool = getTool(toolIdForCapability(plan.payload.requestedCapability));
  const epistemicClassification = assertAllowedEpistemicClassification(evaluateExpectation(run.outputs, plan.payload.expectation));
  const budgetExceeded = plan.payload.budget?.maxComputeSeconds != null && durationMs / 1000 > plan.payload.budget.maxComputeSeconds;

  return persistResult(db, linked, plan.payload, {
    status: EXECUTION_STATUS.EXECUTED,
    executedBy,
    scienceRunId: run.id,
    selectedEngine: tool ? { toolId: tool.toolId, engineName: tool.engineName, engineVersion: tool.version } : { toolId: null, engineName: run.engine, engineVersion: run.engineVersion },
    derivedOutput: run.outputs,
    epistemicClassification,
    limitations: [...(tool?.assumptions ? [tool.assumptions] : []), ...(budgetExceeded ? [`Measured compute time ${(durationMs / 1000).toFixed(2)}s exceeded the declared budget of ${plan.payload.budget.maxComputeSeconds}s.`] : [])],
    provenanceRefs: [`science-run:${run.id}`, ...(tool?.fingerprint ? [`toolchain:${tool.fingerprint}`] : [])],
    outputFingerprint: run.outputHash,
    durationMs,
  });
}

function toolIdForCapability(capabilityId) {
  const map = { 'molecular-descriptors': 'rdkit', 'quantum-chemistry': 'pyscf', 'molecular-docking': 'vina', 'admet-estimation': 'admet', 'toxicity-risk-estimation': 'toxicity' };
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
  if (!result) return { action: 'EXECUTE_VIRTUAL_EXPERIMENT', reason: 'PLANNED_NOT_EXECUTED' };

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

  const dossier = { contractVersion: VIRTUAL_LAB_CONTRACT_VERSION, campaignId, candidateId, candidate: linked.candidate, plans, results, replays, evidenceLinks, clinicalEfficacy: 'UNKNOWN', claimBoundary: CLAIM_BOUNDARY };
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
