# Genesis — Forensic Strategic Review of Perplexity Report

**Status:** `REFERENCE REVIEW / NO IMPLEMENTATION`

**Review date:** 2026-08-27

**Scope:** Ocena twierdzeń z dostarczonego eksportu Perplexity pod kątem ich wpływu na roadmapę Genesis. Raport Perplexity nie jest traktowany jako nakaz budowy funkcji ani jako źródło prawdy dla aktualnego kodu.

## Executive decision

Raport poprawnie rozpoznaje, że największa wartość Genesis leży w połączeniu `Science Chat → model/executor → provenance → Evidence → Replay`, a nie w liczbie laboratoriów. Jest to jednak **hipoteza produktowa**, nie niezależnie zmierzona przewaga rynkowa.

Najważniejsza korekta CTO dotyczy proponowanego zwycięzcy `Lorenz + NOAA ISD`. NOAA rzeczywiście udostępnia bogate, godzinowe obserwacje stacji, metadane i informacje jakościowe [1] [2]. Istnieje jednak istotna luka semantyczna: obecny Genesis Lorenz przewiduje abstrakcyjną trajektorię stanu `x,y,z`, a nie lokalną prędkość wiatru, temperaturę ani ciśnienie. Repozytorium samo opisuje Lorenz jako model niebędący prognozą pogody i nieposiadający danych meteorologicznych. Dlatego ta para nie jest obecnie `BUILD NOW`; jej właściwy status to `PARTIALLY COMPATIBLE / VERIFY_REQUIRED`.

Dodatkowo NOAA oficjalnie wskazuje, że nowszy GHCNh zastępuje ISD [3] [4]. Ewentualny przyszły bridge powinien być projektowany jako wersjonowany adapter do konkretnego, przypiętego artefaktu GHCNh/ISD, a nie jako zależność od „żywego NOAA API”. To nie odrzuca kierunku, ale zwiększa wymagania provenance i migracji.

**Decyzja:** nie budować teraz NOAA bridge’u, Micro-Managera, Open-Meteo adaptera ani nowego solvera. Najpierw wykonać contract-only admission fixture dla jednej stacji i jednego okresu, z jawnym mapowaniem obserwacji, bez twierdzenia, że zmienna stacji jest stanem Lorenza. Jeśli fixture nie pozwoli zdefiniować falsyfikowalnego kryterium bez dodatkowego modelu kalibracyjnego, oznaczyć parę `REJECT` dla bezpośredniej walidacji fizycznej i `BUILD LATER` wyłącznie jako benchmark dynamical-behavior.

## Classification of the report’s main claims

| Claim from the report | Classification after review | Evidence / reason | Roadmap impact |
|---|---|---|---|
| Genesis has a connected computational E2E spine | `FACT / EXISTS in LIVE` | Current repository roadmap, Fabric tests, PySCF CI and Chromium smoke confirm the bounded workflow. | Preserve as regression gate. |
| Genesis’s defensible value is orchestration + provenance + Evidence + Replay | `HYPOTHESIS, PLAUSIBLE` | Architecture is real; market defensibility and customer willingness are not measured by the supplied report. | Prioritize proof quality and reference history over feature count. |
| NOAA ISD contains station observations, metadata and quality information | `FACT` | NOAA describes ISD as a common ASCII/data model containing hourly/synoptic observations and multiple surface variables; station histories provide location/equipment metadata [1] [2]. | A pinned offline fixture is technically plausible. |
| NOAA ISD is the current long-term target | `OUTDATED / CORRECT TO GHCNh` | NOAA states GHCNh replaces ISD and adds/aligns sources and metadata [3] [4]. | Any future adapter must pin dataset generation/version and support migration. |
| Lorenz state maps directly to station wind speed | `REJECT` | The report itself concedes `x,y,z ≠ station wind speed`; current Genesis Lorenz outputs `chaosThreshold`, `finalSeparation` and bounded trajectories, with an explicit no-weather-forecast limitation in `experimentFabric.test.ts`. | No direct model-vs-observation claim is allowed. |
| Lorenz + NOAA can validate qualitative dynamical behavior | `HYPOTHESIS / PARTIAL` | Could be testable only after a declared transform, calibration, sampling window, and pre-registered metrics. It is not validation of the physical Lorenz state. | Contract-only fixture first; no live bridge yet. |
| Kepler + JPL Horizons is a strong deterministic candidate | `FACT about interface; PARTIAL epistemically` | JPL Horizons provides configurable ephemerides, vectors and orbital elements through an API [5] [6]. This is a strong output match for an orbital model, but it is an ephemeris product derived from measurements/models, not a raw telescope observation. | Good future numerical reference benchmark; label `MODEL/REFERENCE`, not direct sensor validation. |
| Micro-Manager is the best first real-world bridge | `REJECT for first milestone` | The report correctly identifies hardware, adapter, configured device, acquisition protocol and metadata mapping as prerequisites. No supported Genesis instrument, headless behavior or chain-of-custody proof is established. | Keep `PARKED`; revisit after observation contract exists. |
| €15k–€40k pilot and €40k–€150k annual pricing | `ESTIMATE / UNSUPPORTED` | No public Genesis price or customer evidence is provided. | Do not use in valuation, investor claims or roadmap priority. |
| Competitors cannot easily copy the complete system | `HYPOTHESIS` | UI and basic workflow are copyable; accumulated verified run history, domain contracts and provenance discipline could become a moat, but the report does not prove this. | Build durable evidence and customer-specific workflows before claiming defensibility. |
| Materials Project is real-world ground truth | `REJECT` | The report correctly identifies it as primarily computational output. It cannot independently validate a Genesis simulation against reality. | Keep computational reference datasets distinct from observations. |
| Open-Meteo/reanalysis may be used as sensor truth | `REJECT for direct observation` | Forecast and reanalysis products must not be presented as local raw measurements. | Keep outside direct-observation admission unless explicitly classified as model/reanalysis input. |

## LIVE capability cross-check

The current LIVE repository supports the report’s broad computational description, but not every listed item at the same epistemic level.

| Area | Current Genesis status | Review conclusion |
|---|---|---|
| Earthquake | `DONE reference vertical slice` | Keep as product proof; structural damage remains `NOT_MODELED`. |
| Epidemic → City3D | `CONNECTED with bounded synthetic-world claim` | Same-world handoff is proven; no real-world forecast claim. |
| Lorenz | `CONNECTED bounded model` | Model is real and deterministic; it explicitly does not forecast station weather. |
| Protocol/A-B, Evidence, Replay | `CONNECTED` | Current persisted snapshot/replay disclosure is honest; fresh backend replay still requires explicit rerun. |
| PySCF H₂ | `CONNECTED_LOCALLY / CI_VERIFY_REQUIRED` | Real PySCF CI job and bounded H₂ benchmark exist; not a general chemistry platform. |
| Campaign interoperability | `BLOCKED/PARKED` | Do not create a second Evidence system or lossless mapping by assumption. |
| USGS pump-pipe | `PARTIALLY COMPATIBLE / BUILD LATER` | Current model takes flow as design input and does not predict river discharge. |
| Scientific Knowledge Pack | `REFERENCE_ONLY / VERIFY_REQUIRED` | No mass import or automatic admission is authorized. |

## Candidate comparison for the next observation bridge

| Candidate | Semantic match | Data character | New solver? | Main risk | CTO status |
|---|---:|---|---:|---|---|
| Lorenz + NOAA ISD/GHCNh | Partial | Station observations compiled and quality-controlled | No | No direct state-variable mapping; transform may become a hidden calibration model | `BUILD LATER`, fixture first |
| Kepler + JPL Horizons | Strong for trajectory reference | Ephemeris/reference product, not raw sensor measurement | No | Model/reference circularity and exact frame/time settings | `BUILD LATER`, best numerical benchmark candidate |
| Three-body + JPL Horizons | Partial to strong | Ephemeris/reference product | No | More body/frame/initial-condition complexity | `PARK until Kepler case proves contract` |
| Heat model + NOAA station data | Partial | Station observations | No | Boundary conditions and geometry missing | `PARK` |
| Epidemic + official case/death data | Partial | Administrative/reporting data | No | Reporting process, delays and definition changes | `PARK` |
| Micro-Manager + microscope | Unknown | Live instrument acquisition | No new scientific solver, but hardware required | Device support, safety, metadata and custody | `PARKED` |

## Required admission fixture before any NOAA work

The next safe step is not a live adapter. It is a contract-only fixture for one pinned historical file from the current NOAA product family, with an explicit migration note if the selected artifact is legacy ISD. The fixture must preserve the exact raw payload, source URL, dataset/product version, station identifier, station metadata, timestamp semantics, selected variable, source units, quality flags, missing-value policy, normalization transform and SHA-256.

The fixture must test whether the proposed observable can be compared honestly with an existing Lorenz output. It must not rename a transformed wind or temperature series as `lorenzX`, `lorenzY` or `lorenzZ`. The only acceptable wording for a partial candidate is **derived observation trajectory** or equivalent, with the transform and calibration declared as model assumptions.

The candidate is not admissible as direct physical validation unless all of the following are present:

1. A falsifiable prediction generated by the existing model before observation comparison.
2. A scientifically justified mapping from model output to the observed quantity, without fitting the target result post hoc.
3. A preregistered metric and bidirectional tolerance or a clearly bounded qualitative criterion.
4. A pinned offline raw artifact; replay must never refetch NOAA.
5. Negative tests for station, timestamp, unit, quality filter, source file, transform version and model parameters.
6. A UI limitation that says exactly what is and is not validated.

If item 2 cannot be satisfied without adding a new atmospheric observation model, the candidate must be marked `REJECT` for direct model–reality validation. It may remain `BUILD LATER` as a bounded demonstration of observation provenance and qualitative dynamics, but not as evidence that Lorenz predicts local weather.

## Roadmap decision

The report changes the roadmap in one narrow way: it promotes **observation contract design and fixture admission** above instrument integrations and broad Knowledge Layer import. It does not authorize a NOAA adapter yet.

The order is:

`Scientific Knowledge reference registration`

→ `observation contract fixture`

→ `one candidate forensic review`

→ `offline deterministic replay`

→ `only then thin adapter, if semantics pass`

The current best numerical benchmark candidate is **Kepler + JPL Horizons**, while the current best physical-observation candidate is **Lorenz + NOAA GHCNh/legacy ISD with explicit partial semantics**. Neither is `BUILD NOW` from the supplied report alone.

## What remains unverified

The supplied report does not prove a customer, revenue, valuation, investor willingness, or competitive moat. Its integration-hour estimates are planning estimates only. It also does not prove that a particular NOAA station and date range yield a valid Lorenz comparison, nor does it provide a pinned raw artifact with SHA-256 and a fully justified transform. Those items require a separate admission fixture and must not be inferred from the report.

## References

[1]: https://www.ncei.noaa.gov/products/land-based-station/integrated-surface-database "NOAA NCEI — Global Hourly / Integrated Surface Database"

[2]: https://www.ncei.noaa.gov/products/land-based-station/station-histories "NOAA NCEI — Station Histories"

[3]: https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly "NOAA NCEI — Global Historical Climatology Network hourly"

[4]: https://www.ncei.noaa.gov/news/next-generation-climate-dataset-built-seamless-integration "NOAA NCEI — Next Generation Climate Dataset Built for Seamless Integration"

[5]: https://ssd-api.jpl.nasa.gov/doc/horizons.html "NASA JPL — Horizons API"

[6]: https://ssd.jpl.nasa.gov/horizons/manual.html "NASA JPL Solar System Dynamics — Horizons Manual"
