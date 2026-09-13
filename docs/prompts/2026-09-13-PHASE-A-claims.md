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
| **§5 Discovery Graph + memory transfer** | **BIORĘ TERAZ** | **C1, ta sesja** | *(w trakcie)* |
| **§9 Frontier acceptance E2E** | **BIORĘ TERAZ** | **C1, ta sesja** | *(w trakcie)* |
| §8 PracticalCandidate safety gate | WOLNE | — | reużyć `core/governance/` (jest gotowe), nie pisać drugiego |
| §7 A1 GLP-1 | **ZABLOKOWANE DANYMI** | — | patrz niżej |
| **Detektor residuum — próg czuły na szum / świadomość liczności próby** | **OTWARTE / NIEPRZYPISANE** | — | patrz niżej |

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

**C1 nic jeszcze nie implementuje.** Decyzja A/B/C/D zapada najpierw.

## §7 A1 — dlaczego jest zablokowane, a nie „niezrobione"

W repo **nie ma żadnych danych GLP-1**. Sprawdzone grepem: `semaglutide`, `liraglutide`,
`GLP-1` — zero trafień w `.ts`, `.json`, `.csv`. Przypięte payloady ChEMBL dotyczą
adenozyny i teofiliny, nie GLP-1R.

Egress do ChEMBL i ClinicalTrials.gov jest z sandboxa zablokowany — ustalony wzorzec repo
to pobranie na runnerze GitHub Actions i przypięcie pliku z sha256 (tak powstały QE4,
Kepler, PubChem, DEFRA). **Dopóki ten fetch nie wyląduje, każdy „wynik A1" byłby zmyślony.**

Kolejność dla tego, kto weźmie A1:
1. skrypt `scripts/fetch-a1-glp1-fixture.mjs` + workflow CI (wzorzec: `fetch-b1-defra-aurn-fixture.mjs`),
2. przypięcie payloadu z sha256 i licencją,
3. **dopiero potem** kampania — jako trzeci adapter `CampaignLaboratory`, pierwsza domena INTERWENCYJNA,
4. wynik wyłącznie w warstwie Government/Sovereign Research, nigdy w warstwie obywatelskiej.

Granica medyczna z `docs/A1_GLP1_EXECUTION_HANDOFF.md` §14 obowiązuje w warstwie **wyniku**,
nie w promptcie: nigdy recepta, nigdy dawka dla osoby, nigdy „zatwierdzony zamiennik".
