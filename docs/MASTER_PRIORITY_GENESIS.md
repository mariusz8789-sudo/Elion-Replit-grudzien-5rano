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

### 8. Mechaniczny sweep osiągalności — 44 moduły osierocone, 5 podpiętych, 1 usunięty

Wniosek z 7b („sprawdzenie listy nie jest sprawdzeniem repo") został zamieniony
na narzędzie. `packages/frontend/src/__tests__/moduleReachability.test.ts`
przechodzi realny graf importów z `main.tsx` i **wywala się na KAŻDYM nowym
module nieosiągalnym z aplikacji**. Testy nie są punktem wejścia — bycie
osiągalnym wyłącznie z własnego testu to dokładnie kształt `domeWorld`:
zielony, udowodniony, niewidoczny.

Stan po tej sesji: **622 z 657 modułów produkcyjnych osiągalnych** (35 w allowliście).

Allowlista NIE jest listą wyciszeń. Każdy z 44 wpisów niesie powód, dla
którego moduł jest osierocony **zasadnie**, a drugi test odrzuca powody-
zaślepki (za krótkie, `TODO`). Test wywala się także wtedy, gdy moduł z
allowlisty STAJE SIĘ osiągalny — bez tego lista zgniłaby w fikcję. Ten
mechanizm zadziałał trzy razy w trakcie tej sesji (`beliefChangeRun.ts`,
`modelVsModelCompare.ts`, `protectionPriority.ts`).

Pułapka warta zapamiętania: sweep, który dopasowuje tylko `from '...'`, gubi
`import './labs/index';` — a tak ładuje się CAŁY rejestr 23 eksperymentów.
Pierwsza wersja raportowała więc każde laboratorium jako sierotę. Fałszywy
alarm tej klasy zabija wiarygodność takiego testu przy pierwszym uruchomieniu.

#### Podpięte w tej sesji (każde zweryfikowane realnym Chromium)

1. **Trwały zapis świata** — backend serwował `POST/GET/PUT /api/worlds` z
   własnym zielonym testem („survives a real process restart"),
   `worldSnapshot.ts` i `worldPersistenceClient.ts` były kompletne i
   przetestowane, a przeglądarka nie wołała NICZEGO z tego. Zbudowane na obu
   końcach, połączone na żadnym. `GenesisWorldScreen` (jedyny ekran trzymający
   żywy `TemporalEngine`) zapisuje i odczytuje przez nie. Zmierzone: 2 ticki →
   zapis → `GET /api/worlds` zwraca świat z realną specyfikacją → odczyt
   round-trip zgodny co do liczby (tick 2 = żywy 2, 27 encji = 27, 16 zdarzeń
   = 16). ZAKRES POWIEDZIANY W UI: zapisywana jest gałąź BAZOWA (fork sceny
   powstaje przez `engine.forkBranch`, nie przez `WorldRegistry.fork`, więc nie
   ma własnego `worldId` — wymyślenie go byłoby wymyśleniem tożsamości, której
   model świata nigdy nie wydał), a ścieżka odczytu mówi wprost, że scena 3D
   nadal pokazuje świat żywy.

2. **„Dlaczego zmieniło się przekonanie"** na `#/pilot` — `explainWhyBeliefChanged`
   to czysta, synchroniczna połowa `beliefChangeRun.ts`; nic nie przelicza i
   nic nie wnioskuje. Ekran pokazywał CO rozstrzygnięto i nigdy CO SIĘ
   ZMIENIŁO. Zmierzone na realnym przebiegu wzrostu logistycznego: 8 realnych
   runów, obie hipotezy PREREGISTERED → SUPPORTED, fractionOfCapacity 80,2957
   vs 16,8665. „Żadna hipoteza nie zmieniła statusu" jest renderowane jako
   własny, uczciwy wynik.

3. **Stan epistemiczny + zasięg dowodu** na `#/matrix` —
   `buildEpistemicStateGraph` bierze dokładnie te dane, które ekran już miał, i
   dokłada jedyną rzecz, której graf relacji nie niesie: status WYPROWADZONY z
   realnych pól, z regułą wyprowadzenia obok niego (status, którego nie da się
   sprawdzić, to etykieta, nie klasyfikacja). `computeEvidenceImpact` odpowiada
   na pytanie, na które lista relacji odpowiedzieć nie może: co jeszcze się
   sypie, jeśli ten rekord jest błędny (przechodnio, po siedmiu realnych polach
   referencyjnych).

4. **Turniej modeli** na `#/conflict` — `counterfactualCompare.ts` jawnie
   odmawia porównania dwóch różnych `modelId` i NAZYWA protokół, który to robi.
   `modelVsModelCompare.ts` JEST tym protokołem i nikt go nie wołał. Osobny
   panel obok `ModelConflictPanel` (tamten czyta zapisane korelacje MCRE, ten
   URUCHAMIA dwa modele) — przepisanie jednego na kształt drugiego byłoby
   przeetykietowaniem realnego wyniku. Zmierzone: v/c=0,02 → Newton
   0,000102200 MeV vs Einstein 0,000102231 MeV (ZGODNE); v/c=0,99 → 0,25042 vs
   3,1114 MeV (ROZBIEŻNE), najbardziej rozróżniający eksperyment v/c=0,99.

5. **„Kogo chronić najpierw?"** jako `#/protection-priority` —
   `protectionPriority.ts` uruchamia każdy wariant ochrony jako osobną, w pełni
   udowodnioną sprawę i podaje ranking OSOBNO dla każdego z 8 celów. Zmierzone
   (260 agentów, 60 dni, ziarno 4242, 523 ms, 3/3 kandydatów DOPUSZCZONYCH z
   replay MATCH): przy profilu ilustracyjnym wszystkie cele wskazują
   PROTECT_ADULTS, przy neutralnym pojawia się REALNA rozbieżność —
   `deaths_adult → PROTECT_SENIORS` przy `PROTECT_ADULTS` we wszystkich
   pozostałych. To jest sedno modułu i do tej pory nikt nie mógł tego zobaczyć.

6. **Wolnotekstowe „dlaczego?"** na `#/campaign` — `campaignWhyIntent.ts` mapuje
   zdanie na jeden z 9 realnych rodzajów WHY, które backend już serwuje z
   utrwalonych danych kampanii. TRZY z tych dziewięciu (`status`,
   `stage-selection`, `conflict`) nie mają na tym ekranie żadnego przycisku,
   więc były nieosiągalne w ogóle. Gdy nic nie pasuje, ekran ODMAWIA zamiast
   podstawiać domyślny rodzaj.
   Zweryfikowane na REALNEJ kampanii (konto lokalne, projekt, orchestrator na
   RDKit 2026.03.6, aspiryna, 2 generacje, 20 kandydatów → STOP_RESOURCE_LIMIT):
   „dlaczego kampania się zatrzymała?" → realna odpowiedź z frontem Pareto
   `CC(=O)Oc1c(C(=O)O)ccc(Cl)c1Cl`; „jaka jest dzisiaj pogoda" → odmowa.
   PRZY OKAZJI ZŁAPANY REALNY BŁĄD: pierwsza wersja podpowiadała przykład
   „dlaczego stop", którego gramatyka NIE akceptuje. Ekran podpowiadający
   frazy odrzucane przez własny parser uczy użytkownika, że funkcja nie
   działa. Teraz test przepuszcza przez parser każdy przykład pokazywany w UI.

7. **Fotony wokół czarnej dziury** jako `#/geodesics` —
   `relativityGeodesic.ts` całkuje równanie geodezyjnej zerowej
   `d²u/dφ² = −u + (3/2)·r_s·u²` (RK4) jako realny `DomainSolver`, bit w bit
   zgodnie z runnerem Labs. Ekran nic nie całkuje: czyta publikowane pozycje i
   dzieli je przez własny, jawny współczynnik solvera (test pilnuje, że w
   komponencie nie ma ani trygonometrii, ani wywołania integratora).
   Zmierzone (259 ms, 5 fotonów): b/b_crit 0,70 → POCHŁONIĘTY (min 1,0083 r_s),
   0,90 → POCHŁONIĘTY, 1,01 → UCIEKŁ ocierając się o 1,6369 r_s przy 1,155
   okrążenia, 1,30 i 1,80 → UCIEKŁY. Granica b_crit = 3√3/2 ≈ 2,5981 r_s jest
   stałą zamkniętą, więc wykres można sprawdzić z podręcznikiem — ten sam
   standard co falsyfikacja kopuły.

8. **„Zaproponuj świat"** jako `#/world-proposal` — `llmWorldProposalAdapter.ts`
   pyta realny backend `/api/world-proposal`, `resolveWorldProposal.ts` składa
   go z torem deterministycznym. Zdanie NIE jest po cichu zamieniane na
   przełączniki planu awaryjnego: deterministyczny proposer celowo nie rozumie
   języka naturalnego, więc ekran prosi o jedno i drugie i mówi dlaczego (test
   pilnuje, że komponent nigdy nie dotyka `prompt.includes/match/toLowerCase`).
   Zmierzone: POST → 503, tor DETERMINISTYCZNY FALLBACK, powód `no-key`
   wypisany dosłownie obok zdania „nie udajemy, że wymyślił go model";
   zbudowany świat: walidacja OK, 25 encji, realne solvery
   chemistry-kinetics / epidemiology / hydraulics-engineering.
   To 503 JEST działającą funkcją, nie usterką.

9. **Kalibracja parametru** jako `#/calibration` i **autonomiczne dochodzenie**
   jako `#/inquiry` — istniały TRZY przetestowane strategie
   (`discoveryStrategies.ts`: MECHANISM, PARAMETER, CALIBRATION), a produkcja
   uruchamiała wyłącznie MECHANISM, na sztywno wpiętą w katalog powodziowy.
   Teraz uruchamiane są wszystkie trzy.
   Świat ma UKRYTĄ wartość, agent jej nie dostaje, a ekran porównuje dopiero po
   przebiegu:
   - okres zakaźności 7,5 dnia → agent czyta dzień 2, potem dzień 45 → ODZYSKANY
     (66 ms); przy 6 dniach czyta dzień 2, potem dzień 30 → ODZYSKANY (43 ms).
     Inna prawda, inny moment pomiaru — to jest ta zdolność.
   - złącze kwantowe (bariera 1,2, szerokość 2,5) → E=1,3 nie rozróżnia niczego
     (wszystkie cztery SUPPORTED), agent schodzi do E=0,4 → ODZYSKANY (1352 ms).
   - zwijanie białka (T=1,2) → 200 kroków daje 0,1300 dla każdego kandydata
     (podłoga algorytmu), agent wydłuża przebieg i kończy na
     NO_DISCRIMINATING_PROBE z h:warm i h:hot przy życiu → ZAWĘŻONE,
     NIEROZSTRZYGNIĘTE. Moduł sam to ograniczenie deklarował; ekran mówi to
     wprost, zamiast podawać dwóch ocalałych jako odpowiedź.
   JEDEN RAPORT NA TRZY STRATEGIE: `StrategyRunReport.tsx`. Wszystkie trzy
   zwracają ten sam kontrakt `StrategyRun`, więc druga tabela rund byłaby drugą
   opinią o tym, co znaczy przebieg — wolną, żeby się rozjechać z pierwszą.

#### Usunięte

`components/MissionStatusBar.tsx` wraz z jego CSS `.mission-bar`. Jego własny
komentarz mówił, że został wydzielony, „żeby Genesis Command Center mógł go
reużyć bez drugiej implementacji tego samego statusu" — Command Center
zbudował drugą implementację mimo to. `GenesisCommandCenterHero.tsx` renderuje
wszystkie cztery te same fakty z tych samych źródeł i to jego montuje
`App.tsx`. Zero importerów, zero testów. Zdublowany, wyparty moduł to dokładnie
to, czego reguły tego repo zabraniają trzymać.

#### Co zostaje otwarte (nie zamykam sam z siebie)

Największa grupa w allowlist to **kompletna, przetestowana nauka zablokowana za
NAZWANYM brakiem**, nie za zapomnieniem — i to jest realny materiał na kolejne
zadania dla C2/C3/Qwen, każde z gotowym, zielonym rdzeniem:

- `discoveryTrace.ts` — konsumuje `ResearchChainResult` (łańcuch PARAMETER), a
  produkcja uruchamia wyłącznie `runMechanismResearchChain` (inny typ).
- `moleculeWorldAdapter.ts`, `particleWorldAdapter.ts` — 2. i 3. domena dowodu,
  że kontrakt `WorldState` jest ogólny; ta druga czeka na `DivergenceSweepResult`.
- `spatialWorldFrame.ts` + `spatialFeatureBridge.ts` — most OSM → renderer
  kanoniczny, zablokowany brakiem wejścia z realnymi, licencjonowanymi danymi.

Reszta allowlisty to świadome decyzje (Sovereign OFF), kod nie-przeglądarkowy
(`.node.ts`, `serverEntry.ts`), wykonywalna dokumentacja (`graphics/examples/`),
barrele oraz prymitywy (odciski, steppery), których brak konsumenta nie jest
defektem — odcisk nigdy nie jest tematem ekranu.

---

## UPDATE — 2026-09-12, C1: QE1 → QE2 → QE3 przeszły pełny cykl w prawdziwym StrategyRun

**Status: E2E VERIFIED** (wykonanie, nie inspekcja — tabele niżej pochodzą z
przebiegów, nie z założeń).

Polecenie brzmiało: wciągnąć QE1–QE3 do research-loop jako **prawdziwe
StrategyRun**, w kolejności QE1 → QE2 → QE3, z obowiązkowym cyklem
hypothesis → prediction → experiment → independent expected result → execution →
falsification verdict → belief update → next question. Bez QE4–QE7, dopóki
pierwsza trójka nie przejdzie tego end-to-end.

Nie powstała żadna druga pętla, żaden drugi silnik i żaden „Entanglement Lab"
jako osobna wyspa. Powstały **trzy systemy pod badaniem** na istniejącej
strategii PARAMETER (`parameterStrategy` → `inquiryLoop`), na zarejestrowanym
modelu Fabric `quantum-entanglement-measures`. Cała arytmetyka pochodzi z
`entanglementMeasures.ts`, wszystkie decyzje z `inquiryLoop.ts`.

### Co dodano (i dlaczego akurat tyle)

1. **Dwie realne gałki preparatyki** w modelu Fabric (1.0.0 → 1.1.0):
   - `whiteNoise` — kanał depolaryzujący ρ → (1−w)ρ + w·I/d. To jedyna gałka,
     którą eksperymentator naprawdę kręci: jakość przygotowania źródła.
   - `mixingAngleDeg` — domieszka |W⟩ do uogólnionego GHZ.
   Bez drugiej liczbowej gałki nie ma inquiry: pętla wymaga ukrytego parametru
   ORAZ sondy, a model miał wcześniej tylko jedną liczbę.
2. **`SystemUnderStudy.fixedParameters`** poszerzone z `number` na
   `ExperimentValue`. Preset stanu (`stateId`) to napis — dokładnie jak
   sekwencja bramek w `quantum-bloch-circuit`. Ukryte parametry i sonda
   pozostają ściśle liczbowe, więc arytmetyka pętli się nie zmienia.
3. **`agent/entanglementInquiry.ts`** — trzy systemy, ich ukryte prawdy,
   hipotezy konkurencyjne i pasma zgodności. Zero miar, zero solverów, zero
   pętli.
4. **Ucięcie pyłu numerycznego** (`NUMERICAL_ZERO = 1e-12`) na wyjściach
   runnera. To nie kosmetyka: zmierzone, na `ghz-w-family` przy α = 90° surowa
   reszta trójsplotu wraca jako −1,776e-15 dla θ = 20° i −6,661e-16 dla θ = 70°.
   Pętla sądząca predykcje względem pomiaru na tej metryce **sfalsyfikowałaby
   wszystkich kandydatów w pierwszej rundzie** na podstawie szumu
   zmiennoprzecinkowego. Strażnik przeżywa: realne złamanie monogamii byłoby
   rzędu 0,1–1, a `checkCKWMonogamy` dalej zwraca resztę nieuciętą.

### Co pętla naprawdę zrobiła

**QE1 — widzialność źródła. STOP: NO_DISCRIMINATING_PROBE, dwóch ocalałych.**
Otwarcie przy w = 1: max CHSH dokładnie 0 dla wszystkich czterech kandydatów,
pewność nie drgnęła (magnituda dowodu 0). Runda 2 przy w = 0,9 wybrana regułą
`DISCRIMINATES_OTHER_PAIR` — pętla jawnie powiedziała, że ten pomiar NIE
rozstrzyga sporu dwóch najsilniejszych, tylko zawęża pole: padły `h:marginal`
(0,20365 vs zmierzone 0,26022) i `h:classical` (0,14142). Potem odmowa.
**Odmowa jest strukturalna, nie pechowa**: max CHSH = 2√2·(1−w)·p, więc sonda
mnoży każdą predykcję przez ten sam czynnik, stosunek 1,00/0,92 = 1,087 jest
stały przy KAŻDYM ustawieniu i mieści się w zadeklarowanym paśmie ±15%. Pętla
odkryła, że **szum biały to zła gałka do tego pytania** — i to jest wynik.
Pasmo zadeklarowano na ±15% świadomie i jest to zapisane w module: przy ±5%
inquiry odzyskałoby p = 0,92 w jednej rundzie. Trudniejszy wynik jest
uczciwszy, więc został wybrany i opisany, a nie ukryty.

**QE2 — monogamia CKW. STOP: NO_CONTENDERS_LEFT, ODZYSKANE θ = 70°.**
Trzy rundy, bo dwie nie wystarczyły:
| α | θ=20° | θ=35° | θ=45° | θ=55° | θ=70° |
|---|---|---|---|---|---|
| 90° (otwarcie) | 0 | 0 | 0 | 0 | 0 |
| 0° (czysty GHZ) | 0,41318 | 0,88302 | 1,00000 | 0,88302 | 0,41318 |
| 15° | 0,37731 | 0,79826 | 0,90698 | 0,81092 | 0,40813 |
Najsilniejszy sygnał w rodzinie (czysty uogólniony GHZ, τ₃ = sin²2θ) jest
**symetryczny względem 45°**, więc zostawia θ = 20° i θ = 70° remisujące co do
1e-15 — prawdziwa degeneracja rodziny stanów, nie artefakt. Pętla sięgnęła
poza oś, po α = 15°, gdzie |W⟩ interferuje z |000⟩ i nie z |111⟩, symetria
pęka, i sfalsyfikowała θ = 20°.

**QE3 — zakres kryterium PPT. STOP: NO_CONTENDERS_LEFT, ODZYSKANE a = 0,4.**
Każdy z czterech kandydatów jest PPT (negatywność 0), więc partial transpose
nie rozstrzygnąłby niczego; całe dochodzenie jedzie na drugim, niezależnym
kryterium (CCNR). Zmierzony margines przy w = 0: 0,003031 / 0,002716 /
0,001884 / 0,000941 dla a = 0,2 / 0,4 / 0,6 / 0,8. **Zmierzony wynik uboczny,
który jest realnym odkryciem tego przebiegu:** margines spada do zera już przy
w = 0,005 — pół procenta szumu białego niszczy jedyny dowód, jaki istnieje na
splątanie związane. Dlatego wszystkie ustawienia sondy poza w = 0 są
bezużyteczne, a pętla musiała to odkryć sama.

### Czego NIE zrobiono i dlaczego (najważniejszy punkt)

**QE1 NIE testuje granicy Tsirelsona i jest to zapisane w module.** Uruchomienie
kalkulatora mechaniki kwantowej i stwierdzenie, że nie widać |S| > 2√2, jest
tautologią, nie dowodem: granica jest wbudowana w algebrę, którą model liczy,
więc model nie może wyprodukować kontrprzykładu. Hipoteza o źródle
nadkwantowym jest tu **nierozstrzygalna**, a nie sfalsyfikowana — i tak jest
raportowana. To samo dotyczy QE2: nierówność CKW jest twierdzeniem tej algebry,
ujemna reszta falsyfikowałaby implementację, nie twierdzenie.

QE4–QE7 nie ruszone, zgodnie z poleceniem.

### Weryfikacja

`npx tsc --noEmit` czysto; `npx eslint src --max-warnings=0` czysto;
`entanglementInquiry.test.ts` 21 testów zielonych (asercje na DECYZJE pętli:
która sonda, która reguła wyboru, który werdykt, który stop);
`moduleReachability.test.ts` + `orphanModuleWiring.test.ts` 62 zielone — nowy
moduł jest osiągalny z `main.tsx`, bo QE1–QE3 są w `#/inquiry` obok złącza
kwantowego i zwijania białka, w tym samym `StrategyRunReport`.

### Podział pracy po QE1–QE3 (C1 → C2 / C3 / Qwen)

Kolejność wynika z macierzy priorytetów planu master, nie z wygody. Każde
zadanie ma ZIELONY rdzeń i nazwany brak — żadne nie jest „zbuduj coś nowego".

**C3 — G3: kotwica anty-HARKing w prerejestracji (P0, jedyne P0 na liście).**
`experimentFabric/hypothesisLoop.ts:299` ustawia `createdBeforeRun: true`
BEZWARUNKOWO, a odcisk (`:301-305`) nie zawiera ani `createdAt`, ani żadnego id
/odcisku przebiegu. Rekord dowodzi więc tylko „ten tekst nie zmienił się od
zahaszowania" i nic o tym, KIEDY powstał względem danych: sekwencja
`uruchom → zobacz wyniki → napisz candidateValues → prerejestruj → wykonaj`
daje rekord bit-identyczny i „nienaruszony". Zakres: do odcisku wchodzi kotwica
(znacznik czasu prerejestracji + odcisk stanu świata/przebiegu, który
prerejestracja poprzedza), `createdBeforeRun` przestaje być literałem i staje
się czymś, co da się PODWAŻYĆ. **Test najpierw, na czerwono**: napisz test,
który udaje HARKing (prerejestracja po zobaczeniu wyników) i pokaż, że dziś
przechodzi. Nie dodawaj scoringu ani niczego z G5 — repo słusznie tego odmawia.

**C2 — G6: kanoniczny słownik epistemiczny + warstwa zgodności (P1).**
`scienceMemory.ts:267-283` — `SavedExperimentEpistemicStatus` to unia SZEŚCIU
nazwanych osi plus dziesięć literałów ad-hoc. `HYPOTHESIS` należy do trzech osi
naraz; `SIMULATION` i `DataProvenance.SIMULATED` to jedno pojęcie w dwóch
pisowniach (plik sam to przyznaje w `:236-240`). Cztery słowniki są genuinnie
ortogonalne i ZOSTAJĄ (`ReplayVerdict`, `DataProvenance`, `GroundingLevel`,
`AdmissionStatus`); trzy to redundantne rankingi „jak ustalone jest
twierdzenie" (`ConfirmationLevel` / `EpistemicStatus` /
`KnowledgeEpistemicStatus`) i te się konsolidują. Twardy warunek: **zero
łamania zapisanych danych** — warstwa zgodności czyta stare stringi i mapuje na
osie, migracja jest jednokierunkowa i przetestowana na realnych rekordach z
`localStorage`/SQLite, nie na fikcyjnych.

**Qwen — pakiet badawczy, NIE kod: obserwable dla QE4–QE7.**
QE1–QE3 dały się sfalsyfikować, bo istniała dla nich MIARA. QE4–QE7 nie mają
jeszcze obserwabli na podłożu, które Genesis faktycznie posiada. Zadanie:
dla każdej z QE4–QE7 podać (a) konkretną liczbę, którą można policzyć z
istniejących solverów lub z jednej nazwanej, dodanej funkcji, (b) rodzinę stanów
/układów z ZAMKNIĘTĄ formą, żeby wynik dał się sprawdzić arytmetycznie,
(c) ustawienie sondy, przy którym pomiar jest BEZUŻYTECZNY, i takie, przy którym
rozstrzyga, (d) jawnie: co z tego jest tautologią liczonej algebry, a co realnie
falsyfikowalne. Bez tego czwartego punktu pakiet jest nieprzyjmowalny — QE1
pokazał, że łatwo zbudować „test", który nie może nie przejść.
**Solar H051–H056** (P1 planu master) wciąż czeka: raporty `SOLAR_MIND_*` nie
weszły do repo i nie zostały uruchomione, więc kto to bierze, musi najpierw
dostać ich pełny tekst i wciągnąć go jako DANE do `knowledge/` z adnotacją
„nieuruchomione", zanim cokolwiek z H051–H056 stanie się problemem pętli.

**Czego NIE robimy teraz:** QE4–QE7 jako przebiegi (do czasu pakietu Qwena),
warstwa starzenia dowodów (G9 — zamiast niej jeden komentarz mówiący, że jej
brak jest decyzją), scoring wartości eksperymentu (G5).

## UPDATE — C3: G3 (jedyne P0) ZAMKNIĘTE — kotwica anty-HARKingowa

Commit `2ab93cbf`. Test napisany i uruchomiony na czerwono NAJPIERW —
`preregisterHypotheses` nie miała parametru kotwicy, więc próba wyrażenia
"ten odcisk już znałem przed rejestracją" kończyła się błędem typu, nie
cichym zaakceptowaniem — po dodaniu kotwicy do sygnatury test przeszedł na
zielono.

**Co realnie znaleziono**: modele są deterministyczne (stały seed), a
`provenance.ts::createExperimentProvenance` liczy `runFingerprint` z
requestu I WYNIKÓW razem — więc podglądnięty i "oficjalny" przebieg tej
samej hipotezy mają identyczny odcisk. Sekwencja PODGLĄDNIJ → PREREJESTRUJ
→ WYKONAJ OFICJALNIE dawała rekord nierozróżnialny od uczciwej, ślepej
rejestracji.

**Naprawa — kotwica, nie ranking/scoring (G5/G9 poza zakresem, zgodnie z
notatką podziału pracy wyżej)**: `PreregistrationAnchor.priorRunFingerprints`
jako WYMAGANY argument `preregisterHypotheses` — uczciwa, ślepa rejestracja
deklaruje `[]` (prawda dla wszystkich 7 realnych miejsc wywołania w repo,
sprawdzone jedno po drugim). Kotwica wchodzi w `preregistrationFingerprint`
(więc nie da się jej po cichu wyczyścić po fakcie); nowa funkcja
`verifyAntiHarkingAnchor` wykrywa kolizję, gdy zadeklarowany-jako-już-znany
odcisk wraca jako potwierdzający dowód. `createdAt` CELOWO zostaje POZA
odciskiem (to zegar, nie deklaracja — inaczej złamałby istniejący test
"Deterministyczne odciski", który wymaga tej samej wartości dla dwóch
niezależnych, treściowo identycznych rejestracji). `createdBeforeRun`
pozostaje uczciwym twierdzeniem składanym w momencie rejestracji
(strukturalnie prawdziwym — żadna `Preregistration` nie istnieje przed
`generateCompetingHypotheses`), ale teraz może zostać PODWAŻONE przez
`verifyAntiHarkingAnchor`, czego wcześniej nie dało się zrobić w ogóle.

**Efekt uboczny znaleziony przez pełny suite, nie przez tsc**: trzy world
adaptery (`cellWorldAdapter.ts`, `epidemiologyWorldAdapter.ts`,
`moleculeWorldAdapter.ts`) budują `SavedHypothesisLoop`-kształtny obiekt
ręcznie do replayu i nie miały nowych pól — `isSavedHypothesisLoop` cicho
zamieniało to w `BLOCKED` (a `replaySavedHypothesisLoop` przyjmuje
`unknown`, więc tsc tego nie złapał). Naprawione w tym samym commicie.

Zweryfikowane: tsc czysto, eslint czysto, pełny frontend suite 464/464
plików, 5134 passed / 1 znany niezwiązany skip, build czysto.

---

## UPDATE — 2026-09-12, C1: G3 + G6 scalone, priorytet ZAMKNIĘTY; prompty dla Qwena wydane

### Co przejrzałem i scaliłem

**C3 — G3 (kotwica anty-HARKingowa).** Praca trafiła bezpośrednio na tę samą
gałąź (`claude/genesis-autonomous-completion-95bt4e`), więc nie było scalania
— tylko weryfikacja. Projekt jest solidny: `PreregistrationAnchor` jako
wymagany argument `preregisterHypotheses`, zahaszowany w odcisku, sprawdzany
mechanicznie przez `verifyAntiHarkingAnchor` względem realnie użytych
`runFingerprints`. `createdAt` celowo POZA odciskiem (uzasadnione względem
testu determinizmu). Skutek uboczny — trzy world-adaptery budujące
`SavedHypothesisLoop` ręcznie i cicho lądujące w `BLOCKED` — znaleziony przez
pełny suite, nie przez `tsc`, i naprawiony w tym samym commicie. Zgadza się z
warunkiem z podziału pracy: kotwica, nie scoring/staleness (G5/G9 poza
zakresem).

**C2 — G6 (kanoniczny słownik niezawodności epistemicznej).** Praca była na
osobnej gałęzi `claude/genesis-graphics-engine-v1-wd0r66`, która niesie też
dwa wcześniej ODRZUCONE commity (`5dfe87c`, `2fd0d61` — duplikat Matrix/
policy i Construct już rozwiązany gdzie indziej). **Nie scaliłem całej
gałęzi** — cherry-pick wyłącznie commita G6 (`508b09a`), czysto, zero
konfliktów, bo dotyka tylko dwóch nowych plików. Projekt trafny: trzy z
sześciu osi (`EpistemicStatus`, `KnowledgeEpistemicStatus`,
`BiotechEpistemicStatus`) faktycznie mierzą to samo — „ile naukowego
wsparcia ma to twierdzenie" — i konsolidują się na już-wysłanej,
7-poziomowej skali z polskimi etykietami; cztery pozostałe (`ReplayVerdict`,
`DataProvenance`, `GroundingLevel`, `AdmissionStatus`) zostają nietknięte, bo
odpowiadają na inne pytania. Zero zmian w zapisanych danych — warstwa
wyłącznie do odczytu.

**Znaleziony i naprawiony przeze mnie defekt w tym, co C2 dostarczył:**
`core/epistemicReliability.ts` nie miał ŻADNEGO realnego konsumenta — tylko
własny test go importował. Dokładnie ta sama klasa błędu, którą
`moduleReachability.test.ts` istnieje, żeby złapać (patrz `domeWorld` w
sekcji 8 wyżej), i złapał ją natychmiast: `expected ['core/epistemicReliability.ts'] to deeply equal []`.
Podpiąłem prawdziwego konsumenta zamiast dopisywać moduł do allowlisty:
`CandidateDossierScreen.tsx` (`#/dossier`) pokazywał dotąd
`report.epistemicStatus`/`report.ranking.epistemicStatus` jako gołe stringi
(`BiotechEpistemicStatus`), nieporównywalne między domenami. Teraz obok
każdego renderuje się `reliabilityBadge()` — kanoniczna polska etykieta z tej
samej, już przetestowanej, czystej funkcji `biotechToCanonicalReliability` +
`canonicalReliabilityLabel`; `BLOCKED` renderuje się jako nota o procesie, nie
zgadnięty poziom (moduł C2 już to rozstrzygał poprawnie — po prostu nikt
tego nie czytał).

### Co NIE zostało zweryfikowane wizualnie i dlaczego to napisane wprost

Badge nie został potwierdzony zrzutem ekranu z prawdziwymi danymi kandydata:
`DrugDiscoveryScreen`/`#/dossier` wymaga zalogowanej sesji backendu, a
zbudowanie pełnego, poprawnego artefaktu biotech (przez prawdziwy przepływ
UI albo przypięty fixture) wykraczało poza proporcjonalny zakres tego
scalenia. Zweryfikowane zamiast tego: `tsc` czysto, `eslint` czysto, build
czysto, `moduleReachability`/`orphanModuleWiring` zielone (dowód realnego
podpięcia, nie tylko braku błędu kompilacji), i 14 testów C2 na
`biotechToCanonicalReliability` nad KAŻDĄ realną wartością `BiotechEpistemicStatus`
łącznie z `BLOCKED`. To nie jest E2E VERIFIED w sensie tego repo — jest
TESTED + wired, i tak jest tu nazwane, zamiast udawać dowód, którego nie ma.

### Pełna weryfikacja po scaleniu (G3 + G6 + QE1–QE3 razem)

`tsc --noEmit` czysto · `eslint src --max-warnings=0` czysto · `npm run
build` czysto · pełny frontend suite: **465/465 plików, 5148 passed / 1
znany niezwiązany skip** (jeden przebieg złapał `nextActionSelectors.test.ts`
jako flaka pod obciążeniem pełnego suite — potwierdzone: zielony osobno i
zielony przy powtórzeniu całego suite zaraz potem, 0 failed).

### Priorytet ZAMKNIĘTY

G3 (P0) ✅ · G6 (P1, częściowo — 3 z 6 osi skonsolidowane, reszta świadomie
zostaje) ✅ · QE1–QE3 przez prawdziwy `StrategyRun` ✅. Pozostają otwarte, poza
zakresem tej rundy: G4/G5/G9 (świadomie NIE robione — patrz uzasadnienia w
audycie PHASE 0), QE4–QE7 (czekają na pakiet obserwabli), Solar H051–H056
(czekają na surowy tekst raportów w repo).

### Prompty wydane dla Qwena (do przekazania przez usera — brak bezpośredniego
kanału do Qwena w tej sesji)

Dwa gotowe prompty, każdy jako osobny dokument:
1. **QE4–QE7 obserwable** — wymaga dla każdej hipotezy: obserwabli
   policzalnej na istniejących solverach Genesis, rodziny stanów o
   zamkniętej formie, gałki bezużytecznej i rozstrzygającej, oraz — warunek
   twardy — jawnego rozdzielenia tautologii liczonej algebry od tego, co
   naprawdę falsyfikowalne. Instruuje wprost: jeśli hipoteza wymaga nowego
   podsystemu (stos QKD, solver JT gravity), nazwać to BLOCKED zamiast
   projektować fikcyjny silnik.
2. **Solar H051–H056, wejście do ingestion** — żąda pełnego, niestreszczonego
   tekstu `SOLAR_MIND_MASTER_REPORT.md`/`SOLAR_MIND_EXPANSION.md` gotowego do
   zapisania w `knowledge/`, oznaczonego NIEURUCHOMIONE, plus tabelę H051–H056
   na wzór tabeli QE1–QE7. Explicite: żaden kod, żadna implementacja na tym
   etapie.

## UPDATE — C3: P2.3 druga kotwica (Kepler) BLOCKED · P2.2 Solar ingestion BLOCKED (2026-09-12)

Zadanie `docs/prompts/C3-P2.3-kepler-anchor-i-P2.2-solar-ingestion.md`
zakładało, że oba prompty wydane Qwenowi (sekcja wyżej) już wróciły z
odpowiedzią i że ta odpowiedź trafiła do C3. **Sprawdzone przed napisaniem
czegokolwiek**: `docs/prompts/QWEN-P2.3-kotwica-zewnetrzna.md` i
`docs/prompts/QWEN-QE4-QE7-obserwable.md` w repo to WYŁĄCZNIE te same dwa
prompty WYDANE Qwenowi (identyczne z opisem w sekcji wyżej) — nie zawierają
odpowiedzi Qwena. Przeszukano `git log --all --full-history` po całym repo
(wszystkie gałęzie lokalne i `origin/*`, w tym `staging/qwen-cyber-foundation-unreviewed`,
który jest osobnym, niepowiązanym pakietem Qwena — Cyber Foundation, odrzuconym
w `de565414`) — realny tekst `SOLAR_MIND_MASTER_REPORT.md`/`SOLAR_MIND_EXPANSION.md`
ani szczegółowy pakiet Kepler (§1–§10 z promptu C3, ilustracyjny CSV, wzory
pasma) nie istnieją nigdzie w repo. To pokrywa się z tym, co ta sekcja MASTER
PRIORITY już mówiła wyżej: „Solar H051–H056... czekają na surowy tekst
raportów w repo" — tekst nadal nie wszedł.

**Część zrobiona mimo braku pakietu (nie wymagała jego treści):**
- Zmierzono niezależnie dostęp sieciowy do `exoplanetarchive.ipac.caltech.edu`
  z TEGO środowiska: `403` na CONNECT, ten sam rodzaj blokady co już
  udokumentowana dla pierwszej kotwicy. Zgodnie z regułą zadania („jeśli NIE
  masz dostępu... nie przypinaj rekordu ilustracyjnego") druga kotwica
  keplerowska zostaje `BLOCKED — brak dostępu do źródła`, dowód w
  `docs/P2_EVIDENCE.md`.
- Wygeneralizowano `EvidenceShowcaseScreen.tsx`: `ExternalAnchorSection`
  (hardkodująca `MOLECULAR_WEIGHT_ANCHOR_ID`) zastąpiona przez
  `ExternalAnchorCard`/`ExternalAnchorsSection`, iterującą po całym
  `EXTERNAL_ANCHORS`. Zero zmiany zachowania dziś (nadal jedna kotwica), ale
  kolejna kotwica (Kepler albo inna) wyrenderuje się bez zmian ekranu.
  Zweryfikowane: `tsc --noEmit` czysto, `eslint` czysto,
  `evidenceShowcaseScreen.test.tsx` + `externalObservationAnchor.test.ts` +
  `moduleReachability.test.ts` — 17/17, bez regresji.
- Zaktualizowano `docs/RISKS.md` R-005 i `docs/P2_EVIDENCE.md` z prawdziwym
  stanem obu prób.

**Część NIEROBIONA, bo wymaga treści, której nie mam:**
- Sam wpis kotwicy keplerowskiej (pasmo z `pl_orbpererr1`, `whatThisTests`/
  `whatRemainsUntested`) — zablokowany na sieci, więc nie ma payloadu do
  przypięcia niezależnie od treści pakietu.
- **P2.2 Solar ingestion w całości.** `knowledge/SOLAR_MIND_MASTER_REPORT.md`
  i `knowledge/SOLAR_MIND_EXPANSION.md` wymagają DOSŁOWNEGO tekstu raportów —
  nie da się ich uczciwie napisać z opisu zadania, bo zadanie samo zakłada, że
  tekst już istnieje u wykonawcy. Wymyślenie hipotez H051–H056 albo treści
  raportu byłoby dokładnie tą fabrykacją, której cała ta misja zabrania od
  pierwszego promptu. **Zgłoszone useriwi jako blokada wymagająca jego
  działania**: wklejenie realnej, pełnej odpowiedzi Qwena (oba prompty) do
  sesji, zanim P2.2 i reszta P2.3 mogą ruszyć.

Priorytet NIE ZAMKNIĘTY: P2.3 (druga kotwica) = `BLOCKED — brak dostępu do
źródła`. P2.2 (Solar ingestion) = `BLOCKED — brak treści źródłowej od Qwena`.
