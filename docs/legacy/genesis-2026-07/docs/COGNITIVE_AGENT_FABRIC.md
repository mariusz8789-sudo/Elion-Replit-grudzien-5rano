# Cognitive Ceiling — Milestone 8: Dynamic Agent Fabric

**Priority 8.** Role-based scientific agents above the P7 Model Router. An agent is
a ROLE that executes a REAL deterministic engine (planner, hypothesis engine,
critic swarm, verification bridge) — not a fake persona, not hidden chain-of-thought.
Additive schema `v10 → v11`. No Phase-1 code or scientific engine touched.

## What was built (`cognitive/agentFabric.mjs`, schema v11 `agent_invocations`)

- **8 roles**: RESEARCH_PLANNER, HYPOTHESIS_PROPOSER, ADVERSARIAL_CRITIC,
  EVIDENCE_JUDGE, VERIFICATION_SPECIALIST, COMPUTE_STRATEGIST, NOVELTY_REVIEWER,
  MISSION_SUPERVISOR — each mapped to a logical model role for traceable routing.
- **Complexity-derived team composition** — `missionComplexity` scores the mission
  (questions + hypotheses + tasks) into trivial / moderate / complex; `composeTeam`
  returns a minimal team for trivial missions and the full fabric for complex ones.
  Not one universal swarm.
- **Proposer ≠ judge** — enforced structurally (`PROPOSER_ROLES` disjoint from
  `JUDGE_ROLES`).
- **Traceable invocations** — `invokeAgent` routes a model decision, runs the
  deterministic handler, and persists an `agent_invocations` record: role, model
  role, model-decision id, model status, **input artifact hashes**, **output
  artifact hash**, status, failure reason, timestamp. Structured artifacts only —
  never chain-of-thought.
- **`runTeam`** — executes the composed team in a sensible order, recording every
  invocation.
- **Honest gaps** — NOVELTY_REVIEWER returns `CAPABILITY_GAP` (no external novelty
  reference set / COCONUT reachable = BLOCKED_BY_RESOURCES); handler failures are
  recorded with a failure reason, never hidden.

## Verification

- `cognitiveAgentFabric.test.mjs` — **6/6**: complexity-scaled composition;
  traceable invocation with artifact hashes + model decision; proposer/judge
  disjointness; full `runTeam` over a planned mission; NOVELTY_REVIEWER
  CAPABILITY_GAP; honest failure recording.
- Full gate: backend **296/296** (0 skipped), frontend 601/601, build green, lint clean.

## CAPABILITY_GAP

- Agents execute deterministic engines; routing records the model decision but no
  live LLM is invoked (Anthropic adapter key-gated, P7). Wiring real model
  completions for reasoning-heavy roles is the follow-on once a provider is live.
