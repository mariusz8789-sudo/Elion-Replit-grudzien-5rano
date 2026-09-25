# Genesis — inwentaryzacja duplikatów (laboratoria, silniki, ekrany)

Stan: gałąź `claude/genesis-total-consolidation`. Audyt tylko do odczytu: importy sprawdzone grepem, LOC z `wc -l`.
**Nic z tej listy nie zostało jeszcze usunięte.** To lista decyzji. Warstwa wizualna laboratorium
(LabScene3D, FirstPersonLabScreen, WalkControls, worldGrade) należy do Astry: pozycje, które jej dotyczą,
są oznaczone **[Astra]** i wymagają jej zgody.

Zasada docelowa: jeden czat, jedno laboratorium (`#/scientific-worlds`), jeden Outcome/Evidence/Replay.
Silniki są zdolnościami pod spodem, a nie osobnymi ekranami.

## 1. Laboratoria 3D — cztery osobne „budowniczowie pokoju”

| Plik | LOC | Trasa | Co ma unikalnego | Duplikat czego | Rekomendacja |
|---|---|---|---|---|---|
| `components/ScientificWorldsScreen.tsx` + `core/three/agentLabScene3D.ts` | 556 / 1108 | `#/scientific-worlds`, `#/human-biology-lab` | agent, stanowiska, bliźniak, Evidence/Replay | — | **KANONICZNE** |
| `visual-simulation/FirstPersonLabScreen.tsx` + `core/three/labScene3D.ts` | 845 / 3618 | `#/first-person-lab`, `#/lab-3d` | dźwignia „dzień interwencji” (ISOLATION), A/B, kontrfakt | drugi pokój laboratorium; drugie stanowisko epidemii | **[Astra]** przenieść dźwignię jako stanowisko głównego lab, potem wycofać `labScene3D` (~4 400 LOC) |
| `visual-simulation/InvestorDemoScreen.tsx` | 436 | `#/investor-demo` | HUD prezentacyjny | ta sama scena i `labSession` co FirstPersonLab | tryb prezentacji głównego lab; `seriesSparkline` do utila |
| `visual-simulation/DiscoveryHallScreen.tsx` | 121 | `#/discovery-hall` | narracja `runGovLowerHarmDiscovery`, tour | używa `labScene3D` tylko jako tła | **[Astra]** przenieść narrację na główną scenę |
| `components/LabFpvView.tsx` + `ui/lab/LabFpvGpu.ts` | 176 / 80 | `#/lab-fpv` | shader zlewki, nagrywanie webm | ta sama chemia (`ThermodynamicLabEngine`) co panel chemii w lab | złożyć stół do stanowiska chemii, potem usunąć |
| `components/CernComplexView.tsx` + `ui/cern/LabComplexGpu.ts` | 495 / 112 | `#/cern-complex` | tunel, post-processing | eksperymenty = te same runnery co stanowiska syntezatora/zderzacza | zachować wizualnie; eksperymenty kierować przez stanowiska lab |
| `components/ColliderChamber.tsx` | 151 | `#/collider` | widok jednego zdarzenia w detektorze | nakłada się ze stanowiskiem zderzacza | zbliżenie stanowiska zderzacza lub pokój w `#/cern-complex` |

Pozostałe:
- **Kontrolery chodzenia i kamery.** Kanoniczny jest `core/three/firstPersonController.ts`. Martwy jest `core/world/firstPerson.ts` (70). Istnieją trzy walkery PointerLock w `packages/ui`. Są dwie ścieżki kamery kinowej: `cameraRig`/`cameraSequencer` oraz `cinematicCamera`.
- **Epidemia w laboratorium:** trzy silniki. Są to `seir-epidemic` (stanowisko), `labSession` ISOLATION (FirstPersonLab/InvestorDemo) oraz klasyczne `biology-epidemic`.
- **Laboratoria klasyczne `#/lab/<id>`:** 13 labów, 13 625 LOC eksperymentów. Zostają jako program nauczania. Nakładki (miareczkowanie, epidemia, detektor) można złączyć.
- **Bez duplikatu:** `MoleculeLabScreen` (RDKit 3D), `CellLabScreen` (cykl komórkowy) i `VirtualLabDashboard` (modele bio). Są unikalne.

## 2. Silniki naukowe

Nie są kopiami: bundle backendu (`core.bundle.mjs`, `quantum-*.mjs`) to wynik esbuild z frontendu.

| Rodzina | Kanoniczne | Duplikaty / martwe | LOC do zdjęcia |
|---|---|---|---|
| Martwe paczki silników | — | `core/src/supreme`, `genesis9d`, `advanced`, `quantum-lab`, `molecular-engine`: tylko testy | ~1 850 |
| Runtime „physicsWorld” | — | `frontend/src/core/physicsWorld/*`: tylko testy | 1 179 |
| Runtime bio | `physicsWorld` wzorzec | `virtualBio/{core,contracts,experiment}` to kopia runtime (żywa) | ~290 |
| Kwantowy wektor stanu | `core/quantumState.ts` | `QuantumProviderAdapter` (543, drugi silnik tej samej matematyki); `quantum-bloch.ts` własne bramki | ~680 |
| Orkiestratory odkryć | backend `campaign/orchestrator.mjs` | `agent/genuineDiscoveryOrchestrator.ts` (martwy), `agent/campaignOrchestrator.ts` (tylko z martwego) | 466 |
| Geodezyjne / soczewkowanie | `core/physics.ts` | `SpacetimeCurvatureEngine.photonGeodesic` (martwy), `einstein-lensing.pointLensObservables`; promień Schwarzschilda zdefiniowany 6× | ~120 |
| Masa niezmiennicza CMS | `cms_zmumu_worker.py` | ta sama formuła w `scripts/fetch-real-data.mjs` (JS) | mały |
| RDKit | `backend/src/compute/rdkitAdapter.mjs` | `rdkitTransport.node.ts` (204): osobne wywołanie subprocess, praktycznie tylko testy | 204 |

Bez duplikatu: miareczkowanie/pH (`physics.ts` + adaptery), Arrhenius (`chemistryKineticsGraph`), SEIR (`epidemic/sir.ts` + adaptery), dogmat centralny, PK, docking.

### Hash, fingerprint, PRNG: ryzyko poprawności

- **Kanoniczny JSON różni się między implementacjami (potwierdzone).**
  - `frontend/src/core/events/hash.ts` sortuje klucze przez `localeCompare`.
  - `core/src/knowledge/EvidenceLedger.ts` sortuje przez `.sort()` (kolejność jednostek kodu).
  - Dla kluczy różniących się wielkością liter ten sam obiekt daje **różny odcisk**.
  - Do ujednolicenia: jeden canonicalizer i jedna reguła sortowania.
- **FNV-1a:** kanoniczne `events/hash.ts` (202 importy) plus około 17 kopii inline.
- **SHA-256:** kanoniczne `core/knowledge/sha256.ts` plus około 46 kopii `sha256hex` w core i backendzie.
- **mulberry32:** 41 kopii.

### Rekordy przebiegu i dowody

- `ReplayVerdict` jest zdefiniowany 4×: `matrixFoundation`, `experimentSession`, `benchmark` i `evidencePackStore`.
- Łańcuchy hashy poza kanonicznym `EvidenceLedger`: `audit/cryptoAudit` + `auditLedger`, `flagship/sessionEventLog` oraz backend `auditChain.mjs`.
- Selektory „następnego eksperymentu”: 5 jest opakowanych przez `agent/nextAction.ts`, a 9 innych istnieje obok. Działają na różnych domenach (to zasadne), ale są rozproszone.
  - Wspólny panel „Następny eksperyment” (`ScientificOutcomePanel`) już pokazuje je w jednej formie.

## 3. Ekrany poza laboratorium

| Grupa | Kanoniczny | Duplikaty / problemy | Rekomendacja |
|---|---|---|---|
| Miasto | `#/city3d` (`City3DWebGLScreen`, 864) | `#/city` = to samo miasto w 2D (389, poza menu); `genesisCityWorld2.ts` (232) tylko testy | `#/city` jako tryb 2D w city3d; usunąć `genesisCityWorld2` |
| Światy | `#/worlds`, `#/genesis-world` | `#/temporal-cinematic` = ten sam `TemporalCinematicSim3D` co `#/world-director`; `#/sim-world`, `#/reality`, `#/prebuild` poza menu | złożyć temporal-cinematic jako preset world-director (zostawić trasę dla skryptu capture); sierotom dać wariant w menu albo usunąć |
| Matrix | `#/matrix` (`MatrixRoute`) | `#/matrix-stage` **zepsuty**: czeka na tło WebGL, którego host został usunięty; `MatrixStage.ts` i `MatrixDataStream.tsx` martwe | usunąć `#/matrix-stage` + dwa martwe pliki; `#/matrix-map` przepiąć do rodziny `memory` |
| Dowody | `#/memory` | `#/evidence` ma 4 aliasy; `#/discovery-log` to odznaki, nie dowody | zostawić jeden alias; przenieść discovery-log |
| Drug Discovery (7 ekranów) | `#/drug` | `#/campaign` jako zakładka; `#/pilot` i `#/research-console` mają własne pola pytań = drugi czat | złożyć pola pytań do jednego czatu |
| CERN | `#/physics/cms-z` | `#/collider` jako pokój `#/cern-complex`; `#/lab-fpv` to chemia, nie fizyka | patrz sekcja 1 |
| Czat | `ScienceChat` (jeden, montowany w `App.tsx`) | `LookingGlassChat` (504) = drugi czat; pola tekstowe w `GenesisConsole` i `ExperimentPilotScreen` | tryb „pokaż mi” w ScienceChat; pola kierować do czatu |

## 4. Proponowana kolejność (bezpieczna → wymagająca zgody)

1. **Martwy kod — ZROBIONE.** Usunięte:
   - paczki `core/src/{supreme,genesis9d,advanced,quantum-lab,molecular-engine}` razem z ich łańcuchem w `ui/src/{routes,state,supreme,quantum-lab}`;
   - `core/physicsWorld/*` wraz ze skryptem `physics-world:demo`;
   - `core/world/firstPerson.ts`, `holo/MatrixStage.ts`, `MatrixDataStream.tsx`;
   - trasa `#/matrix-stage` (stare linki trafiają na `#/matrix`, a wynik silnika 5D zostaje w czacie).

   Po weryfikacji **nie** usunięto dwóch pozycji, bo są żywe: `agent/genuineDiscoveryOrchestrator.ts` (używają go `proofLadder`, `discoveryRecordBridge` i skrypt `genuine-discovery:e2e01`) oraz `genesisCityWorld2.ts` (używają go `genesisScientificCity3` i kompilator świata).
   Po usunięciu łańcucha UI osierocone mogą być `core/src/city-enterprise` i `ui/src/render`. Wymagają osobnego sprawdzenia.
2. **Hashe i PRNG: ZROBIONE.**
   - **Jedno źródło w TypeScript:** `packages/core/src/determinism.ts` (`canonicalJson`, `fnv1a`, `fnv1aUint`, `stableHash`, `sha256Hex`, `mulberry32`).
   - **Bliźniak w backendzie:** `packages/backend/src/determinism.mjs`. Reguła jest ta sama i sprawdza ją test bajt w bajt w `determinism.test.ts`.
   - **Reguła kanonicznego JSON:** klucze sortowane po jednostkach kodu UTF-16 (jak RFC 8785), nigdy przez `localeCompare`, i semantyka JSON (klucze z `undefined` są pomijane).
   - **Przepięte kopie:**
     - EvidenceLedger, expansionHash, cognitive/hash, humanLab/hash, `events/hash`;
     - mirror, city-enterprise, `ui/render`, `ui/cern`, `ui/mirror`;
     - 14 kopii mulberry32 (warianty zapisu sprawdzone: 200 000 ziaren, 0 różnic);
     - 7 kopii FNV-1a i integrityEnvelope;
     - backend: provenance, videoControlContract, 5 kopii `sha256Hex`, `spatialProjectIngestion`.
   - **Jedno słownictwo replay:** `matrixFoundation/replayVerdict.ts`. Sesja, paczka dowodów i benchmark biorą z niego podzbiory. Benchmark mówi teraz `DRIFT` zamiast `MISMATCH`.
   - **Skutek:** odcisk prerejestracji w artefakcie D-116 się zmienił. Artefakt wydano ponownie (`npm run winner-record:emit`), łańcuch audytu dopisano (2 ogniwa, stare nienaruszone). Werdykt WINNER LIRAGLUTIDE i replay MATCH są bez zmian.
   - **Świadomie zostawione:**
     - `core/three/*` (warstwa wizualna, Astra);
     - `components/liveMatrix/matrixEngine.ts` (kontrakt: tylko React);
     - ścisły canonicalizer w `lab/standaloneDeterminism.ts` (odrzuca NaN, ta sama kolejność kluczy);
     - osadzony, samodzielny weryfikator w `integrityEnvelope.ts`;
     - osobny pakiet `packages/csrn`.
3. **Menu i czat:** pola pytań z `#/pilot`, `#/research-console` i `LookingGlassChat` kierować do jednego czatu. `#/collider` do `#/cern-complex`, `#/city` do `#/city3d` (tryb 2D), `#/temporal-cinematic` do `#/world-director`.
4. **[Astra] Laboratorium:** przenieść dźwignię interwencji i narrację Discovery Hall na główną scenę, potem wycofać `labScene3D.ts` + `FirstPersonLabScreen` + `InvestorDemoScreen` (~4 900 LOC) i złożyć `#/lab-fpv` do stanowiska chemii.
