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
| Planner Redund + Fals | **ZROBIONE**, skanonikalizowane | dwie sesje → D-027 | `Sep × (1+w·Fals) × (1−w·Redund)` |
| §6 Government / Sovereign plane | **W TOKU** | sesja `eaa9ab8` | `core/agent/sovereignTruthAnswer.ts` |
| **§5 Discovery Graph + memory transfer** | **BIORĘ TERAZ** | **C1, ta sesja** | *(w trakcie)* |
| **§9 Frontier acceptance E2E** | **BIORĘ TERAZ** | **C1, ta sesja** | *(w trakcie)* |
| §8 PracticalCandidate safety gate | WOLNE | — | reużyć `core/governance/` (jest gotowe), nie pisać drugiego |
| §7 A1 GLP-1 | **ZABLOKOWANE DANYMI** | — | patrz niżej |

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
