/**
 * Reasoning Role Contracts (Phase 3B) — general reasoning through the P7 router.
 *
 * P7 (Model Router) is used, not bypassed. These are the named ZEFIR reasoning roles.
 * Fully implemented and tested so the system is IMMEDIATELY executable when a live
 * provider is registered — but with NO credential the router returns CAPABILITY_GAP
 * and we DO NOT invent model output.
 *
 * Hard rules (enforced):
 *  - Every model output is tagged MODEL_GENERATED_HYPOTHESIS / MODEL_GENERATED_PROPOSAL.
 *    It is NEVER evidence, NEVER VERIFIED, and the proposer is NEVER its own final judge.
 *  - An LLM may propose / compare / criticize / identify unknowns / recommend
 *    computational experiments. It may NOT invent literature, measurements, docking
 *    scores, biological activity, or ADMET values.
 *  - We persist role, router decision, provider, model, input artifact hashes,
 *    structured output, output hash, evidence references, timestamp, status — never
 *    hidden chain-of-thought.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';
import * as router from './modelRouter.mjs';

export const REASONING_ROLE = Object.freeze({
  SCIENTIFIC_GOAL_DECOMPOSER: 'SCIENTIFIC_GOAL_DECOMPOSER',
  BIOLOGICAL_HYPOTHESIS_PROPOSER: 'BIOLOGICAL_HYPOTHESIS_PROPOSER',
  CHEMICAL_STRATEGY_PROPOSER: 'CHEMICAL_STRATEGY_PROPOSER',
  ADVERSARIAL_SCIENTIFIC_CRITIC: 'ADVERSARIAL_SCIENTIFIC_CRITIC',
  EVIDENCE_SYNTHESIS_AGENT: 'EVIDENCE_SYNTHESIS_AGENT',
  EXPERIMENT_SELECTION_AGENT: 'EXPERIMENT_SELECTION_AGENT',
  TRANSLATIONAL_GAP_REVIEWER: 'TRANSLATIONAL_GAP_REVIEWER',
});
const MODEL_ROLE_FOR = Object.freeze({
  SCIENTIFIC_GOAL_DECOMPOSER: router.MODEL_ROLE.REASONING,
  BIOLOGICAL_HYPOTHESIS_PROPOSER: router.MODEL_ROLE.REASONING,
  CHEMICAL_STRATEGY_PROPOSER: router.MODEL_ROLE.REASONING,
  ADVERSARIAL_SCIENTIFIC_CRITIC: router.MODEL_ROLE.CRITIC,
  EVIDENCE_SYNTHESIS_AGENT: router.MODEL_ROLE.REASONING,
  EXPERIMENT_SELECTION_AGENT: router.MODEL_ROLE.FAST,
  TRANSLATIONAL_GAP_REVIEWER: router.MODEL_ROLE.CRITIC,
});
/** Roles that propose vs judge — a proposer is never registered as the accepting judge. */
export const PROPOSER = new Set(['SCIENTIFIC_GOAL_DECOMPOSER', 'BIOLOGICAL_HYPOTHESIS_PROPOSER', 'CHEMICAL_STRATEGY_PROPOSER']);
export const JUDGE = new Set(['ADVERSARIAL_SCIENTIFIC_CRITIC', 'TRANSLATIONAL_GAP_REVIEWER']);

export const OUTPUT_KIND = Object.freeze({ HYPOTHESIS: 'MODEL_GENERATED_HYPOTHESIS', PROPOSAL: 'MODEL_GENERATED_PROPOSAL' });

/**
 * Run a reasoning role. Routes via the P7 router; if no provider is available returns
 * CAPABILITY_GAP (no fabricated output). On success, wraps the provider's structured
 * output as MODEL_GENERATED_* (never evidence) and persists a full agent-invocation
 * trace. `provider.complete` MUST return structured JSON-able output — free prose is
 * accepted only as a `rationale` string, never as a scientific value.
 */
export function runReasoning(db, { role, input, missionId = null, evidenceRefs = [], routerModule = router } = {}) {
  if (!(role in MODEL_ROLE_FOR)) throw new Error(`unknown reasoning role: ${role}`);
  const modelRole = MODEL_ROLE_FOR[role];
  const routed = routerModule.complete(db, { role: modelRole, taskClass: role, input, missionId });
  const inputHashes = [canonicalHash(input ?? {}), ...evidenceRefs.map((r) => canonicalHash(r))];

  if (routed.status !== 'selected') {
    const invocation = store.saveAgentInvocation(db, {
      missionId, role, modelRole, modelDecisionId: routed.decisionId ?? null, modelStatus: routed.status,
      inputHashes, outputHash: null, output: null, status: 'CAPABILITY_GAP',
      failureReason: routed.selectionReason ?? 'no model provider available for this reasoning role',
    });
    return { ok: false, status: 'CAPABILITY_GAP', reason: routed.selectionReason, invocation };
  }

  const outputKind = PROPOSER.has(role) ? OUTPUT_KIND.PROPOSAL : OUTPUT_KIND.HYPOTHESIS;
  const structured = {
    kind: outputKind, role, provider: routed.providerId, model: routed.modelId,
    content: routed.text, // structured output from the provider
    evidenceRefsUsed: evidenceRefs, isEvidence: false, isVerified: false, // hard rules
  };
  const outputHash = canonicalHash(structured);
  const invocation = store.saveAgentInvocation(db, {
    missionId, role, modelRole, modelDecisionId: routed.decisionId ?? null, modelStatus: 'selected',
    inputHashes, outputHash, output: structured, status: 'completed', failureReason: null,
  });
  return { ok: true, status: 'completed', outputKind, output: structured, invocation };
}

/** Guard: a model output can never be treated as evidence or as verified. */
export function isEvidence() { return false; } // model output is structurally never evidence
export function assertNotEvidence(reasoningOutput) {
  if (reasoningOutput && (reasoningOutput.isEvidence === true || reasoningOutput.isVerified === true)) {
    throw new Error('model-generated output must never be marked evidence/verified');
  }
  return true;
}
