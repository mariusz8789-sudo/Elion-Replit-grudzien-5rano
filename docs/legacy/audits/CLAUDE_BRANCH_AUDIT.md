# Claude Branch Audit — pre-integration review of `claude/quantum-forge-p845ux`

Read-only CTO audit. Nothing was merged, nothing was pushed to LIVE, no feature code was
written. Every claim below is the observed result of a command that was actually executed;
anything that could not be executed in this container is marked `VERIFY_REQUIRED` or
`BLOCKED_BY_RUNTIME` instead of being asserted.

## 1. Audited LIVE HEAD

`origin/manus/high-fidelity-epidemic-digital-twin` = **`c6ae7d3a8b1ac282cf5f4b4f9100cd9f95f6fe45`**
("feat: add capability admission matrix contract", 2026-08-27 18:21:48 +0000).

Audit branch: `claude/audit-verify-c6ae7d3`, created from `c6ae7d3`.

## 2. Audited branch commit

`claude/quantum-forge-p845ux` = **`4fe3c3b01dcac771990a9aa670dd9e09beae0c85`**
("refactor(fabric): keep the live-network OSM import out of the public barrel").

Merge base of the two = `be529d3` ("fix: route pilot earthquake through command center").
LIVE has advanced **31 commits** past that merge base; the audited branch has **3**.

## 3. Diff summary

**The headline result: LIVE has already absorbed this branch.** Manus integrated the work
between 14:40 and 15:37 UTC on 2026-08-27, in commits `79fa42f` / `7ad97ef`
("fix: enforce ci and gis boundaries") and `0efeb31`
("fix(fabric): honest generic executor and provenance for non-executed runs").

Byte-identical on LIVE (`git diff --quiet` returns 0):

- `packages/frontend/src/core/experimentFabric/executor.ts`
- `packages/frontend/src/__tests__/realEngineExecutorCoverage.test.ts`

Present on LIVE in a re-implemented form:

- `provenance.ts` — `resultOriginForRunStatus` is present verbatim; LIVE additionally narrows
  the `backendExecution` field inside the run-fingerprint input (Manus, `7acb9b8`).
- `index.ts` — `importOsmMap` is removed from the barrel; LIVE dropped the explanatory comment.
- `.github/workflows/ci.yml` — markdown is excluded, with a **stronger** pathspec than the branch.
- `gisImportBoundary.test.ts` (LIVE, 3 tests) replaces `gisBarrelBoundary.test.ts` (branch, 5 tests).

`git diff --stat c6ae7d3 4fe3c3b` = **32 files, +184 / −1929**. Applying the branch onto LIVE
would delete roughly 1,929 lines of Manus's newer work (Scientific Memory, capability admission
matrix, backend protocol execution, PySCF A/B evidence, control-plane research docs).

Net content the branch holds that LIVE does not:

| Item                                                                    | Lines | Assessment                                                                               |
| ----------------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------- |
| `scripts/verify-whitespace-gate.mjs` + `npm run verify:whitespace-gate` |   +75 | Useful, but asserts the branch's **superseded** filter. Needs rewriting before any port. |
| `gisBarrelBoundary.test.ts`                                             |   +67 | Two guards LIVE's version lacks (see §6).                                                |
| `ci.yml` pathspec                                                       |    −6 | **Regression** against LIVE. Must not be ported.                                         |

## 4. Finding 1 — Earthquake generic `runExperiment`

**Status on LIVE: FIXED. Verified by execution, not by reading the diff.**

A probe enumerated all 55 router models, computed each one's capability through
`createExperimentIntent`, and executed every `REAL_ENGINE` model through `runExperiment` with
its registered default parameters. Result:

- 36 models classified `REAL_ENGINE`;
- exactly one does not reach `status: 'completed'` — `earthquake-scenario`, the documented adapter
  exception;
- observed record:
  `{ id: 'earthquake-scenario', status: 'capability_seam', origin: 'capability-seam', deterministic: false, summary: 'Model earthquake-scenario jest realnym silnikiem, ale nie ma adaptera w generic Experiment…' }`.

The pre-fix behaviour (`status: 'failed'`, `summary: 'Realny silnik zwrócił błąd wykonania.'`,
`validity: 'Nieobsługiwany adapter earthquake-scenario.'`) is gone. The standing guard test
`realEngineExecutorCoverage.test.ts` (6 tests) passes on LIVE and pins the invariant: every
`REAL_ENGINE` model either completes in the generic executor or is a documented exception whose
generic result must be non-`completed`, non-`failed`, non-`real-engine`. Backend-only and
hypothetical capabilities are explicitly out of the guard's scope.

## 5. Finding 2 — CI whitespace gate

**Status on LIVE: FIXED, and LIVE's version is strictly better than the branch's.**

LIVE: `git diff --check "$base" "$GITHUB_SHA" -- . ':(exclude,glob)**/*.md' ':(exclude,glob)**/*.markdown'`
Branch: `git diff --check "$base" "$GITHUB_SHA" -- . ':(exclude)*.md'`

Both pathspecs were executed against a throwaway repository containing a top-level `README.md`,
a nested `docs/a.md`, a nested `docs/deep/b.markdown` and an `f.ts`:

| Change                                                 | LIVE pathspec     | Branch pathspec                                          |
| ------------------------------------------------------ | ----------------- | -------------------------------------------------------- |
| Markdown hard line-breaks in `.md` **and** `.markdown` | exit **0** (pass) | exit **2** (**false failure** on `docs/deep/b.markdown`) |
| Trailing whitespace in `f.ts`                          | exit **2** (fail) | exit **2** (fail)                                        |

The branch's filter does not cover `.markdown`. **Do not port it.** `verify-whitespace-gate.mjs`
on the branch encodes the branch's filter and is therefore stale as written.

## 6. Finding 3 — GIS barrel

**Status on LIVE: FIXED.** `importOsmMap` is absent from `core/experimentFabric/index.ts`;
`normalizeOsmMapXml`, `OSM_ATTRIBUTION`, `OSM_LICENSE` and the types remain public, which
`CloudProjectsScreen.tsx:32` requires. `gisImportBoundary.test.ts` passes on LIVE.

Coverage gap (P3, not a defect): LIVE's guard is narrower than the branch's in two ways.

1. Caller scan covers only `core/experimentFabric`; the branch scanned all of `core/`.
2. LIVE has no assertion that `spatialImport.ts` remains the **only** Experiment Fabric module
   with a network call — the check that would catch a _new_ live fetch appearing elsewhere.

The branch's wider suite was executed unmodified against LIVE: **5/5 passed**. LIVE satisfies
the stricter guard today; it simply is not pinned there.

Note: LIVE's guard asserts `barrel` source text does not match `/\bimportOsmMap\b/`, so the
branch's explanatory comment in `index.ts` is incompatible with it. That is why Manus removed
the comment. Any future documentation of the reason must live outside `index.ts`.

## 7. `resultOrigin` audit

The defect being audited: `createExperimentProvenance` derived `resultOrigin` from the _declared
capability_, so a run in which no engine executed was stamped `resultOrigin: 'real-engine'`.
This affected every `rejected` or `failed` `REAL_ENGINE` / `BACKEND_REAL_ENGINE` run.

LIVE now calls `resultOriginForRunStatus(input.result.status, input.plan.intent.capability)`.
Observed on LIVE:

| Case                                                     | `status`          | `resultOrigin`         | `deterministic` |
| -------------------------------------------------------- | ----------------- | ---------------------- | --------------- |
| `einstein-schwarzschild`, `massSolar: 1`                 | `completed`       | `real-engine`          | true            |
| `einstein-schwarzschild`, `massSolar: -5` (out of range) | `rejected`        | `engine-not-available` | false           |
| `earthquake-scenario` via generic executor               | `capability_seam` | `capability-seam`      | false           |
| Earthquake via command centre (Chromium)                 | `completed`       | `real-engine`          | true            |

Discrimination between the required states is therefore explicit and observed:

- **REAL_ENGINE** — only a `completed` run reports `real-engine`.
- **REJECTED** — validation failure; reports `engine-not-available`, never `real-engine`.
- **FAILED** — thrown adapter error; reports `engine-not-available`, never `real-engine`.
- **UNAVAILABLE** — `knowledge_only` / `capability_seam` / `engine_not_available` map to their own
  origins.
- **MOCK** — no code path produces one. `HYPOTHETICAL_VISUALIZATION` is the nearest concept and
  maps to `hypothetical-visualization`, distinct from `real-engine`.

The capability registry is not bypassed: capability still comes from `plan.intent.capability`,
and `resultOriginForRunStatus` delegates to `resultOriginForCapability` for the non-completed
branch. No model was added or reclassified — 55 router models on LIVE, 55 on the branch.

## 8. Evidence / Replay impact

All four admission gates still require `completed && resultOrigin === 'real-engine'`:

- `evidenceGuidedChat.ts:168` (Scenario Capsule from a confirmed experiment)
- `orchestration.ts:62`
- `scenarioCapsule.ts:65`
- `scenarioCapsule.ts:87` (Evidence Pack runs)

The change can only make these gates **stricter**, never looser: values move away from
`real-engine`, never toward it. No gate was removed, relaxed, or re-implemented. No second
Evidence, Replay, provenance, router or renderer system exists on the branch — it touches
8 files, none of them router, Evidence, Replay, renderer, GIS or Campaign.

Fingerprint impact: `runFingerprint` hashes `requestFingerprint`, `planFingerprint`, `status`,
`outputs`, `units`, `warnings`, `backendExecution` — **not** `resultOrigin`. So the provenance
change alone shifts no fingerprint. The executor change does move the generic
`earthquake-scenario` run from `failed` to `capability_seam`, which changes that run's
fingerprint; no persisted artifact can depend on it, because a Scenario Capsule or Evidence Pack
has always required a `completed` run, which that path never produced. Chromium confirmed the
real Earthquake run fingerprint `run_b74740fc` is identical on desktop and mobile.

## 9. Regression audit

- Full frontend suite on LIVE: **138 files, 1412 passed, 1 skipped**.
- Backend suite on LIVE: **311 tests, 271 passed, 0 failed, 40 skipped**.
- Earthquake Science Chat / Pilot vertical slice: intact (§11).
- Protocol / A-B: tab mounts on both viewports, exposes "Zarejestruj protokół", 3 selects,
  9 inputs. No console errors.
- PySCF A/B: see §12 and §13.

## 10. Test results

| Gate                                                                                                                                | Result                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Frontend tests (`vitest run --maxWorkers=1`)                                                                                        | **PASS** — 138 files, 1412 passed, 1 skipped                           |
| Backend tests                                                                                                                       | **PASS** — 271 passed, 0 failed, 40 skipped (all `BLOCKED_BY_RUNTIME`) |
| Typecheck (`tsc --noEmit`)                                                                                                          | **PASS**                                                               |
| Lint (`eslint .`)                                                                                                                   | **PASS**                                                               |
| Production build                                                                                                                    | **PASS** (pre-existing chunk-size advisory only)                       |
| `git diff --check` with LIVE pathspec                                                                                               | **PASS** — exit 0                                                      |
| Guard suites (`realEngineExecutorCoverage`, `gisImportBoundary`, `experimentFabric`, `backendEvidenceExecution`, `experimentPilot`) | **PASS** — 123 passed, 1 skipped                                       |
| Branch's wider GIS guard, run against LIVE                                                                                          | **PASS** — 5/5                                                         |

The 40 skipped backend tests are honestly labelled in their own output
(`RDKit/ADMET-AI niedostępne — BLOCKED_BY_RUNTIME (uczciwy stan)`). They are skips, not
fabricated passes.

## 11. Chromium results

Chromium 141.0.7390.37 headless, ANGLE/SwiftShader, cache disabled, against the production build.

| Check                                          | Desktop 1600x1000                         | Mobile 390x844           |
| ---------------------------------------------- | ----------------------------------------- | ------------------------ |
| Earthquake plan then confirm                   | `Earthquake run gotowy`, Replay `MATCH`   | identical                |
| `engine`                                       | `genesis-earthquake-command-center@1.0.0` | identical                |
| `resultOrigin`                                 | `real-engine` (run actually completed)    | identical                |
| `runFingerprint`                               | `run_b74740fc`                            | `run_b74740fc`           |
| `structuralDamage`                             | `NOT_MODELED`                             | `NOT_MODELED`            |
| "Realny silnik zwrócił błąd wykonania" present | **no**                                    | **no**                   |
| "Nieobsługiwany adapter" present               | **no**                                    | **no**                   |
| Protocol / A-B tab                             | mounts, controls present                  | mounts, controls present |
| Console errors                                 | **0**                                     | **0**                    |
| Horizontal overflow                            | **none**                                  | **none**                 |

Screenshots: `branch-audit-desktop.png`, `branch-audit-mobile.png` (session scratchpad, not
committed).

## 12. CI result

Run [`33103998681`](https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/33103998681)
on `10c8ca5` (branch `claude/audit-verify-c6ae7d3`): **success**, all 15 steps green, finished
2026-08-27T18:34:42Z. Whitespace gate, lint, frontend tests, backend tests, typecheck,
production build and artifact upload all passed.

Prior, already-recorded evidence: run `33085676219` on `4fe3c3b` concluded **success** (all 15
steps), and LIVE's own history shows the equivalent work green after Manus integrated it.

## 13. Known limitations

- `VERIFY_REQUIRED` — **PySCF numeric A/B benchmark.** `pyscf` is not installed in this
  container (`import pyscf` raises `ModuleNotFoundError`; `requirements-pyscf.txt` pins
  `pyscf==2.14.0`). The committed artifact `docs/evidence/GENESIS_PYSCF_H2_AB_EVIDENCE.json`
  records two `completed` runs with `resultOrigin: real-engine`, `engine: pyscf@2.14.0`,
  `honesty: real_external_engine`. Those numbers were **not** reproduced here and are not
  asserted by this audit. What _was_ confirmed is the honesty guard: backend test
  `Fabric API rejects PySCF execution instead of emitting fabricated quantum output without runtime`
  passes, so the absent runtime yields a rejection rather than invented output.
- `VERIFY_REQUIRED` — RDKit and ADMET-AI paths (40 skipped backend tests) for the same reason.
- Not asserted visually: the Earthquake City3D overlay is a THREE.Group
  (`read-only-earthquake-scenario-overlay`), not text, so the DOM-based smoke cannot see it. The
  code path was read and is intact; a pixel-level assertion was not made.
- Chromium ran under SwiftShader, not a real GPU.
- LIVE moved during this audit (`be529d3` to `c6ae7d3`, 31 commits). All results above are
  pinned to `c6ae7d3`.

## 14. Risks

| Risk                                                                              | Severity | Note                                                                                 |
| --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| Merging `4fe3c3b` into LIVE deletes ~1,929 lines of newer work                    | **High** | The branch is 31 commits behind; this is the decisive reason for the recommendation. |
| Porting the branch's `ci.yml` would reintroduce false CI failures on `.markdown`  | Medium   | Proven by execution in §5.                                                           |
| Porting `verify-whitespace-gate.mjs` unchanged would encode the superseded filter | Medium   | The script must be rewritten against LIVE's pathspec first.                          |
| LIVE's GIS guard is narrower than the branch's                                    | Low (P3) | LIVE passes the stricter guard today; only the pin is missing.                       |
| The reason `importOsmMap` is barrel-private is now undocumented in `index.ts`     | Low      | Forced by LIVE's regex-based guard.                                                  |

No risk was found to Evidence, Replay, fingerprint stability, the capability registry, Protocol
/ A-B, or the Earthquake vertical slice.

## 15. Exact files changed by the audited branch

Against its own base `be529d3`, `4fe3c3b` changed 8 files (+279 / −6):

```
.github/workflows/ci.yml                                          |  6 +-   [superseded on LIVE]
package.json                                                      |  1 +    [not on LIVE]
packages/frontend/src/__tests__/gisBarrelBoundary.test.ts         | 67 +     [replaced on LIVE]
packages/frontend/src/__tests__/realEngineExecutorCoverage.test.ts| 95 +     [IDENTICAL on LIVE]
packages/frontend/src/core/experimentFabric/executor.ts           | 10 +     [IDENTICAL on LIVE]
packages/frontend/src/core/experimentFabric/index.ts              |  5 +-    [equivalent on LIVE]
packages/frontend/src/core/experimentFabric/provenance.ts         | 27 +-    [equivalent on LIVE]
scripts/verify-whitespace-gate.mjs                                | 74 +     [not on LIVE]
```

This audit itself changed exactly one file: `docs/CLAUDE_BRANCH_AUDIT.md`.

## 16. Recommendation

**PARK**

The branch's substance is already on LIVE and verified working there by execution, not by
inspection. Integrating it now would be a net regression: it would revert 31 commits of newer
work and replace LIVE's superior whitespace pathspec with one that produces false failures on
`.markdown`. There is nothing left in it that LIVE needs as-is.

Two optional, independent follow-ups — neither blocking, both small enough for a normal LIVE
commit rather than a branch merge:

1. Widen `gisImportBoundary.test.ts` to scan all of `core/` and to assert that `spatialImport.ts`
   stays the only Experiment Fabric module with a network call. LIVE already passes both.
2. If a whitespace-gate proof script is wanted, write it fresh against LIVE's pathspec
   (`':(exclude,glob)**/*.md' ':(exclude,glob)**/*.markdown'`). Do not port the branch's copy.

`claude/quantum-forge-p845ux` can be deleted once these two items are decided.
