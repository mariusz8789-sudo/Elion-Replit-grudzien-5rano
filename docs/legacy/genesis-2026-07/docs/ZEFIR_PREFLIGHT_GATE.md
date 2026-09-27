# ZEFIR Phase 4 — Scientific Pre-Flight Gate (Claude original invention, implemented)

"Compile-time for physics." Before an expensive campaign/simulation runs, this gate
composes the Formal Kernel + Necropolis + capability checks into one content-hashed
GO / WARN / BLOCK certificate — removing wasted compute and expert hours.

## Why it is the moat
The cheapest computation is the one you never run. Much R&D compute + expert time is
spent on runs that were dimensionally inconsistent, previously-failed, or impossible in
the runtime from the start. The gate catches these BEFORE they consume resources, and
its Necropolis grows per client → proprietary accumulated advantage.

## `cognitive/preflightGate.mjs`
Checks: (1) dimensional consistency → BLOCK on inconsistency; (2) required-capability
availability → BLOCK if missing; (3) Necropolis dead-end → BLOCK on known dead end, WARN
on high similarity; (4) assumptions stated → WARN if none. Emits a hashed certificate.

## Honesty
A GO certificate asserts only "no blocking reason found by the implemented checks" — a
NECESSARY, not sufficient, pre-condition; it asserts no physical/biological correctness.

## Verification
- `cognitivePreflightGate.test.mjs` — **6/6**. Full gate: backend 405 tests 0 fail,
  frontend 601/601, build green, lint clean.
