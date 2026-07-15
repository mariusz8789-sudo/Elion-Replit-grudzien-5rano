/**
 * Live Reasoning Brain (Live Discovery Brain, Phases 2 & 10).
 *
 * A capability-oriented layer over the provider-neutral modelRouter. The discovery system
 * requests CAPABILITIES (evidence synthesis, hypothesis generation, …), not a hardcoded
 * provider. Each request is recorded in a reasoning ledger with full provenance.
 *
 * HONESTY: with no configured live provider (this environment has no ANTHROPIC_API_KEY), every
 * reasoning capability returns CAPABILITY_BLOCKED / HUMAN_REVIEW_REQUIRED — never a fabricated
 * result. When a provider IS configured, its structured output is SCHEMA-VALIDATED and any
 * referenced evidence ID must exist in the supplied evidence context; malformed output or an
 * invented evidence ID is REJECTED and can never enter the scientific graph.
 */
import { canonicalHash } from '../provenance.mjs';
import * as router from './modelRouter.mjs';

export const CAPABILITY = Object.freeze({
  scientific_evidence_synthesis: { role: router.MODEL_ROLE.REASONING },
  hypothesis_generation: { role: router.MODEL_ROLE.REASONING },
  target_reasoning: { role: router.MODEL_ROLE.REASONING },
  contradiction_analysis: { role: router.MODEL_ROLE.VERIFIER },
  experimental_falsification_planning: { role: router.MODEL_ROLE.REASONING },
  scientific_critic: { role: router.MODEL_ROLE.CRITIC },
  dossier_synthesis: { role: router.MODEL_ROLE.REASONING },
});
export const REASONING_STATUS = Object.freeze({ COMPLETED: 'COMPLETED', CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED', HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED', REJECTED_INVALID_OUTPUT: 'REJECTED_INVALID_OUTPUT' });
export const CLAIM_LABEL = Object.freeze({ EVIDENCE_BACKED: 'EVIDENCE_BACKED', HYPOTHESIS: 'HYPOTHESIS', INFERENCE: 'INFERENCE', SPECULATION: 'SPECULATION', HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED' });

/**
 * Validate a structured reasoning output. Rejects: non-objects, outputs whose required keys
 * are missing, and any `evidenceId` reference not present in `allowedEvidenceIds`
 * (invented-source guard — a model cannot conjure evidence into the graph).
 */
export function validateReasoningOutput(output, { requiredKeys = [], allowedEvidenceIds = [] } = {}) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { valid: false, reason: 'output is not a structured object' };
  for (const k of requiredKeys) if (!(k in output)) return { valid: false, reason: `missing required key: ${k}` };
  const allowed = new Set(allowedEvidenceIds);
  const referenced = collectEvidenceIds(output);
  const invented = referenced.filter((id) => !allowed.has(id));
  if (invented.length) return { valid: false, reason: `references evidence IDs not in context (invented sources): ${invented.join(', ')}` };
  return { valid: true };
}
function collectEvidenceIds(obj, acc = []) {
  if (Array.isArray(obj)) { for (const x of obj) collectEvidenceIds(x, acc); return acc; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if ((k === 'evidenceId' || k === 'evidenceIds') && v != null) (Array.isArray(v) ? v : [v]).forEach((id) => acc.push(String(id)));
      else collectEvidenceIds(v, acc);
    }
  }
  return acc;
}

/**
 * Request a reasoning capability. Records a reasoning-ledger event (when a db/campaign is
 * given) and returns { status, label?, output?, ledgerId, provenance }. Never fabricates:
 * a blocked route yields CAPABILITY_BLOCKED with the exact missing capability.
 * opts: { db?, campaignId?, generation?, capability, input, evidenceContextIds=[],
 *         deterministicContextIds=[], requiredKeys=[], emit? }
 */
export function requestReasoning({ db = null, campaignId = null, generation = 0, capability, input = {}, evidenceContextIds = [], deterministicContextIds = [], requiredKeys = [], emit = null }) {
  const cap = CAPABILITY[capability];
  if (!cap) throw new Error(`unknown reasoning capability: ${capability}`);
  const requestHash = canonicalHash({ capability, input, evidenceContextIds, deterministicContextIds });
  const routed = db ? router.route(db, { role: cap.role, taskClass: capability }) : { status: 'CAPABILITY_GAP', selectionReason: 'no db/router context' };

  const ledgerBase = {
    capability, role: cap.role, requestHash, evidenceContextIds, deterministicContextIds,
    routeStatus: routed.status, routeReason: routed.selectionReason,
  };

  // No live provider selected → honest capability block. NEVER a fabricated completion.
  if (routed.status !== router.ROUTE_STATUS?.SELECTED && routed.status !== 'selected') {
    const step = { ...ledgerBase, status: REASONING_STATUS.CAPABILITY_BLOCKED, label: CLAIM_LABEL.HUMAN_REVIEW_REQUIRED, output: null, note: `no live provider for capability ${capability}; returned CAPABILITY_BLOCKED (result NOT fabricated)` };
    const ledgerId = record(emit, campaignId, generation, step);
    return { ...step, ledgerId };
  }

  // A provider IS available: complete, then SCHEMA-VALIDATE before anything enters the graph.
  const completion = router.complete(db, { role: cap.role, input, taskClass: capability });
  let output;
  try { output = typeof completion.text === 'string' ? JSON.parse(completion.text) : completion.text; } catch { output = null; }
  const v = validateReasoningOutput(output, { requiredKeys, allowedEvidenceIds: evidenceContextIds });
  if (!v.valid) {
    const step = { ...ledgerBase, status: REASONING_STATUS.REJECTED_INVALID_OUTPUT, label: CLAIM_LABEL.HUMAN_REVIEW_REQUIRED, output: null, note: `model output rejected: ${v.reason}` };
    const ledgerId = record(emit, campaignId, generation, step);
    return { ...step, ledgerId };
  }
  const step = { ...ledgerBase, status: REASONING_STATUS.COMPLETED, label: CLAIM_LABEL.HYPOTHESIS, output, provider: completion.providerId, responseHash: canonicalHash(output) };
  const ledgerId = record(emit, campaignId, generation, step);
  return { ...step, ledgerId };
}

function record(emit, campaignId, generation, step) {
  // emit is the V2 controller's (type, payload) sink; generation travels inside the payload.
  if (typeof emit === 'function') { const e = emit('REASONING_STEP', { ...step, generation }); return e?.id ?? null; }
  return null;
}
