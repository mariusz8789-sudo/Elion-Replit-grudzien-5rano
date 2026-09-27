# Cognitive Ceiling — Milestone 12: Sandbox Lab

**Priority 12.** Isolated campaigns whose candidate evidence never contaminates the
main Evidence Store until promotion rules allow. A sandbox result is NOT verified
evidence. Additive schema `v13 → v14`. No Phase-1 code or scientific engine touched.

## What was built (`cognitive/sandboxLab.mjs`, schema v14 `sandbox_promotions`)

- **Isolation by mission** — a sandbox is its own mission (`spec.sandbox = true`,
  linked to a parent). Its candidate evidence/hypotheses/mutations are partitioned by
  `mission_id` and are invisible to the main mission until promoted.
- **Promotion rules** (`evaluatePromotion`) — `VERIFIED → PROMOTED`;
  `CONTRADICTED / REJECTED → REJECTED`; anything else → `HELD` (not eligible).
- **`promoteEvidence`** — only VERIFIED evidence is copied into the target mission,
  carrying a **parent-evidence provenance link** and the **original content hash**
  (a `provenance_mismatch` guard fails the promotion if the hash doesn't match).
  Every attempt (promote / reject / hold) is an append-only `sandbox_promotions`
  audit record.
- **`promoteMission`** — batch promotion with a summary + full audit.

## Honesty

- Unverified sandbox results are never silently promoted; only explicitly VERIFIED
  evidence enters the main store, with provenance intact.
- **Real sandbox campaign:** exercised end-to-end against real scientific engines in
  the Genesis Discovery Trial (`scripts/genesis-discovery-trial.mjs`) — a real RDKit/
  engine-backed sandbox mission whose eligible evidence is promoted under these rules.

## Verification

- `cognitiveSandboxLab.test.mjs` — **5/5**: isolation (main uncontaminated);
  VERIFIED promotion with preserved provenance + parent link; UNVERIFIED HELD;
  CONTRADICTED REJECTED; batch summary + audit (only VERIFIED enters main).
- Full gate: backend **319/319** (0 skipped), frontend 601/601, build green, lint clean.
