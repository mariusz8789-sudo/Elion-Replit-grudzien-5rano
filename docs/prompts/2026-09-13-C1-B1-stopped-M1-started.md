# C1: B1 stopped mid-flight, switching to M1 — ObservationGapRequest

Direct instruction from the human operator (not another session's proposal):
drop B1 now, do not continue it further, switch immediately to
"M1 — ObservationGapRequest" as a new, independent step of the Genesis core.
Explicitly rejected merging M1 into B1 or treating M1 as B1's next phase —
they are to stay separate tasks.

## B1 (ULEZ→NO2 adjudication) — exact state at stop, for whoever resumes it

Not abandoned due to failure — stopped by explicit human directive while
technically healthy. Everything below is real and reusable:

- `packages/frontend/src/core/agent/causalInference.ts` (CAP-2): a new,
  domain-agnostic causal-inference estimator library (two-way FE DiD, ITS,
  synthetic control), TDD-verified against two real statistical bugs found
  and fixed before any real data was touched — the Conley & Taber (2011)
  single-treated-cluster SE problem (fixed via permutation inference) and a
  synthetic-control convex-hull extrapolation failure (fixed via
  synthetic-DiD-style demeaning). 10 passing tests in
  `packages/frontend/src/__tests__/causalInference.test.ts`. Not yet wired
  to real B1 data or to `tautologyGate.ts`/`beliefRevision.ts`.
- Real DEFRA AURN site codes found via WebSearch (not guessed): MY1 (London
  Marylebone Road, treated), MAN3 (Manchester Piccadilly), LED6 (Leeds
  Headingley Kerbside), SHBR (Sheffield Barnsley Road) — 3 control cities,
  a documented, deliberate scope reduction from the research package's
  suggested 5 (see D-025 in `docs/DECISIONS.md`).
- Real download URL pattern confirmed via 2-round CI recon:
  `https://uk-air.defra.gov.uk/datastore/data_files/site_data/<SITE>_<YEAR>.csv?v=1`.
- `scripts/fetch-b1-defra-aurn-fixture.mjs`: fetches one site-year, extracts
  only NO2+SO2 columns (quote-aware CSV parsing — DEFRA's header has VOC
  names with literal commas inside quotes), computes SHA-256 of both the
  original full CSV and the narrow extraction, writes both plus a
  `<SITE>_<YEAR>.meta.json` to disk.
  **Fix landed just before stopping**: originally the script dumped the
  narrow CSV to stdout for job-log read-back (the pattern used for
  CMS/QE4/Kepler) — this silently corrupts on B1 because GitHub's job-log
  read-back API caps returned content under one site-year's ~8766 rows
  (empirically confirmed: a request came back truncated to its last ~5000
  lines, losing the file's own header/hashes). Fixed to route the narrow
  CSV through `actions/upload-artifact` instead, matching every other
  pinned fixture in this workflow.
- `.github/workflows/ci.yml`'s `b1-defra-aurn-pin-narrow` matrix job (12
  shards: 4 sites × 3 years 2022-2024) — **all 12 succeeded** with the
  artifact-upload fix, in run
  https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano/actions/runs/34727214413
  (commit `4c819ca8`). Each shard uploaded an artifact named
  `b1-defra-aurn-<SITE>-<YEAR>-4c819ca8004200a8efa9a0a514aea8ed2072baa7`
  containing `<SITE>_<YEAR>.csv` + `<SITE>_<YEAR>.meta.json`.

### What is NOT done (stopped here)

- The 12 artifacts have **not** been downloaded, hash-verified, or
  reconstructed into a committed fixture under
  `packages/frontend/src/core/biotechData/b1-defra-aurn/`.
- No `manifest.json` with cross-site-year provenance exists yet.
- The temporary matrix job has not been converted into a steady-state
  drift-detection job.
- No preregistration document was written or sealed — **no real DiD/ITS/
  synthetic-control estimate has been computed, no negative controls have
  been run, and no ADJUDICATION verdict exists.** Nothing in this session
  looked at outcome values before stopping.
- Outstanding relay from a concurrent session (see
  `2026-09-12-DZIS-priorytety-F1.md`, commit `86d34d9b`), not yet actioned:
  provenance should root at DEFRA not at the CI-artifact transport layer;
  shard boundaries/merge order should enter the preprocessing fingerprint;
  consider freezing a raw hourly sample alongside the narrow extraction
  (mirroring QE4's raw+aggregate split).
- Unrelated to B1: the same CI run's `verify` job failed at "Testy backend"
  (1/429 backend tests failing — the failing test's own name did not fit in
  the log tail this session pulled). Not investigated further here since it
  is outside both B1 and M1's scope; whoever owns the backend suite should
  check it.

Full research package remains at
`docs/B1_ULEZ_NO2_ADJUDICATION_REAL_DATASET_AND_EXPERIMENT.md` — still
valid, nothing in it has been invalidated, this is a pause not a redesign.

## M1 — ObservationGapRequest

This label does not appear anywhere in the repository (checked: no match
for "ObservationGapRequest" or "Observation Gap" in `docs/`). Per this
repo's own stated discipline ("Brak wejścia = BLOCKED, nie improwizacja" —
missing input = BLOCKED, not improvised), C1 is not inventing this
component's contract from the routing message alone. Waiting on the actual
specification (inputs/outputs, how it plugs into the discovery engine
described in `GENESIS_ENGINE_MISSION_MANDATE.md` / `MASTER_SPEC_DELTA_V3.md`,
acceptance criteria) before writing any code.
