# Temporal Engine Phase 1 — Handoff

**Branch:** `claude/temporal-engine-phase-1` (created from audited HEAD `6a6b442`)
**HEAD after this stage:** `63e7385`
**Protected and untouched:** `manus/next-gap-observation-analysis` (`6a6b442`), `claude/quantum-forge-p845ux` (`4fe3c3b`) — no reset, no overwrite, no delete.

## Stage completed: M1 — TemporalStateEnvelope + observation status

| Item | Value |
|---|---|
| Files added | `packages/frontend/src/core/simulation/temporalState.ts`, `packages/frontend/src/__tests__/temporalState.test.ts` |
| Files modified | none |
| Frontend tests | 163 files / 1740 passed / 1 skipped (baseline before this stage: 162 / 1730 / 1 — exactly +1 file, +10 tests) |
| Backend tests | 275 passed / 0 failed / 40 skipped (workspace untouched) |
| Lint | clean |
| `tsc --noEmit` | clean |
| Build | clean (pre-existing Vite chunk-size advisory only) |
| `git diff --check` | clean |
| E2E desktop | 27 routes / 219 interactions — zero runtime errors |
| E2E mobile | 27 routes / 242 interactions — zero runtime errors |

## What M1 actually does

`buildTemporalTimeline(run, branchRole)` turns a **real** `ScenarioRun` into a per-day chain of
`TemporalStateEnvelope`, so each step on a timeline states where its state came from.

Design decisions that are load-bearing, not stylistic:

- **Status is derived, never passed in.** There is no parameter through which a caller could label a
  model output `OBSERVED`. `deriveObservationStatus()` reads the run.
- **`OBSERVED` / `RECONSTRUCTED` / `INFERRED` have no producing code path in Phase 1.** Genesis has
  neither real-world capture nor a historical data source. They exist in the vocabulary so Phase 2
  does not have to invent one; `TEMPORAL_STATUS_UNREACHABLE_IN_PHASE_1` and a test assert nothing
  produces them.
- **Day 0 is `NOT_AVAILABLE`, not a filled-in number.** The Scenario Engine's series starts at day 1
  (`for (let day = 1; day <= days; day++)`), so day 0 has no sample and the envelope says so.
- **`calendarTime` is always `NOT_AVAILABLE`.** The model counts run days, not dates. Attaching 2018
  or 2050 to a state would be fabrication.
- **No new hashing scheme, no wall-clock timestamp.** Reuses the existing `fnv1a`/`canonicalJson`
  pair; carries no `createdAt`, matching the determinism of `SavedScenarioRunContext`.

## Parked blockers (recorded, not worked around)

1. **Status vocabulary mismatch — needs a decision.** The Phase 1 spec mandated
   `OBSERVED/RECONSTRUCTED/INFERRED/SIMULATED/COUNTERFACTUAL/UNKNOWN/NOT_AVAILABLE`; a later
   instruction asked for `VERIFIED/LIKELY/UNVERIFIED/NOT_AVAILABLE`. The implemented vocabulary is
   the former, because a model output is neither "verified" nor "unverified" — it is simulated, and
   labelling it on a verification scale would misdescribe it. `VERIFIED/LIKELY/UNVERIFIED` is the
   right vocabulary for the **research** track (external claims), not for model states. The
   envelope already carries the substance requested — source (`scenarioId` + run fingerprints),
   version (`contractVersion`, `engineVersion`), hash (`stateFingerprint`), and an explicit status.
2. **Duplicate-path risk ahead of M2.** Two parallel baseline/intervention paths exist:
   `core/simulation/scenarioCommandCenter.ts` (UI adapter, no divergence, no persistence) and
   `core/simulation/scenarioCounterfactual.ts` (engine with measured `firstDivergentDay`, save,
   replay). M2 must **re-point** the first at the second. Adding a third path would be a regression.
3. **M1 has no UI surface yet**, so the browser E2E above is regression coverage — it does not
   prove new visible behaviour. Nothing imports `temporalState.ts` yet (verified by grep), so it
   cannot affect the bundle.
4. **Two unmerged branches still pending review** (audit recommendation: do not let Phase 1 depend
   on them): `claude/matrix-foundation-sprint` (`be6887b`, zero file overlap — mechanically clean
   merge) and `claude/evidence-pack-connector` (overlaps `ScientificMemoryScreen.tsx` and
   `knowledge/registry.ts` — cherry-pick `counterfactualEvidence.ts` only).

## E2E recipe in this environment

The smoke harness needs a server on `127.0.0.1:8080` and a Chromium path:

```bash
node packages/backend/src/server.mjs &          # serves packages/frontend/dist + /api on 8080
export CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
npm run smoke:desktop && npm run smoke:mobile
```

A plain static server is not enough — the app posts to `/api`, which only the backend answers.

## Stage completed: M2 + M4 — re-pointed timeline on the counterfactual engine

`scenarioCommandCenter.ts` no longer calls `runScenario()` twice + `compareScenarios()` directly —
it delegates to the existing `runScenarioCounterfactual()`, so `ScenarioCommandCenterRun` now carries
a real, measured `firstDivergentDay` and `counterfactualFingerprint` instead of nothing. A new
`temporalTimelinesFor()` builds both arms via `buildTemporalTimeline()` (M1) for the panel to scrub.
No third comparison path was created — this is the duplicate-path risk from the previous stage,
resolved by re-pointing rather than extending.

`ScenarioCommandCenterPanel.tsx`: the single-arm day slider now drives two branch rows (`TIMELINE A —
BASELINE`, `TIMELINE B — INTERVENTION`), each showing its `TemporalStateEnvelope`'s
`observationStatus` (`SIMULATED` / `COUNTERFACTUAL` / `NOT_AVAILABLE`), plus a divergence marker
showing the **measured** `firstDivergentDay` — never the declared intervention-start day.

**Real Chromium proof (not just unit tests):** navigated to `#/city3d`, ran the existing scenario
button, and confirmed live: divergence marker read `ROZJAZD (mierzony): DZIEŃ 1`; scrubbing to day 5
showed `SIMULATED`/`COUNTERFACTUAL` rows with different real numbers (I 13 vs I 11); scrubbing to day
0 showed `NOT_AVAILABLE` on both arms rather than a fabricated sample; the existing replay button
still returned `BASELINE MATCH · INTERVENTION MATCH` — the re-point did not break the pre-existing
replay machinery. Full regression: desktop smoke 27 routes/238 interactions zero errors, mobile 27
routes/242 interactions zero errors (up from 219/242 before this stage — the new rows add
interactive surface, not instability).

| Item | Value |
|---|---|
| Files modified | `scenarioCommandCenter.ts`, `ScenarioCommandCenterPanel.tsx`, `styles.css`, `scenarioCommandCenter.test.ts` |
| Files added | none |
| Frontend tests | 163 files / 1744 passed / 1 skipped (previous stage: 163/1740 — +4 tests, 0 new files) |
| Backend tests | 275 passed, unchanged |
| Lint / tsc / build / `git diff --check` | all clean |
| E2E desktop | 27 routes / 238 interactions — zero runtime errors |
| E2E mobile | 27 routes / 242 interactions — zero runtime errors |
| Targeted Temporal Engine E2E | divergence marker, branch labels, day-5 SIMULATED/COUNTERFACTUAL rows, day-0 NOT_AVAILABLE, replay MATCH — all confirmed live in Chromium |

### Parked / carried forward

- The status-vocabulary decision from the previous stage stands: `SIMULATED/COUNTERFACTUAL/…`, not
  `VERIFIED/LIKELY/UNVERIFIED` — reaffirmed by the user.
- Both arms in this adapter start at day 0 (no delayed-intervention control exists in this UI), so
  `firstDivergentDay` is measured but typically very early. That is a correct, honest measurement of
  *this* adapter's inputs, not a limitation of the engine — `scenarioCounterfactual.ts` already
  supports `baselineInterventionStartDay`/`variantInterventionStartDay`, this UI just doesn't expose
  them. Out of scope for M2/M4; a candidate for a later milestone if a delayed-intervention demo is
  wanted.
- `replayScenarioCommandCenter()` (per-arm `replayScenario()`, MATCH/DRIFT/NOT_COMPARABLE) was left
  untouched — it is a different, lighter-weight replay concept than the memory-based
  `replaySavedScenarioCounterfactual()`, and M4's scope was branching + the divergence marker, not
  persistence/replay. That is M6/M7.

## Stage completed: M6 + M7 — Evidence Pack + replay-by-re-execution for the counterfactual

**Git-is-source-of-truth finding that shaped this stage:** a complete, already-tested bridge from a
saved counterfactual to the **existing** Evidence Pack protocol
(`designScientificExperiment` → `executeScientificExperiment` → `createScientificEvidencePack`)
already existed, written and passing, on the unmerged branch `claude/evidence-pack-connector`
(`b723535`, `core/experimentFabric/counterfactualEvidence.ts` + its test file). Rebuilding it would
have been exactly the duplicate-evidence-system risk the standing instructions forbid. Cherry-picked
`b723535` instead (`git cherry-pick -n`), resolved two conflicts by hand — `registry.ts` (both
branches had independently declared `scenario-timeline`; net diff zero) and `ScientificMemoryScreen.tsx`
(my branch's hypothesis-loop UI and the incoming evidence-pack UI touch adjacent but non-overlapping
sections; both kept side by side) — and ported the `preparednessQuestions.ts` prerequisite
(`primaryMetric` + `falsification` per governed question, validated in `assertGovernedCatalog`),
which merged cleanly with no conflict.

**What landed, all reused, nothing new invented:**
- `core/experimentFabric/counterfactualEvidence.ts` — `buildCounterfactualEvidencePack()`. A
  counterfactual is a one-parameter sweep, so this composes the *existing* scientific-experiment
  protocol rather than adding a second evidence/replay system. Four fail-closed gates: both arms
  must replay MATCH; the difference must be exactly one declared lever (`scenarioId` or
  `interventionStartDay`); the falsification criterion must come from a pre-registered
  `GOVERNED_PREPAREDNESS_QUESTIONS` entry (no question attached → `NOT_AVAILABLE`, never a
  criterion invented after the fact); the real re-executed runs must match the saved summary
  digest (mismatch → `NOT_REPRODUCIBLE`).
- `ScientificMemoryScreen.tsx` — "Utwórz Evidence Pack" / "Odtwórz paczkę" / "Zmień dźwignię →
  nie-MATCH" buttons on any saved counterfactual record, wired to the same `evidencePackStore.ts`
  every other Evidence Pack already uses.
- `preparednessQuestions.ts` — each governed question now carries its pre-registered
  `primaryMetric` + `FalsificationCriterion` (reusing the existing `scientificDiscovery.ts` type),
  with a catalog-level check that the criterion's metric matches the declared primary metric.

**Real Chromium proof of the full required flow** (`#/pilot` → governed question → plan → confirm
→ World handoff → `#/memory` → Evidence Pack → replay), not just unit tests:

1. Picked a governed question ("Ile kosztuje opóźnienie izolacji objawowych o 20 dni?"), built the
   plan, executed it for real.
2. "Otwórz wynik w wizualizacji" → real MATCH-gated handoff into City3D.
3. "Zapisz kontrfaktyk w Pamięci" → `Zapisano kontrfaktyk (oba ramiona + różnica): #af620e7b.`
4. On `#/memory`, "Utwórz Evidence Pack" → `CREATED — ... 4 realnych przebiegów; ocena
   prerejestrowanego kryterium: FALSIFIED_WITHIN_PROTOCOL.` (An honest falsification, not a
   massaged support — the pre-registered criterion said the delayed arm should have fewer deaths;
   the real run said otherwise, and the pack reports that plainly.)
5. "Odtwórz paczkę" → `MATCH · pack pack_cbfc6fce`.
6. "Zmień dźwignię → nie-MATCH" (mutates the variant's `interventionStartDay` by +4, forcing a real
   re-execution with different inputs) → `BLOCKED_REPLAY — ... odtworzenie obu ramion zakończyło
   się werdyktem DRIFT` — the failure propagates correctly from the scenario-arm level up through
   the Evidence Pack gate, never silently downgraded to a softer status.

Full regression: desktop 27 routes/240 interactions zero errors, mobile 27/242 zero errors.

| Item | Value |
|---|---|
| Files added | `counterfactualEvidence.ts`, `counterfactualEvidence.test.ts` |
| Files modified | `ScientificMemoryScreen.tsx`, `preparednessQuestions.ts` |
| Files with zero net change | `registry.ts` (both branches already declared `scenario-timeline`) |
| Frontend tests | 164 files / 1760 passed / 1 skipped (previous stage: 163/1744 — +1 file, +16 tests) |
| Backend tests | 275 passed, unchanged |
| Lint / tsc / build / `git diff --check` | all clean |
| E2E desktop | 27 routes / 240 interactions — zero runtime errors |
| E2E mobile | 27 routes / 242 interactions — zero runtime errors |
| Targeted M6/M7 E2E | full pilot→World→memory→Evidence Pack→replay flow confirmed live, including a real BLOCKED_REPLAY on a mutated lever |

### Important scope note

This wires the Evidence Pack to counterfactuals built through the **governed preparedness
question** flow (`#/pilot`), which already carries a pre-registered falsification criterion. It does
**not** wire it to the Command Center panel's ad-hoc comparison from M2/M4 — that panel lets a user
pick any intervention without a pre-registered hypothesis, so `buildCounterfactualEvidencePack`
correctly returns `NOT_AVAILABLE` for it (no criterion to evaluate against). That is the fail-closed
gate working as designed, not a gap to close by inventing a criterion after the fact.

## Stage completed: "many worlds" — N-branch temporal lineage from one shared T0

**Context:** the user reframed the vision as a "Time Machine" (past/present/future/branch explorer)
and explicitly split the work: Claude builds the mechanism (snapshots, branching, counterfactual,
replay, evidence, lineage); Manus builds the experience (time slider, "GO TO TIME", 3D world,
alternate-timeline visualization). This stage is the mechanism side of the vision's "V5 — wiele
światów" requirement — branching into more than two futures from one decision point.

**New module:** `core/simulation/temporalMultiverse.ts`. Not a new engine — a thin N-ary composition
of the exact same primitives the binary counterfactual already uses (`runScenario` +
`compareScenarios` + `firstDivergentDay` + `buildTemporalTimeline` + `buildSavedScenarioRunContext`).
One shared baseline (T0) plus any number of named branches (`TemporalBranchSpec { branchId,
scenarioId, interventionStartDay? }`), each a real, independent `runScenario()` call against the same
starting parameters. Each branch's divergence from baseline is *measured*
(`firstDivergentDayFromBaseline`), never assumed from the declared intervention day — same discipline
as the binary counterfactual.

Save/replay reuses `SavedScenarioRunContext` per branch — no second memory format.
`replaySavedTemporalMultiverse()` re-executes the baseline and every branch and returns the
**weakest** verdict across all of them (`BLOCKED` > `DRIFT` > `MATCH`): one drifted branch fails the
whole multiverse's replay, matching how one unverified counterfactual arm blocks the pair. A branch
whose run status is `NOT_MODELED` gets `timeline: null` rather than a thrown error or a fabricated
timeline — verified this doesn't crash before shipping it (an actual bug caught by the test suite,
fixed by making the field nullable).

**Deliberately no new UI in this stage.** Per the stated division of labor, this is machine-only —
bolting an ad-hoc "3 branches" panel onto an existing screen would likely conflict with whatever
Manus designs for the actual Time Machine experience. Verified via a full regression pass instead
(desktop 27 routes/242 interactions, mobile 27/242, both zero errors) to confirm the new module
doesn't destabilize anything already shipped, plus a 12-test unit suite covering the same discipline
every other Genesis contract enforces: fail-closed gates (empty/duplicate branch IDs rejected),
determinism (same spec → same fingerprint), NOT_MODELED handling, save/replay MATCH, one-drifted-
branch-fails-everything, tampered-divergence-value → DRIFT (not silent MATCH), and a "no duplicate
system" check on the module's own imports (composes `scenarioEngine`/`scenarioCounterfactual`/
`temporalState`/`scenarioMemory`; never calls `.tick()` or constructs a simulation itself).

| Item | Value |
|---|---|
| Files added | `temporalMultiverse.ts`, `temporalMultiverse.test.ts` |
| Files modified | none |
| Frontend tests | 165 files / 1772 passed / 1 skipped (previous stage: 164/1760 — +1 file, +12 tests) |
| Backend tests | 275 passed, unchanged |
| Lint / tsc / build / `git diff --check` | all clean |
| E2E desktop | 27 routes / 242 interactions — zero runtime errors (regression only; no new UI to prove) |
| E2E mobile | 27 routes / 242 interactions — zero runtime errors |

## Stage completed: M3 (`fb6e46a`) + decision lineage (`4e832ae`)

**M3 — `core/simulation/temporalStateBookmark.ts`.** A portable address for one temporal state:
`createTemporalStateBookmark(source, logicalDay)` produces a deterministic `moment_<hash>` ID over
five source kinds (`run`, `counterfactual-baseline`, `counterfactual-variant`, `multiverse-baseline`,
`multiverse-branch`). Not a second memory and not a second replay — the bookmark is a *label* over an
already-saved context, and `resolveTemporalStateBookmark` always goes back through the existing
replay of that context. MATCH is the only path to a `TemporalStateEnvelope`; a tampered save, a
missing branch or a day off the axis returns an explicit reason, never a guessed state. A test asserts
the module's own source never calls `runScenario`/`runTemporalMultiverse` or touches storage, so the
"no duplicate system" rule is enforced mechanically rather than by convention.

**Decision lineage — `temporalDecisionLineage(multiverse)`.** For each branch it returns the baseline
envelope at the branch's *declared* decision day (`decisionState`) and the branch envelope at the
*measured* first divergent day (`branchState`) as two separate fields. This is the declared-vs-measured
discipline made structural: a declared `interventionStartDay` can never stand in for measured
divergence, because they are read from different sources. A declared day off the baseline axis yields
`null` (NOT_AVAILABLE), not a nearest-neighbour guess.

## Stage completed: pre-registration carrier on the multiverse

**Why this and not the Evidence Pack.** Evidence-for-multiverse is the obvious next large gap, but it
was blocked on a real precondition, not on missing plumbing: `experimentFabric/counterfactualEvidence.ts`
refuses to build a pack for an artifact whose `preparedness` does not resolve in
`GOVERNED_PREPAREDNESS_QUESTIONS`, and `TemporalMultiverseSpec` / `SavedTemporalMultiverse` had no
field to carry one. Attaching a falsification criterion to runs that had *already executed* would be
HARKing, so the honest move was to build the carrier that lets the criterion be declared **before**
execution — not to bolt a criterion onto finished results.

**What changed** (one file, `temporalMultiverse.ts`): optional
`preparedness { questionId, askedText, resolutionFingerprint }` on both the spec and the saved form.
`runTemporalMultiverse` rejects a `questionId` absent from the governed catalogue, so an invented
identifier fails loudly instead of becoming a decorative field. The declaration enters the multiverse
fingerprint — the same set of runs declared under a different question is a *different experiment*,
not the same one relabelled. It descends to every arm via `buildSavedScenarioRunContext(run, preparedness)`,
exactly as `buildSavedScenarioCounterfactual` already does, so each saved run carries the question it
came from. It survives replay. `isSavedTemporalMultiverse` rejects a partial carrier: a half-filled
question object is worse than none, because it would claim a criterion exists that cannot be resolved
against the catalogue.

**What this deliberately does NOT do:** the field is not evidence. A test pins that explicitly — a
declared question does not rescue a drifted branch; the replay verdict is unchanged by its presence.

| Item | Value |
|---|---|
| Files modified | `temporalMultiverse.ts` |
| Files added | `temporalMultiversePreregistration.test.ts` (7 tests) |
| Frontend tests | 168 files / 1798 passed / 1 skipped |
| Backend tests | 275 passed, 40 skipped, 0 failed |
| Lint / tsc / build / `git diff --check` | all clean |
| New UI | none — contract-level only |

## Stage completed: Multiverse → Evidence Pack bridge

**Why a branch-vs-baseline pair is a counterfactual by construction.** A multiverse branch shares
`baseParams`/`baseHospital`/`baseCohort` with the baseline by definition and differs by exactly the
declared `scenarioId` and/or `interventionStartDay` — which is precisely what `ScenarioCounterfactual`
already describes. So the bridge does not compare anything a second time: `multiverseBranchAsCounterfactual`
(`temporalMultiverse.ts`) takes the `ScenarioComparison` the multiverse already computed
(`branch.comparisonToBaseline`) and re-expresses it as a `ScenarioCounterfactual`, with a fingerprint
computed by the same formula `runScenarioCounterfactual` uses — not a fabricated one, the actual
fingerprint a direct two-armed run of that same pair would produce.

**The bridge itself** (`experimentFabric/multiverseEvidence.ts`, one function,
`buildMultiverseBranchEvidencePack(multiverse, branchId)`) does nothing but wire three existing
functions together: `multiverseBranchAsCounterfactual` → the existing `buildSavedScenarioCounterfactual`
→ the existing `buildCounterfactualEvidencePack`. All four fail-closed gates from M6/M7 apply
unchanged: both arms must replay MATCH, the difference must be exactly one declared lever, the
criterion must come from a pre-registered governed question (absent → `NOT_AVAILABLE`, never invented
after the fact), and real re-executed runs must match the saved digest. An N-branch multiverse yields
N independent evidence packs — one per branch-vs-baseline comparison — never one pack for the whole
multiverse, matching how Evidence Pack already resolves exactly one testable difference at a time.

Works identically on a freshly run `TemporalMultiverse` and on one recovered through a MATCH-verified
`replaySavedTemporalMultiverse` — verified by a test, since both are the same type by construction
(the type is reachable only via a real run or a verified replay, never a guess).

| Item | Value |
|---|---|
| Files added | `experimentFabric/multiverseEvidence.ts`, `multiverseEvidence.test.ts` (9 tests) |
| Files modified | `temporalMultiverse.ts` (+`multiverseBranchAsCounterfactual`) |
| Frontend tests | 169 files / 1807 passed / 1 skipped |
| Backend tests | 275 passed, 40 skipped, 0 failed |
| Lint / tsc / build / `git diff --check` | all clean |
| New UI | none — contract-level only |

## Stage completed: unified scientific lineage for a multiverse branch

**Where the lineage actually broke.** `experimentGraph.ts` already builds a full QUESTION → HYPOTHESIS
→ EXPERIMENT → RESULT → UNCERTAINTY → NEXT_EXPERIMENT graph, but only from `ExperimentRun[]` +
`ScientificEvidenceChain[]` — a shape with no notion of a temporal branch, a divergence day, or a
declared decision. `temporalDecisionLineage()` already answers "which decision produced this branch,
and when did it actually diverge" — but only inside the temporal/multiverse world, with no path to a
hypothesis or a graph. The two halves were both complete and both correct; nothing connected them by
`branchId`.

**The connection turned out to require zero new computation.** `CounterfactualEvidenceResult.chain`
(produced by `buildMultiverseBranchEvidencePack`, previous stage) is already a real
`ScientificEvidenceChain`, and `chain.allRuns` is already typed as exactly the `ExperimentRun[]` that
`buildExperimentGraph` consumes. So `buildMultiverseBranchScientificLineage(multiverse, branchId)`
(`experimentFabric/multiverseEvidence.ts`) does nothing but call three already-existing functions and
return their results keyed by the same `branchId`: `temporalDecisionLineage` for the decision/divergence
pair, `buildMultiverseBranchEvidencePack` for the evidence/replay verdict, and `buildExperimentGraph`
fed `evidence.chain.allRuns` + `[evidence.chain]` for the full question-to-next-experiment graph. The
graph is `null` exactly when there is no evidence chain to show — never a hypothesis dorobiona to a
pack that doesn't exist.

`graph.nextExperiment` is untouched `experimentGraph.ts` machinery (`proposeNext`/
`executeNextExperiment`) — this stage does not add a second planner, it only ever hands that existing
mechanism the real runs a branch already produced. `whyNextExperiment.ts`'s `explainScientificEvidence`
also accepts `evidence.chain` directly with no adapter, confirmed by a test — it was already the right
shape.

Verified end to end: pre-register → run multiverse → build lineage → save → replay → MATCH → rebuild
lineage on the replayed multiverse → same evidence status and same falsification criterion as the
original (persistence-safe). A tampered saved branch fails replay (never a silent MATCH); a
nonexistent branch id yields `decision: null`, `evidence: BLOCKED_NOT_COMPARABLE`, `graph: null` —
incomplete lineage stays visibly incomplete rather than partially fabricated.

| Item | Value |
|---|---|
| Files added | `multiverseScientificLineage.test.ts` (11 tests) |
| Files modified | `experimentFabric/multiverseEvidence.ts` (+`buildMultiverseBranchScientificLineage`) |
| Frontend tests | 170 files / 1818 passed / 1 skipped |
| Backend tests | 275 passed, 40 skipped, 0 failed |
| Lint / tsc / build / `git diff --check` | all clean |
| New UI / new graph / new hypothesis / evidence / replay / memory engine | none |

## Next gap

**Smaller machine-side item:** `TemporalBranchSpec`'s delayed-intervention lever, and now
`buildMultiverseBranchScientificLineage`, are still reachable only through tests and the
governed-question catalogue on `#/pilot`, not through a general UI. There is no call site yet that
declares a `preparedness` question at multiverse-spec time in the app, and no screen renders the
unified lineage this stage produces — the machine-side chain is complete and tested, but nothing in
the UI wires "ask a governed question" to "run a multiverse and show me the whole chain" yet.

**Not attempted in this stage, and why:** the mega-prompt's RO-Crate/export section asks whether the
existing Evidence Pack export can already carry question+model+input+execution+result+branch+
evidence+replay. `evidencePackRoCrate.ts` was not touched or audited this stage — it exports a
`ScientificEvidencePack`, which now (via this bridge) can originate from a multiverse branch, but
nothing was verified about whether the RO-Crate representation surfaces the *branch/divergence*
context specifically. That audit is real remaining work, not done here to keep this stage to one
verified, tested unit rather than a wide unverified sweep.

**The larger remaining gap is entirely on the experience side** — the actual Time Machine UX (time
slider with past/present/future zones, "GO TO TIME", multi-world switcher, 3D handoff, alternate-
timeline reveal) is Manus's mandate per the stated division of labor, not scoped here.
