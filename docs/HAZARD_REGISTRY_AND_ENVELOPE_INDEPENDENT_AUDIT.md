# Independent Audit: Hazard Registry and Earthquake Execution Envelope

**Audited commits:** `4ff08bd` (hazard module registry) and `287a788` (Earthquake execution envelope).
**Audit baseline:** delivered `manus/high-fidelity-epidemic-digital-twin` at `f04520f`, whose demonstrator commit is `f81a649`.
**Audit scope:** source review, isolated validation, compatibility review and integration recommendation only. No candidate code was merged during this audit.

## Executive finding

The candidates are **functionally sound within their stated hazard-domain boundary**. They add no hazard solver, City3D, GIS, live data, cascade engine, routing change, or epidemic-core import. Their new tests exercise meaningful compatibility and blocked states rather than only checking types.

They are nevertheless **not recommended for a blind additive merge** into the delivered demonstrator. The Earthquake envelope duplicates most orchestration already implemented in `core/simulationRenderer/earthquakeCommandCenter.ts`, while the registry documentation contradicts the current replay code about whether the capability fence is wired. A clean future adoption requires a small, explicitly reviewed refactor that chooses one upstream orchestration owner rather than retaining two near-identical paths.

| Candidate | Audit verdict | Integration recommendation |
|---|---|---|
| `4ff08bd` Hazard Module Registry | **Pass with documentation correction required** | Candidate for a focused future integration after its replay-documentation mismatch is corrected. |
| `287a788` Earthquake Demo Envelope | **Pass as a domain-only adapter; defer merge** | Do not merge additively. Consider only in a follow-up that refactors the existing command-center helper to consume one chosen upstream service. |

## What was reviewed

The registry range (`558aa03..4ff08bd`) changes eight paths: a registry, replay admission, projection constant export, tests, docs and the standalone Earthquake E2E helper. The envelope range (`4ff08bd..287a788`) adds the domain-only envelope, eight focused tests, docs and a barrel export.

A non-mutating Git merge-tree check of the delivered branch and `287a788` produced a merge tree successfully, so there is **no textual merge conflict**. This does not remove the semantic overlap described below.

## Registry assessment

`hazardModuleRegistry.ts` provides a frozen descriptor for the sole registered module, `earthquake`. Its compatibility fence checks registered type, input/run linkage, module version and optional projection schema version. The descriptor reuses the source module’s model version, schema version and `notModeled` values rather than reproducing solver logic.

The candidate modifies `replayHazardRun()` only when a caller explicitly supplies `hazardType`; it then applies the compatibility fence before retrieving the artifact or evaluator execution. Calls that omit `hazardType` retain the domain-neutral Phase 0 replay path. This preserves the existing `MATCH`, `DRIFT`, `BLOCKED` and `NOT_REPRODUCIBLE` result convention while making a module-specific admission check opt-in.

The focused registry tests verify descriptor contents, runtime immutability, unknown module rejection, five compatibility mismatches, evidence-field alignment with the live evidence gate, and import isolation. That is useful coverage for an architectural fence.

### Required correction before adoption

The narrative registry document states that the registry is **not** wired into `hazardReplay.ts`, while the current candidate replay implementation does apply the optional fence when `hazardType` is supplied. This is a documentation-versus-code inconsistency. The behavior is reasonable; the documentation must be corrected before the branch can be treated as a reviewer-ready audit record.

## Envelope assessment

`buildEarthquakeDemoEnvelope(spec, codeCommitHash, store?)` composes the registered descriptor, validation, existing runner, immutable provenance persistence, module compatibility, evidence pack, replay `MATCH` requirement and pure Earthquake projection. It returns `READY` or `BLOCKED` and does not import React, Three.js, City3D, CityWorld, routing, epidemic simulation, discovery, GIS or UI.

The isolated envelope tests prove a `READY` result, cross-store deterministic scientific output, invalid-spec blocking, immutable-store conflict blocking, evidence incompleteness with an empty commit hash, and genuine replay drift from a tampering-on-read store. The candidates therefore do not merely add a pleasant DTO; their blocked states are exercised through real lower-level gates.

### Integration issues that require a deliberate refactor

| Finding | Why it matters for the delivered demonstrator | Required future treatment |
|---|---|---|
| Orchestration overlap | The existing command-center service already runs scenario → persistence → evidence → replay → projection before explicit mapping/gating. The envelope performs almost the same upstream chain. | Choose one service as the source of truth; do not keep both chains in production. |
| Store default differs | The envelope defaults to `InMemoryHazardProvenanceStore`; the delivered UI requires `LocalHazardProvenanceStore` so provenance survives refresh. | A UI refactor must explicitly inject the local store. |
| Block-code granularity | The envelope categorizes an immutable provenance ID conflict as `REGISTRY_INCOMPATIBLE`, although it can occur without a registry version mismatch. | Consider a future `PROVENANCE_CONFLICT` code or document the broader meaning; do not silently reinterpret it in UI. |
| Replay fence adoption | The delivered command-center helper currently calls replay without `hazardType`, so merging the registry alone would not yet apply its fence to the live UI path. | Integrate the fence only through the chosen upstream service, with direct workflow and Chromium regression tests. |

## Independent validation

The detached audit worktree at `287a788` passed the following checks with the exact candidate source:

| Check | Independent result |
|---|---|
| Registry + envelope + Earthquake focused tests | **66 / 66 passed** across three files. |
| Full frontend suite | **123 files / 1,297 tests passed** in single-worker mode. |
| TypeScript | `tsc --noEmit` passed. |
| Production build | Passed; retained the existing large-chunk advisory only. |
| Whitespace diff check | Passed. |
| Merge-tree compatibility | Clean tree produced; no textual conflict with the delivered branch. |

## Safe next action

The next safe implementation is **not** another hazard. It is a bounded refactor proposal, reviewed independently before code changes, that either:

1. adopts the registry and changes `executeEarthquakeCommandCenterScenario()` to call one domain-only envelope with an injected local store, then continues into the existing explicit mapping and City3D gate; or
2. keeps the existing command-center service and selectively adds the registry fence in that one service, avoiding the envelope entirely.

Option 1 produces a cleaner reusable hazard-domain seam but needs a carefully planned UI-state migration. Option 2 is smaller but retains two upstream abstractions in separate branches. Neither option should be mixed with a second hazard, GIS import, real data, cascade, routing or epidemic changes.
