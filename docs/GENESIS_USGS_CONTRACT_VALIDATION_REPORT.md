# Genesis — USGS Contract-Only Validation Report

**Decision:** `B. PARTIALLY COMPATIBLE — BUILD LATER`  
**Scope:** one public station, one series, pinned raw data, no live adapter.

## A. Station and series

| Field | Verified value |
|---|---|
| Station | `USGS-01646500` — Potomac River Near Wash, DC Little Falls Pump Sta |
| Series | `timeSeriesId=66a4e3fb8abe42fcb0942b5c0fe98f68` |
| Parameter | `00060` — discharge / streamflow |
| Statistic | `00011` |
| Source unit | `ft^3/s` |
| Normalized unit | `m^3/s` |
| Bounded payload | 10 records, 2026-08-20 00:00–00:45 UTC |
| Quality | `Provisional` in the sampled records |
| Raw payload SHA-256 | `df142e9ebbee2c82d73ae2f1b0c3fd749e6d9f74336f8bc1b1d616bc0e51776f` |
| Metadata SHA-256 | `252094dd79c6527e3ea14cde454a82cf27d9d78f7426f2e74570348f9a95b034` |

The raw payload, monitoring-location metadata and normalized observation are committed under `docs/evidence/usgs/`. The normalization uses the explicit conversion `1 ft^3/s = 0.028316846592 m^3/s`; source strings remain preserved.

## B. What the fixture proves

The fixture proves that a bounded public real-data payload can be retained with station identity, time-series identity, parameter/statistic codes, source units, normalized units, timestamps, approval status, qualifiers, raw payload fingerprint, metadata fingerprint and transform version. The test suite proves deterministic replay from pinned files without a network refetch.

The negative tests detect tampering of the raw value, station, unit, time range and transform version as drift. Missing semantic fields remain a future `BLOCKED/VERIFY_REQUIRED` contract case; no missing-field path is promoted to scientific success.

## C. Existing Genesis water-model comparison

The existing `packages/frontend/src/core/engineeringGraph/pumpPipe.ts` was independently inspected and tested. It uses `volumetricFlow` in `m^3/s` as a **user-provided design input** and calculates flow velocity, Reynolds number, empirical friction factor, head loss, total head, hydraulic power and shaft power for a closed pump–pipe system.

USGS parameter `00060` is an observed open-channel river discharge. A unit conversion makes numeric injection possible, but injection is parameterization, not validation: the existing model does not predict river discharge. It therefore has no output observable that can falsify the selected USGS series under the current model assumptions.

A boundary test confirms this explicitly. Injecting the sampled 2,850 ft³/s into the default 0.1 m closed pipe produces a velocity above 10,000 m/s, Reynolds number above 10⁹, head loss above 10⁷ m and shaft power above 10¹² W. These are domain-boundary alarms, not a scientific result or a fabricated river prediction.

## D. Decision categories

### A. REAL DATA COMPATIBLE — BUILD NOW

**Not selected.** The raw data contract is technically preservable, but semantic model compatibility has not passed.

### B. PARTIALLY COMPATIBLE — BUILD LATER

**Selected.** The USGS data are real, identifiable, unit-bearing and replayable from pinned files. They are a viable future observation source, but a thin bridge must not be built until Genesis has an admitted model that predicts a semantically compatible observable for the selected observation.

### C. INCOMPATIBLE — REJECT

**Not selected for the data source itself.** Reject the current `USGS discharge → pump-pipe validation` mapping unless a future scientific specification establishes compatible boundary conditions and a predictive observable. Do not alter the existing model or add a new solver merely to force compatibility.

## E. Tests and evidence

The committed tests include:

- `usgsObservationFixture.test.ts`: 8 tests covering identity, pinned replay, raw payload fingerprint, deterministic replay and five tamper cases.
- `waterModelObservationBoundary.test.ts`: 3 tests covering exogenous flow input, model outputs and closed-pipe domain boundary.

Local gate after fixture and boundary tests:

- fixture/boundary tests: `11 passed`;
- full frontend/backend suite: green;
- typecheck: green;
- lint: green;
- production build: green, with existing Three.js chunk-size warning only;
- Chromium desktop: 27 routes, 242 interactions, zero runtime errors;
- Chromium mobile: 27 routes, 242 interactions, zero runtime errors;
- `git diff --check`: green.

## F. Hours and risks

The next stage should not be estimated as a bridge implementation yet. A defensible contract-only fixture required approximately **12–24 hours (estimate)** including source verification, raw preservation, normalization, provenance and negative tests. A bridge estimate is deliberately withheld until an existing Genesis model is found that predicts a compatible observation.

The main scientific risk is category error: treating a measured river discharge as a validation target for a closed-pipe model that takes flow as input. Other risks include provisional-data revision, station/time-series semantics, unit conversion, aggregation and transform changes.

## G. Recommendation

**BUILD LATER / VALIDATE NOW.** Keep the fixture as a research and contract artifact. Do not implement a live USGS adapter now. The next CTO decision should select an existing Genesis model with a predicted observable that can be tested against a real public observation. If no such model exists, choose a different observation/model pair rather than modifying the pump-pipe solver or fabricating a comparison.

## References

[1] [USGS Water Data APIs](https://api.waterdata.usgs.gov/) — official machine-readable water data services.

[2] [USGS Water Data OGC API documentation](https://api.waterdata.usgs.gov/docs/ogcapi/) — collections, schemas, queryables, timestamps and standardized responses.

[3] [USGS monitoring location USGS-01646500](https://waterdata.usgs.gov/monitoring-location/USGS-01646500/) — station data types, period of record and provisional-data notice.

[4] [USGS latest-continuous schema](https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/schema?f=json) — parameter code, units, approval status, qualifier and time fields.
