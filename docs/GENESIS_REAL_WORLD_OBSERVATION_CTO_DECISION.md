# Genesis — Real-World Observation Bridge CTO Decision

**Status:** RESEARCH-ONLY / NO IMPLEMENTATION  
**Decision date:** 2026-08-27  
**Scope:** wybór jednego pierwszego mostu `model → real observation → comparison → Evidence → Replay`.

## Executive decision

Genesis nie powinien jeszcze podłączać Micro-Managera ani sterować instrumentem. Najlepszym pierwszym kandydatem do dalszego proofu jest **read-only public water observation**, konkretnie USGS Water Data APIs, ale wyłącznie jako warstwa obserwacji i walidacji po udowodnieniu mapowania do istniejącego modelu. Rekomendacja brzmi **BUILD LATER / VALIDATE NOW**, a nie `BUILD NOW`.

USGS udostępnia machine-readable REST/OGC APIs dla continuous measurements, daily values, monitoring locations, time-series metadata oraz real-time flood impacts. Oficjalna dokumentacja opisuje zarówno dane pomiarowe, jak i metadane lokalizacji oraz serii czasowych [1][2]. To daje lepszy pierwszy materiał niż zakup mikroskopu: nie wymaga hardware’u, ma publiczny endpoint, historię i metadane, a analizę można odtwarzać z zapisanego raw response.

> **Nie jest to jeszcze dowód, że istniejący Genesis water-pump-pipe model jest naukowo zgodny z danymi USGS.** To hipoteza integracyjna wymagająca validation fixture i jawnego statusu `VERIFY_REQUIRED`.

## Current state

| Element | Status | Uzasadnienie |
|---|---|---|
| Existing water model | `CONNECTED` | Genesis ma bounded Darcy–Weisbach/Swamee–Jain engineering graph. |
| Real external observation contract | `NOT_CONNECTED` | Nie ma jeszcze canonical observation record dla danych zewnętrznych. |
| USGS continuous/daily APIs | `AVAILABLE / VERIFY_REQUIRED` | Oficjalny publiczny REST/OGC access, ale konkretna seria i warunki użycia wymagają sprawdzenia przed produkcją. |
| Model vs observation comparison | `DESIGNED` | Istniejące Evidence/Replay semantics można rozszerzyć cienkim adapterem, lecz mapowanie jednostek i założeń nie jest udowodnione. |
| Instrument bridge | `PARKED` | Brak potrzeby sprzętu w pierwszym proofie. |
| Micro-Manager | `CANDIDATE / VERIFY_REQUIRED` | Wysoki efekt demonstracyjny, ale większe ryzyko sprzętu, sterowników, kalibracji i raw metadata. |

## Verified facts

1. Oficjalny USGS Water Data API site udostępnia machine-readable REST APIs dla najnowszych pomiarów, danych dziennych, lokalizacji monitoringowych i metadanych serii czasowych [1].

2. Oficjalne OGC APIs korzystają ze wspólnego interfejsu i standardowych formatów; dokumentacja pokazuje endpointy collections, schema, queryables i items oraz możliwość odpowiedzi JSON/GeoJSON [2].

3. USGS opisuje dane continuous jako pomiary automatycznych sensorów, a daily values jako historyczne wartości zagregowane. To rozróżnienie jest ważne: Genesis musi zachować informację, czy pracuje na pomiarze ciągłym, czy na agregacie [1][2].

4. USGS udostępnia także metadata monitoringu: identyfikator stacji, agencję, typ lokalizacji i dane geograficzne [1].

5. Water Quality Portal łączy dane publiczne USGS, EPA oraz ponad 400 agencji, ale jego interfejs i profile danych mają różne ograniczenia czasowe; nie powinien być pierwszym wejściem bez wyboru jednego konkretnego profilu i stacji [3].

## Why this candidate beats an instrument first

| Kryterium | USGS read-only observation | Micro-Manager imaging |
|---|---:|---:|
| Hardware cost | $0 for initial proof (`FACT/ESTIMATE`) | Unknown; existing microscope required or purchase needed |
| Public historical data | Yes, continuous/daily collections (`FACT`) | Only if a suitable public image archive is selected (`VERIFY_REQUIRED`) |
| Metadata | Site and time-series metadata (`FACT`) | Device/configuration metadata depends on adapter and instrument (`VERIFY_REQUIRED`) |
| Raw-data replay | Possible by pinning exact response/query/time window (`INFERENCE`) | Possible, but requires raw image + metadata + calibration preservation (`INFERENCE`) |
| Existing Genesis model fit | Possible but not yet proven (`VERIFY_REQUIRED`) | No existing image-observable model is admitted (`NOT_CONNECTED`) |
| Safety | Read-only public API (`FACT`) | Hardware-control and acquisition safety required (`VERIFY_REQUIRED`) |
| First proof time | 2–6 weeks for contract + fixture (`ESTIMATE`) | 8–16 weeks for robust hardware-independent proof (`ESTIMATE`) |

The table is a decision estimate, not a commitment or delivery promise. The main risk is not fetching USGS data; it is proving that one selected measured quantity has the same meaning, units, sampling semantics and boundary conditions as an existing Genesis model output.

## Proposed first demonstrator

**Question:** Can the bounded Genesis hydraulic model be compared honestly with a selected real streamflow observation series?

**Hypothesis:** For a preregistered station, time window and parameter mapping, the model output and observed flow can be compared with an explicit residual and validity boundary. This is a candidate hypothesis, not a scientific discovery.

**Required chain:**

```text
selected USGS station + exact query
→ raw response + query metadata
→ normalized observation record
→ existing Genesis hydraulic model
→ predicted observable
→ observed vs predicted comparison
→ Evidence Pack
→ deterministic replay of the analysis
→ bounded next experiment
```

The first version must be **analysis replay**, not live control. Replay should reprocess the pinned raw response and comparison code; it should not silently refetch mutable live data and call the result identical.

## Required observation contract before implementation

A future adapter must define, at minimum:

| Field | Requirement |
|---|---|
| `sourceUri` | Exact official endpoint and query parameters. |
| `retrievedAt` | UTC retrieval timestamp. |
| `observationWindow` | Start/end timestamps and timezone semantics. |
| `siteId` | Stable station/location identifier. |
| `parameterCode` | Source parameter identifier, not only a display label. |
| `value` / `unit` | Numeric value plus source unit and normalized unit. |
| `qualityFlags` | Missing, estimated, provisional or quality-code fields if supplied. |
| `rawPayloadFingerprint` | Fingerprint of the exact downloaded payload. |
| `metadataFingerprint` | Fingerprint of station/time-series metadata. |
| `transformVersion` | Version of normalization/aggregation code. |
| `observationStatus` | `REAL_PUBLIC_DATA`, never `SIMULATED_DATA`. |
| `limitations` | Coverage, aggregation, calibration and comparability limits. |

No record should enter Evidence as a measurement if the source semantics, unit, timestamp, quality status or raw payload cannot be preserved.

## Validation plan before BUILD NOW

1. Select one USGS station with a stable time series and documented units.
2. Download one bounded historical window and preserve the exact raw response.
3. Verify station metadata, parameter code, unit, timestamps and quality flags.
4. Demonstrate that the existing Genesis model has a compatible observable. If not, classify the bridge as `BLOCKED` rather than adding an unrelated solver.
5. Define a deterministic normalization and comparison function with explicit tolerance rationale.
6. Create a contract-only fixture containing raw payload fingerprint, normalized observation and provenance; do not claim scientific validity from the fixture alone.
7. Re-run the analysis from the pinned payload and require `MATCH`.
8. Tamper with payload, station, unit, time window and transform version; require `DRIFT` or `BLOCKED`.
9. Only after these checks consider a live read-only fetch path.

## Cost, time and risk

| Item | Estimate / status |
|---|---|
| Initial research and station selection | 8–16 h (`ESTIMATE`) |
| Observation contract and fixture | 16–32 h (`ESTIMATE`) |
| Comparison + Evidence/Replay thin adapter | 24–60 h (`ESTIMATE`, only after compatibility proof) |
| Chromium proof | 8–16 h (`ESTIMATE`) |
| Total first validated proof | 56–124 h (`ESTIMATE`) |
| API/hardware cost | No hardware for initial proof; endpoint limits and operational terms require verification (`VERIFY_REQUIRED`) |
| Main scientific risk | Existing pump/pipe model may not represent the chosen open-channel observation (`VERIFY_REQUIRED`) |
| Main product risk | A public dataset can demonstrate provenance/replay but may be less visually compelling than imaging (`INFERENCE`) |

## CTO recommendation

**BUILD LATER / VALIDATE NOW.** Do not implement a USGS adapter, Micro-Manager bridge or new observation subsystem in the current sprint. First produce the contract-only station fixture and compatibility decision. If the existing water model cannot produce an observable that is semantically comparable to one USGS series, reject this exact mapping and evaluate a different existing model rather than fabricating a bridge.

The research answer from the attached materials remains useful but is not sufficient to select Micro-Manager as the winner. Micro-Manager + OME-NGFF should stay `VERIFY_REQUIRED`; USGS read-only observations are currently the lower-cost, lower-risk candidate for proving Genesis’s first **model-to-real-world validation loop**.

## Sources

[1] [USGS Water Data APIs](https://api.waterdata.usgs.gov/) — official overview of continuous, daily, monitoring-location, time-series metadata and related services.

[2] [Getting started with USGS Water Data OGC APIs](https://api.waterdata.usgs.gov/docs/ogcapi/) — official OGC API structure, machine-readable formats, collections, schemas, queryables and metadata.

[3] [Water Quality Portal](https://www.waterqualitydata.us/) — official public water-quality data portal and profile/data-source limitations.

## Final decision

> **One thing Genesis should investigate next: a contract-only, read-only USGS streamflow observation fixture mapped against the existing water model, with no adapter implementation until semantic compatibility, provenance and replay are proven.**
