# Scenario Engine Command Center UI

## Zakres dostawy

Ta gałąź łączy istniejący `Scenario Engine` z panelem `#/city3d`. Nie tworzy nowego silnika, nie dodaje danych syntetycznych i nie modyfikuje `EpidemicCitySimulation`, `resolveContacts`, Hospital Model, Discovery Engine, replay, `WorldEngineContract`, routingu ani High-Fidelity City View.

Warstwa `scenarioCommandCenter.ts` jest cienkim adapterem prezentacyjnym. Filtruje aktywne parametry Command Center do rzeczywistych pól `EpidemicCityParams`, po czym wywołuje wyłącznie istniejące `runScenario`, `compareScenarios` oraz `replayScenario`.

## Widok Command Center

Panel **SCENARIUSZ** w prawym sidebarze udostępnia `BASELINE` oraz wybieraną `INTERVENTION` z katalogu `SCENARIOS`. Widoczne są wyłącznie realne nadpisania danego scenariusza: parametry epidemii, pojemność szpitala lub profil kohortowy. Wpisy, których model nie obsługuje, zachowują status `NOT_MODELED` i jego rzeczywisty powód — bez wyniku zastępczego.

Po uruchomieniu panel renderuje pola z istniejącego `ScenarioSummary`: transmisje, szczyt zakażonych, zgony, hospitalizacje kiedykolwiek, dni bez opieki, attack rate, szczyt obłożenia łóżek i ICU. Brak pola jest reprezentowany jako `NOT_AVAILABLE`, a nie jako zero.

Wykres porównawczy składa dwie autentyczne serie dzienne `ScenarioDaySample` dla zakażonych, hospitalizacji lub zgonów. Oś czasu prowadzi od `DAY 0` do rzeczywistego `run.days`; `DAY 0` opisuje warunki wejściowe, ponieważ Scenario Engine zapisuje próbki po zakończeniu pierwszego dnia. Dla każdego późniejszego dnia widoczne są rzeczywiste: `I`, hospitalizacja, `D` i `unmetCare`.

## Traceability

Traceability pokazuje ID wybranego scenariusza, seed, wersję kontraktu Scenario Engine, status porównania, input fingerprint i result fingerprint. Zawiera także provenancję: wyniki pochodzą z `runScenario()`, a różnice z `compareScenarios()`. Istniejąca funkcja replay pozostaje aktywna i potwierdza odtworzenie bez zmiany modelu.

## Zweryfikowane dowody wizualne

Przygotowano porównywalne obrazy 1920×1080:

| Plik | Stan |
| --- | --- |
| `screenshots/command-center-before-scenario-ui-1920x1080.png` | High-Fidelity City View przed panelem Scenario UI |
| `screenshots/command-center-after-scenario-ui-1920x1080.png` | Command Center po uruchomieniu rzeczywistego `CONTACT_REDUCTION`, z traceability i replay |
| `screenshots/command-center-scenario-comparison-1920x1080.png` | Ten sam Command Center z aktywną osią czasu i traceability rzeczywistego scenariusza |
| `screenshots/command-center-scenario-chart-1920x1080.png` | Ten sam Command Center z przewiniętym panelem wyników dla realnych metryk i wykresu porównawczego |

> Widok desktopowy korzysta z istniejącego przewijanego prawego sidebaru, dlatego selektor/parametry, metryki/wykres i provenance są dostępne w tym samym panelu przy różnych pozycjach przewinięcia. Żaden zrzut nie zastępuje danych obrazu statyczną makietą.

## Granica dalszej pracy

Następna funkcjonalność nie powinna zmieniać logiki scenariusza w tej gałęzi. Rozszerzenie o routing lub nowe metryki wymaga najpierw nowego, zwalidowanego kontraktu Scientific Core; panel ma następnie jedynie projektować jego realne pola.
