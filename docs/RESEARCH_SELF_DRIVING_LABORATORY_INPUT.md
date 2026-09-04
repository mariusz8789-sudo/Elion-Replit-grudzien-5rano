„Znajdź 5–10 najbardziej zaawansowanych istniejących systemów, które próbują połączyć AI → hipotezę → eksperyment → instrument/lab → pomiar → analizę → kolejny eksperyment. Porównaj je bez marketingu z Genesis i wskaż, czy Genesis może realnie zrobić coś, czego one nie robią „Tak, kontynuuj. Nie zatrzymuj się na analizie Yamanaka. Rozszerz research o całą architekturę Self-Driving Laboratory i sprawdź, jak Genesis mógłby w przyszłości łączyć AI, symulacje, rzeczywiste dane oraz instrumenty: mikroskopy, sensory, spektrometry, chromatografię, roboty laboratoryjne i inne aparatury. Znajdź istniejące standardy i API umożliwiające taką integrację. Następnie porównaj to z Genesis i wskaż, czego jeszcze brakuje, co możemy wykorzystać z istniejących technologii oraz gdzie może istnieć rzeczywista luka. Nie buduj kodu — tylko research, dowody i rekomendacje architektoniczne.”

# Etap 3: Self-Driving Laboratory

## Werdykt

Istnieją już systemy realizujące fragmenty pętli:

```text
AI/model
→ wybór eksperymentu
→ automatyczne wykonanie
→ pomiar
→ analiza
→ kolejny eksperyment
```

Najbardziej zaawansowane przykłady nie są jednak jednym uniwersalnym „systemem nauki”. Zwykle są zamkniętymi platformami dla jednego problemu: syntezy chemicznej, optymalizacji hodowli mikroorganizmów, materiałów, metabolizmu lub określonego typu pomiarów.

**INFERENCE:** Najbardziej realna luka Genesis nie polega na braku kolejnego AI do generowania hipotez. Polega na neutralnej, audytowalnej warstwie, która łączy różne modele, dane, instrumenty, laboratoria, wyniki, dowody i kolejne eksperymenty.

***

# 1. Kryteria porównania

System uznajemy za rzeczywisty closed loop tylko wtedy, gdy można wskazać:

1. cel lub hipotezę;
2. zmienne eksperymentalne;
3. mechanizm wyboru eksperymentu;
4. fizyczne wykonanie;
5. pomiar;
6. analizę wyniku;
7. przekazanie wyniku do kolejnej decyzji;
8. zapis wyjątków i błędów;
9. walidację rezultatu;
10. zakres autonomii.

Samo połączenie LLM z robotem laboratoryjnym nie wystarcza. Przegląd z 2025 r. podkreśla, że systemy self-driving laboratory różnią się poziomem autonomii, a wiele z nich automatyzuje tylko część procesu [1].

***

# 2. Najbardziej zaawansowane istniejące systemy

## Tabela porównawcza

| System | Domena | Hipoteza / wybór | Wykonanie | Pomiar | Pętla kolejnego eksperymentu | Poziom publicznej weryfikacji |
|---|---|---|---|---|---|---|
| **Genesis: Automation of Systems Biology Research** | Systems biology, yeast | Model mechanistyczny generuje hipotezy | Mikrofluidyczne bioreaktory | Metabolity, ekspresja genów, wzrost | Projekt zakłada iteracyjne aktualizowanie modeli | Projekt / paper koncepcyjny |
| **Autonomous Lab System — ANL** | Bioprodukcja, E. coli | Bayesian optimization | Hodowla, preprocessing, transport | Absorbancja, fluorescencja, metabolity, mass analysis | Tak, optymalizacja warunków | Peer-reviewed 2025 |
| **Chemputer / ChemCrow-like systems** | Synteza chemiczna | Planowanie reakcji i ścieżek | Roboty, reaktory, dozowanie | Wydajność, charakterystyka produktów | Tak, w ograniczonych workflow | Peer-reviewed / demonstracje |
| **A-Lab** | Materiały nieorganiczne | ML + heurystyki syntezy | Robotyczna synteza | Dyfrakcja, spektroskopia, analiza faz | Częściowo | Peer-reviewed, krytykowany zakres walidacji |
| **Coscientist** | Chemia laboratoryjna | LLM planuje użycie narzędzi | Roboty i aparatura chemiczna | Wyniki reakcji i analizy | Częściowo / eksperymentalnie | Peer-reviewed 2023 |
| **Emerald Cloud Lab** | Ogólne eksperymenty laboratoryjne | Użytkownik lub software definiuje eksperyment | Zdalne instrumenty i automatyzacja | Wielorakie pomiary | API-ready, nie uniwersalny autonomiczny scientist | Commercial platform |
| **Strateos** | Biologia, drug discovery | AI/algorytmy + protokoły | Robotyczne laboratoria | Obrazowanie, omics, assay | Zależnie od programu | Commercial platform |
| **Biosero Green Button Go** | Orkiestracja labu | Zewnętrzny system wybiera workflow | Roboty i instrumenty | Dane z urządzeń | Workflow orchestration, nie samodzielna nauka | Commercial software |
| **AutonoMS** | Mass spectrometry | Specification file / agent | Automatyczne pomiary MS | Widma i analiza | Tak dla serii pomiarów | Research system |
| **Evolutionary / protein-design closed loops** | Protein engineering | Generative model + active learning | Synteza i test wariantów | Expression, binding, activity | Tak, zwykle wąsko zdefiniowana | Mixed commercial/research |

***

# 3. Systemy szczegółowo

## 3.1 Genesis: Automation of Systems Biology Research

Istnieje projekt naukowy nazwany **Genesis**, którego celem jest automatyzacja systems biology research z użyciem hipotez, modeli, robotyki i zamkniętych pętli eksperymentalnych [2].

Opisywana architektura obejmuje:

```text
model systems biology
→ hypothesis formation
→ experiment planning
→ laboratory execution
→ measurement
→ model update
→ next experiment
```

Projekt zakładał mikrofluidyczny system z dużą liczbą komputerowo sterowanych bioreaktorów i pomiary wzrostu, metabolitów oraz ekspresji genów [2].

### Co robi

- skupia się na modelach systemów biologicznych;
- ma ambicję tworzenia hipotez z modeli przyczynowych;
- łączy obliczenia i fizyczne eksperymenty;
- opisuje dużą przepustowość.

### Czego nie potwierdzono

- pełnej realizacji całego systemu;
- szerokiej dostępności;
- uniwersalnego standardu instrumentów;
- produkcyjnego provenance/replay;
- niezależnego benchmarku przewagi nad laboratorium konwencjonalnym.

### Porównanie z Genesis OS

**Wniosek:** Nazwa nie jest przewagą Genesis OS; istnieje wcześniejszy projekt akademicki o tej samej nazwie. Trzeba uważać na kolizję terminologiczną i przejrzyście rozróżniać:

```text
Genesis systems-biology automation project
vs
GENESIS Scientific Discovery OS
```

**Genesis OS może zrobić więcej** na poziomie neutralnej orkiestracji, jeśli obejmie wiele domen, solverów i laboratoriów. Nie jest jednak dopuszczalne twierdzenie, że sama koncepcja closed loop jest nowa.

***

## 3.2 Autonomous Lab System — ANL

Badanie z 2025 r. opisuje autonomiczne laboratorium biotechnologiczne łączące robotykę, AI i Bayesian optimization. System wykonywał cykl od hodowli i preprocessing do pomiaru, analizy i formułowania kolejnych hipotez [3].

### Zakres

- hodowla E. coli;
- optymalizacja medium;
- automatyczne przygotowanie próbek;
- inkubacja;
- odczyty optyczne;
- fluorescencja;
- analiza metabolitów;
- wybór kolejnych warunków przez Bayesian optimization [3].

### Mocna strona

To jest jeden z lepszych przykładów rzeczywistej pętli:

```text
candidate conditions
→ robotic culture
→ measurement
→ Bayesian optimization
→ next conditions
```

### Ograniczenia

- wąska domena optymalizacji;
- nie jest ogólnym systemem generowania naukowych teorii;
- hipoteza jest głównie funkcją celu optymalizacyjnego;
- ograniczona generalizacja poza konkretną bioprodukcję;
- brak dowodu, że system autonomicznie rozwiązuje złożone problemy mechanistyczne.

### Genesis opportunity

Genesis może przechowywać różnicę między:

```text
optimization loop
```

a:

```text
hypothesis-driven discovery loop
```

ANL dobrze demonstruje pierwszą kategorię. Genesis powinien dążyć do drugiej, ale nie twierdzić, że już ją posiada.

***

## 3.3 Coscientist i agentowe laboratoria chemiczne

Coscientist pokazał możliwość użycia modeli językowych do planowania i wykonywania zadań laboratoryjnych przy użyciu robotyki i wyspecjalizowanych narzędzi. Późniejsze systemy agentowe rozszerzyły ten wzorzec o spektrometry, chromatografię i inne urządzenia.

Przegląd z 2025 r. opisuje architekturę, w której agent korzysta z baz reakcji, robotów do obsługi cieczy, spektrometrów i systemów chromatograficznych [4].

### Mocna strona

- natural-language planning;
- użycie narzędzi;
- połączenie protokołu z instrumentem;
- automatyzacja części analitycznej;
- możliwość iteracji w ramach określonego zadania.

### Ograniczenia

- planowanie reakcji nie jest równoznaczne z tworzeniem nowej teorii;
- agent może wygenerować błędną procedurę;
- bezpieczeństwo i kontrola chemiczna wymagają ograniczeń;
- workflow jest zwykle ograniczony do określonych narzędzi;
- pełna niezależność naukowa jest nieudowodniona.

### Genesis opportunity

Genesis może dodać:

- jawny claim–evidence graph;
- source grading;
- rozdzielenie hypothesis od instruction;
- safety gate;
- replay całego cyklu;
- zapis eksperymentów nieudanych;
- porównanie alternatywnych mechanizmów.

***

## 3.4 A-Lab

A-Lab był demonstracją automatyzacji odkrywania i syntezy materiałów, łączącą modele predykcyjne, planowanie syntezy, robotykę i charakterystykę materiałów.

### Co pokazuje

```text
candidate material
→ synthesis plan
→ robotic execution
→ characterization
→ model-guided next candidate
```

### Istotne ograniczenie

Po publikacji pojawiła się krytyka dotycząca zakresu walidacji niektórych zgłaszanych nowości i jakości potwierdzenia produktów. To jest ważna lekcja dla Genesis:

> duża liczba automatycznie wykonanych eksperymentów nie oznacza automatycznie dużej liczby zwalidowanych odkryć.

### Genesis lesson

Każdy wynik powinien mieć osobne pola:

```text
generated
synthesized
measured
identified
independently_confirmed
novelty_verified
```

Nie wolno scalać tych stanów do jednego `discovered = true`.

***

## 3.5 Emerald Cloud Lab

Emerald Cloud Lab udostępnia zdalne, zautomatyzowane instrumenty i programowalne eksperymenty. Jest to przede wszystkim infrastruktura wykonawcza i usługowa, a nie niezależny system generowania teorii.

### Mocna strona

- szeroki dostęp do aparatury;
- automatyzacja protokołów;
- zdalne wykonanie;
- powtarzalność;
- możliwość integracji z software’em użytkownika.

### Ograniczenie

Użytkownik lub zewnętrzny system musi zdefiniować problem, hipotezę i workflow. Platforma nie jest neutralną warstwą całego cyklu wiedzy.

### Genesis fit

Bardzo dobra jako potencjalny adapter wykonawczy:

```text
Genesis StructuredExperiment
→ ECL protocol
→ execution
→ measurement
→ result ingestion
```

***

## 3.6 Strateos

Strateos oferuje zautomatyzowane laboratoria i usługi dla biologii oraz drug discovery.

### Mocna strona

- fizyczna egzekucja;
- high-throughput experiments;
- integracja z programami badawczymi;
- obsługa biologicznych assayów.

### Ograniczenie

To platforma wykonawcza i komercyjna, a nie publicznie neutralny, wielodomenowy system naukowego rozumowania. Zakres dostępnych API, danych i metadanych zależy od konkretnej usługi.

### Genesis fit

```text
Genesis = reasoning/orchestration/evidence
Strateos = execution layer
```

To nie jest konkurencja 1:1; potencjalnie jest to warstwa, którą można integrować.

***

## 3.7 Biosero Green Button Go

Green Button Go jest systemem orkiestracji laboratoryjnej, służącym do planowania i sterowania workflowami roboczymi oraz urządzeniami.

### Co robi

- harmonogramowanie;
- przekazywanie próbek;
- sterowanie workflow;
- integracja z urządzeniami;
- śledzenie procesu.

### Czego nie robi samodzielnie

- nie generuje naukowych hipotez;
- nie ocenia literatury;
- nie buduje causal model;
- nie wybiera eksperymentu na podstawie information gain;
- nie tworzy automatycznie evidence grade.

### Genesis fit

Wysoki jako adapter workflow, niski jako system odkrycia naukowego.

***

## 3.8 AutonoMS

AutonoMS pokazuje, jak system agentowy może sterować end-to-end pomiarami i analizą w spektrometrii masowej na podstawie plików specyfikacji eksperymentu [2].

### Znaczenie

To ważny wzorzec dla Genesis, ponieważ pokazuje, że:

```text
experiment specification
→ instrument run
→ data acquisition
→ analysis
```

może być realizowane automatycznie.

### Ograniczenia

- domena ograniczona do pomiarów MS;
- nie jest ogólnym systemem generowania hipotez;
- wynik pomiaru nie staje się automatycznie wiarygodnym odkryciem;
- potrzeba kalibracji, QC, interpretacji i walidacji.

### Genesis opportunity

Genesis może traktować AutonoMS-like components jako:

```text
MeasurementService
```

z typowanym wejściem i wyjściem.

***

## 3.9 Protein-design closed loops

W protein engineering istnieją systemy łączące:

```text
sequence model
→ candidate variants
→ synthesis
→ expression/binding/activity assay
→ active learning
→ next variants
```

To jest szczególnie istotne dla historii GPT-4b micro i Retro Biosciences. Oficjalny opis OpenAI mówi o użyciu specjalistycznego modelu do zaprojektowania bardziej skutecznych wariantów związanych z reprogramowaniem, ale dostępny publiczny opis nie dostarcza pełnego, niezależnego benchmarku całego zamkniętego cyklu [5].

### Mocna strona

- konkretny, mierzalny cel;
- duża przestrzeń sekwencji;
- active learning;
- stosunkowo dobrze zdefiniowane assay’e.

### Ograniczenia

- wynik zależy od jakości assayu;
- model może optymalizować proxy;
- ekspresja nie musi oznaczać funkcji;
- functional benefit i safety są osobnymi etapami;
- wiele platform jest zamkniętych.

### Genesis opportunity

Genesis powinien wymagać rozdzielenia:

```text
sequence_generation
→ expression
→ stability
→ activity
→ mechanism
→ cellular phenotype
→ safety
```

***

# 4. Standardy i API integracyjne

## 4.1 SiLA 2

**SiLA 2** jest najważniejszym kandydatem na standard komunikacji z instrumentami laboratoryjnymi. Używa gRPC i Protocol Buffers, zapewnia typowane funkcje, discovery oraz wspólną warstwę komunikacji [6][7][8].

### Co rozwiązuje

- komunikację software–instrument;
- opis funkcji urządzenia;
- typy parametrów;
- zdalne wywołania;
- interoperacyjność części urządzeń;
- discovery.

### Czego nie rozwiązuje

- wyboru hipotezy;
- interpretacji naukowej;
- planowania eksperymentu;
- dowodu poprawności wyniku;
- causal reasoning;
- safety decyzji agenta.

### Rekomendacja

```text
Genesis Experiment Adapter
→ SiLA 2 client
→ Instrument SiLA 2 server
```

SiLA 2 powinno być traktowane jako warstwa device connectivity, nie jako pełny standard Scientific Discovery OS.

***

## 4.2 OPC UA i OPC UA LADS

OPC UA jest szeroko stosowanym przemysłowym standardem interoperacyjności. W laboratoriach może służyć do reprezentacji urządzeń, stanów i parametrów, szczególnie w środowiskach przemysłowych i produkcyjnych.

### Zalety

- dojrzały przemysłowo;
- modeluje urządzenia i stany;
- wspiera bezpieczeństwo i certyfikację;
- nadaje się do systemów produkcyjnych.

### Ograniczenia

- nie jest standardem hipotez i eksperymentów;
- implementacje laboratoryjne bywają nierówne;
- nie zastępuje formatu danych analitycznych.

***

## 4.3 SCPI

SCPI jest komendowym standardem sterowania aparaturą testową i pomiarową.

### Typowa rola

```text
instrument
→ SCPI command
→ measurement
```

### Ograniczenia

- komendy są często zależne od producenta;
- brak pełnej semantyki naukowej;
- słaba reprezentacja kontekstu eksperymentu;
- nie rozwiązuje provenance ani interpretacji.

Genesis powinien ukrywać SCPI za adapterem, zamiast wystawiać komendy bezpośrednio agentowi.

***

## 4.4 AnIML

AnIML to otwarty format XML dla danych analitycznych, zaprojektowany do przechowywania i wymiany danych z różnych instrumentów analitycznych [9].

### Przydatność

- spektrometria;
- chromatografia;
- dane analityczne;
- interoperacyjność;
- metadane pomiaru.

### Ograniczenie

AnIML opisuje dane analityczne, ale nie jest kompletnym modelem:

```text
question
→ hypothesis
→ experiment
→ next experiment
```

***

## 4.5 Allotrope Data Format

Allotrope Data Format przechowuje dane pomiarowe, metadane kontekstowe, ustawienia aparatury i ślad audytowy; wykorzystuje HDF5 oraz modele i ontologie Allotrope [10][11][12].

### Mocna strona

ADF jest dobrym kandydatem do długoterminowego zapisu:

- danych analitycznych;
- ustawień instrumentu;
- kontekstu próbki;
- audit trail;
- powiązanych plików.

### Ograniczenie

ADF jest przede wszystkim formatem danych i metadanych. Nie jest agentowym protokołem negocjowania możliwości instrumentu ani silnikiem eksperymentów.

***

## 4.6 FAIR, RO-Crate, W3C PROV i ontologie

Genesis powinien wykorzystać istniejące wzorce:

- **FAIR** — findable, accessible, interoperable, reusable;
- **W3C PROV** — reprezentacja pochodzenia;
- **RO-Crate** — pakowanie danych, workflow i metadanych;
- **ORCID/DOI** — identyfikacja ludzi i publikacji;
- **BioSchemas / OBI / EDAM / PROV-O** — kontrolowane słownictwo;
- **ISA-Tab / ISA JSON** — opis badań, próbek i assayów.

**INFERENCE:** Genesis nie powinien tworzyć własnej ontologii od zera. Powinien dodać cienką warstwę mapowania do istniejących standardów, zachowując możliwość eksportu.

***

## 4.7 Agent-to-Instrument Protocol

Najnowszy opis LAP proponuje warstwę komunikacji między agentem a instrumentem, która może współpracować z MCP/A2A oraz opakowywać standardy takie jak SiLA 2 i OPC UA [13].

### Kluczowa obserwacja

Istniejące standardy zakładają zwykle deterministycznego klienta, który wie, jaką komendę wydać. Agent probabilistyczny potrzebuje dodatkowo:

- discovery możliwości;
- sprawdzenia warunków bezpieczeństwa;
- negocjacji parametrów;
- typowanej odpowiedzi;
- obsługi wyjątków;
- ograniczenia zakresu działania.

To dokładnie jest obszar nad SiLA 2, a nie zamiennik SiLA 2 [13].

**STATUS:** research/proposal; wymaga osobnej weryfikacji adopcji produkcyjnej.

***

# 5. Warstwowa architektura integracyjna

## Proponowany model

```text
LAYER 7 — Scientific Reasoning
Question, hypothesis, causal alternatives, next experiment

LAYER 6 — Experiment Orchestration
StructuredExperiment, scheduling, controls, safety gates

LAYER 5 — Model and Data Services
simulation, protein models, statistical models, databases

LAYER 4 — Workflow Execution
LIMS, ELN, scheduler, robotic protocol engine

LAYER 3 — Instrument Agent
capability discovery, permissions, typed results, safe-stop

LAYER 2 — Device Standards
SiLA 2, OPC UA, SCPI, vendor APIs

LAYER 1 — Physical Hardware
microscope, sensor, spectrometer, chromatograph, robot, incubator
```

## Genesis powinien odpowiadać za warstwy 5–7

Nie powinien zastępować wszystkich niższych warstw.

***

# 6. Instrumenty i proponowane adaptery

| Aparatura | Typowe dane | Warstwa integracji | Ważne metadane |
|---|---|---|---|
| Mikroskop | obrazy, time-lapse, segmentacja | vendor API, OME-NGFF, OME-TIFF | obiektyw, ekspozycja, kanał, pixel size |
| Sensor środowiskowy | temperatura, pH, O₂, wilgotność | MQTT, OPC UA, REST | kalibracja, częstotliwość, timestamp |
| Spektrometr | widmo, absorbancja, fluorescencja | SiLA 2, SCPI, vendor API | zakres, rozdzielczość, blank, kalibracja |
| Chromatograf | chromatogram, peak table | vendor API, AnIML, ADF | kolumna, gradient, flow rate, detektor |
| Mass spectrometer | widma, feature table | AutonoMS-like service, ADF/AnIML | m/z, resolution, calibration, acquisition mode |
| Robot liquid handler | akcje dozowania | SiLA 2, vendor SDK, PyLabRobot | tips, volumes, deck layout, liquid class |
| Inkubator | temperatura, CO₂, wilgotność | OPC UA, SiLA 2, vendor API | setpoint, actual, alarm state |
| Plate reader | OD, fluorescence, luminescence | SiLA 2/vendor API | plate map, wavelength, gain, timing |
| Sequencer | reads, QC, variants | vendor API, standard file formats | run ID, flow cell, pipeline version |

## Ważna zasada

Genesis nie powinien traktować obrazu, widma ani pliku CSV jako „wyniku” bez:

```text
instrument_id
calibration_state
method_version
sample_id
run_id
timestamp
quality_control
software_version
```

***

# 7. Porównanie z Genesis

## Co istniejące systemy robią lepiej

- fizyczna egzekucja;
- instrumentacja;
- throughput;
- zoptymalizowane workflowy domenowe;
- kalibracja sprzętu;
- operational support;
- walidacja konkretnych assayów;
- komercyjna odpowiedzialność za laboratorium.

## Co Genesis potencjalnie może robić lepiej

| Obszar | Istniejące platformy | Potencjalna rola Genesis |
|---|---|---|
| Wiele domen | Zwykle jedna domena | Jedna warstwa ponad biologią, chemią, wildfire, materiałami |
| Source reasoning | Często ograniczone | Claim/evidence graph |
| Hipotezy alternatywne | Zwykle niejawne | Explicit competing hypotheses |
| A/B | Domena-specific | Wspólny model porównań |
| Replay | Częściowy | Pełen replay modelu, danych, instrumentu i analizy |
| Negative results | Niekonsekwentne | First-class scientific memory |
| WHY | Często opisowe | Causal explanation i discriminating experiment |
| Next experiment | Optymalizacja lokalna | Information gain + koszt + ryzyko |
| Solver neutrality | Często vendor-specific | Admitted model/solver registry |
| Evidence grading | Niejednolite | Jawna hierarchia dowodów |
| Cross-lab portability | Ograniczona | Normalizacja workflowów i metadanych |

**INFERENCE:** Są to potencjalne różnice architektoniczne, nie potwierdzona przewaga osiągnięta przez Genesis.

***

# 8. Rzeczywista luka czy tylko narracja?

## Luka jest prawdopodobnie rzeczywista w trzech miejscach

### 1. Evidence-native orchestration

Większość platform koncentruje się na wykonaniu. Genesis mógłby koncentrować się na pytaniu:

```text
What exactly does this result prove?
```

### 2. Cross-domain experiment model

Instrumenty, symulatory i laboratoria używają różnych formatów. Genesis mógłby zapewnić wspólny model:

```text
question
→ hypothesis
→ intervention
→ observation
→ result
```

### 3. Scientific memory across failures

Platformy laboratoryjne zapisują runy, ale niekoniecznie budują długoterminową pamięć:

```text
what failed
why it failed
which hypothesis was weakened
what should not be repeated
```

## Czego nie należy nazywać luką bez dowodu

- „nikt nie ma AI laboratoryjnego” — nieprawda;
- „Genesis będzie pierwszym self-driving lab” — nieuzasadnione;
- „istniejące platformy nie mają AI” — nieprawda;
- „nikt nie ma closed loop” — nieprawda;
- „Genesis zastąpi laboratoria” — brak podstaw.

***

# 9. Rekomendowana architektura Genesis

## Core objects

```text
ScientificQuestion
Hypothesis
AlternativeHypothesis
StructuredExperiment
ModelSelection
DatasetSelection
InstrumentCapability
ExecutionPlan
Observation
QualityControlResult
DerivedMetric
Inference
EvidenceBundle
ProvenanceRecord
ReplayRecord
FailureRecord
NextExperimentProposal
```

## Adapter contract

Każdy model, instrument i laboratorium powinny deklarować:

```text
capability_id
version
input_schema
output_schema
units
supported_domains
constraints
failure_modes
uncertainty
validation_status
license
runtime_requirements
provenance_requirements
```

## Instrument action contract

Agent nie powinien wysyłać bezpośrednio dowolnej komendy. Powinien generować:

```text
InstrumentActionRequest
├── instrument_capability
├── purpose
├── sample_id
├── parameters
├── allowed_ranges
├── expected_output
├── safety_constraints
├── approval_required
└── rollback_or_stop_condition
```

***

# 10. Admission policy dla systemów zewnętrznych

Genesis powinien przyjmować system do swojej warstwy dopiero po ocenie:

| Kryterium | Pytanie |
|---|---|
| Capability | Co system rzeczywiście potrafi? |
| Interface | Czy ma API, CLI, SDK lub standard? |
| Typed output | Czy wynik ma jednoznaczny schema? |
| Units | Czy jednostki są jawne? |
| QC | Czy system dostarcza quality control? |
| Provenance | Czy można odtworzyć run? |
| Calibration | Czy znany jest stan kalibracji? |
| License | Czy użycie komercyjne jest dozwolone? |
| Validation | Czy są benchmarki? |
| Failure handling | Czy błędy i przerwane runy są zapisane? |
| Safety | Czy agent może wykonać tylko zatwierdzone akcje? |

***

# 11. Rekomendowane wykorzystanie istniejących technologii

## Do wykorzystania

1. **SiLA 2** — instrument connectivity [6][7].
2. **OPC UA** — przemysłowa interoperacyjność i stany urządzeń.
3. **SCPI** — aparatura pomiarowa, schowana za adapterem.
4. **AnIML** — analityczne dane pomiarowe [9].
5. **Allotrope ADF** — dane, metadane i audit trail [10][11].
6. **W3C PROV** — provenance.
7. **RO-Crate** — paczki eksperymentów.
8. **OME-TIFF / OME-NGFF** — obrazy mikroskopowe.
9. **PyLabRobot** — biblioteka obsługi liquid handlerów, w tym Opentrons [14].
10. **ELN/LIMS APIs** — istniejące systemy laboratoryjne.
11. **MCP/A2A-like agent interfaces** — warstwa narzędziowa, z ostrożnością.
12. **Bayesian optimization** — dla ograniczonych przestrzeni eksperymentalnych.

## Nie budować od początku

- własnego protokołu sterowania każdym instrumentem;
- własnego formatu widm;
- własnego formatu obrazów;
- własnego LIMS;
- własnej bazy wszystkich assayów;
- własnej robotyki;
- własnych modeli proteinowych;
- własnego standardu provenance bez mapowania do W3C PROV.

***

# 12. Największe braki Genesis

## Techniczne

- brak adapter layer;
- brak instrument capability registry;
- brak typed measurement schema;
- brak laboratory execution service;
- brak kalibracji i QC;
- brak scheduler’a;
- brak obsługi próbek i chain of custody;
- brak realnego wet-lab connectora.

## Naukowe

- brak formalnych ontology mappingów;
- brak assay registry;
- brak evidence grade;
- brak causal model;
- brak mechanizmu oceny replikacji;
- brak failure taxonomy;
- brak validated biological benchmark.

## Operacyjne

- brak safety governance;
- brak human approval policy;
- brak audytu fizycznych działań;
- brak odpowiedzialności za uszkodzenie sprzętu;
- brak modelu kosztów instrumentów;
- brak obsługi licencji vendorów.

***

# 13. Czy Genesis może zrobić coś, czego obecne systemy nie robią?

## Odpowiedź

**Tak, ale tylko jako warstwa ponad nimi i tylko po udowodnieniu na benchmarku.**

Najbardziej wiarygodny zakres różnicujący:

```text
heterogeneous model/instrument/lab orchestration
+
evidence graph
+
explicit alternative hypotheses
+
negative-result memory
+
replay
+
causal WHY
+
information-gain next experiment
```

Nie należy konkurować z laboratoriami w:

- pipetowaniu;
- szybkości pomiaru;
- kalibracji;
- produkcji aparatury;
- chemicznej syntezie;
- podstawowych modelach proteinowych.

## Najbardziej realny produktowy rdzeń

```text
Genesis
= scientific control plane
```

Nie:

```text
Genesis
= laboratory robot
```

I nie:

```text
Genesis
= universal autonomous scientist
```

***

# 14. Minimalny benchmark dla Genesis

Aby sprawdzić, czy luka jest realna, należy przeprowadzić test na jednym publicznym workflow.

## Benchmark

```text
Question:
  Which intervention improves a defined cellular endpoint?

1. Retrieve 10–20 sources.
2. Decompose claims.
3. Produce two competing hypotheses.
4. Select an existing model.
5. Define structured experiment.
6. Simulate or execute a small public dataset workflow.
7. Compare controls.
8. Store positive and negative outcomes.
9. Generate evidence bundle.
10. Replay the analysis.
11. Propose the highest-information next experiment.
```

## Metryki

- poprawność źródeł;
- zgodność claimu z endpointem;
- kompletność provenance;
- replay success rate;
- poprawność jednostek;
- wykrywanie sprzeczności;
- jakość kontroli;
- kalibracja niepewności;
- wartość kolejnego eksperymentu;
- liczba nieuzasadnionych ekstrapolacji.

***

# 15. Status końcowy

| Obszar | Status |
|---|---|
| Existing closed-loop labs | **EXISTS** |
| AI-driven experiment selection | **EXISTS** |
| Robotic execution | **EXISTS** |
| Instrument APIs | **EXISTS / FRAGMENTED** |
| SiLA 2 | **EXISTS** [6][7] |
| AnIML | **EXISTS** [9] |
| Allotrope ADF | **EXISTS** [10][11] |
| Agent-to-instrument standard | **RESEARCH / VERIFY_REQUIRED** [13] |
| Universal lab abstraction | **PARTIAL / NOT_CONNECTED** |
| Universal evidence graph | **NOT_AVAILABLE** |
| Cross-domain scientific memory | **NOT_AVAILABLE** |
| Failure-first memory | **NOT_AVAILABLE** |
| Causal next-experiment engine | **PARTIAL IN RESEARCH** |
| Genesis instrument integration | **NOT_CONNECTED** |
| Genesis wet-lab execution | **NOT_AVAILABLE** |
| Genesis scientific control plane | **DESIGNED** |
| Proven Genesis advantage | **VERIFY_REQUIRED** |

***

# 16. Rekomendacja architektoniczna

Genesis powinien rozwijać się w tej kolejności:

```text
1. Claim / Evidence model
2. StructuredExperiment model
3. Model and dataset registry
4. Instrument capability registry
5. Adapter SDK
6. Replay and provenance
7. One simulation connector
8. One measurement connector
9. One robotic lab connector
10. Closed-loop benchmark
11. Cross-domain expansion
```

Najpierw trzeba udowodnić, że Genesis potrafi poprawnie reprezentować i odtwarzać eksperyment. Dopiero później należy dodawać autonomiczne planowanie i fizyczne instrumenty.

**Końcowy werdykt:** istnieją już bardzo zaawansowane laboratoria autonomiczne, więc Genesis nie powinien pozycjonować się jako „pierwszy system AI robiący eksperymenty”. Potencjalnie odmienną funkcją może być **neutralna, evidence-native warstwa kontroli naukowej**, która łączy istniejące modele, symulacje, dane, instrumenty i laboratoria oraz zachowuje pełny audyt od hipotezy do kolejnego eksperymentu.

Cytaty:
[1] Autonomous 'self-driving' laboratories: a review of technology ... https://pmc.ncbi.nlm.nih.gov/articles/PMC12368842/
[2] Genesis: Towards the Automation of Systems Biology Research https://arxiv.org/html/2408.10689
[3] Development of the autonomous lab system to support biotechnology research https://www.nature.com/articles/s41598-025-89069-y
[4] AI, agentic models and lab automation for scientific discovery https://pmc.ncbi.nlm.nih.gov/articles/PMC12426084/
[5] Accelerating life sciences research https://openai.com/index/accelerating-life-sciences-research-with-retro-biosciences/
[6] SiLA https://docs.unitelabs.io/connector-development/concepts/sila/
[7] Standards | SiLA Rapid Integration https://sila-standard.com/standards/
[8] PowerPoint Presentation https://sila-standard.com/wp-content/uploads/2018/12/SiLA2-TechNote.pdf
[9] Technical Menu https://www.animl.org/overview
[10] Allotrope Data Format v1.5.3 RF https://docs.allotrope.org/Allotrope%20Data%20Format.html
[11] Allotrope Data Format (ADF) https://docs.allotrope.org/
[12] The Allotrope Framework | allotropefoundation https://www.allotrope.org/allotrope-framework
[13] An Agent-to-Instrument Protocol for Autonomous Science https://arxiv.org/html/2606.03755v1
[14] Opentrons OT-2 — PyLabRobot 0.2.1 documentation https://docs.pylabrobot.org/0.2.1/user_guide/00_liquid-handling/opentrons/ot2/ot2.html
[15] Self-driving laboratories with artificial intelligence https://www.sciencedirect.com/science/article/abs/pii/S0098135425002698
[16] Agentic AI integrated with scientific knowledge: laboratory ... https://pubmed.ncbi.nlm.nih.gov/42413936/
[17] Self-Driving Laboratories - The Life Sciences AI Handbook https://lifesciencesaihandbook.com/automation/self-driving-labs.html
[18] Self-Driving Labs in 2026: A Practical Setup Guide https://vortx.ch/self-driving-labs-in-2026-a-practical-setup-guide/
[19] [PDF] SiLA 2 - SPECTARIS https://www.spectaris.de/fileadmin/Content/Analysen-Bio-und-Labortechnik/Zahlen-Fakten-Publikationen/SiLA.pdf
[20] Standards Database https://www.slas.org/resources/standards/
[21] Product Suite | allotropefoundation https://www.allotrope.org/solution


> STATUS: RESEARCH INPUT ONLY. Claims and system descriptions require independent source verification before admission into Genesis.
