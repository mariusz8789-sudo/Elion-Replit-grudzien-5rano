/**
 * Model Abstraction Layer & Router (Priority 7 — cognitive ceiling).
 *
 * Removes the long-term assumption that one LLM performs every cognitive function.
 * Providers register against logical ROLES; the router selects a provider by role +
 * task class + complexity/risk/latency/cost policy, and records every decision so it
 * is fully traceable (which provider/model served which role, and its measured
 * cost/latency). No provider is hard-coded; Genesis is not permanently bound to one.
 *
 * Honesty:
 *  - A role with no AVAILABLE provider returns an explicit BLOCKED status — never a
 *    fabricated completion. The Anthropic adapter is present but reports unavailable
 *    without `ANTHROPIC_API_KEY` and is never invoked in that state (no network in
 *    tests). Live model performance is only recorded from real calls, never invented.
 *  - Every routing decision is persisted (when a db is supplied) to `model_decisions`.
 */
import * as store from '../store.mjs';

export const MODEL_ROLE = Object.freeze({
  REASONING: 'REASONING', // planning, decomposition, hypothesis generation
  CODE: 'CODE', // tool/code generation
  FAST: 'FAST', // cheap high-volume workers
  CRITIC: 'CRITIC', // adversarial criticism
  VERIFIER: 'VERIFIER', // verification reasoning
});
const ROLE_SET = new Set(Object.values(MODEL_ROLE));

export const ROUTE_STATUS = Object.freeze({
  SELECTED: 'selected', BLOCKED_BY_RUNTIME: 'BLOCKED_BY_RUNTIME', CAPABILITY_GAP: 'CAPABILITY_GAP',
});

/* ---------------- Provider registry ---------------- */

const registry = new Map(); // id -> provider

/**
 * A provider is: {
 *   id, modelId, roles: string[], priority?: number, costPerKTokens?: number,
 *   available(): boolean, complete({role, input}): { text, usage?: {tokensIn, tokensOut} }
 * }
 */
export function registerProvider(provider) {
  if (!provider?.id) throw new Error('provider.id required');
  if (!Array.isArray(provider.roles) || provider.roles.some((r) => !ROLE_SET.has(r))) {
    throw new Error(`provider.roles must be a subset of MODEL_ROLE for ${provider.id}`);
  }
  registry.set(provider.id, provider);
  return provider.id;
}
export function resetProviders() { registry.clear(); }
export function listProviders() {
  return [...registry.values()].map((p) => ({ id: p.id, modelId: p.modelId, roles: p.roles, available: safeAvailable(p) }));
}
function safeAvailable(p) { try { return Boolean(p.available()); } catch { return false; } }

/* ---------------- Routing ---------------- */

/**
 * Select a provider for a role under policy. Deterministic: among AVAILABLE providers
 * declaring the role, prefer lowest `priority` (default 100), then lowest cost, then
 * id (stable tiebreak). Records a decision when `db` is provided. Returns
 * { status, providerId?, modelId?, decisionId?, selectionReason }.
 */
export function route(db, { role, taskClass = null, complexity = 'medium', risk = 'low', missionId = null }) {
  if (!ROLE_SET.has(role)) throw new Error(`unknown role: ${role}`);
  const candidates = [...registry.values()].filter((p) => p.roles.includes(role) && safeAvailable(p));
  if (candidates.length === 0) {
    const anyDeclared = [...registry.values()].some((p) => p.roles.includes(role));
    const status = anyDeclared ? ROUTE_STATUS.BLOCKED_BY_RUNTIME : ROUTE_STATUS.CAPABILITY_GAP;
    const selectionReason = anyDeclared
      ? `provider(s) for role ${role} are registered but unavailable (e.g. missing API key)`
      : `no provider registered for role ${role}`;
    let decisionId = null;
    if (db) decisionId = store.saveModelDecision(db, { missionId, role, taskClass, providerId: 'none', complexity, risk, selectionReason, status }).id;
    return { status, selectionReason, decisionId };
  }
  candidates.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || (a.costPerKTokens ?? 0) - (b.costPerKTokens ?? 0) || a.id.localeCompare(b.id));
  const chosen = candidates[0];
  const selectionReason = `role ${role}: chose ${chosen.id} (priority ${chosen.priority ?? 100}, ${candidates.length} available)`;
  let decisionId = null;
  if (db) decisionId = store.saveModelDecision(db, { missionId, role, taskClass, providerId: chosen.id, modelId: chosen.modelId, complexity, risk, selectionReason, status: ROUTE_STATUS.SELECTED }).id;
  return { status: ROUTE_STATUS.SELECTED, providerId: chosen.id, modelId: chosen.modelId, decisionId, selectionReason };
}

/**
 * Route then invoke the chosen provider, recording measured latency + token usage
 * back onto the persisted decision. Returns { status, text?, usage?, decisionId, ... }.
 * Never fabricates output: if routing is blocked, returns the block unchanged.
 */
export function complete(db, { role, input, taskClass = null, complexity = 'medium', risk = 'low', missionId = null }) {
  const routed = route(db, { role, taskClass, complexity, risk, missionId });
  if (routed.status !== ROUTE_STATUS.SELECTED) return routed;
  const provider = registry.get(routed.providerId);
  const start = Date.now();
  const result = provider.complete({ role, input });
  const latencyMs = Date.now() - start;
  const usage = result?.usage ?? {};
  if (db && routed.decisionId) {
    store.updateModelDecision(db, routed.decisionId, {
      status: ROUTE_STATUS.SELECTED, latencyMs,
      tokensIn: usage.tokensIn ?? null, tokensOut: usage.tokensOut ?? null,
      cost: usage.cost ?? costOf(provider, usage),
    });
  }
  return { status: ROUTE_STATUS.SELECTED, providerId: routed.providerId, modelId: routed.modelId, decisionId: routed.decisionId, text: result?.text, usage, latencyMs };
}
function costOf(provider, usage) {
  const k = ((usage.tokensIn ?? 0) + (usage.tokensOut ?? 0)) / 1000;
  return provider.costPerKTokens != null ? provider.costPerKTokens * k : null;
}

/* ---------------- Built-in providers ---------------- */

/**
 * Anthropic adapter — present but honest: unavailable (and never invoked) without
 * ANTHROPIC_API_KEY. The live call is lazily loaded so this module never forces the
 * SDK import. This is the ONLY provider-specific code; the router itself is neutral.
 */
export function anthropicProvider({ modelId = process.env.GENESIS_AI_MODEL ?? 'claude-opus-4-8', roles = [MODEL_ROLE.REASONING, MODEL_ROLE.CRITIC, MODEL_ROLE.VERIFIER, MODEL_ROLE.CODE], priority = 10 } = {}) {
  return {
    id: 'anthropic',
    modelId,
    roles,
    priority,
    available: () => Boolean(process.env.ANTHROPIC_API_KEY),
    complete: () => { throw new Error('anthropic live completion is not wired in this milestone (Priority 7 = abstraction + routing + telemetry). Requires ANTHROPIC_API_KEY and is intentionally not invoked here.'); },
  };
}
