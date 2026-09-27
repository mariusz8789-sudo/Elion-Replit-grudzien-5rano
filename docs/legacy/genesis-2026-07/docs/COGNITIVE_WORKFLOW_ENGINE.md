# Cognitive Ceiling — Milestone 3: Dynamic Workflow Engine

**Priority 3** of the Genesis Cognitive Architecture v3 program. Makes the
Scientific Task DAG adaptive: it observes execution outcomes, judges whether the
strategy is producing sufficient information, and — when it isn't — applies an
explicit, evidence-backed, **reversible** `WorkflowMutation`. The plan is never a
static list and is never silently rewritten. No Phase-1 code or scientific engine
was modified.

## The loop (`cognitive/workflowEngine.mjs`)

`OBSERVE → EVALUATE → PROPOSE → APPLY → VERIFY → (ROLLBACK)`

- **`evaluateStrategy(db, missionId)`** — deterministic, evidence-backed verdict
  from persisted task state + evidence + questions:
  - `FAILING` — failed task(s) blocking downstream work;
  - `PROGRESSING` — runnable or in-flight work exists;
  - `STALLED` — nothing ready/running but blocked work remains (dead frontier);
  - `INSUFFICIENT_INFO` — plan exhausted but questions still open;
  - `SUFFICIENT` — complete, no open questions.
  Returns structural metrics (frontier, running, blocked, failedBlocking, …) — no
  invented "information gain" numbers.
- **`proposeMutation`** — returns a structural proposal or `null` (honest no-op
  when PROGRESSING/SUFFICIENT):
  - `ROUTE_AROUND_FAILURE` — add an alternative task and rewire the failed task's
    dependents onto it;
  - `UNSTALL_ADD_PATH` — add a runnable path for a dead frontier;
  - `GATHER_MORE_EVIDENCE` — add a follow-up experiment for an open question.
- **`applyMutation`** — writes the `WorkflowMutation` record **as part of** the
  change (never silent), with previous-workflow hash, expected benefit, triggering
  evidence, and concrete rollback data. Mutations are **additive + edge-rewire
  only** (add tasks, delete/add dependency edges) so they are fully reversible;
  real FAILED results are preserved, the engine routes around failure rather than
  hiding it.
- **`verifyMutation`** — checks the mutation against its expected structural
  benefit using current measured state → `VERIFIED` or `REGRESSED`, recorded as
  the mutation's actual result.
- **`rollbackMutation`** — reverses the additive changes (supersede added tasks,
  restore removed edges) → `ROLLED_BACK`.
- **`adapt`** — one-shot OBSERVE→EVALUATE→PROPOSE→APPLY convenience.

Supporting reversible primitives added: `store.deleteTaskEdge` / `findTaskEdge`
and `taskGraph.removeDependency` (recomputes readiness).

## Honesty & determinism

- Rule-based over persisted state; no ML, no fabricated metrics. Expected and
  actual benefit are measured structural facts (`failedBlocking: 1 → 0`,
  `frontier: 0 → 1`).
- Every structural change is a persisted, append-only, queryable
  `WorkflowMutation` with a reason, triggering evidence, and rollback data.
- The workflow topology changes; the audit does not lie about it.

## Verification

- `cognitiveWorkflowEngine.test.mjs` — **7/7**: PROGRESSING no-op; FAILING
  route-around (alternative added, dependents rewired, downstream unblocks on
  completion); full mutation record + VERIFIED; STALLED unstall; INSUFFICIENT_INFO
  gather-more; **rollback** restoring the original failing topology; append-only
  mutation history.
- Full gate: backend **265/265** (0 skipped), frontend **601/601**, build green,
  `eslint .` clean.

## CAPABILITY_GAP (next, not faked now)

- **Autonomous trigger cadence** — the engine adapts on demand (`adapt`); wiring it
  into the execution loop so it fires automatically after each generation belongs
  with the orchestrator execution wiring.
- **Information-gain modeling** — verdicts are structural (frontier/failure/
  questions), not a surrogate-model expected-information-gain estimate; that is a
  later refinement once cross-run data exists (Meta-Orchestrator, Priority 10).
- **Richer proposals** — three mutation kinds today; more (parameter re-weighting,
  branch pruning, hypothesis-driven re-planning) are additive.
