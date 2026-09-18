# GENESIS PHYSICS — audyt stanu faktycznego, porządek w menu, silniki w czacie, architektura „myślenia"

Data: 2026-09-18 · gałąź `claude/genesis-winner-gate-audit-qgf90v` · zasada: tylko to, co jest w kodzie i przechodzi testy. Liczby pochodzą z inwentaryzacji plików i z uruchomionych suit (sekcja 7), nie z deklaracji.

## 0. W jednym akapicie

Produkt istnieje i działa: 53 trasy, 13 laboratoriów, 118 komponentów, 52 katalogi rdzenia z 145 plikami testów wokół `core/agent`, 84 endpointy backendu, 119 decyzji w `docs/DECISIONS.md` (do D-121). Realny werdykt LOWER-HARM (LIRAGLUTIDE, bramka REQUIRES_HUMAN_APPROVAL) jest zamrożony, zreplikowany i opieczętowany SHA-256. Na tę gałąź inna sesja wypchnęła 12 commitów (149 plików) z pakietami Qwena w `packages/core` i `packages/ui`: **nie są one workspace'ami, nie są typowane przez `tsc -b`, nie były uruchamiane z katalogu, z którego uruchamia je CI, i poza trzema wyjątkami nic w produkcie ich nie importuje.** Ten audyt naprawił to, co było czerwone (14 testów, 4 błędy lintu, brak runnera testów dla `packages/core`), podłączył co da się podłączyć uczciwie, a resztę nazywa po imieniu. Osobno: gałąź `main` ma dziś zamiast produktu sam ekran cząsteczek (sekcja 6).

## 1. Co już mamy (inwentarz faktyczny)

### 1.1 Frontend — trasy i ekrany

| Warstwa | Liczba | Źródło |
|---|---|---|
| Trasy hash w `App.tsx` | 53 rodzaje (57 literałów + `#/lab/:id`) | `parseHash()` / `renderRoute()` |
| Laboratoria fizyki (`#/lab/:id`) | 13 (universe, spacetime, einstein, quantum, atom, nuclear, particle, chemistry, multiverse, civilization, biology, mathematics, discovery) | `labs/index.ts` |
| Komponenty | 118 (67 top-level, 15 `genesis-ui`, 25 `visual-simulation`, 4 `guide`, 4 `liveMatrix`, 3 `looking-glass`) | `components/**` |
| Komponenty z testem | 54 (60 wg luźniejszego kryterium) | `__tests__/**` |
| Menu | 5 drzwi + „Zapytaj" + 34 pozycje w „Wszystkie moduły" (1 planned bez trasy) | `core/navigation.ts` |
| Trasy poza menu | 14 (`#/investor-demo`, `#/discovery-hall`, `#/lab/:id`, `#/monetize`, `#/physics/cms-z`, `#/sim-world`, `#/city`, `#/compare`, `#/concept`, `#/character`, `#/reality`, `#/prebuild`, `#/hf-slice`, `#/virtual-bio`) | komentarz w `navigation.ts` |

Ekrany produktu (każdy z opisem „co robi" w nagłówku pliku): Start (pytanie, 3 drzwi, pasek stanu), Konsola badawcza (`#/research-console`, werdykt-first, Winner Gate, Research Recipe, replay, pieczęć D-121), Genesis Tour (`#/tour`), Discovery Hall 3D, Światy 3D (hub), Miasto 3D WebGL, Laboratorium 1. osoby, Molecule Lab (RDKit), Virtual Cell Lab (RK4 G1/S/G2M), Looking Glass, Evidence Bundle, Pamięć naukowa, Projekty (chmura, RBAC), Kampania naukowa, Drug Discovery, Kampania rządowa, CDE, Pilot eksperymentu, Autonomiczne dochodzenie, Kalibracja, Konflikt modeli, Decision Explorer, Discovery Timeline, Deszyfracja, Cyber, Matrix hub, Investor demo, **Mity i Teorie** (`#/myths-theories`, nowe, sekcja 5).

### 1.2 Rdzeń naukowy (`packages/frontend/src/core`)

52 katalogi + 45 plików luzem. Najcięższe (pliki .ts / testy importujące):

| Katalog | .ts | Testy | Rola |
|---|---|---|---|
| `agent/` | 98 | 145 | pętle autonomiczne: `runAutonomousInquiry`, `runDiscoveryCampaign`, `runAutonomousOrchestrator`, rejestr sfalsyfikowanych modeli, bateria samofalsyfikacji, Tautology Gate, protokół adjudykacji |
| `worldModel/` | 60 | 99 | graf przyczynowy, ECS, silnik temporalny, router solverów, domeny |
| `three/` | 62 | 80 | sceny 3D (`LabScene3D`, `EpidemicCity3DSim`, Genesis Field) |
| `biotechData/` | 38 | 60 | przypięte dane ChEMBL/ClinicalTrials/PubChem/NASA/Zenodo + preregistracje A1/A2/A3/E2E/LOWER-HARM/QE4 |
| `experimentFabric/` | 39 | 71 | request → plan → run, kampania badawcza (`runResearchCampaign`) |
| `discovery/` | 35 | 23 | silnik odkryć, custody, bramki, D-062 |
| `simulation/` | 15 | 36 | Scenario Engine (nazwane, powtarzalne przebiegi) |
| `events/` | 14 | 40 | kontrakt zdarzeń, transmisje |
| `orchestrator/` | 17 | 17 | 20-etapowy pipeline, rejestr domen `LOWER_HARM / E2E01 / MIND`, `govLowerHarmDiscovery`, pieczęć D-121 |
| `hazard/` | 20 | 15 | trzęsienie ziemi (jedyny zarejestrowany hazard), custody, replay |
| `guide/` | 5 | 3 | przewodnik głosowy (D-119) |
| `audit/` | 2 | 2 | pieczęć SHA-256 i ledger (D-121) |
| `evidenceConnectors/` | 7 | 6 | zewnętrzne źródła: zamrożone artefakty, hash per źródło, fail-closed |

### 1.3 Backend (`packages/backend`)

84 handlery HTTP (4 w `server.mjs`: health, AI proxy, world-proposal, biotech proxy; 80 w `api.mjs`: auth 4, compute/physics 14, worlds 4, security 1, projekty/RBAC 11, git 6, trials 4, knowledge+GIS 9, drug/biotech+jobs 10, kampanie 17) + nowy `/api/speculative/run`. 16 modułów + 45 w `campaign/` + 18 adapterów compute + 10 workerów Python + 8 benchmarków + 5 security. 87 plików testów. SQLite (`node:sqlite`), scrypt, rate limiter, nagłówki bezpieczeństwa, jobs asynchroniczne (202).

### 1.4 Dane przypięte, skrypty, dokumentacja

- Realne, przypięte zbiory z hashami: A1/A2/A3 (ChEMBL + ClinicalTrials.gov, `meta.json` z SHA-256), GOV-E2E-01, QE4 Brydges (Zenodo, 32 pliki), CMS Zmumu (CERN, manifest CC0), NASA NSSDC, GLP-1R/GIPR (`campaign/*.meta.json`), transkrypcje pod custody (`data/`, 39 plików), `artifacts/lower-harm/*` (winner-record, recipe, replay, **audit-seal, audit-chain**).
- 49 skryptów npm; 71 skryptów w `scripts/`, z czego 33 niepodpięte (głównie fetch/pin i demonstratory D-088…D-108).
- 148 dokumentów w `docs/`, 119 decyzji `## D-` w `DECISIONS.md`.

## 2. Plan uproszczenia menu (UI cleanup)

**Stan.** `core/navigation.ts` (D-118) ma już jedną sekcję z 5 pozycjami głównymi + akcją „Zapytaj" oraz 34 pozycje w „Wszystkie moduły" (jedna, `sovereign`, oznaczona jako *planned* bez trasy). 14 tras istnieje poza menu (m.in. `#/investor-demo`, `#/discovery-hall`, `#/lab/:id`, `#/monetize`, `#/physics/cms-z`, `#/sim-world`, `#/city`, `#/compare`, `#/concept`, `#/character`, `#/reality`, `#/prebuild`, `#/hf-slice`, `#/virtual-bio`). Problem nie leży w pierwszym poziomie (jest już prosty), tylko w drugim: 34 płaskie pozycje bez opisów, wymieszane światy, narzędzia badawcze, demonstratory i prototypy.

**Zasada „2 kliknięcia".** Każda funkcja, której urzędnik lub laik potrzebuje, musi być osiągalna: 1 klik = drzwi (Start → jedna z 5 pozycji), 2 klik = konkretny ekran wewnątrz drzwi. Wszystko, co jest prototypem, demonstratorem lub warstwą wizualną bez własnego wyniku naukowego, schodzi do trzeciego poziomu („Warsztat") i nie pojawia się w menu głównym.

| Poziom 1 (5 drzwi + Zapytaj) | Poziom 2 (co za drzwiami, 2. klik) | Trasy, które tam wchodzą |
|---|---|---|
| **Start** | pytanie, 3 drzwi, pasek stanu (jak dziś) | `#/` |
| **Zapytaj** (akcja) | jeden Science Chat + przełącznik silnika (sekcja 3) | akcja, `#/looking-glass` jako tryb „sprawdzalne twierdzenia" |
| **Odkrycia** | Konsola badawcza · Genesis Tour · Discovery Hall · Evidence i Replay · Dziennik odkryć · Candidate Dossier | `#/research-console`, `#/tour`, `#/discovery-hall`, `#/evidence`, `#/discovery-log`, `#/dossier` |
| **Światy 3D** | Miasto · Laboratorium 1. osoby · Molecule Lab · Discovery Hall · Virtual Cell Lab (hub już istnieje) | `#/worlds` → `#/city3d`, `#/first-person-lab`, `#/molecule`, `#/discovery-hall`, `#/cell-lab` |
| **Dowody i pamięć** | Pamięć naukowa · Evidence Bundle · Projekty (chmura) · Kampania naukowa | `#/memory`, `#/evidence`, `#/projects`, `#/campaign` |
| **Ustawienia** | konto, projekty, przewodnik głosowy (głos/napisy/język), tryb badawczy | `#/settings` |

**Trzeci poziom „Warsztat" (jedna pozycja w Ustawieniach lub stopce, nie w menu).** Trzy podgrupy z opisem jednozdaniowym każda:
- *Laboratoria fizyki* (13 labów `#/lab/:id`, Generator symulacji `#/generate`, Co by było gdyby `#/what-if`, Konflikt modeli `#/conflict`, Porównanie modeli `#/compare`).
- *Silniki badawcze* (Silnik odkryć CDE `#/cde`, Pilot eksperymentu `#/pilot`, Autonomiczne dochodzenie `#/inquiry`, Kalibracja `#/calibration`, Precision Reference `#/molecular-reference-analysis`, Drug Discovery `#/drug`, Kampania rządowa `#/gov-campaign`, Cyber `#/cyber`, Deszyfracja `#/decipherment`, Splątanie `#/entanglement`, Kopuła vs kula `#/dome-world`, Kogo chronić `#/protection-priority`, Geodezyjne `#/geodesics`).
- *Wizualizacje i prototypy* (Matrix `#/matrix`, World Engine `#/genesis-world`, Scientific City `#/scientific-city`, Decision Explorer `#/decision-explorer`, Discovery Timeline `#/timeline`, Reality `#/reality`, Prebuild `#/prebuild`, Concept film `#/concept`, Character Lab `#/character`, HF slice `#/hf-slice`, Sim World `#/sim-world`, Zaproponuj świat `#/world-proposal`, Investor demo `#/investor-demo`, Monetize `#/monetize`, CMS Z→μμ `#/physics/cms-z`, Virtual bio `#/virtual-bio`).

**Co to zmienia w kodzie (jedna decyzja, bez nowych modułów).** `MORE_ITEMS` dostaje pole `group: 'labs' | 'engines' | 'prototypes'` i jednozdaniowy `description`; `AppShell` renderuje „Wszystkie moduły" jako trzy zwinięte grupy zamiast płaskiej listy; pozycja `sovereign` (planned, bez trasy) wypada z menu do dokumentacji. Test `navigation ↔ router` pozostaje: każda trasa nadal ma pozycję lub jest jawnie wymieniona jako „poza menu". Żadna trasa nie jest usuwana.

**Widok „urzędnik w terenie" (telefon).** Pasek dolny (już istnieje na mobile) pokazuje tylko: Start · Zapytaj · Odkrycia · Dowody. Światy 3D i Warsztat są ukryte na telefonie (WebGL pod software GL i tak nie działa płynnie), dostępne po rozwinięciu.

## 3. Dynamiczne przełączanie silników w czacie

**Co już istnieje (fakty z kodu).**
- Jeden punkt dyspozycji silników: `core/orchestrator/genesisDomainRegistry.ts` (D-059) z `GenesisDomainId = 'LOWER_HARM' | 'E2E01' | 'MIND'`, `runGenesisDomainDiscovery(id, opts)` i `replayGenesisDomainDiscovery(id, opts)`. Dziś woła go wyłącznie `GenesisConsole.tsx` (przełącznik SANDBOX / REAL LOWER-HARM / synthetic demo).
- Science Chat (`core/scienceChat/resolveCommand.ts`) rozpoznaje intencje deterministycznie (słowa kluczowe po normalizacji) i otwiera istniejące modele: epidemia SIR/SEIR/SEIRD z R₀, żywe miasto, Virtual Cell Lab, laboratoria fizyki, Pilot eksperymentu, trzy ciała itd. Każda odpowiedź niesie *disclosure*: `modelId`, `engine`, `resultOrigin` (`real-engine` / teoretyczny), `runFingerprint`, `limitations`, status Evidence Pack i A/B (`ScienceChat.tsx` linie 152–307).
- Pieczęć audytu: od D-121 każdy `RunResult` niesie `auditSeal.sha256`; ledger klienta w `core/audit/auditLedger.ts`.

**Czego brakuje.** Chat nie woła rejestru domen (nie uruchomi LOWER_HARM ani MIND), a jego disclosure nie pokazuje pieczęci SHA-256. Nie ma pojęcia „aktywny silnik" jako stanu sesji chatu.

**Projekt (bez nowego silnika, bez zmiany rdzenia).**
1. **`core/scienceChat/engineSelection.ts`** — czysta funkcja `resolveEngine(message, current): EngineSelection`, gdzie `EngineId = GenesisDomainId | 'EPIDEMIC' | 'CELL' | 'PHYSICS_LAB' | 'AUTO'`. Jawna komenda przełącza (`/silnik lower-harm`, „przełącz na Lower Harm", „użyj silnika epidemii"); brak komendy = `current`; `AUTO` = dotychczasowy `resolveCommand`. Deterministyczna, testowalna, nic nie zgaduje: nieznana nazwa silnika zwraca `UNKNOWN_ENGINE` z listą dostępnych, nigdy „najbliższy".
2. **Stan sesji chatu**: `activeEngine` w istniejącym stanie `ScienceChat.tsx` (jedna instancja czatu na aplikację, więc jeden stan). Pasek nad polem wpisywania: chip `SILNIK: LOWER-HARM · REAL` z menu wyboru (te same etykiety REAL / SYMULACJA / MODEL co `WorldChrome`).
3. **Wykonanie**: dla `EngineId ∈ GenesisDomainId` chat woła `runGenesisDomainDiscovery(id, { mode: 'PRODUCTION', nl: message })` — tę samą funkcję, którą woła konsola — i renderuje **ten sam `RunVerdictHero`** w dymku odpowiedzi (werdykt, bramka, pieczęć SHA-256, ledger). Dla silników modelowych (EPIDEMIC, CELL, PHYSICS_LAB) zostaje obecna ścieżka `resolveCommand` i obecne disclosure.
4. **Pieczęć w oknie czatu**: `ChatDisclosure` dostaje pole `auditSeal?: { sha256, chainIndex }`; dla przebiegów domenowych z `RunResult.auditSeal`, dla modeli chatowych z nowej, tej samej funkcji `sealAuditSnapshot` nad istniejącym `runFingerprint` + `modelId` + `engine` (snapshot bez czasu, więc powtarzalny). Wiersz w dymku: `Silnik · LOWER-HARM · seal 8072bb69… · łańcuch 3/3 OK`.
5. **Przełączenie w locie w trakcie przebiegu**: przebieg jest atomowy (`runGenesisDomainDiscovery` to jedna obietnica); zmiana silnika w trakcie ustawia `pendingEngine` i obowiązuje od następnej wiadomości. Chat pokazuje „Silnik zmieni się po zakończeniu bieżącego przebiegu". Żadnego przerywania w połowie: przerwany przebieg nie ma pieczęci.
6. **Uczciwość**: silniki bez realnych danych (np. katastrofy inne niż trzęsienie, onkologia) **nie pojawiają się** na liście silników. Lista jest generowana z rejestru domen + rejestru modeli chatu, nie z tablicy napisów.

**Nakład.** ~1 nowy plik czysty + testy (selekcja silnika: komendy, nieznane nazwy, PL/EN), ~60 linii w `ScienceChat.tsx`, ~10 linii w disclosure. Rdzeń naukowy: 0 zmian.

## 4. Architektura „myślenia" Genesis — co trzeba zbudować, żeby system wnioskował autonomicznie

**Teza techniczna.** Genesis nie potrzebuje „nowego silnika myślenia". Trzy pętle autonomiczne już istnieją i są testowane; brakuje im **planisty w tle, trwałego stanu i jednej bramki uczciwości na wyjściu**. „Myślenie" to tutaj: wybór następnego eksperymentu *na podstawie* wyniku poprzedniego, z zapisaną ścieżką i z falsyfikacją jako domyślnym ruchem, a nie generowanie tekstu.

### 4.1 Co już jest (fakty z kodu)

| Mechanizm | Plik | Co robi | Reguła stopu |
|---|---|---|---|
| Dochodzenie parametryczne | `core/agent/inquiryLoop.ts` (`runAutonomousInquiry`) | następna sonda wybierana tak, by **rozróżnić** dwie najlepsze hipotezy (`DISCRIMINATES_TOP_TWO`), aktualizacja przekonań, realny run przez router/executor | `NO_CONTENDERS_LEFT`, `NO_DISCRIMINATING_PROBE`, `ROUND_BUDGET_EXHAUSTED`, `MEASUREMENT_FAILED` |
| Kampania odkryć | `core/agent/discoveryCampaign.ts` (`runDiscoveryCampaign`) | gramatyka modeli, modele **dodawane w trakcie** z reszt zwycięzcy, preregistracja (anti-HARKing), luki obserwacyjne jako pytania na zewnątrz | `CONVERGENCE`, `NO_INFORMATION_GAIN`, `ALL_MODELS_UNFITTABLE`, `ANTI_HARKING_VIOLATION`, `OBSERVATION_GAP`, `EXPERIMENT_SPACE_EXHAUSTED` |
| Orkiestrator kampanii | `core/agent/campaignOrchestrator.ts` (`runAutonomousOrchestrator`) | łańcuch kampanii: tylko seed od człowieka, kolejne kierunki z reszt; `autonomyProven` tylko gdy każda kolejna kampania wyszła z kierunku wygenerowanego przez system | `CONVERGED`, `NO_FEASIBLE_EXPERIMENT`, `REDUNDANT_DIRECTION`, `FALSIFIED_DIRECTION`, `INSUFFICIENT_DATA`, `MAX_CAMPAIGNS_REACHED` |
| Kampania badawcza (Fabric) | `core/experimentFabric/researchCampaign.ts` | cykle: hipotezy → preregistracja → wykonanie → łańcuch dowodów → następny eksperyment; kontynuacja tylko przy `READY_TO_RUN`, inaczej `NO_JUSTIFIED_NEXT_QUESTION` | `MAX_CYCLES_REACHED` raportowane osobno |
| MIND | `core/mind/runResearch.ts` (w rejestrze domen) | wielorundowa pętla hipotez w przestrzeni modeli | `shouldContinue` wstrzykiwane |
| Falsyfikacja jako pamięć | `falsifiedModelRegistry.ts`, `selfFalsificationBattery.ts`, `tautologyGate.ts`, `integrityGates.ts`, `bannedStringScanner.ts` | sfalsyfikowane modele nie wracają; bateria kontrprzykładów; blokada tautologii; skan zakazanych twierdzeń („bezpieczny", „cudowny lek") | — |
| Trwałość | backend `agentRun.mjs` (rekord wznawialny), `campaigns/*/start` (job 202), `science-runs/*/verify` (replay przez realny silnik) | pętla może przeżyć restart procesu (test P0.2 w `autonomousDiscoveryLoop.test.ts`) | — |
| Uczciwość wyjścia | Winner Gate (3 koniunkty), custody SHA-256, pieczęć D-121, `resultOrigin`/`dataLabel` w disclosure | wynik bez realnych danych nigdy nie jest WINNER | — |

### 4.2 Czego brakuje (5 elementów, każdy nad istniejącym kodem)

1. **Planista w tle (`core/agent/thinkingScheduler.ts`)** — kolejka „pytań otwartych" z trzech źródeł, które już istnieją: `OBSERVATION_GAP` z kampanii, `nextExperiment` z Fabric, `residualFindings` z orkiestratora. Planista nie wymyśla pytań; bierze je z wyników. Uruchamia `runAutonomousOrchestrator` jako **job backendu** (`/api/projects/:id/jobs`, już jest), z budżetem rund i czasu.
2. **Stan trwały pętli** — każda runda zapisywana jako `agentRun` (istnieje) + pieczęć D-121 łączona w łańcuch (`previousSha256`), tak że przerwana pętla wznawia się z ostatniego zweryfikowanego ogniwa, a ledger pokazuje całą ścieżkę myślenia.
3. **Jedna bramka wyjścia (`core/agent/honestOutputGate.ts`)** — nic z pętli nie trafia na ekran ani do pamięci naukowej bez przejścia: `integrityGates` → `bannedStringScanner` → `tautologyGate` → etykieta (`REAL / MODEL_ESTIMATE / SCENARIO`) → pieczęć. WINNER tylko z realnego Winner Gate; wszystko inne to `HYPOTHESIS` / `NO_WINNER` z powodem.
4. **Generator kierunków ograniczony do rejestrów** — `directionFinder.ts` + `novelHypothesisGenerator.ts` mogą proponować tylko w obrębie zarejestrowanych laboratoriów (`registry.ts`), domen (`genesisDomainRegistry`) i przypiętych zbiorów (`datasetRegistry`, `biotechData`). Pytanie poza rejestrem = `OBSERVATION_GAP`, nigdy zmyślony wynik.
5. **Bramka ludzka** — `governance/approve` (istnieje, tylko zawęża uprawnienia) jako jedyny sposób publikacji: pętla może **proponować** (jak `ProposeOnlyLearner` z pakietu Qwena), człowiek zatwierdza. To jest ta sama zasada, którą dziś ma `candidate.activate`.

Kolejność: 3 → 2 → 1 → 4 → 5. Bez bramki wyjścia (3) uruchamianie pętli w tle jest ryzykiem; z nią każdy krok jest audytowalny.

## 5. Pakiety, które wylądowały na tej gałęzi (audyt „czy Manus czegoś nie pominął")

Inna sesja wypchnęła commity `009f219c…8d03d9cf` (149 plików, 5 380 linii). Stan po tym audycie:

| Element | Stan | Werdykt / co zrobiono |
|---|---|---|
| `packages/core`, `packages/ui` jako workspace'y | **BRAK** (`workspaces` = frontend, backend, csrn; brak `package.json`/`tsconfig.json`) | Nie są typowane przez `tsc -b`, nie budowane, nie objęte `npm test`. Zostawione jako pakiety źródłowe; dodano `vitest.core.config.ts` + `npm run test:core` + krok CI, więc ich 26 plików testów (261 testów) **są od teraz uruchamiane**. Pełne uworkspace'owanie = decyzja właściciela (sekcja 8). |
| Alias `@genesis/core/*` | JEST (tsconfig + vite) | Poprawny. Używany przez 0 plików produktu; `core/city/*` importuje względnie. |
| Testy frontendu przepisane na `cwd = root` | BYŁO CZERWONE (14 testów) | Naprawione: `__tests__/fixtures/repoPaths.ts` działa z obu katalogów; CI uruchamia z `packages/frontend`. |
| Lint | BYŁ CZERWONY (4 błędy) | Naprawione (bundle esbuild z nagłówkiem disable, `const`, prefix `_`). |
| Speculative solvers (`retrocausal-tree`, `torsion-boundary`, `warp-metric`) | JEST: `packages/core/src/solvers/speculative` → bundle `backend/src/compute/speculative-core.mjs` → `/api/speculative/run`; 4 testy backendu zielone; API odrzuca `allowUnphysicalSandbox !== true` (`sandbox_disabled`, sprawdzone curl) | OK jako **izolowany sandbox**; bundle jest generowany ręcznie (brak skryptu `compute:bundle` dla niego — do dodania). Kanał kliniczny nietknięty. |
| Mity i Teorie (`#/myths-theories`) | JEST: trasa, pozycja menu, 3 karty, flaga `allowUnphysicalSandbox: true`, ostrzeżenia, odcisk SHA-256; sprawdzone w Chromium (tytuł, bramka, `RETROCAUSAL_FIXED_POINT`, 0 błędów); dodane do smoke | Uwaga: przy braku odpowiedzi backendu w 900 ms ekran pokazuje `offline-preview` z lokalnym podsumowaniem — etykietowane, ale timeout jest za krótki pod obciążeniem (do podniesienia). |
| Knowledge vertical slice (`packages/core/src/knowledge`) | JEST, 6 plików, testy zielone, `propose-only`, brak `Math.random`/`Date.now` | Czysty kod, **niepodłączony** do produktu. Dubluje 3 istniejące podsystemy (`evidenceConnectors` ledger+hash, `csrn` certyfikaty, `scienceMemory`). Używa `node:crypto` → nie do przeglądarki bez adaptera. Rekomendacja: zostawić jako proposal, ewentualnie przenieść `classifyClaim` (jedyna nowa reguła: wideo nigdy `verified`) do `core/knowledge`. |
| Omni-Ingestion (`packages/core/src/knowledge/ingestion`, 7 plików + `ProposeOnlyLearner`) | DODANE w tym audycie: oficjalne API z wstrzykiwanym `KeyProvider`, adapter WWW świadomy `robots.txt` z retry/backoff i limitem, rejestr polityk prawnych (YouTube/FB/X/Telegram = `PENDING`, tylko oficjalne API), zero automatyzacji przeglądarki; 13 testów zielone, w tym test end-to-end: pobrane elementy trafiają do ledgera **wyłącznie jako propozycje** | **Niepodłączone do czatu.** Podłączenie wymaga: endpointu backendu (`/api/knowledge/ingest`, bo `node:crypto` i egress sieci nie mogą działać w przeglądarce), trwałego ledgera w SQLite (dziś in-memory), polityki kluczy w `.env.example` i ekranu zatwierdzania propozycji. Dwie poprawki względem dostawy: parser id postu (`\d{5,}` odrzucał własny test) i nieużywane przypisanie (lint). Decyzja właściciela: sekcja 8. |
| `frontend/core/city/*` (Disaster engine, Digital twin) | JEST, testy zielone, importuje `packages/core/city-enterprise` (SEIR/powódź/blast) | Deterministyczne, etykietowane `SYNTHETIC_CRISIS_MODEL`; **celowo nie podpięte** do tras (własna adnotacja w `moduleReachability`). Nie zawiera liczb ofiar z literałów. Do podpięcia pod Miasto 3D dopiero po przeglądzie UX i etykiet. |
| `supreme/` (15 silników: Enterprise Monetizer z cennikiem, ClassifiedInquiry, AGI core, Wetware „gnostic exploit", Bio/Virology, Satellite, HPC…) | JEST, testy zielone (testują same siebie) | **Martwy kod w produkcie**: 0 importów z aplikacji. Zawiera treści niezgodne z Honest Mode (`GenesisWetwareGnosticExploit`: „fictional… biohacking placeholders"; cennik B2G w kodzie; „AGI" = sumowanie stałych). Nie promować, nie podpinać. Rekomendacja: przenieść do `proposals/` poza `packages/`, albo usunąć. |
| `advanced/` (HyperMicroscope, MarketGapHarvester, CyberBastion) | JEST, testy zielone | Martwy kod; CyberBastion dubluje `auth.mjs`/`secrets.mjs`. Jak wyżej. |
| `genesis9d/`, `quantum-lab/`, `molecular-engine/`, `mirror/`, `evidence/`, `connectors/`, `glue/`, `engine/`, `reports/` | JEST, testy zielone, brak barreli w 8 z 14 katalogów | Martwy kod względem produktu. `molecular-engine` dubluje `compute/cheminformatics` + RDKit backendu. |
| `packages/ui/src/render/*` (renderery Matrix, cyber ecosystem), `ui/routes`, `ui/state` | JEST | Nie importowane przez `packages/frontend`. Produktowy Matrix Premium (D-118) pozostaje w `components/liveMatrix`. |
| Z inwentarza Qwena **nie ma w repo**: `check-secrets.mjs`, `inject-proprietary-headers.mjs`, `deploy.sh`, `vite.hardened.config.ts`, `GenesisClockProvider`, `GenesisDashboardEngine`, `GenerativeVideoPipeline`, ManifestComposer/DirectorReasoningLoop, deep-truth | BRAK | Nigdy nie dotarły na tę gałąź. `docker-compose.yml` i `Dockerfile` zmienione minimalnie (10 linii). |
| Nagłówki „Proprietary / All Rights Reserved" w nowych plikach | JEST w części | Decyzja licencyjna właściciela; nie wpływa na działanie. |

Reguła audytu pozostaje: **nic z tych pakietów nie dotyka preregistracji, progów, Winner Gate ani odcisków** (audyt 6615057e / recipe 7ddcabe9 / rekord b6207e9c / pieczęć 8072bb69… bez zmian, `npm run audit:verify` VERIFIED).

## 6. Gałąź `main` — „straszna grafika"

`origin/main` (= `railway-production-ready`, commity „cinematic prompt-driven Matrix command center", „restore full Genesis worlds…", „smooth radial Matrix rain droplets") renderuje na trasie głównej `GenesisEngineApp` = `GenesisCanvas` (pole cząsteczek) + `GenesisHUD` (pasek „GENESIS COMMAND CENTER · READY · RECOMPOSE"). `App.tsx` na `main` nie zawiera `AppShell` ani `StartHero`; względem tej gałęzi w `packages/frontend/src` ubyło 1 296 linii. To jest ekran ze zrzutu o 03:24. Produkt (menu, Start, konsola, światy, przewodnik, Mity i Teorie) jest w całości na **tej** gałęzi. Decyzja właściciela (podjęta tego samego dnia, na piśmie: „scalaj z genesis i działaj"): `main` jest źródłem deployu, więc ta gałąź została scalona do `main` z zachowaniem powłoki produktu — `App.tsx` z `AppShell`/`StartHero`/wszystkimi trasami, a pliki z `main` (`GenesisEngineApp`, `GenesisCanvas`, `GenesisHUD`, `HyperStateVisualizer`, `engine/GenesisShaders`, `engine/HyperMath`, `render/GenesisQualityUpgrade`) zostały jako nietrasowane, wpisane na listę wyjątków w `moduleReachability.test.ts`. Scalenie zdjęło też z `Dockerfile` `VOLUME ["/data"]` (P0.2 trwałość bazy) — przywrócone. `RAILWAY_DEPLOY.md` wskazuje `main`. Weryfikacja po scaleniu: sekcja 7.

## 7. Weryfikacja liczbowa (stan po scaleniu i po pakiecie nocnym)

Wszystkie liczby pochodzą z realnych uruchomień w tej sesji; nic nie jest szacowane. Ostatnia kolumna zostanie uzupełniona po zakończeniu pakietu nocnego (sekcja 9).

| Kontrola | Po scaleniu z `main` (commit `299fa0a8`) | Po pakiecie nocnym |
|---|---|---|
| `npm run lint` | 0 błędów | _do uzupełnienia_ |
| `tsc --noEmit` (frontend) | 0 błędów | _do uzupełnienia_ |
| `vite build` | OK | _do uzupełnienia_ |
| Frontend vitest | 569 plików, 6621 pass, 1 skip | _do uzupełnienia_ |
| Backend `node --test` | 844 testy, 811 pass, 33 skip, 0 fail | _do uzupełnienia_ |
| `npm run test:core` (packages/core + packages/ui) | 26 plików, 261 testów (w tym 13 ingestion + 1 EnvKeyProvider) | _do uzupełnienia_ |
| Smoke desktop (`scripts/smoke-e2e.mjs`) | 34 trasy + 13 labów, 0 błędów konsoli | _do uzupełnienia_ |
| E2E (`npm run e2e`) | 18/18 | _do uzupełnienia_ |
| Lejek (`funnel`) / przepis (`recipe`) | 5/5 / 8/8 | _do uzupełnienia_ |
| `npm run audit:verify` (D-121) | VERIFIED, pieczęć `8072bb69…` | _do uzupełnienia_ |

## 8. Decyzje właściciela (otwarte)

1. **Pakiety staged** (`supreme/`, `advanced/`, `genesis9d/`, `quantum-lab/`, `molecular-engine/`, `packages/ui`): dla każdego — świat z trasą i etykietą epistemiczną, dalej propozycja, albo usunięcie. Bez decyzji pozostają tylko testowane (D-122).
2. **Ingestion**: flip `legalStatus` na `VERIFIED` dla konkretnych domen wymaga pisemnej weryfikacji prawnej; klucze `YOUTUBE_API_KEY` / `X_API_KEY` / `FACEBOOK_API_KEY` dostarcza właściciel (nigdy w repo). Publikacja propozycji zawsze przez zalogowanego zatwierdzającego.
3. **Serwer kwantowy**: `QPU_API_URL` + `QPU_API_KEY` (IBM Quantum / AWS Braket lub inny REST) — bez nich `/quantum` liczy wyłącznie na lokalnym symulatorze z etykietą `MODEL_ESTIMATE`. Który dostawca i jaki budżet — decyzja właściciela.
4. **Deploy**: Railway śledzi `main`; po każdym scaleniu wymagany redeploy (panel Railway). Wolumen `/data` musi pozostać w `Dockerfile`.
5. **TTS**: bez płatnych kluczy; głos przewodnika pozostaje na Web Speech API przeglądarki.
