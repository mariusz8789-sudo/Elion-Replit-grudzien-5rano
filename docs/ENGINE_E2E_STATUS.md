# ENGINE_E2E_STATUS.md

Live E2E status, branch `claude/genesis-winner-gate-audit-qgf90v`, commit `439a0551`. Every number
below comes from an actual command run in this audit session (not copied from other docs, though it is
cross-checked against `docs/DECISIONS.md`'s D-115 entry, which it matches exactly).

## Command results

| Command | Result |
|---|---|
| `eslint .` (repo-wide lint) | **PASS** — 0 errors, 0 warnings |
| `npm run build` (`tsc -b && vite build`, frontend typecheck+build) | **PASS** — 0 type errors, build succeeded (831 modules, ~9.5s) |
| `npm run test --workspace=packages/frontend` (vitest) | **PASS** — 558/558 test files, 6533 passed, 1 skipped, 0 failed |
| `npm run test --workspace=packages/backend` (`node --test`) | **PASS** — 835 tests, 802 pass, 0 fail, 33 skipped |
| `npm run e2e:gov-drug` (GOV-DRUG-DISCOVERY-E2E-01) | **PASS** — 18/18 invariant checks held, real outcome NO_WINNER |
| `npm run lower-harm-funnel:demo` | **PASS** — 5/5 invariants held, real outcome WINNER (CHEMBL4084119) |
| `npm run lower-harm:demo` | **PASS** — 4/4 invariants held, real ranking reproduced, winner CHEMBL4084119 |
| `npm run winner-recipe:demo` (SYNTHETIC_TEST_ONLY invariant demo) | **PASS** — 8/8 invariants held |
| PRODUCTION-mode `runGovLowerHarmDiscovery`/`replayGovLowerHarmDiscovery` (run directly against the real orchestrator, this session, real un-synthetic evidence) | **PASS** — verdict WINNER, winnerId `CHEMBL4084119`, recipeFingerprint `7ddcabe9`, all 20 orchestrator stages OK, replay `ok:true`, fingerprint identical across two independent runs |
| `smoke:desktop` (Playwright, against a real built+served frontend + backend) | **PASS** — 29 routes + 13 labs, 223 interactions, zero runtime errors |
| `smoke:mobile` (same, mobile viewport) | **PASS** — 29 routes + 13 labs, 246 interactions, zero runtime errors |
| `GET /api/health` (real backend process, started for this audit) | **PASS** — `{"ok":true,"commit":"439a0551e6aa2e2e9b13ea240e637490498c0176", ...}` — commit matches HEAD exactly, DB ready, static build served |

No command failed. No test was skipped to make a number look better — every skip below is named and
explained, matching the pre-existing, documented gate.

## Skips (all of them, named)

- **Frontend, 1 skip**: `backendEvidenceExecution.test.ts`'s test gated on
  `GENESIS_REAL_BACKEND === '1'` (requires a real local PySCF quantum-chemistry backend process not
  present in this sandbox). Pre-existing, intentional, documented in `docs/DECISIONS.md`. Not touched
  by this audit.
- **Backend, 33 skips**: pre-existing, unrelated to this audit's domain (LOWER_HARM/Winner Gate) — same
  33 as the day-earlier `b3307160` commit's own re-run and the D-115 entry's re-run recorded in
  `docs/DECISIONS.md`. Not enumerated file-by-file here since the count and its cause are unchanged from
  the already-documented baseline; re-running `npm run test --workspace=packages/backend` with default
  `node --test` output shows each skip's own name inline if a line-by-line audit is needed.

## Order independence — PASS

`govDrugLowerHarmFunnel.test.ts:102` — "the same TOP2 pair produces the same fingerprint regardless of
candidate order" (`freezeFalsificationCriteria` sorts/canonicalizes before fingerprinting, by
construction, not by convention). Live re-verification: `replayGovLowerHarmDiscovery({mode:
'PRODUCTION'})` → two independent runs → identical `recipeFingerprint` (`7ddcabe9` both times).

## Tie handling — PASS

Three distinct, disclosed states exist and are each independently, currently reachable and tested:
`CONFLICTING_EVIDENCE` (`govDrugLowerHarmRanking.test.ts:156`, proven reachable with a synthetic
dimension split, since the real current data does not itself produce a tie), `NO_WINNER` (`:173`, empty
qualifying set) and `INSUFFICIENT_EVIDENCE` (`:192`, empty candidate space) — never a silent
array-position pick.

## Fingerprint robustness — PASS

Every stage of a live `PRODUCTION` run carries its own non-empty fingerprint (20/20 stages, verified in
this session's raw JSON dump); `runFingerprint`, `preregistrationFingerprint`,
`falsificationCriteriaFingerprint`, `recipeFingerprint`, and `auditFingerprint` are all populated,
distinct, and reproducible across independent runs.

## Current real results (independently re-derived, not copied from any doc)

### LOWER_HARM

```
mode:               PRODUCTION
verdict:             WINNER
winnerId:            CHEMBL4084119
candidate:           liraglutide
recipeFingerprint:   7ddcabe9
adjudication (safety/governance gate on the favoured candidate): REQUIRES_HUMAN_APPROVAL
  (confirmed via the funnel's own ADJUDICATION step, lower-harm-funnel:demo:
   "CHEMBL4084119: REQUIRES_HUMAN_APPROVAL")
replay:              MATCH (two independent runs, identical fingerprint)
```

This is **unchanged** from the value documented in `docs/DECISIONS.md`'s D-115 entry
(`runGovLowerHarmDiscovery({mode:'PRODUCTION'})` → WINNER, `recipeFingerprint 7ddcabe9`) — no rule,
threshold, weight, or Winner Gate logic was touched during this audit; this is the same real, standing
result, freshly re-run and reconfirmed byte-for-byte.

### GOV-DRUG-DISCOVERY-E2E-01

```
verdict:    NO_WINNER
winnerId:   null (none named)
recipe:     null / NOT_EMITTED (gated on WINNER — correctly did not fire)
replay fingerprint: 7a901584 (stable across two independent runs)
18/18 invariant checks held
```

Also unchanged from the documented state. The real leading eligible-after-veto candidate
(PF-06291874) is itself 0.78pp *worse* than semaglutide; the candidates with genuine efficacy advantage
(tirzepatide, orforglipron) remain blocked by the existential safety veto. This is a real, honest
non-winner — not a bug and not something this audit "fixed", because it was never broken: the pipeline
is doing exactly what its own preregistered rule requires.

**Both results were confirmed by running the real, live orchestrator during this session — not by
reading documentation and assuming it still held.**

## Recipe status

`RECIPE_TYPE: ALGORITHMIC_AUDIT_ARTIFACT_NOT_MEDICAL_PRESCRIPTION`

The LOWER_HARM winner's real recipe (verified live, `winner-recipe:demo`'s structure — the same builder
PRODUCTION mode uses) carries: `mechanism` (a binding/functional-data statement, explicitly "not a
therapeutic claim" in its own text), `winnerRecordRef`, `evidence` (real NCT-linked observations with
deltas), `falsificationResults` (three real conjuncts, each independently checkable), `limitations`
(explicitly disclosed, e.g. "no independent replication ... has been performed"), and
`reproducibilityInstructions`. It contains **no** dosage, prescription, treatment-instruction, or
synthesis-procedure field — confirmed by direct inspection of the live output's full field list.

## Unresolved risks / limitations / missing data (disclosed, not hidden)

- LOWER_HARM's real winner (liraglutide) reaches WINNER through a **safety-dominant, relative-ranking**
  rule (best of a two-candidate TOP2, not "beats the reference outright") — its own safety/governance
  gate outcome is `REQUIRES_HUMAN_APPROVAL`, not an unconditional clearance; this is disclosed on the
  record, not smoothed over.
- The separate, stricter GOV-DRUG-DISCOVERY-E2E-01 rule reaches NO_WINNER on the *same* corrected data —
  this divergence is a real, intentional property of having two independently preregistered rules, not
  an inconsistency to be reconciled by this audit.
- LOWER_HARM's real dataset still has exactly one historical `IDENTITY_MISMATCH` on record (dulaglutide,
  refused for native GLP-1, D-115) — kept, not deleted, and it is the reason native GLP-1 no longer
  qualifies at all (0 real HbA1c observations after the refusal).
- Backend's 33 skipped tests and frontend's 1 skipped test are both pre-existing, environment-gated (a
  real local quantum-chemistry backend / SQLite feature-flag dependent), not newly introduced or hidden
  by this audit.
- No new external evidence has arrived for either domain since D-115; both real results reported here
  are the current, standing state of the repository, reconfirmed live rather than assumed unchanged.
