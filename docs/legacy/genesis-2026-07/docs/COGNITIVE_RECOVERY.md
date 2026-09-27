# Cognitive Ceiling — Milestone 9: Long-Horizon Checkpoint & Recovery

**Priority 9.** Deterministic, production-grade recovery over the mission_checkpoints
substrate. Genesis survives process restart, partial completion, interrupted tasks,
interrupted verification, and mutations in progress — and never duplicates completed
scientific work. No Phase-1 code or scientific engine touched.

## What was built (`cognitive/recovery.mjs`)

- **`reconcileInterrupted`** — a task left `RUNNING` when the process died is reset to
  a re-runnable state (`RUNNING → BLOCKED → readiness recompute`), never silently
  treated as complete.
- **`pendingVerification`** — Scientific-Run-backed evidence still `UNVERIFIED`
  (interrupted verification).
- **`inProgressMutations`** — workflow mutations neither verified nor rolled back.
- **`recoverMission`** — reconciles interruptions, reconstructs mission state
  (hypotheses, evidence, DAG frontier, agent decisions, mutation history), and
  computes the single **next safe action** by deterministic priority: resolve an
  in-progress mutation → verify pending evidence → execute the frontier → adapt →
  gather more → complete. Idempotent (repeated calls give the same action). Completed
  tasks are never re-run.

## Verification

- `cognitiveRecovery.test.mjs` — **5/5**, including a **real file-DB restart**:
  an interrupted RUNNING task is reconciled to READY after reopen and becomes the
  next safe action while downstream stays BLOCKED (no parallel/duplicated run);
  completed work is never reset and recovery resumes at the correct frontier;
  pending verification surfaces as the next action; determinism; missing mission →
  `MISSION_NOT_FOUND` (no crash).
- Full gate: backend **301/301** (0 skipped), frontend 601/601, build green, lint clean.

## CAPABILITY_GAP

- Recovery reasons over persisted state; it does not re-drive engines itself — the
  execution loop (Compute Orchestrator, P11) consumes the next safe action to resume.
