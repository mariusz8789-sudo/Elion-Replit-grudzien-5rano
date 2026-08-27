STATUS: GŁÓWNY ANALITYK NAUKOWY GENESIS – ONLINE
CEL: SYNTEZA GENESIS SCIENTIFIC KNOWLEDGE LAYER
RYGOR EPISTEMOLOGICZNY: MAKSYMALNY (BIPM/CODATA/NIST STANDARD)
Poniżej znajduje się architektura i zawartość GENESIS SCIENTIFIC KNOWLEDGE PACK v1. Została ona zaprojektowana jako rygorystyczna grafowa baza wiedzy, oddzielająca twarde pomiary od modeli matematycznych.
CZĘŚĆ I: EPISTEMOLOGIA I STRUKTURA DANYCH (Scientific Knowledge Graph)
Zgodnie z wymaganiami, Genesis nie może traktować wyjścia modelu jako faktu. Wprowadzamy następujący rygor tagowania i strukturyzacji.
1. Klasyfikacja poziomu dowodu (Source Ranking)
 * [LEVEL 1] Wzorzec / Autorytatywny pomiar (np. BIPM, NIST, CODATA).
 * [LEVEL 2] Zrecenzowana publikacja naukowa (Peer-reviewed paper).
 * [LEVEL 3] Oficjalna dokumentacja techniczna solvera.
 * [LEVEL 4] Zwalidowane repozytorium open-source.
 * [LEVEL 5] Preprint (arXiv, bioRxiv) – tagowane jako [VERIFY_REQUIRED].
2. Klasyfikacja logiczna informacji (Epistemic Tags)
 * [FACT] – Niezmienna definicja lub stała zdefiniowana absolutnie (np. prędkość światła c).
 * [MEASUREMENT] – Obserwacja z dołączoną niepewnością (np. stała G).
 * [MODEL] – Matematyczna aproksymacja rzeczywistości.
 * [PREDICTION] – Wyjście z solvera (NIGDY nie traktowane jako ground truth).
 * [ASSUMPTION] – Założenie redukcyjne (np. ciecz nieściśliwa).
3. Logika Automatycznej Weryfikacji (Genesis Verification Engine)
Genesis musi automatycznie wykrywać:
 * Dimension Mismatch: Analiza wymiarowa (Buckingham \pi theorem). Wymiary Lewej Strony (LHS) muszą zgadzać się z Prawą Stroną (RHS).
 * Circular Validation: Błąd polegający na użyciu tego samego datasetu do kalibracji parametrów modelu i do jego walidacji.
 * Validity Range Breach: Przekroczenie zdefiniowanych ram (np. użycie Prawa Hooke'a powyżej granicy plastyczności).
CZĘŚĆ II: NAJWAŻNIEJSZY OUTPUT (Odpowiedzi na 10 kluczowych pytań)
Oto zsyntetyzowany, rygorystyczny zestaw 10 list, które stanowią fundament bazy wiedzy Genesis.
1. JAKIE 20 ŹRÓDEŁ NALEŻY POBRAĆ JAKO PIERWSZE? (Top 20 Sources)
Źródła te mają licencje pozwalające na ekstrakcję danych.
 * NIST CODATA (Physics Constants): Baza fundamentalnych stałych [LEVEL 1] [Public Domain].
 * BIPM SI Brochure: Definicje jednostek miar i analizy wymiarowej [LEVEL 1] [Open Access].
 * NIST Atomic Spectra Database (ASD): Przejścia atomowe, poziomy energii [LEVEL 1] [Public Domain].
 * JCGM 100:2008 (GUM): Standard szacowania niepewności pomiaru [LEVEL 1] [Open Access].
 * NASA/JPL HORIZONS: Efemerydy, mechanika nieba [LEVEL 1] [Public Domain].
 * USGS Earthquake Catalog: Pomiary sejsmiczne, Ground Truth dla trzęsień [LEVEL 1] [Public Domain].
 * ECMWF ERA5: Reanaliza klimatyczna (Ground Truth dla modeli meteo) [LEVEL 1] [Copernicus License].
 * Materials Project (LBNL): Struktury krystaliczne, pasma, DFT [LEVEL 2] [CC BY 4.0].
 * Protein Data Bank (PDB): Struktury 3D białek i kwasów nukleinowych [LEVEL 1] [CC0].
 * MIT OpenCourseWare (Physics/Math): Fundamenty teoretyczne [LEVEL 3] [CC BY-NC-SA].
 * OpenStax (University Physics): Baza równań i praw [LEVEL 3] [CC BY 4.0].
 * CERN Open Data Portal: Zderzenia cząstek (Ground truth) [LEVEL 1] [CC0].
 * PubChem (NIH): Baza cząsteczek chemicznych [LEVEL 1] [Public Domain].
 * Reactome: Ścieżki sygnałowe i procesy biologiczne [LEVEL 2] [CC0].
 * NOMAD (Novel Materials Discovery): Surowe dane z obliczeń kwantowych materiałów [LEVEL 2] [CC BY].
 * OpenQuake Hazard/Risk Data: Typologie budynków, krzywe kruchości [LEVEL 3] [AGPL / Open Data].
 * NOAA NCEI: Dane hydrologiczne i oceanograficzne [LEVEL 1] [Public Domain].
 * AFLOW: Baza właściwości termodynamicznych stopów i materiałów [LEVEL 2] [CC BY].
 * Ensembl (EMBL-EBI): Genomy referencyjne [LEVEL 1] [Open Access].
 * arXiv (cs.CE, physics.comp-ph): Algorytmy solverów i numeryka (wiedza z preprintów, wymaga ostrożności) [LEVEL 5] [Różne licencje otwarte].
2. JAKIE 20 RÓWNAŃ GENESIS POWINIEN DOSTAĆ JAKO PIERWSZE?
Każde równanie to rekord typu EquationRecord.
 * Równania Naviera-Stokesa (Fluids): \rho \left(\frac{\partial \mathbf{u}}{\partial t} + \mathbf{u} \cdot \nabla \mathbf{u}\right) = -\nabla p + \mu \nabla^2 \mathbf{u} + \mathbf{f} (Założenie: Płyn nieściśliwy, Newtonowski).
 * Równanie Schrödingera (Zależne od czasu): i\hbar \frac{\partial}{\partial t} \vert{}\Psi(t)\rangle = \hat{H} \vert{}\Psi(t)\rangle (Zmienne: Funkcja falowa \Psi, Hamiltonian \hat{H}).
 * Równania Pola Einsteina (Grawitacja): G_{\mu\nu} + \Lambda g_{\mu\nu} = \frac{8\pi G}{c^4} T_{\mu\nu} (Tensor Einsteina, Tensor energii-pędu).
 * Równania Maxwella (EM): \nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}, \nabla \cdot \mathbf{B} = 0, \nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}, \nabla \times \mathbf{B} = \mu_0\mathbf{J} + \mu_0\varepsilon_0\frac{\partial \mathbf{E}}{\partial t}.
 * Równanie Arrheniusa (Kinetics): k = A e^{-E_a/(RT)} (Zależność stałej szybkości reakcji od temperatury).
 * Shallow Water Equations 2D (Flood): \frac{\partial h}{\partial t} + \nabla \cdot (h\mathbf{u}) = 0 (Aproksymacja: Ciśnienie hydrostatyczne, mała głębokość).
 * Prawo Hooke'a / Liniowa Sprężystość (Tenzorowa): \sigma_{ij} = C_{ijkl} \epsilon_{kl} (Zakres: Liniowa sprężystość).
 * Ground Motion Prediction Equation (GMPE): \ln(Y) = f(M, R, V_{s30}, \dots) (Empiryczny model atenuacji sejsmicznej).
 * Równanie Przewodnictwa Cieplnego (Fourier): \frac{\partial T}{\partial t} = \alpha \nabla^2 T.
 * Zasada Zachowania Energii (I Zasada Termodynamiki): dU = \delta Q - \delta W.
 * Prawo Hubble'a-Lemaître'a: v = H_0 D (Kosmologia).
 * Równanie Poissona (Grawitacja/Elektrostatyka): \nabla^2 \phi = f.
 * Równanie Boltzmanna (StatMech): S = k_B \ln W.
 * Równanie Diraca (Relativistic Quantum): (i\gamma^\mu \partial_\mu - m) \psi = 0.
 * Modele Epidemiologiczne SEIR (Bio): \frac{dS}{dt} = -\frac{\beta S I}{N}.
 * Równanie stanu gazu doskonałego: pV = nRT.
 * Równanie Lorentza (Siła EM): \mathbf{F} = q(\mathbf{E} + \mathbf{v} \times \mathbf{B}).
 * Prawo Darcy'ego (Hydrogeologia): Q = -kA \frac{dh}{dl}.
 * Równanie Nernsta (Elektrochemia): E = E^0 - \frac{RT}{zF} \ln Q_r.
 * Twierdzenie Bayesa (Statystyka/UQ): P(A\vert{}B) = \frac{P(B\vert{}A)P(A)}{P(B)}.
3. JAKIE 20 STAŁYCH? (CODATA 2018/2022) [LEVEL 1]
 * Prędkość światła w próżni (c): 299 792 458 m/s [FACT - Definicja metra].
 * Stała Plancka (h): 6.626 070 15 \times 10^{-34} J$\cdot$s [FACT - Definicja kilograma].
 * Stała Grawitacyjna (G): 6.674 30(15) \times 10^{-11} m$^3$/(kg$\cdots^2$) [MEASUREMENT - Wysoka niepewność relatywna].
 * Stała Boltzmanna (k_B): 1.380 649 \times 10^{-23} J/K [FACT - Definicja Kelwina].
 * Ładunek elementarny (e): 1.602 176 634 \times 10^{-19} C [FACT - Definicja Ampera].
 * Stała Avogadra (N_A): 6.022 140 76 \times 10^{23} mol$^{-1}$ [FACT - Definicja Mola].
 * Masa elektronu (m_e): 9.109 383 7015(28) \times 10^{-31} kg [MEASUREMENT].
 * Masa protonu (m_p): 1.672 621 923 69(51) \times 10^{-27} kg [MEASUREMENT].
 * Przenikalność magnetyczna próżni (\mu_0): 1.256 637 062 12(19) \times 10^{-6} N/A$^2$ [MEASUREMENT].
 * Przenikalność elektryczna próżni (\varepsilon_0): 8.854 187 8128(13) \times 10^{-12} F/m [MEASUREMENT].
 * Stała gazowa (R): 8.314 462 618 J/(mol$\cdot$K) [FACT - Pochodna N_A \times k_B].
 * Stała struktury subtelnej (\alpha): 7.297 352 5693(11) \times 10^{-3} [BEZWYMIAROWA].
 * Promień Bohra (a_0): 5.291 772 109 03(80) \times 10^{-11} m.
 * Stała Rydberga (R_\infty): 10 973 731.568 160(21) m$^{-1}$.
 * Magneton Bohra (\mu_B): 9.274 010 0783(28) \times 10^{-24} J/T.
 * Standardowe przyspieszenie ziemskie (g_n): 9.806 65 m/s$^2$ [FACT - Definicja konwencjonalna].
 * Standardowe ciśnienie atmosferyczne (P_0): 101 325 Pa [FACT].
 * Masa neutronu (m_n): 1.674 927 498 04(95) \times 10^{-27} kg.
 * Stała Faradaya (F): 96 485.332 12 C/mol [FACT - Pochodna e \times N_A].
 * Stała Stefana-Boltzmanna (\sigma): 5.670 374 419 \times 10^{-8} W/(m$^2\cdotK^4$) [FACT].
4. JAKIE 20 MODELI? (Theoretical Frameworks)
 * Model Standardowy Fizyki Cząstek (SU(3) \times SU(2) \times U(1)).
 * Model Kosmologiczny \LambdaCDM (Cold Dark Matter + Ciemna Energia).
 * Kohn-Sham Density Functional Theory (DFT) (Kwantowa struktura molekuł).
 * Incompressible Navier-Stokes (Mechanika płynów, Mach < 0.3).
 * Linear Elastic Fracture Mechanics (LEFM) (Pękanie materiałów).
 * SEIRDD Compartmental Model (Epidemiologia: Susceptible-Exposed-Infectious-Recovered-Dead-Detected).
 * Probabilistic Seismic Hazard Analysis (PSHA) (Inżynieria trzęsień ziemi).
 * 2D Shallow Water Equations Flow Model (Rozlewy powodziowe, Tsunami).
 * Gaussian Plume Dispersion Model (Rozprzestrzenianie zanieczyszczeń w powietrzu).
 * Metryka Schwarzschilda (Czarna dziura, bez rotacji, w ogólnej teorii względności).
 * Model Isinga (Fizyka statystyczna, ferromagnetyzm).
 * Model K-Epsilon Turbulencji (RANS, inżynieria wiatrowa).
 * Model Lotka-Volterra (Dynamika populacji).
 * Model Blacka-Scholesa (Ekonofizyka, dyfuzja stochastyczna).
 * Kinematyka Ciała Sztywnego Newtona-Eulera.
 * Teoria pasmowa ciał stałych (Bloch theorem).
 * Model reakcji Michaelisa-Menten (Kinetyka enzymatyczna).
 * Model Hartree-Focka (Przybliżenie orbitalne w chemii kwantowej).
 * AMBER/GROMOS Force Fields (Mechanika molekularna białek).
 * Rothermel Fire Spread Model (Powierzchniowe pożary lasów).
5. JAKIE 20 DATASETÓW (Ground Truth & Reference)?
 * CMIP6 (Coupled Model Intercomparison Project Phase 6): Zmiany klimatu.
 * USGS ANSS Comprehensive Earthquake Catalog (ComCat): Zjawiska sejsmiczne.
 * PDB (Protein Data Bank): Struktury 3D makrocząsteczek.
 * ERA5 (Copernicus): Reanaliza pogody (Ground truth z satelitów i stacji).
 * Materials Project Database: Obliczone właściwości materiałowe.
 * NIST Chemistry WebBook: Termochemia, widma.
 * CERN CMS Open Data: Zderzenia z LHC.
 * Global Earthquake Model (GEM) Exposure/Vulnerability Database.
 * PubChem: Struktury chemiczne i bioaktywność.
 * SRTM (Shuttle Radar Topography Mission): Globalny model DEM 30m.
 * ImageNet: (Benchmark dla algorytmów computer vision w nauce).
 * JPL Horizons Ephemeris: Precyzyjne pozycje ciał Układu Słonecznego.
 * Reactome: Ścieżki biologiczne człowieka.
 * BGS/NOAA World Magnetic Model (WMM).
 * ChEMBL: Baza danych bioaktywnych cząsteczek.
 * Global Biodiversity Information Facility (GBIF).
 * Sloan Digital Sky Survey (SDSS) Data Releases.
 * Ensembl Genomes: Adnotowane genomy.
 * GEBCO: Globalna mapa batymetryczna oceanów.
 * AlphaFold Protein Structure Database.
6. JAKIE 10 SOLVERÓW? (Open Source, Heavy Computation)
Wymóg: Dojrzałe, open-source, wolne od licencji komercyjnych "viral".
 * OpenFOAM: CFD (Mechanika płynów, pożary, aerodynamika) [GPL-3.0].
 * OpenQuake Engine: PSHA, Sejsmika, Ryzyko [AGPL-3.0].
 * HEC-RAS (USACE): Hydrologia, modele 1D/2D powodzi [Public Domain].
 * GROMACS: Dynamika molekularna (białka, lipidy) [LGPL-2.1].
 * Quantum ESPRESSO: Teoria Funkcjonału Gęstości (DFT) ciał stałych [GPL-2.0].
 * Cantera: Kinetyka chemiczna, termodynamika, spalanie [BSD-3-Clause].
 * FEniCS: Uniwersalny solver PDE (Metoda Elementów Skończonych) [LGPL-3.0].
 * GAMA Platform: Symulacje wieloagentowe, systemy przestrzenne, epidemiologia [GPL-3.0].
 * LAMMPS: Klasyczna dynamika molekularna (materiały, polimery) [GPL-2.0].
 * SU2: Analiza aerodynamiczna, projektowanie optymalizacyjne [LGPL-2.1].
7. JAKIE 10 BENCHMARKÓW (Do walidacji solverów)?
 * Lid-driven cavity flow: Klasyczny benchmark dla OpenFOAM (Navier-Stokes).
 * GW150914 (LIGO): Walidacja numerycznej teorii względności (zderzenie czarnych dziur).
 * Krzywa Keelinga (Mauna Loa): Benchmark dla globalnych modeli emisji CO2.
 * CASP (Critical Assessment of Structure Prediction): Benchmark dla modeli zwijania białek (np. AlphaFold).
 * QM9 Dataset: Benchmark dla przewidywań Machine Learning w chemii kwantowej.
 * PEER NGA-West2 Ground Motion Database: Walidacja empirycznych modeli GMPE.
 * Standard Solar Model (SSM) neutrinos: Benchmark dla astrofizyki jądrowej.
 * Bouncing Ball/Double Pendulum: Test zachowania energii w integratorach (Symplectic integrators).
 * Ahmad-Beshara 1983 / Malpasset Dam Break: Benchmark rygorystyczny dla solverów Shallow Water (HEC-RAS).
 * NIST XPS Database: Walidacja spektroskopii elektronowej.
8. JAKIE 10 STANDARDÓW?
 * ISO 80000 (Quantities and Units): Międzynarodowy standard notacji i wielkości fizycznych.
 * JCGM 100:2008 (GUM): Przewodnik wyrażania niepewności pomiaru.
 * BIPM SI Brochure (9th Edition): Absolutna definicja układu SI.
 * IEEE 754: Standard dla arytmetyki zmiennoprzecinkowej (kluczowe dla błędów numerycznych solverów).
 * CODATA Recommended Values: Fundament dla stałych.
 * FAIR Data Principles: Findability, Accessibility, Interoperability, Reusability.
 * OGC (Open Geospatial Consortium) Standards: (CityGML, WFS) Standardy dla danych przestrzennych (Earthquake/Flood).
 * PROV-DM (W3C Provenance Data Model): Standard zapisu śladów rewizyjnych (Evidence Layer).
 * IUPAC Green Book: Nomenklatura w chemii fizycznej.
 * CF (Climate and Forecast) Metadata Conventions: Standard dla plików NetCDF z danymi earth-science.
9. JAKIE 10 NAJWAŻNIEJSZYCH ZASAD WALIDACJI (Automatic Verification)?
Genesis musi przerywać symulacje (zgłaszać wyjątki), gdy nastąpi:
 * Dimensional Inconsistency (Dimension Mismatch): Dodawanie kg do m/s w matematyce.
 * Prediction Used as Ground Truth: Karmienie modelu A danymi z modelu B bez oznaczenia tego faktu. Generuje sztuczną pewność.
 * Validation Leakage (Circular Validation): Testowanie modelu na danych, które brały udział w optymalizacji jego parametrów.
 * Missing Precision/Uncertainty Bounds: Wynik podany jako "5.0000" gdy input miał niepewność \pm 10\%.
 * Outside Boundary/Validity Limits: Uruchomienie modelu gazu doskonałego dla plazmy o temperaturze 1M Kelwinów.
 * Uncalibrated Zero/Missing Baseline: Brak punktu odniesienia t=0 dla układów dynamicznych.
 * Silent NaNs / Infinities: Ignorowanie błędów w macierzach podczas rozwiązywania numerycznego, które są sztucznie zastępowane przez zera.
 * License Violation / Proprietary Flag: Użycie równania lub danych z zastrzeżeniem prawnym.
 * Missing Provenance Link: Utworzenie ResultRecord bez twardego dowiązania hasha użytego ModelRecord i DatasetRecord.
 * Correlation Framed as Causality: Narzucenie wniosku "A powoduje B" na podstawie samej analizy regresji (bez grafu przyczynowego / mechaniki).
10. JAKIE 10 RZECZY GENESIS POWINIEN NIE ZAPAMIĘTYWAĆ JAKO FAKT?
Tych elementów system NIGDY nie flaguje jako [FACT]:
 * Wyników jakiejkolwiek symulacji lub Solvera (To jest [MODEL_OUTPUT]).
 * Prognoz Klimatycznych na rok 2100 (To jest [PROJECTION] / [SCENARIO]).
 * Wartości stałych empirycznych bez źródła (Współczynniki tarcia, ciepła właściwe zależą od warunków – to [ESTIMATE]).
 * Odpowiedzi innych modeli LLM (np. z ChatGPT, Claude) (To jest [UNVERIFIED_HEURISTIC]).
 * Danych z preprintów arXiv bez reprodukcji (To jest [HYPOTHESIS] / [VERIFY_REQUIRED]).
 * Korelacji statystycznych jako mechanizmów fizycznych.
 * Surowych, nieskalibrowanych danych z sensorów (Sensor bias, to jest [RAW_OBSERVATION], a nie prawda absolutna).
 * Brakujących danych zinterpolowanych numerycznie (Interpolacja to wymysł matematyczny, nie fizyczny pomiar).
 * Uogólnień modeli analitycznych (np. że "Ziemia jest kulą", Ziemia to geoida - użycie kuli to [ASSUMPTION]).
 * Marketingowych "potwierdzeń" skuteczności np. leków czy technologii. (Wymaga dowodu z Peer-review).
PODSUMOWANIE DLA SYSTEMU (Knowledge Output)
Zbudowaliśmy fundament, w którym każda jednostka wiedzy to graf:
[CODATA (Source)] \rightarrow dostarcza \rightarrow [c (Constant)] \rightarrow używane przez \rightarrow [Einstein Eq (Equation)] \rightarrow zaimplementowane w \rightarrow [Einstein Toolkit (Solver)] \rightarrow wylicza \rightarrow [Gravitational Wave (Prediction)] \rightarrow porównane z \rightarrow [LIGO GW150914 (Observation)] \rightarrow weryfikuje \rightarrow [MATCH (Evidence)].
Ten plik to specyfikacja architektoniczna, gotowa do załadowania do ontologii wektorowej Genesis. Czeka na komendę wdrożenia przez inżynieriów danych.
