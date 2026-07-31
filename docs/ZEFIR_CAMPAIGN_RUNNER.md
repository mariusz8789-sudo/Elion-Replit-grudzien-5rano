# ZEFIR Phase 3A — Autonomous Campaign Runner

Closes the autonomy gap: the campaign is no longer sequenced by a script. The runner
derives the next action from the **persisted DAG + `recovery.nextSafeAction`** and
drives the mission itself. No Phase-1 code, engine, or provenance semantics touched.

## `cognitive/campaignRunner.mjs`

Loop: OBSERVE (recover) → next safe action → capability check → per-engine + compute
budget check → human-approval gate → EXECUTE (injected executor) → record → VERIFY
(replay) → adversarial adaptation on failure → checkpoint → continue.

- **Order is derived from the DAG**, not hard-coded (test asserts A→B→C from
  dependencies).
- **Budgets:** `maxIterations`, `wallClockMs` (injectable clock), `computeMs`,
  `perEngineMs` — exhaustion → `PAUSED_BUDGET`.
- **Stop states:** COMPLETED · PAUSED_BUDGET · PAUSED_APPROVAL · INSUFFICIENT_INFO ·
  FAILED · MAX_ITERATIONS.
- **Resume without duplication:** completed tasks are never re-run (each executes
  exactly once across a paused+resumed run) — proven.
- **Failure → adaptation:** an executor failure triggers a real workflow mutation
  (route-around) and the campaign continues.
- **Capability gap:** a task whose engine is unavailable is BLOCKED and recorded —
  never faked.
- **Human approval gate:** a task flagged `requiresApproval` pauses `PAUSED_APPROVAL`
  (left READY) and resumes when an approver is supplied.
- The per-task `executor` is injected: deterministic stub in tests; real scientific
  engines in the ZEFIR campaign. The runner never fabricates a result.

## Verification

- `cognitiveCampaignRunner.test.mjs` — **8/8**. Full gate: backend **341/341** (0
  skipped), frontend 601/601, build green, lint clean.
