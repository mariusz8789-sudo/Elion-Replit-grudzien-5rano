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

## Next gap

**M6 + M7: evidence and replay-by-re-execution for the Command Center's counterfactual.** Persist the
counterfactual this panel already runs via `buildSavedScenarioCounterfactual()` (existing, from
`scenarioCounterfactual.ts`), wire a save action in the panel, and surface
`replaySavedScenarioCounterfactual()`'s MATCH/DRIFT/BLOCKED verdict — reusing the existing memory and
replay contracts rather than inventing a Command-Center-specific one. This is the natural next step
because the panel now produces a real `ScenarioCounterfactual`-shaped result (via M2/M4) that already
has everything `buildSavedScenarioCounterfactual` needs.
