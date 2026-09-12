# Genesis Scientific Discovery Loop — end-to-end demonstrator

Requested loop: UNRESOLVED PROBLEM → PROBLEM FORMALIZATION → ≥2 COMPETING
HYPOTHESES → PREDICTIONS → EXPERIMENT → TAUTOLOGY GATE → EVIDENCE →
FALSIFICATION ATTEMPT → BELIEF REVISION → NEXT QUESTION.

This document is the audit that decided the demonstrator, not a design
proposal: every "DONE" row below is backed by a real call-site, a real test,
or a real Chromium run cited next to it. No new engine, no new domain, no new
belief representation was built — this closes a real-browser gap in an
already-complete loop.

## Audit — real call-sites only

**Chosen demonstrator: `agent/inquiryLoop.ts` (PARAMETER loop) +
`agent/entanglementInquiry.ts` (QE1–QE3) + `components/AutonomousInquiryScreen.tsx`
(`#/inquiry`).**

| Loop stage | Real call-site | Deterministic? |
|---|---|---|
| Unresolved problem | `AutonomousInquiryScreen.PROBLEMS[]` | — |
| Problem formalization | `qe1VisibilityInquiry()`/`qe2MonogamyInquiry()`/`qe3BoundEntanglementInquiry()` build an `InquiryLoopInput` before any run | yes |
| ≥2 competing hypotheses | `QE1_HYPOTHESES`(4) / `QE2_HYPOTHESES`(5) / `QE3_HYPOTHESES`(4) | yes |
| Predictions | `inquiryLoop.ts::runAt()` — every hypothesis's claimed values run through the same real solver (`quantum-entanglement-measures`) that produces the measurement | yes |
| Experiment | `runAt(observable, hiddenParameters, probeValue, …)` — real `ExperimentRun`, real `runId`/`runFingerprint` | yes |
| Tautology Gate | `qe1System`/`qe2System`/`qe3System` declare `observableDerivation` (both sides `hypothesis-parameter`) → `assessSingleTautology` → `EMPIRICAL_TEST` → `evidenceCeiling: null` (uncapped) — P2.1's own component, unmodified | yes, computed once, never from a measured number |
| Evidence | `InquiryLoopResult.dataProvenance` (`StrategyRunProvenance`) + per-round `runId`/`runFingerprint`/`engine`/`modelId`; rendered live in `StrategyRunReport.tsx` | yes |
| Falsification attempt | `evaluateTwoArmRelation` (the same shared primitive `discoveryConclusion.ts` uses) → `SUPPORTED_WITHIN_PROTOCOL` / `FALSIFIED_WITHIN_PROTOCOL` / `INCONCLUSIVE` | yes |
| Belief revision | `beliefRevision.ts::updateConfidence`, capped by the Tautology Gate exactly as P2.1 wired it | yes |
| Next question | `selectNextProbe` — real lexicographic cascade (`DISCRIMINATES_TOP_TWO` / `DISCRIMINATES_OTHER_PAIR` / `NO_DISCRIMINATING_PROBE` / `NO_CONTENDERS_LEFT`), feeding `InquiryLoopResult.nextExperiment` and, via `nextAction.ts`'s 5-selector unifying contract, `StrategyRun.nextExperiment` | yes, from real belief state each round |

Already has a dedicated, real Chromium E2E (`scripts/inquiry-e2e.mjs`) for
this exact screen, all problems, predating this document.

### What was only partially wired (found, now closed)

`AutonomousInquiryScreen.tsx`'s `surviving.length === 0` branch existed but
was worded as an agent failure ("the world matched hypothesis X, the agent
didn't recover it"), because all 5 shipped demos set a true value that IS one
of the declared candidates. There was no demo where the true value matches
**none** of the candidates — the one case where zero survivors is the
*correct* answer, not a failure. `scripts/inquiry-e2e.mjs` was desktop-only;
`scripts/smoke-e2e.mjs` (which does run desktop+mobile) didn't visit
`#/inquiry`.

### Other real loops surveyed (none chosen)

| Loop | Real? | UI | Dedicated Chromium E2E | ≥2 falsifiable hypotheses |
|---|---|---|---|---|
| `discoveryLoop.ts` (MECHANISM, WorldGraph) | yes, adaptive, ordinal `ConfidenceLabel` belief | yes (`GenesisWorldScreen` etc. via `WorldDiscoveryPanel`) | none found | yes |
| `hypothesisLoop.ts` | yes, widely used | yes (`ExperimentPilotScreen`) | none found | yes |
| `experimentGraph.ts` / `whyNextExperiment.ts` | yes, real but not hypothesis generators themselves | yes | none found | depends on caller |
| `discoveryFollowUp.ts` (Discovery Engine) | yes, deterministic | indirect | yes (`discovery-e2e.mjs`) | no — single-case follow-up |
| `worldParameterCalibration.ts` (CALIBRATION) | yes | — | — | yes |

None combines a dedicated real-browser E2E with an already-coded,
already-tested zero-survivors path. Building either from scratch on any of
these would be new integration work with more unknowns than closing the one
real gap found on the QE1–QE3 path.

## GAP MATRIX

| Stage | Status |
|---|---|
| Problem formalization | DONE |
| ≥2 competing hypotheses | DONE |
| Predictions (same solver) | DONE |
| Real experiment + fingerprint | DONE |
| Tautology Gate | DONE (EMPIRICAL_TEST, existing P2.1 wiring, unmodified) |
| Evidence/provenance | DONE |
| Falsification attempt | DONE |
| Belief revision | DONE |
| Next-question selection | DONE |
| SUPPORTED demo | DONE (QE2/QE3, E2E-proven) |
| NARROWED/INCONCLUSIVE demo | DONE (QE1, E2E-proven) |
| FALSIFIED (per-hypothesis) demo | DONE (every run) |
| Correct-ending-without-resolution demo | **was MISSING → now DONE** (`qe1-misspecified`, see below) |
| Mobile smoke for `#/inquiry` | **was MISSING → now DONE** |
| MIXED_TEST applicability | N/A — structurally impossible for a single-component `SystemUnderStudy` by the gate's own design; not forced |

## What changed to close the gap

Zero changes to `entanglementInquiry.ts`, `inquiryLoop.ts`, or `tautologyGate.ts`.

1. **`components/AutonomousInquiryScreen.tsx`** — added a 6th selectable demo,
   `qe1-misspecified`, built from the *existing* `qe1VisibilityInquiry(0.6)`
   (0.6 is not any of `QE1_CANDIDATES`' declared visibilities: 1.00, 0.92,
   0.72, 0.50). `Problem.truthHypothesisId` widened to `string | null`; `null`
   marks a deliberately misspecified problem. Fixed the verdict narrative so a
   `null` truth with zero survivors reads as "POPRAWNE ZAKOŃCZENIE BEZ
   ROZSTRZYGNIĘCIA" (correct ending without resolution) rather than blaming
   the agent.
2. **`__tests__/entanglementInquiry.test.ts`** — regression-locks the exact
   facts behind the new demo: `qe1VisibilityInquiry(0.6)` → `surviving: []`,
   all 4 candidates falsified, `stopReason: NO_CONTENDERS_LEFT`,
   `tautologyAssessment.classification === 'EMPIRICAL_TEST'` (Gate correctly
   leaves it uncapped), and real, non-zero, downward belief movement from
   round 2 on (round 1, the shared uninformative opening, has magnitude 0 by
   construction — asserted separately, not conflated with a Gate cap).
3. **`scripts/inquiry-e2e.mjs`** — added `qe1-misspecified` to the declared
   problem list and its expected-verdict regex; added a `desktop|mobile`
   mode argument (same `viewport`/`isMobile`/`hasTouch` pattern
   `smoke-e2e.mjs` already uses) so the real workflow — not just the route —
   runs on both viewports.
4. **`scripts/smoke-e2e.mjs`** — added `#/inquiry` to `ROUTES[]` for generic
   mount/interaction smoke coverage on both viewports.

## Verification

- `npx tsc --noEmit -p packages/frontend` — clean.
- `npx eslint` on all four touched files — clean.
- Full frontend `vitest run` — 469 files, 5185 passed, 1 pre-existing skip.
- Full backend `node --test` — 429 tests, 371 pass, 0 fail, 58 skipped
  (unaffected — no backend files touched).
- `npm run build` — clean (pre-existing >750kB chunk warning, unrelated).
- **Real Chromium E2E, desktop** (`scripts/inquiry-e2e.mjs desktop`) — all 6
  problems, including the new `qe1-misspecified`, produce a real,
  multi-round, named-verdict result; zero pageerror/console.error.
- **Real Chromium E2E, mobile** (`scripts/inquiry-e2e.mjs mobile`,
  390×844, `isMobile`/`hasTouch`) — identical result, same 6/6.
- **Generic smoke E2E, desktop and mobile** (`scripts/smoke-e2e.mjs`) — 28
  routes including the newly added `#/inquiry`, zero runtime errors on
  either viewport.
- `scripts/discovery-e2e.mjs` re-run for the sibling MIXED_TEST-consuming
  module (`discoveryConclusion.ts`) — unaffected, still 76/76 checks green,
  Node/browser fingerprints identical.

## Limitations (stated, not hidden)

- The four end-states are demonstrated on the PARAMETER loop's own
  vocabulary (`surviving`/`falsified`/`stopReason`), not a categorical
  `DiscoveryVerdict` — that vocabulary belongs to the Discovery Engine
  (`discoveryConclusion.ts`), a different loop shape (see `discoveryStrategy.ts`'s
  own doc on why MECHANISM/PARAMETER/CALIBRATION stay separate rather than
  merged).
- `MIXED_TEST` is not exercised here and cannot be: a `SystemUnderStudy`
  carries exactly one `TautologyComponent`, and the gate's own design makes
  `MIXED_TEST` an aggregate-only label over ≥2 components. Forcing it onto
  this loop would mean redesigning `SystemUnderStudy` beyond what this task
  asked — not done, per "nie wymyślaj brakujących semantyk".
- `discoveryLoop.ts` (MECHANISM) and `hypothesisLoop.ts` remain real,
  UI-wired, production loops with no dedicated Chromium E2E of their own.
  That gap is real and unclosed by this work — named here rather than
  implied away.
