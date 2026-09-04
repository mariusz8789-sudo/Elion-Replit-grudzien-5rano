# USGS Observation Contract Fixture

**Status:** `PUBLIC_REAL_DATA` / `CONTRACT_ONLY` / `VERIFY_REQUIRED`  
**No production adapter implemented.**  
**Source:** U.S. Geological Survey Water Data OGC API.

## Source identity

| Field | Value |
|---|---|
| `sourceUri` | `https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items` |
| `query` | `monitoring_location_id=USGS-01646500&parameter_code=00060&datetime=2026-08-20T00:00:00Z/2026-08-21T00:00:00Z&limit=10&f=json` |
| `monitoringLocationId` | `USGS-01646500` |
| `locationName` | Potomac River Near Wash, DC Little Falls Pump Sta |
| `siteType` | Stream |
| `parameterCode` | `00060` |
| `parameterMeaning` | Discharge / streamflow |
| `sourceUnit` | `ft^3/s` |
| `featureCount` | 10 |
| `observationWindow` | 2026-08-20T00:00:00+00:00 through 2026-08-20T00:45:00+00:00 in this bounded response |
| `approvalStatus` | Provisional in sampled records |
| `rawPayloadSha256` | `df142e9ebbee2c82d73ae2f1b0c3fd749e6d9f74336f8bc1b1d616bc0e51776f` |
| `metadataSha256` | `252094dd79c6527e3ea14cde454a82cf27d9d78f7426f2e74570348f9a95b034` |
| `retrievedAt` | 2026-08-27 (sandbox retrieval; exact wall-clock time is recorded by Git commit context, not asserted as source observation time) |

## Files

- `USGS-01646500-00060-2026-08-20.json` — exact raw continuous-observation response.
- `USGS-01646500-monitoring-location.json` — exact raw monitoring-location metadata response.

## What this fixture proves

It proves that Genesis can preserve a real public observation payload and corresponding source metadata as a bounded, fingerprinted fixture candidate. The payload includes source time, time-series ID, station ID, parameter code, value, unit, approval status and qualifier fields.

## What this fixture does not prove

This fixture does **not** prove that the existing Genesis water-pump-pipe model predicts this streamflow series. It does not prove calibration, causal validity, hydrological representativeness, or a customer-ready live integration. The existing model and this open-channel station may have incompatible boundary conditions and semantics.

Before any adapter is implemented, a future validation must establish:

1. a semantically compatible model observable;
2. explicit unit and time-window normalization;
3. an accepted treatment of provisional values;
4. a deterministic comparison tolerance with scientific justification;
5. Evidence/Replay behavior for raw-payload tampering, station changes, unit changes and transform-version changes.

Until then, the status remains `VERIFY_REQUIRED`, not `CONNECTED`.

## Official references

- [USGS Water Data APIs](https://api.waterdata.usgs.gov/)
- [USGS OGC API documentation](https://api.waterdata.usgs.gov/docs/ogcapi/)
- [Monitoring location USGS-01646500](https://waterdata.usgs.gov/monitoring-location/USGS-01646500/)
- [Latest continuous schema](https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/schema?f=json)
- [Monitoring location JSON](https://api.waterdata.usgs.gov/ogcapi/v0/collections/monitoring-locations/items/USGS-01646500?f=json)

## CTO decision

`BUILD LATER / VALIDATE NOW`. Do not expose this fixture as a scientific result, do not label it as a Genesis model validation, and do not add a live fetch path until semantic compatibility is independently proven.
