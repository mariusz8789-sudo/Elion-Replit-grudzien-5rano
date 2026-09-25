# Genesis — plan integracji żywego eksperymentu (drug discovery jako pierwszy)

Status: **PLAN, nic nie zaimplementowane.** Oparty na analizie kodu gałęzi `claude/genesis-total-consolidation` (4 audyty read-only, odnośniki plik:linia poniżej).

## 0. Zasada

```
QUESTION → HYPOTHESIS → PLAN → CONFIRM → REAL ENGINE EXECUTION → LIVE EXPERIMENT → LIVE OBSERVATION
→ RESULT → EVIDENCE → FALSIFICATION → REPLAY → NEXT EXPERIMENT
```

```
canonical engine (backend RDKit / Vina / PySCF / ADMET-AI)
   → persisted real state (campaign_events, science_runs, virtual-lab results)
   → read model w przeglądarce (czysta projekcja, bez obliczeń)
   → visualization adapter
   → jedna scena głównego laboratorium (AgentLabScene3D) + widoczny naukowiec
```

Scena i kamery **tylko czytają** ten stan. Żadnej animacji, która udaje wynik. Czas trwania etapu na scenie = czas prawdziwego silnika (postęp = liczba zakończonych jednostek pracy / zaplanowanych, nie zegar).

## 1. Co już istnieje (reuse, bez duplikatów)

| Warstwa | Istniejący element | Gdzie |
|---|---|---|
| Wejście z czatu | `drugDiscoveryRequestFromMessage` → `UnifiedResearchJourney` | `ScienceChat.tsx:543`, `core/scienceChat/unifiedResearchJourney.ts:74` |
| Tożsamość, deskryptory | Research Intake (RDKit, fingerprint) | `backend/src/campaign/researchIntake.mjs:677` |
| Generowanie analogów | `runCampaign` (RDKit SMARTS + BRICS, Pareto, decyzje) | `backend/src/campaign/orchestrator.mjs:160` |
| ADMET, docking, QM | `runMultiFidelityStage` (ADMET-AI, Vina+Meeko, PySCF) | `backend/src/campaign/multiFidelity.mjs:267` |
| Pojedynczy eksperyment + dowód | Virtual Lab plan/execute/evidence/replay/dossier | `backend/src/campaign/virtualLabClosedLoop.mjs` |
| Log etapów (źródło prawdy) | `campaign_events` przez `store.addEvent` | `backend/src/campaign/persistence.mjs:133` |
| Replay | `verify.mjs` REPLAYERS, MATCH / DRIFT / ENGINE_VERSION_CHANGED | `backend/src/campaign/verify.mjs:85,157` |
| Werdykt bramki | `researchGateVerdict` ELIGIBLE / HELD / DENIED | `backend/src/campaign/scientificIntegration.mjs:78` |
| Następny krok | `deriveNextVirtualAction` | `virtualLabClosedLoop.mjs:913` |
| Geometria 3D molekuły | `chem-rdkit-embed3d` (ETKDGv3 + MMFF, prawdziwe Å) | `backend/src/compute/registry.mjs:405`, `core/worldModel/domains/molecularStructure.ts:169` |
| Laboratorium + naukowiec | `ScientificWorldsScreen`, `AgentController`, `planActions`, `ExperimentSession` | `components/ScientificWorldsScreen.tsx`, `core/scientificWorlds/*` |
| Handoff czat → stanowisko | `?station=<id>&k=v` + `genesis-product-route` | `ScientificWorldsScreen.tsx:303`, `worldCommand.ts:226` |
| Wynik / Dowody / Replay | `ScientificOutcomePanel` (`pillar: 'DRUG_DISCOVERY'` już istnieje) | `core/product/scientificOutcome.ts:17` |

**Nie przenosimy** stanowisk dockingu/PK z commitu `0efeb774`: używały frontendowego `moleculeDockingEngine` (proxy), czyli drugiego dockingu obok backendowego Vina. Docking = tylko backend Vina.

## 2. Luki blokujące żywy przepływ (fakty)

1. **Backend liczy synchronicznie** (`execFileSync`, `rdkitAdapter.mjs:29`). `runCampaign` i `runMultiFidelityStage` blokują pętlę zdarzeń, więc nikt nie zobaczy etapów w trakcie — tylko „przed” i „po” (potwierdza `e2e/src/labClosedLoop.e2e.spec.ts:62`).
2. **Brak strumienia**: nie ma SSE/WebSocket; jest tylko `GET …/campaigns/:cid/events` bez kursora.
3. **Sesja laboratorium jest liczona w jednej klatce** (`agentController.ts:224`, runner synchroniczny). Naukowiec nie może „czekać na silnik”.
4. **Chat-journey uruchamia tylko deskryptory** (`unifiedResearchJourney.ts:166`); ADMET/docking/QM tylko z `#/campaign`.
5. **Brak falsyfikacji dla leków**: `falsificationStatus: 'NOT_RUN'` stale; Virtual Lab daje SUPPORT/CONFLICT tylko gdy plan ma `expectation`, a czat żadnej nie wysyła. `WEAKENED` nie istnieje nigdzie.
6. **Poza dockingu nie jest dostępna**: `docked.pdbqt` leży na dysku, brak endpointu (`dock_worker.py:136`). Receptor w kampanii to **zastępcza mała cząsteczka (indol)**, nie białko (`multiFidelity.mjs:299`).
7. **Synteza**: `synthesisReadiness` to etykieta (zawsze `SOURCE_REQUIRED`/`BLOCKED`, `researchIntake.mjs:610`). Nie ma retrosyntezy nigdzie. Realne kroki chemiczne w silniku: pojedyncze transformacje RDKit (rodzic → produkt) i BRICS (rodzic → fragmenty → produkt).
8. **Scena** buduje meble tylko dla znanych stanowisk (`agentLabScene3D.ts:719`); nie ma API „pokaż molekułę”. `core/three/*` należy do Astry.

## 3. Architektura docelowa (bez drugiego solvera, routera, ledgera, replay, renderera)

### 3.1 Backend — ten sam pipeline, widoczny w trakcie
- `runCampaign` / `runMultiFidelityStage` / lokalne `execute`: **oddać pętlę zdarzeń między jednostkami pracy** (`await setImmediate` po każdym kandydacie/etapie) lub przenieść wywołanie workera na asynchroniczny `execFile`. Te same funkcje, te same wyniki, te same hashe — test: fingerprinty przed/po zmianie identyczne.
- `GET …/campaigns/:cid/events?after=<seq>` — kursor na istniejącym logu (jedyny nowy endpoint strumieniowy; SSE opcjonalnie później na tym samym `addEvent`).
- `GET …/science-runs/:runId/artifacts/:kind` — odczyt `docked.pdbqt` / `receptor.pdbqt` z weryfikacją sha256 z rekordu runu (read-only, allowlist ścieżki).

### 3.2 Frontend — jeden read model
- `core/liveExperiment/drugRunState.ts`: **czysta projekcja** `campaign_events` + `science_runs` + wyników Virtual Lab → `LiveDrugRunState { stage, units done/planned, candidates[{smiles, status, descriptors, admet, docking, qm, gate}], lineage[{parent, transformation, product}], stateHash }`. Nie liczy nic, tylko składa. `stateHash = stableHash(state)` (wspólny `determinism.ts`).
- Źródło współrzędnych: `createBackendGeometrySource` (RDKit embed3d) — ten sam co Molecule Lab.

### 3.3 Laboratorium — jeden świat, naukowiec wykonuje
- Nowe stanowisko `st-drug-bench` w `LAB_STATIONS` (`labWorld.ts`) z eksperymentem `drug-candidate-run`. Parser, nawigacja i przeszkody działają automatycznie.
- `AgentController`: nowy krok **EXECUTE_ASYNC** (w `core/scientificWorlds`, nie w `core/three`): naukowiec stoi przy stanowisku w stanie EXECUTING tak długo, jak prawdziwy run trwa; `progress` = jednostki z read modelu. Po stanie terminalnym runner **pieczętuje `ExperimentSession` z już policzonego stanu** (deterministycznie), więc `replayExperimentSession` działa jak dla innych stanowisk.
- Wizualizacja: adapter `DrugBenchVisualAdapter` jako **wrapper Sim3D poza `core/three`** (przekazywany do `useThreeLoop` zamiast `sim`), który dokłada grupy do `station:st-drug-bench`, używając eksportów `graphics/moleculeKit.ts` (import, bez edycji). Jeden kontekst WebGL.
- Co scena pokazuje, etap po etapie — **zawsze z tego samego stanu**:

| Etap silnika | Zmiana stanu | Obserwacja w scenie | Etykieta |
|---|---|---|---|
| Intake + RDKit | tożsamość, deskryptory | molekuła kandydata 3D (konformer RDKit) nad stanowiskiem, wartości na ekranie | COMPUTED (RDKit) |
| Kampania: transformacje / BRICS | nowi kandydaci, rodzic → produkt | linia rodowodu: rodzic, fragmenty, produkt; odrzuceni przygaszeni z powodem | IN-SILICO TRANSFORMATION — nie synteza w laboratorium |
| ADMET / toksyczność | flagi, estymaty | kolor ryzyka na atomach/molekule, wartości | MODEL_ESTIMATE |
| Docking (Vina) | afinity, poza | poza ligandu z `docked.pdbqt` przy receptorze | MODEL_ESTIMATE; receptor = STAND-IN dopóki nie ma białka |
| QM (PySCF) | HOMO-LUMO, dipol, energia | wartości przy molekule | MODEL_ESTIMATE (sto-3g) |
| Bramka | ELIGIBLE / HELD / DENIED | zmiana statusu kandydata (kolor, podpis) | wynik reguły |

- Kamery: istniejące VISOR / SPECTATOR / TWIN tylko obserwują. Nowe kadry „instrument” i „molekuła z bliska” wymagają zmiany w `agentLabScene3D` → **[Astra]**. Do czasu jej zmiany: SPECTATOR na stanowisko.

### 3.4 Czat — hipoteza, plan, potwierdzenie
- `UnifiedResearchJourney` zostaje jedynym wejściem (bez nowego modelu w routerze Fabric). Rozszerzenie:
  - **HYPOTHESIS** z prerejestrowanymi kryteriami przed uruchomieniem (np. „afinity ≤ −6,0 kcal/mol”, „brak flagi toksyczności ADMET”), zamrożonymi i zahashowanymi — trafiają jako `expectation` do planu Virtual Lab (mechanizm już istnieje, `virtualLabClosedLoop.mjs:372`).
  - **PLAN**: lista etapów i silników z dostępnością z `toolchain.capabilityAvailable` (BLOCKED pokazane jawnie).
  - **CONFIRM** („Wejdź do laboratorium”) = handoff `#/scientific-worlds?station=st-drug-bench&project=…&campaign=…` — naukowiec idzie do stanowiska i uruchamia run.

### 3.5 Wynik, falsyfikacja, dowody, replay, następny krok
- **Werdykt** (jedna funkcja nad istniejącymi `IN_SILICO_SUPPORT` / `IN_SILICO_CONFLICT` per kryterium): wszystkie spełnione → SUPPORTED; żadne → FALSIFIED; część → WEAKENED; którekolwiek BLOCKED/UNKNOWN → UNRESOLVED. Tylko nazwa zbiorcza, bez nowej logiki naukowej.
- **Evidence**: istniejąca propozycja dowodu Virtual Lab (propose-only) + `ScienceRun` id.
- **Replay**: `verify.mjs` dla każdego runu (MATCH bit-exact dla RDKit/Vina/QM, 1e-4 ADMET) + `replayExperimentSession` dla sesji laboratorium → scena odtwarza ten sam stan (`stateHash` równy).
- **Outcome**: nowy adapter `outcomeFromDrugLiveRun` w `scientificOutcome.ts` → istniejący `ScientificOutcomePanel`.
- **Next**: `deriveNextVirtualAction` → istniejący `NextExperimentPanel`.

## 4. Synteza — uczciwie

- Realne dziś i pokazywane na żywo: **transformacje in-silico** (RDKit SMARTS, BRICS) z rodowodem rodzic → produkt, podpisane „transformacja obliczeniowa, nie synteza w laboratorium”.
- `synthesisReadiness` pokazany tak, jak jest (`SOURCE_REQUIRED`). **Żadnej wymyślonej trasy.**
- Prawdziwa trasa syntezy krok po kroku wymaga **nowego silnika retrosyntezy** (np. otwarty AiZynthFinder jako worker, etykieta MODEL). To decyzja do podjęcia — nie ma go w repo.

## 5. Kolejność prac

| Faza | Zakres | Kto |
|---|---|---|
| F0 | Backend: oddawanie pętli między jednostkami, kursor `events?after=`, endpoint artefaktu pozy; testy: te same fingerprinty, zdarzenia widoczne w trakcie | Claude |
| F1 | Read model `drugRunState` + testy projekcji (te same zdarzenia → ten sam `stateHash`) | Claude |
| F2 | Stanowisko `st-drug-bench`, krok EXECUTE_ASYNC, wrapper wizualizacji, adapter Outcome | Claude |
| F2-A | Meble stanowiska, kadry kamer „instrument / molekuła”, ewentualne miejsce w kompozycji | **[Astra]** |
| F3 | Czat: hipoteza z kryteriami, plan z dostępnością silników, potwierdzenie → laboratorium, werdykt, replay, next | Claude |
| F4 | E2E akceptacyjny + screeny do przeglądu | Claude |

## 6. Test akceptacyjny (E2E, lokalny backend)

Kandydat: aspiryna `CC(=O)Oc1ccccc1C(=O)O` (offline, referencja walidatora RDKit, przechodzi ograniczenia). Budżet: ADMET + docking 1 + QM 1.

1. Science Chat: „Find drug candidates for CC(=O)Oc1ccccc1C(=O)O” → widoczna hipoteza z zamrożonymi kryteriami i plan etapów.
2. Potwierdzenie → laboratorium, naukowiec idzie do `st-drug-bench`.
3. W trakcie runu test **odczytuje co najmniej 3 różne stany pośrednie** (`events?after`) i dla każdego sprawdza, że `stateHash` sceny (diagnostyka wrappera) = `stateHash` projekcji z backendu.
4. Molekuła w scenie: liczba atomów = liczba atomów konformera RDKit.
5. Wynik: afinity, ADMET, QM, werdykt bramki; werdykt SUPPORTED/WEAKENED/FALSIFIED/UNRESOLVED zgodny z kryteriami.
6. Evidence: id propozycji dowodu i `ScienceRun`.
7. Replay: `REPLAY_MATCH` dla każdego runu, sesja MATCH, scena po replay ma **ten sam `stateHash`**.
8. Następny eksperyment widoczny.

## 7. Decyzje do podjęcia przez właściciela

1. **WEAKENED** — czy definicja „część prerejestrowanych kryteriów spełniona” jest właściwa.
2. **Receptor** — docking przeciwko zastępczej cząsteczce jest mało wartościowy naukowo. Potrzebny prawdziwy cel białkowy (PDB + kieszeń) dla pierwszego scenariusza.
3. **Retrosynteza** — czy dodać prawdziwy silnik (nowa zależność, worker), czy na razie tylko transformacje in-silico.
4. **Transport** — polling z kursorem (proponowane, zero nowej infrastruktury) czy od razu SSE.
5. **Astra** — zgoda na stanowisko `st-drug-bench` w kompozycji laboratorium i kadry kamer.

## 8. Stan wdrożenia (2026-09-25)

| Faza | Stan | Dowód |
|---|---|---|
| F0 — ciężkie zadania na worker_thread, zdarzenia czytelne w trakcie (`?after=seq`) | zrobione | `liveCampaignEvents.test.mjs` |
| F1 — jeden read model `projectDrugRun` + `stateHash` | zrobione | `liveDrugRunState.test.ts` |
| F2 — stanowisko `st-drug-bench`, agent czeka na silnik (`engineGate`), scena renderuje ten sam stan | zrobione | `drugBenchLiveGate.test.ts`, E2E `liveDrugBench` (hash sceny = hash backendu w ≥3 stanach pośrednich i końcowym) |
| F3 — czat: hipoteza + plan zamrożone przed silnikiem, przejście do laboratorium; werdykt, dowody, replay MATCH, następny eksperyment | zrobione | `drugHypothesis.test.ts`, `unifiedResearchJourney.test.ts`, E2E `liveDrugChatHandoff` |

Testy: backend 1236 pass / 0 fail; frontend 7340 pass (672 plików); oba E2E zielone lokalnie.

Uczciwe granice (widoczne w UI):
- receptor dockingu to zastępcza mała cząsteczka (indol), nie białko;
- „synteza” to transformacje in-silico RDKit, bez silnika retrosyntezy;
- wszystkie wyniki to MODEL_ESTIMATE; brak walidacji laboratoryjnej;
- definicja WEAKENED (≥1 spełnione i ≥1 niespełnione) czeka na potwierdzenie właściciela.
