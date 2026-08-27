# First Control Plane Benchmark — Admission Result

**Date:** 2026-08-27

**Baseline:** LIVE `4faa323` before this admission documentation.

**Decision:** `BLOCKED_BY_RUNTIME / VERIFY_REQUIRED`

## Executive decision

The benchmark specification is structurally compatible with the existing Genesis direction, but admission failed at the first operational gate. The current sandbox/backend runtime does not have PySCF installed, so no real H₂ RHF/STO-3G or H₂ RHF/6-31G backend run was executed. The benchmark must not be implemented as if it were complete, and no Evidence Pack, Replay `MATCH` or Chromium proof may be claimed.

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| Existing PySCF adapter supports `sto-3g` | `CODE_SUPPORTED` | `qm_worker.py` allowlist and `qmBenchmark.mjs` call |
| Existing PySCF adapter supports `6-31g` | `CODE_SUPPORTED` | `qm_worker.py:BASES` includes `6-31g`; `singlePoint()` accepts it |
| PySCF runtime available in current environment | **FAIL** | `npm run benchmark -- pyscf --json` returned `BLOCKED_BY_RUNTIME`, `No module named 'pyscf'` |
| Real STO-3G backend run | **NOT_EXECUTED** | Runtime blocker |
| Real 6-31G backend run | **NOT_EXECUTED** | Runtime blocker |
| Existing Fabric envelope | `EXISTS / PARTIAL` | `/api/compute/fabric/contract` and existing PySCF model contract |
| Two-arm A/B Fabric workflow | `NOT_PROVEN` | No existing two-arm PySCF Evidence chain was executed |
| Evidence Pack for this benchmark | `NOT_GENERATED` | Cannot generate from absent real runs |
| Replay `MATCH` | `NOT_EXECUTED` | No benchmark evidence artifact exists |
| Failure behavior without backend | `PROVEN HONEST` | Existing test returns rejected `capability_unavailable`; benchmark returns `BLOCKED_BY_RUNTIME` |
| Chromium proof of complete chain | `NOT_PROVEN` | No complete chain exists to show |

## What the source review proves

The existing worker allowlist contains both `sto-3g` and `6-31g`. The existing quantum-chemistry benchmark already calls both basis sets for the variational-principle case. The existing adapter exposes a real `singlePoint()` path and does not fabricate output when PySCF is unavailable.

The existing backend Fabric contract provides an envelope with `contractVersion`, `modelId`, `inputs`, `outputs`, `deterministic` and a returned run/provenance object. The existing PySCF API test proves the contract is exposed and, when the runtime is unavailable, proves the honest rejection path. This is not proof that the requested two-arm A/B chain, Evidence Pack and Replay are already wired together.

## Exact blocker

The current runtime uses Python 3.12.3 and reports:

```text
pyscf_unavailable: No module named 'pyscf'
```

The present tests correctly skip real PySCF cases when the runtime is unavailable and assert rejection instead. This is a valid honesty result, not a successful scientific run.

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

First provision or identify an approved, reproducible PySCF runtime for the backend. Pin the Python/PySCF environment and record its version in provenance. Then run only the existing PySCF reference and benchmark cases. If the runtime cannot be provisioned in CI, the benchmark may be executed only in a declared approved environment and must carry that limitation; otherwise the status remains `BLOCKED_BY_RUNTIME`.

After runtime admission, perform a separate contract review of the two-arm Evidence/Replay mapping before writing feature code. Any incompatibility means `VERIFY_REQUIRED` or `BLOCKED`, not a new parallel evidence system.

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

Runtime provisioning itself is a separate dependency and is currently unpriced because the approved deployment mechanism, package source and CI policy have not been selected. A realistic end-to-end calendar estimate is **2–4 working days once runtime access is approved**, not an unqualified promise of completion today.

## Sensor/instrument decision

**No.** After this admission result Genesis is not ready to move to a first real sensor or laboratory instrument. It must first demonstrate the computational control-plane benchmark end to end: two real runs, compatible provenance, Evidence Pack, replay `MATCH`, negative cases and Chromium proof. Only after that should Genesis enter instrument research/sandbox, starting with a low-risk read-only or approval-gated connector.

## Final status

The correct status is:

```text
PySCF basis support: CODE_SUPPORTED
PySCF runtime: BLOCKED_BY_RUNTIME
Two-arm benchmark: NOT_PROVEN
Evidence/Replay benchmark: NOT_EXECUTED
Sensor readiness: NO
```

This is an honest admission failure. It prevents Genesis from announcing a benchmark that the current runtime cannot actually run.
