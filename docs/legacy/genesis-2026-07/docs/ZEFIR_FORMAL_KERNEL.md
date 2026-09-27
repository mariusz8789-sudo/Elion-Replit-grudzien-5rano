# ZEFIR Phase 4 — Formal Reality Kernel

Physics constrains language. Turns claims into formal structure and checks them
BEFORE expensive computation. Additive schema `v17 → v18`. No Phase-1/3 code, engine,
or provenance semantics touched.

## `cognitive/formalKernel.mjs`
- **Dimensional Intelligence (H):** exact rational unit/dimension algebra; dimensional
  consistency of equations; dimension-matrix rank; **Buckingham-Pi** dimensionless
  group generation via a real rational null-space (RREF over fractions) — verified on
  the pendulum (π = t²g/l) and Reynolds (μ/ρvL) against known physics, NOT hard-coded.
- **Formal relations (G):** persisted with derivation status; a model-asserted equation
  is `UNVERIFIED_FORMALIZATION` until checked (never auto-verified).
- **Assumption Unearthing (I):** classes + assumption-attack ("if this fails, what
  collapses?").
- **Limit Analyzer (K):** STABLE / NUMERICALLY_SENSITIVE / VALIDITY_DOMAIN_EXCEEDED /
  SINGULAR_REGION_DETECTED / INSUFFICIENT_FORMAL_MODEL (finite-difference condition
  proxy) — numerical convergence is not physical truth.
- **Necropolis 2 (L):** persisted formal failure regions + context-aware normalized
  similarity (not one universal Euclidean radius) → KNOWN_DEAD_END / HIGH_FAILURE_
  SIMILARITY / POTENTIAL / NOVEL_REGION; proven to CHANGE a decision (avoid a near
  failure, proceed on a far region) with a false-pruning guard.
- **Epistemic Priority (M):** next action by explicit information-gain PROXY / cost /
  reversibility / risk; benchmarked to beat fixed-order and cost-only baselines.

## Verification
- `cognitiveFormalKernel.test.mjs` — **11/11**, incl. a hostile block (refuses to call
  an unverified formalization verified; catches a dimensionally inconsistent equation;
  false-pruning guard). Full gate: backend **391/391** (0 skipped), frontend 601/601,
  build green, lint clean.
