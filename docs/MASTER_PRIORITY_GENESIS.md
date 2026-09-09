# MASTER PRIORITY — GENESIS

Ustalone przez Scientific Director (C1) po audycie Priorytetu 1 (Autonomous
Discovery), Priorytetu 4 (Virtual Cell Lab) i Priorytetu 5 (Virtual Human),
2026-09-09. Obowiązuje dla C2 (Graphics Engine) i C3 (World Model /
Scientific Substrate) od tego commita do odwołania.

**Uzasadnienie**: dowód naukowy najpierw, opakowanie (Priorytet 3 —
Product/Funding Readiness) potem. Punkt 5 poniżej (dane z prawdziwego
eksperymentu wracające do Genesis) jest ważniejszy dla wartości projektu niż
kolejne demo/laboratorium 3D — to jest ta kombinacja (mechanistyczny
substrat + udowodniona pętla falsyfikacji + realne zamknięcie eksperymentem),
która faktycznie odróżnia Genesis od FutureHouse/Google Co-Scientist/Sakana
(patrz `GENESIS_NORTH_STAR.md` §7, "Why Priority 5 alone does not
differentiate Genesis, and what does").

## P0 — C3: MECHANISM generation → discoveryOrchestrator → pełny StrategyRun

`mechanismGeneration.ts` istnieje i realnie komponuje dwa zadeklarowane
levery w jeden fork, ale `discoveryOrchestrator.ts`'s PARAMETER path routes
its own generation continuation as a second `StrategyRun`
(`runInquiryWithGeneration`) while MECHANISM still returns its own result
shape and is not routed through this front door at all — stwierdzone
wprost jako dług w commitcie `ccb7555`/`9b5b54e`
("MECHANISM has a generation path, this front door does not route it yet").
Zamknąć tę asymetrię tak samo, jak PARAMETER: drugi `StrategyRun`, nie nowy
kontrakt.

## P0 — C3: domknięcie autonomous research chain

Wynik → nowe pytanie → kolejny eksperyment → kolejny wynik, autonomicznie,
przez kilka kroków — nie tylko jedno wygenerowane pytanie i stop. Reuse
`runInquiryWithGenerationAndRemember` i istniejący Memory → Selection path;
nie budować drugiej pętli.

## P1 — C2: Virtual Cell Lab + prawdziwy demo flow

MVP (`CellLabScreen.tsx`, Control vs Treatment na realnym `cellCycle.ts`)
już wylądował na `main`. Zrobić z tego naprawdę mocny demo-case oparty na
istniejącym solverze — bez nowego silnika.

## P1/P2 — C1+C3: Real Experiment Interface jako rozszerzenie ExperimentFabric

Docelowy przepływ:

```
Hypothesis → Prediction → ExperimentRequest → Real Experiment → Raw Data
  → Derived Data → Evidence → Falsification/Support → Memory → Next Experiment
```

Nie integrować jeszcze konkretnego sprzętu ani laboratorium. Zbudować
kontrakt tak, żeby późniejszy realny wynik dało się wprowadzić bez
przebudowy architektury.

### KLUCZOWE — przy tym samym zadaniu: rozszerzyć proweniencję danych

`packages/frontend/src/core/dataSource.ts`'s obecne `isSynthetic: boolean`
nie wystarcza — nie rozróżnia symulacji Genesis, danych
referencyjnych/literaturowych i przyszłego prawdziwego pomiaru
laboratoryjnego. To osobna oś od `ConfirmationLevel` w `citation.ts` (ta
ocenia, jak dobrze ugruntowana jest NAUKA; ta tutaj — skąd wzięła się
LICZBA).

Docelowy model:

```
SIMULATED         = wynik modelu/solvera Genesis
REFERENCE         = zewnętrzne dane referencyjne/literaturowe
REAL_EXPERIMENTAL = wynik rzeczywistego eksperymentu laboratoryjnego
```

Musi propagować się przez cały łańcuch bez utraty:

```
ExperimentFabric → ExperimentRun → Evidence → StrategyRun → Memory → UI/Replay
```

Nigdy nie oznaczać realnych danych laboratoryjnych jako `SIMULATED` ani nie
mieszać ich z danymi syntetycznymi w jednym nieoznaczonym polu. Lepiej
zrobić to rozszerzenie teraz, przy budowie Real Experiment Interface, niż
później odkryć, że połowa Evidence/Memory/Replay milcząco zakłada tylko
`isSynthetic`.

## P2 — dalej: pierwszy eksperyment na prawdziwych komórkach

Po zbudowaniu Real Experiment Interface i rozszerzonej proweniencji:
pierwszy prawdziwy eksperyment na prawdziwych komórkach, dane wracają do
Genesis przez ten sam kontrakt, oznaczone `REAL_EXPERIMENTAL`.

## Priorytet 3 — Product/Funding Readiness

Pozostaje ważny, ale NIE jest teraz blockerem i nie konkuruje z powyższym.
Wracamy do niego po uzyskaniu mocnego scientific proof/demo — łatwiej będzie
zrobić dużo mocniejszy pitch mając za sobą realne zamknięcie eksperymentem
niż budować opakowanie wcześniej.

## Zasady wykonania (bez zmian względem reszty roadmapy)

- Nie tworzyć równoległych subsystemów. Reuse istniejący Fabric, Discovery,
  Memory, Evidence/Replay — nowy silnik tylko tam, gdzie faktycznie żaden
  mechanizm jeszcze nie istnieje (patrz audyt Priorytetu 5: neuron/synapse
  solver naprawdę nie istnieje nigdzie w `core/worldModel/domains/`).
- Każda zmiana: tests + tsc + eslint + build + odpowiedni live verification,
  potem commit.
- Cyber/GOV pozostaje OFF `main` — bez zmian.

---

## UPDATE — 2026-09-09, wieczorny sprint: co jest zamknięte, nowy podział

Wszystko powyżej od P0 do "domknięcie autonomous research chain" jest
**zrobione i realnie zweryfikowane** (nie tylko w izolowanych testach):
MECHANISM routing przez `discoveryOrchestrator.ts` jako drugi `StrategyRun`,
`runMechanismDiscoveryAndRemember` zamykający persystencję/replay dla
MECHANISM (C1+C3, po ręcznym pogodzeniu równoległych zmian w
`mechanismGeneration.ts` — patrz `docs/GENESIS_MECHANISM_PERSISTENCE_AND_E2E_CHAIN.md`),
proweniencja SIMULATED/REFERENCE/REAL_EXPERIMENTAL propagująca się przez
cały łańcuch (C1, `docs/GENESIS_DATA_PROVENANCE_AND_REAL_EXPERIMENT_CONTRACT.md`),
Virtual Cell Lab jako prawdziwy flagship demo z 8-krokową drabiną
GOAL→...→EVIDENCE→REPLAY (C2). **Także zamknięte, szybciej niż zakładano**:
solver-structure choice — wcześniej uznane za CONTRACT-ONLY — C3 zbudował
`StructuralAlternativeRegistry` z realnym, cytowanym drugim modelem
(affine idle-fuel-burn kontra liniowy dla generatora) i realnym rebindem
`domainBinding.solverId` napędzanym przez falsyfikację, dokładnie tak jak
`RUNTIME_CONFIGURABLE_MODEL_CONTRACT.md` sam to proponował jako uczciwy
przykład — nie fabrykacja fizyki.

**Nowy podział, na trzy równoległe ścieżki bez nadpisywania się:**

### C1 — główna implementacja: Real Experiment E2E

Domknąć pierwszy prawdziwy most:
`Prediction → ExperimentRequest → RealExperimentRun → ręczne wprowadzenie
realnych danych → DerivedData → Comparison → EvidencePackage → Memory → Replay`.

Kontrakt (`core/experimentFabric/realExperiment.ts`, `createRealExperimentRun`)
już istnieje i jest przetestowany, ale kompletnie niewpięty — zero referencji
poza własnym testem. Braki do zamknięcia: seam do admission
(`discoveryAdmission.ts`), UI do ręcznego wprowadzania danych (reuse
`RealExperimentPipeline.tsx`, nie budować drugiego ekranu), realny replay
guard dla `REAL_EXPERIMENTAL` (fizyczny pomiar nie da się "odtworzyć"
uruchomieniem solvera ponownie — musi zwracać `NOT_REPRODUCIBLE`, nigdy
cicho wywoływać symulatora), oraz znana luka w `reproductionVerdict`
(wymaga bit-identycznego fingerprintu przy powtórzeniach — dwa niezależne
pomiary fizyczne nigdy się tak nie zgodzą).

### C3 — druga ścieżka: Mechanism Composition / researchChain actuator

`mechanismGeneration.ts`'s złożony mechanizm (`COMPOSED_MECHANISM`) jest
realny i live-wired przez `discoveryOrchestrator.ts`, ale
`researchChain.ts` nie ma dla niego aktuatora —
`TEST_WHETHER_MECHANISMS_COMPOSE` nigdy nie jest konsumowany do wyboru
KOLEJNEGO eksperymentu (w przeciwieństwie do strony PARAMETER, gdzie
`NARROW_A_DERIVED_INTERVAL` już to robi). Zamknąć tę ostatnią asymetrię —
ten sam wzorzec co `SEPARATE_SURVIVORS`/`NARROW_A_DERIVED_INTERVAL`, nie
nowa logika.

### QN (Qwen/Kimi) — równoległy recon + przygotowanie gruntu dla C1

**NIE koduje równolegle z C1** — wyłącznie audyt, przygotowanie, i tylko
izolowane, bezkonfliktowe drobne poprawki jeśli są bezpieczne. Dokładny
prompt do wklejenia:

> GENESIS — PARALLEL ACCELERATION AUDIT
>
> Do NOT implement the Real Experiment feature yet and do NOT modify
> architecture unnecessarily.
>
> Your task is to perform a fast repository audit to accelerate C1.
>
> Focus ONLY on:
> 1. Existing Real Experiment contracts/types/functions.
> 2. Current admission/routing path.
> 3. Current UI surfaces where REAL_EXPERIMENTAL data could be entered.
> 4. Existing Prediction → Comparison → Evidence → Memory → Replay infrastructure.
> 5. Provenance propagation and any possible SIMULATED/REAL_EXPERIMENTAL leakage.
> 6. Existing tests that can be reused.
>
> Determine the MINIMUM missing implementation required for:
> Prediction → ExperimentRequest → RealExperimentRun → manual real data entry
> → DerivedData → Comparison → EvidencePackage → Memory → Replay
>
> Do not invent new parallel abstractions if existing ones can be reused.
>
> Produce: exact files involved, existing functions/types to reuse, exact
> missing pieces, recommended implementation order, E2E test scenario,
> risks/edge cases, any fake-data/provenance risks.
>
> If a small isolated preparation change can safely be implemented without
> conflicting with C1, implement it. Otherwise report it only.
>
> Finish with: READY FOR C1: [exact implementation checklist]
>
> Run relevant tests/typecheck after any changes.

Start reading punkty: `docs/GENESIS_DATA_PROVENANCE_AND_REAL_EXPERIMENT_CONTRACT.md`,
`docs/GENESIS_MECHANISM_PERSISTENCE_AND_E2E_CHAIN.md`, `core/experimentFabric/realExperiment.ts`,
`core/agent/discoveryAdmission.ts`, `components/visual-simulation/RealExperimentPipeline.tsx`.

---

## UPDATE — 2026-09-09, noc: C1's Real Experiment E2E — ZAMKNIĘTE

Pierwszy prawdziwy most domknięty i wpięty w realną ścieżkę produkcyjną
(`fce2bde`, zreconciled po kolizji z C2 jako `879ac6e`).

**Kluczowe odkrycie architektoniczne, które zmieniło pierwotny plan**:
audyt (potwierdzony przez research agenta, nie założony) pokazał, że żywa
ścieżka produkcyjna (`WorldDiscoveryPanel` → `runWorldDiscoveryAndRemember`
→ `runAutonomousDiscoveryWithEngines`) to substrat WorldGraph
(`discoveryLoop.ts`), NIE starszy Fabric `hypothesisLoop.ts`/
`scientificDiscovery.ts`, na który pierwotnie celował ten dokument.
WorldGraph nigdy nie importował `ExperimentRun`/`DataProvenance` — zero
seamu na dostarczony realny pomiar wewnątrz autonomicznej pętli, a naiwny
replay (`replaySavedWorldDiscoveryRun`) bezwarunkowo przelicza CAŁĄ pętlę
solverem, co cicho zniszczyłoby wstrzykniętą realną wartość.

**Najmniejsza poprawna zmiana**: Real Experiment NIE wchodzi do wnętrza
autonomicznej pętli (fizycznego pomiaru nie da się zaplanować
autonomicznie w środku). Zamiast tego to osobny krok WERYFIKACJI PO
FAKCIE: bierze ZAMROŻONĄ predykcję (ostatnia runda ukończonego, już
zapisanego `SavedWorldDiscoveryRun`) i porównuje ją z realnym pomiarem —
piąty kształt inwestygacji w `scienceMemory.ts`
(`SavedRealExperimentVerification`, obok `worldDiscovery`/`hypothesisLoop`/
`parameterInquiry`/`mechanismComposition`), zero nowej Pamięci, zero
nowego mechanizmu replay (replay odtwarza WYŁĄCZNIE symulowaną predykcję
przez niezmieniony `runAutonomousDiscoveryWithEngines`, realny pomiar
zamrożony 1:1).

**Druga poprawka architektoniczna w trakcie**: pierwotny plan zakładał
ponowne użycie kryterium ORYGINALNEJ hipotezy (`baseline vs intervention`)
do osądzenia `predykcja vs rzeczywistość` — to źle zadane pytanie (dwie
różne oceny). Poprawka: osobne, jawnie prerejestrowane
`verificationCriterion` (`equal-within-tolerance`, tolerancja deklarowana
PRZEZ CZŁOWIEKA PRZED wpisaniem pomiaru) — reuse `evaluateTwoArmRelation`
(ten sam sędzia co `worldCounterfactual.ts`), zero nowej statystyki, zero
fabrykowanego uniwersalnego progu.

**Kolizja z C2 (uczciwie odnotowana, nie zamieciona)**: C2 niezależnie
zcommitował `3c2317c` (product-copy pass na `RealExperimentPipeline.tsx`,
plus `realExperimentPipeline.test.tsx`) w tym samym ~5-minutowym oknie, w
którym C1 kończył pełne przepisanie tego samego pliku z prawdziwym
wpięciem. Ręcznie zreconciled: zachowano wpięcie C1 (prawdziwy formularz,
prawdziwe wywołania), przyjęto lepsze, prostsze sformułowania C2 dla
tekstów `not-modelled` (gdy `prediction` jest `null`), scalono OBA zestawy
testów w jeden plik (zamiast kolidującego add/add). Zweryfikowane na nowo
po reconciliation: tsc, eslint, testy docelowe (39/39), pełny suite.
Zsynchronizowano z powrotem do gałęzi C2 i C3.

**Zamknięte E2E wymagania** (A–L z promptu C1): symulacja→predykcja
SIMULATED, `RealExperimentRequest`, ręczna `RawMeasurement`→
`REAL_EXPERIMENTAL`, dane niezmienione po porównaniu, jawny werdykt,
proweniencja zachowana w Evidence, zapis do Scientific Memory, restart
sesji odczytuje zapis, replay odtwarza WYŁĄCZNIE symulację (nigdy pomiaru
fizycznego), replay zwraca deterministyczny werdykt, celowy mismatch daje
`FALSIFIED_WITHIN_PROTOCOL`/`DRIFT`, nigdy cichy `MATCH`.

**Znane, świadomie pozostawione ograniczenie**: wielokrotne powtórzenia
(`repetitionsPerArm > 1`) dla jednego realnego ramienia w starszym Fabric
`scientificExecutor.ts` nadal mają znaną lukę w `reproductionVerdict`
(bit-identyczny fingerprint), ale ta ścieżka Fabric pozostaje niewpięta w
żywą produkcję — nie jest to dziś blocker dla tego mostu, który idzie
przez WorldGraph, nie przez Fabric.

Real Experiment E2E jest teraz GOTOWE jako baza dla P2 ("pierwszy
eksperyment na prawdziwych komórkach") — kolejny krok to podłączenie
realnego źródła danych (lab partner) do tego samego kontraktu, nie nowa
architektura.
