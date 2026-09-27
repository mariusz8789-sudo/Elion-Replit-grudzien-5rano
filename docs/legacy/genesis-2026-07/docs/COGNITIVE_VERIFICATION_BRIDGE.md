# Cognitive Ceiling — Milestone 6: Verification Bridge

**Priority 6.** Connects the mature reproducibility engine (`campaign/verify.mjs`
— real engine replay with per-capability numerical tolerances and append-only
audit) to the Evidence Store's `verification_status`. Computed evidence backed by
a Scientific Run can now be independently replay-verified. No Phase-1 code or
scientific engine was modified or re-implemented.

## What was built (`cognitive/verificationBridge.mjs`)

- **`VERDICT_TO_EPISTEMIC` / `mapVerdict`** — replay verdict → epistemic status:
  `MATCH → VERIFIED`, `DRIFT / ENGINE_VERSION_CHANGED → CONTRADICTED`,
  `BLOCKED_BY_RUNTIME → BLOCKED_BY_RESOURCES`, `REPLAY_UNSUPPORTED → UNVERIFIED`
  (unknown → `UNVERIFIED`, never optimistic).
- **`verifyEvidence`** — replays an evidence object's backing Scientific Run via
  the real `verify.verifyScienceRun` (injectable for deterministic tests) and
  updates `evidence.verification_status`. Evidence not backed by a Scientific Run
  (agent findings, critiques) is honestly reported `REPLAY_UNSUPPORTED` — never
  marked `VERIFIED` by fiat.
- **`verifyMissionEvidence`** — replay-verifies all Scientific-Run-backed evidence
  for a mission.

## Honesty

- Nothing re-implemented: real replay lives in `campaign/verify.mjs` and is
  exercised against real engines by `campaignVerify.test.mjs` (engine-gated). This
  bridge is a thin, fully-tested mapping; the default `verifier` is the real module,
  so production evidence verification runs the real engine replay.

## Verification

- `cognitiveVerificationBridge.test.mjs` — **6/6** (injected verifier): exhaustive
  verdict mapping; MATCH → VERIFIED; DRIFT → CONTRADICTED; no-run → REPLAY_UNSUPPORTED
  (not marked verified); mission-wide selective verification; missing-evidence error.
- Full gate: backend **282/282** (0 skipped), frontend 601/601, build green,
  eslint clean.

## CAPABILITY_GAP

- Verification of non-replayable / stochastic methods (beyond deterministic replay)
  — a later refinement; today only replay-backed capabilities
  (docking / QM / ADMET / toxicity) are replay-verifiable.
