# Particle/Collider Foundation Spec — Independent Red-Team Review

**Role:** independent auditor. No implementation, no branch merges, no changes to any existing file. This document is the only artifact this review produces.

**Scope reviewed:** `docs/PARTICLE_COLLIDER_FOUNDATION_SPEC.md` at branch `claude/collider-foundation-spec`, commit `aa0dffd`.
**Live reference point:** `manus/high-fidelity-epidemic-digital-twin` @ `66ed598` (pinned exactly as instructed — not re-fetched to a later commit).
**Review branch:** `claude/collider-spec-red-team-review`, created directly from `66ed598`, no other branch touched.

The reviewed spec was itself authored by the same session producing this review. This review does not take the spec's self-description on trust; every citation below was re-verified against the actual file contents at `66ed598`, independent of what the spec claimed.

---

## 1. Precedent verification — are the cited files/symbols real, and correctly interpreted?

| Spec claim | Verified against `66ed598` | Result |
|---|---|---|
| `SourceArtifact`/`HazardInput`/`HazardRun` in `core/hazard/contracts.ts` | Present, fields as described (`hazardModuleVersion`, `resultFingerprint`, `status: 'COMPLETED' \| 'FAILED'`, `createdAt`) | **Confirmed** |
| `StoredEvidence` in `core/discovery/evidenceStore.ts` | Present | **Confirmed** |
| `ParticleSpecies.restMassMeV` comment: *"e.g. electron: 0.511 (core/physics.ts's own BASELINE_REST_MASS_MEV)"* | `grep` for `MASS`/`_MEV`/`_GEV` in `core/physics.ts` returns only `EARTH_MASSES_PER_SOLAR` — **no rest-mass constant of any kind exists in `physics.ts`.** `BASELINE_REST_MASS_MEV = 0.511` is defined in `core/modelGraph/relativisticEnergyGraph.ts:12`, a different file. | **FALSE — misattributed.** Repeated at spec line 116 ("MeV (`physics.ts`'s `BASELINE_REST_MASS_MEV`, ...)"), same error twice. |
| `core/hazard/earthquake/rng.ts` deliberately does not import epidemic's `makeRng`, to prove isolation | File's own doc comment: *"this module deliberately does not import it: importing anything from `core/epidemic/` or `core/simulation/` would blur the isolation boundary this vertical slice is required to prove"* | **Confirmed, accurately paraphrased** |
| `particle-detector-3d.ts` picks product count from `Math.random()`, no conservation law | `const n = 5 + Math.floor(Math.random() * (6 + energy / 8));` at line 144; `honestyNote` explicitly states no real cross-sections/kinematics | **Confirmed** |
| `canonicalJson` (`core/events/hash.ts`), `sha256Hex` (`core/discovery/evidenceCrypto.ts`) | Both present, both used together in `core/hazard/fingerprint.ts` exactly as the spec describes | **Confirmed** |
| `quantizeForFingerprint` in `core/matrixFoundation/worldStateFingerprint.ts` | This module does not exist on `66ed598` at all — it exists only on the separate, unmerged `claude/matrix-foundation-sprint` branch. | **Not present on the cited live baseline.** The spec's own header says it is built on `66ed598`; at that commit, `core/matrixFoundation/` does not exist. This is not necessarily wrong as a *forward* dependency (the spec can propose depending on sibling unmerged work), but the spec never states this dependency explicitly — it reads as "already landed," which is only true on a different branch. |
| `core/provenance/recordStore.ts`'s `LocalRecordStore`/`InMemoryRecordStore`, constructor accepting `(policy, validateRecord)` / `(storageKey, policy, validateRecord)` | **Verified false.** At `66ed598`, `InMemoryRecordStore`'s constructor is `constructor(private readonly policy: DuplicateIdPolicy = 'overwrite') {}` — one parameter. `LocalRecordStore`'s is `constructor(private readonly storageKey: string, private readonly policy: DuplicateIdPolicy = 'overwrite') {}` — two parameters. **Neither accepts a third `validateRecord` argument.** | **FALSE — see §2, this is the review's central finding.** |
| `docs/PHASE0_2_PERSISTENCE_INTEGRITY.md` and `isHazardInputShape`/`isHazardRunShape` "already established" | `git show 66ed598:docs/PHASE0_2_PERSISTENCE_INTEGRITY.md` → `fatal: path ... does not exist in '66ed598'`. `grep` for `isHazardInputShape`/`isHazardRunShape`/`validateRecord` in the live `hazardProvenanceStore.ts` → zero matches. | **FALSE.** This document and these exact symbol names exist only on the reviewing session's own separate, unmerged `claude/persistence-integrity-hardening` branch. They were cited as an already-established live pattern; they are not live. |
| Manus's actual, live shape-validation mechanism | `hazardProvenanceStore.ts` defines `isHazardInputRecord`/`isSourceArtifactRecord`/`isHazardRunRecord` (different names) plus `MalformedRecordCollectionError`/`UnsafeRecordIdError` in `recordStore.ts`. Validation is applied by **wrapping each `get()` call** at the domain-store layer via a `readableRecord(rawValue, isValid)` helper — **not** by injecting a validator into `recordStore.ts`'s constructor. | A real, working, independently-built mechanism exists — it is simply **architecturally different** from what the spec describes and attributes. |
| `HazardModuleDescriptor.notModeled` | Present in `hazardModuleRegistry.ts:30` | **Confirmed** |
| `core/build/commitHash.ts`'s `codeCommitHash()` used for provenance fields like this | Present; used at minimum by `earthquakeCommandCenter.ts` for `HazardRun.codeCommitHash`, tested in `commitHash.test.ts`/`evidenceReplayIntegration.test.ts` | **Confirmed in spirit** (exact `StoredEvidence` call site not independently located, but the utility and its role are real) |
| `particle-relativistic-energy` / `universe-galaxy-collision` cases in `experimentFabric/executor.ts` | Present at lines 531 and 335 respectively, `numberParam()` helper present at line 835, `EXPERIMENT_FABRIC_VERSION` present in `types.ts:4` | **Confirmed, line numbers accurate** |
| Experiment Fabric return shape *"the existing `{ status, outputs, units, warnings, validity, assumptions, visualization, route }` shape every other ... scenario already returns"* | `ExperimentResult` interface (`experimentFabric/types.ts:97-100`) additionally requires `contractVersion: string` and **`summary: string`**. Every real case (`particle-relativistic-energy`, `universe-galaxy-collision`) includes both. The spec's own illustrative code block for §8 includes `contractVersion` but **omits `summary`**. | **Incomplete/inaccurate shape description** — see §2 |
| `ScenarioComparisonStatus` / `'BLOCKED_NOT_COMPARABLE'` in `scenarioEngine.ts` | Present as described | **Confirmed** |
| `docs/PHASE0_EVIDENCE_STORE_CONVERGENCE.md`'s "what stayed separate" reasoning | Present, and does explicitly frame the differing `EvidenceStore`/`HazardProvenanceStore` policies as "a real scientific/product distinction," which the spec correctly invokes to justify not touching `ScenarioEngine` | **Confirmed, correctly applied** |

**Summary of §1:** most citations are real and accurately interpreted. Two are materially wrong: the `physics.ts` mass-constant misattribution (minor, cosmetic) and — far more seriously — the persistence-layer API and its supporting document, which do not exist on the cited live branch at all.

---

## 2. Does the persistence design actually fit? (Review requirement #2, #5)

**No, not as written.** This is the review's most important finding.

The spec's §6 code sample:
```ts
new InMemoryRecordStore<EvidenceRecord>('reject-if-different', isEvidenceRecordShape)
new LocalRecordStore<EvidenceRecord>('collider-evidence-store/records/v1', 'reject-if-different', isEvidenceRecordShape)
```
would not compile against `66ed598`'s actual `recordStore.ts` — both constructors take strictly fewer arguments, and neither has any parameter for a shape validator. The spec attributes this design to a document (`docs/PHASE0_2_PERSISTENCE_INTEGRITY.md`) and symbol names (`isHazardInputShape`, `isHazardRunShape`) that exist only on a separate, unmerged branch from the same authoring session — not on the branch the spec explicitly claims as its baseline (`66ed598`).

The live branch **does** have a working, real, independently-engineered equivalent — but it is shaped differently: per-domain shape predicates (`isHazardInputRecord`, etc.) applied by **wrapping `get()` at the `hazardProvenanceStore.ts` layer**, with `recordStore.ts` itself staying validator-free and instead guarding against malformed *collections* (`MalformedRecordCollectionError`) and unsafe *keys* (`UnsafeRecordIdError`) only. A collider evidence store built on `66ed598` should follow **that** pattern: `isEvidenceRecordShape` wraps `ColliderEvidenceStore.getRecord()`'s return value (via a `readableRecord`-style helper, reusing that name or an equivalent), not a constructor argument to `recordStore.ts`.

This is a **narrow, mechanical fix** — the *principle* (validate shape, report corruption as absence, never fabricate) is sound and matches the live branch's actual intent. Only the wiring point is wrong.

## 2b. Does the data model itself avoid role confusion? (Review requirement #2)

**Partially — one real ambiguity.** `EvidenceRecord`'s own doc comment claims it *"mirrors `StoredEvidence` / `HazardRun`'s role"* — naming two existing records that the codebase deliberately keeps **architecturally distinct** (different persistence policies, different reasons, per `docs/PHASE0_EVIDENCE_STORE_CONVERGENCE.md`'s own "what stayed separate" section, which the spec elsewhere correctly cites). Concretely:

- `HazardRun` is a single, self-contained immutable record: physics output + `hazardModuleVersion` + `codeCommitHash` + `resultFingerprint` + `status` + `createdAt`, all in one place.
- The spec's `CollisionEvent` carries the physics output + model version + fingerprint, but **not** `codeCommitHash` or `createdAt` — those only appear on the outer `EvidenceRecord`, which also bundles `BeamState` + `CollisionEvent` + `DetectorReadout` together — closer to how `StoredEvidence` wraps a whole `DiscoveryCase`.

The spec does not resolve which single role `EvidenceRecord` actually plays, and claiming both in one sentence is not a clarification, it's the ambiguity. This does not by itself duplicate an existing contract (no existing type is reused incorrectly), but it does mean a future implementer has to make an unstated design choice: either (a) make `CollisionEvent` a complete `HazardRun`-equivalent (carry its own `codeCommitHash`/`createdAt`, with `EvidenceRecord` demoted to a thin persistence wrapper), or (b) explicitly document `EvidenceRecord` as the sole `HazardRun`-equivalent and drop the `StoredEvidence` comparison. **Required before P0:** pick one and update the doc comment; this is a documentation-precision issue, not a rebuild.

---

## 3. Unit policy (Review requirement #3)

The rule — canonical GeV/GeV·c throughout the pipeline, `restMassMeV` as the sole, cited exception, conversion via one function (`meVToGeV`) — is unambiguous, testable (§9.7 names the exact round-trip test), and does not create a hidden dimensional bug **as stated**. One gap: the spec does not specify what happens if a future contributor adds a `ParticleSpecies` with a mass expressed in the wrong unit by mistake (e.g., pastes a GeV value into `restMassMeV`) — there is no runtime assertion or test proposed that would catch an out-of-range mass (e.g., "greater than 1000" as a sanity bound for a MeV-scale table). Minor; worth a one-line guard, not a structural problem.

---

## 4. Four-momentum conservation contract (Review requirement #4 — mathematical sufficiency, not "does it sound right")

The spec is evaluated strictly on what it **specifies**, not on whether two-body decay kinematics are correct in general (they are, as a textbook method — that is not in question). What's missing for an implementer to build against without guessing:

1. **Reference frame for `energyPerBeamGeV` is underspecified.** The spec never states that a "head-on" collision assumes two beams of **equal magnitude, exactly opposite three-momentum**, along a **specified shared axis**, in the **lab frame**. Without stating this, `P_in = fourMomentum(speciesA, E) + fourMomentum(speciesB, E)` is not computable: two four-vectors need directions, not just one shared energy scalar. This must be pinned down before P0 (e.g.: "beam A travels along +z with energy `energyPerBeamGeV`, beam B along −z with the same energy; asymmetric-energy or non-collinear beams are `collisionType` values not yet defined, and P0 must reject them explicitly rather than silently mis-assume collinearity").
2. **No stated input domain / kinematic threshold.** Two-body decay requires `√s ≥ m_product1 + m_product2` for the channel to exist at all. The spec's `CollisionEvent`/`generateCollisionEvent()` never states what happens when `energyPerBeamGeV` is below this threshold for every declared channel — a real gap the review was explicitly asked to check (*"impossible channels"*), and the spec's own §9 test list has **no corresponding test**. This is a required addition, not an optional one: an implementation without it will either throw an unhandled exception or silently produce an unphysical (negative or imaginary) momentum magnitude.
3. **Tolerance `ε` for `conservationCheck.withinTolerance` is never given a value or a justification** (e.g., "float64 ULP-scale, ~1e-9 relative" vs. an arbitrary constant). Without a stated epsilon, "should be zero by construction" is a claim the test in §9.1 cannot actually be written against precisely.
4. **`NOT_MODELED` is present and reasonably scoped** (`COLLISION_NOT_MODELED`: real cross-sections, branching ratios, QCD confinement/jets, detector-material interactions, pile-up, trigger efficiency, radiative corrections) — this part is sufficient and mirrors `HazardModuleDescriptor.notModeled` correctly.

**Verdict on §4: the physics *shape* is right; the contract is not yet implementable without the three additions above.**

---

## 5. RNG/seed/hash/store/replay — real reuse or same-name-only? (Review requirement #5)

| Piece | Verdict |
|---|---|
| RNG isolation pattern (own file, not imported from epidemic/hazard) | **Genuine reuse of a real precedent** — correctly cited and correctly applied. |
| `canonicalJson` + `sha256Hex` fingerprinting | **Genuine reuse** — same two functions, same composition pattern as `hazard/fingerprint.ts`. |
| `quantizeForFingerprint` | **Real function, but not on the cited baseline branch** (see §1) — a forward dependency on unmerged work, undisclosed as such. |
| `recordStore.ts` / `'reject-if-different'` policy | **The policy choice is genuine reuse; the constructor API cited for injecting validation is not real** (see §2). |
| `ReplayVerdict` / `computeReplayVerdict` | **Real function, but not on the cited baseline branch** — same undisclosed forward-dependency issue as `quantizeForFingerprint`. Both live only on `claude/matrix-foundation-sprint`, a third branch never mentioned as a dependency anywhere in the spec. |

**This is the pattern behind essentially every finding in this review: two of the five "reused" primitives are same-name-only relative to the stated baseline — they are real, working code, just not on the branch the spec says it builds on, and the branch they DO live on is never disclosed as a prerequisite.**

---

## 6. A/B and `BLOCKED_NOT_COMPARABLE` (Review requirement #6)

Confirmed: nothing in §8 imports from, calls, or extends `core/simulation/scenarioEngine.ts`. The `EvidenceComparison`/`compareEvidenceRecords()` sketch is a new, small, standalone function; its `BLOCKED_NOT_COMPARABLE` guard only checks `collisionModelVersion` equality. This is a real behavioral echo of `ScenarioComparisonStatus`, not an import or subclass — **no hidden `ScenarioEngine` dependency found.**

One incompleteness: comparability is defined **only** in terms of matching `collisionModelVersion`. It does not address whether two `BeamState`s with different `speciesA`/`speciesB` (not just different energy) should ever be called "A/B" of the same experiment, or whether that should also be `BLOCKED_NOT_COMPARABLE`. Worth a one-line rule before P7, not a redesign.

---

## 7. Prohibited-scope check (Review requirement #7)

Checked every stage (P0–P7) and every file path named in the spec against: new renderer, City3D, GIS/live data, cascade engine, Epidemic Core, Hospital Model, Discovery Engine, routing, `WorldEngineContract`, existing Particle Lab.

**Clean.** P0–P6 propose zero existing-file changes. P7 proposes exactly one additive `case` arm in `experimentFabric/executor.ts` (a file already designed for additive cases — 40+ already registered) and one new standalone file. No path under `core/simulation/`, `core/world/`, `core/contacts/`, `labs/`, or any renderer/City3D directory is modified anywhere in the spec. The explicit closing "Boundaries carried forward" section correctly reaffirms the existing Particle Lab is untouched. **No violation found.**

---

## 8. Test-list completeness (Review requirement #8)

Requested coverage categories: determinism, replay MATCH/DRIFT/BLOCKED, unit conversion, conservation, **impossible channels**, malformed persistence, **idempotence**, import isolation, **A/B comparability**.

| Category | Covered in spec's §9 (the canonical "10 tests")? |
|---|---|
| Determinism (same seed) | Yes — #2 |
| Different seed (negative control) | Yes — #3 |
| Replay MATCH/DRIFT | Yes — #4 |
| Replay `NOT_REPRODUCIBLE` | Yes — #5 |
| Replay `BLOCKED` | **No.** `ReplayVerdict` includes `BLOCKED`, but no test scenario in §9 produces it (e.g., a `collisionModelVersion` mismatch — see §4 point 3's own suggestion that this should arguably yield `BLOCKED`, not bare `DRIFT`). |
| Unit conversion | Yes — #7 |
| Conservation | Yes — #1 |
| **Impossible channels** (below-threshold energy) | **No.** Not present anywhere in §9, and no corresponding requirement in §1's data model or §4's contract either (see §4 point 2 above — the same gap surfaces here as a missing test). |
| Malformed persistence | Yes — #6 (though written against the wrong API, per §2) |
| **Idempotence** (identical re-put is a no-op, not an error) | **Not named explicitly.** Implied by reusing `'reject-if-different'`'s existing idempotent-on-identical-content behavior, but never stated as its own test the way `evidenceStoreConvergence.test.ts`'s "Test 3 — duplicate id + bit-identical content" does for the precedent it claims to follow. |
| Import isolation | Yes — #10 |
| **A/B comparability** (`BLOCKED_NOT_COMPARABLE` behavior) | **Not in the canonical §9 list.** It appears only in the §10 P7 implementation-plan table's "Tests added" column, creating an internal inconsistency between "the 10 tests" (§9) and what P7 actually promises to test. |

**Three explicit gaps confirmed**, matching three of the exact categories the review was asked to check for. None are hard to add; all three should be added to §9 before this spec is treated as complete, and the `BLOCKED` verdict test should be added alongside them.

---

## 9. Missing definitions, risks, and unverified assumptions

**Missing definitions (blocking, must be resolved before P0):**
- Beam collinearity/axis convention for `BeamState` (§4.1).
- Kinematic threshold behavior for under-energy inputs (§4.2, §8).
- Numerical tolerance value for `conservationCheck` (§4.3).
- Single, resolved analogue for `EvidenceRecord` (`HazardRun`-shaped vs. `StoredEvidence`-shaped — §2b).
- The actual live wiring point for shape validation (§2) — must be rewritten against `hazardProvenanceStore.ts`'s real `readableRecord`-wrapping pattern, not the unmerged branch's constructor-injection pattern.

**Unverified assumptions this review could not check from the repository alone:**
- Whether `core/matrixFoundation/` (from `claude/matrix-foundation-sprint`) and the persistence-integrity work (from `claude/persistence-integrity-hardening`) will actually be merged into the live branch before P0 begins. If either is not merged, P0–P7 as scoped silently depends on unmerged, independently-reviewable work that has its own pending review status. The spec should state this dependency explicitly rather than write as if both are already live.
- Whether "two-body decay-channel table" is an acceptable simplification for the stated educational goal, or whether a reviewer will want at least a three-body channel (e.g., bremsstrahlung-like radiative correction) before calling this "a real vertical slice" — a product decision, not something this review can resolve.

**Risks carried forward from the readiness audit, not newly introduced:** none found beyond what `docs/HADRON_COLLIDER_POC_READINESS_AUDIT.md` already listed. This spec does not add new risk surface — it inherits and attempts to close the audit's own list.

---

## 10. False-calibration / real-data / operational-use check (Review requirement #10)

**Clean.** No sentence in the spec asserts calibration to a real accelerator, claims the toy decay-channel table reproduces real branching ratios or cross-sections, or implies any operational/control application. `datasetStatus: 'SCENARIO'`, the `COLLISION_NOT_MODELED` list, and the explicit `validity` string in the §8 illustrative case (*"Not a real cross-section"*) are all present and consistent with the boundary the readiness audit established. The one energy value chosen for illustration (45.6 GeV, the real LEP per-beam energy for on-shell Z⁰ production) is used correctly as a **motivating reference value**, not as a claim that this toy model reproduces LEP's actual measured results.

---

## Findings table

| # | FINDING | SEVERITY | EVIDENCE | REQUIRED REMEDIATION |
|---|---|---|---|---|
| 1 | `recordStore.ts` constructor API cited for shape validation (`validateRecord` parameter) does not exist on the cited live baseline `66ed598` | **HIGH** | `git show 66ed598:.../recordStore.ts` — both constructors take fewer arguments, no validator param | Rewrite §6 to wrap `get()` at the `ColliderEvidenceStore` layer (mirroring `hazardProvenanceStore.ts`'s real `isHazardInputRecord`/`readableRecord` pattern), not the `recordStore.ts` constructor |
| 2 | `docs/PHASE0_2_PERSISTENCE_INTEGRITY.md` and `isHazardInputShape`/`isHazardRunShape` cited as an already-established live pattern do not exist on `66ed598` | **HIGH** | `git show 66ed598:docs/PHASE0_2_PERSISTENCE_INTEGRITY.md` → path does not exist; zero grep matches for the symbol names in live `hazardProvenanceStore.ts` | Remove the citation or explicitly label it as a dependency on the separate, unmerged `claude/persistence-integrity-hardening` branch, pending its own review |
| 3 | `quantizeForFingerprint` and `ReplayVerdict`/`computeReplayVerdict` are real but live only on the unmerged `claude/matrix-foundation-sprint` branch, never disclosed as a prerequisite | **MEDIUM** | `core/matrixFoundation/` does not exist at `66ed598` | State the dependency on `claude/matrix-foundation-sprint` explicitly in the spec's header/assumptions, or inline the two functions' definitions so the spec is self-contained against the stated baseline |
| 4 | Four-momentum conservation contract underspecifies beam collinearity/axis, the kinematic (below-threshold) input domain, and the numerical tolerance for `conservationCheck` | **MEDIUM** | Spec §4, reviewed against what an implementer would need — see §4 of this report | Add explicit beam-axis convention, an explicit rejection/verdict path for below-threshold energy, and a stated numerical epsilon |
| 5 | `EvidenceRecord`'s doc comment claims to mirror both `StoredEvidence` and `HazardRun`, two contracts the codebase deliberately keeps distinct | **MEDIUM** | Spec line 98 comment; `docs/PHASE0_EVIDENCE_STORE_CONVERGENCE.md`'s "what stayed separate" | Pick one analogue explicitly; likely resolution is `HazardRun`-shaped (immutable, `'reject-if-different'`), with `codeCommitHash`/`createdAt` moved onto `CollisionEvent` itself |
| 6 | §9's "10 tests" omit three categories the spec itself promises elsewhere: a `BLOCKED`-verdict test, an impossible/below-threshold-channel test, and an explicit A/B-comparability test (the last only appears in the §10 P7 table, not §9) | **MEDIUM** | Cross-check of spec §4, §8, §9, §10 | Add the three tests to the canonical §9 list; also add an explicit idempotence test naming (currently only implied) |
| 7 | `ParticleSpecies.restMassMeV`'s example comment misattributes `BASELINE_REST_MASS_MEV` to `core/physics.ts`; the constant is in `core/modelGraph/relativisticEnergyGraph.ts` (repeated at spec lines 36 and 116) | **LOW** | `grep` confirms no mass constant of any kind in `physics.ts` | Correct the file attribution in both places |
| 8 | §8's stated Experiment Fabric return shape omits `summary` (and the illustrative code block does too), though `ExperimentResult` requires it and every real case includes it | **LOW** | `experimentFabric/types.ts:97-100`; both real cited cases include `summary` | Add `summary` to the shape description and the illustrative code |
| 9 | A/B comparability rule only checks `collisionModelVersion`; does not state whether differing `speciesA`/`speciesB` should also block comparison | **LOW** | Spec §8 `compareEvidenceRecords()` sketch | Add one explicit rule before P7 |
| 10 | No guard proposed against a `ParticleSpecies` rest mass being entered in the wrong unit (e.g., GeV pasted into `restMassMeV`) | **LOW** | Spec §2 | Add a sanity-range assertion or a test, not a structural fix |

---

## GO / NO-GO conditions for a future, separately approved implementation

**GO only if, before P0 begins:**
1. §6 (persistence) is rewritten against the *actual* live `recordStore.ts`/`hazardProvenanceStore.ts` pattern (Finding 1), or against a merged version of `claude/persistence-integrity-hardening` if that branch is merged first — but not written as if both already coexist today.
2. The `claude/matrix-foundation-sprint` dependency (`quantizeForFingerprint`, `ReplayVerdict`, `computeReplayVerdict`) is either merged first or explicitly vendored/inlined so P0–P7 do not silently depend on a second unreviewed branch (Finding 3).
3. The four-momentum contract gains an explicit beam-axis convention, a below-threshold rejection path, and a stated numerical tolerance (Finding 4).
4. `EvidenceRecord`'s role is resolved to one precedent, not two (Finding 5).
5. §9's test list gains the three missing categories (Finding 6).

**NO-GO conditions (would require rejecting, not remediating):** none found. No finding in this review indicates the underlying design direction is unsound, that it duplicates an existing engine, that it violates the prohibited-scope list, or that it makes any false scientific/operational claim. Every finding is a fixable specification-precision defect, not an architectural or ethical one.

---

## Final verdict

# NEEDS_SPEC_REMEDIATION

The design direction is sound and the reuse discipline is genuine where it's actually reuse — the RNG isolation choice, the fingerprint-pair reuse, the decision not to touch `ScenarioEngine`, and the prohibited-scope compliance are all independently verified and correct. But two HIGH-severity findings mean the spec as written cites a persistence-layer precedent that **does not exist on the branch it claims to build on** — an implementer following §6 literally would be unable to compile it against `66ed598`, and would discover only then that the "already established" pattern it names lives on a different, unmerged branch. That must be fixed before this spec is ready for the separate implementation-approval decision the user has reserved for later.

No code was written, no branch was merged, and no existing file was changed in the course of this review.

**NO IMPLEMENTATION / NO MERGE / NO CHANGE TO EXISTING FILES / NO COLLIDER PHYSICS / NO NEW SOLVER / NO CERN DATA / NO LIVE DATA / NO ACCELERATOR CONTROL / NO UI / NO CITY3D / NO GIS / NO MATRIX WORLD CHANGE / NO EPIDEMIC CORE CHANGE / NO EARTHQUAKE CHANGE / NO SCENARIOENGINE CHANGE.**
