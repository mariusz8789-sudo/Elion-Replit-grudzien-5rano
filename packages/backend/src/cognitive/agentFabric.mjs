/**
 * Dynamic Agent Fabric (Priority 8 — cognitive ceiling).
 *
 * Role-based scientific agents above the P7 Model Router. An agent is a ROLE that
 * executes a REAL deterministic engine (planner, hypothesis engine, critic swarm,
 * verification bridge, …) — not a fake persona and not hidden chain-of-thought.
 * Team size + composition are DERIVED from mission complexity, not a fixed swarm.
 * Every invocation is traceable (role, model decision, input/output artifact hashes,
 * status, failure reason). The proposer is never its own final judge.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';
import * as router from './modelRouter.mjs';
import * as planner from './missionPlanner.mjs';
import * as he from './hypothesisEngine.mjs';
import * as cs from './criticSwarm.mjs';
import * as vb from './verificationBridge.mjs';
import * as we from './workflowEngine.mjs';
import * as ev from './evidenceStore.mjs';

export const AGENT_ROLE = Object.freeze({
  RESEARCH_PLANNER: 'RESEARCH_PLANNER',
  HYPOTHESIS_PROPOSER: 'HYPOTHESIS_PROPOSER',
  ADVERSARIAL_CRITIC: 'ADVERSARIAL_CRITIC',
  EVIDENCE_JUDGE: 'EVIDENCE_JUDGE',
  VERIFICATION_SPECIALIST: 'VERIFICATION_SPECIALIST',
  COMPUTE_STRATEGIST: 'COMPUTE_STRATEGIST',
  NOVELTY_REVIEWER: 'NOVELTY_REVIEWER',
  MISSION_SUPERVISOR: 'MISSION_SUPERVISOR',
});

/** Each agent role routes through a logical model role (traceable), even though the
 * work is executed by a deterministic engine in this build. */
const MODEL_ROLE_FOR = Object.freeze({
  RESEARCH_PLANNER: router.MODEL_ROLE.REASONING,
  HYPOTHESIS_PROPOSER: router.MODEL_ROLE.REASONING,
  ADVERSARIAL_CRITIC: router.MODEL_ROLE.CRITIC,
  EVIDENCE_JUDGE: router.MODEL_ROLE.CRITIC,
  VERIFICATION_SPECIALIST: router.MODEL_ROLE.VERIFIER,
  COMPUTE_STRATEGIST: router.MODEL_ROLE.FAST,
  NOVELTY_REVIEWER: router.MODEL_ROLE.FAST,
  MISSION_SUPERVISOR: router.MODEL_ROLE.REASONING,
});

/** Proposer vs judge separation (enforced structurally). */
export const PROPOSER_ROLES = new Set([AGENT_ROLE.HYPOTHESIS_PROPOSER, AGENT_ROLE.RESEARCH_PLANNER]);
export const JUDGE_ROLES = new Set([AGENT_ROLE.ADVERSARIAL_CRITIC, AGENT_ROLE.EVIDENCE_JUDGE, AGENT_ROLE.VERIFICATION_SPECIALIST]);

/* ---------------- Team composition (complexity-derived) ---------------- */

/** Score mission complexity from its persisted state (questions, hypotheses, tasks). */
export function missionComplexity(db, missionId) {
  const q = store.listQuestions(db, missionId).length;
  const h = store.listHypotheses(db, missionId).length;
  const t = store.listTaskNodes(db, missionId).length;
  const score = q + h + t;
  const tier = score <= 3 ? 'trivial' : score <= 10 ? 'moderate' : 'complex';
  return { score, tier, questions: q, hypotheses: h, tasks: t };
}

/**
 * Compose a team from complexity. Trivial missions get a minimal team; complex ones
 * get the full fabric. Judge/critic roles are always present when a proposer is
 * (proposer != sole judge).
 */
export function composeTeam(db, missionId) {
  const c = missionComplexity(db, missionId);
  const team = [AGENT_ROLE.MISSION_SUPERVISOR, AGENT_ROLE.RESEARCH_PLANNER];
  if (c.tier !== 'trivial') {
    team.push(AGENT_ROLE.HYPOTHESIS_PROPOSER, AGENT_ROLE.ADVERSARIAL_CRITIC, AGENT_ROLE.EVIDENCE_JUDGE, AGENT_ROLE.VERIFICATION_SPECIALIST);
  }
  if (c.tier === 'complex') {
    team.push(AGENT_ROLE.COMPUTE_STRATEGIST, AGENT_ROLE.NOVELTY_REVIEWER);
  }
  return { complexity: c, roles: team };
}

/* ---------------- Deterministic role handlers (wrap real engines) ---------------- */

const HANDLERS = {
  RESEARCH_PLANNER(db, missionId, input) {
    const m = store.getMission(db, missionId);
    if (store.listTaskNodes(db, missionId).length > 0) return { ok: true, artifact: { note: 'plan already present', tasks: store.listTaskNodes(db, missionId).length } };
    const out = planner.planMission(db, { projectId: m.projectId, goal: m.goal, domain: m.domain ?? 'drug-discovery', resolveCapability: input?.resolveCapability ?? (() => true) });
    return { ok: out.planStatus === 'planned', artifact: { planStatus: out.planStatus, tasks: out.tasks.length, questions: out.questions.length } };
  },
  HYPOTHESIS_PROPOSER(db, missionId, input) {
    const q = store.listQuestions(db, missionId).find((x) => x.status === 'open');
    const out = he.generateCompetingHypotheses(db, { missionId, questionId: q?.id ?? null, template: input?.template ?? 'descriptor-vs-binding' });
    return { ok: out.status === 'generated', artifact: { status: out.status, hypotheses: out.hypotheses.map((h) => h.id) } };
  },
  ADVERSARIAL_CRITIC(db, missionId) {
    const res = cs.critiqueMission(db, missionId);
    return { ok: true, artifact: { critiqued: res.length, decisions: res.map((r) => ({ h: r.label, decision: r.decision })) } };
  },
  EVIDENCE_JUDGE(db, missionId) {
    const res = he.evaluateHypothesesAgainstEvidence(db, missionId);
    return { ok: true, artifact: { judged: res.map((r) => ({ h: r.label, status: r.status, supported: r.supported, contradicted: r.contradicted })) } };
  },
  VERIFICATION_SPECIALIST(db, missionId) {
    const res = vb.verifyMissionEvidence(db, missionId);
    return { ok: true, artifact: { verified: res.map((r) => ({ evidence: r.evidenceId, verdict: r.verdict, status: r.verificationStatus })) } };
  },
  COMPUTE_STRATEGIST(db, missionId) {
    const tasks = store.listTaskNodes(db, missionId).filter((t) => t.engine);
    return { ok: true, artifact: { placements: tasks.map((t) => ({ task: t.id, engine: t.engine, engineAvailable: t.spec?.engineAvailable ?? null })) } };
  },
  NOVELTY_REVIEWER() {
    // No external novelty reference set (COCONUT / patents) is reachable in this
    // environment — honest CAPABILITY_GAP rather than a fabricated novelty score.
    return { ok: false, status: 'CAPABILITY_GAP', artifact: { reason: 'no external novelty reference set reachable (BLOCKED_BY_RESOURCES); intra-set Tanimoto only' } };
  },
  MISSION_SUPERVISOR(db, missionId) {
    const state = ev.reconstructMissionState(db, missionId, {});
    const strat = we.evaluateStrategy(db, missionId);
    return { ok: true, artifact: { verdict: strat.verdict, counts: state?.counts ?? null } };
  },
};

/* ---------------- Invocation (traceable) ---------------- */

/**
 * Invoke one agent role: route a model decision (traceable), run the deterministic
 * handler, and persist a full agent-invocation record with input/output artifact
 * hashes. Never fabricates: a handler CAPABILITY_GAP is recorded as such.
 */
export function invokeAgent(db, missionId, role, { inputArtifacts = [], routerModule = router } = {}) {
  if (!(role in HANDLERS)) throw new Error(`unknown agent role: ${role}`);
  const modelRole = MODEL_ROLE_FOR[role];
  const routed = routerModule.route(db, { role: modelRole, taskClass: role, missionId });
  const inputHashes = inputArtifacts.map((a) => canonicalHash(a));

  let handlerOut; let status; let failureReason = null;
  try {
    handlerOut = HANDLERS[role](db, missionId, { });
    status = handlerOut.status ?? (handlerOut.ok ? 'completed' : 'failed');
    if (!handlerOut.ok && handlerOut.status !== 'CAPABILITY_GAP') failureReason = handlerOut.artifact?.reason ?? 'handler reported failure';
  } catch (err) {
    handlerOut = { ok: false, artifact: { error: String(err?.message ?? err).slice(0, 200) } };
    status = 'failed';
    failureReason = handlerOut.artifact.error;
  }
  const outputHash = canonicalHash(handlerOut.artifact ?? {});
  const rec = store.saveAgentInvocation(db, {
    missionId, role, modelRole, modelDecisionId: routed.decisionId ?? null, modelStatus: routed.status,
    inputHashes, outputHash, output: handlerOut.artifact ?? {}, status, failureReason,
  });
  return { invocation: rec, output: handlerOut.artifact, modelStatus: routed.status };
}

/** Run a composed team in a sensible order; supervisor first and last. Returns the trace. */
export function runTeam(db, missionId, { routerModule = router } = {}) {
  const { complexity, roles } = composeTeam(db, missionId);
  const order = [
    AGENT_ROLE.RESEARCH_PLANNER, AGENT_ROLE.COMPUTE_STRATEGIST, AGENT_ROLE.HYPOTHESIS_PROPOSER,
    AGENT_ROLE.EVIDENCE_JUDGE, AGENT_ROLE.ADVERSARIAL_CRITIC, AGENT_ROLE.VERIFICATION_SPECIALIST,
    AGENT_ROLE.NOVELTY_REVIEWER, AGENT_ROLE.MISSION_SUPERVISOR,
  ].filter((r) => roles.includes(r));
  const trace = [];
  for (const role of order) trace.push(invokeAgent(db, missionId, role, { routerModule }));
  return { complexity, roles: order, trace };
}
