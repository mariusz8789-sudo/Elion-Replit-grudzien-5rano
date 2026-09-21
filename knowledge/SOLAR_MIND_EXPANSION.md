# SOLAR_MIND_EXPANSION.md
STATUS NADRZĘDNY: RESEARCH ONLY / NOT RUN. Rozwinięcie master reportu (wrzesień 2026).
Uwaga: listing kodu solarVisualizer.ts (§2 pierwotnej emisji) jest KODEM, nie danymi badawczymi —
nie wchodzi do knowledge/; dostępny w pierwotnej emisji EXPANSION na żądanie.

### Status H051–H056 (na wzór tabeli QE1–QE7 w `knowledge/quantum.md:228-238`)

Pełne wpisy (falsyfikator + adnotacja RESEARCH ONLY/NOT RUN) są w §3 niżej;
ta tabela jest tylko skróconym indeksem tej samej informacji, w tym samym
formacie co QE1–QE7, dla szybkiego porównania statusów.

| ID | Hipoteza | Falsyfikator | Status wg pakietu |
|---|---|---|---|
| H051 | May 2024 G5 waliduje drag-based arrival + Bz-south coupling | arrival >±10h lub geoeffective przy northward Bz | ESTABLISHED (do testu) |
| H052 | Coronal heating ma dwa reżimy: impulsive (AR) i steady (QS/CH) | jednolity mechanizm wyjaśnia wszystkie struktury | HYPOTHESIS (nowa 2026) |
| H053 | Cycle 25 amplitude (160.9) przekroczyła polar precursor z powodu nonlinear amplification | linear precursor wystarczy dla cycle 26 | HYPOTHESIS |
| H054 | PSP Dec 2024 perihelion daje ostateczny test switchback origin | właściwości niezgodne z interchange | HYPOTHESIS |
| H055 | Solar Orbiter polar view poprawia wind forecasts | brak poprawy | HYPOTHESIS |
| H056 | Carrington recurrence ~1%/rok niedoszacowana (May 2024 → ~2%/rok dla G5) | rate <1%/rok | INFERENCE |

**Wszystkie sześć: RUN STATUS = NOT RUN, RESEARCH ONLY.** Żadna nie wchodzi
do pętli jako evidence dopóki nie przejdzie ingestii danych (DSCOVR/ACE, PSP,
SolO — wszystkie `[ACCESS-VERIFY]`) i prerejestracji, dokładnie jak QE1–QE3
przed swoim własnym cyklem przez `StrategyRun` — patrz
`docs/GENESIS_SCIENTIFIC_DISCOVERY_ENGINE_MASTER_PLAN.md` i
`knowledge/quantum.md`'s „Co z tego Genesis NAPRAWDĘ uruchomił" jako wzorzec
tego, co ten status ma znaczyć, gdy się zmieni.

## 1. Aktualizacja: obserwacje 2024–2026
Solar Cycle 25: przekroczył predykcje; wygładzone maksimum 160.9 SSN w październiku 2024; maksimum
miesięczne 216 (niewygładzone) sierpień 2024; średnia predykcja ~127 (zakres 50–233). H007 zaktualizowana:
PARTIALLY SUPPORTED (kierunek poprawny, amplituda niedoszacowana); falsyfikator: cycle 26 vs polar field 2025–26.
May 2024 G5 storm: pierwszy G5 od Halloween 2003; najsilniejszy od 20+ lat; 6. w historii Dst (66 lat), 9. w historii
Kakioka (110 lat); aurorae do Meksyku; bez katastrofalnych zniszczeń; naturalny eksperyment dla modeli coupling.
Nowa H051 (patrz niżej). PSP: 24.12.2024 11:53 UTC closest approach 6.1 mln km (3.8 mln mil), 22. perihelion,
rekord pobity; switchbacks i heating measurements kontynuowane. Solar Orbiter: 16–17.03.2025 pierwszy widok
bieguna południowego z 15° poniżej równika; do 2029 >30° heliographic latitude; EUI "steady" mode of coronal
heating (konflikt z Klimchuk all-impulsive)→nowa H052. Differential rotation: równik 25.38 dni (Carrington rate
2.865 μrad/s), do ~35 dni na biegunach; ω(θ)=A+B sin²θ+C sin⁴θ, A≈14.71, B≈−2.39, C≈−1.78 °/dzień.
Carrington recurrence: Riley 2012 ~12%/dekadę; Love 2019 3.33% w pierwszej dekadzie po 1859 (3.6× wyżej).

## 2. (kod solarVisualizer.ts — POMINIĘTY jako dane; patrz nota nagłówkowa)

## 3. Rozszerzona biblioteka H051–H075 (ID|hipoteza|falsyfikator|tag|RUN STATUS|ADNOTACJA H051–H056)
H051 May 2024 G5 waliduje drag-based arrival + Bz-south coupling|arrival >±10h lub geoeffective przy northward
 Bz|ESTABLISHED(do testu)|NOT RUN|ADNOTACJA: RESEARCH ONLY/NOT RUN; hipoteza wyłącznie; dane DSCOVR/ACE
 [ACCESS-VERIFY]; NIE może wejść do pętli jako evidence dopóki brak ingestii i prerejestracji.
H052 coronal heating ma dwa reżimy: impulsive (AR) i steady (QS/CH)|jednolity mechanizm wyjaśnia wszystkie
 struktury|HYPOTHESIS(nowa 2026)|NOT RUN|ADNOTACJA: RESEARCH ONLY/NOT RUN; konflikt z Klimchuk; EUI [VERIFY];
 nie wchodzi do pętli jako fakt.
H053 cycle 25 amplitude (160.9) przekroczyła polar precursor z powodu nonlinear amplification|linear precursor
 wystarczy dla cycle 26|HYPOTHESIS|NOT RUN|ADNOTACJA: RESEARCH ONLY/NOT RUN; predykcja ex-post częściowo;
 wymaga prerejestracji przed cycle-26 danymi, inaczej HARKing.
H054 PSP Dec 2024 perihelion daje ostateczny test switchback origin|właściwości niezgodne z interchange|
 HYPOTHESIS|NOT RUN|ADNOTACJA: RESEARCH ONLY/NOT RUN; PSP [ACCESS-VERIFY]; nie wchodzi do pętli bez ingestii.
H055 Solar Orbiter polar view ujawnia polar CH structure niedostępną z ecliptic; polar CH mapping poprawia
 wind forecasts|brak poprawy|HYPOTHESIS|NOT RUN|ADNOTACJA: RESEARCH ONLY/NOT RUN; SolO [ACCESS-VERIFY].
H056 Carrington recurrence ~1%/rok niedoszacowana; May 2024 = ~50-letni event implikuje ~2%/rok dla G5|
 rate <1%/rok|INFERENCE|NOT RUN|ADNOTACJA: RESEARCH ONLY/NOT RUN; statystyka ogona; paleo [VERIFY];
 nigdy nie prezentować jako ustaloną częstość.
H057 cycle 26 timing (peak 2034) predykowalny z meridional flow w declining phase|brak korelacji|HYPOTHESIS|NOT RUN
H058 hemispheric asymmetry cycle 25 ze stochastic fluctuations|asymetria wymaga deterministic coupling|HYPOTHESIS|NOT RUN
H059 polar reversal opóźniony ~6 mies. vs cycle 24 z wolniejszego meridional flow|flow speed identyczny|HYPOTHESIS|NOT RUN
H060 grand minimum <5% w cycle 27 (silne polar field)|polar field collapse|INFERENCE|NOT RUN
H061 steady mode dominuje w holes, impulsive w AR|brak korelacji region↔mode|HYPOTHESIS|NOT RUN
H062 switchback amplitude rośnie z malejącą odległością zgodnie z interchange|stała/amplituda spada|HYPOTHESIS|NOT RUN
H063 fast wind wyłącznie z large holes; small holes dają intermediate|fast wind z small holes|MODEL|NOT RUN
H064 turbulent cascade wystarcza dla slow wind, nie dla fast|fast wind bez waves|HYPOTHESIS|NOT RUN
H065 May 2024 = sekwencja 4 CMEs (AR 3663–64); multi-CME interaction wzmocniła geoeffectiveness|single CME
 wystarcza|INFERENCE|NOT RUN
H066 confined flares mają wyższy predictive skill niż static parameters|brak poprawy skill|HYPOTHESIS|NOT RUN
H067 torus threshold n>1.5 universal dla wszystkich typów CME|threshold zależy od typu|HYPOTHESIS|NOT RUN
H068 ribbon separation mapuje E z dokładnością ±20%|mismatch >20%|HYPOTHESIS|NOT RUN
H069 convection conundrum z brakującej magnetic braking|hydro symulacje wystarczą|HYPOTHESIS|NOT RUN
H070 meridional circulation multi-cellular z return flow ~0.85 R☉|single-cell robust|UNKNOWN|NOT RUN
H071 tachocline thickness stała w cyklu|thickness varies >20%|MEASUREMENT|NOT RUN
H072 near-surface shear moduluje emergence z lag ~6 mies.|brak lag/korelacji<0.3|HYPOTHESIS|NOT RUN
H073 flare statistics power-law α≈1.8 (SOC)|α poza 1.6–2.0 lub exponential cutoff|ESTABLISHED(re-test)|NOT RUN
H074 surrogate ML dla MHD: fidelity ±10% arrival, >±30% peak Bz|Bz within ±10%|HYPOTHESIS|NOT RUN
H075 predictability horizon ~1 cycle; 2-cycle-ahead skill≈0|skillful 2-cycle|HYPOTHESIS|NOT RUN

## 4. Solar Twin + Space Weather Pipeline (architektura)
SolarTwinAdapter{name,version,licenseRef,run(config,seed)}; SolarTwinConfig{boundaryData{source HMI_VECTOR|
HMI_LOS,seriesId,timeRange TAI,region,disambiguationVersion},solverParams,groundingLevel}; SolarTwinOutput
{runId,configFingerprint,outputFingerprint,solverName,solverVersion,nondeterminismBudget,status,
magneticField,plasmaBeta,currentDensity,decayIndex,reconnectionFlux,freeEnergy,helicity,timestamp,runtime,
computeResources}; computeTwinReplayStatus(stored,recomputed,budgets)→MATCH|WITHIN_TOLERANCE|DRIFT.
Space Weather pipeline: SDO/HMI+AIA→[Feature Extraction HEK+AR+filament]→[Eruption Forecasting decay index+
confined-flare count+shear]→[CME Propagation drag-based+ensemble MHD opcjonalnie]→[Arrival ±10h+peak Bz ±30%]→
[Geomagnetic Response Kp/Dst+Akasofu epsilon]→[Validation out-of-sample May 2024/Halloween 2003/historical]→
[Belief Revision+contradiction map]. Każdy etap z tagiem: OBSERVATION/MODEL/SIMULATION/FORECAST/UNKNOWN.
Validation na realnych eventach, nie synthetic; contradiction detection klasyfikuje (measurement/model/true),
nigdy nie uśrednia; replay z fingerprint+seed+config.

## 5. Zaktualizowany Self-Audit
VERIFIED: NIC. SOURCE-SUPPORTED(2024–26): May 2024 G5 (najsilniejszy od 2003; 6. Dst), cycle 25 max 160.9
(Oct 2024), PSP 6.1 mln km (24.12.2024), SolO south pole (Mar 2025)+EUI steady heating, differential rotation
25.38 d/ω(θ), Carrington ~12%/dekadę (Riley)/3.33% (Love). INFERENCE: H051–H075, pipeline, visualizer design.
MODEL ASSUMPTION: progi (n>1.5, ±10h, ±20% ribbon-E, ±30% Bz). UNKNOWN: mechanizm grzania (impulsive vs steady
vs both), switchback origin, convection conundrum, meridional cells, Carrington rate (May 2024 daje punkt,
wymaga więcej danych). NOT TESTED: wszystkie H051–H075, visualizer (NOT RUN), pipeline (architektura).
CLAUDE SHOULD IMPLEMENT: visualizer standalone (wzorzec Earth Visualizer v2), HEK ingestion adapter, pipeline
stages przez istniejące komponenty. NEVER AS FACT: H052 (dwa reżimy) jako ustalone; H056 (Carrington rate) jako
dokładne; SIMULATION jako OBSERVATION.
Readiness: KNOWLEDGE 78 · DATA 60 · HYPOTHESIS 78 · EXPERIMENT 55 · FALSIFICATION 65 · REPLAY 50 · AUTONOMOUS 25.

## 6. Co dalej
Natychmiast (6 tyg.): visualizer standalone; HEK ingestion; H051–H056 jako pierwsze do testowania (mają realne
eventy). 3 mies.: JSOC/HMI adapter; E1–E3; pipeline stages 1–3. 6 mies.: E3 out-of-sample; Twin P0–P2;
Space weather validation na May 2024+Halloween 2003+5 G4/G5. 12 mies.: pełny pipeline end-to-end z belief
revision+contradiction map; public "Solar Falsification Atlas"; decision point cycle-26 polar precursor.
