# Cognitive Ceiling — Milestone 7: Model Abstraction Layer & Router

**Priority 7.** Removes the assumption that one LLM performs every cognitive
function. Providers register against logical roles; the router selects by role +
policy and records every decision so it is fully traceable. Genesis is not
permanently bound to one provider. Additive schema `v9 → v10`. No Phase-1 code or
scientific engine touched.

## What was built

- **Schema v10** — `model_decisions` (append-only): mission link, role, task class,
  provider/model id, complexity, risk, selection reason, status, latency, tokens in/
  out, cost, timestamp. Idempotent forward migration; prior tables untouched.
- **`cognitive/modelRouter.mjs`**:
  - `MODEL_ROLE` — REASONING / CODE / FAST / CRITIC / VERIFIER.
  - Provider registry (`registerProvider` / `listProviders` / `resetProviders`).
    A provider declares `roles`, `available()`, `complete()`, and optional
    `priority` / `costPerKTokens`.
  - `route(db, {role, taskClass, complexity, risk, missionId})` — deterministic
    selection among AVAILABLE providers for the role (lowest priority, then cost,
    then id); records a traceable `model_decisions` row. No available provider →
    `BLOCKED_BY_RUNTIME` (registered but unavailable) or `CAPABILITY_GAP` (none
    registered) — never a fabricated completion.
  - `complete(db, {...})` — route then invoke the provider, recording measured
    latency + token usage (and cost) back onto the decision.
  - `anthropicProvider()` — the ONLY provider-specific code: present but honest —
    `available()` is false without `ANTHROPIC_API_KEY`, and it is never invoked in
    that state. Live completion is intentionally not wired in this milestone
    (abstraction + routing + telemetry only).

## Honesty

- Every model decision is persisted and traceable (provider, model, role, task
  class, latency, tokens, cost). Costs/latency are measured from real calls, never
  invented. Blocked routes are recorded as decisions too (auditable).
- This milestone builds the interface + router + telemetry. It does **not** claim
  live multi-provider reasoning; wiring real provider completions (and routing the
  Mission Planner / Hypothesis Engine / Critic Swarm through this layer to close
  their `CAPABILITY_GAP`s) is the integration step that follows.

## Verification

- `cognitiveModelRouter.test.mjs` — **8/8**: v10 migration; role routing + traceable
  decision; deterministic priority policy; BLOCKED_BY_RUNTIME with no completion;
  CAPABILITY_GAP when no provider; latency/token telemetry capture; Anthropic
  unavailable-without-key (never invoked); role validation.
- Full gate: backend **290/290** (0 skipped), frontend 601/601, build green,
  eslint clean.

## CAPABILITY_GAP (next)

- **Live provider completions** — the Anthropic adapter is key-gated and unwired;
  real calls require `ANTHROPIC_API_KEY` and a completion implementation.
- **Routing the cognitive modules through this layer** — the Mission Planner,
  Hypothesis Engine and Critic Swarm still use deterministic strategies; routing
  their reasoning-heavy steps through `MODEL_ROLE.REASONING/CRITIC` closes the
  general-domain gaps declared in Priorities 2/4/5.
