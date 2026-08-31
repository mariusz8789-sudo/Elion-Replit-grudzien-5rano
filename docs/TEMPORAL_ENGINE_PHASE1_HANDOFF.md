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

## Next gap

**M2 + M4 together: re-point the Command Center timeline at the counterfactual engine.** Rather than
generalizing the timeline on top of the duplicate pair-run path, make `scenarioCommandCenter.ts`
delegate to `runScenarioCounterfactual()`, then render the timeline from
`buildTemporalTimeline(baseline, 'BASELINE')` / `buildTemporalTimeline(variant, 'VARIANT')` and show
the **measured** `firstDivergentDay` as the divergence marker — never the declared
`interventionStartDay`, which may precede any actual divergence.
