# GLP-1R closed loop: raport przed implementacją

**Punkt odniesienia:** `main` = `d23a89b4`, gałąź dokumentacyjna `claude/project-thread-lct8kl`. Wyłącznie odczyt. Nie zmieniono żadnej bramki, modelu ani danych; nie uruchomiono treningu, kampanii ani testów. Nie dotknięto Run 8 ani gałęzi `claude/project-thread-mk7f49`.
**Poprzedni dokument:** `discovery-cell-neuron-gap-check.md` (ten sam PR).

**Korekta przyjęta:** rozdział agonizmu funkcjonalnego od samego wiązania jest wymaganiem **tego konkretnego przypadku (agonista GLP-1R)**, a nie regułą dla wszystkich przyszłych celów. Kontrakt `endpointRole` jest opisowy (mówi, czym jest wiersz), a nie narzucający politykę wyboru; każda kampania deklaruje we własnej prerejestracji, których ról używa i dlaczego.

---

## A. VERIFY — czy 9 założeń nadal jest prawdziwych

| # | Twierdzenie | Status | Dowód na `d23a89b4` |
|---|---|---|---|
| 1 | `dockingTargets.mjs` nie ma zarejestrowanego GLP-1R | **CONFIRMED** | `packages/backend/src/compute/dockingTargets.mjs:17-19` — `TARGETS` zawiera wyłącznie `ABL1_1IEP`; `DEFAULT_DOCKING_TARGET = 'ABL1_1IEP'` (:22). Na dysku istnieje jeszcze niezarejestrowany `compute/targets/oprm1-5c1m/` |
| 2 | Pin zawiera osobno EC50 i IC50/Ki, ale pipeline łączy je na jednej osi | **CONFIRMED z doprecyzowaniem** | `campaign/glp1rActivity.json`: 287 wierszy, `standardType` = EC50 194 / IC50 89 / KI 4; łączy je `campaign/endpointFamily.mjs:36 AFFINITY_FAMILY = ['EC50','IC50','Ki','Kd']`. **Doprecyzowanie ważne dla planu:** pin ma `assayId` we wszystkich 287 wierszach (25 unikalnych), ale **`assayDescription` nie istnieje w pinie backendu** (0 wierszy). Opisy testów są tylko we froncie (`core/biotechData/a1-glp1/activities-*.json`) i nie pokrywają tych 25 testów |
| 3 | D-144 daje MAE ≈ 1,0118 przy zamrożonym MAX_MAE 1,0 | **CONFIRMED** | `campaign/glp1r-d144-expanded.sealed.json` — ramię H-COMBINED-ALL, 638 wierszy / 338 cząsteczek, MAE 1,0118, `gateMet:false`, `gate.relaxed:false`, `pinUnchanged:true`; bramka `campaign/glp1r-validation-gate.json` (`ruleFingerprint d2f77a7e6042f0fc`) |
| 4 | `molecularMission` przy niespełnionej bramce daje NO_WINNER | **CONFIRMED** | `campaign/molecularMission.mjs:260` (`if (!efficacy.available) blockers.push(...)`) i `:266` (`outcome = blockers.length === 0 ? 'COMPUTATIONAL_CANDIDATE' : 'NO_WINNER'`) |
| 5 | Nie istnieje źródłowy model receptor → pathway | **CONFIRMED** | brak identyfikatorów Reactome/KEGG/GtoPdb w `packages/`. Jedyny ślad to heurystyka tekstowa `scripts/d102-readout-classifier.mjs:18-29`. `action_type` jest jawnie niestosowany jako polityka (`scripts/d092-ingest-readiness.mjs:238-239`) |
| 6 | Brak przypiętych danych ekspresji GLP-1R dla tkanki / typu komórki | **CONFIRMED** | brak HPA, GTEx, Allen, CellxGene w `packages/`. `core/liveExperiment/targetAnatomy.ts:30-47` ma tylko ABL1 i OPRM1; brak wpisu GLP1R |
| 7 | Nie istnieje zwalidowany funkcjonalny model odpowiedzi komórki/neuronu | **CONFIRMED** | `core/virtualBio/models.ts` deklaruje `toy: true`; `humanLab/neuroLab.ts:22-33` generuje amplitudę i latencję z `seededRandom`. Brak kinetyki cAMP, Emax/PD i elektrofizjologii w całym repo |
| 8 | Human Explorer po cichu podstawia ogólne EPITHELIUM | **CONFIRMED** | `core/scientificWorlds/humanExplorer.ts:46-52` — nerka, żołądek, **trzustka**, jelito cienkie mają `tissue: 'EPITHELIUM'`; `biologyRunners.ts:118` domyślnie podstawia `EPITHELIUM` dla nieznanej tkanki |
| 9 | LabClosedLoop nie zamraża kompletnego projektu badania, partii i snapshotu predykcji | **CONFIRMED** | `campaign/labClosedLoop.mjs` — brak `predictionSnapshot` i `frozenAt`; `scienceRunId` wybierany w chwili porównania; `rawArtifactSha256` przyjmowany od wywołującego (UI: `LabValidationPanel.tsx:131`); brak pól partii, gatunku i układu komórkowego |

**Nic z raportu PR #36 nie straciło ważności.** Jedyna zmiana merytoryczna to punkt 2: brak `assayDescription` w pinie backendu przenosi klasyfikację odczytów z „przepisz kolumnę" do „rozstrzygnij 25 identyfikatorów testów" — patrz sekcja C i F.

### Liczby, które zdecydują o hard stopie (punkt 6 master promptu)

Policzone na pinie, bez deduplikacji i bez podziału scaffoldowego:

- 287 wierszy, 214 unikalnych SMILES, 25 unikalnych testów.
- EC50: 194 wiersze, **189 unikalnych SMILES**, 12 unikalnych testów.
- IC50 + Ki: 93 wiersze.

Bramka wymaga MIN_TRAIN 150 i MIN_TEST 40, czyli **≥ 190 wierszy po podziale**. Ramię czysto funkcjonalne startuje więc z 194 wierszy — **na styk, przed deduplikacją i przed podziałem scaffoldowym, który zwykle zabiera dalsze wiersze.** Uczciwie: prawdopodobieństwo, że samo rozdzielenie odczytów wystarczy do przejścia bramki, jest niskie. Najbardziej prawdopodobnym wynikiem PR-A jest `INSUFFICIENT_FUNCTIONAL_DATA` albo `MODEL_GATE_FAILED` — i to jest pełnoprawny wynik, nie porażka.

---

## B. EXACT FILE PLAN

Plik po pliku, z rolą zmiany. Nic tu nie zmienia bramki, zapieczętowanych wyników ani prerejestracji.

### PR-A — GLP1R Target/Data Truth
| Plik | Zmiana |
|---|---|
| `packages/backend/src/campaign/researchIntake.mjs` | `BUNDLED_TARGETS.GLP1R`: `uniprot: 'P43220'`, `species`, `taxonId: 9606`, stan weryfikacji przeniesiony z `bindingDbImport.DECLARED_TARGET_ACCESSIONS` (`verified:false` dopóki egress zablokowany); wystawienie w `resolvedGrounding` |
| `packages/backend/src/campaign/glp1rTargetDossier.mjs` (nowy) | budowa GLP1R Target Dossier z pól, które faktycznie istnieją; pola bez źródła oznaczone `UNVERIFIED`, nigdy `VERIFIED` |
| `packages/backend/src/campaign/glp1rDataset.mjs` | kolumna `endpointRole` (`FUNCTIONAL_AGONISM` / `BINDING_AFFINITY` / `OTHER_FUNCTIONAL` / `UNKNOWN`) w `normalizeGlp1rRows`; brak podstaw → `UNKNOWN`, bez zgadywania |
| `packages/backend/src/campaign/glp1r-assay-roles.json` (nowy) | tabela 25 `assayId` → rola + źródło rozstrzygnięcia + stan weryfikacji; puste role dopóki brak źródła |
| `packages/backend/src/campaign/glp1r-d145-endpoint-role-prereg.json` (nowy) | prerejestracja: reguła klasyfikacji, reguła deduplikacji, gatunek, wymagany cel, minimalne wymagania jakości, definicja „za mało danych" — zapisana **przed** liczeniem |
| `scripts/glp1r-d145-endpoint-role.mjs` (nowy) | policzenie ról, unikalnych związków i scaffoldów; zapieczętowany wynik |
| `packages/backend/src/glp1rEndpointRole.test.mjs` (nowy) | testy krytyczne 1 i 2 z punktu 27 |
| `docs/DECISIONS.md` | wpis D-145 |

### PR-B — GLP1R Docking Target
| Plik | Zmiana |
|---|---|
| `packages/backend/src/compute/targets/glp1r-<pdb>/SOURCE.json` (nowy) | PDB ID, tożsamość celu, gatunek, stan receptora, ligand, rozdzielczość, URL, sha256, provenance przygotowania — wzorowane na `abl1-1iep` |
| `packages/backend/src/compute/targets/glp1r-<pdb>/` | plik receptora i ligandu referencyjnego |
| `packages/backend/src/compute/dockingTargets.mjs` | wpis `GLP1R_<PDB>`; `DEFAULT_DOCKING_TARGET` bez zmian |
| `packages/backend/src/compute/glp1rDockingTarget.test.mjs` (nowy) | rejestracja, hashe, obecność SOURCE.json |
| `docs/evidence/glp1r-structure-selection-prereg.json` (nowy) | zasada wyboru struktury spisana **przed** jakimkolwiek dokowaniem |

### PR-C — Candidate Dossier
| Plik | Zmiana |
|---|---|
| `packages/backend/src/campaign/candidateProtocol.mjs` | blok `activityModel` (wersja modelu, odcisk, hash danych treningowych, niepewność, dziedzina stosowalności) z istniejącego kontraktu `glp1rEfficacyAdapter`; `inchiKey` u finalistów; poprawka nieaktualnych komentarzy o braku retrosyntezy (:16, :207) |
| `packages/backend/src/campaign/candidateProtocol.test.mjs` | asercje na nowe pola; brak `winnerScore` |

### PR-D — Pathway / Anatomy Evidence
| Plik | Zmiana |
|---|---|
| `packages/frontend/src/core/evidence/receptorPathwayEvidence.ts` (nowy) | kontrakt `ReceptorPathwayEvidence` (pola z punktu 11) |
| `packages/frontend/src/core/evidence/targetExpressionEvidence.ts` (nowy) | kontrakt `TargetExpressionEvidence` (pola z punktu 12) |
| `packages/frontend/src/core/liveExperiment/targetAnatomy.ts` | wpis `GLP1R` z podstawą źródłową; jeśli źródło niedostępne → wpis nie powstaje i cel zwraca istniejące `NO_VERIFIED_ANATOMICAL_MAPPING` |
| `packages/frontend/src/core/liveExperiment/twinContext.ts` | rodzaj linii `expression` i `pathway` zasilany z zewnątrz; `NO VERIFIED CELL CONTEXT` gdy brak |
| testy | linie kontekstu nie powstają bez źródła |

### PR-E — Wet Lab Handoff Integrity
| Plik | Zmiana |
|---|---|
| `packages/backend/src/campaign/labClosedLoop.mjs` | `wetLabDesign` (pola z punktu 18) w ładunku i odcisku; `predictionSnapshot` zamrażany przy tworzeniu zlecenia (punkt 19); pola partii, gatunku i układu na obserwacji; jawne niezgodności (punkt 21); serwerowy sha256 surowego artefaktu |
| `packages/backend/src/api.mjs` | przyjęcie pliku surowego i policzenie hasha po stronie serwera |
| `packages/frontend/src/components/LabValidationPanel.tsx` | formularz projektu badania; koniec zawsze wysyłanego `governedManualRequest` |
| `packages/backend/src/apiLabClosedLoop.test.mjs` | testy 7–11 z punktu 27 |

### PR-F — Human Explorer Truth Hygiene
| Plik | Zmiana |
|---|---|
| `packages/frontend/src/core/scientificWorlds/humanExplorer.ts` | koniec mapowania trzustki, nerki, żołądka i jelita na `EPITHELIUM` |
| `packages/frontend/src/core/scientificWorlds/humanLab/types.ts` | `NO_TISSUE_MODEL` jako stan |
| `packages/frontend/src/core/scientificWorlds/biologyRunners.ts` | usunięcie cichego domyślnego `EPITHELIUM` (:118) |
| `packages/frontend/src/__tests__/humanExplorer.test.ts` | test regresyjny: brak modelu tkanki nigdy nie pokazuje cudzego preparatu pod nazwą narządu |

**Poza podziałem PR-A…PR-F:** `core/observation/nuclearAme2020.ts` (kolizja słowa `MATCH`) i chemiczny widok trasy syntezy (punkt 24). Oba są niezależne od GLP-1R; proponuję je jako osobne, małe PR-y po PR-F, żeby nie mieszać ich z tym łańcuchem.

---

## C. DATA PLAN

**Jest w repozytorium, gotowe do użycia:**
- 287 wierszy aktywności GLP-1R z `assayId`, gatunkiem i provenance (`campaign/glp1rActivity.json`), plus 233 wiersze GIPR.
- 757 zweryfikowanych bajtowo wierszy transkrybowanych w `data/transcription/glp1r-a1` z łańcuchem custody, oraz `glp1r-a3` (test → cel).
- Opisy testów dla liraglutydu, semaglutydu i metforminy we froncie (`core/biotechData/a1-glp1/`) z hashami — **pokrywają tylko część testów, nie wszystkie 25**.
- Atlas BodyParts3D 4.0 (CC BY 4.0) z podwzgórzem FMA62008 i trzustką FMA7198, **bez jądra łukowatego i bez wysepek**.

**Trzeba pozyskać, i to jest bramka dostępu, nie praca programistyczna:**
| Potrzebne | Źródło kanoniczne | Stan sieci |
|---|---|---|
| Struktura GLP-1R do dokowania | RCSB PDB | **zablokowane** (`rcsb.org`) |
| Opisy i mechanizmy 25 testów | ChEMBL `/assay`, `/mechanism` | **zablokowane** (`ebi.ac.uk`) |
| Tożsamość celu (potwierdzenie P43220) | UniProt | **zablokowane** |
| Szlak receptor → Gs → cAMP | GtoPdb / Reactome | **zablokowane** |
| Ekspresja w typie komórki i tkance | HPA / GTEx / CELLxGENE | **zablokowane**; do sprawdzenia licencja przed użyciem |

Dostępne są: PyPI, conda, `raw.githubusercontent.com`, `mirror.gcr.io`, `storage.googleapis.com`, `s3.amazonaws.com`. Przy poprzednim blokerze udało się obejść problem paczką z rejestru — spróbuję tego samego, zanim poproszę Cię o zmianę ustawień. Jeżeli się nie uda, właściwym wynikiem jest `BLOCKED_BY_DATA_ACCESS`, a nie podstawienie przypadkowego źródła.

---

## D. GATES — co pozostaje nietknięte

Bez zmian, bez wyjątków:
- `campaign/glp1r-validation-gate.json` (`ruleFingerprint d2f77a7e6042f0fc`, MIN_TRAIN 150, MIN_TEST 40, MAX_MAE 1,0, MIN_R2 0,25) i `gipr-validation-gate.json`.
- `campaign/frozen-prediction-thresholds.json`.
- Wszystkie pliki `*.sealed.json` i istniejące prerejestracje (D-077, D-077a, D-079, D-143, D-144).
- Logika `molecularMission.decide` i ścieżka `NO_WINNER`.
- Werdykty replay w `campaign/verify.mjs` i `core/matrixFoundation/replayVerdict.ts`.
- Cały dorobek Astex i Run 8.

Jeżeli ramię funkcjonalne wymaga innej reprezentacji cząsteczek, dostaje **własną, nową bramkę**, ponieważ istniejąca nazywa algorytm wprost (`ridge-ecfp4-morgan-r2-512bit`). Stara bramka nie jest wtedy zmieniana ani unieważniana.

---

## E. PR PLAN

Kolejność wynika z zależności, nie z wygody:

1. **PR-A** — tożsamość celu i prawda o danych. Niezależny. **Zawiera punkt kontrolny:** jeżeli liczby po uczciwym rozdzieleniu nie pozwalają zastosować istniejącej metodologii, PR-A kończy się wynikiem `INSUFFICIENT_FUNCTIONAL_DATA` i **PR dla modelu nie powstaje**.
2. **PR-B** — cel dokowania. Zależy od dostępu do PDB. Wymaga compute, więc **czeka na koniec Run 8**.
3. **PR-C** — dossier kandydata. Zależy od PR-A (wersja modelu jest polem, nawet gdy model jest BLOCKED).
4. **PR-D** — szlak i ekspresja. Zależy od dostępu do źródeł; kontrakty mogą powstać wcześniej, dane później.
5. **PR-E** — integralność przekazania do laboratorium. Niezależny od GLP-1R, wartościowy sam w sobie.
6. **PR-F** — higiena Human Explorera. Całkowicie niezależny, najmniejszy, najszybszy.

Gdybym miał zacząć dziś od jednego: **PR-F**, bo naprawia rzecz nieprawdziwą, którą widać na ekranie, i nie wymaga ani sieci, ani compute. Zaraz po nim **PR-A**, bo rozstrzyga, czy reszta planu w ogóle ma sens.

Każdy PR: własne testy, typecheck, lint, build, bez niepowiązanych porządków.

---

## F. BLOCKERS

| Blokada | Czego dotyczy | Kto rozwiązuje |
|---|---|---|
| Egress do RCSB, ChEMBL, UniProt, GtoPdb/Reactome, HPA/GTEx | PR-B i PR-D w całości, klasyfikacja 25 testów w PR-A | najpierw ja, obejściem przez dostępne rejestry; jeśli się nie uda — Ty, jednym kliknięciem w ustawieniach sieci |
| Compute | dokowanie GLP-1R (PR-B) | **Run 8 musi się skończyć.** Nic nie ruszam wcześniej |
| Chemik medyczny | ocena trasy syntezy, pola operacyjne badania | Ty — to jest ta sama osoba, której szukasz do badania czasu |
| Farmakolog | poprawność szlaku, dobór odczytu, kontrola dodatnia | Ty |
| Prawdziwe laboratorium | pomiar cAMP, bez którego łańcuch się nie domyka | Ty; to jest też kandydat na pilota albo LOI do Hub71 |

Oddzielnie: klasyfikacja ról 25 testów bez opisów z ChEMBL może w części zostać rozstrzygnięta z materiałów już w repo (`data/transcription/glp1r-a3`, opisy we froncie). Sprawdzę to w PR-A. Każdy test, którego nie da się uczciwie rozstrzygnąć, dostaje `UNKNOWN`.

---

## G. DEFINITION OF FIRST SUCCESS

Nie „znaleziono lek" i nawet nie „mamy kandydata".

**Sukces = łańcuch cel / dane / dokowanie / walidacja laboratoryjna dla GLP-1R jest technicznie spójny, audytowalny i gotowy do pierwszej uczciwej kampanii kandydatów**, czyli:

1. Tożsamość celu poprawna i oznaczona swoim stanem weryfikacji.
2. Odczyty funkcjonalne rozdzielone od wiążących, z jawnym `UNKNOWN` tam, gdzie brak podstaw.
3. Diagnostyka zbioru wykonana po prerejestracji i zapieczętowana.
4. Model przechodzi bramkę **albo jest jawnie BLOCKED** — obie odpowiedzi są sukcesem tego etapu.
5. Cel dokowania zarejestrowany z pełnym źródłem i hashami.
6. Dossier kandydata niesie wersję modelu, niepewność i blokery, bez jednego magicznego wyniku.
7. Szlak i ekspresja mają kontrakt i kanał do interfejsu, nawet jeśli dane jeszcze nie wpłynęły.
8. Projekt badania gotowy do przeglądu specjalisty, z zamrażanym snapshotem predykcji.
9. Human Explorer nie pokazuje cudzego preparatu pod nazwą narządu.

**Czego ten etap nie obiecuje:** że model przejdzie bramkę, że powstanie kandydat i że przewidzimy odpowiedź neuronu. Do neuronu przechodzimy dopiero po czterech warunkach z punktu 17 master promptu, i nie wcześniej.

---

**STOP.** Czekam na Twoją zgodę na implementację. Nic z sekcji B nie jest napisane; do czasu zakończenia Run 8 nie ruszam niczego, co wymaga compute.
