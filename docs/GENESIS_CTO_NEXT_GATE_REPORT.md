# Genesis — CTO Next Gate Readiness Report

**Status:** `READY FOR NEXT CTO DECISION`  
**LIVE HEAD:** `16de070644fc4068051b288b9610fbbf103e5f46`  
**Branch in workspace:** `genesis-live-merge` tracking `origin/manus/high-fidelity-epidemic-digital-twin`  
**Working tree:** clean at the time of this readiness pass.

## 1. Current status

Genesis has a verified computational discovery path from Science Chat through preregistered Protocol/A-B, capability admission, real backend execution, Evidence Pack, Scientific Memory and explicit Replay. The current scope is computationally connected; physical observation is not yet represented as a validated model comparison.

| Area | Status | Evidence / boundary |
|---|---|---|
| Science Chat → structured request | `FULLY_CONNECTED` | Existing frontend tests and Chromium smoke |
| Protocol/A-B | `FULLY_CONNECTED` | Pilot preregistration and explicit confirmation |
| Capability Admission Matrix | `CONNECTED` | Registry-derived matrix with release-gated assertions |
| Real PySCF H₂ | `CONNECTED` | Pinned CI job, PySCF 2.14.0, Python 3.12.3 |
| Evidence Pack | `FULLY_CONNECTED` | Canonical Fabric Evidence Pack contract |
| Scientific Memory | `CONNECTED` | Local-first saved experiment and Evidence history |
| Explicit Replay | `CONNECTED` | User-triggered rerun and canonical MATCH/DRIFT/BLOCKED comparator |
| USGS observation | `EXISTS` / `VERIFY_REQUIRED` | Pinned contract fixture only; no live adapter |
| USGS → current pump-pipe validation | `BLOCKED` | Current model takes Q as input and does not predict river discharge |
| Micro-Manager / instruments | `PARKED` | No implementation or admission decision |
| Campaign / GIS / Matrix / Collider | `PARKED` or `NOT_CONNECTED` | Intentionally not connected in this gate |

## 2. Verified capabilities and integrity rules

The admission matrix is generated from the canonical router/registry surface. It distinguishes an executable connected backend from a model descriptor, an unavailable engine and a parked capability. `CONNECTED` is not assigned merely because a parser, route or schema exists.

The replay identity is stable across volatile backend identifiers. `backendRunId` remains available for audit provenance but does not enter the scientific fingerprint. Volatile `referenceRunIds` do not determine Evidence Pack identity. Identical logical runs produce `MATCH`; scientific input changes produce `DRIFT`; incomplete or unavailable execution is blocked rather than represented as a successful real-engine result.

The browser-facing restore path is explicit: Scientific Memory opens the saved protocol in Pilot, the correct protocol model is shown, and execution requires a separate user confirmation. Restore does not silently run a solver.

## 3. Real PySCF status

The repository contains a separate CI job named `Real PySCF benchmark`. It pins Python `3.12.3`, installs `PySCF 2.14.0` from `packages/backend/requirements-pyscf.txt`, and executes `packages/backend/src/pyscfFabricApi.test.mjs`. The real-runtime branch is distinguished from the unavailable-runtime branch; a green unavailable-runtime rejection is not treated as a real scientific run.

Local environments without PySCF remain `VERIFY_REQUIRED`; the CI runner is the authoritative reproducible runtime proof. This pass does not fabricate local numbers or replace the CI evidence.

## 4. Evidence and Replay status

The computational chain has the following verified form:

> Science Chat → Protocol/A-B → real PySCF arms → provenance → Evidence Pack → Scientific Memory → explicit rerun → MATCH/DRIFT/BLOCKED.

The persisted pack includes both the completed runs and their provenance. The comparison is canonical and does not create a second Replay system. Negative tests cover basis/geometry integrity at the backend boundary, volatile run IDs, Evidence Pack identity, tampered fingerprints and explicit replay verdict semantics.

## 5. USGS fixture status

The pinned fixture uses one real public station and one bounded series:

| Field | Value |
|---|---|
| Station | `USGS-01646500`, Potomac River Near Wash, DC Little Falls Pump Sta |
| Series | `timeSeriesId=66a4e3fb8abe42fcb0942b5c0fe98f68` |
| Parameter | `00060`, discharge / streamflow |
| Statistic | `00011` |
| Source unit | `ft^3/s` |
| Normalized unit | `m^3/s` |
| Records | 10 |
| Time window | 2026-08-20 00:00–00:45 UTC |
| Quality | `Provisional` |
| Raw SHA-256 | `df142e9ebbee2c82d73ae2f1b0c3fd749e6d9f74336f8bc1b1d616bc0e51776f` |
| Metadata SHA-256 | `252094dd79c6527e3ea14cde454a82cf27d9d78f7426f2e74570348f9a95b034` |
| Replay policy | Pinned files only; no network refetch |

The fixture preserves raw payload, station metadata, normalized observations, source/normalized units, timestamp, quality, hashes, transform ID/version and explicit limitations. Its tests detect changes to the raw payload, station, unit, observation window and transform version as drift.

## 6. Model compatibility decision

The existing `water-pump-pipe` model has `volumetricFlow` in `m^3/s` as a user-provided input. It calculates velocity, Reynolds number, empirical friction factor, head loss, total head, hydraulic power and shaft power for a closed pump–pipe system. It does not predict open-channel river discharge.

Therefore, converting USGS discharge to `m^3/s` and injecting it into the model would be parameterization, not model validation. The fixture is real and replayable, but the selected model–observation pair is not semantically compatible for a falsifiable comparison.

**Decision:** `PARTIALLY COMPATIBLE — BUILD LATER`. Do not alter the pump-pipe model and do not build a live USGS adapter until a model with a compatible predicted observable is selected.

## 7. Regressions found and fixed

No production regression was found in this readiness pass. The fixture test initially exposed two contract issues: a replay fingerprint that did not include the actual raw payload bytes, and a test path that depended on the runner working directory. Both were fixed in test/fixture scope. The boundary tests additionally prevent silent presentation of river discharge as pump-pipe validation.

No changes were made to Earthquake, Epidemic Core, Matrix, Collider, Campaign or the existing water solver.

## 8. Architecture readiness for an observation bridge

The architecture is **conceptually ready but not yet bridge-ready for a specific provider**. The pinned fixture demonstrates the required observation record shape and replay discipline, but Genesis still needs a scientifically admitted model–observable pair before a provider adapter can be justified.

A future bridge must preserve source URI/query, retrieval context, observation and series identity, timestamp/window, raw payload and metadata hashes, units, quality, transform version, provenance, replay policy, compatibility status and limitations. Replay must read the pinned payload and never silently refetch internet data.

## 9. What must not be built yet

Do not build a live USGS adapter, Micro-Manager integration, MQTT/OPC UA/SiLA connector, instrument control, new water solver, GIS pipeline, new Evidence system, new Replay system, new domain or new demonstrator. Do not force compatibility by mapping an observation into a model input and calling the output a validation result.

## 10. What is ready for the next CTO decision

The next decision is to select one existing Genesis model and one real observation that satisfy the falsifiability requirement: the model must produce the observable that the data can challenge. Candidates must be compared on physical semantics, units, boundary conditions, ground truth, license, provenance, replay and validation tolerance.

If no existing pair qualifies, the correct status is `BUILD LATER` or `REJECT`; Genesis should not add a solver merely to create a bridge.

## 11. Gate record

The latest verified computational gate before this report was GitHub Actions run `33111077999`, green, on commit `16de070`. It included frontend/backend tests, typecheck, lint, production build and the real PySCF job. The contract-only fixture and boundary suite add 11 passing tests locally. Chromium desktop/mobile smoke remained green with zero runtime errors.

## 12. Final answers

| Question | Answer |
|---|---|
| A. Is LIVE healthy? | **Yes**, latest published gate green and working tree clean. |
| B. Is the computational proof confirmed? | **Yes**, including real PySCF CI and explicit Replay semantics. |
| C. Is USGS only fixture/contract validation? | **Yes**. It is not a live adapter or model validation. |
| D. Is Genesis architecturally ready? | **Partially**: ready for a pinned observation contract, not yet for a provider-specific bridge. |
| E. Is there a blocker? | **Yes**: no existing Genesis model currently predicts the selected USGS river-discharge observable. |
| F. What happens after CTO decision? | Select a valid model–observation pair, then implement only the smallest pinned-data bridge and repeat Evidence/Replay validation. |

## References

[1] [USGS Water Data APIs](https://api.waterdata.usgs.gov/) — official public water-data services.

[2] [USGS OGC API documentation](https://api.waterdata.usgs.gov/docs/ogcapi/) — schemas and query semantics.

[3] [USGS monitoring location USGS-01646500](https://waterdata.usgs.gov/monitoring-location/USGS-01646500/) — station metadata, data types and provisional-data notice.

[4] [USGS latest-continuous schema](https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/schema?f=json) — time, parameter, unit, quality and qualifier fields.
