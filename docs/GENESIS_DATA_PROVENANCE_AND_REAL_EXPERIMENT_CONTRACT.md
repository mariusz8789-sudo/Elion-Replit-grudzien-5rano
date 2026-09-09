# Data Provenance + Real Experiment Contract — C1 architecture report

Delivered against `docs/MASTER_PRIORITY_GENESIS.md`'s P0 "DATA PROVENANCE" /
"REAL EXPERIMENT CONTRACT" items, plus the P1/P2 audits it requested. Audit
first, then minimal change — three background research passes ran before any
code was touched; their findings are folded into this report rather than
kept separate.

## ARCHITECTURE

Two axes already existed and stay unchanged:

- `ConfirmationLevel` (`core/citation.ts`) — how well-established the
  underlying SCIENCE is.
- `ExperimentProvenance['resultOrigin']` (`core/experimentFabric/types.ts`) —
  HOW a Fabric run was executed (`real-engine` / `knowledge-only` /
  `capability-seam` / `engine-not-available` / `hypothetical-visualization`).
  Load-bearing: referenced in 40 files, gates cascade eligibility, Evidence
  Pack construction and Scenario Capsule checks via `=== 'real-engine'`
  checks (none of them exhaustive switches over the union).

`dataSource.ts`'s `isSynthetic: boolean` turned out to be a THIRD, much
narrower thing — a registry for 3 named external datasets (particle masses,
solar system, nuclear chart), touching exactly 6 files total, structurally
disconnected from the Fabric pipeline the task described
("must propagate through ExperimentFabric → ExperimentRun → Evidence →
StrategyRun → Memory → UI/Replay"). Widening it alone would not have reached
any of that pipeline.

**Decision: `dataProvenance: DataProvenance | undefined` is a new, ADDITIVE
field on `ExperimentProvenance`, not a replacement for `resultOrigin`.**
`resultOrigin` keeps its exact existing meaning and every one of its ~10
consumption gates needed zero changes. `dataProvenance` answers a genuinely
different question — SIMULATED (Genesis's own model/solver) / REFERENCE
(external reference/literature source) / REAL_EXPERIMENTAL (a real lab
measurement) — and composes with `resultOrigin` rather than colliding with
it: a future real-experimental run legitimately reports
`resultOrigin: 'real-engine'` (its own doc comment already says "real
engine, never parser or LLM" — a physical measurement qualifies) AND
`dataProvenance: 'REAL_EXPERIMENTAL'` to disambiguate which kind of real.
This is why no existing `real-engine` gate needed to change to admit a
future real experiment run.

New shared vocabulary file `core/dataProvenance.ts` mirrors `citation.ts`'s
role (a single small file both `dataSource.ts` and `experimentFabric/`
import from).

## CHANGES

- `core/dataProvenance.ts` (new) — `DataProvenance` type, labels.
- `core/dataSource.ts` — `isSynthetic: boolean` replaced with
  `provenance: DataProvenance` (all 6 touching files: 3 registrations —
  `nuclear-chart.ts`, `universe-solar-system.ts`, `particle-invmass.ts` — +
  `dataSource.ts` + `dataSource.test.ts` + `particleInvMass.test.ts`).
- `core/experimentFabric/types.ts` — `ExperimentProvenance.dataProvenance?`
  added.
- `core/experimentFabric/provenance.ts` — `dataProvenanceForResultOrigin()`
  (the derivation, mirroring `resultOriginForCapability`'s existing
  pattern); wired into `createExperimentProvenance()`.
- `core/experimentFabric/realExperiment.ts` (new) — the Real Experiment
  Contract: `RealExperimentRequest`, `RawMeasurement`, `DerivedMeasurement`,
  `RealExperimentRun` (= `ExperimentRun`, not a parallel type),
  `createRealExperimentRun()`. No instrument/lab integration — it assembles
  already-obtained measurements into a valid `ExperimentRun`.
- Propagation into every non-pass-through construction site the audit found:
  `evidencePackRoCrate.ts` (RO-Crate export), `scienceMemory.ts` (3 sites:
  `saveExperimentRunToMemory`, `saveScientificEvidencePackToMemory`,
  `saveParameterInquiryToMemory`), `ScienceChat.tsx` (1 site),
  `experimentGraph.ts` (`ExperimentGraphNode.dataProvenance`),
  `evidenceGuidedChat.ts` (`EvidenceGuidedExperimentCapsule.dataProvenance`),
  `counterfactualCompare.ts` (`baseline/variantDataProvenance`).
- `packages/frontend/src/__tests__/realExperiment.test.ts` (new).

**`EvidencePackage` and `ExperimentalAssessment` were deliberately NOT
created** — the architecture-guard audit confirmed zero existing references
to either name anywhere in code. They already exist:
`ScientificEvidencePack` (`evidencePack.ts`) and
`ScientificEvidenceChain['assessment']` (`scientificDiscovery.ts`). A real
experiment run participates in both once it is a valid `ExperimentRun` —
proven in `realExperiment.test.ts` by building a real chain and calling the
existing `createScientificEvidencePack()` unchanged.

## PROVENANCE PATH

Verified against real code, not assumed:

```
ExperimentFabric (createExperimentProvenance / createRealExperimentRun)
  → ExperimentRun.provenance.dataProvenance
  → Evidence (EvidencePackRun — whole provenance object copied verbatim,
              confirmed free; RO-Crate JSON-LD serialization — now explicit)
  → Memory (scienceMemory.ts — NOT a pass-through; 3 sites hand-pick fields,
            now including dataProvenance)
  → UI (ExperimentGraphNode, ScienceChat.tsx save path, DrugDiscoveryScreen /
        ScientificMemoryScreen / ExperimentPilotScreen / CandidateDossierScreen
        already render whatever scienceMemory.ts's execution record carries)
  → Replay (scienceMemory.ts's ~10 replaySaved* functions RE-EXECUTE the
            underlying loop and never trust the stored resultOrigin/
            dataProvenance as an input — so a widened value cannot be
            silently believed on replay; it is write-once-audit-only)
```

**Correction to the master task's assumed chain**: `StrategyRun`/
`StrategyRound` (`core/agent/discoveryStrategy.ts`) and
`discoveryOrchestrator.ts` carry **zero** provenance/resultOrigin/runId
fields today — a pre-existing fact, not something this change introduced or
silently worked around. Memory does not get provenance FROM `StrategyRun`;
`inquirySession.ts` hands the underlying `ExperimentRun` measurement
directly to `scienceMemory.ts` at save time, bypassing `StrategyRun`
entirely. So "propagate through StrategyRun" was not literally implemented
— it was not literally possible without a separate, larger wiring project
touching `discoveryStrategy.ts` and all three strategy adapters. Named as
NEXT GAP below rather than force-fitted in.

## RISKS

- `ScienceChat.tsx:259` (`formatScientificResultReport`) has a non-exhaustive
  ternary over `resultOrigin` that silently buckets `capability-seam` +
  `engine-not-available` into one `'NOT_EXECUTED_OR_BLOCKED'` label.
  Pre-existing, not caused by this change (the `resultOrigin` union itself
  is unchanged) — flagged, not fixed, to keep this change minimal.
- `core/biotechData/naturalReplacement.ts` has a second field also named
  `resultOrigin` typed as a loose `string` on `NaturalHeavyCompute`, mixing
  the real union values with invented ones (`'not-executed'`,
  `'engine-error'`, ...). Pre-existing type-safety gap, untouched by this
  change (that field is not `ExperimentProvenance['resultOrigin']`).
- `core/experimentFabric/worldHandoff.ts` (City3D/Scenario world handoff)
  hardcodes the literal `'real-engine'` at 6 construction sites rather than
  reading it off an `ExperimentRun.provenance` — a structurally separate,
  already-disconnected mini-system. Deliberately not extended with
  `dataProvenance`: out of this task's scope (not named in the required
  propagation chain), and fixing its disconnection from
  `ExperimentProvenance` is a separate, larger job.

## TESTS

- `dataSource.test.ts`, `particleInvMass.test.ts` — updated for `provenance`.
- `realExperiment.test.ts` (new, 5 tests) — proves: `REAL_EXPERIMENTAL` never
  reported as `SIMULATED`; derived measurements land in
  `ExperimentResult.outputs` unchanged; raw measurement lineage is NOT
  decorative (changing a `RawMeasurement` value changes the run fingerprint
  even when the derived value is identical); a real run flows into
  `createScientificEvidencePack()` unmodified; a real run saved through
  `saveExperimentRunToMemory()` and read back via `getExperiment()`
  preserves `dataProvenance: 'REAL_EXPERIMENTAL'` through the real
  save/read round trip (fake `localStorage`, real `scienceMemory.ts`).
- Full targeted sweep (experimentFabric, experimentGraph, scienceMemory ×2,
  experimentPilot, hypothesisLoop, backendEvidenceExecution,
  biotechExperimentFabric, scenarioCounterfactual, counterfactualEvidence,
  scenarioTimelineFabric, preparednessTwin, realEngineExecutorCoverage,
  lookingGlassScenario, scienceChatFabricFormat, physicsLabsScienceChatRouting,
  epidemicCity3DExperimentHandoff, scienceChat, inquirySession): all green,
  516 tests.
- Full suite: 403/404 files, 4233/4235 tests green; the one failure
  (`epidemicCity3DPerformanceAudit.test.ts`, a wall-clock scene-construction
  threshold, unrelated to this change) passes cleanly in isolation —
  confirmed flake, not a regression.
- tsc clean, eslint clean, production build succeeds (chunk-size warning
  only, pre-existing).

## P1 — MODEL RUNTIME READINESS (audited, not implemented)

Independently re-verified C3's own finding (`AUTONOMOUS_DISCOVERY_ROADMAP.md`
§10.15): a "model" in Genesis today (`RouterModel` in
`core/experimentFabric/router.ts`, or a WorldGraph domain's update rule in
`core/worldModel/domains/*.ts`) has its equations/compartments/couplings
fixed as TypeScript source. `RouterModel.engine` is an opaque string naming
compiled code; `DomainSolver` is by type a compiled function. No field
anywhere holds "terms/couplings/functional form" as data. The closest
existing runtime-configurable seam is one level up — `WorldSpecification` /
`WorldBlueprint` / `WorldModelProposal` (composition: which
templates/domains/entities/initial conditions exist) and per-domain lever
catalogs (which parameters can be varied) — real, reusable substrate for a
future Model Update primitive, but not the primitive itself. §10.15's own
conclusion holds and is not being overridden: **not implementing a
`ModelUpdate` contract now**, per the standing instruction not to
force-build onto a substrate that does not exist.

**Update, same day**: C3 correctly refined this after the above was
written (`docs/RUNTIME_CONFIGURABLE_MODEL_CONTRACT.md`, folded into
`AUTONOMOUS_DISCOVERY_ROADMAP.md`) — §10.15 was half right, not fully. This
audit (and the one it verified) correctly found no place where a NEW
structure could be invented as data. It missed that `SolverRouter`'s
`Map<string, DomainSolver>` plus `domainBinding.solverId` already makes
CHOOSING between two already-written, already-registered solver variants
for the same quantity a genuine runtime rebind — no Fabric change needed
for that narrower move. What still does not exist, and is the harder half
of "Model Update," is inventing a structure nobody wrote; that part of this
section's conclusion stands. C3's contract stops short of implementing
either, for the right reason: no domain today registers two real, cited
structures for the same quantity, so there is nothing yet to choose
between — writing a second solver just to have one to discriminate would
be fabricating physics, the exact failure mode this whole document exists
to avoid.

## P2 — ARCHITECTURE GUARD (audited, all clean)

Independent duplication audit, all four checks CLEAN:

1. C3's `researchChain.ts`/`nextQuestion.ts` call `runDiscovery` and the
   existing memory/narrowing functions directly — no second discovery
   engine, no second `StrategyRun` type, no second falsification function.
2. C2's `CellLabScreen.tsx`/`cellCultureLeverCatalog.ts` call the real
   `rk4CellCycleStep` from `cellCycle.ts` directly — no second RK4/ODE
   implementation.
3. Zero references to `RealExperiment`/`ExperimentalAssessment`/`RawData`/
   `DerivedData`/`EvidencePackage` existed anywhere in code before this
   change — confirmed clean slate before `realExperiment.ts` was written.
4. `scienceMemory.ts` is the sole `localStorage`-backed store for
   experiment/hypothesis/discovery records (via `core/storage.ts`);
   `scenarioMemory.ts` explicitly funnels into it rather than duplicating
   it; `worldSnapshot.ts` is a genuinely different concern (ECS/world
   round-tripping, not scientific memory).

## COMMITS

This report is committed alongside the code changes it describes in one
commit on `main` — see the commit this file was added in.

## NEXT GAP

In priority order:

1. **`StrategyRun`/`discoveryOrchestrator.ts` carry no provenance at all.**
   The single largest gap this audit surfaced. Threading
   `dataProvenance`/`resultOrigin` through `discoveryStrategy.ts` and its
   three strategy adapters would let a future real-experimental measurement
   be visible at the point Genesis DECIDES what to do next, not only after
   it is banked in Memory. Real wiring work, not a field addition — scoped
   out of this pass deliberately.
2. **No route kind for a physical experiment.** `ExperimentRoute`'s closed
   union has no `'real-experiment'`-shaped variant; `createRealExperimentRun`
   uses `{ kind: 'none' }` honestly rather than inventing a route the UI
   does not yet render anything for. Worth a deliberate addition once a UI
   surface for entering/reviewing real experimental data exists.
3. **No UI surface to enter a real measurement yet.** The contract
   (`createRealExperimentRun`) is callable today by hand (a developer typing
   in numbers from a lab notebook) but there is no screen for a user to do
   this. That is the natural next P1/P2 step once the contract itself is
   considered stable.
4. The two pre-existing RISKS above (`ScienceChat.tsx`'s non-exhaustive
   ternary, `naturalReplacement.ts`'s loose-typed lookalike field) — small,
   contained, unrelated to this change, worth a future pass.
