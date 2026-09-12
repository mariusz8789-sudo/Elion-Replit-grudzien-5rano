# GRANT READINESS REPORT — Genesis OS

**Data:** 2026-09-12 · **Gałąź:** `claude/genesis-autonomous-completion-95bt4e` · **Commit:** `a0a7b8d`

## Zasada dowodowa tego dokumentu

**Żadnego twierdzenia bez dowodu.** Każde stwierdzenie w sekcji „Co działa" ma
za sobą komendę, jej wyjście i hash commita — cytowane albo wprost, albo przez
odesłanie do jednego z dokumentów dowodowych tej misji (`docs/P0_EVIDENCE.md`,
`docs/P1_EVIDENCE.md`, `docs/P2_EVIDENCE.md`, `docs/REPRODUCIBILITY_PACK.md`).
Gdzie czegoś nie zweryfikowano wykonaniem, stoi **OTWARTE** z powodem — nigdy
przedstawione jako zrobione. Ten dokument NIE zawiera wyceny spółki ani żadnej
kwoty prezentowanej jako fair value; jedyne liczby finansowe to szkielet
budżetu programu w sekcji 5, z każdym założeniem oznaczonym
**SCENARIO ASSUMPTION**.

**Jak zweryfikować to samodzielnie, w jednym poleceniu:**

```bash
npm ci
node scripts/repro-demo.mjs
```

Zero kluczy, zero sieci. Dwanaście sprawdzeń porównanych z wartościami
zapisanymi w repo, kod wyjścia 1 przy jakiejkolwiek rozbieżności — patrz
`docs/REPRODUCIBILITY_PACK.md`, w tym dowód, że skrypt POTRAFI zawieść (cicha
edycja przypiętych danych → odmowa + exit 1).

---

## 1. Co działa — zweryfikowane wykonaniem

### 1.1 Warstwa produktowa (przed tą misją, zastana)

Genesis OS to PWA z 13 laboratoriami fizyki/chemii/biologii, każde jako
niezależny plugin za kontraktem `Sim` (`ARCHITECTURE.md`), i **59 zarejestrowanych
modeli** w Experiment Fabric (`core/experimentFabric/router.ts`,
`npm exec --workspace=packages/frontend -- node -e "..."` policzone
bezpośrednio z pliku, nie zadeklarowane) — od mechaniki orbitalnej i geodezji
Schwarzschilda, przez PySCF/RDKit/OpenMM, po miary splątania kwantowego.
Każdy model niesie własną `rationale` opisującą wprost, czego NIE symuluje.

Trzy autonomiczne strategie odkrycia (MECHANISM/PARAMETER/CALIBRATION) łączą
się w jeden kontrakt `StrategyRun`; jedno demo, QE1→QE2→QE3 (miary splątania),
przeszło pełny cykl hipoteza→predykcja→eksperyment→niezależny wynik
oczekiwany→wykonanie→werdykt falsyfikacyjny→rewizja przekonań→następne
pytanie, na modelu `quantum-entanglement-measures`
(`knowledge/quantum.md`, sekcja „Co z tego Genesis NAPRAWDĘ uruchomił").

### 1.2 Operacje — pakiet P0 (ta misja)

Przed tą misją system miał defekt klasy „działa, dopóki nikt nie spróbuje
wdrożyć": deklarowany runtime (`>=18`, `.replit: nodejs-20`) był niezgodny z
tym, czego wymaga kod (`node:sqlite`, dostępny od Node 22.5.0 — zweryfikowane
u źródła, `nodejs.org/api/sqlite.json`), baza domyślnie lądowała WEWNĄTRZ
drzewa aplikacji (ginęłaby przy każdym redeployu kontenerowym), `/api/health`
nie potrafił powiedzieć, który kod jest na produkcji, a `.env.example`
dokumentował 5 z 25 realnie czytanych zmiennych — w tym pomijał dwie
kredencjałowe.

| # | Co | Dowód |
|---|---|---|
| P0.1 | Bramka runtime, fail-fast z czytelnym komunikatem zamiast `ERR_UNKNOWN_BUILTIN_MODULE` | `108be87`, 8/8 testów, `docs/P0_EVIDENCE.md` |
| P0.2 | Trwałość danych: `/data` poza drzewem aplikacji, `VACUUM INTO` (nie `cp` — WAL), realny redeploy (proces+katalog wymienione) + restore drill | `0847ab7`, 8/8 testów |
| P0.3 | `/api/health`: commit, wersja, realny stan bazy (`SELECT 1`, nie sprawdzenie obiektu); poprawka pod `git worktree` | `5f88c8f`, `a0a7b8d`, 6/6+4/4 testów |
| P0.4 | Audyt historii: **zero sekretów do rotacji** — CAŁA historia (1911 commitów, `git rev-list --all`) przeszukana pod `.env`/`*secrets*`/`*.pem`/klucze prywatne, pod literał `sk-ant-`, oraz pod wzorce AWS/GitHub/GitLab/Slack/Google (`git grep` po każdym commicie) — wszystkie skany puste; `.env.example` 29/29 kompletny, sekrety twardo puste | `5f88c8f`, 4/4 testów + mechaniczna blokada dryfu |
| P0.5 | Redeploy kontenerowy z zamontowanym woluminem: **realny `docker build` + realny drill** (kontener zabity i USUNIĘTY `docker rm -f`, nowy kontener na tym samym nazwanym woluminie, konto i projekt sprzed redeployu odczytane po) — ZIELONE na runnerze GitHub Actions, pierwszy w historii repo udany `docker build`/`docker run`. Po drodze dwie nietrafione próby naprawy (opisane, nie ukryte) zanim znaleziono prawdziwą przyczynę: produkcyjny kod przypadkowo polegał na tym, że plik testowy przeciekał typy `@types/node` do całego programu TypeScript — realna, wcześniej niewidoczna luka w typowaniu, nie problem środowiska | commit `0c78866`/`882e0bb`, run CI `34712219915` — WSZYSTKIE 4 joby zielone (`verify`, `G3`, PySCF, `docker-image`); `docs/DECISIONS.md` D-017–D-019 |

Backup/restore operacyjne: `scripts/db-backup.mjs`/`db-restore.mjs`, retencja
domyślna 14 snapshotów, restore odmawia nadpisania bez `--overwrite`.
`docs/OPS_RUNBOOK.md` ma gotowe konfiguracje alertów (Uptime Kuma, Fly,
Railway/Render) — **PRZYGOTOWANE, NIE ZASTOSOWANE**, bo wymagają wyboru
platformy (patrz sekcja 4).

### 1.3 Higiena testów i danych — pakiet P1

| # | Co | Dowód |
|---|---|---|
| P1.1 | Audyt WSZYSTKICH skipów (34 backend, nie 58 z pierwotnej liczby — zmierzone, nie przyjęte) | `docs/TEST_SKIPS.md`, decyzja + uzasadnienie dla każdego |
| P1.2 | Pełny suite zielony; jeden znany flak (`nextActionSelectors.test.ts` pod obciążeniem) z dowodem izolacji | `docs/P1_EVIDENCE.md` |
| P1.3 | Migracje schematu z testami granicznymi (pusta baza / baza z danymi) + guard przed downgrade'em (`schema_version`) | `docs/P1_EVIDENCE.md`, `storeMigration.test.mjs` |
| bonus | R-001 (tokeny sesji w postaci jawnej) zamknięte: cherry-pick istniejącego modułu haszującego, migracja idempotentna na realnej legacy-bazie | `docs/RISKS.md` R-001 |

### 1.4 Warstwa naukowa — pakiet P2

**P2.1 — Bramka Tautologii/Cyrkularności.** Specyfikacja, na którą pierwotnie
miała się powoływać implementacja
(`docs/GENESIS_TAUTOLOGY_AND_EMPIRICAL_TEST_GATE.md`), **nie istnieje w tym
repo** — zweryfikowane przeszukaniem całej historii wszystkich gałęzi. Zamiast
zgadywać jej treść (co obejmowałoby 25 „golden test cases" z nieistniejącej
sekcji), najpierw powstał audyt tego, gdzie repo JUŻ rozstrzyga tautologia-vs-
-test-empiryczny (`docs/TAUTOLOGY_GATE_AUDIT.md`), a implementacja
(`core/agent/tautologyGate.ts`) klasyfikuje z DEKLAROWANYCH metadanych
(`ObservableSource`: `model-invariant` / `hypothesis-parameter` /
`independent-measurement`), nigdy z tego, czy dwie liczby akurat się zgadzają
— bo to błędnie sklasyfikowałoby własne, legalne dochodzenia parametryczne
QE1–QE3. Wpięta w `inquiryLoop.ts` addytywnie (bajt-identyczne zachowanie bez
deklaracji, dowiedzione testem). 25 golden cases i reguły C1–C6 spoza tego,
co dostarczono wprost w zadaniu, **jawnie NIE domknięte** —
`docs/TAUTOLOGY_GATE_IMPLEMENTATION.md`, sekcja „Known limitations".

**P2.3 — pierwsza kotwica zewnętrzna: obserwacja, której Genesis nie
wyprodukował.** Do tej pory jedyna produkcyjna ścieżka „predykcja kontra
realny pomiar" (`DrugDiscoveryScreen.tsx`) brała obserwację z pola
tekstowego wpisywanego ręcznie — uczciwe co do etykiety (`REFERENCE`, nie
`SIMULATED`), bezwartościowe jako dowód. Nowa kotwica
(`core/biotechData/externalAnchor.ts`) czyta obserwację z PRZYPIĘTEGO,
sumowanego payloadu zewnętrznego (surowa odpowiedź PubChem PUG REST dla
kofeiny, CID 2519, domena publiczna USA), porównuje z predykcją Genesis
liczoną z formuły (tablica mas atomowych IUPAC 2021, już w repo) i **odmawia
działania**, gdy payload zostanie zmieniony po przypięciu (odcisk to literał
w źródle — patrz `docs/DECISIONS.md` D-014, opis błędu, który sam popełniłem
i naprawiłem, gdy pierwsza wersja sumy kontrolnej okazała się pozorna).
Widoczna na żywo na `#/evidence`. **Jawnie NIE jest to pomiar przyrody** —
PubChem swojej masy molowej też nie mierzy, liczy ją z wzoru; ekran mówi to
zdanie z tą samą wagą wizualną co werdykt.

Druga kotwica (mechanika orbitalna/Kepler, na realnych danych z NASA
Exoplanet Archive) jest **W TOKU** — patrz sekcja 2.

### 1.5 Pakiet odtwarzalności — P3.2

`node scripts/repro-demo.mjs` — 12 sprawdzeń pokrywających P0.1–P0.4 i P2.3,
zero kluczy, zero sieci, każdy wynik porównany z wartością zapisaną w kodzie.
Dowiedzione, że potrafi zawieść: cicha edycja przypiętego payloadu daje
odmowę i kod wyjścia 1 (nie tylko „12/12" — `docs/REPRODUCIBILITY_PACK.md`).

### 1.6 Liczby wykonania (jeden strzał, ten sam commit)

```
backend:   430 testów | 396 passed | 0 failed | 34 skipped (policzone, uzasadnione)
frontend:  468 plików | 5187 passed | 0 failed | 1 skip
eslint:    czysto (całe repo)
tsc:       czysto (frontend)
build:     czysto (produkcyjny)
repro-demo: 12/12, exit 0
```

---

## 2. Co OTWARTE — z powodem, nie ukryte

| Zadanie | Powód | Właściciel | Proponowany termin |
|---|---|---|---|
| Druga kotwica (Kepler) | W trakcie; wymaga realnego dostępu do NASA Exoplanet Archive, który z tego środowiska był zablokowany polityką proxy (403 CONNECT, `docs/P2_EVIDENCE.md`) — czeka na zmierzony dostęp z innego środowiska | C3 | następna sesja |
| P2.2 — ingestion Solar Mind (`knowledge/SOLAR_MIND_*.md`, H051–H056) | Surowy tekst raportów dostarczony (Qwen), jeszcze nie zapisany w repo z tabelą statusu na wzór QE1–QE7 | C3 | następna sesja |
| Kotwica EMPIRYCZNA (pomiar instrumentalny, nie wartość przeliczona) | `compute/cmsOpenDataAdapter.mjs` (CMS Open Data Z→μμ, rekord 5208, CC0, SHA-256 weryfikowany) już istnieje i zwraca `DATA_REQUIRED` zamiast syntetyku — brakuje tylko pliku `Zmumu.csv`, a `opendata.cern.ch` był zablokowany stąd | nieprzypisane | po uzyskaniu dostępu sieciowego |
| G3 — kotwica anty-HARKing w prerejestracji hipotez | ZAMKNIĘTE osobno (C3, commit `2ab93cb`, przed tą misją) — wymieniona tu dla kompletności | C3 | zamknięte |
| G6 — kanoniczny słownik niezawodności epistemicznej | Częściowo zamknięte (3 z 6 osi skonsolidowane, C2) | C2 | zamknięte częściowo |
| 25 golden cases Tautology Gate + reguły C1–C6 poza tym, co dostarczono | Spec `GENESIS_TAUTOLOGY_AND_EMPIRICAL_TEST_GATE.md` nie istnieje nigdzie w repo; wymyślenie treści byłoby fabrykacją | — | gdy prawdziwy spec się pojawi |
| QE4–QE7 (hipotezy splątania) | Wymagają pakietu obserwabli z jawnym rozdzieleniem tautologii algebry od tego, co falsyfikowalne (zlecone Qwenowi, nie odebrane) | Qwen | otwarte |
| Alerty niedostępności i retencja logów | Konfiguracje gotowe (`docs/OPS_RUNBOOK.md`), niezastosowane — wymaga wyboru platformy hostingu i zgody na wdrożenie | operator | przy wyborze platformy |
| `nodejs-22` w `.replit` | Nazwa modułu zgodna z konwencją Replita, ale nieskontrolowana wobec rejestru platformy z tego środowiska | operator | pierwsze uruchomienie na Replicie |
| G4/G5/G9 (generowanie hipotez, scoring wartości eksperymentu, warstwa starzenia dowodów) | ŚWIADOMIE nie robione — dodanie scoringu bez uzasadnionej metodologii albo stałej rozpadu bez uzasadnienia byłoby dokładnie regresem, którego to repo odmawia | — | poza zakresem obecnej rundy |

---

## 3. Architektura i model bezpieczeństwa danych

### 3.1 Architektura wykonawcza

Frontend: React/TS PWA, każde laboratorium plugin za kontraktem `Sim`
(`init`/`update`/`render`, `render()` jedyną warstwą specyficzną dla
platformy — port na inny silnik renderujący nie dotyka logiki fizycznej).
Backend: pojedynczy proces `node:http`, zero frameworka, trwałość na
`node:sqlite` (wbudowany, zero zależności zewnętrznych, schemat przenośnym
SQL — migracja do PostgreSQL to zmiana sterownika, nie przepisanie modelu
danych, choć niewykonana i nietestowana, więc NIE deklarowana jako gotowa).

Eksperymenty przechodzą przez jeden kontrakt (`experimentFabric/types.ts`):
żądanie → walidacja → routing na model → wykonanie → wynik z jawną
`validity`/`assumptions`/`warnings` → odcisk (`provenance.ts`) → Pamięć
Naukowa → Replay. Ten sam kontrakt obsługuje 59 modeli; dodanie modelu to
jeden wpis w rejestrze plus `case` w wykonawcy — zweryfikowane recepturą
odtworzoną z commita `quantum-entanglement-measures` przy rejestracji tego
modelu w tej misji.

### 3.2 Model bezpieczeństwa danych

- **Sekrety**: wyłącznie jako zmienne środowiskowe hostingu, nigdy w repo.
  Zweryfikowane audytem CAŁEJ historii — zero do rotacji (sekcja 1.2).
- **Tokeny sesji**: haszowane SHA-256 w spoczynku (P1, R-001) — surowy token
  nigdy nie opuszcza klienta po zalogowaniu, hash sam w sobie nie
  uwierzytelnia.
- **Backup**: zawiera dane pełnego magazynu (konta, projekty, Serie Prób).
  Łagodzenie operacyjne (prawa katalogu, szyfrowanie poza wolumenem) opisane
  w `OPS_RUNBOOK.md` §4 — teraz jako DODATKOWA warstwa, nie jedyna, odkąd
  tokeny są haszowane.
- **Powierzchnia ataku backendu**: limit wielkości żądania, walidacja typów
  pól kontekstu, rate limit per IP, kanonizacja ścieżek plików (zero path
  traversal), nagłówki bezpieczeństwa na każdej odpowiedzi — zastane przed tą
  misją, nie tworzone w niej; niezmienione.
- **Jeden proces, jedna baza**: granica skali nazwana wprost jako ryzyko
  R-002 w `docs/RISKS.md`, nie ukryta.

### 3.3 Model epistemiczny

Każdy wynik eksperymentu niesie `dataProvenance`
(`SIMULATED`/`REFERENCE`/`REAL_EXPERIMENTAL`) i nigdy nie miesza się w jedną
liczbę z inną prowieniencją bez jawnego oznaczenia obu. Falsyfikacja rozróżnia
„nierozstrzygalne tym porównaniem" od „sfalsyfikowane" (`falsificationRelation.ts`) —
nie każdy brak potwierdzenia jest odrzuceniem. Sześć wcześniej niezależnych
słowników niezawodności epistemicznej częściowo skonsolidowanych do jednej
7-poziomowej skali (G6, P1).

---

## 4. Plan 6 / 12 / 24 miesiące

**6 miesięcy.** Domknięcie P2 (druga kotwica + kotwica empiryczna CMS Open
Data; ingestion Solar Mind z realną pętlą StrategyRun dla H051–H056, na wzór
QE1–QE3); wybór platformy hostingu i zastosowanie konfiguracji z
`OPS_RUNBOOK.md`; jeden pełny cykl redeployu na kontenerze z zamontowanym
woluminem, zweryfikowany, nie tylko przygotowany.

**12 miesięcy.** Realny spec Tautology Gate (jeśli dostarczony) domykający 25
golden cases; rozszerzenie `MIXED_TEST` na `discoveryConclusion.ts` (naturalny
konsument nazwany przez C3, niebudowany celowo w P2.1); pakiet obserwabli
QE4–QE7 uruchomiony przez ten sam cykl co QE1–QE3; migracja trwałości do
PostgreSQL — TYLKO gdy skala danych to uzasadni (patrz R-002), nie z
wyprzedzeniem.

**24 miesiące.** Drugi niezależny recenzent architektury spoza tego zespołu
(łagodzi R-004, bus factor = 1); rozszerzenie kotwic zewnętrznych na kolejne
domeny fizyczne poza chemią/astronomią, każda z tym samym wymogiem: jawne
rozdzielenie tautologii algebry od realnej reszty empirycznej.

---

## 5. Szkielet budżetu programu (3–5 lat)

**Każda liczba poniżej to SCENARIO ASSUMPTION — scenariusz do przetestowania
z komisją, nie kosztorys ani wycena.** Brak w tym repo żadnego modelu
finansowego, historii przychodów ani wcześniejszej rundy, z których dałoby
się wyprowadzić liczby inaczej niż jako założenie scenariusza.

| Pozycja | Rok 1–2 (SCENARIO ASSUMPTION) | Rok 3–5 (SCENARIO ASSUMPTION) | Uzasadnienie zakresu |
|---|---|---|---|
| FTE — inżynieria (backend/frontend/naukowe silniki) | 2–3 | 3–5 | Obecny zespół to wielosesyjna praca równoległa (C1–C3 + zewnętrzne pakiety badawcze); pełnoetatowy zespół tej wielkości odzwierciedla dotychczasowe tempo, nie mnożnik |
| FTE — recenzja naukowa/domenowa (część etatu) | 0,5–1 | 1–2 | Wymagana przez samą misję: kotwice zewnętrzne i pakiety badawcze potrzebują recenzenta spoza kodu, patrz R-004 |
| Compute — solvery ciężkie (PySCF/OpenMM/MEEP) + CI | niski (zastane CI działa na runnerach standardowych) | umiarkowany, zależny od liczby domen | Dzisiejsze silniki uruchamiane lokalnie/w CI bez GPU; skalowanie compute jest FUNKCJĄ liczby nowych domen, nie stałą |
| Dane — licencje/dostęp do zbiorów instytucjonalnych | niski (dzisiejsze kotwice są publiczne, bez kluczy) | zależny od wybranych domen (np. dostęp instytucjonalny do SDO/HEK na dużą skalę) | Obecna architektura NIE zakłada płatnych zbiorów; koszt pojawia się dopiero przy rozszerzeniu poza publiczne API |
| Eksperymenty kotwiczące (P2.3 i dalsze) | 1–2 nowe domeny | 3+ nowe domeny | Każda kotwica to jednorazowy koszt inżynierski (wzorzec już istnieje, powtarzalny) plus recenzja naukowa; nie jest to koszt cykliczny per-request |
| Hosting/infrastruktura produkcyjna | niski (jeden proces, SQLite, brak zależności płatnych poza samym hostingiem) | rośnie z R-002 (migracja do Postgresa, jeśli uzasadniona skalą) | Patrz sekcja 3.1 — dzisiejsza architektura celowo minimalizuje koszt operacyjny |
| Overhead (administracja, zgodność, audyt bezpieczeństwa) | standardowy dla programu tej wielkości | standardowy, rosnący z liczbą FTE | Nieoszacowany precyzyjnie w tym dokumencie — SCENARIO ASSUMPTION najwyższego ryzyka błędu w tej tabeli |

**Co ta tabela NIE jest.** Nie jest budżetem operacyjnym gotowym do
podpisania, nie jest wyceną spółki, nie jest podstawą do obliczenia wartości
udziałów. Jest szkieletem do wypełnienia RAZEM z komisją, z jawnie
oznaczonymi założeniami, które komisja może zakwestionować pojedynczo —
dokładnie dlatego każda pozycja ma kolumnę uzasadnienia zamiast gołej liczby.

---

## 6. Ryzyka i łagodzenia

Pełna, jawna lista: `docs/RISKS.md` (R-001–R-007). Streszczenie stanu na ten
commit:

| Ryzyko | Status |
|---|---|
| R-001 tokeny sesji jawnym tekstem | **MITIGATED** (P1, haszowanie SHA-256) |
| R-002 pojedynczy proces + SQLite jako granica skali | MITIGATED/ACCEPTED — świadomy wybór na tym etapie |
| R-003 zależność od zewnętrznego API (Anthropic) | MITIGATED — system działa w pełni bez klucza, żaden wynik naukowy nie przechodzi przez LLM |
| R-004 bus factor = 1 | OPEN — pozycja budżetowa (FTE recenzja), nie deklaracja |
| R-005 brak kotwicy w danych zewnętrznych | **ZWĘŻONE** (P2.3, jedna kotwica działająca) — nie zamknięte: brak live ingestion, brak kotwicy empirycznej |
| R-006 redeploy kontenerowy z woluminem niezweryfikowany | MITIGATED, ZIELONE — realny `docker build`+drill przeszedł w CI (run `34712219915`), zobacz P0.5 |
| R-007 nazwa modułu `nodejs-22` w `.replit` niesprawdzona | OPEN, niegroźne — bramka runtime i tak wypisze czytelny komunikat |

---

## 7. Co ten raport celowo NIE twierdzi

- **Nie twierdzi, że Genesis coś odkrył.** Każdy wynik jest oznaczony
  `SIMULATED`/`REFERENCE`/`REAL_EXPERIMENTAL`, a kotwice zewnętrzne jawnie
  nazywają, czego nie dowodzą (sekcja 1.4).
- **Nie twierdzi wartości firmy.** Jedyne liczby finansowe to szkielet
  budżetu programu (sekcja 5), z każdym założeniem oznaczonym osobno.
- **Nie twierdzi gotowości produkcyjnej.** Sekcja 2 wymienia dokładnie to,
  co pozostaje otwarte, z właścicielem i powodem.
- **Nie twierdzi, że Tautology Gate implementuje realny, zewnętrzny
  standard.** Reguły C1–C6 są tym, co dostarczono wprost w tym zadaniu — nie
  transkrypcją dokumentu, który nie istnieje.
