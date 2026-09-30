# Przegląd braków: kandydat → receptor → szlak → komórka/neuron → przewidywanie → pakiet dla laboratorium → pomiar → porównanie

**Punkt startowy:** `main` = `d23a89b416560c9531348d09f44f608134180268` (środa 30 września 2026, 00:45 +02:00).
**Gałąź dokumentacyjna:** `claude/project-thread-lct8kl`. Wyłącznie odczyt kodu i ten dokument. Nie zmieniono żadnego progu, modelu, etykiety dowodowej ani logiki eksperymentu. Nie uruchamiano testów, kampanii ani treningu. Nie dotykano gałęzi `claude/project-thread-mk7f49` (Run 8).
**Indeks:** `/mnt/project-files/audyt-repo/genesis-audyt-mozliwosci-2026-09-29.md` (audyt z 29.09, main `006a5a69`). Historię sprawdzano tylko tam, gdzie brakowało konkretnego elementu.

## Jak czytać statusy

- **JEST** — kod istnieje i jest wywoływany w ścieżce produkcyjnej.
- **TYLKO TEST** — kod istnieje, ale jedynym wywołaniem jest plik testu.
- **WYNIK** — istnieje wykonany artefakt (zapieczętowany JSON w `docs/evidence/` albo `campaign/*.sealed.json`), nie tylko plik testu.
- **NIEZWERYFIKOWANE** — brak dowodu w jedną lub drugą stronę. Nie znaczy „nie działa" ani „działa".
- **PROD** — nie sprawdzono dla żadnej pozycji: sandbox nie widzi genesis-physics.com. Wszędzie NIEZWERYFIKOWANE.
- **CI** — plik testu znajduje się w globie z `.github/workflows/ci.yml` (backend: `node --test src/*.test.mjs src/campaign/*.test.mjs src/compute/*.test.mjs`, frontend: `vitest run`). To, że CI go obejmuje, nie jest dowodem, że przechodzi na `d23a89b4` — tego nie sprawdzano. Testy Playwright z `packages/e2e/` **nie są uruchamiane w CI**.
- **WALIDACJA NAUKOWA** — dla żadnej pozycji w tym łańcuchu: NIE.

---

## 1. Podsumowanie dla Mariusza

Łańcuch nie jest przerwany w jednym miejscu. Jest **zbudowany od obu końców i nie spotyka się w środku**.

Mocny jest początek (pytanie → cel → dane → dokowanie → dossier → trasa syntezy) i mocny jest koniec (przyjęcie pomiaru z laboratorium, porównanie z tolerancją, replay, prereg). Środek — receptor → szlak → typ komórki → przewidywana odpowiedź neuronu — **nie istnieje jako kod**. Nie jest słaby: nie ma go.

Cztery rzeczy, które trzeba wiedzieć, zanim cokolwiek zaplanujemy:

1. **Dla GLP-1R nie ma zarejestrowanego celu dokowania.** `packages/backend/src/compute/dockingTargets.mjs:17-19` rejestruje wyłącznie `ABL1_1IEP`. Tymczasem jedyna oś, która porządkuje finalistów w protokole kandydata, to wynik dokowania (`campaign/candidateProtocol.mjs:265-277`). Bez struktury GLP-1R nie da się dziś zbudować rankingu kandydatów dla odchudzania — niezależnie od modelu QSAR.
2. **Model aktywności GLP-1R nadal nie przechodzi własnej bramki** (MAE 1,0118 przy MAX_MAE 1,0; `campaign/glp1r-d144-expanded.sealed.json`, D-144). System zachowuje się poprawnie: `campaign/molecularMission.mjs:260,266` zamienia `GATE_NOT_MET` na `NO_WINNER`. To jest prawidłowy wynik, nie awaria.
3. **Dane GLP-1R mieszają agonizm z wiązaniem.** Pin `campaign/glp1rActivity.json` to 287 wierszy: EC50 194, IC50 89, KI 4, wszystkie `Homo sapiens`, wszystkie CHEMBL1784 — ale zlane na jedną oś `pActivity` przez `campaign/endpointFamily.mjs:36`. W pinie nie ma kolumny z rodzajem odczytu ani z efektywnością agonistyczną (Emax). Dla leku na odchudzanie liczy się agonizm, więc to jest błąd merytoryczny na wejściu, nie tylko brak danych.
4. **Brakuje modelu funkcjonalnego odpowiedzi neuronu.** Samo połączenie dockingu, atlasu i danych ekspresji nie wypełnia tej luki. Nie ma też danych ekspresji: w repozytorium nie występuje HPA, GTEx, Allen ani dane jednokomórkowe. `core/virtualBio/models.ts` to zadeklarowane zabawki (`toy: true`), a `humanLab/neuroLab.ts:22-33` generuje amplitudę i latencję z ziarnowanego losowania — to animacja, nie model biologiczny.

**Pierwszy osiągalny rezultat** (propozycja, punkt 5 niżej): nie kandydat, tylko **uczciwa karta celu GLP-1R** — tożsamość celu z UniProt P43220, rozdzielenie odczytów funkcjonalnych od wiążących w istniejącym pinie, rejestracja struktury GLP-1R do dokowania i projekt badania cAMP dla laboratorium. Dopiero to daje łańcuch, w którym pomiar z laboratorium ma z czym się porównać.

---

## 2. Mapa istniejących elementów

Format każdego wiersza: **plik i eksport → miejsce wywołania → źródło danych → test (CI) → ograniczenie → najmniejsza potrzebna zmiana.**

### 2.1. Pytanie → cel biologiczny

| | |
|---|---|
| Plik i eksport | `packages/backend/src/campaign/researchIntake.mjs`: `BUNDLED_TARGETS` (:80-97), `classifyResearchInput` (:178), `groundDiseaseOrTarget` (:444-460), `terminalResult` (:792-834) |
| Wywołanie | `api.mjs:79`, trasa `POST /api/projects/:id/research-intake` (:583, handler :1121-1141) → `frontend/src/core/backend/client.ts:523` → `components/DrugDiscoveryScreen.tsx:249-381` |
| Źródło danych | wbudowane: GLP1R → `CHEMBL1784`, GIPR → `CHEMBL4383`, `organism: 'Homo sapiens'`, z pinem ładowania. `DISEASE_TO_TARGET_KEYWORDS` (:105-108): `obesity\|weight loss\|weight management` → `['GLP1R','GIPR']`, status `PARTIALLY_RESOLVED` (oznaczone jako wnioskowanie, nie deklaracja) |
| Test | `campaign/researchIntake.test.mjs` (test 7 :181-208 = prawdziwe ugruntowanie GLP1R), `apiResearchIntake.test.mjs` — oba w globie CI |
| Ograniczenie | **Brak numeru UniProt i pola gatunku w rekordzie celu.** P43220 występuje tylko w `campaign/bindingDbImport.mjs:71` jako `{ accession: 'P43220', verified: false }` i w zapieczętowanej sondzie `glp1r-d089-diagnostic0.sealed.json:205` („tożsamość pozostaje deklaracją, nie zweryfikowanym faktem"). Pytanie badawcze jest przechowywane jako surowy `originalQuery`: nie ma endpointu, komparatora ani kryterium decyzji |
| Najmniejsza zmiana | dodać `uniprot: 'P43220'`, `species: 'Homo sapiens'`, `taxonId: 9606` do `BUNDLED_TARGETS.GLP1R`, czerpiąc z `DECLARED_TARGET_ACCESSIONS`, żeby flaga `verified:false` wędrowała razem z numerem; wystawić to w `resolvedGrounding` |
| Flagi | implementacja JEST · WYNIK: brak zapieczętowanego przebiegu intake → NIEZWERYFIKOWANE · UI: `#/drug` · PROD NIEZWERYFIKOWANE · walidacja naukowa NIE |

### 2.2. Dane → model aktywności

| | |
|---|---|
| Plik i eksport | dane: `campaign/glp1rActivity.json` + `.meta.json` (sha256 `5533d8b8…e69244`, `n:287`, pin z 15.09). Model: `campaign/glp1rQsar.mjs` (`trainAndValidate` :163, `predictQsar` :230), `glp1rQsarV2.mjs` (`applyFrozenGate` :240). Bramka: `campaign/glp1r-validation-gate.json` (`ruleFingerprint d2f77a7e6042f0fc`, MIN_TRAIN 150, MIN_TEST 40, MAX_MAE 1,0, MIN_R2 0,25) |
| Wywołanie | `campaign/molecularMission.mjs:58-60,154-170,464-492`; skrypty `scripts/glp1r-{e2e,v2-e2e,d143-stratification,d144-expanded}.mjs` |
| Źródło danych | ChEMBL, cel CHEMBL1784, wszystkie wiersze `Homo sapiens`. **Rozkład typów: EC50 194, IC50 89, KI 4** (policzone na pliku) |
| Test | `glp1rQsar.test.mjs`, `glp1rQsarV2.test.mjs`, `molecularMissionD074.test.mjs` — glob CI |
| WYNIK | **TAK, zapieczętowany:** `glp1r-d143-stratification.sealed.json` (kontrola MAE 1,1726; tylko małe cząsteczki R² −29,29), `glp1r-d144-expanded.sealed.json` (najlepsze ramię 638 wierszy / 338 cząsteczek, **MAE 1,0118 > 1,0, gateMet false**, `gate.relaxed:false`, `pinUnchanged:true`). Narracja: `docs/DECISIONS.md` D-077, D-077a, D-079, D-143, D-144 |
| Ograniczenie | **EC50 (funkcjonalne) i IC50/Ki (wiązanie) zlane na jedną oś** przez `endpointFamily.mjs:36 AFFINITY_FAMILY`. W pinie `assayType` i `assayDescription` są puste dla wszystkich wierszy — rozdzielić da się tylko po `assayId`. **Brak etykiety efektywności agonistycznej (Emax).** Bogatszy opis testu istnieje, ale we froncie: `core/biotechData/a1-glp1/activities-*.json` (`assayDescription`, np. „…cAMP accumulation…HTRF", „beta-arrestin-2 recruitment") i nie jest podłączony do pinu backendu |
| Najmniejsza zmiana | przeprowadzić `assayId → assayDescription` i kolumnę `endpointRole: 'FUNCTIONAL_AGONISM' \| 'BINDING_DISPLACEMENT'` przez `campaign/glp1rDataset.mjs:37 normalizeGlp1rRows`, dodać ramię per rola w skrypcie D-144. **Bramki nie trzeba ruszać** — ramiona są istniejącym, usankcjonowanym mechanizmem |
| Flagi | implementacja JEST · WYNIK TAK · UI: pośrednio · PROD NIEZWERYFIKOWANE · **walidacja naukowa NIE — bramka nie przeszła** |

### 2.3. Model → kandydaci

| | |
|---|---|
| Plik i eksport | trzy prawdziwe wykonawcy: (a) `campaign/researchIntake.mjs:771 selectResearchPriorityCandidate`; (b) `campaign/multiFidelity.mjs:56 selectForStage` + `:88 applyPredictionHardFilters` wobec `campaign/frozen-prediction-thresholds.json`; (c) `campaign/molecularMission.mjs:252 decide` |
| Wywołanie | (a) w ścieżce intake; (b) `runMultiFidelityStage` :320; (c) `scripts/genesis-molecular-mission-demo.mjs` — **`runMolecularMission` nie jest importowane w `api.mjs`** |
| Źródło danych | dokowanie Vina, ADMET, QM, oś QSAR |
| Test | `molecularMissionD074.test.mjs`; front: `govDrugLowerHarmFunnel.test.ts:206-226`, `govLowerHarmDiscovery.test.ts:353` („NO_WINNER nigdy nie tworzy Recipe"), `govDrugDiscoveryE2EPreregistration.test.ts:58` — glob CI |
| Zachowanie przy nieprzejściu bramki | **poprawne:** `molecularMission.mjs:260` dokłada blocker z kodem `GATE_NOT_MET`, `:266` ustawia `outcome = 'NO_WINNER'`. Brak nominacji jest pełnoprawnym wynikiem, obsłużonym też w UI (`VerdictBanner.tsx:19`, `WinnerGatePanel.tsx:11-82`, `ProvenanceDag.tsx:97`) |
| Ograniczenie | **(1) Brak celu dokowania GLP-1R** (`compute/dockingTargets.mjs:17-19` = tylko `ABL1_1IEP`; na dysku jest jeszcze `compute/targets/oprm1-5c1m/`, niezarejestrowany). Jedyna oś porządkująca finalistów to dokowanie (`candidateProtocol.mjs:265-277`), więc dla GLP-1R ranking jest dziś nieobliczalny. **(2)** `researchGateStatus` jest ustawiane na `null` (:490) i nigdzie poza testami nie przypisywane, więc intake **strukturalnie nigdy nie nominuje** kandydata. **(3)** jedyny wykonawca, który odmawia przy nieprzejściu bramki, nie jest wystawiony przez API |
| Najmniejsza zmiana | (a) dodać wpis `GLP1R_<pdb>` do `dockingTargets.mjs` wraz z `SOURCE.json` (struktura aktywnego stanu GLP-1R) — reszta ścieżki działa bez zmian; (b) przypisywać `researchGateStatus` z `campaign/scientificIntegration.mjs::researchGateVerdict` (już importowane w `candidateProtocol.mjs:30`); (c) wystawić `runMolecularMission` przez istniejący typ zadania `campaign-run` |
| Flagi | implementacja JEST · WYNIK dla NO_WINNER TAK · UI: `#/campaign`, `#/gov-campaign`; misja nietrasowana · PROD NIEZWERYFIKOWANE · walidacja naukowa NIE |

### 2.4. Kandydat → dossier

| | |
|---|---|
| Plik i eksport | `campaign/researchIntake.mjs:478 candidateDossier`, `:499 buildComputationalCandidateDossier`; `campaign/candidateProtocol.mjs:253 buildCandidateProtocol` (`PROTOCOL_KIND = 'GENESIS_COMPUTATIONAL_CANDIDATE_PROTOCOL'`); `campaign/labClosedLoop.mjs:813 buildLabValidationDossier` |
| Wywołanie | `api.mjs:114` → `api.mjs:691 buildCandidateProtocol(db, campaignId)` |
| Zawartość | hipoteza z prereg i odciskiem, werdykt z zapieczętowanej sesji, cel, silniki z wersją i hashem środowiska, parametry, lejek z powodami odrzuceń, finaliści, niepewność, `evidence.scienceRuns` (inputHash/outputHash/environmentHash), `evidence.blocked`, `replay.engineVerifications` + `howToReproduce`, synteza (nigdy zmyślana, :341-367), `proposedValidationProtocol`, granica, `protocolFingerprint` |
| Tożsamość | kanoniczny SMILES TAK, InChI i **InChIKey TAK** (`researchIntake.mjs:556-561`, z RDKit), `identityFingerprint` (:512-514). **Stereochemia zachowana** — SMILES w pinie niosą `[C@H]/[C@@H]`, kanonikalizacja RDKit jest izomeryczna, nigdzie nie ma zdejmowania stereo |
| Test | `apiLabClosedLoop.test.mjs`, `apiVirtualLabClosedLoop.test.mjs`, `campaign/retrosynthesisHandoff.test.mjs`; front `naturalFormulationDossier.test.ts`, `unifiedResearchJourney.test.ts` — glob CI |
| Ograniczenie | finaliści w `candidateProtocol.mjs:269` niosą tylko `canonicalSmiles`, **bez InChIKey**. **Oś QSAR w ogóle nie wchodzi do protokołu** — nie ma bloku modelu aktywności, więc dossier z API nie potrafi podać wersji modelu przewidywania aktywności. Ekran `#/dossier` (`CandidateDossierScreen.tsx:63`) czyta zapisany artefakt z Science Chat, **a nie** `buildCandidateProtocol` |
| Najmniejsza zmiana | dodać `inchiKey` do wierszy finalistów; dodać blok `activityModel` zasilany z istniejącego kontraktu `glp1rEfficacyAdapter`; skierować `CandidateDossierScreen` na endpoint protokołu |
| Flagi | implementacja JEST · WYNIK: brak przykładowego artefaktu w repo → NIEZWERYFIKOWANE · UI `#/dossier` (inne źródło danych) · PROD NIEZWERYFIKOWANE · walidacja naukowa NIE |

### 2.5. Receptor → szlak

| | |
|---|---|
| Stan | **NIE ISTNIEJE jako obiekt danych.** W `packages/` nie ma żadnego identyfikatora szlaku (Reactome, KEGG, GtoPdb) ani powiązania GLP-1R → Gs → cAMP |
| Co jest | ślad szlaku żyje wyłącznie w opisach testów ChEMBL: `core/biotechData/a1-glp1/activities-*.json` (`assayDescription`) i `data/transcription/glp1r-a3/*.psv`. Klasyfikator odczytu `scripts/d102-readout-classifier.mjs::readoutFamilyOf` (:18-29) sortuje ten tekst regexem na CAMP / ARRESTIN / CALCIUM / INTERNALIZATION / BINDING; test `d102ReadoutClassifier.test.mjs` (glob CI). To heurystyka tekstowa, nie model szlaku |
| Rodzaj działania | `action_type` z ChEMBL jest trzymany tylko jako współzmienna: `scripts/d092-ingest-readiness.mjs:238-239` („NO POLICY EXISTS IN GENESIS … kierunek farmakologii pozostaje otwartym pytaniem prerejestracyjnym"), `scripts/d102-readout-family-prereg.mjs:28` („nigdy nie używane do włączania ani wykluczania"). Antagonizm GCGR to zaszyta lista identyfikatorów `a2OzempicSubstitute.ts:887 GCGR_ANTAGONIST_IDS`, nie odczyt z `/mechanism`. Biasu (cAMP vs arrestyna) nikt nie liczy |
| Najmniejsza zmiana | rekord `ReceptorPathwayEvidence`: cel CHEMBL1784 / UniProt P43220, sprzężenie Gs → cAMP z identyfikatorem GtoPdb lub Reactome, odczyty transducerów powiązane z już przypiętymi `assayId`, `action_type` z ChEMBL `/mechanism` przypięte z sha. Plus jeden test |
| Flagi | implementacja NIE · UI NIE · walidacja naukowa NIE |

### 2.6. Receptor → komórka / neuron

| | |
|---|---|
| Stan | **danych ekspresji nie ma.** HPA, GTEx, Allen, CellxGene, Tabula, scRNA — zero trafień w `packages/` |
| Gatunek | wiersze ChEMBL to „Homo sapiens", ale w liniach rekombinowanych (HEK293, CHO, BHK) — to układy heterologiczne, nie tkanka natywna. Nie ma rozdziału człowiek / gryzoń |
| Wzorzec, który istnieje | `frontend/src/core/liveExperiment/targetAnatomy.ts::TARGET_ANATOMY` (:30-47) — ale zawiera wyłącznie `ABL1_1IEP` i `OPRM1_5C1M`, z podstawą jako tekstem (UniProt + publikacja) i rozdzielczością na poziomie układu narządów. **GLP1R nie występuje.** Cel spoza tabeli zawodzi bezpiecznie: `NO_VERIFIED_ANATOMICAL_MAPPING` (`twinContext.ts:64,82,96`). Wywołania: `twinContext.ts:81,95`, `finalistFalsification.ts:420`, `ScientificWorldsScreen.tsx:813`; testy `targetAnatomy.test.ts`, `twinContext.e2e.test.tsx` (glob CI) |
| Atlas | `public/assets/bodyparts3d/full/atlas.json` (BodyParts3D 4.0, CC BY 4.0, dorosły mężczyzna) ma `Hypothalamus` FMA62008, `Pancreas` FMA7198 i rdzeń przedłużony. **Nie ma jądra łukowatego, pola najdalszego ani wysepek trzustkowych.** Żaden kod nie łączy receptora z identyfikatorem FMA |
| Regiony neuro | `humanLab/neuroLab.ts::NEURO_REGIONS` (:4-16): 11 ręcznie umieszczonych regionów, bez podwzgórza, z ogólnym pniem mózgu |
| Najmniejsza zmiana | wpis `GLP1R` w `TARGET_ANATOMY` (podstawa: UniProt P43220 + identyfikatory HPA/GTEx), opcjonalne `fmaIds: ['FMA62008','FMA7198']`, przypięta próbka danych ekspresji. Uwaga: identyfikator celu dokowania dla GLP1R nadal nie istnieje (patrz 2.3) |
| Flagi | dla GLP-1R: NIE · wzorzec (ABL1/OPRM1) JEST · UI `#/human-biology-lab?target=` (tylko te dwa) · walidacja naukowa NIE |

### 2.7. Komórka → przewidywany efekt

| | |
|---|---|
| Stan | **Brakuje modelu funkcjonalnego tej odpowiedzi. Samo połączenie dockingu, atlasu i danych ekspresji nie wypełnia tej luki.** Wszystko, co istnieje, to wzory albo ziarnowane animacje: żadne nie jest walidowane i żadne nie dotyczy GLP-1R |
| Co konkretnie | `core/virtualBio/models.ts` (nagłówek :3-13, `toy: true`): `RUN_RECEPTOR` (:145-170) — obłożenie C/(KD+C)^n, stałe stężenia, domyślne `KD_nM:10`, Hill 2/5 z `VirtualLabDashboard.tsx:22`, **bez źródła parametrów**; `RUN_PBPK` (:107-143) — trójkompartmentowy Euler, doustny, więc niedopasowany do peptydu podskórnego jak semaglutyd; `RUN_CELL` (:75-105) — wzrost logistyczny z zabijaniem Hilla. „Niepewność" ±10/15% to stały mnożnik, nie oszacowanie. Test `virtualBio.test.ts` (glob CI) obejmuje CELL i PBPK; **`RUN_RECEPTOR` nie ma bezpośredniego testu** |
| | `humanLab/neuroLab.ts::simulateNeuralSignals` (:22-33): amplituda `0.2+rnd*0.8`, latencja `8+rnd*42` ms z `seededRandom`. Nie ma elektrofizjologii, Hodgkina-Huxleya ani modelu częstości wyładowań — zero trafień w repo. Oznaczone `SIMULATION` |
| | `humanLab/physiology.ts::simulatePhysiology` (:12-32) — ręcznie dobrane wzory HR/BP, „Educational"; `humanLab/histology.ts::buildCellModel` (:15-32) — pozycje organelli z `seededRandom`, czyli generator układu graficznego |
| | Nie ma kinetyki cAMP, modelu Emax/PD ani PK peptydu. `compute/registry.mjs` nie zawiera nic receptorowego ani PKPD |
| Jedyne przewidywanie dla GLP-1R | QSAR aktywności ligandu (`campaign/glp1rEfficacyAdapter.mjs`, klasa `MODEL_ESTIMATE`; kontrakt `core/discovery/molecular/glp1rEfficacyContract.ts`). Kończy się na pActivity receptora i **nigdy nie zasila modelu komórki ani Human Explorera** |
| Najmniejsza zmiana | karta modelu operacyjnego (np. `B-GLP1R-CAMP-001`): Emax/EC50 odczytane z przypiętych wierszy cAMP z ChEMBL, z identyfikatorem testu przy każdym parametrze, oznaczona TOY do czasu walidacji na wierszach odłożonych |
| Flagi | implementacja: tylko zabawki · etykiety uczciwości JEST · walidacja naukowa NIE · powiązanie GLP-1R/komórka NIE |

### 2.8. Dossier → laboratorium

| | |
|---|---|
| Plik i eksport | `campaign/labClosedLoop.mjs:181-264 createLabValidationRequest` (+ `sanitizeEndpointPlan` :107-129, `resolveProtocolLink` :147-171) |
| Wywołanie | `api.mjs:628-656` → `client.ts:1168,1197` → `components/LabValidationPanel.tsx` → `CampaignScreen.tsx:558`, trasa `#/campaign` |
| Co przyjmuje | `campaignId`, `candidateId`, `objective`, `endpointPlan[]` (≤16, każdy z `endpointId`, `expectedUnit`, `comparisonOutputKey`, `tolerance{absolute,relative}`, `rationale` — zamrożone i zhashowane), `externalProvider{providerId, providerType}`, `preregistrationRef` (tekst ≤500 znaków), `preclinicalProtocol` + `requiredWetLabId` albo `governedManualRequest`. Dokłada `candidateSmiles`, `executionAuthority:'EXTERNAL_LAB_ONLY'`, `claimBoundary` (:55), `requestFingerprint` |
| Test | `apiLabClosedLoop.test.mjs`, ok. 30 testów (glob CI). Spec Playwright `labClosedLoop.e2e.spec.ts` **nie jest uruchamiany w CI** |
| Ograniczenie | **Nie ma pól: typ testu jako pole strukturalne, linia komórkowa / układ, gatunek, kontrole dodatnia i ujemna, kryteria akceptacji poza tolerancją, plan analizy (model krzywej, n, powtórzenia, statystyka), tożsamość związku, seria/partia, czystość i QC próbki.** Do tego `LabValidationPanel.tsx:105` zawsze wysyła `governedManualRequest` z zaszytym powodem i nigdy nie przekazuje `preclinicalProtocol`, więc UI **omija zarządzanie protokołem**. `preregistrationRef` nie jest weryfikowany wobec żadnego hasha |
| Dla GLP-1R | `candidateProtocol.mjs:175-222 proposedValidationProtocol` ma słownik czterech pozycji: dokowanie → test inhibicji IC50, hERG, Ames, LC-MS/NMR. **Dla agonisty GLP-1R właściwym odczytem jest cAMP EC50/Emax w komórkach z receptorem — takiego wpisu nie ma, a test inhibicji IC50 jest dla agonisty odczytem niewłaściwym.** Warunki („zwalidowany test z kontrolami") istnieją tylko jako proza; każdy krok ma `status:'NOT_EXECUTED'`, `apparatus:'NOT_CONNECTED'` |
| Najmniejsza zmiana | obiekt `wetLabDesign` w ładunku i odcisku: `assayType`, `system{cellLine, species, receptorConstruct}`, `controls[]`, `acceptanceCriteria[]`, `analysisPlan`, `compound{smiles, batchId, purity, identityMethod}`; odmowa przy brakującym polu, wzorem istniejącej odmowy `endpoint_plan_comparison_binding_incomplete`. Do tego mapa testu per cel (GLP-1R → akumulacja cAMP, EC50/Emax, referencyjny agonista jako kontrola dodatnia) |
| Flagi | implementacja JEST (projekt niepełny) · WYNIK: brak prawdziwego zlecenia → NIEZWERYFIKOWANE · UI `#/campaign` · PROD NIEZWERYFIKOWANE · walidacja naukowa NIE |

### 2.9. Trasa syntezy dla chemika

| | |
|---|---|
| Plik i eksport | `compute/retroAdapter.mjs` (AiZynthFinder, `RETRO_EVIDENCE_CLASS='MODEL_ESTIMATE'` :33-36), `campaign/retrosynthesis.mjs:95-121 routeArtefactFromRun`, `campaign/retrosynthesisHandoff.mjs::buildRetrosynthesisHandoff` |
| WYNIK | **TAK:** `docs/evidence/imatinib-retrosynthesis-2026-09-27.json` — przypadek referencyjny (aspiryna) przeszedł, 7 tras, wszystkie substraty dostępne, `replayVerdict: "MATCH"` |
| Zastrzeżenie dla specjalisty | JEST: `retrosynthesis.mjs:120` („wykwalifikowany chemik decyduje, czy którykolwiek krok zostanie wykonany"), `candidateProtocol.mjs:243`, `retroAdapter.mjs:19-20` („nigdy procedura do wykonania") |
| Ograniczenie | brak warunków reakcji, odczynników i stechiometrii (granica mówi o tym wprost); brak źródła literaturowego per krok (`templateHash`, klasyfikacja „0.0 Unrecognized"); **brak listy warunków niesprawdzonych**; `reactionsForward` odwraca kolejność kroków, ale każdy `reactionSmiles` zostaje w notacji retro (produkt>>prekursory), co chemik może odczytać na odwrót; **trasa nie jest dowiązana do zlecenia laboratoryjnego**. Komentarze `candidateProtocol.mjs:16` i `:207` nadal twierdzą, że Genesis nie ma silnika retrosyntezy — to nieprawda wobec `retroAdapter.mjs` |
| Najmniejsza zmiana | widok dla chemika: reakcje zapisane w przód, nazwana klasa przekształcenia, `conditionsUnknown:true` i `sourceReferences:[]` per krok, dowiązanie `outputHash` trasy do odcisku zlecenia; poprawić dwa nieaktualne komentarze |

### 2.10. Pomiar → porównanie

| | |
|---|---|
| Plik i eksport | `labClosedLoop.mjs:294-420 ingestExternalLabObservation`, `:428-520 reviewExternalLabObservation`, `:625-754 compareModelToLabObservation`, `:766-810 deriveNextResearchAction` |
| Wywołanie | `api.mjs:761` (przyjęcie), `:781` (przegląd — proponuje wyłącznie Evidence), `:819` (porównanie) |
| Co działa dobrze | obserwacja wymaga `endpointId`, `value`, `unit`, `observedAt`, `methodReference`, `source{labId, externalObservationId, sourceUri, providerType}`, `rawArtifactSha256` (64 hex); trafia jako `INGESTED_UNREVIEWED`; recenzent nie może być osobą, która wprowadziła dane (:455); `QC_FAILED` nie może zostać zaakceptowane; tolerancja, klucz i jednostka pochodzą z planu zamrożonego przy zleceniu, nigdy od wywołującego; niezgodność jednostek odrzucana (:681); werdykt `AGREES_WITHIN_TOLERANCE` / `DISAGREES_OUTSIDE_TOLERANCE` (:742) jest **osobny od replay MATCH** |
| Ograniczenie | **Zamrożona predykcja tylko częściowo:** zamrożone są tolerancja, klucz i jednostka, ale nie sama przewidziana wartość — `scienceRunId` jest wybierany w chwili porównania i nic nie sprawdza, czy przebieg poprzedza zlecenie. `preregistrationRef` nie jest weryfikowany hashem. **Surowe dane nie są przechowywane:** zapisywany jest wyłącznie `rawArtifactSha256` wpisany przez wywołującego, w UI jako pole tekstowe (`LabValidationPanel.tsx:131`) — plik nie jest wysyłany ani hashowany po stronie serwera, więc **podmiana pliku nie zostanie wykryta**. **Brak niezgodności protokołu i partii:** `methodReference` to wolny tekst, nieporównywany z `protocolLink`; pola partii nie ma. **Powtórzenia:** identyczna treść deduplikuje się do tego samego `observationId` (:377), ten sam `labId` + `externalObservationId` z inną treścią daje konflikt (:368), ale te same dane pod nowym identyfikatorem zapiszą się jako nowa obserwacja; „niezależność" liczona jest jako różne napisy `labId` (:795), bez modelu powtórzeń technicznych i biologicznych. **Flagi niezgodności gatunku nie ma nigdzie** |
| Najmniejsza zmiana | serwerowy upload surowego pliku z sha256 liczonym po stronie serwera; `compound{batchId}`, `system{species, cellLine}`, `protocolFingerprint` na obserwacji z odmową przy niezgodności; `predictionSnapshot{scienceRunId, outputHash, frozenAt}` wiązany przy tworzeniu zlecenia; `replicateOf` i `biologicalReplicate` |
| Flagi | implementacja JEST · WYNIK: brak prawdziwego pomiaru → NIEZWERYFIKOWANE · UI `#/campaign` · PROD NIEZWERYFIKOWANE · walidacja naukowa NIE |

### 2.11. Replay a trafność biologiczna (doprecyzowanie 25.7)

Rozdział **w ścieżce lekowej jest czysty**:

- **Replay** (odtwarzalność): `core/matrixFoundation/replayVerdict.ts:23` `MATCH|DRIFT|BLOCKED|NOT_REPRODUCIBLE`; `campaign/verify.mjs:57-63` `MATCH|DRIFT|ENGINE_VERSION_CHANGED|BLOCKED_BY_RUNTIME|REPLAY_UNSUPPORTED`; `campaign/virtualLabClosedLoop.mjs:104-111` z przedrostkiem `REPLAY_`.
- **Hipoteza** (trafność): `experimentFabric/scientificDiscovery.ts:8 HypothesisAssessment` (SUPPORTED_WITHIN_PROTOCOL / FALSIFIED_WITHIN_PROTOCOL / INCONCLUSIVE); `labClosedLoop.mjs:742` AGREES/DISAGREES; `core/liveExperiment/finalistFalsification.ts` PASS/FAIL.

Sytuacja „replay poprawny, hipoteza obalona" jest reprezentowalna i nie jest sprzecznością.

**Jedno miejsce łamie tę zasadę, poza biologią:** `core/observation/nuclearAme2020.ts:9,121-126` zwraca `'MATCH'`, gdy przewidywanie SEMF mieści się w tolerancji wobec **zmierzonej** energii wiązania AME2020, a tego samego słowa używa dla swojego replay (:11,108). To kolizja słownictwa. Graniczny przypadek: `discovery/experimentComparison.ts:35,79` używa `matchStatus` MATCH/DRIFT w znaczeniu replay.
**Najmniejsza zmiana:** przemianować status porównania w `nuclearAme2020.ts` na `AGREES_WITHIN_TOLERANCE`/`DISAGREES` i dodać test zabraniający `'MATCH'` w modułach porównania.

### 2.12. Wynik → Human Explorer

| | |
|---|---|
| Kanał na dane z zewnątrz | JEST, ale wąski: `twinContext.ts::resolveTwinContext` (:74-99) czyta `LiveDrugRun`, `twinContextLines` (:129-161) pokazuje wartości Vina, ADMET i QM z identyfikatorami przebiegu i etykietami; render `HumanExplorerPanel.tsx:221-240`. Linia „Efekt leku w tym narządzie" jest zaszyta jako `NOT_VALIDATED` (:159). **Ekspresja receptora i przewidywania komórkowe nie mają w ogóle kanału wejściowego** — panel zapełni tylko przebieg dokowania dla ABL1/OPRM1 |
| Własna logika | rdzeń Human Explorera nie używa `Math.random`; liczby pochodzą z `seededRandom` (ziarno 7, `ScientificWorldsScreen.tsx:629`). Fizjologia, neuro i organelle są generowane w aplikacji, nie przekazywane, i oznaczone MODEL/SIMULATION |
| Mikroskopia | **prawdziwych zdjęć nie ma.** `biologyRunners.ts:107-113` wymusza DIGITAL_ZOOM / CELL_MODEL / SUBCELLULAR_MODEL, bo „nie podłączono źródła optycznego"; `VirtualMicroscope.tsx` rysuje 220 okręgów na kanwie z zabawkowej żywotności (`virtualBio/microscope.ts:26-62`) z banerem |
| **Podstawienie pod nazwą** | `core/scientificWorlds/humanExplorer.ts:46-52` mapuje nerkę, żołądek, jelito cienkie i **trzustkę** na ten sam `tissue: 'EPITHELIUM'`, a `biologyRunners.ts:118` domyślnie podstawia `EPITHELIUM` dla nieznanej tkanki po cichu. `TissueType` (`humanLab/types.ts:168`) nie zna trzustki, wysepek ani podwzgórza. Łagodzi to etykieta „Wirtualna próbka referencyjna (EPITHELIUM…)" (:119) i tagi `SIMULATED` (:85-87), ale **widok trzustki nadal nie pokazuje komórek beta** |
| Tryby widoku | `core/guide/narrationModel.ts:14` `GuideLevel = 'EXPLORER' \| 'SCIENTIST' \| 'AUDITOR'`, komentarz (:10): poziomy „zmieniają ilość szczegółu, nigdy fakty"; używane tylko w `narrateReport`/`narrateSession`. **Zmienia prezentację, nie wynik.** Ról użytkownika nie ma |
| Najmniejsza zmiana | dodać typy tkanki `PANCREAS_ISLET` / `HYPOTHALAMIC` albo jawny stan `NO_TISSUE_MODEL`, usunąć ciche domyślne `EPITHELIUM`, dodać rodzaj linii `expression` w `twinContextLines` zasilany przypiętą próbką |

### 2.13. Badanie czasu („10×", doprecyzowanie 25.9)

`git ls-tree origin/main docs/evidence/prep-time-study` nie zwraca nic — **na main tego nie ma.** Materiał jest tylko na gałęzi `claude/project-thread-mk7f49` (nie dotykano jej; odczyt przez API GitHuba): `PROTOCOL.md`, `prereg.json` (`frozenAt 2026-09-29`, odcisk `4fbb5531…`), `timing-sheet.csv` **pusty, 10 pustych wierszy**, `genesis-arm.json`, `about-you.md`, `inputs/`.

Wykonane jest tylko ramię Genesis: 5,3 s czasu maszynowego na 10 kompleksów, oznaczone PROVISIONAL (maszyna obciążona), `activeHumanSeconds: 0` „z konstrukcji", nie z pomiaru. Ramię ręczne nie zostało wykonane.

**Braki wobec Twojego punktu 25.9:** porównanie jest „specjalista ze swoimi narzędziami" kontra „jedna komenda Genesis", a nie „specjalista wspomagany Genesis"; **czas kontroli i poprawiania błędów nie jest wydzielony** — są tylko kolumny aktywny/oczekiwanie/przerwania, a czas specjalisty na sprawdzenie i naprawę wyniku Genesis jest przyjęty jako zero; zakres to samo przygotowanie do dokowania (receptor, ligand, box), bez GLP-1R i bez dossier czy pakietu dla laboratorium; n = 1 operator.
**Najmniejsza zmiana:** dodać ramię „człowiek wspomagany Genesis" z kolumnami `check_minutes` i `fix_minutes`, tę samą bramkę dla obu ramion, i scalić do main.

---

## 3. Mapa luk, rozdzielona

### 3.1. Brak kodu (da się napisać, nic więcej nie potrzeba)
1. `GLP1R` nie jest zarejestrowany jako cel dokowania — `compute/dockingTargets.mjs:17-19`.
2. `researchGateStatus` nigdy nie jest przypisywany w ścieżce intake — `researchIntake.mjs:490`.
3. `runMolecularMission` nie jest wystawiony przez API, więc werdykt NO_WINNER jest nieosiągalny z interfejsu.
4. Brak numeru UniProt i gatunku w rekordzie celu.
5. `buildCandidateProtocol` bez bloku modelu aktywności i bez InChIKey u finalistów.
6. Zlecenie laboratoryjne bez pól projektu badania (układ, kontrole, kryteria, analiza, partia).
7. UI zawsze omija zarządzanie protokołem (`LabValidationPanel.tsx:105`).
8. Brak serwerowego hashowania surowego pliku pomiaru.
9. Brak związania przewidzianej wartości z chwilą zlecenia (`predictionSnapshot`).
10. Brak flag niezgodności gatunku, protokołu i partii oraz modelu powtórzeń.
11. Ciche podstawienie `EPITHELIUM` dla trzustki i innych narządów.
12. Kolizja słowa `MATCH` w `nuclearAme2020.ts`.
13. Nieaktualne komentarze o braku retrosyntezy w `candidateProtocol.mjs:16,207`.

### 3.2. Brak danych
14. Struktura GLP-1R do dokowania (plik PDB aktywnego stanu z ligandem odniesienia).
15. Rodzaj odczytu i etykieta agonizmu w pinie GLP-1R (jest do odzyskania z `assayId`, więc częściowo to praca kodu).
16. Dane ekspresji GLP-1R (typ komórki, tkanka, gatunek) — HPA/GTEx/Allen. **Sieć blokuje większość źródeł**, więc to pozycja zależna od ustawień albo od danych już w repo.
17. Powiązanie receptor → szlak z identyfikatorem bazy (GtoPdb/Reactome) i `action_type` z ChEMBL `/mechanism`.
18. Prawdziwe obrazy mikroskopowe per tkanka.
19. Puste `timing-sheet.csv` w badaniu czasu.

### 3.3. Brak modelu
20. **Model funkcjonalny odpowiedzi komórki/neuronu na aktywację receptora.** Nie ma kinetyki cAMP, Emax/PD, PK peptydu ani elektrofizjologii. Samo połączenie dockingu, atlasu i danych ekspresji tej luki nie wypełnia.
21. Model QSAR GLP-1R nadal nie przechodzi bramki; nie można obiecywać, że zmiana deskryptorów wystarczy (dwa niezależne podziały dały R² −29,29 i −0,1352).

### 3.4. Brak walidacji
22. Żadna pozycja łańcucha nie ma walidacji naukowej.
23. Nie istnieje ani jeden przebieg z prawdziwym pomiarem laboratoryjnym, więc ścieżka pomiar → porównanie nigdy nie została przejechana na prawdziwych danych.
24. Nie sprawdzono produkcji.
25. Nie wiadomo, czy testy przechodzą na `d23a89b4` (nie uruchamiano ich).

### 3.5. Brak eksperta / rzeczy poza kodem
26. Chemik medyczny, który oceni trasę syntezy i projekt badania.
27. Laboratorium wykonujące test cAMP na GLP-1R, z kontrolami i referencyjnym agonistą.
28. Osoba, która wykona ręczne ramię badania czasu.
29. Recenzent farmakologiczny dla powiązania receptor → szlak → typ komórki.

---

## 4. Minimalny zakres pierwszego wdrożenia

Jeden cel (GLP-1R, człowiek), jeden rodzaj pomiaru (akumulacja cAMP, EC50/Emax), określona pula związków, dossier, projekt badania dla laboratorium. Nic poza tym.

**Uczciwe zastrzeżenie na wejściu:** nie wiadomo, czy dostępne dane pozwolą odpowiedzieć na pytanie. Pierwszy krok nie jest budowaniem modelu, tylko **sprawdzeniem, czy po rozdzieleniu odczytów zostaje dość wierszy funkcjonalnych, żeby w ogóle podejść do bramki** (przy MIN_TRAIN 150 i 194 wierszach EC50 przed deduplikacją to jest otwarte pytanie, nie formalność). Jeżeli nie zostaje, prawidłowym wynikiem jest raport negatywny i zatrzymanie, a nie zmiana deskryptorów w nadziei na przejście.

Kolejność:

1. **Tożsamość celu.** `uniprot: 'P43220'`, `species`, `taxonId` w `BUNDLED_TARGETS.GLP1R`, z zachowaniem flagi `verified:false` dopóki egress jest zablokowany.
2. **Rozdzielenie odczytów.** `endpointRole` przeprowadzone przez `normalizeGlp1rRows`, policzone wiersze funkcjonalne i wiążące. To jest pomiar diagnostyczny, prerejestrowany, bez dotykania bramki.
3. **Decyzja punktu kontrolnego.** Jeśli wierszy funkcjonalnych jest za mało — raport negatywny, koniec pierwszego przebiegu. Jeśli wystarczy — ramię funkcjonalne w skrypcie D-144, z werdyktem bramki jak dotąd.
4. **Cel dokowania GLP-1R** w `dockingTargets.mjs` wraz z `SOURCE.json`; dopiero to odblokowuje oś porządkującą finalistów.
5. **Karta celu w Human Explorerze:** wpis `GLP1R` w `TARGET_ANATOMY` z podstawą źródłową, oznaczony jako wiedza źródłowa, nie predykcja Genesis. Bez przewidywania odpowiedzi neuronu.
6. **Projekt badania cAMP** jako wpis w mapie testów per cel plus pola `wetLabDesign` w zleceniu laboratoryjnym, z klauzulą przeglądu specjalisty.

W pierwszym przebiegu obowiązuje: kandydat zachowuje jednoznaczną tożsamość i stereochemię; każda predykcja ma źródło, wersję modelu i ograniczenia; braki dowodów pozostają widoczne; wynik prowadzi do projektu badania, nie do deklaracji skuteczności; przewidywanie odpowiedzi neuronu pojawia się wyłącznie wtedy, gdy istnieje oceniony model — czyli w tym przebiegu nie pojawia się wcale. Jeśli żaden związek nie spełnia warunków, prawidłowym wynikiem jest brak nominacji.

---

## 5. Lista planowanych zmian w konkretnych plikach

| # | Plik | Zmiana |
|---|---|---|
| 1 | `packages/backend/src/campaign/researchIntake.mjs` | `uniprot`/`species`/`taxonId` w `BUNDLED_TARGETS.GLP1R`, źródłowane z `DECLARED_TARGET_ACCESSIONS`; wystawić w `resolvedGrounding` |
| 2 | `packages/backend/src/campaign/glp1rDataset.mjs` | kolumny `assayDescription` i `endpointRole` w `normalizeGlp1rRows` |
| 3 | `packages/backend/src/campaign/glp1r-d151-endpoint-role-prereg.json` (nowy) | prerejestracja diagnostyki rozdziału odczytów, przed liczeniem |
| 4 | `scripts/glp1r-d151-endpoint-role.mjs` (nowy) | policzenie wierszy funkcjonalnych i wiążących, zapieczętowany wynik |
| 5 | `packages/backend/src/compute/dockingTargets.mjs` + `compute/targets/glp1r-<pdb>/` | rejestracja celu GLP-1R z `SOURCE.json` |
| 6 | `packages/frontend/src/core/liveExperiment/targetAnatomy.ts` | wpis `GLP1R` z podstawą źródłową i opcjonalnymi `fmaIds` |
| 7 | `packages/backend/src/campaign/candidateProtocol.mjs` | blok `activityModel`, `inchiKey` u finalistów, mapa testu per cel, poprawka komentarzy :16 i :207 |
| 8 | `packages/backend/src/campaign/labClosedLoop.mjs` | `wetLabDesign` w ładunku i odcisku, odmowa przy brakującym polu |
| 9 | `packages/frontend/src/components/LabValidationPanel.tsx` | przestać zawsze wysyłać `governedManualRequest`; formularz projektu badania |
| 10 | `packages/frontend/src/core/scientificWorlds/humanExplorer.ts`, `humanLab/types.ts`, `biologyRunners.ts` | usunięcie cichego `EPITHELIUM`, stan `NO_TISSUE_MODEL` |
| 11 | `packages/frontend/src/core/observation/nuclearAme2020.ts` | przemianowanie statusu porównania |

Pozycje 8–11 są rozdzielne i mogą pójść osobnymi PR-ami. Żadna z nich nie zmienia bramki ani zapieczętowanych wyników.

---

## 6. Plan testów akceptacyjnych (do przyszłej implementacji, nie uruchamiane teraz)

| Próba | Oczekiwane zachowanie |
|---|---|
| Dobre dokowanie, brak dowodu agonizmu | system nie deklaruje aktywacji receptora; werdykt zostaje przy powinowactwie |
| Dane ekspresji receptora, brak modelu funkcjonalnego | widoczny kontekst komórkowy oznaczony jako wiedza źródłowa; brak liczby opisującej odpowiedź neuronu |
| Model nie przechodzi bramki | brak rankingu opartego na tym modelu; `NO_WINNER` z kodem blokady |
| Dane z innego gatunku | różnica widoczna na obserwacji i w dossier; brak cichego przeniesienia wniosku |
| Obserwacja nie pasuje do protokołu lub partii związku | odmowa przyjęcia jako walidacji predykcji; status wymaga wyjaśnienia |
| Ten sam pomiar przesłany ponownie | nie liczy się jako niezależne powtórzenie; `replicateOf` wymagane |
| Zmieniono plik wejściowy lub wynik | kontrola integralności (sha po stronie serwera) wykrywa zmianę |
| Brak danych mikroskopowych dla wybranej tkanki | jawny `NO_TISSUE_MODEL`; brak podstawienia innej próbki pod właściwą nazwą |
| Przełączenie widoku uczeń/naukowiec | zmienia prezentację, nie wynik ani siłę twierdzenia |
| Brak pozytywnego wyniku | pełny raport negatywny, nie pusty ekran i nie wymuszony zwycięzca |
| Replay poprawny, hipoteza obalona | oba statusy współistnieją, żaden nie nadpisuje drugiego |

---

## 7. Zależności i szacunek pracy

Szacunki zakładają jednego wykonawcę, istniejące wzorce w repo i brak zmian w bramkach. Są to założenia, nie obietnice.

| Blok | Programowanie | Obliczenia | Oczekiwanie na dane / ludzi |
|---|---|---|---|
| Tożsamość celu (1) | godziny | brak | brak |
| Rozdział odczytów + prereg + przebieg (2-4) | godziny | minuty | brak |
| Cel dokowania GLP-1R (5) | godziny | zależne od przebiegu Astex; **kolizja z Run 8** | wymaga pliku struktury; `rcsb.org` jest zablokowany |
| Karta celu w Explorerze (6) | godziny | brak | dane ekspresji zablokowane siecią |
| Protokół i dossier (7) | dzień | brak | brak |
| Pola projektu badania + UI (8-9) | dzień lub dwa | brak | wymaga oceny chemika co do pól |
| Higiena (10-11) | godziny | brak | brak |
| Prawdziwy pomiar cAMP | — | — | **tygodnie do miesięcy: laboratorium, związki, budżet** |

Zależność twarda: punkt 5 potrzebuje mocy obliczeniowej, a Run 8 nadal liczy na tej samej maszynie. Nic z tego nie rusza przed zakończeniem Run 8.

---

## 8. Trzy odpowiedzi

**Co można połączyć już istniejącym kodem?**
Tożsamość celu z numerem UniProt; rozdzielenie odczytów funkcjonalnych od wiążących w istniejącym pinie; rejestrację celu dokowania GLP-1R (wzorzec ABL1 działa bez zmian w reszcie ścieżki); wpis GLP-1R w tabeli anatomii jako wiedzę źródłową; blok modelu aktywności i InChIKey w protokole kandydata; pola projektu badania w zleceniu laboratoryjnym; usunięcie cichego podstawiania tkanki; rozdzielenie słowa MATCH. To wszystko jest dokładaniem pól i wpisów do struktur, które już istnieją i mają testy — nie jest to nowy system.

**Co wymaga nowych danych albo nowego modelu?**
Struktura GLP-1R do dokowania (plik, sieć blokuje `rcsb.org`). Dane ekspresji receptora w typach komórek i tkankach, z gatunkiem (sieć blokuje większość źródeł). Reprezentacja cząsteczek inna niż odciski Morgana dla QSAR, z własną, osobną bramką — bez obietnicy, że to wystarczy. **I przede wszystkim: model funkcjonalny odpowiedzi komórki lub neuronu na aktywację receptora, którego nie ma i którego nie zastąpi połączenie dockingu, atlasu i ekspresji.**

**Co musi potwierdzić prawdziwy eksperyment?**
Że wskazany związek naprawdę aktywuje ludzki receptor GLP-1 w komórkach — pomiar cAMP z kontrolami, wykonany w laboratorium, na związku o potwierdzonej tożsamości i znanej partii. Bez tego każdy wynik Genesis pozostaje przewidywaniem, a nie kandydatem. Dopiero porównanie takiego pomiaru z zamrożoną wcześniej predykcją zamyka łańcuch, o który pytasz.

---

**Granice tego przeglądu.** Tylko odczyt na `d23a89b4`. Nie uruchomiono żadnego testu, więc „w CI" znaczy „w globie", nie „przechodzi". Produkcji nie sprawdzono. Gałęzi Run 8 nie dotykano; materiał badania czasu odczytano wyłącznie przez API GitHuba. Jeden odczyt (`docs/evidence/finalist-falsification-2026-09-27.json` razem z łańcuchem hashy Pamięci Naukowej) został zablokowany przez klasyfikator uprawnień i pozostaje NIEZWERYFIKOWANY. Statusy pochodzą z kodu i zapieczętowanych artefaktów, nie z domysłów; gdzie brakowało dowodu, jest napisane NIEZWERYFIKOWANE.
