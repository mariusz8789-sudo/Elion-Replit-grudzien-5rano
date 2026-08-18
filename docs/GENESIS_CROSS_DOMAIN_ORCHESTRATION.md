# Genesis Cross-Domain Orchestration Guardrails

`CrossDomainOrchestrationPlan` jest lekką warstwą walidacji nad istniejącym `ExperimentRun`. Nie jest drugim World State, schedulerem ani nowym solverem. Jego jedynym zadaniem jest powstrzymanie niejawnego transferu danych między domenami.

| Warunek | Wymaganie | Wynik przy niespełnieniu |
|---|---|---|
| Źródło | Ukończony `ExperimentRun` z `resultOrigin = real-engine` | `BLOCKED_SOURCE_RUN` |
| Output | Skończona wartość liczbowa z deklarowaną jednostką | `BLOCKED_OUTPUT` |
| Cel | Zarejestrowany adapter i liczbowy parametr docelowy | `BLOCKED_TARGET` |
| Transformacja | Wyłącznie jawne `identity-only` w bieżącym kontrakcie | `BLOCKED_TRANSFORM` |
| Jednostki | Dokładnie zgodne deklarowane jednostki | `BLOCKED_UNITS` |
| Uruchomienie | Oddzielne wywołanie istniejącego Experiment Fabric | Brak automatycznej symulacji wtórnej |

> **Zasada bezpieczeństwa naukowego.** `READY_FOR_REAL_EXECUTION` oznacza tylko, że jawny transfer wartości ma zgodne jednostki. Nie oznacza poprawności naukowej związku przyczynowego ani gotowości modelu docelowego do reprezentowania zjawiska źródłowego.

## Stan obecny

Bieżące testy potwierdzają blokadę transferu promienia Schwarzschilda w kilometrach do bezwymiarowego parametru prędkości Lorentza. Genesis nie zamienia tej rozbieżności w przelicznik domyślny i nie uruchamia kaskady zastępczej.

## Warunek rozszerzenia

Każdy przyszły transform wymaga wersjonowanego kontraktu wejście–wyjście, deklaracji jednostek, testu numerycznego, prześledzalnego provenance oraz modelowego uzasadnienia. Dopiero wtedy może zostać dodany jako jawny, testowany adapter; nie jako tekstowa reguła Chat lub efekt wizualny.
