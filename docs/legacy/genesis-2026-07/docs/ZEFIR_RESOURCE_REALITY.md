# ZEFIR Phase 3E (Resource Layer) + 3K (Reality Bridge)

Additive schema `v15 → v16`. No Phase-1 code/engine/provenance touched.

## Scientific Resource Layer (`cognitive/resourceLayer.mjs`)
Strict import path. Types: `LOCAL_CURATED_RESOURCE / USER_PROVIDED_RESOURCE /
REMOTE_VERIFIED_RESOURCE / SYNTHETIC_TEST_FIXTURE`. Every resource records source
identity/type, license, version, **content hash**, parser version, validation status.
- `importResource` — local/user/synthetic import with content hashing + optional
  validation; a `SYNTHETIC_TEST_FIXTURE` is force-labelled and can never masquerade
  as real.
- `requestRemote` — egress is blocked → **BLOCKED_BY_RESOURCES**, never fabricated.
  A legitimate local/user resource activates previously-blocked workflows (e.g. a
  real target structure enabling docking). We do not fake COCONUT / RCSB / patents.

## Reality Bridge (`cognitive/realityBridge.mjs`)
Future experimental-feedback architecture. **No lab is connected.**
- `importExperimentalResult` — structured contract (external id, lab, protocol,
  candidate, measurement type + class, numeric result, artifact ref + hash). A
  free-text claim ("candidate works") is **REJECTED** — it can never become verified
  evidence. Imported results start `reviewerStatus = PENDING` (a human must review).
- `recordPredictionError` / `predictionPerformance` — prediction-vs-measurement
  foundation (mean absolute error per strategy) for future Meta-Orchestrator
  prediction-vs-reality scoring. No medical/clinical automation.

## Verification
- `cognitiveResourceReality.test.mjs` — **6/6**. Part of the full gate below.
