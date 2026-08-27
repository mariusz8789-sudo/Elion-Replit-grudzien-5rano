# Claude — USGS contract-only validation report

## Status

**B. PARTIALLY COMPATIBLE — BUILD LATER**

Reached on model-semantics grounds alone, by executing the Genesis water model. **It does not
certify any fixture**, because the fixture this task was written to validate does not exist —
see the blocker below. No live USGS adapter, Micro-Manager, observation subsystem, solver,
Evidence Pack or Replay system was built. No ZIP.

## Blocker — the fixture does not exist

The task states that Manus prepared a contract-only USGS fixture at three paths. At LIVE HEAD
`0b7206d` none of them exists, and none has ever existed in this repository:

| Path                                                                 | At LIVE HEAD `0b7206d` |
| -------------------------------------------------------------------- | ---------------------- |
| `docs/evidence/usgs/USGS-01646500-00060-2026-08-20.json`             | **ABSENT**             |
| `docs/evidence/usgs/USGS-01646500-monitoring-location.json`          | **ABSENT**             |
| `docs/evidence/usgs/USGS-01646500-00060-normalized-observation.json` | **ABSENT**             |
| `packages/frontend/src/__tests__/usgsObservationFixture.test.ts`     | **ABSENT**             |

Checks performed:

- `docs/evidence/` contains exactly one file, `GENESIS_PYSCF_H2_AB_EVIDENCE.json`; there is no
  `usgs/` directory.
- `git log --all -- 'docs/evidence/usgs/**' '*usgsObservation*'` returns **nothing** — the files
  have never been committed on any branch.
- Every remote ref was scanned with `git ls-tree -r`; zero USGS paths on any of them.

What LIVE actually contains is `0b7206d` — "docs: decide first real world observation bridge",
which adds `docs/GENESIS_REAL_WORLD_OBSERVATION_CTO_DECISION.md`. That document **recommends
creating** the fixture; it does not contain one. Its own words: _"Create a contract-only fixture
containing raw payload fingerprint, normalized observation and provenance"_, _"First produce the
contract-only station fixture and compatibility decision"_, and its own status is
**`BUILD LATER / VALIDATE NOW`**.

**Consequence, stated plainly.** Sections 1, 2, 4 and 5 of the task — forensic fixture check,
deterministic replay test, provenance contract, negative cases — are **BLOCKED**. They cannot be
performed, and the only ways to make them appear performed would be to fabricate the fixture or
to fetch live USGS data. Both are explicitly forbidden by this task, and fabricating an
observation payload would be inventing scientific data. Nothing was fabricated and no network
request was made.

Section 3 — water model compatibility — is fully independent of the fixture and **was completed**.

## Branch and base

| Item           | Value                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| LIVE HEAD      | `0b7206df30eff0837f152722351d6745b63cbaa5` — "docs: decide first real world observation bridge", 2026-08-27 19:13:05 +0000 |
| Work branch    | `claude/usgs-contract-validation`, created from `0b7206d`                                                                  |
| Merged to LIVE | no                                                                                                                         |
| Pushed to LIVE | no                                                                                                                         |

## Fixture facts that could be established

| Field                       | Value                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Station                     | `USGS-01646500` — **claimed by the task, unverified**; no fixture and no metadata file to read                   |
| Time-series ID              | `VERIFY_REQUIRED` — not present anywhere                                                                         |
| Parameter code              | `00060` — **claimed**; USGS 00060 is discharge/streamflow, conventionally reported in ft³/s                      |
| Statistic ID                | `VERIFY_REQUIRED` — not present; this matters, because it distinguishes an instantaneous value from a daily mean |
| Source unit                 | `ft^3/s` — **claimed**, no payload to confirm                                                                    |
| Normalized unit             | `VERIFY_REQUIRED`                                                                                                |
| Window                      | `2026-08-20T00:00:00Z/2026-08-21T00:00:00Z` — **claimed**, no timestamps to confirm                              |
| Approval status / qualifier | `VERIFY_REQUIRED`                                                                                                |
| Record count                | `VERIFY_REQUIRED`                                                                                                |
| Raw payload SHA-256         | `VERIFY_REQUIRED` — no file to hash                                                                              |
| Metadata SHA-256            | `VERIFY_REQUIRED` — no file to hash                                                                              |
| Transform ID / version      | `VERIFY_REQUIRED`                                                                                                |

None of the above is asserted as true. Everything marked "claimed" comes from the task text, not
from an artifact.

## Deterministic replay

**BLOCKED.** There is no pinned payload to replay. No replay test was written, because a replay
test over a fixture that does not exist could only pass by embedding invented data.

## Negative cases

**BLOCKED.** All six required mutations (raw value, station ID, unit, observation window,
`transformVersion`, missing parameter code or timestamp) operate on a pinned fixture. With no
fixture, each would require fabricating the baseline it mutates. None was written.

## Water model compatibility — completed

Source: `packages/frontend/src/core/engineeringGraph/pumpPipe.ts` (204 lines). Each claim below
was verified against the file and, where marked, by executing the model.

| Claim to verify                                                                                         | Result                                                        | Evidence                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `volumetricFlow` has unit m³/s                                                                          | **CONFIRMED**                                                 | `pumpPipe.ts:51` (`// m³/s`) and the parameter declaration at line 84; executed: `getNode('volumetricFlow').unit === 'm³/s'`                                                                                                                                                                                    |
| It is an input, not a predicted output                                                                  | **CONFIRMED**                                                 | Built through `param()`, whose `inputs: []` and `compute: (i) => i[id] ?? value` is a pass-through; `formula: 'volumetricFlow (parametr)'`; honesty note _"Wydatek zadany przez projekt"_ (set by the design); `parameterProvenance.volumetricFlow = 'user-provided'`; executed: it appears in `parameterIds()` |
| Model generates flowVelocity, Reynolds, frictionFactor, headLoss, totalHead, hydraulicPower, shaftPower | **CONFIRMED**                                                 | All seven exist as graph nodes and all seven appear in `modelProvenance`; executed: each is present and none is a parameter                                                                                                                                                                                     |
| It describes a closed pump–pipe system                                                                  | **CONFIRMED**                                                 | Every node carries `domain: 'układ pompa–rurociąg'`; components are `['reservoir', 'pump', 'pipe', 'outlet']`; `v = Q/(πD²/4)` assumes a completely full circular conduit; `h_f = f·(L/D)·v²/(2g)` is Darcy–Weisbach for pipe flow; `H = H_stat + h_f`                                                          |
| USGS 00060 is a river discharge/streamflow observation                                                  | **CONFIRMED as domain fact, UNVERIFIED against any artifact** | USGS parameter code 00060 is discharge in ft³/s. There is no fixture here to check it against                                                                                                                                                                                                                   |

### The decisive finding, measured rather than argued

A correctly converted, realistic river discharge was injected into the model and the outputs were
read. Conversion is exact: 1 ft = 0.3048 m, so 1 ft³/s = 0.3048³ = 0.028316846592 m³/s.

Input: 4000 ft³/s → **113.267386368 m³/s**, into the model's default 0.1 m pipe.

| Output         | Value             | Sanity                                                                                                |
| -------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `flowVelocity` | **14 421.65 m/s** | ~42× the speed of sound in air                                                                        |
| `reynolds`     | **1.44 × 10⁹**    | far outside the Swamee–Jain validity band (5·10³ < Re < 10⁸) declared in the model's own honesty note |
| `headLoss`     | **1.729 × 10⁸ m** | ~172 900 km of head                                                                                   |
| `totalHead`    | **1.729 × 10⁸ m** | dominated entirely by friction                                                                        |
| `shaftPower`   | **2.74 × 10¹⁴ W** | 274 TW                                                                                                |

The model raised no error and returned finite numbers for all of it. The arithmetic is correct;
the physics is meaningless. This is the clearest available demonstration that a unit conversion
is not a semantic mapping.

### Two distinct questions, two different answers

1. **Unit mapping of Q — possible.** ft³/s → m³/s is an exact conversion and the model's Q is in
   m³/s. Nothing blocks the number crossing the boundary.
2. **Semantic mapping — not proven, and currently contradicted.** USGS 00060 is open-channel
   river flow: free surface, stage-dependent wetted cross-section, rating-curve derived. The
   Genesis model is a pressurised closed conduit of fixed circular area. Feeding one into the
   other produces values for a hypothetical pipe that does not exist in the river.
3. **A third point, which the task did not ask for and which is the real blocker.**
   `volumetricFlow` is an **input**. The model therefore **predicts no discharge at all**. A
   validation loop needs the model to produce a quantity the observation can falsify. Injecting
   the observation as an input and reading the outputs is parameterisation, not validation —
   there is nothing for the USGS series to test. Even a perfect fixture would not, on its own,
   make this pairing a model-to-real-world validation loop.

No `CONNECTED` status is justified. No comparison result was produced.

## Change made

One test file, no production code:

`packages/frontend/src/__tests__/waterModelObservationBoundary.test.ts` (3 tests) pins the facts
above so a future adapter has to confront them rather than silently convert units:

1. `volumetricFlow` is a design input in m³/s and all seven derived quantities are derived — the
   model predicts no discharge;
2. the geometry is a closed pump–pipe system (`v = Q/(πD²/4)`, Darcy–Weisbach, reservoir → pump →
   pipe → outlet), not an open channel;
3. a correctly converted river-scale discharge drives velocity past 10³ m/s, head loss past 10⁶ m
   and shaft power past 10¹² W, and the model reports no error — so any bridge must be explicit.

No model file, solver, adapter or architecture was changed.

## What a valid fixture must contain

Recorded here so the fixture can be produced correctly, not as an implementation.

Source URI · exact query string · retrieval timestamp and context · station ID · time-series ID ·
parameter code · **statistic ID** (instantaneous vs daily mean — currently unspecified and
material) · source unit · normalized unit · every observation timestamp with its timezone ·
approval status and qualifier codes per record · record count · raw payload file · **real
SHA-256 of the raw payload bytes** · **real SHA-256 of the metadata file** · transform ID and
version · an explicit replay-input policy stating that replay reads only pinned files and
performs no network call · Genesis compatibility status · limitations.

Two specific cautions for whoever builds it:

- The fingerprint must cover the **raw payload and metadata bytes**, not only the normalized
  JSON. A hash of the normalized output alone cannot detect upstream payload tampering, and
  changing a declared hash string is not the same as computing one.
- Approval status matters scientifically: USGS provisional data can be revised after publication,
  so a fixture pinned to provisional records can legitimately drift against the live source
  without anything in Genesis being wrong.

## Effort estimate to the next stage

`ESTIMATE`, not a commitment:

| Step                                                                                                                                       | Hours       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Produce the contract-only fixture (fetch once, pin payload + metadata, compute real SHA-256s, write normalized observation and provenance) | 6–12 h      |
| Fixture replay + the six negative-case tests                                                                                               | 4–8 h       |
| Honest compatibility decision recorded against the fixture                                                                                 | 2–4 h       |
| **Total to a defensible contract-only fixture**                                                                                            | **12–24 h** |

A thin bridge is deliberately **not** estimated: per the finding above, the pairing needs a model
that predicts an observable before a bridge is meaningful. That is a CTO decision, not an
estimate.

## Risks

| Risk                                                     | Type                           | Note                                                                                                  |
| -------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Unit conversion mistaken for semantic validation         | **Scientific, high**           | Demonstrated: correct conversion yields 274 TW. Guarded now by the new test                           |
| No model output that a discharge observation can falsify | **Scientific, high**           | Q is an input. Without a predicted observable there is no validation loop, only parameterisation      |
| Open-channel vs closed-conduit regime                    | **Scientific, high**           | Free surface, stage-dependent area, rating curve — none represented in the model                      |
| Provisional USGS records revised upstream                | **Scientific, medium**         | A pinned fixture can drift against live data for legitimate reasons; approval status must be recorded |
| Statistic ID unspecified                                 | **Scientific, medium**         | Instantaneous vs daily mean changes what the number means; it is absent from the task spec            |
| Fingerprint over normalized JSON only                    | **Technical, medium**          | Would not detect raw payload tampering                                                                |
| Acting on a fixture that does not exist                  | **Technical, high — realised** | The premise of this task was untrue; proceeding would have required fabrication                       |

## Tests, gate and CI

| Gate                       | Result                                                                        |
| -------------------------- | ----------------------------------------------------------------------------- |
| Dedicated boundary tests   | **PASS** — 3/3                                                                |
| Frontend tests             | **PASS** — 139 files, 1416 passed, 1 skipped                                  |
| Backend tests              | **PASS** — 311 tests, 271 passed, 0 failed, 40 skipped (`BLOCKED_BY_RUNTIME`) |
| Typecheck                  | **PASS**                                                                      |
| Lint                       | **PASS**                                                                      |
| Production build           | **PASS** (pre-existing chunk-size advisory only)                              |
| `git diff --check`         | **PASS** — exit 0                                                             |
| Chromium desktop 1600x1000 | **PASS** — 0 console errors, no horizontal overflow                           |
| Chromium mobile 390x844    | **PASS** — 0 console errors, no horizontal overflow                           |
| Working tree               | clean                                                                         |

Chromium regression check on the production build, identical on both viewports: Earthquake plan →
confirm gives `Earthquake run gotowy`, Replay `MATCH`, `structuralDamage NOT_MODELED`,
`resultOrigin real-engine`, `runFingerprint run_b74740fc`; Protocol / A-B tab mounts with its
controls. No "Realny silnik zwrócił błąd wykonania", no "Nieobsługiwany adapter".

CI for this branch is reported in the session message accompanying this commit.

## Limitations

- The fixture, its replay and all negative cases are **BLOCKED**, not passed and not failed.
- Station `USGS-01646500`, parameter code `00060`, the ft³/s source unit and the 2026-08-20 window
  are reproduced from the task text and are **unverified against any artifact**.
- The 4000 ft³/s figure used in the boundary test is a plausible magnitude chosen to demonstrate
  the regime mismatch. It is **not** an observation and is not attributed to any station.
- No network request was made; PySCF, RDKit and ADMET-AI runtimes remain unavailable locally.
- Chromium ran under SwiftShader, not a real GPU.
- LIVE moves quickly; everything here is pinned to `0b7206d`.

## Recommendation

Keep **BUILD LATER**. Before any bridge work:

1. Manus produces the contract-only fixture the CTO decision document already calls for, including
   the statistic ID and real payload/metadata SHA-256s. Then this validation can actually run.
2. Answer the prior question this audit surfaced: **which Genesis model predicts an observable
   that a public observation could falsify?** For the pump–pipe model the answer today is none —
   Q is an input. If no existing model qualifies, the honest move is to pick a different model or
   a different observation, not to build a bridge into this one.
