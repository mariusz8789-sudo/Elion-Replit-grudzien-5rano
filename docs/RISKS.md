# RISKS — Genesis OS, jawna lista ryzyk i łagodzeń

Dokument pisany wprost, nie ukryty w przypisach. Zasada: ryzyko nazwane w
dokumentacji jest ryzykiem zarządzanym; ryzyko przemilczane w dokumentacji jest
ryzykiem, które komisja znajdzie sama i policzy podwójnie.

Legenda statusu: **OPEN** = realne i nienaprawione · **MITIGATED** = ograniczone,
z opisanym resztkowym · **ACCEPTED** = świadomie przyjęte na tym etapie.

---

## R-001 — Tokeny sesji przechowywane w postaci jawnej · MITIGATED

**Status zamknięty w pakiecie P1** (`docs/P1_EVIDENCE.md`, sekcja „R-001
BONUS”). `packages/backend/src/store.mjs::createSession`/`getUserByToken`/
`deleteSession` haszują teraz token SHA-256 (`secrets.mjs`, cherry-pick
bajt-w-bajt z `3bce0c2`, nie reimplementacja) przed każdym zapisem/odczytem
z `sessions.token`; klient nadal loguje się swoim surowym tokenem — hash nigdy
nie opuszcza serwera i sam w sobie nie uwierzytelnia (zweryfikowane testem).
Migracja `version < 13` w `migrate()` haszuje w miejscu każdy ISTNIEJĄCY
plaintextowy token, idempotentnie (`looksHashed()` pomija już-zahaszowane
wiersze), przetestowana TDD na realnej legacy-bazie z prawdziwą sesją —
zero utraconych/zduplikowanych sesji.

**Resztkowe, świadomie NIE zamknięte.** `keyHint()` (ta sama cherry-pickowana
paczka) jest nieużywana — repo na tej gałęzi nie ma jeszcze koncepcji kluczy
API do wyświetlenia klientowi, więc nie ma dziś czego nią maskować.

**Łagodzenie operacyjne pozostaje aktualne** (`OPS_RUNBOOK.md` §4): prawa `700`
na katalogu backupów, szyfrowanie kopii poza woluminem — teraz jako
DODATKOWA, nie jedyna, warstwa obrony, skoro sam backup już nie niesie
bezpośrednio użytecznego tokenu.

---

## R-002 — Pojedynczy proces + SQLite jako granica skali · MITIGATED / ACCEPTED

**Fakt.** Backend to jeden proces `node:http` z `node:sqlite` (synchroniczne
API). Brak replikacji, brak poolingu, brak odczytów z repliki. Jedna
długa transakcja blokuje pętlę zdarzeń; `VACUUM INTO` blokuje bazę na czas
snapshotu.

**Dlaczego to jest teraz właściwy wybór.** Zero zewnętrznych zależności,
schemat w przenośnym SQL, pełna transakcyjność, a przy obecnej bazie (471 kB)
snapshot to milisekundy. Dla instancji badawczej jednego zespołu to nie jest
ograniczenie, które cokolwiek psuje.

**Resztkowe ryzyko, nazwane.** Przy bazie rzędu GB harmonogram backupów trzeba
przeliczyć, zanim się zagęści. Migracja do PostgreSQL jest zmianą sterownika
(cały dostęp do SQL przechodzi przez `store.mjs`), nie przepisaniem modelu
danych — ale **nie została wykonana ani przetestowana**, więc nie jest
twierdzeniem o gotowości, tylko o kształcie kodu.

---

## R-003 — Zależność od zewnętrznego API (Anthropic) · MITIGATED

**Fakt.** Funkcja „Zapytaj AI" wymaga `ANTHROPIC_API_KEY` i dostępności API
dostawcy.

**Łagodzenie, które JEST w kodzie.** Klucz nigdy nie opuszcza serwera (proxy w
`server.mjs::handleAsk`). Bez klucza system działa w pełni i zwraca uczciwy
komunikat (`AI_UNAVAILABLE_MESSAGE`) zamiast udawać odpowiedź. `/api/health`
raportuje `ai: "no-key"`. **Żaden wynik naukowy nie przechodzi przez LLM** —
narrator komentuje stan symulacji, a liczby pochodzą z solverów.

**Resztkowe.** Niedostępność dostawcy wyłącza warstwę narracyjną, nie warstwę
naukową. To jest granica przyjęta świadomie i weryfikowalna: wyłącz klucz i
cała reszta systemu nadal liczy.

---

## R-004 — Bus factor = 1 · OPEN

**Fakt.** Repo nie ma drugiego stałego opiekuna z pełnym kontekstem
architektury. Wiedza o tym, dlaczego pewne rzeczy NIE zostały zrobione (brak
scoringu wartości eksperymentu, brak warstwy starzenia dowodów, granice
epistemiczne) żyje głównie w komentarzach w kodzie i w `docs/`.

**Łagodzenie, które już działa.** Decyzje i ich uzasadnienia są zapisywane w
repo (`DECISIONS.md`, `MASTER_PRIORITY_GENESIS.md`,
`GENESIS_SCIENTIFIC_DISCOVERY_ENGINE_MASTER_PLAN.md`), a nie w głowie; testy
mechaniczne (osiągalność modułów, kontrakt `.env`, bramka runtime) wymuszają
reguły bez udziału człowieka.

**Resztkowe.** Dokumentacja nie zastąpi drugiej osoby przy incydencie. To jest
ryzyko kadrowe i powinno być pozycją w budżecie programu (FTE), nie
deklaracją dobrych intencji.

---

## R-005 — Brak kotwicy w danych zewnętrznych · ZWĘŻONE (2026-09-12), nie zamknięte

**Fakt.** Na dzień pisania Genesis mierzy przede wszystkim WŁASNĄ spójność:
solvery, prowieniencja, replay i falsyfikacja działają, ale obserwacje, wobec
których hipotezy są testowane, pochodzą z tych samych modeli. QE1–QE3 (pakiet
splątania) są tego jawnym przykładem — i moduły mówią o tym wprost, że granica
Tsirelsona jest analitycznym sufitem liczonej algebry, a nie wynikiem
empirycznym.

**Dlaczego to jest ryzyko, a nie tylko brak funkcji.** Bez ani jednego
eksperymentu, w którym obserwacja pochodzi ze źródła niezależnego od Genesis,
całą narrację da się streścić jako „mierzymy własną spójność". To jest zdanie,
które komisja może napisać w recenzji, a my nie mamy czym go odeprzeć.

**Co się zmieniło 2026-09-12 (P2.3, `docs/P2_EVIDENCE.md`).** Powstał działający,
przetestowany kontrakt kotwicy: obserwacja pochodzi z PRZYPIĘTEGO, sumowanego,
cytowanego payloadu zewnętrznego (PubChem CID 2519), a nie — jak dotąd — z
liczby wpisanej ręcznie w pole tekstowe wraz z ręcznie wpisanym cytatem
(`DrugDiscoveryScreen.tsx:141-150`). Kotwica odmawia działania przy zmianie
payloadu, składa cytat z prowieniencji zbioru, jest realnie falsyfikowalna
(dowód: zła predykcja dostaje FALSIFIED) i daje replay MATCH. Widoczna na
`#/evidence` także bez żadnych zapisanych danych.

**Dlaczego to NIE zamyka ryzyka.** Dwie rzeczy zostają:
(1) to jest WERYFIKACJA WOBEC NIEZALEŻNEGO ŹRÓDŁA, nie pomiar przyrody —
PubChem swojej masy molowej też nie mierzy, liczy ją z wzoru; ekran mówi to
wprost, z tą samą wagą wizualną co werdykt;
(2) nie ma ingestion publicznego API na żywo — egress do wszystkich hostów
danych naukowych jest odrzucany przez politykę proxy (dowód w
`P2_EVIDENCE.md`), a sfabrykowanie zbioru byłoby zakazane.

**Następny krok, konkretnie.** Kotwica empiryczna na CMS Open Data Z→μμ 2011
(rekord 5208, CC0): `compute/cmsOpenDataAdapter.mjs` już czyta ten zbiór z
weryfikacją SHA-256 i zwraca `DATA_REQUIRED` zamiast syntetyku, ale
`Zmumu.csv` nie jest w repo, a `opendata.cern.ch` jest zablokowany. To jest
pomiar instrumentalny, nie wartość przeliczona — czyli kotwica, która zamyka
punkt (1).

**Próba drugiej kotwicy (2026-09-12, Kepler/NASA Exoplanet Archive):
BLOCKED, nie zmienia stanu ryzyka.** Zmierzono niezależnie ten sam rodzaj
blokady co wyżej — `exoplanetarchive.ipac.caltech.edu` odmawia CONNECT (403),
dowód w `docs/P2_EVIDENCE.md`. Zamiast przypinać ilustracyjny rekord z
pakietu badawczego (co byłoby fabrykacją), zadanie zostało zgłoszone jako
`BLOCKED — brak dostępu do źródła`. Jedyna trwała zmiana: `#/evidence`
renderuje teraz WSZYSTKIE wpisy `EXTERNAL_ANCHORS` przez pętlę, nie jeden
hardkodowany ID — więc kolejna próba (inne środowisko z dostępem, albo inne
źródło bez kluczy) nie wymaga już zmian w ekranie.

---

## R-006 — Redeploy kontenerowy z woluminem · MITIGATED, ZIELONY dowód w CI (2026-09-12)

**Potwierdzone realnym uruchomieniem, nie deklaracją.** Job `docker-image`
(`.github/workflows/ci.yml`) na commicie `0c78866` (run `34712028969`):
`conclusion: "success"` na budowie obrazu I na realnym drillu redeployu
(kill kontenera, restart na tym samym nazwanym woluminie, konto/projekt
sprzed redeployu odczytane po). `docs/DECISIONS.md`, D-019 — sprawdzone
przez `mcp__github__actions_get`, nie założone. To jest pierwszy realny
`docker build`/`docker run` tego repo w historii, zakończony sukcesem.

**Fakt, poprawiony.** Poprzednia wersja tego wpisu mówiła „brak demona
Dockera" — nieprecyzyjne. Demon URUCHAMIA SIĘ w tym środowisku (własny
`--data-root`/socket), ale `docker pull`/`docker build` dociera do API
manifestów Docker Hub i dostaje `403 Forbidden` przy pobieraniu warstwy obrazu
z CDN (`production.cloudfront.docker.com`) — ten sam rodzaj blokady egress co
przy NASA Exoplanet Archive/CERN Open Data (P2.3), inny host. Pięć prób z
narastającym odstępem, w tym z jawnie przekazanymi zmiennymi proxy demonowi —
bez skutku na poziomie CDN.

**Naprawa.** `.github/workflows/ci.yml` → job `docker-image`: buduje TEN SAM
obraz i wykonuje TEN SAM drill redeployu (kontener zabity i USUNIĘTY przez
`docker rm -f`, nowy kontener na tym samym NAZWANYM woluminie, konto i
projekt sprzed redeployu odczytane po) na runnerze GitHub Actions, gdzie
egress do Docker Hub nie jest ograniczony. Logika HTTP tego joba
(rejestracja→projekt→restart→login→odczyt) zweryfikowana lokalnie BEZ
kontenera przed wpisaniem do workflow (`docs/P0_EVIDENCE.md`, sekcja P0.2) —
każdy kształt JSON w skrypcie sprawdzony wykonaniem, nie założony.

**Trzy kolejne uruchomienia w Actions, ten sam błąd, aż do znalezienia
prawdziwej przyczyny — opisane w kolejności, nie ukryte.** Pierwsze
(`d70e130`) i drugie (`305b215`, po dodaniu brakującego
`COPY packages/csrn/package.json`) uruchomienie dały IDENTYCZNY błąd:
`Cannot find module 'node:crypto'`/`'node:child_process'` w
`packages/csrn/src/crypto/*.ts` i `rdkitTransport.node.ts`, ~18-19 s w
`RUN npm run build`. Trzecie uruchomienie (`e678df0`) dodało tymczasową
diagnostykę wersji — bez rozstrzygnięcia (node/npm/typescript prawie
identyczne jak lokalnie).

**Prawdziwa przyczyna znaleziona lokalną bisekcją, nie zgadnięciem
(`docs/DECISIONS.md`, D-018).** Odtworzono DOKŁADNIE zachowanie
`.dockerignore` (usunięcie `**/*.test.ts`/`**/__tests__` z kopiowanych
plików) — błąd odtworzył się lokalnie po raz pierwszy. To jest REALNA,
wcześniej istniejąca luka w typowaniu kodu produkcyjnego, nie problem
środowiska Dockera: `packages/csrn/src/crypto/{fingerprint,signing}.ts`
(kompilowane wewnątrz programu `frontend` przez `tsc -b`, bo
`@genesis-os/csrn` rozwiązuje się do `./src/index.ts`, nie przez formalną
referencję projektu TS) i `rdkitTransport.node.ts` od zawsze przypadkowo
polegały na tym, że plik testowy `__tests__/commitHash.test.ts` też
importuje `node:child_process` — co w TypeScript z ograniczonym
`"types": ["vite/client"]` udostępnia ambientowe typy `@types/node` CAŁEMU
programowi kompilacji, nie tylko temu jednemu plikowi. `.dockerignore`
(usuwający pliki testowe z obrazu — poprawne zachowanie dla obrazu
produkcyjnego) jest pierwszą rzeczą w historii repo, która zbudowała
`frontend` BEZ tego przypadkowego przecieku, i dlatego pierwszy prawdziwy
`docker build` (D-016) był pierwszym miejscem, gdzie ta luka mogła się
ujawnić — żaden wcześniejszy `tsc`/build w tym repo (lokalnie ani w
`verify` CI) jej nie złapał.

**Naprawa: `/// <reference types="node" />` na górze trzech plików, które
faktycznie potrzebują ambientowych typów Node** — lokalne, idiomatyczne
rozwiązanie per-plik, bez zmiany globalnego `"types"` frontendu (co
maskowałoby przyszłe błędy w kodzie przeglądarkowym). Zweryfikowane
odtworzeniem DOKŁADNYCH warunków Dockera lokalnie (bez plików testowych):
bez poprawki — ten sam błąd co w CI, 1:1; z poprawką — build przechodzi.
Pełna lokalna bramka po zmianie zielona (eslint, tsc frontend+csrn, backend
430/396/0/34, frontend 469/5200/1skip, csrn 5/38, build).

**Wciąż nie jest to samodzielny dowód z TEGO środowiska** — dowód powstaje
na kolejnym pushu, w Actions, na tym SHA. Pewność jest znacznie wyższa niż
przy dwóch poprzednich próbach, bo naprawa jest zweryfikowana wobec
dokładnego odtworzenia mechanizmu awarii, nie tylko wobec samej sekwencji
COPY. Status: sprawdzić w zakładce Actions dla `.github/workflows/ci.yml`
przed wdrożeniem — `docker-image` MUSI być zielony, nie tylko `verify`.

---

## R-007 — Nazwa modułu `nodejs-22` w `.replit` niesprawdzona · OPEN (drobne)

**Fakt.** `.replit` został podniesiony z `nodejs-20` (na którym backend nie
startuje w ogóle) na `nodejs-22`, ale nie mam stąd dostępu do rejestru modułów
Replita, żeby potwierdzić tę nazwę.

**Dlaczego to jest niegroźne.** Jeśli nazwa jest inna, bramka runtime z P0.1
wypisze czytelny komunikat z instrukcją naprawy zamiast
`ERR_UNKNOWN_BUILTIN_MODULE`. Koszt pomyłki spadł z „nieczytelny crash" do
„jedna linia w `.replit`".
