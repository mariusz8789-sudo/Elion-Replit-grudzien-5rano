# Claude Next Audit — forensic verify and real PySCF proof

Independent verification pass. Nothing was merged, nothing was pushed to LIVE, no new solver,
lab, renderer, GIS, Campaign bridge or domain was built. Every claim is the observed result of a
command that was executed; anything not executable here is marked `VERIFY_REQUIRED`.

## 1. LIVE / branch forensics

| Item                  | Value                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| LIVE HEAD             | **`be9c56fc293645c1c46187bb2ddd466e00fd1ae7`** — "docs: record reproducible pyscf ci gate", 2026-08-27 18:55:51 +0000 |
| Working tree at start | clean                                                                                                                 |
| Audit branch          | `claude/next-audit-be9c56f`, created from `be9c56f`                                                                   |
| Latest LIVE CI        | run `33105930863` on `be9c56f` — **success**, both jobs green                                                         |

LIVE advanced 9 commits past `c6ae7d3` during the previous audit (evidence-pack persistence,
local evidence history, explicit replay reopen, persisted replay verdict, the real PySCF CI job).

### `claude/quantum-forge-p845ux @ 4fe3c3b` — decision **PARK** (unchanged)

Re-confirmed against the newer LIVE HEAD: `git diff --stat be9c56f 4fe3c3b` = **41 files,
+184 / −3141**. The branch is now 40 commits behind. Its substance
(`executor.ts` earthquake seam, `realEngineExecutorCoverage.test.ts`, `resultOriginForRunStatus`,
GIS barrel removal, markdown whitespace exclusion) is on LIVE, and its `ci.yml` pathspec is worse
than LIVE's. Do not integrate.

### `claude/audit-verify-c6ae7d3 @ 92202317cedb51613c4f116ab485c5f3d7419242` — decision **PARK**

Documentation only (`docs/CLAUDE_BRANCH_AUDIT.md`, 284 lines). It carries no code. Its content is
superseded by this report. Nothing to integrate; delete or keep as a record.

## 2. PySCF — real status

**Local runtime: `VERIFY_REQUIRED: runtime unavailable`.**
`python3 -c "import pyscf"` raises `ModuleNotFoundError`. The container runs Python 3.11.15;
`packages/backend/requirements-pyscf.txt` pins `pyscf==2.14.0` on Python 3.12.3, and
`GENESIS_PYSCF_PYTHON` is unset. PySCF was **not** installed here, so no H2 run was executed
locally and the numbers in `docs/evidence/GENESIS_PYSCF_H2_AB_EVIDENCE.json` are **not** confirmed
by this pass.

**CI runtime: `CONNECTED` — verified from the real job log, not from a green badge.**

Job `Real PySCF benchmark` (id `98635634616`) in run `33105930863` on LIVE HEAD `be9c56f`:

- `Successfully installed h5py-3.16.0 numpy-2.5.2 pyscf-2.14.0 scipy-1.18.1 setuptools-84.0.0`
- `pythonLocation: /opt/hostedtoolcache/Python/3.12.3/x64`, `GENESIS_PYSCF_PYTHON: python`
- TAP output: `# tests 4`, `# pass 4`, `# fail 0`, **`# skipped 0`**

The **test count is the discriminator**, and it is the check that makes this proof real.
`pyscfFabricApi.test.mjs` branches on `detect().available`: the real branch registers 4 tests, the
no-runtime branch registers 2. A green job alone would not distinguish "real PySCF ran" from
"PySCF was missing and only the rejection test ran". Observing 4 tests with 0 skips proves the
real branch executed. Corroborating: `ok 2` (STO-3G) took **1194 ms** and `ok 3` (6-31G) took
**1211 ms** — real SCF wall time, not a stub.

What the CI job therefore proves, and its exact bounds:

| Proven                                                                          | Not proven                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| H2 RHF/STO-3G runs, `energyHartree` within 0.001 Ha of −1.11676, `nElectrons` 2 | Any geometry other than 0.74 Å                                 |
| H2 RHF/6-31G runs, `energyHartree` < −1.12, `nBasisFunctions` 4                 | Any molecule other than H2                                     |
| `provenance.engine` equals `PySCF ${runtime.version}` dynamically (STO-3G arm)  | Frontend Evidence Pack chain end to end against a real backend |
| `provenance.method` RHF, `provenance.basis` echoes the request                  | Persistence (`persisted: false` asserted in both arms)         |
| An unregistered basis (`cc-pvdz`) is rejected with `unsupported_basis`          | The committed evidence JSON's exact energies                   |

Observation, not a defect: the 6-31G test hardcodes `provenance.engine === 'PySCF 2.14.0'` while
the STO-3G test uses the dynamic `PySCF ${runtime.version}`. If the pin is bumped, that assertion
fails for a version reason rather than a physics reason.

## 3. Existing CI scope

A separate real PySCF job **already exists** — added by Manus in `766dc98`, before this audit. No
workflow diff is proposed; nothing was implemented.

Exact scope of job `pyscf-real` ("Real PySCF benchmark"):

- `ubuntu-latest`, `timeout-minutes: 10`, runs in parallel with `verify`
- `actions/setup-python@v6` pinned to `3.12.3`, pip cache keyed on `requirements-pyscf.txt`
- installs `-r packages/backend/requirements-pyscf.txt` (`pyscf==2.14.0`)
- runs `node --test packages/backend/src/pyscfFabricApi.test.mjs` with `GENESIS_PYSCF_PYTHON=python`
- triggers on `push` to `branches: ['**']` and on `pull_request`

Gap worth noting for a later decision, not fixed here: the job would still pass if PySCF silently
failed to import, because the test file falls back to the 2-test no-runtime branch. A one-line
assertion that the real branch ran (for example failing when `detect().available` is false under
the `pyscf-real` job) would close it. Not implemented — it is a workflow/product decision, and
the current job is honest today, as the log above shows.

## 4. Forensic regression check

| #   | Check                                                              | Result                                | How                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Backend echo mismatch for basis/geometry blocks the run            | **PASS**                              | `backendExecution.ts:60-64` throws per-parameter; covered by `blocks a backend response whose echoed basis or geometry differs from the reviewed plan` and `rejects a backend response whose model identity differs from the reviewed plan`                                                                              |
| 2   | rejected/failed REAL_ENGINE never gets `resultOrigin: real-engine` | **PASS**                              | Executed: `massSolar: -5` yields `status rejected`, `resultOrigin engine-not-available`; earthquake generic yields `capability_seam` / `capability-seam`                                                                                                                                                                 |
| 3   | Volatile `backendRunId` does not change the scientific fingerprint | **PASS in code, WEAK GUARD** — see §5 | Executed with 4 distinct run ids: fingerprints, `evidenceId` and pack id all stable                                                                                                                                                                                                                                      |
| 4   | Volatile `referenceRunIds` does not change the Evidence Pack id    | **PASS**                              | `evidencePack.ts:64-72` zeroes `referenceRunIds` in the id seed; stable across replays in the probe                                                                                                                                                                                                                      |
| 5   | A saved protocol after reload shows the right model                | **PASS**                              | `ExperimentPilotScreen.tsx:205` executes `getRouterModel(protocolDesign.hypothesis.modelId)` — the stored protocol's model, not the dropdown's. The protocol panel prints `designId`, `protocolFingerprint`, arms and criterion; it does not print the model id, which is a transparency nicety, not a correctness fault |
| 6   | Explicit rerun does not start automatically                        | **PASS**                              | The `replay=` effect (`ExperimentPilotScreen.tsx:112-128`) only sets `phase='planned'`, `protocolEvidence=null`; execution needs the "Potwierdź i wykonaj protokół" click. The WHY panel also renders `AUTO-RUN: DISABLED`                                                                                               |
| 7   | Identical rerun gives MATCH                                        | **PASS**                              | Probe: both arms `MATCH`, `allArmsMatched: true`, across two executions with different backend run ids                                                                                                                                                                                                                   |
| 8   | Changed basis/geometry gives DRIFT or BLOCKED                      | **PASS**                              | Probe: geometry 0.74 → 0.80 changes `protocolFingerprint` and `evidencePackId`; `compareScientificEvidencePacks` returns `DRIFT` on fingerprint mismatch and `BLOCKED` when any run is not `completed`                                                                                                                   |
| 9   | Missing backend gives capability_unavailable / BLOCKED             | **PASS**                              | Backend test `Fabric API rejects PySCF execution instead of emitting fabricated quantum output without runtime` asserts HTTP 400 + `capability_unavailable`; frontend `keeps the plan without a result when the backend reports a blocked runtime`                                                                       |
| 10  | Campaign, GIS, Matrix, Collider, new domains not wired in          | **PASS**                              | 0 campaign references in `core/experimentFabric`; 0 matrix/collider files; router still **55** models; every `importOsmMap` mention outside `spatialImport.ts` is inside the boundary test itself                                                                                                                        |

## 5. The one real finding — a regression guard that cannot fail

**Finding (P2, test-only): the replay determinism test cannot observe the regression it exists to
prevent.**

`73e96f0` correctly removed the volatile `backendRunId` from the hashed fingerprint input and
added a replay assertion to `backendEvidenceExecution.test.ts`. But that test's mock returns a
**fixed** run id per basis (`pyscfRun.runId` for sto-3g, `...404` for 6-31g), so the replay sees
the same identifiers as the first execution and `replayPack.evidencePackId === pack.evidencePackId`
holds trivially.

Proven by experiment, in both directions:

1. `backendExecution` was temporarily reverted in `provenance.ts` to `input.backendExecution ?? null`,
   re-admitting `backendRunId` into the fingerprint — the exact regression.
2. With that regression in place, `executes both PySCF H2 basis arms through the existing
scientific chain` still reported **`Tests 1 passed`**. It is blind.
3. A probe whose mock mints a fresh run id per call reported
   `fingerprintsStable: false`, `evidenceIdStable: false`, `packIdStable: false`. It catches it.
4. The change was reverted; production code was left untouched.

**LIVE's production behaviour is correct.** With four genuinely distinct backend run ids across
two executions, fingerprints, `evidenceId` and `evidencePackId` were all stable and both arms
reported `MATCH`. Only the guard was not load-bearing.

**Fix applied — test only, no production change.** New file
`packages/frontend/src/__tests__/evidenceReplayVolatility.test.ts` (2 tests):

- a mock that mints a fresh `backendRunId` on **every** call, asserting first that the four ids
  really are distinct (so the test cannot pass vacuously), then that run fingerprints,
  `evidenceId`, `evidencePackId`, per-arm `MATCH` and `allArmsMatched` are all stable;
- a negative direction: changing `bondLengthAngstrom` from 0.74 to 0.80 must change both
  `protocolFingerprint` and `evidencePackId`, so the suite cannot pass by making everything equal.

Re-verified: with the regression re-introduced the new suite fails
(`expected [ 'run_1ad1c2b8', 'run_69df4827' ] to deeply equal [ 'run_b48a5b3a', 'run_870f5d21' ]`);
with LIVE code it passes 2/2.

No production file was modified. Manus may prefer to fold this into
`backendEvidenceExecution.test.ts`; it was kept separate only to avoid colliding with his active
edits in that file.

## 6. Gate

| Gate                               | Result                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Frontend tests                     | **PASS** — 139 files, 1415 passed, 1 skipped                                      |
| Backend tests                      | **PASS** — 311 tests, 271 passed, 0 failed, 40 skipped (all `BLOCKED_BY_RUNTIME`) |
| Typecheck                          | **PASS**                                                                          |
| Lint                               | **PASS**                                                                          |
| Production build                   | **PASS** (pre-existing chunk-size advisory only)                                  |
| `git diff --check` (LIVE pathspec) | **PASS** — exit 0                                                                 |
| Chromium desktop 1600x1000         | **PASS** — see below                                                              |
| Chromium mobile 390x844            | **PASS** — see below                                                              |
| Working tree                       | clean                                                                             |

Chromium (141.0.7390.37 headless, ANGLE/SwiftShader, cache disabled, production build), identical
on both viewports: Earthquake plan then confirm gives `Earthquake run gotowy`, Replay `MATCH`,
`structuralDamage NOT_MODELED`, `engine genesis-earthquake-command-center@1.0.0`,
`resultOrigin real-engine` (the run did complete), `runFingerprint run_b74740fc` identical desktop
and mobile. No "Realny silnik zwrócił błąd wykonania", no "Nieobsługiwany adapter". Protocol / A-B
tab mounts with its controls. **0 console errors, no horizontal overflow.**

CI for this branch is reported in the session message accompanying this commit.

## 7. Limitations

- `VERIFY_REQUIRED` — local PySCF, RDKit and ADMET-AI runtimes are absent, so the 40 skipped
  backend tests and the committed PySCF evidence numbers were not reproduced in this container.
  PySCF was deliberately **not** installed here, per the task's constraint.
- The real-backend frontend chain (`GENESIS_REAL_BACKEND=1`) was not exercised; it is opt-in and
  does not run in CI. The volatility invariant is therefore proven at the mock boundary plus the
  CI-side real solver, not end to end in one process.
- The Earthquake City3D overlay is a `THREE.Group`, invisible to a DOM smoke; its code path was
  read, not asserted pixel-wise.
- Chromium ran under SwiftShader, not a real GPU.
- LIVE moved during the previous audit and may move again; everything here is pinned to `be9c56f`.

## 8. Recommendation

**BUILD LATER** for the two optional hardening items below; **PARK** for both audited branches;
the current LIVE state needs no corrective action beyond the test committed here.

1. Optional, small: make `pyscf-real` fail when the runtime is absent, so the job cannot go green
   on the 2-test fallback branch. Today it is honest, but the guard depends on the runner.
2. Optional, cosmetic: print the protocol's `modelId` in the Pilot protocol panel so a reopened
   saved protocol names its model on screen as well as executing it.

Neither is blocking. Both are LIVE-side product decisions for Manus, not merges of an audit branch.
