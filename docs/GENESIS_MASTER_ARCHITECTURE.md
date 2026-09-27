# Genesis — architektura master (stan faktyczny i docelowy)

Dokument wykonawczy do `docs/GENESIS_CONSTITUTION.md`. Powstał z **audytu realnego kodu**
(gałąź `claude/genesis-total-consolidation`, wrzesień 2026), nie z dokumentacji. Zasada: każde
zdanie o „istnieje" wskazuje plik. Gdzie piszę „propozycja", to jeszcze nie istnieje.

---

## 1. Stan faktyczny — co naprawdę jest

### 1.1 Kręgosłup, który działa: silniki naukowe (backend)

To najmocniejsza i **jedyna niezduplikowana** część systemu.

| Warstwa | Plik | Rola |
|---|---|---|
| Rejestr narzędzi z walidacją w runtime | `packages/backend/src/campaign/toolchain.mjs` | narzędzie dostaje status AVAILABLE dopiero po przejściu prawdziwego przypadku referencyjnego; inaczej CAPABILITY_GAP / BLOCKED_BY_RUNTIME |
| Kontrakt zdolności (wejścia, wyjścia, limity) | `packages/backend/src/compute/scientificCapabilityContract.mjs` | przestrzeń nazw zdolności: `quantum-chemistry`, `molecular-docking`, `molecular-dynamics`, `admet-estimation`, `toxicity-risk-estimation`, `protein-structure-ingestion`, `maxwell-fdtd` |
| Adaptery silników | `packages/backend/src/compute/{rdkit,qm,md,docking,protein,admet,meep,cmsOpenData,depmap}Adapter.mjs` + `*_worker.py` | każdy woła prawdziwy silnik przez proces Pythona z twardym limitem czasu; `detect()` zwraca powód niedostępności, nigdy udanej liczby |
| Trasowanie lokalne/zdalne | `packages/backend/src/compute/remoteScientificWorkerClient.mjs::routeCapability` | zdalnie tylko gdy ustawiony adres workera; błędna konfiguracja blokuje, nie „po cichu liczy lokalnie" |
| Kolejka zadań | `packages/backend/src/compute/jobs.mjs` + `heavyJobThread.mjs` | ciężkie zadania na wątku roboczym, HTTP zostaje wolny |
| Powtórka silnika | `packages/backend/src/campaign/verify.mjs` | **ponownie uruchamia prawdziwy silnik** i porównuje: MATCH / DRIFT / ENGINE_VERSION_CHANGED / BLOCKED_BY_RUNTIME / REPLAY_UNSUPPORTED |

**Wniosek: to jest kanon.** Cała reszta ma się do tego podłączać, a nie obok.

### 1.2 Okręt flagowy: żywy eksperyment leków

Działa i jest sprawdzony testem na prawdziwym serwerze (`packages/e2e/src/liveDrugBench.e2e.spec.ts`):

- **Cel białkowy**: PDB 1IEP, łańcuch A (kinaza ABL1) z imatinibem; pliki z sumami kontrolnymi i
  licencją w `packages/backend/src/compute/targets/abl1-1iep/`; rejestr `compute/dockingTargets.mjs`
  (API podaje tylko identyfikator celu, nigdy ścieżki). Kontrola: ponowne zadokowanie ligandu z
  kryształu, RMSD 0,58 Å.
- **Kanoniczny stan runu**: `packages/frontend/src/core/liveExperiment/drugRunState.ts::projectDrugRun`
  — czysta projekcja zapisanych zdarzeń kampanii, kandydatów i przebiegów dokowania, z `stateHash`.
- **Procedura laboratoryjna**: `core/liveExperiment/labProcedure.ts` — ten sam stan czytany jako
  9 faz z etykietami epistemicznymi; faza jest ZROBIONA dopiero, gdy istnieje zapis, który ją dowodzi.
- **Scena**: `core/liveExperiment/drugBenchLayer.ts` w laboratorium Astry (bez drugiego renderera).
- **Hipoteza i werdykt**: `core/liveExperiment/drugHypothesis.ts` — kryteria zamrożone przed runem,
  jedno krytyczne (falsyfikator), werdykt liczony regułami; model językowy nie bierze udziału.

### 1.3 Trzy dziury, które audyt ujawnił (i których nie wolno przemilczeć)

1. **Powtórka przy stanowisku była słabsza, niż brzmiała.** `replayExperimentSession` odtwarzała
   projekcję stanu (dowód, że odczyt jest deterministyczny), a nie przebieg silnika. Prawdziwa
   powtórka (`verify.mjs`) istniała, ale nie była wywoływana z laboratorium.
   **Naprawione**: panel wyniku uruchamia teraz `verifyScienceRun` dla przebiegu dokowania i pokazuje
   werdykt osobno, z identyfikatorem przebiegu i sumami kontrolnymi.
2. **Pamięć się nie domyka.** Zapieczętowana sesja nie trafia nigdzie trwale: dowody lądują w
   przeglądarkowym rejestrze (`core/knowledge/ledgerStore.ts`, localStorage), sesja w tablicy Reacta
   (ostatnie 40), a po odświeżeniu strony oba znikają — choć kampania, przebiegi i zdarzenia w
   backendzie zostają. **Nienaprawione.**
3. **Rejestracja kryteriów to odcisk, nie zapis.** `fnv1a` z hipotezy zbudowanej lokalnie, trzymany w
   mapie w pamięci modułu. Nic nie zapisuje go po stronie serwera przed wykonaniem i nic nie sprawdza
   potem, że wykonano to, co zarejestrowano. **Nienaprawione.**

Dodatkowo: **wiedza nie jest krokiem pobierania**. Jedyne żywe wyjście na zewnątrz to rozpoznanie
tożsamości cząsteczki (`biotechProxy.mjs`, dwa dozwolone adresy: PubChem i ChEMBL). Literatura, cele
biologiczne i zbiory danych są dowiązane statycznie. Kod do literatury istnieje
(`core/agent/literatureNoveltyAdapter.ts` — prawdziwe OpenAlex/Crossref), ale **nie jest podłączony**
do żadnego ekranu.

### 1.4 Duplikaty — wybór kanonu (decyzja architektoniczna)

Audyt znalazł wiele równoległych implementacji. Poniżej rozstrzygnięcie; reszta staje się adapterem
albo zostaje wycofana. Nie usuwamy niczego, co ma testy, bez osobnej decyzji.

| Odpowiedzialność | KANON | Co się z resztą dzieje |
|---|---|---|
| Rejestr dowodów | `packages/core/src/knowledge/EvidenceLedger.ts` z trwałością serwerową (`backend/src/knowledgeApi.mjs`) | rejestr przeglądarkowy staje się buforem, który **proponuje** do serwera; łańcuchy audytu (`core/audit/auditLedger.ts`, `backend/src/security/auditChain.mjs`) zostają jako dzienniki bezpieczeństwa, nie jako dowody naukowe |
| Powtórka | `backend/src/campaign/verify.mjs` (silnik) + `core/scientificWorlds/experimentSession.ts` (odczyt) | dwa poziomy, **zawsze nazywane osobno**; słownik werdyktów ujednolicić do `core/matrixFoundation/replayVerdict.ts` |
| Zapis eksperymentu | `core/scientificWorlds/experimentSession.ts::ExperimentSession` | `experimentFabric/types.ts::ExperimentRun` zostaje dla ścieżki czatu, ale musi wskazywać tę samą sesję |
| Pamięć naukowa | `core/scienceMemory.ts` przez port `scientificWorlds/scienceMemoryPort.ts` | `packages/core/src/cognitive/memory.ts` to szkielet — nie przedstawiać go jako mózgu |
| Rejestr silników | `backend/src/campaign/toolchain.mjs` | `compute/capabilities.mjs` już z niego wynika; rejestry frontowe to katalogi produktowe, nie źródło prawdy |
| Falsyfikacja | `core/liveExperiment/drugHypothesis.ts` (flagowa) + `core/orchestrator/winnerGate.ts` (bramka zwycięzcy) | `packages/core/src/cognitive/falsification.ts` (26 linii) — szkielet |
| Świat | `core/worldModel/` (WorldGraph, specyfikacja, kompilator) | `core/world/`, `core/simWorld/` — do wycofania lub adaptacji |
| Router czatu | `core/scienceChat/resolveCommand.ts` | dziś działają **trzy** dopasowania intencji w `ScienceChat.tsx` — do scalenia |
| Następny eksperyment | `backend/src/campaign/nextExperiment.mjs` | propozycje frontowe zostają propozycjami, ale mają uruchamiać tę jedną ścieżkę |

---

## 2. Architektura docelowa

```
                 ┌───────────────── bramka uprawnień (OBSERVE…EXECUTE PHYSICAL) ─────────────────┐
PYTANIE → WIEDZA → HIPOTEZA → REJESTRACJA → PLAN → WYBÓR SILNIKA → WYKONANIE → ZDARZENIA
                                                                                   ↓
                                                                    KANONICZNY STAN EKSPERYMENTU
                                                                     ↓            ↓            ↓
                                                            laboratorium 3D    DOWODY      PAMIĘĆ
                                                                                   ↓
                                                        FALSYFIKACJA → POWTÓRKA → NASTĘPNY EKSPERYMENT
```

Porty (interfejsy, nie dostawcy) — **propozycja, dziś nie istnieją poza zaznaczonymi**:

| Port | Stan dziś | Docelowo |
|---|---|---|
| `ComputePort` | istnieje faktycznie jako `routeCapability` (lokalnie/zdalnie) | jawny port z kosztem, czasem i wymaganiami sprzętowymi |
| `QuantumComputePort` | istnieje jako `packages/core/src/engine/quantum/QuantumProviderAdapter.ts` (symulator prawdziwy, klient QPU bez zweryfikowanego dostawcy) | ten sam port, wynik zawsze z etykietą LOCAL_SIMULATOR / HARDWARE_MEASUREMENT |
| `KnowledgePort` | częściowo: `biotechProxy.mjs` (tożsamość), `knowledgeApi.mjs` (propozycje do publikacji przez człowieka) | jeden port z listą dozwolonych źródeł, licencją i klasą dowodu przy każdym twierdzeniu |
| `InstrumentPort`, `SensorPort`, `RobotPort`, `SampleTrackingPort`, `LaboratorySafetyPort`, `ExecutionApprovalPort` | **kontrakty istnieją** w `core/lab/devicePorts.ts` (z `DeviceSafetyMode`, gdzie każdy tryb zwraca `permitsGenericRealActuation: false`), ale **żaden nie rozmawia ze sprzętem**; jedyne prawdziwe urządzenie w repo to kamera przeglądarki w produkcie Mirror | najpierw odczyt z czujników, potem sterowanie za bramkami |

**Nie deklarujemy żadnej zdolności fizycznej.** W repo nie ma kodu szeregowego, USB, OPC-UA, Modbus,
ROS ani SiLA — sprawdzone.

---

## 3. Model autonomii i nadzoru

Poziomy z konstytucji mapują się na istniejący moduł `core/governance/`
(`capabilities.ts` z `CONSEQUENCE_TIERS`, `decision.ts` ALLOW/REQUIRES_APPROVAL/DENY,
`approval.ts` z podpisami wielostronnymi, `audit.ts`). Brakuje: klasyfikatora ryzyka jako osobnego
modułu i spięcia bramki z **wykonaniem** — dziś bramka ocenia, ale nic jej nie pyta przed
uruchomieniem ciężkiego zadania.

Propozycja kolejności (bez pisania kodu spekulacyjnego):
1. każde uruchomienie kampanii i etapu przechodzi przez `evaluateCapability` i zapisuje decyzję;
2. dopiero potem port czujników (tylko odczyt);
3. sterowanie sprzętem — wyłącznie z listą dozwolonych poleceń, kopertą pracy, zatrzymaniem
   awaryjnym, watchdogiem, autoryzacją operatora i trybem suchego przebiegu.

---

## 4. Dowody i powtórka — niezmienniki

1. Wynik bez pochodzenia nie jest wynikiem: silnik, wersja, wejścia, wyjścia, sumy kontrolne, czas.
2. **Dwie powtórki nazywamy osobno**: powtórka odczytu (projekcja) i powtórka silnika (ponowne
   wykonanie). Nigdy nie wolno pokazać „MATCH" bez powiedzenia, której dotyczy.
3. Zablokowany etap to `BLOCKED_*`, nigdy zastępcza liczba.
4. Przeszłe dowody są niezmienne; nowa interpretacja to nowy zapis wskazujący stary.
5. Predykcja modelu (ADMET) i wynik silnika (RDKit, Vina) nigdy nie dzielą jednej etykiety.

---

## 5. Plan migracji (kolejność, nie życzenia)

| # | Krok | Dlaczego teraz |
|---|---|---|
| 1 | **Powtórka silnika w laboratorium** | zrobione — bez tego „potrafię to powtórzyć" było przesadą |
| 2 | **Trwała sesja i dowody po stronie serwera** | bez tego pamięć nie istnieje po odświeżeniu strony |
| 3 | **Rejestracja kryteriów jako zapis serwerowy przed wykonaniem** + sprawdzenie po | bez tego falsyfikacja opiera się na obietnicy |
| 4 | Jeden rejestr dowodów (przeglądarka proponuje do serwera) | usuwa najgorszy duplikat |
| 5 | Jeden router czatu | trzy dopasowania intencji w jednym komponencie |
| 6 | `KnowledgePort` i podłączenie istniejącego klienta literatury | wiedza staje się krokiem, nie założeniem |
| 7 | Ta sama architektura dla chemii i biologii (już mają sesje) | faza 2 konstytucji |
| 8 | Porty sprzętowe: najpierw odczyt czujników | faza 6 konstytucji |

---

## 6. Czego dziś **nie** twierdzimy

- Genesis nie pobiera literatury naukowej w ścieżce badawczej.
- Genesis nie steruje żadnym urządzeniem laboratoryjnym i nie ma do tego kodu transportowego.
- Werdykt dokowania to estymata funkcji oceniającej przy sztywnym receptorze, nie zmierzone
  powinowactwo; kandydat obliczeniowy nie jest lekiem.
- „Kanoniczny" w komentarzach w kodzie bywa życzeniem — tabela w §1.4 jest rozstrzygnięciem, a nie
  opisem stanu.
