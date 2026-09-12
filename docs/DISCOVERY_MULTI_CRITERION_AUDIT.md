# Discovery Engine multi-criterion / Tautology Gate integration audit

Scope: can `discoveryLoop.ts`, `hypothesisLoop.ts`, `generateAlternativeHypotheses`,
`discoveryConclusion.ts`, `falsificationRelation.ts`, and the Tautology Gate
jointly support multi-criterion / multi-observational hypotheses, and can the
Gate reach the two loops it does not reach yet?

No code was written until the audit below settled the six questions the
brief asked. Verdict: **NO-CHANGE on the two loops audited this turn** — both
are BLOCKED for the reasons below, and the blockers are structural, not
missing wiring. One safe, additive test-coverage gap was closed on the
already-shipped integration (`discoveryConclusion.ts`).

## 1. Real call-sites

**`agent/discoveryLoop.ts` (MECHANISM/WorldGraph loop)** — real, live,
production: `agent/discoveryOrchestrator.ts`, `agent/mechanismGeneration.ts`,
`agent/worldDiscoverySession.ts`, `agent/cyberInvestigation.ts`,
`agent/discoveryStrategies.ts`, `core/scienceMemory.ts`. UI-wired via
`WorldDiscoveryPanel.tsx`/`RealExperimentPipeline.tsx` into
`GenesisWorldScreen`, `GenesisScientificCityScreen`, `CellLabScreen`,
`EvidenceShowcaseScreen`.

**`experimentFabric/hypothesisLoop.ts`** — real, live, production:
`components/ExperimentPilotScreen.tsx`, `core/lookingGlass/scenarioSession.ts`,
`core/lookingGlass/scenarioResolution.ts`, `core/world/cellWorldAdapter.ts`,
`core/world/epidemiologyWorldAdapter.ts`, `core/world/moleculeWorldAdapter.ts`,
`core/experimentFabric/researchCampaign.ts`,
`core/experimentFabric/scientificDiscoveryLoop.ts`,
`core/experimentFabric/beliefChangeRun.ts`. (A concurrent commit landed
mid-audit — `deriveNarrowedHypothesisProblem`, G4 — adding observation-driven
midpoint-interpolation candidate generation; reviewed below, it does not
change any conclusion here: it still produces one `HypothesisProblem` with a
single `falsificationCriteria` per hypothesis.)

**`worldModel/discovery/worldCounterfactual.ts::generateAlternativeHypotheses`**
— real function, but its own doc says outright: *"Read this before looking
for the caller — there isn't one."* `discoveryLoop.ts` (the WorldGraph loop
that could use it) reasons in the ordinal `ConfidenceLabel` and does not
import `beliefRevision.ts`'s numeric `Hypothesis` at all, which is what this
function returns. Confirmed by grep: zero production callers.

## 2. Can a hypothesis have primary + supporting criteria, >1 observable, competing predictions?

| Type | File | Criterion shape | Supporting criteria | Multi-observable declaration | Competing predictions |
|---|---|---|---|---|---|
| `MechanisticHypothesis` | `discoveryLoop.ts` | `criterion: FalsificationCriterion` — **exactly one** | none | none | yes (multiple `MechanisticHypothesis` per `DiscoveryLoopInput.hypotheses`, each with its own one criterion) |
| `PreregisteredHypothesis` | `hypothesisLoop.ts` | `falsificationCriteria: FalsificationCriterion` — **exactly one** | none | none | yes (`generateCompetingHypotheses` — one hypothesis per candidate value, same metric) |
| `WorldCounterfactualQuestion` | `worldCounterfactual.ts` | `criterion: FalsificationCriterion` — **exactly one** | none | none | n/a (single-question contract) |
| `DiscoveryHypothesis` | `core/discovery/discoveryCase.ts` | `falsification` (primary) | **yes** — `supportingCriteria?: readonly FalsificationCriterion[]` | **yes** — `observableDerivations?: Record<metric, TautologyComponent>` | n/a (single case, not competing hypotheses) |

Only `DiscoveryHypothesis` (Discovery Engine, `core/discovery/`) already has
the primary+supporting+multi-observable shape — because it was built there
in the prior session's MIXED_TEST task. Neither `discoveryLoop.ts` nor
`hypothesisLoop.ts` has ever had this shape; "competing predictions" in both
means several hypotheses each with their OWN single criterion, which is a
different axis from "one hypothesis, several criteria."

## 3. Is there a data structure to safely attach `tautologyClassification` per criterion?

- `DiscoveryCriterionCheck.tautologyClassification` — **already exists**
  (added in the MIXED_TEST task), required field, single constructor
  (`checkCriterion`), zero blast radius, tests pass.
- `MechanisticHypothesis` / `PreregisteredHypothesis` — **no such slot**.
  Adding one (`observableDerivation?: TautologyComponent`, mirroring
  `SystemUnderStudy`'s own field) would be mechanically easy and additive —
  but see §5: neither loop's belief model has anywhere to route the
  resulting classification. Adding a field nothing reads would be dead
  weight, not integration.

## 4. Can `discoveryConclusion.ts` be reused as a shared verdict layer without duplication?

No, not without new adapter code. `discoveryConclusion.ts`'s functions
(`checkCriterion`, `assessDeclaredDerivations`, the verdict logic in
`deriveDiscoveryConclusion`) are written directly against
`DiscoveryComparison.metrics` (baseline/variant pairs from the epidemic
Scenario Engine) and return a `DiscoveryConclusion`
(`SUPPORTED`/`PARTIALLY_SUPPORTED`/`NOT_SUPPORTED`/`INSUFFICIENT_EVIDENCE`).

- `discoveryLoop.ts` produces `WorldCounterfactualAssessment` (from a
  `TemporalEngine` fork/diff, `HypothesisAssessment` vocabulary) and an
  ordinal `HypothesisBelief` — a different comparison shape and a different
  verdict vocabulary.
- `hypothesisLoop.ts` produces a `ScientificEvidenceChain` (from
  `designScientificExperiment`/`executeScientificExperiment`) and a
  one-shot `HypothesisStatus` — a third shape.

Reusing `discoveryConclusion.ts` here would mean either (a) writing shape
adapters that convert `WorldCounterfactualAssessment`/`ScientificEvidenceChain`
into something `checkCriterion` accepts, which does not exist and duplicates
verdict-decision logic across three different comparison representations, or
(b) generalizing `checkCriterion`/the aggregation logic into a shape-agnostic
shared module — genuinely new architecture, not "using the existing layer."
Neither is minimal integration; both are new design, forbidden unless proven
necessary, and it is not necessary — see §6.

## 5. Does belief revision stay one existing path?

**No — three, deliberately separate, non-negotiable by this codebase's own
documented policy:**

| Loop | Belief representation | Where it lives | Magnitude concept? |
|---|---|---|---|
| `inquiryLoop.ts` | numeric confidence | `beliefRevision.ts::updateConfidence`, `evidenceMagnitude` | **yes** — this is exactly what `evidenceCeiling()` caps; already wired (P2.1) |
| `discoveryLoop.ts` | ordinal `ConfidenceLabel` ladder | `updateBelief()` (read in full: lines 332–388) | **no** — status/confidence come purely from `assessment.assessment` (categorical) and `metricMoved` (boolean); counts rounds and distinct strengths, never a scaled number |
| `hypothesisLoop.ts` | one-shot categorical `HypothesisStatus` | `executePreregisteredHypotheses()` (read in full: lines 460–530) | **no** — `chain.assessment.assessment` maps directly to a terminal status; there is no round loop and no revision at all, just one assignment |
| Discovery Engine | categorical `DiscoveryVerdict` | `discoveryConclusion.ts` | **no** — but the Gate integrates by *blocking a verdict transition*, not capping a magnitude (already done) |

`discoveryLoop.ts`'s own file doc states the separation is deliberate:
*"This codebase has repeatedly and deliberately refused to attach numeric
credences to hypotheses"* — citing `modelVsModelCompare.ts` and
`hypothesisLoop.ts` doing the same, and pointing at
`docs/TWO_AUTONOMOUS_LOOPS_DECISION.md` as the standing decision. The Gate's
`evidenceCeiling()` mechanism has a home in exactly two of these four
(numeric magnitude capping for `inquiryLoop.ts`; verdict-transition blocking
for Discovery Engine). It has no analogous hook in the other two, because
they have no magnitude and no revision loop to interrupt.

## 6. Would existing conflict/falsification semantics be violated by adding it anyway?

Not violated, but any attempt would require **inventing** what "does not
increase confidence" means for a model that has no confidence to move — for
example, silently skipping a round's status transition for a
`CONSISTENCY_CHECK` criterion in `discoveryLoop.ts`'s `updateBelief`. That is
a new semantic decision with no existing precedent to reuse (unlike
`inquiryLoop.ts`, which already had `evidenceMagnitude` to zero, and unlike
Discovery Engine, which already had a verdict transition to block). Making
that call would be exactly the "nie zgaduj brakujących semantyk" this brief
forbids.

## Decision

| Component | Decision |
|---|---|
| `discoveryLoop.ts` | **BLOCKED** — single criterion per hypothesis, ordinal belief with no magnitude concept to cap; adding either would be new design |
| `hypothesisLoop.ts` | **BLOCKED** — single criterion per hypothesis, one-shot categorical status with no revision loop at all |
| `generateAlternativeHypotheses` | **NO-CHANGE** — real function, but genuinely uncalled in production (confirmed by its own doc and by grep); not a live integration point regardless of criterion shape |
| `discoveryConclusion.ts` | **NO-CHANGE** — already IMPLEMENTED (prior session, commit `831ae2f4`); confirmed here it cannot be generalized into a shared layer for the other two loops without new adapter architecture |
| `falsificationRelation.ts` | **NO-CHANGE** — correctly stays the one shared two-arm relation primitive used by all of `inquiryLoop.ts`, `discoveryConclusion.ts`, and `worldCounterfactual.ts`; nothing about this audit requires touching it |
| Tautology Gate (`tautologyGate.ts`) | **NO-CHANGE** — remains singular, reused as-is by its two existing consumers; no second gate built or needed |

## GAP MATRIX

| Requirement | Status |
|---|---|
| ≥2 competing hypotheses (many hypotheses, one criterion each) | DONE — all three loops |
| Primary + supporting criteria on ONE hypothesis | DONE only in Discovery Engine (`DiscoveryHypothesis`); MISSING in `discoveryLoop.ts`/`hypothesisLoop.ts` |
| Per-criterion `tautologyClassification` slot | DONE only in `DiscoveryCriterionCheck`; MISSING in `MechanisticHypothesis`/`PreregisteredHypothesis` |
| Shared verdict layer across all three loops | BLOCKED — three genuinely different comparison shapes and three genuinely different, deliberately separate belief models |
| Numeric evidence-magnitude concept to cap | DONE only in `inquiryLoop.ts` (`beliefRevision.ts`); **structurally absent** in `discoveryLoop.ts` and `hypothesisLoop.ts` |
| MIXED_TEST reachable | DONE only in Discovery Engine (already live, unit-tested since the prior session) |

**Smallest missing element, named precisely:** `discoveryLoop.ts`'s
`updateBelief()` and `hypothesisLoop.ts`'s status assignment have no
magnitude or revision-blocking hook at all — not a small gap in an
otherwise-compatible structure, but the absence of the exact mechanism the
Gate's `evidenceCeiling()` is built to interrupt. Closing it would mean
choosing new semantics for what "this criterion is tautological" means to an
ordinal ladder and to a one-shot status — a real design decision belonging
to whoever owns those loops' contracts, not something to invent here.

## What was added this turn

One test only, closing a real coverage gap in the ALREADY-SHIPPED
`discoveryConclusion.ts` integration found while auditing §2/§3 against it
for comparison: a "supporting-only" declaration (primary criterion
undeclared, only a supporting criterion carries `observableDerivations`) had
never been exercised. Added to
`__tests__/discoveryConclusionTautology.test.ts`: confirms a lone declared
supporting metric produces a single-component (not `MIXED_TEST`)
classification, leaves the undeclared primary's decision untouched, and
still excludes the classified supporting criterion from the verdict when it
is tautologically inert. No production code changed.

## Verification

- `npx tsc --noEmit -p packages/frontend` — clean.
- `npx eslint` on the touched test file — clean.
- Full frontend `vitest run` — 469 files, 5191 passed, 1 pre-existing skip
  (6 more than the pre-audit baseline: 5 from a concurrent, unrelated G4
  commit that landed mid-audit, 1 from this turn's new test).
- Full backend `node --test` — 429 tests, 371 pass, 0 fail, 58 skipped,
  unaffected (no backend files touched).
- `npm run build` — clean (pre-existing >750kB chunk warning, unrelated).
- Real Chromium E2E, unchanged, re-run to confirm no regression:
  `scripts/inquiry-e2e.mjs desktop` (6/6 problems, incl. `qe1-misspecified`)
  and `scripts/discovery-e2e.mjs` (76/76 checks, Node/browser fingerprints
  identical) — both green.

## Limitations (stated, not hidden)

- `discoveryLoop.ts` and `hypothesisLoop.ts` remain real, live, multiply-used
  loops that genuinely cannot express "this criterion is tautological, don't
  let it move belief" today. That is a real, load-bearing gap in the Gate's
  reach, not a cosmetic one — but closing it needs a design decision (what
  does "don't move an ordinal ladder" or "don't finalize a one-shot status"
  mean) that this audit's brief explicitly forbids inventing.
- `generateAlternativeHypotheses` staying uncalled is a pre-existing,
  independently documented fact (its own doc names the exact reason:
  `discoveryLoop.ts`'s ordinal belief cannot hold a numeric `Hypothesis`) —
  not something this audit introduced or is positioned to fix.
