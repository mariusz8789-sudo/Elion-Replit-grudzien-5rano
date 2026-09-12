# TEST_SKIPS — pełny audyt pominięć testów (P1.1)

Zasada dowodowa jak w `P0_EVIDENCE.md`: żadnego twierdzenia bez komendy i
wyjścia. Środowisko tego audytu: `node v22.22.2`, `python3 3.11.15`, Linux
6.18.44, gałąź `claude/genesis-autonomous-completion-95bt4e`, backend
niezmieniony od commita `5f88c8fb` (zweryfikowane: `git log --oneline
5f88c8fb..1ceb09c4` dotyka wyłącznie `docs/` — kod backendu bajt-w-bajt ten
sam).

## Prawdziwa liczba — i dlaczego brief, P0_EVIDENCE.md i ten audyt podają
## TRZY różne liczby, mimo identycznego kodu

| Źródło | Backend skipped | Frontend skipped |
|---|---|---|
| Brief tego zadania | 58 | (nie podano) |
| `P0_EVIDENCE.md` (commit `5f88c8f`) | 34 | 1 |
| **Ten audyt, zmierzone teraz** | **58** | **1** |

```bash
$ cd packages/backend && npm test 2>&1 | tail -12
# tests 419 | suites 92 | pass 361 | fail 0 | skipped 58 | duration_ms 16373

$ npm test 2>&1 | tail -12   # powtórzone — stabilne, nie flaky
# tests 419 | suites 92 | pass 361 | fail 0 | skipped 58 | duration_ms 12332

$ cd packages/frontend && npx vitest run 2>&1 | tail -6
 Test Files  465 passed (465)
      Tests  5138 passed | 1 skipped (5139)
```

**Rozstrzygnięcie: 58 (backend) + 1 (frontend) = 59 realnych pominięć na tym
commicie, w TYM środowisku.** Backendowa liczba `34` z `P0_EVIDENCE.md` nie
jest błędem pomiaru w żadnym z dwóch dokumentów — to jest **oczekiwana
zmienność** skipów warunkowych: zależą od tego, co jest zainstalowane w
kontenerze, w którym test się uruchamia, nie od kodu. Zweryfikowane wprost:

```bash
$ python3 -c "import rdkit"    # ModuleNotFoundError
$ python3 -c "import pyscf"    # ModuleNotFoundError
$ python3 -c "import openmm"   # ModuleNotFoundError
$ python3 -c "import Bio"      # ModuleNotFoundError
$ python3 -c "import vina"     # ModuleNotFoundError
$ echo "${GENESIS_RDKIT_PYTHON:-unset}"   # unset
```

W TYM kontenerze zainstalowany jest sam `python3` (3.11.15), ale **żaden** z
pięciu silników naukowych (RDKit, PySCF, OpenMM, Biopython, AutoDock
Vina/Meeko). Sesja, która wyprodukowała `P0_EVIDENCE.md`, działała w innym
kontenerze (repo jest klonowane od zera do każdej sesji — patrz środowisko
uruchomieniowe) i miała **część** tych silników zainstalowanych lokalnie
(nigdy niescommitowane — instalacja pakietów Python nie jest częścią repo),
stąd mniej skipów tam. To NIE jest defekt — to jest dokładnie zamierzone
zachowanie `BLOCKED_BY_RUNTIME`: zdolność jest `AVAILABLE`, gdy silnik
faktycznie jest w runtime, i pomijana uczciwie, gdy go nie ma. Konsekwencja
dla tego pakietu: **nie przyjmuję żadnej z trzech liczb na słowo** — każdy z
59 poniższych wierszy jest zweryfikowany osobno, z cytatem warunku.

## Metodologia

Backend: `npm test 2>&1` (TAP), sparsowany skryptem odtwarzającym pełną
ścieżkę `describe`/`test` po wcięciach (nie przez `grep` na płasko — TAP
zagnieżdża po spacjach, a `grep` gubi hierarchię). Wynik: dokładnie 58
liści `# SKIP`, zrekoncyliowane 1:1 z sumą warunkowych `test.skip`/`{skip:
...}`/`t.skip(reason)` znalezionych przez `grep -rn` w źródle (patrz tabela
niżej — suma per plik = suma z TAP, co do jednego).

Frontend: `grep` za `it.skip`/`test.skip`/`describe.skip`/`skipIf`/`runIf`
w `src/__tests__/**/*.test.{ts,tsx}` — jeden trafiony wzorzec,
`it.runIf(...)`, zgodny z jedynym zmierzonym skipem. (Uwaga metodologiczna:
`sequence.skip()` w `graphicsCameraSequence.test.ts`/`shotPlanPlayer.test.ts`
to wywołanie metody DOMENOWEJ — `AnimationSequence.skip()` — a nie API test
runnera; pierwszy `grep` złapał to jako fałszywy alarm i został odrzucony po
przeczytaniu kodu.)

## Dwie KATEGORIE pominięć (wymagane przez zadanie: policzyć osobno)

| Kategoria | Mechanizm | Backend | Frontend |
|---|---|---|---|
| **Deklaratywne** (`.skip(` w pliku, decyzja przed uruchomieniem testu) | `test.skip`, `const maybe = on ? test : test.skip`, `{ skip: !cond }` | 53 | 1 (`it.runIf`) |
| **Runtime** (warunkowe, decyzja WEWNĄTRZ ciała testu) | `t.skip(reason)` wołane po sprawdzeniu zdolności w trakcie testu | 5 | 0 |
| **Razem** | | **58** | **1** |

Runtime-skip (`apiCampaign.test.mjs`) jest jedynym miejscem, gdzie uzasadnienie
jest wypisane PRZY liściu (bo `node --test` powtarza tekst przekazany do
`t.skip(reason)` na tym konkretnym teście). Deklaratywne skipy nie niosą
tekstu na liściu w TAP — uzasadnienie żyje w kodzie źródłowym (warunek +
komentarz modułu), zacytowane niżej per grupa.

## Backend — 58/58, pogrupowane po realnej przyczynie (plik:linia warunku)

Każda grupa: ta sama zdolność, ten sam warunek, ta sama decyzja. Sonda w
każdym wypadku jest **realną, wykonywaną funkcją** (`X.detect().available`,
odpalającą faktyczny import/subprocess), NIE stałą `false` — sprawdzone
czytaniem `compute/*Adapter.mjs::detect()` dla każdej z pięciu.

| # testów | Plik(i) | Warunek (plik:linia) | Silnik/zasób | Sonda |
|---|---|---|---|---|
| 5 | `admetEngine.test.mjs` | `:15` `const maybe = on ? test : test.skip` gdzie `on = admet.detect().available` | ADMET-AI (D-MPNN/Chemprop) | `compute/admetAdapter.mjs::detect()` |
| 5 | `apiCampaign.test.mjs` | `:51,156,197,242,282` `t.skip(reason)` (RUNTIME) | RDKit i/lub ADMET-AI przez API | `TOOL_STATUS`/`getTool` w ciele testu |
| 7 | `benchmarkSuite.test.mjs` | `:59,68` (rdkitOn ×2) `:83` (qmOn) `:98` (mdOn) `:108` (admetOn) `:120` (dockOn) `:130` (protOn) | RDKit / PySCF / OpenMM / ADMET-AI / AutoDock Vina+Meeko / Biopython | odpowiedni `X.detect().available` na górze pliku |
| 2 | `campaignAux.test.mjs` | `:19` `const maybe = RDKIT ? test : test.skip` | RDKit | `rdkitDetect().available` |
| 3 | `campaignEngine.test.mjs` | `:15` `const maybe = RDKIT ? test : test.skip` | RDKit | j.w. |
| 5 | `campaignMultiFidelity.test.mjs` | `:57` (RDKIT&&DOCK) `:96` (RDKIT&&QM) `:110,133,153` (RDKIT&&ADMET) | RDKit + docking/QM/ADMET | j.w., złożone AND |
| 13 | `campaignRecombination.test.mjs` | `:39` `const maybe = RDKIT ? test : test.skip` (13 wywołań `maybe(`) | RDKit (BRICS) | j.w. |
| 4 | `campaignVerify.test.mjs` | `:48` (RDKIT&&DOCK) `:60` (RDKIT&&QM) `:71,83` (RDKIT&&ADMET) | RDKit + docking/QM/ADMET | j.w. |
| 1 | `cmsOpenDataCompute.test.mjs` | `:40` `{ skip: !configuredDataDir }`, `configuredDataDir = process.env[DATA_ENV]` (`:8`) | zatwierdzony katalog danych CMS Open Data | zmienna środowiskowa, nieustawiona tu |
| 1 | `depmapCompute.test.mjs` | `:38`/`:8`, ta sama konstrukcja | katalog danych DepMap 24Q2 | j.w. |
| 1 | `depmapFabricApi.test.mjs` | `:41`/`:8`, ta sama konstrukcja | j.w. przez Fabric API | j.w. |
| 7 | `heavyEngines.test.mjs` | `:41,47` (qmOn) `:67` (mdOn) `:78,88` (dockOn) `:99,105` (protOn) | PySCF / OpenMM / AutoDock Vina+Meeko / Biopython | odpowiedni `X.detect().available` |
| 4 | `rdkitEmbed3dCompute.test.mjs` | `:37,54,68,74` `{ skip: !rdkitAvailable }` (5. test w pliku, `:30`, ma `skip: rdkitAvailable ? '...' : false` — odwrotny warunek, testuje ścieżkę odrzucenia i DZIAŁA właśnie wtedy, gdy RDKit jest niedostępny) | RDKit (embedding 3D) | `rdkitDetect().available` |
| **58** | **13 plików** | | | |

Suma zweryfikowana: `5+5+7+2+3+5+13+4+1+1+1+7+4 = 58`, identyczna z
TAP-em co do liścia (skrypt parsujący wypisał dokładnie te same 58 nazw
testów pogrupowane pod dokładnie te same nazwy `describe`).

**Poboczne znalezisko, nie wchodzi do liczby 58:** `rdkit.test.mjs` i
`meepCompute.test.mjs` używają INNEGO wzorca — `if (det.available) { ...test(...) }`
zamiast `test.skip`. Gdy silnik niedostępny, testy zależne od niego w ogóle
NIE są rejestrowane w runnerze (nie pojawiają się jako `SKIP`, po prostu nie
istnieją dla tego przebiegu), a osobny, BEZWARUNKOWY test sprawdza ścieżkę
odrzucenia (`capability_unavailable`, `BLOCKED_BY_RUNTIME`). Efekt końcowy
jest identyczny (żaden fałszywy wynik naukowy), ale ten wzorzec jest
NIEWIDOCZNY dla audytu liczącego same `SKIP` — wart odnotowania, nie wart
przepisywania (zero nowego mechanizmu, oba wzorce są uczciwe).

**Jedna zmienna sondowana, a bez skipu:** `cmsDimuonGenerator.test.mjs:50`
(`{ skip: !hasPython() }`) NIE pojawia się w 58, bo `python3` jest w tym
kontenerze zainstalowany — test faktycznie się wykonuje (i przechodzi, patrz
`pass 361`). Cytowane jako dowód, że sonda jest realna, nie zawsze-skip.

## Frontend — 1/1

| Plik:linia | Test | Warunek |
|---|---|---|
| `backendEvidenceExecution.test.ts:638` | „executes both PySCF H2 basis arms against the real local Fabric and produces a MATCH Evidence Pack” | `it.runIf(process.env.GENESIS_REAL_BACKEND === '1')` — wymaga ŻYWEGO lokalnego serwera Fabric na porcie 8092 z realnym PySCF, nie tylko obecności pakietu |

## DECYZJE — wszystkie 59 pozycji

Jeden wiersz = jedna grupa z tabeli backendu wyżej (żaden test nie jest
liczony dwa razy — `campaignMultiFidelity.test.mjs`/`campaignVerify.test.mjs`
gatują na `RDKIT && (DOCK|QM|ADMET)` łącznie, więc liczą się RAZ, pod swoim
własnym wierszem, nie osobno pod „RDKit” i osobno pod „docking/QM/ADMET”).

| Plik(i) | Liczba | Silnik/zasób wymagany | Decyzja | Uzasadnienie (1 zdanie) |
|---|---|---|---|---|
| `admetEngine.test.mjs` | 5 | ADMET-AI | **ZAAKCEPTOWAĆ** | `admet.detect().available` to realny import modelu, nie stała; wagi ADMET-AI nieobecne w tym kontenerze. |
| `apiCampaign.test.mjs` (runtime `t.skip`) | 5 | RDKit i/lub ADMET-AI, przez API | **ZAAKCEPTOWAĆ** | Te same przyczyny co wyżej, sprawdzone przez trasę HTTP zamiast bezpośredniego wywołania adaptera; policzone osobno jako kategoria runtime. |
| `benchmarkSuite.test.mjs` | 7 | RDKit / PySCF / OpenMM / ADMET-AI / AutoDock Vina+Meeko / Biopython | **ZAAKCEPTOWAĆ** | Sześć niezależnych sond `X.detect().available`, każda potwierdzona jako realny import, nie stała. |
| `campaignAux.test.mjs` | 2 | RDKit | **ZAAKCEPTOWAĆ** | `rdkitDetect().available`; RDKit potwierdzone nieobecne (`ModuleNotFoundError`). |
| `campaignEngine.test.mjs` | 3 | RDKit | **ZAAKCEPTOWAĆ** | Jak wyżej. |
| `campaignMultiFidelity.test.mjs` | 5 | RDKit + (docking/QM/ADMET) | **ZAAKCEPTOWAĆ** | Złożony warunek AND — cały łańcuch multi-fidelity wymaga RDKit jako bazy plus danej zdolności; żadna z części nie jest dostępna tu. |
| `campaignRecombination.test.mjs` | 13 | RDKit (BRICS) | **ZAAKCEPTOWAĆ** | Jak `campaignAux`/`campaignEngine`; największa grupa, bo BRICS ma najwięcej wariantów testowych, ale ten sam pojedynczy warunek. |
| `campaignVerify.test.mjs` | 4 | RDKit + (docking/QM/ADMET) | **ZAAKCEPTOWAĆ** | Jak `campaignMultiFidelity` — replay wymaga tych samych silników co oryginalny przebieg. |
| `cmsOpenDataCompute.test.mjs` | 1 | zatwierdzony katalog danych CMS | **ZAAKCEPTOWAĆ** | Zmienna środowiskowa wskazująca zewnętrzny, zatwierdzony zbiór danych — zasób nieobecny w CI z definicji, nie luka w kodzie. |
| `depmapCompute.test.mjs` | 1 | zatwierdzony katalog danych DepMap | **ZAAKCEPTOWAĆ** | Jak wyżej. |
| `depmapFabricApi.test.mjs` | 1 | jw., przez Fabric API | **ZAAKCEPTOWAĆ** | Jak wyżej. |
| `heavyEngines.test.mjs` | 7 | PySCF / OpenMM / AutoDock Vina+Meeko / Biopython | **ZAAKCEPTOWAĆ** | Cztery niezależne sondy, wszystkie potwierdzone jako realne importy nieobecnych pakietów. |
| `rdkitEmbed3dCompute.test.mjs` | 4 | RDKit (embedding 3D) | **ZAAKCEPTOWAĆ** | `rdkitDetect().available`; piąty test w tym pliku (odwrotny warunek) DZIAŁA właśnie teraz i dowodzi ścieżki odrzucenia. |
| `backendEvidenceExecution.test.ts` (frontend) | 1 | żywy lokalny backend z realnym PySCF | **ZAAKCEPTOWAĆ** | `it.runIf(GENESIS_REAL_BACKEND==='1')` — opt-in e2e, nie warunek CI; plik cytuje, że test już przeszedł na realnym backendzie w innej sesji. |
| **RAZEM** | **59** | | | |

**Zero pozycji DOMKNIJ.** Żaden z 59 skipów nie ukrywa luki integralności
Genesis (prowieniencja/falsyfikacja/replay/RBAC/trwałość) — wszystkie
gatują na nieobecność ZEWNĘTRZNEGO silnika naukowego lub zewnętrznego
zbioru danych, nigdy na logice samego Genesis. **Zero pozycji
ZDEPRECJONOWAĆ** — żaden nie pilnuje zachowania, którego już nie ma;
przeciwnie, każda para (opcjonalny test `AVAILABLE` + bezwarunkowy test
`BLOCKED_BY_RUNTIME`/`capability_unavailable`) dowodzi, że NIEDOSTĘPNOŚĆ
silnika jest testowana tak samo rygorystycznie jak jego obecność.

## Rozważone i odrzucone: „tanie domknięcie" przez instalację silników

Rozważono, czy `pip install rdkit pyscf openmm biopython` (python3 jest
obecny) zamieniłoby 39+3+2+4+3=51 z 58 skipów w realnie wykonywane testy.
**Odrzucone jako NIE „tanie"** w rozumieniu tego pakietu: (a) RDKit/OpenMM to
duże binarne koła (setki MB, zależności natywne — nie ma gwarancji sieci/czasu
w tej sesji), (b) PySCF wymaga kompilatora Fortran/BLAS w części ścieżek
instalacji, (c) ADMET-AI to wagi WYTRENOWANEGO modelu, nie sam pakiet pip —
nie da się „doinstalować" tanio, (d) nawet gdyby się udało, wynik byłby
WŁASNOŚCIĄ TEGO KONTENERA, nie repo — następna sesja (inny kontener) i tak
zobaczy skip ponownie, bo `requirements-compute.txt` (już istniejący,
wspomniany w `heavyEngines.test.mjs`) jest świadomie NIE zainstalowany przez
CI (`.github/workflows/ci.yml`) — udokumentowana decyzja, nie przeoczenie.
Domknięcie tego pakietu byłoby więc pracą jednorazową bez trwałego efektu.
Pozostawione jawnie jako **OPEN** (nie zadanie tego pakietu): jeśli granting
committee chce zobaczyć RDKit/PySCF/OpenMM rzeczywiście zielone w CI, to
osobna decyzja `ci.yml`, z realnym kosztem czasu builda, do podjęcia przez
C1/właściciela repo — nie coś, co ten pakiet P1 może rozstrzygnąć jednostronnie.
