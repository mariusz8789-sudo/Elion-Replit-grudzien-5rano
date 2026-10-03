/**
 * R1-a — ONE QUESTION, ONE RESEARCH RUN, ONE ID.
 *
 * Nothing here is a second system. A ResearchRun IS an agent run (agentRun.mjs) in the domain
 * RESEARCH_RUN_DOMAIN; its id is the agent run id; its history is the ENTITY-0 research-state chain
 * (agent_run_steps, hash-chained, re-verified on every read). The external model is reached only
 * through ENTITY-3 (reasoningProvider.mjs + claimProposal.mjs validation), and every hypothesis it
 * proposes is also stored in the project's ENTITY-2 knowledge registry as CLAIM_PROPOSED.
 *
 * R1-a covers the first two steps of the run:
 *   PROBLEM_FORMALIZED    the user's question, written by the server when the run is created
 *   HYPOTHESES_GENERATED  sub-problems, hypotheses, experiment proposals and next actions the model
 *                         PROPOSED; each hypothesis validated and degraded by ENTITY-3's rules, each
 *                         experiment judged by Genesis (decideExperimentProposal), nothing run
 * R1-b (researchRunExecution.mjs) adds the rest of one experiment, in the same chain:
 *   PREDICTIONS_FROZEN, EXPERIMENT_HANDOFF, SELF_FALSIFICATION, EVIDENCE_UPDATE, NEXT_EXPERIMENT.
 *
 * Guarantees:
 *  - the model can never set FACT / SUPPORTED: every item it returns is status PROPOSED,
 *    epistemicStatus NOT_EVIDENCE, with provenance (provider, model, adapter version, prompt and
 *    response fingerprints, run id);
 *  - everything is in SQLite, so a restarted server reads the run and knows its next step;
 *  - the same question asked again in the same project while its run is still RUNNING returns that
 *    run (and a client idempotency key always returns its run); the check and the insert happen in one
 *    write transaction, so two concurrent requests cannot both create one;
 *  - a run belongs to exactly one project: every read checks the project and the domain, and a run of
 *    another project is "not found", never shown;
 *  - clients cannot write this run's research state through the generic agent-runs route (api.mjs
 *    refuses it), so no event can bypass the validation below.
 * On any provider failure, malformed answer or conflict nothing is written and the run stays as it was.
 */
import { canonicalJson, fnv1a } from './determinism.mjs';
import { AGENT_RUN_STATUS, appendServerResearchStateEvent, createAgentRun, getAgentRun, listAgentRuns, readResearchState, updateAgentRunStatus } from './agentRun.mjs';
import { buildProposalPrompt, parseProposalText, validateClaimProposal } from './claimProposal.mjs';
import { recordClaimProposal } from './knowledgeRegistry.mjs';
import { REASONING_ADAPTER_VERSION, ReasoningProviderError } from './reasoningProvider.mjs';
import { executorPromptLines, MAX_PREDICTIONS, PREDICTION_OPERATORS } from './researchRunEngines.mjs';
import { researchRunProvenance } from './provenanceClass.mjs';

export const RESEARCH_RUN_DOMAIN = 'genesis.research-run';
export const RESEARCH_RUN_CONTRACT_VERSION = 'research-run@1';
export const MAX_SUB_PROBLEMS = 8;
export const MAX_HYPOTHESES = 6;
export const MAX_NEXT_ACTIONS = 6;

const STR = (v, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const normalizeQuestion = (q) => q.toLowerCase().replace(/\s+/g, ' ').trim();

export const RESEARCH_PLAN_SYSTEM_PROMPT = `You assist Genesis, a platform that runs and verifies computational experiments. You do not know anything as fact and you cannot run anything. You may only PROPOSE how to research the question.

Answer with exactly one JSON object and nothing else:
{
  "subProblems": [{ "question": string, "whyItMatters": string }],
  "hypotheses": [{
    "claim": string,
    "claimType": "HYPOTHESIS" | "PREDICTION" | "MECHANISM_PROPOSAL" | "OPEN_QUESTION",
    "assumptions": string[],
    "supportingEvidenceRefs": string[],
    "contradictingEvidenceRefs": string[],
    "missingEvidence": string[],
    "uncertainty": { "level": "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN", "statement": string },
    "falsificationProposal": string,
    "challengesHypothesisIndex": integer | null,
    "experimentProposal": null | { "engineId": string | null, "kind": "COMPUTATIONAL" | "BIOLOGICAL" | "WET_LAB" | "CLINICAL", "description": string, "parameters": object, "parameterChanges": [{ "target": string, "to": any }] }
  }],
  "nextActions": string[]
}

Rules:
1. Split the question into at most ${MAX_SUB_PROBLEMS} smaller sub-problems. Propose at most ${MAX_HYPOTHESES} hypotheses, including a null hypothesis where it makes sense.
2. Cite only evidence references from the list you are given, exactly as written. Never invent one.
3. Propose engines only from the list of engines you are given.
4. Never propose changing a preregistered threshold, gate or acceptance criterion.
5. Every falsificationProposal must say what observation would show the hypothesis is wrong.
6. If you do not know, say so in uncertainty. An honest UNKNOWN is a good answer.
7. Genesis can run an experiment itself only if its parameters give the engine's input and at most ${MAX_PREDICTIONS} machine-checkable predictions, each { "observable": string, "operator": ${PREDICTION_OPERATORS.map((o) => `"${o}"`).join(' | ')}, "value": number | boolean, "critical": boolean, "expectedValue"?: number, "surpriseTolerance"?: positive number }, naming only these engines and observables:
${executorPromptLines().join('\n')}
   Predictions are frozen before the engine runs and cannot be changed afterwards. expectedValue and surpriseTolerance are optional, must be supplied together for numeric observables, and define only the deterministic anomaly rule abs(observed - expectedValue) > surpriseTolerance. They are not confidence or uncertainty intervals.
8. challengesHypothesisIndex is null unless this hypothesis is an explicit attempt to falsify an earlier hypothesis in this same array. It may reference only a lower array index. The relationship is a proposal, never evidence.`;

/* ---------------- identity, isolation, dedupe ---------------- */

/** The same question (and key) in the same project is the same dedupe key; another project never shares it. */
export function researchRunDedupeKey(projectId, question, idempotencyKey = null) {
  return `rr-${fnv1a(canonicalJson({ projectId, question: normalizeQuestion(question), idempotencyKey: idempotencyKey ?? null }))}`;
}

/** A run of this project and this domain, or null. Never returns another project's run. */
function ownRun(db, projectId, runId) {
  const run = typeof runId === 'string' ? getAgentRun(db, runId) : null;
  return run && run.projectId === projectId && run.domain === RESEARCH_RUN_DOMAIN ? run : null;
}

export function inWriteTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec(out?.ok === false ? 'ROLLBACK' : 'COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/* ---------------- read and resume ---------------- */

/** The run's experiments, one entry per experiment id, in the order they were frozen. */
export function experimentsOf(researchState) {
  const byId = new Map();
  const slot = { PREDICTIONS_FROZEN: 'frozen', EXPERIMENT_HANDOFF: 'execution', SELF_FALSIFICATION: 'falsification', EVIDENCE_UPDATE: 'evidence', NEXT_EXPERIMENT: 'next', EXPERIMENT_CONTINUED: 'continuedFrom' };
  for (const e of researchState.events) {
    const key = slot[e?.type];
    const id = e?.payload?.experimentId;
    if (!key || !id) continue;
    if (!byId.has(id)) byId.set(id, { experimentId: id, frozen: null, execution: null, falsification: null, evidence: null, next: null, continuedFrom: null });
    const experiment = byId.get(id);
    // The first record of a step is the record. A later second one (a changed criterion, a rewritten verdict) never
    // replaces it; it is kept aside as a conflict that stops the run (nextStepOf) instead of silently changing history.
    if (experiment[key]) { (experiment.conflicts ??= []).push({ step: key, seq: e.seq }); continue; }
    experiment[key] = e.payload;
  }
  return [...byId.values()];
}

/** What the run should do next, derived only from its persisted, verified state. */
export function nextStepOf(run, researchState) {
  if (!researchState.chain.ok) return 'STATE_INTEGRITY_FAILURE';
  if (run.status !== AGENT_RUN_STATUS.RUNNING) return 'NONE';
  const types = new Set(researchState.events.map((e) => e.type));
  if (!types.has('PROBLEM_FORMALIZED')) return 'FORMALIZE_PROBLEM';
  if (!types.has('HYPOTHESES_GENERATED')) return 'PROPOSE_PLAN';
  const experiments = experimentsOf(researchState);
  if (experiments.some((x) => x.conflicts?.length)) return 'STATE_INTEGRITY_FAILURE';
  const open = experiments.find((x) => !x.next);
  if (open) return !open.execution ? 'EXECUTE_EXPERIMENT' : !open.evidence ? 'PROPOSE_EVIDENCE' : 'PROPOSE_NEXT_EXPERIMENT';
  const last = experiments.at(-1);
  if (!last) return 'AWAITING_EXECUTION';
  return last.next.proposal?.action === 'EXECUTE_NEXT_HYPOTHESIS' ? 'AWAITING_EXECUTION' : 'AWAITING_HUMAN_REVIEW';
}

/**
 * Tail truncation cannot be seen by the hash chain alone: every prefix of a valid chain is valid. Scientific
 * Memory (`experiment_records`, append-only by DB trigger) is written in the SAME transaction as the chain event
 * that names it, so every preregistration of this run must be named by a PREDICTIONS_FROZEN event and every
 * sealed session by a SELF_FALSIFICATION event. A record the chain does not account for means the chain lost
 * its tail: the run is reported broken (fail closed) instead of resuming and executing the engine again.
 */
export function anchoredResearchState(db, runId, state = readResearchState(db, runId)) {
  if (!state.chain.ok) return state;
  const prefix = `research-run:${runId}:`;
  const records = db.prepare('SELECT id, kind FROM experiment_records WHERE substr(campaign_id, 1, ?) = ?').all(prefix.length, prefix);
  if (records.length === 0) return state;
  const named = new Set(state.events.flatMap((e) => (
    e.type === 'PREDICTIONS_FROZEN' ? [e.payload?.preregistrationRecordId] : e.type === 'SELF_FALSIFICATION' ? [e.payload?.sealRecordId] : []
  )));
  const unaccounted = records.filter((r) => ['PREREGISTRATION', 'SESSION'].includes(r.kind) && !named.has(r.id));
  if (unaccounted.length === 0) return state;
  return {
    ...state,
    chain: { ok: false, length: state.events.length, head: null, brokenAt: state.events.length, reason: 'chain_truncated_behind_scientific_memory', unaccountedRecordIds: unaccounted.map((r) => r.id) },
  };
}

function view(db, run) {
  const researchState = anchoredResearchState(db, run.id);
  const last = (type) => researchState.events.filter((e) => e?.type === type).at(-1)?.payload ?? null;
  const literatureSnapshots = researchState.events.filter((event) => event?.type === 'KNOWLEDGE_SNAPSHOT').map((event) => event.payload);
  const plan = last('HYPOTHESES_GENERATED');
  const experiments = experimentsOf(researchState);
  return {
    researchRunId: run.id,
    run,
    question: last('PROBLEM_FORMALIZED')?.question ?? run.goal,
    problem: last('PROBLEM_FORMALIZED'),
    plan,
    literatureSnapshots,
    experiments,
    provenance: researchRunProvenance({ plan, literatureSnapshots, experiments }),
    researchState,
    nextStep: nextStepOf(run, researchState),
  };
}

export function getResearchRun(db, projectId, runId) {
  const run = ownRun(db, projectId, runId);
  return run ? view(db, run) : null;
}

export function listResearchRuns(db, projectId) {
  return listAgentRuns(db, projectId).filter((r) => r.domain === RESEARCH_RUN_DOMAIN).map((run) => {
    const v = view(db, run);
    return { researchRunId: v.researchRunId, question: v.question, status: run.status, nextStep: v.nextStep, events: v.researchState.events.length, createdAt: run.createdAt };
  });
}

const CONTROL_TRANSITIONS = Object.freeze({
  PAUSE: { from: [AGENT_RUN_STATUS.RUNNING], to: AGENT_RUN_STATUS.PAUSED },
  RESUME: { from: [AGENT_RUN_STATUS.PAUSED], to: AGENT_RUN_STATUS.RUNNING },
  CANCEL: { from: [AGENT_RUN_STATUS.RUNNING, AGENT_RUN_STATUS.PAUSED], to: AGENT_RUN_STATUS.CANCELLED },
});

/**
 * Controls the canonical AgentRun behind a ResearchRun. The transition is recorded in the same
 * verified research-state chain before the status changes, so pause/resume/cancel survive restart
 * and remain attributable without a second scheduler or lifecycle store.
 */
export function controlResearchRun(db, projectId, runId, action, { userId = null, reason = null } = {}) {
  const normalized = typeof action === 'string' ? action.trim().toUpperCase() : '';
  const transition = CONTROL_TRANSITIONS[normalized];
  if (!transition) return { ok: false, status: 'INVALID_CONTROL_ACTION' };
  return inWriteTransaction(db, () => {
    const run = ownRun(db, projectId, runId);
    if (!run) return { ok: false, status: 'NOT_FOUND' };
    const state = anchoredResearchState(db, run.id);
    if (!state.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', chain: state.chain };
    if (!transition.from.includes(run.status)) {
      return { ok: false, status: 'INVALID_CONTROL_TRANSITION', from: run.status, action: normalized };
    }
    const appended = appendServerResearchStateEvent(db, run.id, 'RUN_CONTROLLED', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      researchRunId: run.id,
      action: normalized,
      fromStatus: run.status,
      toStatus: transition.to,
      reason: STR(reason, 500),
      actor: { kind: 'USER', userId },
    });
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    updateAgentRunStatus(db, run.id, transition.to);
    return { ok: true, status: transition.to, researchRun: getResearchRun(db, projectId, run.id) };
  });
}

export function researchSteeringOf(researchState) {
  const abandoned = new Set();
  let focusedHypothesisId = null;
  const context = [];
  for (const event of researchState?.events ?? []) {
    if (event?.type !== 'RESEARCH_STEERING') continue;
    const payload = event.payload ?? {};
    if (payload.action === 'FOCUS_HYPOTHESIS') focusedHypothesisId = payload.hypothesisId;
    if (payload.action === 'ABANDON_HYPOTHESIS') {
      abandoned.add(payload.hypothesisId);
      if (focusedHypothesisId === payload.hypothesisId) focusedHypothesisId = null;
    }
    if (payload.action === 'RESTORE_HYPOTHESIS') abandoned.delete(payload.hypothesisId);
    if (payload.action === 'ADD_CONTEXT') context.push({ text: payload.text, eventSeq: event.seq });
  }
  return { focusedHypothesisId, abandonedHypothesisIds: [...abandoned].sort(), context };
}

const STEERING_ACTIONS = new Set(['FOCUS_HYPOTHESIS', 'ABANDON_HYPOTHESIS', 'RESTORE_HYPOTHESIS', 'ADD_CONTEXT']);

/** Appends human steering to the canonical ResearchRun chain; it never rewrites the frozen plan. */
export function steerResearchRun(db, projectId, runId, input, { userId = null } = {}) {
  const action = typeof input?.action === 'string' ? input.action.trim().toUpperCase() : '';
  if (!STEERING_ACTIONS.has(action)) return { ok: false, status: 'INVALID_STEERING_ACTION' };
  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current) return { ok: false, status: 'NOT_FOUND' };
    if (!current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    if (current.run.status !== AGENT_RUN_STATUS.RUNNING) return { ok: false, status: 'RUN_NOT_STEERABLE', reason: current.run.status };
    if (!current.plan) return { ok: false, status: 'RUN_NOT_STEERABLE', reason: 'PLAN_NOT_AVAILABLE' };
    const hypothesisId = STR(input?.hypothesisId, 200);
    const text = STR(input?.text, 2000);
    if (action === 'ADD_CONTEXT' ? !text : !hypothesisId) return { ok: false, status: 'INVALID_STEERING_INPUT' };
    if (hypothesisId && !current.plan.hypotheses.some((hypothesis) => hypothesis.hypothesisId === hypothesisId)) {
      return { ok: false, status: 'HYPOTHESIS_NOT_FOUND' };
    }
    const appended = appendServerResearchStateEvent(db, runId, 'RESEARCH_STEERING', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      researchRunId: runId,
      action,
      hypothesisId,
      text,
      actor: { kind: 'USER', userId },
    });
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    const researchRun = getResearchRun(db, projectId, runId);
    return { ok: true, status: 'RECORDED', steering: researchSteeringOf(researchRun.researchState), researchRun };
  });
}

/* ---------------- start ---------------- */

/**
 * Creates the run and its PROBLEM_FORMALIZED event in one transaction, or returns the run that
 * already answers this question (deduped). Returns { ok, deduped, researchRun } or { ok:false, error }.
 */
export function startResearchRun(db, projectId, input, { userId = null } = {}) {
  const question = STR(input?.question, 4000);
  if (!question) return { ok: false, error: 'invalid_research_run', reason: 'question' };
  const idempotencyKey = STR(input?.idempotencyKey, 200);
  const dedupeKey = researchRunDedupeKey(projectId, question, idempotencyKey);

  return inWriteTransaction(db, () => {
    const existing = listAgentRuns(db, projectId).find((r) => r.domain === RESEARCH_RUN_DOMAIN
      && r.budget?.dedupeKey === dedupeKey
      && (idempotencyKey || r.status === AGENT_RUN_STATUS.RUNNING));
    if (existing) return { ok: true, deduped: true, researchRun: view(db, existing) };

    const run = createAgentRun(db, {
      projectId, goal: question, domain: RESEARCH_RUN_DOMAIN, createdBy: userId,
      budget: { contractVersion: RESEARCH_RUN_CONTRACT_VERSION, dedupeKey, idempotencyKey },
    });
    const appended = appendServerResearchStateEvent(db, run.id, 'PROBLEM_FORMALIZED', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      researchRunId: run.id,
      projectId,
      question,
      problemId: dedupeKey,
      problemFingerprint: fnv1a(canonicalJson({ question })),
      origin: { kind: 'USER_QUESTION', userId },
    });
    if (!appended.ok) return { ok: false, error: appended.error };
    return { ok: true, deduped: false, researchRun: view(db, getAgentRun(db, run.id)) };
  });
}

/* ---------------- the model proposes ---------------- */

/** Validates the model's plan. Pure apart from ENTITY-3's evidence lookups. Nothing here is stored. */
export function validateResearchPlan(value, { db, projectId, selfModel, question, researchRunId }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: 'not_an_object' };
  const rejected = [];

  const subProblems = [];
  for (const [index, sp] of (Array.isArray(value.subProblems) ? value.subProblems : []).entries()) {
    const q = STR(typeof sp === 'string' ? sp : sp?.question, 1000);
    if (!q) { rejected.push({ kind: 'SUB_PROBLEM', index, reason: 'missing_question' }); continue; }
    if (subProblems.length >= MAX_SUB_PROBLEMS) { rejected.push({ kind: 'SUB_PROBLEM', index, reason: 'over_limit' }); continue; }
    subProblems.push({ subProblemId: `sp-${fnv1a(canonicalJson({ researchRunId, q }))}`, question: q, whyItMatters: STR(sp?.whyItMatters, 1000), status: 'PROPOSED', epistemicStatus: 'NOT_EVIDENCE' });
  }

  const hypotheses = [];
  const hypothesesByInputIndex = new Map();
  for (const [index, h] of (Array.isArray(value.hypotheses) ? value.hypotheses : []).entries()) {
    if (hypotheses.length >= MAX_HYPOTHESES) { rejected.push({ kind: 'HYPOTHESIS', index, reason: 'over_limit' }); continue; }
    const hypothesisId = `hyp-${fnv1a(canonicalJson({ researchRunId, index, claim: STR(h?.claim) }))}`;
    const v = validateClaimProposal(h, { db, projectId, selfModel, question, hypothesisId });
    if (!v.ok) { rejected.push({ kind: 'HYPOTHESIS', index, reason: v.reason }); continue; }
    let proposal = v.proposal;
    const challengeIndex = h?.challengesHypothesisIndex;
    if (challengeIndex !== undefined && challengeIndex !== null) {
      const challenged = Number.isInteger(challengeIndex) && challengeIndex >= 0 && challengeIndex < index
        ? hypothesesByInputIndex.get(challengeIndex)
        : null;
      if (challenged) {
        proposal = { ...proposal, challengesHypothesisId: challenged.hypothesisId };
      } else {
        proposal = {
          ...proposal,
          degradations: [...proposal.degradations, {
            field: 'challengesHypothesisIndex',
            from: challengeIndex,
            to: null,
            reason: 'CHALLENGE_MUST_REFERENCE_AN_ACCEPTED_EARLIER_HYPOTHESIS',
          }],
        };
      }
    }
    hypotheses.push(proposal);
    hypothesesByInputIndex.set(index, proposal);
  }

  const nextActions = (Array.isArray(value.nextActions) ? value.nextActions : [])
    .map((a) => STR(a, 500)).filter(Boolean).slice(0, MAX_NEXT_ACTIONS)
    .map((action) => ({ action, status: 'PROPOSED', epistemicStatus: 'NOT_EVIDENCE' }));

  if (hypotheses.length === 0) return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: 'no_valid_hypothesis', rejected };
  return { ok: true, subProblems, hypotheses, nextActions, rejected };
}

const PROVIDER_FAILURE = { NOT_CONFIGURED: 'BLOCKED_BY_PROVIDER_CONFIGURATION', TIMEOUT: 'PROVIDER_TIMEOUT', REFUSED: 'PROVIDER_REFUSED', UPSTREAM: 'PROVIDER_ERROR' };

function evidenceRefsOf(db, projectId) {
  return [
    ...db.prepare('SELECT id FROM experiment_records WHERE project_id = ? ORDER BY created_at DESC LIMIT 20').all(projectId).map((r) => `experiment_record:${r.id}`),
    ...db.prepare("SELECT id FROM science_runs WHERE project_id = ? AND status = 'ok' ORDER BY created_at DESC LIMIT 20").all(projectId).map((r) => `science_run:${r.id}`),
  ];
}

/**
 * Asks the external model for a research plan once per run. A run that already has its plan returns it
 * without calling the model again (resume and retry are free and cannot duplicate proposals).
 */
export async function proposeResearchPlan(db, projectId, runId, { provider, selfModel = null, userId = null, timeoutMs } = {}) {
  const before = getResearchRun(db, projectId, runId);
  if (!before) return { ok: false, status: 'NOT_FOUND' };
  if (!before.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', chain: before.researchState.chain };
  if (before.plan) return { ok: true, status: 'PROPOSED', deduped: true, researchRun: before };
  if (before.nextStep !== 'PROPOSE_PLAN') return { ok: false, status: 'RUN_NOT_PROPOSABLE', reason: before.nextStep };
  if (!provider?.configured) return { ok: false, status: 'BLOCKED_BY_PROVIDER_CONFIGURATION', reason: provider?.reason ?? 'NO_PROVIDER' };

  const question = before.question;
  const literature = before.literatureSnapshots.at(-1);
  const literatureLines = literature ? [
    '',
    'Literature metadata available for context only (NOT_EVIDENCE; never copy these ids into evidence reference fields):',
    ...[...literature.primary.sources, ...literature.contradictionSearch.sources]
      .filter((source, index, all) => all.findIndex((candidate) => candidate.sourceId === source.sourceId) === index)
      .slice(0, 20)
      .map((source) => `- ${source.sourceId}: ${source.title} [licence=${source.licenceStatus}]`),
    `Contradiction-search candidates: ${literature.contradictionSearch.sources.length}; every relationship remains PROPOSED/UNKNOWN until reviewed.`,
  ] : [];
  const prompt = [
    buildProposalPrompt({ question, hypothesisId: null, evidenceRefs: evidenceRefsOf(db, projectId), selfModel }),
    ...literatureLines,
    '',
    `Research run: ${runId}`,
  ].join('\n');
  let completion;
  try {
    completion = await provider.complete({ system: RESEARCH_PLAN_SYSTEM_PROMPT, prompt, ...(timeoutMs ? { timeoutMs } : {}) });
  } catch (err) {
    const code = err instanceof ReasoningProviderError ? err.code : 'UPSTREAM';
    return { ok: false, status: PROVIDER_FAILURE[code] ?? 'PROVIDER_ERROR', reason: code };
  }
  const parsed = parseProposalText(completion?.text);
  if (!parsed.ok) return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: parsed.reason };
  const plan = validateResearchPlan(parsed.value, { db, projectId, selfModel, question, researchRunId: runId });
  if (!plan.ok) return plan;

  const generatedBy = {
    kind: 'EXTERNAL_REASONING_MODEL', providerId: provider.providerId, model: completion.model ?? provider.model, version: REASONING_ADAPTER_VERSION,
    promptFingerprint: fnv1a(canonicalJson({ system: RESEARCH_PLAN_SYSTEM_PROMPT, prompt })),
    responseFingerprint: fnv1a(completion.text),
  };
  const hypotheses = plan.hypotheses.map((h) => ({
    ...h,
    proposalId: `claim-${fnv1a(canonicalJson({ researchRunId: runId, proposal: h, generatedBy }))}`,
    researchRunId: runId,
    generatedBy,
  }));

  // One write transaction: the plan and its registry entries land together or not at all, and a
  // concurrent request that got here first wins (ours is discarded, no duplicate).
  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current || !current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    if (current.plan) return { ok: true, status: 'PROPOSED', deduped: true, researchRun: current };
    const appended = appendServerResearchStateEvent(db, runId, 'HYPOTHESES_GENERATED', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      researchRunId: runId,
      question,
      subProblems: plan.subProblems.map((s) => ({ ...s, researchRunId: runId, generatedBy })),
      hypotheses,
      nextActions: plan.nextActions.map((a) => ({ ...a, researchRunId: runId, generatedBy })),
      rejected: plan.rejected,
      generatedBy,
      status: 'PROPOSED',
      epistemicStatus: 'NOT_EVIDENCE',
    });
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    for (const h of hypotheses) {
      const stored = recordClaimProposal(db, projectId, h, userId);
      if (!stored.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'knowledge_registry' };
    }
    return { ok: true, status: 'PROPOSED', deduped: false, researchRun: getResearchRun(db, projectId, runId) };
  });
}
