# Zadanie dla Claude’a — Genesis Phase 3/4

## Rola

Działasz jako **Scientific Integration Engineer** dla Genesis Scientific Discovery OS. Nie budujesz nowego produktu obok Genesis. Pracujesz wyłącznie na wskazanym branchu Claude’a, a Manus pozostaje głównym integratorem i źródłem prawdy dla LIVE.

## Aktualny stan, który musisz przyjąć jako fakt

LIVE Genesis posiada już zweryfikowane, działające integracje:

- Earthquake: Scenario → ImpactResult → DamageAssessment → CityWorld mapping → City3D → Evidence → Replay;
- Epidemic: realny `EpidemicCitySimulation` z handoffem do istniejącego City3D Command Center;
- Minkowski, Schwarzschild radius, Schwarzschild geodesics, c-Slider oraz Particle Energy;
- Universe: Kepler, three-body, Hubble tension, Lorenz, stellar scaling, rotation curve i galaxy collision;
- Science Chat → deterministic parser/router → model → result → provenance;
- Evidence/Replay entry point oraz Protocol / A-B designer nad istniejącym Experiment Fabric;
- Genesis Observatory visual language w istniejącym City3D Command Center.

Raport Phase 3 potwierdził ponadto, że Discovery/Campaign nie są jedną wspólną ścieżką. Istnieją trzy osobne pipeline’y: Experiment Fabric, pre-existing discovery engine oraz backend-driven Campaign chemistry flow. Nie wolno ich teraz ślepo scalać.

## Jedyny cel zadania

Wybierz i doprowadź do końca **jeden** realny milestone z poniższych dwóch opcji. Nie rób obu naraz.

### Opcja A — rekomendowana: Scientific Discovery / Campaign audit adapter

Przeprowadź statyczny audyt istniejących:

- `scientificExecutor.ts`;
- `discoveryEngine.ts`;
- `scenarioEngine.ts`;
- `discoveryReplay.ts`;
- `CampaignScreen.tsx`;
- istniejących `Evidence Pack`, `RO-Crate`, provenance i replay helperów.

Celem nie jest merge trzech systemów. Celem jest znalezienie **jednego cienkiego, bezpiecznego adaptera** albo jednoznaczne udokumentowanie blockera.

Adapter może zostać zaakceptowany tylko wtedy, gdy:

1. używa istniejącego `Experiment Fabric` jako źródła realnych runów;
2. nie tworzy drugiego routera, drugiego Evidence, drugiego Replay ani drugiego WorldState;
3. nie zmienia Epidemic Core bez konieczności;
4. zachowuje istniejące provenance fingerprints i statusy epistemiczne;
5. potrafi pokazać `NOT_MODELED`, `BLOCKED` lub `VERIFY_REQUIRED`, jeśli brakuje danych;
6. ma deterministyczne testy i rzeczywistą trasę demonstracyjną;
7. nie wykonuje żadnego eksperymentu automatycznie tylko dlatego, że użytkownik zobaczył rekomendację.

Jeżeli te warunki nie są spełnione, **nie implementuj adaptera**. Zapisz precyzyjny blocker w dokumencie CTO, podaj dokładne pliki i kontrakty, których brakuje, oznacz element `PARTIAL` lub `NOT_CONNECTED`, a następnie wykonaj tylko test/regression proof istniejącego Experiment Fabric.

### Opcja B — tylko jeżeli A ma prawdziwy blocker: WHY / Next Experiment proof

Jeżeli Manus ma już rozpoczęty lub wdrożony WHY layer, nie twórz równoległej implementacji. Możesz jedynie:

- dodać testy deterministycznego wyjaśniania wyniku z istniejącego Evidence chain;
- sprawdzić, że rekomendacja kolejnego eksperymentu jest propozycją, a nie auto-run;
- zapewnić, że wyjaśnienie odwołuje się do realnych armów, runIds, assessment i provenance;
- nie generować nowych danych, wartości, modeli ani rzekomych odkryć.

## Czego nie robić

Nie dodawaj:

- nowych hazardów;
- Matrix World;
- Collidera;
- drugiego renderera;
- drugiego CityWorld;
- live GIS, OSM, DEM, climate/seismic fetch;
- realnych danych bez SOURCE, LICENSE, VERSION, TIMESTAMP, PROVENANCE i VALIDATION;
- CRISPR, drug discovery, toxic dispersion, wildfire, power-grid cascade ani FEA jako parser-only cards;
- twierdzeń terapeutycznych, prognostycznych lub operacyjnych bez modelu i walidacji;
- slidera czasu do roku 2222 jako prawdziwej predykcji;
- split-screenów, causal branching ani wormhole/Einstein–Rosen jako działających funkcji bez istniejącego solvera;
- kopiowania stylu, nazw, assetów, ekranów lub logotypów z `Sliders`, `Interstellar`, `Stargate Atlantis` albo innych franczyz;
- nowych frameworków, jeśli funkcja już istnieje.

Każda nieobecna capability musi pozostać `NOT_MODELED`, `UNSUPPORTED`, `PARKED` albo `VERIFY_REQUIRED` — zależnie od dowodu.

## Obowiązkowa procedura przed implementacją

1. Sprawdź aktualny HEAD LIVE oraz working tree.
2. Wykonaj `git fetch origin`.
3. Sprawdź diff swojego brancha względem aktualnego LIVE.
4. Odczytaj ostatni `MASTER_EXECUTION_STATUS.md`, `ONTOLOGY_CAPABILITY_AUDIT.md`, `GENESIS_PACKAGE_ORCHESTRATION_CONTRACT.md` oraz `GENESIS_NON_STOP_EXECUTION_ORDER.md`.
5. Nie zakładaj starych SHA.
6. Zrób listę plików, które rzeczywiście zmienisz.
7. Jeśli rozwiązanie dotyka istniejącego LIVE behavior, zatrzymaj implementację i wybierz thin adapter albo blocker record.

## Wymagany deliverable

Dostarcz jeden z dwóch rezultatów:

### Rezultat ACCEPT / ADAPT

- minimalny kod adaptera lub test/proof;
- testy jednostkowe i integracyjne;
- dokument `docs/CTO_DISCOVERY_CAMPAIGN_DECISION.md` z decyzją, zakresem i ograniczeniami;
- wskazanie istniejących modułów, które zostały użyte ponownie;
- dowód route → action → real result → provenance → Evidence/Replay;
- brak mocków i brak syntetycznych claimów.

### Rezultat BLOCKER / PARK

- dokument `docs/CTO_DISCOVERY_CAMPAIGN_DECISION.md`;
- dokładne pliki i kontrakty powodujące blocker;
- tabela `CONNECTED / PARTIAL / NOT_CONNECTED / NOT_MODELED`;
- dowód, że nie powstał drugi Evidence/Replay system;
- regression tests obecnego Experiment Fabric, jeżeli są potrzebne;
- jasny następny niezależny milestone.

## Definition of Done

Nie ogłaszaj sukcesu bez wszystkich punktów:

- implementacja albo formalnie udokumentowany blocker;
- testy frontend;
- testy backend, jeśli dotykasz backendu;
- TypeScript;
- lint;
- production build;
- `git diff --check`;
- Chromium desktop smoke;
- Chromium mobile smoke;
- rzeczywisty proof działania lub uczciwy proof blockera;
- CI GitHub green;
- clean working tree;
- commit i push do Twojego brancha;
- finalny raport z SHA, testami, CI, ograniczeniami i instrukcją integracji dla Manus.

Jeśli lokalny smoke używa innego portu niż uruchomiony frontend, napraw wyłącznie konfigurację uruchomienia i powtórz test. Nie traktuj braku portu jako regresji aplikacji.

## Zasada przekazania Manusowi

Nie rób merge do LIVE samodzielnie. Po zakończeniu podaj:

- branch;
- wszystkie commity;
- diff stat względem aktualnego LIVE;
- decyzję `ACCEPT`, `ADAPT`, `PARK` albo `REJECT`;
- listę zmian, które Manus powinien przenieść;
- listę zmian, których Manus nie powinien przenosić;
- testy, Chromium, build i CI;
- pozostałe ograniczenia naukowe i architektoniczne.

Twoja praca ma zwiększyć prawdziwą wartość Genesis. Raport bez proofu nie jest integracją, a efektowny parser bez modelu nie jest nauką.
