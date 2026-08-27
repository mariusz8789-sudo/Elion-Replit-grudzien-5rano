# First Control Plane Benchmark — Admission Result

**Date:** 2026-08-27

**Baseline:** LIVE `4faa323` before this admission documentation.

**Decision:** `PARTIAL / ARCHITECTURE_GATE_REMAINS`

## Executive decision

The benchmark specification is structurally compatible with the existing Genesis direction. The initial runtime blocker was resolved in the validated sandbox by installing and pinning PySCF 2.14.0 for Python 3.12.3. Real adapter and benchmark runs now pass for both H₂ basis arms. Admission remains partial because the existing frontend Scientific Discovery executor is synchronous/local (`runExperiment`), while the existing backend confirmation adapter is asynchronous and currently exposes only a single-run handoff with `PROTOCOL_REQUIRED` / `VARIANT_REQUIRED`. A two-arm backend Evidence/Replay chain has not yet been implemented or executed. No complete benchmark success is claimed.

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| Existing PySCF adapter supports `sto-3g` | `CODE_SUPPORTED` | `qm_worker.py` allowlist and `qmBenchmark.mjs` call |
| Existing PySCF adapter supports `6-31g` | `CODE_SUPPORTED` | `qm_worker.py:BASES` includes `6-31g`; `singlePoint()` accepts it |
| PySCF runtime available in current environment | **PASS** | Python 3.12.3 + pinned PySCF 2.14.0 |
| Real STO-3G adapter run | **PASS** | Existing `qmAdapter.singlePoint()` returned converged `PySCF 2.14.0`, E = -1.11675931 Ha |
| Real 6-31G adapter run | **PASS** | Existing `qmAdapter.singlePoint()` returned converged `PySCF 2.14.0`, E = -1.12675532 Ha |
| Existing PySCF benchmark suite | **PASS** | 5/5 cases passed; contentHash `36cae380f243b7133a281c6fbcff26a8360f86870b1016f1628eafabe581c541` |
| Existing Fabric envelope | `EXISTS / PARTIAL` | `/api/compute/fabric/contract` and existing PySCF model contract |
| Two-arm A/B Fabric workflow | **ARCHITECTURE GATE** | Existing backend endpoint can run each arm after registry extension, but frontend Scientific Discovery currently calls synchronous local `runExperiment`; existing backend confirmation is async and single-run only |
| Evidence Pack for this benchmark | `NOT_GENERATED` | No two-arm `ScientificEvidenceChain` has been produced |
| Replay `MATCH` | `NOT_EXECUTED` | No benchmark evidence artifact exists |
| Failure behavior without backend | `PROVEN HONEST` | Existing test returns rejected `capability_unavailable`; benchmark returns `BLOCKED_BY_RUNTIME` |
| Chromium proof of complete chain | `NOT_PROVEN` | No complete chain exists to show |

## What the source review proves

The existing worker allowlist contains both `sto-3g` and `6-31g`. The existing quantum-chemistry benchmark already calls both basis sets for the variational-principle case. The existing adapter exposes a real `singlePoint()` path and does not fabricate output when PySCF is unavailable.

The existing backend Fabric contract provides an envelope with `contractVersion`, `modelId`, `inputs`, `outputs`, `deterministic` and a returned run/provenance object. The existing PySCF API test proves the contract is exposed and, when the runtime is unavailable, proves the honest rejection path. This is not proof that the requested two-arm A/B chain, Evidence Pack and Replay are already wired together.

## Current blocker

The original runtime blocker is resolved locally with the pinned dependency in `packages/backend/requirements-pyscf.txt`:

```text
Python 3.12.3
PySCF 2.14.0
```

The remaining blocker is architectural and explicit: `executeScientificExperiment()` calls synchronous local `runExperiment()` for every arm, while `confirmBackendEvidenceGuidedExperiment()` calls the asynchronous backend Fabric endpoint and deliberately returns a single-run handoff requiring a protocol/variant. The benchmark needs one thin async backend scientific executor that returns the existing `ScientificEvidenceChain`, not a second Evidence Pack or Replay system. Until that adapter exists and is tested, the complete benchmark remains `NOT_PROVEN`.

## Missing information and why it matters

| Missing item | Why it blocks admission |
|---|---|
| Installed PySCF runtime and pinned version | Without it, there are no real backend outputs |
| Successful STO-3G run | Required arm A and actual engine provenance |
| Successful 6-31G run | Required arm B and actual engine provenance |
| Two-arm protocol mapping | Existing single-run contract does not itself prove A/B evidence relationship |
| Complete compatible provenance for both arms | Needed to prevent hidden geometry/method/basis changes |
| Evidence Pack generated from both real runs | Required artifact for the benchmark claim |
| Replay implementation exercised on the generated pack | Required `MATCH`/`DRIFT` proof |
| Error fixtures for geometry, basis, missing backend and tampered fingerprint | Required negative proof |
| Chromium route from Science Chat → Protocol/A-B → result → Evidence → Replay | Required product proof |

No missing item should be filled with a recalled value, local estimate or fabricated fixture result.

## Required next action

Keep the pinned runtime declaration and make CI provision it in an approved reproducible environment before claiming real-engine CI proof. Then implement only the thin async backend scientific executor described above. It must call the existing `runFabricCompute()` once per preregistered arm/repetition, adapt each response to the existing `ExperimentRun`, reuse the existing `ScientificEvidenceChain`, `createScientificEvidencePack()` and replay contract, and preserve explicit failures. Any incompatibility means `VERIFY_REQUIRED` or `BLOCKED`, not a new parallel evidence system.

## Realistic effort estimate

This estimate starts **after** an approved PySCF runtime can be provisioned:

| Work | Estimate |
|---|---:|
| Pin/provision runtime and verify both real arms | 2–4 hours |
| Prove or minimally extend two-arm Fabric mapping | 4–8 hours |
| Evidence Pack + Replay integration using current contracts | 4–8 hours |
| Negative cases and automated tests | 3–5 hours |
| Chromium desktop/mobile proof, local gate and CI | 3–5 hours |
| **Total after runtime is available** | **16–30 hours** |

Runtime provisioning has been completed in the current sandbox but still needs a CI/deployment policy decision for remote reproducibility. The remaining end-to-end estimate is **12–24 hours** after CI runtime provisioning is approved: 4–8 hours for the thin async A/B adapter, 3–6 hours for Evidence/Replay and negative cases, and 5–10 hours for Chromium, full gate and CI proof. This is an estimate, not a claim of completion.

## Sensor/instrument decision

**No.** After this admission result Genesis is not ready to move to a first real sensor or laboratory instrument. It must first demonstrate the computational control-plane benchmark end to end: two real runs, compatible provenance, Evidence Pack, replay `MATCH`, negative cases and Chromium proof. Only after that should Genesis enter instrument research/sandbox, starting with a low-risk read-only or approval-gated connector.

## Final status

The correct status is:

```text
PySCF basis support: CODE_SUPPORTED + REAL_RUN_PROVEN
PySCF runtime: PROVISIONED_LOCALLY / CI_VERIFY_REQUIRED
Two-arm backend execution: CONNECTED_LOCALLY / CI_VERIFY_REQUIRED
Evidence Pack: REAL_LOCAL_MATCH_PROVEN
Replay: FABRIC_REPRODUCTION_MATCH; persisted rerun replay remains NOT_IMPLEMENTED
Negative cases: CONTRACT_COVERAGE_REQUIRED
Sensor readiness: NO
```

The local runtime blocker is resolved: the canonical async backend adapter executed H₂ RHF/STO-3G and H₂ RHF/6-31G through PySCF 2.14.0 and produced a real local Evidence Pack with both arms marked MATCH. This does not yet prove CI portability, Chromium end-to-end execution, or a persisted rerun replay; those remain explicit gates before instrument readiness.
