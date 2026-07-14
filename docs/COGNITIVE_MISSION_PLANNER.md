# Cognitive Ceiling — Milestone 2: Mission Planner

**Priority 2** of the Genesis Cognitive Architecture v3 program. Turns a research
goal into a persisted, **executable** Scientific Task DAG on the Evidence Store
(Milestone 1). No Phase-1 code or scientific engine was modified.

## What was built (`cognitive/missionPlanner.mjs`)

`planMission(db, { goal, domain, spec, resolveCapability })` →
`planMissionAsync(db, ...)` (resolves engine availability from the real toolchain):

- Creates a `research_mission` with stop conditions + budgets in its spec.
- **Deterministic, interface-driven decomposition** via a domain strategy registry.
- The `drug-discovery` strategy produces, all persisted and linked:
  - a **question decomposition tree** (root → generation / property / binding);
  - **competing hypotheses** H1 vs H2 (the real descriptor-vs-docking tension),
    each with a concrete **disconfirming observation** (falsifiability built in);
  - a **Task DAG** — seed → descriptors → {ADMET, novelty}; ADMET → dock;
    {dock, novelty} → verify — with dependency-driven readiness so only the seed
    task is on the execution frontier and everything downstream is `BLOCKED`;
  - **per-task engine selection** from the real Toolchain Registry, with each
    task honestly recording whether its engine is available (never fabricated);
  - a **planned checkpoint** for restart/recovery.

## Honesty & dependency discipline

- **Unknown domain → explicit `CAPABILITY_GAP`.** General natural-language goal
  decomposition needs a reasoning model behind the Model Abstraction / Router
  layer (**Priority 7**). Until that exists, a non-`drug-discovery` goal returns
  `planStatus: 'CAPABILITY_GAP'` with the mission persisted but **paused** and
  **zero fabricated tasks**. This is an in-order implementation choice, not a
  reordering of the approved sequence.
- **No provider hard-coding.** The planner makes no LLM call; it is deterministic.
  The LLM planner strategy will slot into the same registry once the Model Router
  lands, without changing the Evidence Store / DAG contract.
- **Engine availability is real and honest.** `planMissionAsync` consults the
  live toolchain; verified this session with all six capabilities `AVAILABLE`.

## Verification

- `cognitiveMissionPlanner.test.mjs` — **5/5** (deterministic stub resolver):
  full DAG plan; correct dependency structure; honest engine-availability
  recording when an engine is absent; unknown-domain `CAPABILITY_GAP` with no
  invented tasks; planning determinism.
- Full gate: backend **258/258** (0 skipped), frontend **601/601**, build green,
  `eslint .` clean. `planMissionAsync` confirmed against the real toolchain.

## CAPABILITY_GAP (next, not faked now)

- General NL goal decomposition → needs Model Router (Priority 7).
- Nothing yet **executes** the planned DAG against engines — that is the
  orchestrator/execution wiring (upcoming), which will read the frontier this
  planner produces and record evidence + science runs per task.
- Strategy diversity: only `drug-discovery` today; more domains are additive
  strategies.
