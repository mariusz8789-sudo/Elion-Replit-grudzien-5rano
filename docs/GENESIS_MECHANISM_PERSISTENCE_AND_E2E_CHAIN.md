# MECHANISM persistence + the full end-to-end chain in one test — C1 report

Delivered against the master goal: `USER QUESTION → HYPOTHESIS → MODEL →
PREDICTION → EXPERIMENT REQUEST → REAL/SIMULATED DATA → COMPARISON →
FALSIFICATION/SUPPORT → EVIDENCE PACKAGE → PROVENANCE → MEMORY → NEXT
QUESTION → NEXT EXPERIMENT → REPLAY`, C1's assigned priorities 1–5. Audit
first (three background research passes), then the smallest correct
architecture change — not a hack — for the one real blocker found.

## THE ARCHITECTURAL BLOCKER FOUND, AND WHY IT WAS NOT ROUTED AROUND

`discoveryOrchestrator.ts`'s MECHANISM path (the new, unified `StrategyRun`
front door, built earlier this session) had **zero production callers and
zero memory persistence**. Confirmed by audit: only test files call
`runDiscovery({shape:'MECHANISM'})`; the live app's `GenesisWorldScreen.tsx`
still calls the older `worldDiscoverySession.ts::runWorldDiscoveryAndRemember`,
which duplicates the SAME admission/plan/memory-narrow steps
(`discoveryOrchestrator.ts` already imports and reuses `parseWorldDiscoveryGoal`,
`buildWorldDiscoveryPlan`, `priorRefutedHypothesisIds` from
`worldDiscoverySession.ts` — confirmed no logic duplication at that level)
but calls `runAutonomousDiscoveryWithEngines` a second, separate time and
persists THAT result instead. A MECHANISM `StrategyRun`/`StrategyRunProvenance`
produced through the new front door was returned to its caller and dead-ended
— never reaching Science Memory, Evidence, or Replay.

This is effectively a second top-level MECHANISM path, built up incrementally
without anyone stepping back to unify persistence — exactly the kind of
architectural blocker the standing instruction says to stop at rather than
hack around.

**Why the obvious hacks were rejected:**
- Calling `buildWorldDiscoveryEvidenceBundle` on `StrategyRun.native` doesn't
  work: that function needs the FULL `DiscoveryLoopExecution` (registry,
  baseline, last-arm WorldGraph state), not the lean `DiscoveryLoopResult`
  `StrategyRun` deliberately carries. Retrofitting evidence-bundle support
  onto `StrategyRun` itself would mean putting non-serializable WorldGraph
  state into a type meant to stay lean and provenance-safe.
- Re-running the engine a second time just to get the full execution object
  would be wasteful and risks divergence between "the run that was reported"
  and "the run that was persisted" — the opposite of honest provenance.

**Smallest correct fix, actually implemented:**
1. `mechanismGeneration.ts`'s `runDiscoveryWithJointGeneration` already
   computes the full `DiscoveryLoopExecution` internally
   (`runAutonomousDiscoveryWithEngines(input)`) and discarded everything but
   `.result`. Added `firstExecution: DiscoveryLoopExecution` as a new,
   purely additive field on `MechanismWithGenerationResult` — no existing
   field removed or changed, all 6 return sites updated mechanically.
2. `discoveryOrchestrator.ts`'s MECHANISM branch was factored into
   `prepareMechanismInvestigation()` — the exact same computation
   `runDiscovery` always did, now also returning `mechanismGeneration`
   (with `firstExecution`) and `intent` to a caller that needs them.
   `runDiscovery`'s own return value is byte-identical to before; the
   existing equivalence tests (`discoveryOrchestrator.test.ts`,
   `discoveryOrchestratorGeneration.test.ts`) confirm this.
3. New `runMechanismDiscoveryAndRemember()` calls that same helper, then
   feeds `mechanismGeneration.firstExecution` to the EXACT same
   `buildWorldDiscoveryEvidenceBundle` / `buildSavedWorldDiscoveryRun` /
   `saveWorldDiscoveryRunToMemory` / `replaySavedWorldDiscoveryRun` functions
   `worldDiscoverySession.ts::runWorldDiscoveryAndRemember` already uses —
   zero new Evidence mechanism, zero new Memory schema, zero new replay
   verdict vocabulary. `evidenceSummary()` (private helper) was exported so
   both call sites share one projection.

Result: a MECHANISM investigation run through the new front door now
persists to Science Memory and replays to a real `MATCH` verdict, exactly
like PARAMETER already does via `runInquiryWithGenerationAndRemember`.
Proven in `mechanismDiscoveryAndRemember.test.ts`.

**What is still deliberately NOT persisted**, named rather than silently
left: the composed joint-arm generation itself (`outcome.generated`) is
reported but not banked as its own record — that would need
`mechanismGeneration.ts` to also expose the joint arm's full execution, a
second, separate widening not done here.

## THE FULL END-TO-END CHAIN, PROVEN IN ONE TEST

Audit found: many individual pieces of the chain were separately proven
(memory narrows selection; a derived value drives the next experiment; a
saved record replays to MATCH) but **no single test proved bare-start →
falsify → bank → independent replay MATCH → restart → next experiment reads
memory and differs because of it → THAT record also replays to MATCH**, all
together. `generationMemoryChain.test.ts` gained one new test doing exactly
this, over the real PARAMETER pipeline (`runInquiryWithGenerationAndRemember`),
with a real process restart (`vi.resetModules()`) in the middle and real
`replaySavedParameterInquiry` calls proving MATCH on both ends of the chain —
not merely asserting the numbers, RE-EXECUTING to confirm them.

## PROVENANCE END-TO-END — STATUS AFTER TODAY

- PARAMETER: `dataProvenance` reaches Memory (confirmed:
  `InquiryLoopResult.dataProvenance` is copied byte-identically onto
  `StrategyRun.dataProvenance` via `toParameterRun`; `strategyRunProvenance.test.ts`
  proves it lands in the saved record).
- MECHANISM: `StrategyRunProvenance` was constructed but discarded — now
  reaches Memory through the new persistence wired above (the saved
  `loopResult` carries the same `DiscoveryLoopResult` the `StrategyRun`'s
  provenance was computed from).
- C2 closed the UI side of this the same window: `GenesisWorldScreen.tsx`'s
  MatrixPanel now reads the real `StrategyRun.dataProvenance` instead of a
  hardcoded `SIMULATION` label.

## MODEL UPDATE — AUDITED PRECISELY, NOT FAKED

Three genuinely different senses, and only ONE is fully live-and-chained:

| Capability | Verdict | Evidence |
|---|---|---|
| Parameter value update | **REAL, chains** | `researchChain.test.ts`'s defining-behaviour test: a falsified declared space → derived value → drives construction of the NEXT experiment, in one continuous run |
| Mechanism criterion revision (`deriveAlternativeCriteria`) | **REAL, chains** | `discoveryRegeneration.test.ts`: falsification in round N produces a hypothesis `selectNext` actually runs in round N+1, inside the production `discoveryLoop.ts` engine |
| Mechanism composition (joint arm) | **PARTIAL** | Real, single-shot, live via `discoveryOrchestrator.ts` — but `researchChain.ts` has no actuator for `TEST_WHETHER_MECHANISMS_COMPOSE`, so nothing yet consumes it to pick a FURTHER next experiment. (C3 fixed a related self-consistency bug the same window: `nextQuestion.ts` was re-proposing a composition that had already run.) |
| Solver/model STRUCTURE choice | **CONTRACT-ONLY** | `RUNTIME_CONFIGURABLE_MODEL_CONTRACT.md`'s own self-assessment confirmed accurate against code: `SolverRouter`'s `domainBinding.solverId` rebind mechanism is real, but no domain registers two real, cited structures for the same quantity, and no discovery-loop code performs a rebind. Not implemented — would require fabricating a second physics model just to have something to discriminate, which is exactly the dishonesty this whole effort exists to prevent. |

**Not implementing a fake "model update."** The two REAL cases above already
constitute genuine model/parameter updates driving the next experiment — that
capability is not missing, only its THIRD, structural-choice sense is, and
that sense correctly stays undone until a domain has a real second structure
to offer.

## REAL EXPERIMENT BACKBONE — STATUS

The contract (`core/experimentFabric/realExperiment.ts`, built earlier this
session) is solid and tested, but audit found it **completely unwired**:
zero references anywhere outside its own test file. Specifically:
- Not reachable from `discoveryOrchestrator.ts`, `discoveryAdmission.ts`, or
  `capabilityAdmission.ts` — none of them know a real-experiment path exists
  as an option.
- `RealExperimentPipeline.tsx` (UI) is purely presentational — zero imports,
  correctly says "no RealExperimentInterface is registered" rather than
  fabricating a request.
- `assessPredeclaredCriterion` would correctly assess a real run's numbers
  (confirmed provenance-blind, reads only `outputs`/criterion) — but there is
  no seam today to hand it a pre-built `RealExperimentRun`; the normal path
  always calls the solver itself. **A real, if latent, correctness bug found**:
  `reproductionVerdict` requires bit-identical `runFingerprint` across
  repeated arms with no tolerance and no branch on `deterministic` — two
  independent physical measurements of the same quantity will almost never
  hash-match, so a `repetitionsPerArm > 1` real-experimental arm would be
  structurally stuck at `INCONCLUSIVE` forever. Not fixed (nothing calls this
  path yet, and the correct behavior for "how similar is similar enough" for
  physical measurements is a product decision, not mine to invent) — flagged
  loudly here and in `realExperiment.ts` for whoever wires the first partner
  lab integration.
- **No replay landmine exists today** (no generic "replay a plain Fabric run"
  function exists at all — `scienceMemory.ts` correctly reports
  "Replay: NOT_ESTABLISHED" for these records), but there is also **no
  guard** preventing a future naive implementer from writing one that
  silently re-runs a solver on a `REAL_EXPERIMENTAL` record's stored
  request. Documented as a required guard for whoever adds that function.

Per the standing instruction — interface ready, no fake data, no hardware
integrated — this is the correct state to leave it in for this pass.
Wiring it into live admission is real, separate, larger work (see NEXT STEP).

## ARCHITECTURE GUARD

No second Discovery Engine was built. `runMechanismDiscoveryAndRemember`
reuses `worldDiscoverySession.ts`'s Evidence/Memory/Replay functions
verbatim; `prepareMechanismInvestigation` is the single computation both
`runDiscovery` and the new persistence wrapper share. C2's and C3's parallel
work this window (`ProvenanceBadge` reuse, `nextQuestion.ts`'s self-consistency
fix) independently converged on reuse over duplication, consistent with every
other reconciliation this session.
