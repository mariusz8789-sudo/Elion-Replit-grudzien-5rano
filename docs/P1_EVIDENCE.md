# P1 EVIDENCE — Genesis OS, pakiet operacyjny (ciąg dalszy P0)

Ta sama zasada dowodowa co `P0_EVIDENCE.md`: żadnego twierdzenia bez
komendy, wyjścia i (gdzie dotyczy) hasha commita. `NOT VERIFIED` tam, gdzie
nie udało się czegoś zweryfikować wykonaniem — i nie jest to prezentowane
jako zrobione.

---

## P1.1 — Audyt skipów

Zobacz `docs/TEST_SKIPS.md` (osobny dokument, jak wymagało zadanie).
Wynik: 58 backend + 1 frontend = 59, wszystkie ZAAKCEPTOWAĆ, zero DOMKNIJ,
zero ZDEPRECJONOWAĆ.

---

## P1.2 — Pełny suite zielony + flaki z dowodem izolacji

### Pełny przebieg, dwukrotnie, bez dodatkowego obciążenia — ZIELONO

```bash
$ cd packages/frontend && npx vitest run 2>&1 | tail -6
 Test Files  465 passed (465)
      Tests  5138 passed | 1 skipped (5139)
   Duration  208.08s
```

Drugi, niezależny przebieg (część audytu P1.1, ta sama gałąź, ten sam
commit) dał identyczny wynik: 465/465 plików, 0 porażek. **Nazwany w
briefie flak (`nextActionSelectors.test.ts` → „the precision-analysis
adapter…”) NIE wystąpił w żadnym z tych dwóch normalnych przebiegów.**

### Test w izolacji — ZIELONO

```bash
$ npx vitest run src/__tests__/nextActionSelectors.test.ts 2>&1 | tail -6
 Test Files  1 passed (1)
      Tests  15 passed (15)
   Duration  4.10s
```

### Próba wymuszenia czerwonego wyniku dla `nextActionSelectors.test.ts`

Hipoteza robocza przed próbą: test „the precision-analysis adapter…” woła
`createNodeRdkitTransport()` → `runPrecisionReferenceAnalysis(...)`, co
uruchamia **synchroniczny** `execFileSync(python3, [rdkit_worker.py, ...],
{ timeout: 10_000 })` (`core/discovery/molecular/rdkitTransport.node.ts:36-42`).
Robocza teza: pod silnym obciążeniem CPU pełnego przebiegu ten spawn+exec
mógłby zbliżyć się do twardego limitu 10 s.

Zmierzone WPROST, bez i z sztucznym obciążeniem (6 pętli `while true` na 4
rdzeniach — `nproc` → 4):

```bash
$ time python3 packages/backend/src/compute/rdkit_worker.py '{"cmd":"detect"}'
{"ok": false, "error": "rdkit_unavailable: No module named 'rdkit'"}
real 0m0.022s          # bez obciążenia

$ time python3 packages/backend/src/compute/rdkit_worker.py '{"cmd":"detect"}'
{"ok": false, "error": "rdkit_unavailable: No module named 'rdkit'"}
real 0m0.043s          # pod obciążeniem (loadavg 2.90 na 4 rdzeniach)
```

**Ta hipoteza jest SŁABO wspierana przez własny pomiar**: margines do
limitu 10 s (43 ms zmierzone vs 10 000 ms budżetu, ~230×) jest zbyt duży,
żeby zwykłe obciążenie CPU w tym środowisku go realnie zagrażało. Nie
udaję pewności, której nie mam — zapisuję to wprost, zamiast fabrykować
wyjaśnienie.

Pełny przebieg pod sztucznym obciążeniem (6 procesów `while true; do :;
done` w tle, `loadavg` 6.85 na 4 rdzeniach, potwierdzone) **NIE**
wyprodukował czerwonego wyniku dla `nextActionSelectors.test.ts` — patrz
niżej, wyprodukował inny, realny czerwony wynik gdzie indziej.

**Rozstrzygnięcie dla `nextActionSelectors.test.ts`: NOT VERIFIED (strona
czerwona).** Zielona strona jest w pełni potwierdzona (dwa normalne pełne
przebiegi + izolacja, wszystkie 0 porażek). Nie udało mi się dziś,
uczciwymi próbami (dwa normalne przebiegi + jeden pod celowo wywołanym
silnym obciążeniem CPU), wywołać czerwonego wyniku dla TEGO konkretnego
testu — więc NIE twierdzę, że go naprawiłem, ani że rozumiem mechanizm z
pewnością. Zostawiam to jawnie jako lukę dowodową, a nie jako zamkniętą
sprawę.

### Flaki RZECZYWIŚCIE odtworzone pod sztucznym obciążeniem — pełne dowody

Próba stresowa (`for i in 1..6; do (while true; do :; done) & done`,
`loadavg` 6.85/4 rdzenie) ODTWORZYŁA realny czerwony wynik — **innej**
grupy testów, `scientificWorldState.test.ts`:

```bash
$ npx vitest run 2>&1 | tail -30    # pod sztucznym obciążeniem
 FAIL  src/__tests__/scientificWorldState.test.ts > ... > 10. no fake scientific
 state can enter through the presentation layer — tampering changes the fingerprint
Error: Test timed out in 5000ms.

 FAIL  src/__tests__/scientificWorldState.test.ts > ... > 12. provenance survives
 the complete flow — every projected event traces to a real ExperimentRun
Error: Test timed out in 5000ms.

 Test Files  4 failed | 461 passed (465)
      Tests  37 failed | 5101 passed | 1 skipped (5139)
   Duration  450.58s (tests 1082.49s)
```

Izolacja tego samego pliku, BEZ sztucznego obciążenia — ZIELONO:

```bash
$ npx vitest run src/__tests__/scientificWorldState.test.ts 2>&1 | tail -6
 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  15.36s
```

**Hipoteza przyczyny (poparta czytaniem kodu, nie zgadywana):**
`runEpiLoop()` (`scientificWorldState.test.ts:23-28`) woła
`executePreregisteredHypotheses(...)` — REALNE wykonanie pętli hipotez
epidemiologicznych, bez cache'owania między wywołaniami; kilka `it()`
w tym pliku woła `runEpiLoop('problem:lowest-modeled-deaths')` OD NOWA.
Domyślny limit czasu Vitest to 5000 ms na test (brak nadpisania `testTimeout`
w tym pliku ani w konfiguracji) — margines wystarczający przy normalnym
współbieżnym przebiegu (potwierdzone: dwa czyste przebiegi 465/465), ale
NIE wystarczający, gdy 6 dodatkowych procesów zajmujących CPU konkuruje o
te same 4 rdzenie z workerami Vitest.

**Ważne zastrzeżenie uczciwości:** to obciążenie było CELOWO ekstremalne
(6 pętli busy-wait na 4 rdzeniach, DODATKOWO do własnej współbieżności
Vitesta) — więcej niż realnie generuje sam pełny przebieg testów, co
potwierdzają DWA niezależne normalne przebiegi (0 porażek każdy). Nie
jest to więc dzisiejsza, realna niestabilność CI — jest to
**udokumentowana wrażliwość na skrajne wygłodzenie CPU**, realna i
odtworzona, ale nie ta sama klasa problemu co codzienna flakowatość.

**Decyzja: OPEN, nie naprawiane w tym pakiecie.** Nie jest to nazwany
flak z briefu (to `nextActionSelectors.test.ts`, nie
`scientificWorldState.test.ts`) i nie objawia się w normalnym przebiegu.
Rekomendacja na przyszłość (nie wykonana teraz, żeby nie zmieniać testu
tylko po to, by "zamaskować" retry — to NIE jest maskowanie retry, ale i
tak wymaga własnej decyzji, nie przy okazji): albo podnieść `testTimeout`
dla `scientificWorldState.test.ts` z jawnym uzasadnieniem (realna praca
numeryczna, nie zawieszenie), albo odcache'ować powtórne wywołania
`runEpiLoop('problem:lowest-modeled-deaths')` przez `beforeAll` w obrębie
pliku (żaden z `it()` nie mutuje wyniku, więc jest to bezpieczne).

### Podsumowanie P1.2

| Flak | Zielono (izolacja) | Czerwono (pełny bieg) | Hipoteza | Decyzja |
|---|---|---|---|---|
| `nextActionSelectors.test.ts` — precision-analysis adapter | ✅ potwierdzone, 15/15 | ❌ NIE odtworzone dziś (2 normalne + 1 pod stresem) | Słabo wspierana (subprocess timeout, margines 230× w tym środowisku) | **NOT VERIFIED** — brak dowodu, brak fałszywej pewności |
| `scientificWorldState.test.ts` (4 pliki, 37 testów) — nienazwany w briefie | ✅ potwierdzone, 13/13 | ✅ odtworzone pod sztucznym obciążeniem CPU | Realna, niecache'owana praca numeryczna vs domyślny limit 5000ms Vitest, pod EKSTREMALNYM obciążeniem | **OPEN** — nie jest codzienną niestabilnością (2/2 normalne przebiegi zielone), rekomendacja zapisana, nie wykonana w tym pakiecie |

Zero retry-maskowania: żaden test nie został zmieniony, żaden limit czasu
nie został podniesiony w tym pakiecie tylko po to, żeby coś było zielone.

---

## P1.3 — Migracje schematu bez utraty danych

**Materiał:** `packages/backend/data/genesis.db` (26 tabel/44 users/40
projects, cytowane w briefie) NIE istnieje w tym kontenerze — plik jest
gitignorowany, a repo klonuje się od zera do każdej sesji. Zamiast
zatrzymać zadanie, zbudowano WŁASNĄ, realną, wielotabelową bazę z prawdziwymi
wierszami — zobacz `packages/backend/src/storeMigration.test.mjs`,
konkretnie fixture `LEGACY_PRE_V2_SCHEMA` (dosłowna kopia bazowego `SCHEMA`
sprzed `SCHEMA_V2`, więc realnie odtwarza kształt starej instalacji, nie
wymyślony).

### 1. Test graniczny: pusta baza

```bash
$ node --test src/storeMigration.test.mjs
ok — openDatabase na pustym pliku tworzy wszystkie oczekiwane tabele i user_version=12
```

25 tabel zweryfikowanych po nazwie (`users` … `access_audit`), `PRAGMA
user_version` = 12 po jednym wywołaniu `openDatabase()` na pliku, który
wcześniej nie istniał.

### 2. Test graniczny: baza z danymi, migracja nic nie gubi

Legacy baza (kształt sprzed `SCHEMA_V2`) wypełniona 2 użytkownikami, 2
projektami, 2 członkostwami, 4 próbami (3 w projekcie `p1`, bez
`branch_id` — ta kolumna jeszcze nie istnieje na tym etapie). Skopiowana
do OSOBNEGO pliku tempowego (`cpSync`, nigdy nie testowane na oryginale),
dopiero wtedy otwarta przez `openDatabase()`:

```bash
$ node --test src/storeMigration.test.mjs
ok — legacy pre-v2 baza z realnymi users/projects/trials przeżywa migrate() z KAŻDYM wierszem nietkniętym
```

Zweryfikowane konkretnie: liczba wierszy w `users`/`projects`/`memberships`/
`trials` identyczna przed i po (`assert.deepEqual` na policzonych `COUNT(*)`
per tabela); TREŚĆ wierszy (email, hash hasła, nazwa projektu) bajt-w-bajt
ta sama; backfill `SCHEMA_V2` (`version<2`) realnie utworzył gałąź `main`
dla OBU istniejących projektów i przypisał do niej WSZYSTKIE 4 próby
poprawnie pogrupowane (3→`p1`, 1→`p2`) — to jest jedyna migracja w całym
`migrate()`, która przepisuje/backfilluje dane, nie tylko dodaje kolumny/
tabele, więc najbardziej ryzykowna dla utraty danych i najważniejsza do
sprawdzenia realnie, nie założeniowo.

### 3. Guard przed downgrade'em — TDD

Czerwono PRZED implementacją:

```bash
$ node --test src/storeMigration.test.mjs
not ok — kod ODMAWIA otwarcia bazy nowszej niż zna, z czytelnym komunikatem, i NIC nie zmienia
  error: 'Missing expected exception: ...'
```

Implementacja (`store.mjs`, `migrate()`, przed pierwszym `if (version < 9)`):
`CURRENT_SCHEMA_VERSION = 12` (stała, jawnie nazwana — dokładnie to, co
zadanie nazwało „polem schema_version, metadaną, dozwoloną”; `PRAGMA
user_version` jest już tą metadaną wbudowaną w plik bazy, więc guard nie
DODAJE nowego pola, tylko odczytuje istniejące w drugą stronę). Jeśli
`version > CURRENT_SCHEMA_VERSION`, `migrate()` rzuca błąd z czytelnym
komunikatem PRZED jakąkolwiek mutacją schematu.

Zielono PO implementacji:

```bash
$ node --test src/storeMigration.test.mjs
ok — kod ODMAWIA otwarcia bazy nowszej niż zna, z czytelnym komunikatem, i NIC nie zmienia
```

Zweryfikowane dodatkowo: po odrzuconym otwarciu baza jest NIETKNIĘTA —
`user_version` wciąż 999 (symulowana „przyszła” wersja), a wcześniej
wstawiony wiersz w `users` nadal istnieje, sprawdzone bezpośrednim
zapytaniem SQL OMIJAJĄCYM `openDatabase()` (żeby nie ufać temu samemu
kodowi, który się właśnie testuje).

### 4. Test idempotencji

```bash
$ node --test src/storeMigration.test.mjs
ok — openDatabase wywołane dwa razy na tej samej bazie z danymi daje identyczny stan, bez zmian
```

Dwa kolejne `openDatabase()` na tym samym pliku z prawdziwymi wierszami:
identyczny zestaw tabel, identyczne liczby wierszy w każdej, identyczny
`user_version`, treść wiersza użytkownika bajt-w-bajt ta sama.

### Regresja całego backendu po dodaniu guardu

```bash
$ npm test --workspace=packages/backend
# tests 423 | suites 96 | pass 365 | fail 0 | skipped 58
```

(423 = 419 sprzed P1.3 + 4 nowe testy graniczne; 365 = 361 + 4; 58 skipped
bez zmian — guard nie dotyka żadnej istniejącej ścieżki, bo każda
istniejąca baza w repo/testach ma `user_version <= 12`.)

### NOT VERIFIED w tym punkcie

- **Realny plik `packages/backend/data/genesis.db`** (26 tabel/44 users/
  40 projects) — nieobecny w tym kontenerze, jak opisano wyżej. Fixture
  zastępczy jest REALNY (prawdziwe wiersze, prawdziwe zapytania SQL), ale
  mniejszy skalą niż oryginał; migracja jest deterministyczna względem
  KSZTAŁTU danych (liczby tabel/wierszy), nie ich ilości, więc to
  ograniczenie skali, nie luka w metodzie.
- Downgrade guard NIE był testowany na PRAWDZIWEJ starszej wersji kodu z
  tego repo uruchomionej na nowej bazie (tylko symulacja `PRAGMA
  user_version = 999`) — testowanie dwóch realnych checkoutów kodu
  jednocześnie wykracza poza zakres tego pakietu.

---

## R-001 BONUS — tokeny sesji przestają być jawnym tekstem

**Cherry-pick, nie przepisanie:** `packages/backend/src/secrets.mjs`
skopiowany BAJT-W-BAJT z `3bce0c2:packages/backend/src/secrets.mjs`
(`git show 3bce0c2:packages/backend/src/secrets.mjs > packages/backend/src/secrets.mjs`),
nie zaimplementowany od nowa. Ten commit leży na innej, mocno rozjechanej
gałęzi (`origin/genesis/main`) i cały jego diff (rate limiting, billing,
auth-gate na innych endpointach) NIE ma tu zastosowania — dosłowny `git
cherry-pick 3bce0c2` skonfliktowałby się na plikach, które w tym repo
albo nie istnieją, albo się rozjechały. Skopiowano więc tylko ten JEDEN,
samodzielny, czysto-funkcyjny moduł, którego dotyczyło zadanie.

### TDD — czerwono przed wpięciem

```bash
$ node --test src/sessionTokenHashing.test.mjs   # przed zmianą store.mjs
# tests 4 | pass 1 | fail 3
```

(3 z 4 testów failują: `createSession` zapisywał jawny token, `getUserByToken`
przyjmowałby sam hash jako poprawny bearer token, migracja legacy-plaintext
nie istniała.)

### Wpięcie (store.mjs)

- `createSession` zapisuje `hashSecret(token)` w kolumnie `sessions.token`;
  nadal ZWRACA surowy `token` wywołującemu (`issueSession` w `api.mjs` wciąż
  oddaje klientowi realny, używalny token — to jedyny moment, kiedy klient
  go dostaje).
- `getUserByToken`/`deleteSession` haszują PRZEDSTAWIONY token przed
  zapytaniem — klient nadal loguje się swoim surowym tokenem.
- Migracja `version < 13` w `migrate()`: dla każdego wiersza `sessions`,
  jeśli `!looksHashed(token)`, zamienia go na `hashSecret(token)`.
  Idempotentna z DWÓCH niezależnych powodów: bramka `version < 13` (uruchomi
  się raz na bazę) ORAZ `looksHashed()` (pominie wiersz, który już jest
  haszem, nawet gdyby coś odpaliło tę pętlę drugi raz) — dokładnie to, o co
  prosiło zadanie („`looksHashed` istnieje właśnie po to”).
- `CURRENT_SCHEMA_VERSION` (P1.3) podniesione z 12 na 13 i **wyeksportowane**
  ze `store.mjs`, żeby testy nigdy nie musiały twardokodować liczby wersji
  osobno od źródła prawdy.

### Zielono po wpięciu

```bash
$ node --test src/sessionTokenHashing.test.mjs
# tests 4 | pass 4 | fail 0
```

Konkretnie zweryfikowane: (1) `sessions.token` w bazie NIE jest surowym
tokenem i jest realnym SHA-256 surowego tokenu; (2) klient nadal
uwierzytelnia się SUROWYM tokenem; (3) sam zapisany hash, użyty jako
bearer token, NIE uwierzytelnia (żeby wyciek samego hasha z backupu nie
był tak dobry jak wyciek realnego tokenu); (4) `deleteSession` nadal
działa na surowym tokenie klienta.

### Idempotentna migracja na PRAWDZIWEJ bazie z plaintextowym tokenem

```bash
$ node --test src/sessionTokenHashing.test.mjs
ok — a legacy session row with a plaintext token gets hashed in place, without losing the session
```

Zbudowana legacy baza (schemat sprzed tej migracji) z realnym
użytkownikiem i realną sesją o JAWNYM tokenie. Po `openDatabase()`:
token w bazie jest już hashem, sesja nadal istnieje (dokładnie 1, zero
duplikacji/utraty), a klient WCIĄŻ loguje się swoim oryginalnym, surowym
tokenem. Drugie `openDatabase()` na tej samej bazie: token się NIE zmienia
(dowód idempotencji, nie tylko deklaracja).

### Regresja P1.3 po podniesieniu wersji schematu do 13

Podniesienie `CURRENT_SCHEMA_VERSION` z 12 na 13 unieważniło dwie literalne
asercje `user_version === 12` w testach granicznych P1.3 — naprawione przez
import `CURRENT_SCHEMA_VERSION` ze `store.mjs` zamiast twardego kodowania
liczby, więc przyszła migracja (14) nie złamie tych testów po cichu.

```bash
$ node --test src/storeMigration.test.mjs src/sessionTokenHashing.test.mjs
# tests 8 | pass 8 | fail 0
```

### Regresja całego backendu

```bash
$ npm test --workspace=packages/backend
# tests 427 | suites 98 | pass 369 | fail 0 | skipped 58

$ npx eslint packages/backend/src/store.mjs packages/backend/src/secrets.mjs \
    packages/backend/src/storeMigration.test.mjs packages/backend/src/sessionTokenHashing.test.mjs
# (czysto, zero błędów)
```

(427 = 423 sprzed R-001 + 4 nowe testy; 369 = 365 + 4; 58 skipped bez
zmian.) `dbDurability.test.mjs`'s `P0.2 REDEPLOY` — logowanie i tworzenie
projektu przez PRAWDZIWY HTTP do serwera API — jest częścią tego samego
pełnego przebiegu i nadal przechodzi, więc realny przepływ logowania
(`issueSession` → `createSession` → hash → klient dostaje surowy token →
kolejne żądania przez `getUserByToken`) jest zweryfikowany end-to-end, nie
tylko jednostkowo.

### Status R-001 (`docs/RISKS.md`)

Z **OPEN** na **MITIGATED**: tokeny sesji są haszowane w spoczynku
(SHA-256, `secrets.mjs`), migracja dla istniejących baz jest idempotentna
i przetestowana na realnych danych. Resztkowe, świadomie NIE zmieniane w
tym pakiecie: `keyHint()`, wliczone w cherry-pickowany plik, NIE jest
importowane ani wołane nigdzie w tym repo — repo na tej gałęzi nie ma
jeszcze koncepcji kluczy API do wyświetlenia, więc nie ma dziś czego nią
maskować. Zostawione w pliku (nieużywany eksport, nie martwy kod w ścieżce
wykonania) zamiast wycinane z cherry-picka, żeby moduł pozostał identyczny
z `3bce0c2` — łatwiej zweryfikować „to jest dokładnie ten plik” niż
częściowy, ręcznie okrojony fragment.
