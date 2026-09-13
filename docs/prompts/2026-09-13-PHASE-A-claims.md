# PHASE A — kto co bierze, żeby nie zrobić czegoś trzeci raz

**Powód istnienia tego pliku.** W ciągu jednego dnia D-026 powtórzyło się jako D-027:
M2, planner Redund/Fals i modele wielozmiennowe zostały zaimplementowane **dwa razy**,
równolegle, przez dwie sesje, w tych samych plikach. Koszt: pełna kanonikalizacja trzech
komponentów i wycofanie połowy pracy obu stron. To nie jest problem umiejętności, tylko
koordynacji — nikt nie sprawdził, czy ktoś już zaczął.

**Zasada: przed napisaniem pierwszej linii kodu do sekcji z Phase A — `git fetch`,
przeczytaj ten plik, dopisz się do tabeli i wypchnij TEN commit osobno, zanim zaczniesz.**
Commit z samym oświadczeniem kosztuje minutę. Zdublowany komponent kosztuje godziny.

## Stan na `be606e5`

| Sekcja mandatu | Stan | Kto | Dowód / gdzie |
|---|---|---|---|
| M1 ObservationGapRequest | **ZROBIONE** | C1 (`67380ce`) | `core/agent/observationGap.ts`, repro-demo 5 kontroli |
| M2 rejestr sfalsyfikowanych | **ZROBIONE**, skanonikalizowane | dwie sesje → D-027 | `core/agent/falsifiedModelRegistry.ts` |
| M3 modele strukturalne/wielozmiennowe | **ZROBIONE**, skanonikalizowane | dwie sesje → D-027 | `core/agent/modelSpace.ts` (zmienne nazwane) |
| M3 parsymonia + hold-out | **ZROBIONE** | ta sesja | `modelSelectionScore`, `holdoutScore` |
| **M3 strukturalne odkrycie — demonstrator end-to-end** | **ZROBIONE** | C1 (`826916d`) | `node scripts/m3-demonstrator.mjs` → **18/18**; `repro-demo` **60/60**; frontend **5495 passed**; backend **396/396**; tsc/eslint/build czysto. Nie ruszać ponownie tego kodu — patrz otwarty punkt niżej. |
| Planner Redund + Fals | **ZROBIONE**, skanonikalizowane | dwie sesje → D-027 | `Sep × (1+w·Fals) × (1−w·Redund)` |
| §6 Government / Sovereign plane | **W TOKU** | sesja `eaa9ab8` | `core/agent/sovereignTruthAnswer.ts` |
| **§5 Discovery Graph + memory transfer** | **ZROBIONE** | C1, ta sesja | `core/agent/discoveryGraph.ts` |
| **§9 Frontier acceptance E2E** | **ZROBIONE** | C1, ta sesja | `docs/PHASE_A_C1_REPORT_2026-09-13.md` |
| §8 PracticalCandidate safety gate | **ZROBIONE** | C1, wcześniej ta sesja | `core/agent/practicalCandidateGate.ts` — reużyty (nie napisano drugiego) przez A1, patrz niżej |
| **§7 A1 GLP-1** | **ZROBIONE** | **C1, ta sesja** | patrz niżej — realne dane, realny werdykt, bramka bezpieczeństwa |
| **Detektor residuum — próg czuły na szum / świadomość liczności próby** | **ZROBIONE (Opcja A)** | C1 | patrz niżej |
| **A2 — autonomiczny dobór kandydata na zamiennik Ozempicu (nowy mandat)** | **ZROBIONE** | **C1, ta sesja** | patrz niżej — realna, mechanizm-owa przestrzeń kandydatów, realny werdykt `CONFLICTING_EVIDENCE`, bramka bezpieczeństwa |

## Detektor residuum: znaleziona, niezałatana wada specyficzności

Demonstrator M3 (`826916d`) znalazł to podczas własnej kontroli negatywnej i **zgłosił, nie
naprawił po cichu**: na czystym szumie (proces bez żadnej krzywizny) `CURVATURE` odpala się
przy stosunku RSS **0.4978**, tuż poniżej progu **0.5**. Selekcja modelu i tak odrzuca każdego
wygenerowanego kandydata, więc do wyniku naukowego nic zmyślonego nie trafia — ale sam próg
jest ślepy na liczność próby (nie skaluje się z `n`), więc przy innych danych ten sam mechanizm
może dać fałszywy alarm, który TYM RAZEM zostanie wybrany.

**Kto to bierze, musi wiedzieć:** naprawienie progu (np. uzależnienie go od `n` albo test
istotności zamiast stałego stosunku RSS) zmienia zachowanie `residualStructure.ts` **globalnie**
— nie tylko dla demonstratora M3. To **zmieni odciski replay kampanii QE4 i Kepler**, bo obie
przechodzą przez ten sam detektor. Wymaga to:
1. jawnej decyzji (nie cichej edycji stałej),
2. ponownego przeliczenia i przypięcia nowych `EXPECTED` w `scripts/repro-demo.mjs`,
3. re-weryfikacji, że §15/§9 (model wyprowadzony z residuum, wygrywa kampanię) nadal działa.

Nie jest to „dokończenie M3" — to osobna, świadomie odłożona poprawka fundamentu, na którym
stoi M3, QE4 i Kepler jednocześnie.

### Materiał dowodowy do decyzji A/B/C/D (zmierzone, nie zaimplementowane)

Poniższe liczby są zmierzone read-only (bez zmian w repo) przeciwko realnym, obecnym
przypadkom — po to, żeby decyzja A/B/C/D nie była zgadywaniem. **Decyzja pozostaje OPEN.**
Nic z tego nie zostało wdrożone do kodu.

Testowana kandydacka reguła (Opcja A): zamiast stałego `ratio < 0.5`, dopasowanie kwadratowe
do residuum wygrywa z liniowym tylko gdy `ΔRSS > Δk·ln(n)` — bezpośrednie ponowne użycie
`modelSelectionScore` (już zweryfikowanego w `modelSpace.ts` do dokładnie tego problemu),
z `Δk=1` (kwadratowe ma 3 wyrazy, liniowe 2).

| Przypadek | n | ratio (stara reguła) | stara reguła `ratio<0.5` | ΔRSS vs ln(n) | reguła BIC-style |
|---|---|---|---|---|---|
| QE4, LOG odebrane, **runda 4** (load-bearing dla M1/§15) | 6 | 0.4721 | **ODPALA** | 2.1136 > ln(6)=1.7918 | **ODPALA** |
| QE4, LOG odebrane, **runda 5** (load-bearing dla M1/§15) | 7 | 0.4558 | **ODPALA** | 2.2821 > ln(7)=1.9459 | **ODPALA** |
| M3, kontrola negatywna, czysty szum | 16 | 0.4978 | **ODPALA** (fałszywy alarm) | 1.3886 < ln(16)=2.7726 | **NIE ODPALA** |

**Sprawdzone i odrzucone jako niebezpieczne:** podniesienie `MIN_POINTS_FOR_STRUCTURE` z 5 na
np. 8 (tania łatka bez zmiany matematyki) **zabiłoby load-bearing przypadek** — ten sam, który
odpala przy n=6 i n=7 powyżej. To gorsze niż stan obecny, nie lepsze.

**Rekomendacja z tej analizy: Opcja A** (BIC-style, reuse `modelSelectionScore`) — jedyna
zbadana reguła, która jednocześnie: (a) nie odpala na czystym szumie przy n=16, (b) nie rusza
znaleziska load-bearing dla `§15`/M1 przy n=6/7, (c) nie wprowadza nowej maszynerii
statystycznej (Opcja B — test F — wymagałby dystrybuanty rozkładu F, nowego kodu numerycznego),
(d) nie łamie determinizmu kalibracją symulacyjną (Opcja C).

**Skutek uboczny, niezależnie od wyboru A/B/C/D:** zmiana wspólnego detektora wymaga ponownej
weryfikacji i re-pin fingerprintów QE4/Kepler oraz potwierdzenia §15/§9.

**DECYZJA PODJĘTA I ZAIMPLEMENTOWANA: Opcja A.** Commit: `79a9739`.

`CURVATURE` w `residualStructure.ts` porównuje teraz `modelSelectionScore` (dokładne ponowne
użycie reguły parsymonii z `modelSpace.ts`) zamiast stałego `ratio < 0.5`.

**Zmierzony wynik po wdrożeniu — niespodzianka warta zapisania:** re-pin fingerprintów
QE4/Kepler **NIE był potrzebny**. Oba realne, load-bearing przypadki (n=6 i n=7, `§15`/M1)
odpalają pod nową regułą z tym samym werdyktem co pod starą — pełny `repro-demo` **69/69**,
odciski `44f245c9` (QE4) i `f4804820` (Kepler) **bez zmian**, „model B WYPROWADZONY z residuum"
nadal generuje te same trzy kandydaty. Ryzyko ze skutku ubocznego było realne i słusznie
zgłoszone z góry — po prostu nie zmaterializowało się dla akurat tych dwóch przypiętych
przypadków, bo oba odpalają wyraźnie powyżej nowej granicy, nie na jej krawędzi.

Jedyna rzecz, która się zmieniła: kontrola negatywna M3 na czystym szumie (n=16) **przestała
fałszywie odpalać** — `residualFindingKinds: []` zamiast wcześniejszego fałszywego alarmu
(`ratio 0.4978`, złapanego dopiero downstream przez parsymonię). Test `N1b` i odpowiedni
check w `repro-demo.mjs` zostały przepisane na silniejsze, prawdziwe twierdzenie („zero
znalezisk", nie „flaga audytowa podniesiona") — nie wymyślono sztucznego scenariusza, żeby
utrzymać stary check zielonym.

Pełna bramka po zmianie: `repro-demo` 69/69, `m3-demonstrator.mjs` 18/18, frontend
5543 passed/1 skip (jeden niezwiązany flaky timeout w `nextActionSelectors.test.ts` —
15/15 w izolacji), backend 396/396, tsc/eslint/build czysto.

## §7 A1 — ZROBIONE: realne dane, realny werdykt, bramka bezpieczeństwa

Preregestracja przypięta PRZED pobraniem danych (`a1Glp1Preregistration.ts`, odcisk
`5882c619`, commit `e63fb89`). Realne dane pobrane i zweryfikowane bajt-po-bajcie z CI
(commit `6f73afe`, patrz D-028): target GLP-1R `CHEMBL1784`, 3 związki rozwiązane NA ŻYWO
(nie zaszyte), aktywności ChEMBL (semaglutyd 21, liraglutyd 29, metformina 0 — oczekiwany
wynik kontroli negatywnej), 4 badania ClinicalTrials.gov z pełnymi polami wyniku HbA1c.

**Potok**: `core/biotechData/a1Glp1Analysis.ts` — analiza kandydatów (mediana potencji
ChEMBL + delta HbA1c z realnych badań) → deterministyczny werdykt §8 (reguła
egzystencjalna, dosłowna z preregestracji) → rewizja przekonań i ranking (reużyte
`experimentFabric/beliefRevision.ts`, bez drugiej implementacji) → bramka bezpieczeństwa
§8/§14 (reużyty `core/agent/practicalCandidateGate.ts`, bez drugiej bramki) → zapis do
Science Memory (`saveA1Glp1AnalysisToMemory`, reużyty `saveExperiment`).

**Realny wynik, niewymyślony:** stosunek potencji GLP-1R liraglutyd/semaglutyd = **1.599**
(w oknie preregestrowanym [0.1, 10]). Ale realne badanie head-to-head SUSTAIN 7
(`NCT03191396`, sema 1.0mg vs lira 1.2mg) daje deltę HbA1c **-0.60pp**, 95% CI
**[-0.76, -0.44]** — CAŁKOWICIE poza preregestrowanym marginesem ±0.4pp. Werdykt §8:
**H2_NOT_SUPPORTED** (nie rozcieńczony przez dwa mniejsze badania, które same w sobie
mieszczą się w marginesie). Ranking rewizji przekonań (sekwencyjny log-odds nad tymi
samymi dowodami) stawia H1 najwyżej — **realna, ujawniona niezgodność** między regułą
egzystencjalną a heurystyką uśredniającą (`verdictDisagreesWithRanking: true`), nie
cicho rozstrzygnięta. Bramka bezpieczeństwa odmawia (`REFUSE`) dopóki ta niezgodność
stoi — kandydat NIE opuszcza warstwy badawczej, powierzchnia `NONE`. Ustalenie negatywne
NIE zostało ukryte: pełny werdykt, wszystkie 3 delty i stosunek potencji pozostają w
pełni widoczne w raporcie niezależnie od wyniku bramki (POLICY MAY LIMIT ACTION. POLICY
MUST NOT ALTER TRUTH). Obie kontrole negatywne §13 przeszły: metformina — zero sygnału
wiązania GLP-1R; semaglutyd vs insulina glargine (SUSTAIN 4) — realna duża różnica
(-0.81pp), margines nie jest pusty.

Granica medyczna §14 wymuszona na warstwie WYNIKU (nie promptu): `proposedProtocol: null`
zawsze, skan `CLINICAL_DIRECTIVE_PATTERNS` na treści kandydata (reużyty, nie
zduplikowany), `candidateClass: 'intervention'` (zawsze wymaga zatwierdzenia człowieka,
nigdy auto-aktywacji).

Dowód uruchamialny: `npm run a1:demo` → **14/14**. Testy: `a1Glp1Analysis.test.ts` →
**19/19** (potencja, ekstrakcja badań, werdykt, rewizja przekonań, Science Memory,
granica bezpieczeństwa, jednostkowe na syntetycznych danych).

Pełna bramka: frontend **5568 passed/1 skip** (ten sam niezwiązany flaky timeout w
`nextActionSelectors.test.ts`, potwierdzony 15/15 w izolacji), backend **396/396**,
`m3-demonstrator.mjs` **18/18**, `repro-demo` **69/69**, tsc/eslint/build czysto.
Po drodze znaleziony i naprawiony realny regres `moduleReachability.test.ts` (7 modułów
stało się osiągalnych z `main.tsx` przez nowy import w `scienceMemory.ts` — usunięto
nieaktualne wpisy `ALLOWED_ORPHANS`, zgodnie z własną instrukcją testu, nie stłumiono) oraz
brakujący wpis `GENESIS_A1_FIXTURE_DIR` w `.env.example` (złapany przez `envContract.test.mjs`).

Commit`y: `7c16dfd`/`5a5ae4b`/`6f73afe` (fetch+pin), `0e26c6f` (potok analizy + naprawy).

## §A2 — ZROBIONE: autonomiczny dobór kandydata na zamiennik Ozempicu, realny werdykt CONFLICTING_EVIDENCE

Preregestracja przypięta PRZED pobraniem danych (`a2OzempicSubstitutePreregistration.ts`,
odcisk `4642088a`, commit `1cd65eb`). Przestrzeń kandydatów zbudowana z MECHANIZMU, nie z
nazwy leku: KAŻDA cząsteczka z realnymi kwalifikującymi się danymi wiązania w ChEMBL przy
GLP-1R (`CHEMBL1784`)/GIPR (`CHEMBL4383`)/GCGR (`CHEMBL1985`) i `max_phase>=2` weszła do
przestrzeni. Realne dane pobrane i zweryfikowane bajt-po-bajcie z CI (patrz D-029): **20
realnych kandydatów**, **12 z realnymi badaniami T2DM/otyłość z opublikowanymi wynikami**
(EXENATIDE, GLUCAGON, GLP-1 natywny, PF-06291874, LIRAGLUTIDE, DANUGLIPRON, ORFORGLIPRON,
PERPHENAZINE, COTADUTIDE, TIRZEPATIDE, MK-0893, ADOMEGLIVANT/LY2409021).

**Potok**: `core/biotechData/a2OzempicSubstitute.ts` — ekstrakcja skuteczności (HbA1c,
DIRECT_HEAD_TO_HEAD vs NAIVE_INDIRECT) i bezpieczeństwa (7 kategorii AE, ryzyko względne
metodą Katza) per kandydat → falsyfikacja → rewizja przekonań H1-H4 (reużyte
`experimentFabric/beliefRevision.ts`) → ranking ważony (EFFICACY+SAFETY+EVIDENCE_STRENGTH+
UNCERTAINTY+REPLICATION+PENALTY_FOR_CONFLICT) → **samo-falsyfikacja rundy 2** na
zwycięzcy → deterministyczny werdykt (jeden z 6 prerejestrowanych etykiet) → bramka
bezpieczeństwa §8/§14 (reużyty `core/agent/practicalCandidateGate.ts`) → zapis do Science
Memory (`saveA2OzempicSubstituteToMemory`, reużyty `saveExperiment`).

**Realny wynik, niewymyślony:** żadne z 12 realnych badań kandydatów nie zawiera ramienia
semaglutydu — KAŻDE porównanie skuteczności w zestawie jest `NAIVE_INDIRECT`, jawnie
oznaczone jako słabsza klasa dowodu, nigdy po cichu podniesione. TIRZEPATIDE pokazuje
realną przewagę skuteczności (delta HbA1c **-0.79pp** względem przypiętego semaglutydu z
A1), ale zostaje **WETOWANY** przez egzystencjalną bramkę bezpieczeństwa na realnym,
zmierzonym sygnale: ryzyko względne biegunki **2.71** względem semaglutydu (referencja
bezpieczeństwa: NCT03987919/SURPASS-2, jedyne realne badanie head-to-head semaglutyd vs
kandydat w całym zestawie), 95% CI wyklucza 1. Samo-falsyfikacja rundy 2 na tirzepatydzie
znajduje **2 realne, ujawnione zastrzeżenia** (brak bezpośredniego head-to-head, mniej niż
2 niezależne badania skuteczności) — nie zakłada braku zastrzeżeń. Werdykt końcowy:
**CONFLICTING_EVIDENCE** — uczciwie, nie wymuszony pozytywny wynik. Dwaj realni
antagoniści receptora glukagonu (MK-0893, ADOMEGLIVANT/LY2409021) — mechanistycznie
odmienni od agonizmu GLP-1R semaglutydu — są jawnie ujawnieni w werdykcie, nie po cichu
wykluczeni z przestrzeni.

Bramka bezpieczeństwa nie proponuje żadnego `PracticalCandidate` dla wyniku
`CONFLICTING_EVIDENCE` (`gatedCandidate: null`, `surface: 'NONE'`) — ale pełna leżąca u
podstaw ewidencja (wszystkie 12 raportów kandydatów) pozostaje w pełni widoczna w raporcie
niezależnie od werdyktu (POLICY MAY LIMIT ACTION. POLICY MUST NOT ALTER TRUTH).

**Trzy realne błędy ekstrakcji** znalezione i naprawione przez testowanie na realnych
danych (nie zgadnięte) — patrz D-030: badanie jednoramienne bez nazwy leku w tytule grupy
(EXENATIDE), kodowa nazwa sponsora różna od `pref_name` ChEMBL (ADOMEGLIVANT=LY2409021),
rozrzut jako nazwany przedział ufności zamiast SD/SE. Łączny efekt: ADOMEGLIVANT poszedł z
0 do 3 realnych badań skuteczności.

Dowód uruchamialny: `npm run a2:demo` → **14/14**. Testy: `a2OzempicSubstitute.test.ts` →
**23/23** (przestrzeń kandydatów, obie poprawki ekstrakcji, weto tirzepatydu,
samo-falsyfikacja, werdykt, ujawnienie GCGR-antagonistów, determinizm, Science Memory,
granica bezpieczeństwa, jednostkowe na syntetycznych danych).

Pełna bramka po zmianie: frontend **5591 passed/1 skip** (ten sam niezwiązany flaky
timeout w `nextActionSelectors.test.ts`), backend **396/396**, `m3-demonstrator.mjs`
**18/18**, `repro-demo` **69/69**, `a1:demo` **14/14** (bez regresji), tsc/eslint/build
czysto.

Commit`y: `1cd65eb` (preregestracja), `905e097`/`0c8a0a0`/`5d61a0b`/`1550e54` (fetch+pin),
kolejny commit tej sesji (potok analizy + demonstrator + Science Memory + dokumentacja).
