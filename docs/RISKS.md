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

## R-006 — Redeploy kontenerowy z woluminem nie jest zweryfikowany · OPEN

**Fakt.** P0.2 dowodzi wykonaniem, że dane przeżywają wymianę procesu ORAZ
katalogu wdrożenia. Nie dowodzi zachowania montowania woluminu przez platformę,
bo w środowisku wykonawczym nie ma demona Dockera
(`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`).

**Co pozostaje do zrobienia, konkretnie.** Zbudować obraz, uruchomić z
`-v genesis-data:/data`, utworzyć konto, `docker rm -f` kontener, uruchomić
nowy z tego samego woluminu, zalogować się tym kontem. To jest dziesięć minut
na maszynie z Dockerem i powinno być wykonane przed wdrożeniem.

---

## R-007 — Nazwa modułu `nodejs-22` w `.replit` niesprawdzona · OPEN (drobne)

**Fakt.** `.replit` został podniesiony z `nodejs-20` (na którym backend nie
startuje w ogóle) na `nodejs-22`, ale nie mam stąd dostępu do rejestru modułów
Replita, żeby potwierdzić tę nazwę.

**Dlaczego to jest niegroźne.** Jeśli nazwa jest inna, bramka runtime z P0.1
wypisze czytelny komunikat z instrukcją naprawy zamiast
`ERR_UNKNOWN_BUILTIN_MODULE`. Koszt pomyłki spadł z „nieczytelny crash" do
„jedna linia w `.replit`".
