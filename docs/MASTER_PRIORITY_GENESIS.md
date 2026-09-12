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

---

## UPDATE — 2026-09-09, strategiczna ocena zewnętrzna (Qwen) — co bierzemy, co odkładamy

Zewnętrzny model (Qwen, bez dostępu do repo — recenzja na podstawie
Knowledge Pack) dał uczciwą, w większości trafną ocenę. Punkt po punkcie,
co robimy z tym realnie:

**Trafne i już się dzieje (nie trzeba nowej decyzji):**
- GAP 3 (Model Update) jako priorytet — ZGADZA SIĘ z tym, co C3 już
  zrobił DZIŚ (`StructuralAlternativeRegistry`, realny rebind
  `domainBinding.solverId` napędzany falsyfikacją — patrz update wyżej).
  Recenzja tego nie widziała (audyt bez repo), ale kierunek był już słuszny
  przed jej przeczytaniem.
- "Jeden killer case zamiast rozproszenia" — real Experiment E2E (ten
  update) to PIERWSZY krok w tę stronę: most Prediction→Real
  Data→Comparison→Evidence→Memory→Replay jest teraz architektonicznie
  gotowy na PIERWSZY prawdziwy przypadek z realnym partnerem/danymi, nie
  kolejną domenę symulacyjną.

**Trafne, wymaga decyzji NIE-inżynierskiej (biznes/partnerstwo)** — poza
zakresem tego, co C1/C2/C3 mogą rozstrzygnąć w kodzie:
- "Evidence & Replay Platform jako pierwszy produkt" (B2B, nie "AI
  Scientist") — pozycjonowanie produktowe, decyzja użytkownika/zarządu.
- "Partnerstwo z istniejącym labem zamiast budowy własnego" — biznes
  development, poza tym repo.
- Te dwa punkty ZOSTAJĄ przy użytkowniku do decyzji; architektura (ten
  update + Real Experiment Contract) już nie blokuje żadnej z tych ścieżek
  — `RealExperimentRequest`/`physicalProtocolRef` jest zaprojektowany tak,
  by przyjąć DOWOLNY realny protokół pomiarowy bez przebudowy.

**Trafne, świadomie odłożone teraz, przekazane QN (Qwen) jako izolowane
zadanie budowlane** (patrz sesja czatu z użytkownikiem — QN nie ma
dostępu do repo, więc dostaje samodzielną specyfikację modułu, nie audyt):
- GAP 7 (Literature intelligence & novelty detection) — jedyna luka z
  listy Qwen, która NIE koliduje z aktywną pracą C1 (Real Experiment,
  zamknięte) ani C3 (Mechanism Composition/researchChain, w toku), więc
  jest bezpieczna do przekazania równoległemu agentowi bez ryzyka
  konfliktu (patrz precedens kolizji C1/C2 na `RealExperimentPipeline.tsx`
  wyżej — trzymamy się od tego z daleka).

**Zasada dla wyniku QN, zanim trafi z powrotem do repo**: żadnego
fabrykowanego cytowania, żadnej fałszywej "noveltyScore" bez jawnej
formuły, honest `NOT_MODELLED`/capability-seam tam gdzie QN nie ma
realnego dostępu do API literatury — dokładnie ta sama dyscyplina co
Real Experiment Contract. C1 audytuje i wpina wynik dopiero po weryfikacji
zgodności z tą zasadą, nigdy automatycznie.

### ⚠️ UWAGA — wynik QN (Multi-Model Tournament) trafił przypadkowo bezpośrednio do C3

Użytkownik przez pomyłkę wkleił output Qwena (moduł Multi-Model
Tournament, zadanie zlecone przez C1 w sesji czatu) bezpośrednio do C3,
z pominięciem audytu C1. **C3: jeśli budujesz/commitujesz cokolwiek na
podstawie tego outputu, PRZED commitem sprawdź samodzielnie dokładnie te
same warunki, które C1 zlecił Qwenowi audytować:**
- żaden "confidence score"/"tournament rating" bez jawnie zapisanej
  formuły (zero Elo, zero wag znikąd),
- cykl w relacji zgody (A zgadza się z B, B z C, A NIE zgadza się z C)
  musi dać `INCONCLUSIVE_CYCLE`, nigdy wymuszonego zwycięzcy — sprawdź
  testem na fixture, który realnie konstruuje taki cykl,
- < 2 ukończone porównania → zawsze `INCONCLUSIVE_INSUFFICIENT_DATA`,
- reuse WYŁĄCZNIE istniejącego kontraktu `ModelVsModelComparison`/
  `ModelAgreementVerdict`/`verdictOf` z `core/experimentFabric/
  modelVsModelCompare.ts` — zero nowego równoległego enuma/typu.

Jeśli C3 już to zcommitował PRZED przeczytaniem tej notatki: C1 i tak
przejdzie przez to przy najbliższej synchronizacji gałęzi (standardowa
dyscyplina tej sesji — każdy commit z drugiej gałęzi jest inspekcjonowany
`git show --stat` + bezpieczeństwo cyber/gov PRZED cherry-pickiem do
`main`), więc nic nie wejdzie do `main` bez tego audytu — ale lepiej
zamknąć to świadomie niż czekać na przypadkowe złapanie.

---

## UPDATE — 2026-09-12, C3: domknięcie listy + status od ostatniego wpisu (2026-09-09)

**Dlaczego ten wpis istnieje**: ten dokument nie był aktualizowany od
2026-09-09, mimo że w tym czasie zamknięto sporo z listy powyżej —
status żył wyłącznie w osobnych sesjach czatu per-agent (C1/C2/C3), nie
tutaj. Poniżej domykam to, co faktycznie zamknięte, zgłaszam co zostało
zweryfikowane, i zapisuję nowy kontekst (deadline/freeze), żeby C2, Qwen
i każda przyszła sesja miały to z jednego miejsca, nie tylko C1 w swoim
wątku.

### 1. Zamknięte formalnie: C3 — Mechanism Composition / researchChain actuator

Przydział z sekcji "C1/C3/QN" wyżej (linia ok. 147) — **ZAMKNIĘTE**,
commit `bbdc0a90`/`5051e25d` ("MECHANISM composition reaches
researchChain, plus the killer case on the generator domain"). Ten sam
wzorzec co `NARROW_A_DERIVED_INTERVAL` po stronie PARAMETER, bez nowej
logiki wyboru. Wszystkie trzy równoległe ścieżki z sekcji "wieczorny
sprint" (C1 Real Experiment E2E, C3 researchChain actuator, QN recon) są
teraz zamknięte.

### 2. Ostrzeżenie o przypadkowym handoffie Qwen→C3 (Multi-Model Tournament) — NIEAKTUALNE, zamykam

Sprawdziłem repo: **żaden N-way tournament / cycle-detection kod nigdy
nie wylądował**. Jedyny istniejący kontrakt to pre-istniejący, PARowy
`core/experimentFabric/modelVsModelCompare.ts` (Model A vs Model B,
commit `ea22c8bd`/`99d43172`, 2026-09-04 — sprzed tego ostrzeżenia, więc
to NIE jest ten output). Ostrzeżenie z 2026-09-09 dotyczyło ryzyka, które
się nie zmaterializowało — zamykam bez żadnej akcji kodowej.

### 3. Audyt WorldRegistry → Construct → City 4.0 (zlecony osobno) — domknięty przez REALNĄ implementację

Mój wcześniejszy audyt na checkpoint `44438afb` dał **REFUTED**: "Genesis
Construct" wtedy nie istniał nigdzie w repo. Od tego czasu ktoś go
zbudował realnie (`a435ac63`, "Genesis Construct: deterministic staging
layer, integrated into the real City 4.0 screen") — **właśnie
zweryfikowałem ten commit**, bo zostawiłem go sobie jako otwarty wątek:
- Adresuje dokładnie ryzyko, które sam bym flagował: WorldRegistry miał
  jednego konsumenta (`genesisScientificCity4.ts`) — Construct dostał
  realnego konsumenta W TYM SAMYM commicie
  (`GenesisWorldSim3D`/`GenesisWorldScreen.tsx`), zamiast zostać drugim
  osieroconym subsystemem.
- Zero nowego słownika epistemicznego — `epistemicStatus` jest
  nieinterpretowanym stringiem przechodzącym przez Construct, nie nową
  7-wartościową taksonomią równoległą do istniejącej.
  `scenarioCapsule.ts` pozostaje osobne (replay gotowych artefaktów, nie
  loader ze stanem LOADED/EMPTY).
- Reużywa fingerprint z `worldGenerator.ts` (`paramsHash`) — zero nowego
  schematu fingerprintu.
- **Spot-check wykonany teraz, na bieżącym tip gałęzi**: `construct.test.ts`,
  `constructGenesisScientificCity4.test.ts`,
  `genesisWorldScreenFirstPerson.test.ts`,
  `genesisWorldScreenPostProcessing.test.ts` → **74/74 zielone**.
- Solar Twin (deklarowany następny konsument Construct) świadomie NIE
  rozpoczęty w tym commicie — zgodne z poniższym freeze.

### 4. Nowy kontekst od ostatniego wpisu: 24–48h deploy + grant freeze, Solar Twin zamrożony

Nie zapisane dotąd nigdzie poza czatem — zapisuję teraz, żeby nie zginęło:
**Solar Twin jest jawnie zamrożony** (potwierdzone niezależnie w dwóch
miejscach: instrukcja przy `a435ac63` wyżej, i osobne zlecenie do C3 z
tym samym zdaniem wprost: "Solar Twin zamrożony"). W tym oknie **zero
nowych systemów** — wyłącznie dostrajanie/audyt/hardening istniejącego.

**LiveMatrixBackground — tło dekoracyjne, teraz w produkcji**, ciąg
commitów od zbudowania do weryfikacji:
1. `75d2e3c6` — zbudowane i przetestowane jako czysty, wyizolowany
   moduł (37 testów lifecycle'u), NIEwpięte.
2. `12e312d9` (C3) — `deriveGenesisVisualState()`: kalibracja realny stan
   Genesis → poziom aktywności tła (Home/pusta Memory = IDLE najspokojniejszy,
   realny Campaign `status==='running'` = RUNNING najbardziej żywy), plus
   eksport `SUPPRESSED_ROUTES`/`isSuppressed` z `MatrixDataStream.tsx` do
   reużycia.
3. `2e25cd18` (C1) — realne wpięcie w `App.tsx` przez adapter, plus
   uzupełnienie luki w `SUPPRESSED_ROUTES` (`#/genesis-world` brakowało).
4. `6837ff98` (C1) — dwa zmierzone (nie "na oko") defekty widoczności
   naprawione: strumienie generowane od razu w kadrze zamiast 1.6 wysokości
   ekranu nad nim, i próg `intensity` podniesiony powyżej granicy
   wyłączającej glow całkowicie. 35 920 zapalonych pikseli @1440×900 po
   naprawie (zmierzone, nie deklarowane).
5. **C3, pełny visual QA przed deployem** (ten wpis dokumentuje wynik dla
   C2/Qwen, nie tylko dla C1, który dostał to wcześniej w czacie): realny
   Chromium, desktop 1440×900 + mobile 420×860, 26 tras × 2 viewporty = 52
   kombinacji. Zero błędów konsoli, zero horizontal overflow, tło poprawnie
   obecne/nieobecne zgodnie z `SUPPRESSED_ROUTES` na każdej kombinacji.
   Znaleziona i wyjaśniona pozorna regresja: Home w tym headless sandboksie
   mierzy ~10 fps — zbadane CPU-profilerem (CDP), przyczyna to
   `GenesisCommandCenterHero` (WebGL) renderowany programowo przez
   SwiftShader (sandbox nie ma prawdziwego GPU: `ANGLE ... SwiftShader
   Device`), NIE Matrix (własny koszt renderowania Matrixa: 0,7–1,3 ms/klatkę;
   `#/campaign` z tym samym tłem = pełne 60 fps). Potwierdzone A/B na
   commicie SPRZED wpięcia Matrixa (`6d070cb0`): Home już wtedy mierzył
   ~12 fps. **Wniosek: nie regresja, nie do naprawy na tej gałęzi** — do
   zweryfikowania na prawdziwym sprzęcie z GPU przed komisją, poza
   zakresem tego zadania.

**Inne prace C3 od 2026-09-09, nigdzie wcześniej nie zapisane tutaj**:
CSRN v4 (`8b568012`→reconciliation `d0ef51fa`/`f74914a4`, dokumentacja
kontraktu podpisu w `4a4052e8`), P0.2 belief persistence + hardening
(`94a0e431`, `44438afb` — realny test przetrwania restartu procesu na
plikowym SQLite, nie mocku), World/City generator provenance completeness
(`templateIds`/`levelOfDetail` w `world.generation.completed`, część
`44438afb`), Earth Observatory jako pozycja backlogu post-grant w
`VISION-BACKLOG.md` (`35a6d481` — bez implementacji, tylko zmapowane
istniejące punkty rozszerzenia).

### 5. Stan bramki jakości w chwili tego wpisu (branch tip `35a6d481`)

tsc: czysto. Frontend: 458/458 plików, 4992 passed / 1 skip (znany,
niezwiązany flake w innym miejscu). Backend: 362 passed / 0 failed / 34
skipped. Build: czysto.

### 6. Co zostaje otwarte (żadnego nowego zadania nie zamykam sam z siebie)

- Weryfikacja realnego FPS Home/scen 3D na sprzęcie z prawdziwym GPU przed
  komisją — niemożliwa do wykonania z tego sandboksa.
- Freeze (zero nowych systemów, Solar Twin zamrożony) pozostaje w mocy do
  odwołania — ten wpis go nie kończy, tylko dokumentuje.
- Priorytet 3 (Product/Funding Readiness, sekcja wyżej) w praktyce JEST
  tym, czym jest ten freeze (przygotowanie do dema/deployu/grantu) —
  wart jawnego nazwania, jeśli ktoś wraca do tego dokumentu i zastanawia
  się, czy Priorytet 3 wciąż czeka.

### 7. Dodatkowy re-check: trzy moduły oznaczone wcześniej jako "ryzyko osieroconego subsystemu" (przy okazji audytu Construct)

Commit `a435ac63` wymieniał `evidenceUri.ts`, `core/governance/` i
`generateAlternativeHypotheses` jako wcześniej znalezione ryzyka
osieroconych modułów. Sprawdziłem realnych konsumentów na bieżącym tip:

- `evidenceUri.ts` — MA realnych konsumentów (`ExperimentPilotScreen.tsx`,
  `core/experimentFabric/index.ts`, `core/csrn/genesisCertificateAdapter.ts`)
  — nieosierocony.
- `generateAlternativeHypotheses` — MA realnych konsumentów
  (`core/experimentFabric/objectiveReducer.ts`,
  `core/worldModel/discovery/worldCounterfactual.ts`) — nieosierocony.
- `core/governance/` — zero konsumentów poza sobą. To jednak ZGODNE z
  regułą już zapisaną w sekcji "Zasady wykonania" wyżej ("Cyber/GOV
  pozostaje OFF `main`") — świadomie odizolowany, nie bug. Zero akcji.

Wszystkie trzy zamknięte/potwierdzone — żadnego realnego osieroconego
modułu nie znaleziono.

### 7b. Korekta do sekcji 7: jeden realny osierocony moduł jednak istniał — `core/agent/domeWorld/`

Sekcja 7 sprawdziła trzy moduły wskazane w audycie Construct i zamknęła
temat wnioskiem „żadnego realnego osieroconego modułu nie znaleziono". Ten
wniosek był poprawny dla tych trzech, ale nie dla repo: sweep nie objął
`core/agent/domeWorld/`, który miał **zero konsumentów produkcyjnych** —
kompletny, przetestowany i całkowicie niewidoczny dla użytkownika.

Moduł liczy, co przewiduje model płaskiego dysku z lokalnym słońcem i
kopułą, i sądzi te przewidywania przeciw cytowanym pomiarom przez ISTNIEJĄCY
pipeline REFERENCE (`createReferenceMeasurementRun` +
`verifyPredictionAgainstRealExperiment`) — ten sam, którego
`RealExperimentPipeline.tsx` używa dla ręcznie wprowadzonego cytowania:

- `shadow_angle_degrees` — kopuła przewiduje 9,09°, Eratostenes 7,2° ± 0,5°
  (Kleomedes, ~240 p.n.e.) → `FALSIFIED_WITHIN_PROTOCOL`
- `horizon_distance_km` — kopuła przewiduje 100 km, geodezja 4,65 km ± 0,2
  (d = √(2Rh+h²), potwierdzone obserwacją hull-down) → `FALSIFIED_WITHIN_PROTOCOL`

Podpięte jako `#/dome-world` (commit `2a92cd5`). Ekran nic nie liczy i nie
wydaje własnego werdyktu — renderuje to, co zwrócił pipeline; tolerancja
każdego kryterium to własna niepewność cytowania. Suwak wysokości słońca
istnieje po to, żeby czytelnik mógł przemieść jedyny wolny parametr modelu
po całym zakresie i sam zobaczyć, że żadna wartość go nie ratuje — różnica
między „aplikacja twierdzi" a „możesz sprawdzić".

Wniosek dla przyszłych sweepów: sprawdzanie listy modułów wskazanych przez
wcześniejszy audyt nie jest tym samym co sprawdzenie repo. `domeWorld`
nie był na żadnej liście, bo nikt go nie podejrzewał.
