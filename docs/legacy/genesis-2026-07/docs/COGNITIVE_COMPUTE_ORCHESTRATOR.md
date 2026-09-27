# Cognitive Ceiling — Milestone 11: Compute Orchestrator

**Priority 11.** Provider-neutral compute placement, local-first, integrated with the
real Genesis toolchain. Unavailable hardware is never faked. Additive schema
`v12 → v13`. No Phase-1 code or scientific engine touched.

## What was built (`cognitive/computeOrchestrator.mjs`, schema v13 `compute_placements`)

- **Backends** — `LOCAL_CPU / LOCAL_GPU / REMOTE_GPU / HPC / QUANTUM_BACKEND`, each
  declaring kind, capabilities, and availability. In this environment only
  `LOCAL_CPU` is available; the rest are declared but **honestly unavailable** (no
  CUDA device / HPC / QPU). LOCAL_CPU's engine capabilities are resolved from the
  **real toolchain** (rdkit/pyscf/openmm/vina/biopython/admet) via an injectable
  resolver.
- **`placeTask`** — chooses an available backend satisfying the task's `needs`
  (LOCAL first); records a traceable, budgeted `compute_placements` decision. No
  available backend for the needs → `BLOCKED_BY_RESOURCES` (never faked onto CPU);
  available backend lacking the required engine → `CAPABILITY_GAP`.
- **`estimateBudget`** (deterministic) and **`accountActual`** (records real ms +
  failure classification: SUCCESS / TIMEOUT / ENGINE_ERROR / OOM / BLOCKED_BY_RESOURCES
  / CAPABILITY_GAP).
- **`retryPolicy`** — TIMEOUT/OOM retryable with budget backoff, bounded by attempts;
  ENGINE_ERROR / BLOCKED_BY_RESOURCES / CAPABILITY_GAP not retryable.
- **Replay semantics** — a retry placement references the original (`retryOf`, attempt).

## Honesty

- A GPU/HPC/quantum requirement in this environment yields `BLOCKED_BY_RESOURCES`, not
  a silent fallback. The five hardware kinds are modelled as an interface; only what
  is real is marked available.

## Verification

- `cognitiveComputeOrchestrator.test.mjs` — **7/7**: honest backend availability;
  CPU placement with budget; GPU → BLOCKED_BY_RESOURCES; missing engine → CAPABILITY_GAP;
  actual accounting + failure class; retry policy with backoff + bounds; replay reference.
- Full gate: backend **314/314** (0 skipped), frontend 601/601, build green, lint clean.
