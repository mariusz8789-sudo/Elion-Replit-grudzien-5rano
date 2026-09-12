# RISKS — Genesis OS, jawna lista ryzyk i łagodzeń

Dokument pisany wprost, nie ukryty w przypisach. Zasada: ryzyko nazwane w
dokumentacji jest ryzykiem zarządzanym; ryzyko przemilczane w dokumentacji jest
ryzykiem, które komisja znajdzie sama i policzy podwójnie.

Legenda statusu: **OPEN** = realne i nienaprawione · **MITIGATED** = ograniczone,
z opisanym resztkowym · **ACCEPTED** = świadomie przyjęte na tym etapie.

---

## R-001 — Tokeny sesji przechowywane w postaci jawnej · OPEN

**Fakt.** `packages/backend/src/store.mjs:634-644` zapisuje token sesji dosłownie
w kolumnie `sessions.token`. Kto zdobędzie plik bazy — **w tym plik backupu**,
który `scripts/db-backup.mjs` właśnie uczynił łatwym do wykonania i
skopiowania — może użyć tych tokenów bezpośrednio do końca ich TTL.

**Czego to NIE jest.** Nie jest regresją tej gałęzi. Gotowa implementacja
haszowania w spoczynku (`hashSecret`/`keyHint`/`looksHashed`, SHA-256, czyste
funkcje) istnieje w commicie `3bce0c2`, ale ten commit **nie jest przodkiem
HEAD** — leży na `origin/genesis/main` i
`origin/claude/genesis-takeover-audit-kpz019`. Sprawdzone:
`git merge-base --is-ancestor 3bce0c2 HEAD` → fałsz.

**Proponowana naprawa (reuse, nie nowa implementacja).** Cherry-pick
`3bce0c2:packages/backend/src/secrets.mjs`, przełączenie `createSession`/
`getUserByToken` na hash + migracja idempotentna (`looksHashed` istnieje
właśnie po to). Wymaga TDD i testów granicznych na bazie z danymi — czyli
reguł P1.3.

**Łagodzenie operacyjne do zastosowania natychmiast** (`OPS_RUNBOOK.md` §4):
prawa `700` na katalogu backupów, szyfrowanie kopii poza woluminem, czyszczenie
tabeli `sessions` po restore z kopii starszej niż incydent.

**Termin proponowany:** przed jakimkolwiek wdrożeniem publicznym z realnymi
kontami. Do tego czasu instancja demonstracyjna nie powinna zawierać kont osób
trzecich.

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

## R-005 — Brak kotwicy w danych zewnętrznych · OPEN (najważniejsze naukowo)

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

**Naprawa:** pakiet P2.3 (minimalny ingestion publicznych danych → jeden
eksperyment end-to-end z pełną prowieniencją i replay MATCH). **Status: nie
wykonany na dzień tego wpisu.**

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
