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

## R-005 — Brak kotwicy w danych zewnętrznych · ZWĘŻONE DALEJ (2026-09-12, PIERWSZA kotwica INSTRUMENTALNA: CMS Z→μμ), nie zamknięte w całości

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

**ZROBIONE (2026-09-12, C1): kotwica instrumentalna na CMS Open Data Z→μμ
2011 (rekord 5208, CC0).** Punkt (2) powyżej (brak ingestion na żywo) jest
teraz częściowo domknięty przez PIERWSZY prawdziwy POMIAR INSTRUMENTALNY w
repo — nie przeliczoną wartość jak PubChem/Kepler, tylko realny odczyt
detektora CMS. `compute/cmsOpenDataAdapter.mjs`/`cms_zmumu_worker.py`/model
Fabric `particle-cern-cms-zmumu-invariant-mass` już istniały, w pełni
zaimplementowane i przetestowane pod nieobecność danych (`DATA_REQUIRED`) —
brakowało wyłącznie samego pliku `Zmumu.csv`. `opendata.cern.ch` jest
zablokowany z tego sandboksa (403 na CONNECT, zmierzone bezpośrednio), więc
plik pobrano przez GitHub Actions (`scripts/fetch-cms-zmumu-fixture.mjs`,
job `cms-zmumu-recon`), zweryfikowano SHA-256 przeciw wartości JUŻ
zapisanej w `cms_zmumu_worker.py::EXPECTED_SHA256`
(`7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1`) i
przypięto pod `packages/backend/src/compute/cms-zmumu/Zmumu.csv`.

**Realna przeszkoda po drodze, nie ukryta.** Pierwsza próba wydrukowania
całego pliku (970 KB, 10001 linii) do jednego loga joba okazała się
NIECZYTELNA: `get_job_logs` po cichu zwrócił tylko OSTATNIE ~5000 linii
(~630 KB) tego joba, niezależnie od żądanego zakresu, bez żadnego błędu —
ta sama klasa cichego obcinania, na którą trafiła kotwica QE4/Brydges
powyżej ~2,5 MB łącznej zawartości. Rozwiązanie: job macierzowy na 4
fragmenty, każdy z jawnie ponumerowanymi liniami (żeby dało się je złożyć w
dowolnej kolejności odczytu), każdy log osobno mały. Po złożeniu wszystkich
czterech fragmentów odtworzony plik dał SHA-256 **bajt-w-bajt zgodny** z
wartością oczekiwaną — potwierdzone lokalnie: `python3 -c "import
hashlib; print(hashlib.sha256(open('packages/backend/src/compute/cms-zmumu/Zmumu.csv','rb').read()).hexdigest())"`
→ `7782778f8417d2c732f4a64efcbfceb6192c97c3bcfd21c0cf1322d38ed965d1`.

**Weryfikacja, nie deklaracja.** Uruchomiony lokalnie prawdziwy worker
Pythona na przypiętym pliku (bez sieci) daje DOKŁADNIE te liczby, które
`cmsOpenDataCompute.test.mjs` miał już zapisane jako oczekiwane, zanim plik
istniał: `eventCount=10000`, `events80To100GeV=8259`,
`median=90.28540772526225`. Trzeci test tego pliku, dotąd `{ skip:
!configuredDataDir }`, teraz przechodzi NAPRAWDĘ (nie jest pomijany):
`GENESIS_CERN_OPEN_DATA_DIR=.../cms-zmumu node --test
packages/backend/src/cmsOpenDataCompute.test.mjs` → `3/3 pass`. Pełny
backend: `397/397 pass, 33 skipped` (było `396/396, 34 skipped` — jeden
mniej pominięty, dokładnie ten). Job CI zamieniony z jednorazowego
bootstrapu na trwałą kontrolę dryfu (`cms-zmumu-verify-pinned`, świeży
fetch porównywany z przypiętą kopią przy każdym pushu), a
`GENESIS_CERN_OPEN_DATA_DIR` ustawiony w kroku testowym CI, żeby ten test
uruchamiał się naprawdę, nie zostawał pominięty w praktyce.

**Co to zamyka, a co nie.** Zamyka punkt (2) dla TEJ jednej kotwicy: mamy
teraz przykład prawdziwego pomiaru instrumentalnego (nie przeliczonej
wartości) w repo, opisową statystykę masy niezmienniczej z 10 000
rzeczywistych zdarzeń dimionowych CMS. NIE zamyka punktu (2) w ogóle —
nadal nie ma ingestion API na żywo (dane przypięte, nie pobierane w czasie
rzeczywistym) i to jest opisowa statystyka, nie test falsyfikacyjny
(brak tu jeszcze prerejestrowanej predykcji Genesis do porównania — to
jest naturalny „next question" dla tej kotwicy, poza zakresem tego zadania).

**Próba drugiej kotwicy (2026-09-12, Kepler/NASA Exoplanet Archive):
BLOCKED z tego środowiska, potem ZAMKNIĘTA przez inne, bezpieczniejsze
źródło.** Bezpośredni dostęp do `exoplanetarchive.ipac.caltech.edu` z tego
sandboxa pozostaje zablokowany (403), potwierdzone ponownie. Ale zamiast
zatrzymać się na `BLOCKED`, C1 zreużył sprawdzony wzorzec CI-fetch-pin
(`nist-g3-pinned-artifacts`) dla INNEGO, bezpieczniejszego źródła: NASA
NSSDCA Planetary Fact Sheet. Powód zmiany źródła nie jest blokadą egress
(runner GitHub Actions jej nie ma) — jest nim realne ryzyko cykliczności
specyficzne dla archiwum egzoplanet (wiele wpisów ma półoś wielką WYLICZONĄ
z okresu przez III prawo Keplera — dokładnie formułę, którą testowałaby ta
kotwica), którego nie dało się zweryfikować bez dostępu do archiwum. Dane
Układu Słonecznego usuwają tę niejednoznaczność: okres i odległość pochodzą
z dwóch historycznie niezależnych technik pomiarowych.

**Dwie sesje trafiły w to samo rozwiązanie równolegle — udokumentowane, nie
ukryte.** Ta sesja (C1) i inna, równoległa sesja doszły do IDENTYCZNEGO
wniosku niezależnie: ten sam plik NASA NSSDCA, ten sam powód unikania
Exoplanet Archive, ten sam wzorzec CI-fetch-pin. Równoległa sesja
zaimplementowała i wypchnęła kotwicę Kepler/Mars (commit `81189cf`,
`nssdcPlanetaryFactSheet.ts`, Tautology Gate wpięta w OBIE kotwice,
`keplerExternalAnchor.test.ts`, 25 testów) PIERWSZA. C1 miał w tym samym
czasie gotową, równoważną kotwicę Kepler/Wenus na tym samym pliku — po
`git fetch` i porównaniu obu implementacji, C1 odrzucił własną wersję
zamiast wypychać konkurencyjną, duplikującą implementację (dokładnie to,
czego zadanie miało unikać) i przyjął kotwicę Mars jako kanoniczną. Jedyne,
czego kanoniczna implementacja NIE miała, a czego wymagało zadanie: rewizja
przekonania (belief revision) i konkretne „next question" po każdym
przebiegu. C1 dołożył te dwa pola (`belief: {before, after, status}`,
`nextQuestion: string`) do `runExternalAnchor` GENERYCZNIE — dla OBU
zadeklarowanych kotwic, nie jako trzecia, konkurencyjna kotwica.

**Rezultat: PIERWSZA prawdziwie EMPIRYCZNA kotwica w tym repo, nie tylko
weryfikacja wzajemna — plus rewizja przekonania i next question dla obu.**
Predykcja Genesis (III prawo Keplera z półosi wielkiej Marsa,
`universe-kepler`, niezmieniony) = 687.2336 dnia; realny, niezależnie
zmierzony okres orbitalny Marsa (NASA NSSDCA) = 687.0 dnia; różnica 0.034%,
wewnątrz prerejestrowanego pasma ±0.05%. Werdykt: `SUPPORTED_WITHIN_PROTOCOL`.
Tautology Gate klasyfikuje to jako `EMPIRICAL_TEST` (obie kotwice, nie tylko
ta) — obserwacja jest zadeklarowana jako `independent-measurement`, prawdziwy
pomiar astronomiczny, nie liczba przeliczona z tego samego wzoru. Rewizja
przekonania: pewność hipotezy „model poprawnie przewiduje ${metric}" rusza
z neutralnego priora 0.5 i faktycznie się zmienia (0.5→0.618 dla Marsa,
0.5→0.817 dla PubChem po tym jednym przebiegu — patrz `docs/DECISIONS.md`).
To zamyka punkt (1) powyżej dla tej JEDNEJ pary predykcja/obserwacja: mamy
teraz przykład, w którym zgodność potwierdza rzeczywistą hipotezę fizyczną,
nie tylko spójność dwóch niezależnie utrzymywanych tablic. Punkt (2) (brak
ingestion API na żywo) pozostaje otwarty — dane są przypięte przez CI-fetch,
nie pobierane w czasie rzeczywistym. Pełny opis: `docs/MASTER_PRIORITY_GENESIS.md`,
`docs/P2_EVIDENCE.md`, `docs/DECISIONS.md`.

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
