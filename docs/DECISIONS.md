# DECISIONS — Genesis OS

Rejestr decyzji podjętych autonomicznie w trakcie misji GRANT-READINESS, wraz z
uzasadnieniem. Zasada: rozstrzygamy konserwatywnie, zapisujemy natychmiast,
niczego nie domykamy po cichu. Każdy wpis ma datę, wybór, alternatywę odrzuconą
i — gdzie to istotne — jawne ZAŁOŻENIE, którego nie dało się zweryfikować z tego
środowiska.

---

## D-001 (2026-09-12, P0.1) — Podłoga Node to `>=22.5.0`, nie `>=22`

**Decyzja.** Wszystkie cztery manifesty deklarują `engines.node: ">=22.5.0"`.

**Dlaczego nie `>=22`, jak brzmiało polecenie.** `>=22` jest zbyt luźne i
wpuszczałoby Node 22.0–22.4, na których `node:sqlite` nie istnieje. Podłoga
została ustalona u ŹRÓDŁA, nie z pamięci modelu:

```
curl -sS https://nodejs.org/api/sqlite.json | (parse meta.added)
  sqlite       | added: ['v22.5.0']
  DatabaseSync | added: ['v22.5.0']
```

**Alternatywa odrzucona.** `>=22` — deklaratywnie zgodne z poleceniem, ale
niezgodne z rzeczywistością kodu; kontrakt runtime'u ma być prawdziwy, nie
okrągły.

---

## D-002 (2026-09-12, P0.1) — Bramka sprawdza DWIE osie: wersję i realną zdolność

**Decyzja.** `checkNodeRuntime()` odrzuca zarówno zbyt starą wersję
(`VERSION_TOO_OLD`), jak i runtime, który jest dość nowy, ale nie ma
`node:sqlite` (`SQLITE_UNAVAILABLE`).

**Dlaczego.** Numer wersji jest deklaratywny i może się rozjechać z
rzeczywistością (okrojony/custom build, przyszłe usunięcie modułu). Sonda
zdolności jest empiryczna i nie może się pomylić co do tego, co naprawdę jest w
tym interpreterze. Ta decyzja natychmiast się opłaciła — patrz D-003.

---

## D-003 (2026-09-12, P0.1) — Sonda przez `module.isBuiltin`, nie `builtinModules`

**Decyzja.** `hasNodeSqlite()` używa `module.isBuiltin('node:sqlite')`.

**Dlaczego — to jest dowód, że TDD tu zadziałało.** Pierwsza implementacja
używała listy `module.builtinModules`. Test napisany PRZED implementacją
(„sonda musi zwrócić true na tym interpreterze") wywalił się na zielonym
Node 22.22.2. Zmierzone:

```
builtinModules.includes('sqlite')                    → false
module.isBuiltin('node:sqlite')                      → true
process.getBuiltinModule('node:sqlite').DatabaseSync → function
```

`builtinModules` CELOWO pomija moduły eksperymentalne, a `node:sqlite` nim
wciąż jest. Lista dałaby więc FAŁSZYWĄ BLOKADĘ na poprawnej produkcji —
bramka odmawiałaby startu runtime'owi, który działa. Bez testu na czerwono
ten błąd wszedłby do repo jako „naprawa".

**Alternatywa odrzucona.** `process.getBuiltinModule()` — sprawdza nawet
konkretny eksport, ale ma efekt uboczny (odpala `ExperimentalWarning` za samo
zapytanie) i istnieje dopiero od Node 22.3, a bramka musi wykonać się także na
runtimie, który odrzuca.

---

## D-004 (2026-09-12, P0.1) — Osobny punkt wejścia `start.mjs`, a nie guard w `server.mjs`

**Decyzja.** Nowy plik `packages/backend/src/start.mjs` sprawdza runtime, a
potem wciąga `server.mjs` przez `await import()`. Wszystkie wejścia procesu
(`npm start`, `npm run dev`, `Dockerfile CMD`, `.replit run`) celują w niego.

**Dlaczego nie w `server.mjs`.** ESM rozwiązuje i linkuje CAŁY graf modułów
przed wykonaniem czegokolwiek. `server.mjs` importuje statycznie `store.mjs` →
`node:sqlite`, więc na Node < 22.5.0 proces umiera przy ROZWIĄZYWANIU modułu
(`ERR_UNKNOWN_BUILTIN_MODULE`) — zanim pierwsza linia `server.mjs` dostanie
szansę cokolwiek powiedzieć. Guard w `server.mjs` byłby martwym kodem dokładnie
w jedynym przypadku, dla którego istnieje.

**Alternatywa odrzucona.** Zamiana wszystkich importów `server.mjs` na
dynamiczne — działa, ale przepisuje moduł, który nie ma z tym problemem nic
wspólnego; łamie zasadę „minimalna zmiana".

**Koszt przyjęty świadomie.** Kto uruchomi `node src/server.mjs` bezpośrednio,
wciąż zobaczy surowy `ERR_UNKNOWN_BUILTIN_MODULE`. `nodeRuntime.test.mjs`
pilnuje mechanicznie, że żaden UDOKUMENTOWANY punkt wejścia tego nie robi.

---

## D-005 (2026-09-12, P0.1) — `.replit` podniesiony do `nodejs-22` — ZAŁOŻENIE niesprawdzalne stąd

**Decyzja.** `.replit` zmieniony z `modules = ["nodejs-20", "web"]` na
`modules = ["nodejs-22", "web"]` oraz `run` przestawiony na `start.mjs`.

**Znalezisko, nie kosmetyka.** `nodejs-20` był JEDYNYM miejscem w repo, które
nazywało konkretny runtime platformy — i nazywał taki, na którym CAŁA trwałość
backendu nie startuje. Deklaracja `>=18` w manifeście była nieprawdziwa;
`.replit` był nieprawdziwy operacyjnie.

**SCENARIO ASSUMPTION (niesprawdzone).** Nie mam z tego środowiska dostępu do
rejestru modułów Replita, więc NIE zweryfikowałem, że modul o nazwie
`nodejs-22` istnieje i jest tam dostępny. Nazwa jest zgodna z konwencją
`nodejs-NN`, której Replit używa. **Do weryfikacji przez operatora przy
pierwszym uruchomieniu na Replicie** — jeśli moduł ma inną nazwę, `.replit`
wymaga korekty, a bramka z `start.mjs` i tak wypisze czytelny komunikat zamiast
`ERR_UNKNOWN_BUILTIN_MODULE`.

---

## D-006 (2026-09-12, P0.2) — Backup przez `VACUUM INTO`, nie `cp`

**Decyzja.** Snapshot bazy powstaje przez `VACUUM INTO`.

**Dlaczego.** Baza chodzi w WAL (`store.mjs:527`), więc świeże wiersze siedzą w
pliku `-wal`. `cp genesis.db` daje backup BEZ ostatnich transakcji i wygląda
przy tym na poprawny — to najgorszy możliwy rodzaj kopii zapasowej. `VACUUM INTO`
tworzy atomowy, spójny snapshot jednym plikiem. Test `RESTORE DRILL` celowo nie
zamyka bazy przed snapshotem, żeby sprawdzać dokładnie ten tryb porażki.

**Alternatywa odrzucona.** `sqlite.backup()` (istnieje jako funkcja modułu w tym
Node) — poprawna, ale asynchroniczna i bardziej złożona; przy tej skali nie
kupuje nic ponad `VACUUM INTO`.

---

## D-007 (2026-09-12, P0.2) — Retencja: domyślnie 14, `keep < 1` odrzucane

**Decyzja.** `DEFAULT_BACKUP_KEEP = 14`; `selectBackupsToPrune` rzuca wyjątkiem
przy `keep < 1`.

**Dlaczego 14.** Przy zalecanym harmonogramie co 6 h to 3,5 dnia historii; przy
dobowym — dwa tygodnie. Wartość jest świadoma i zapisana, a nie magiczna.

**Dlaczego `keep = 0` jest błędem, a nie „usuń wszystko".** Skrypt retencji,
który przy złej konfiguracji kasuje ostatnią kopię, jest gorszy niż brak
retencji. Retencja dotyka też WYŁĄCZNIE plików zgodnych ze wzorcem
`<base>.<stamp>.bak` — plik bazy i cokolwiek innego w katalogu nigdy nie trafia
na listę do usunięcia.

---

## D-008 (2026-09-12, P0.3) — Alerty i retencja logów: przygotowane, NIE zastosowane

**Decyzja.** `docs/OPS_RUNBOOK.md` zawiera gotowe do wklejenia konfiguracje
(Uptime Kuma/Healthchecks, Fly, Railway/Render) oznaczone jako **NIE
ZASTOSOWANE**.

**Dlaczego nie zastosowane.** Zastosowanie wymaga wyboru platformy i zgody na
wdrożenie — oba są wstrzymane zasadą twardą tej misji. Twierdzenie „alerty
działają" bez włączonej sondy byłoby dokładnie tym rodzajem deklaracji, której
ta misja zabrania.

**Decyzja projektowa w środku.** Warunek alarmu jest na TREŚCI odpowiedzi
(`db.state == "ready"`), nie tylko na kodzie 200. Instancja z martwą bazą
zwraca 200 i bez tego warunku wyglądałaby zdrowo.

---

## D-009 (2026-09-12, P0.3) — `/api/health` nie ujawnia ścieżki pliku bazy

**Decyzja.** Endpoint zwraca `db.durability` i `db.persistent`, ale NIE
absolutną ścieżkę pliku. Operator dostaje ścieżkę w logu startowym.

**Dlaczego.** `/api/health` jest nieuwierzytelniony (i odpytywany przez
`HEALTHCHECK` obrazu). Układ katalogów hosta nie jest informacją, którą trzeba
tam publikować, a oś trwałości — jest.

---

## D-010 (2026-09-12, P0.4) — `.env.example`: sekrety zawsze puste, nie-sekrety z domyślną wartością

**Decyzja.** Zmienne sekretne (`*KEY*`, `*TOKEN*`, `*SECRET*`, `*PASSWORD*`,
`*CREDENTIAL*`) mają w `.env.example` ZAWSZE pustą prawą stronę. Zmienne
nie-sekretne (np. `PORT=8080`, `GENESIS_AI_MODEL=claude-opus-4-8`) pokazują
wartość domyślną.

**Dlaczego nie wszystko puste, jak brzmiało polecenie („lista zmiennych BEZ
wartości").** Dla sekretów reguła jest bezwarunkowa i tak została wdrożona.
Dla nie-sekretów pokazanie domyślnej wartości jest użyteczną dokumentacją
(„to system przyjmie sam"), a nie wyciekiem. Reguła jest wymuszona
mechanicznie po WZORCU NAZWY, nie po liście — nowa zmienna sekretna jest objęta
automatycznie (`envContract.test.mjs`).

---

## D-011 (2026-09-12, P2.3) — Kotwica na przypiętym payloadzie, nie na pobraniu na żywo

**Decyzja.** Kotwica zewnętrzna czyta obserwację z PRZYPIĘTEGO w repo,
sumowanego payloadu (`pubchem-cid-2519.json`), a nie z żywego wywołania API.

**Dlaczego.** Egress do wszystkich hostów danych naukowych jest odrzucany przez
politykę proxy (`gateway answered 403 to CONNECT`; przepuszczane są tylko
rejestry pakietów). Alternatywy były trzy: (a) czekać na sieć — blokuje
pakiet bezterminowo; (b) wygenerować „zbiór zewnętrzny" — fabrykacja, zakazana;
(c) użyć realnego, opublikowanego payloadu, który już jest w repo z URL-em,
datą pobrania i licencją. Wybrano (c).

**Co to kupuje mimo braku sieci.** Kontrakt kotwicy jest kompletny i
przetestowany: odmowa przy zmianie payloadu, cytat składany z prowieniencji
zbioru (nie z pola tekstowego), realna falsyfikowalność i replay MATCH.
Dodanie zbioru pobranego na żywo to dopisanie jednego wpisu do
`EXTERNAL_ANCHORS` — reszta łańcucha jest już wykonana.

---

## D-012 (2026-09-12, P2.3) — Odcisk payloadu przez `fnv1a`, nie SHA-256

**Decyzja.** Integralność przypiętego payloadu pilnuje
`fnv1a(canonicalJson(payload))` — ta sama jedna prymitywa odciskowa, której
używa całe repo (`core/events/hash.ts`).

**Dlaczego nie SHA-256.** To jest detektor ZMIANY, nie gwarancja
kryptograficzna, i tak jest nazwany w kodzie. Payload jest wersjonowany w
gicie, który sam zapewnia integralność treści; zadaniem odcisku jest wyłapać
CICHĄ EDYCJĘ przypiętej wartości. Wprowadzenie SHA-256 tylko tutaj dałoby drugi
system haszowania w repo i — w przeglądarce — asynchroniczne WebCrypto w
ścieżce, która jest czysta i synchroniczna.

**Gdzie SHA-256 JEST użyte i słusznie.** Dla danych POZA repo:
`scripts/fetch-atom-bohr-nist-fixtures.mjs` i `compute/cms_zmumu_worker.py`
weryfikują SHA-256 pobranych plików. Ten podział jest świadomy, nie
niekonsekwencją.

---

## D-013 (2026-09-12, P2.3) — Kotwica podpięta do `#/evidence`, nie do nowego ekranu

**Decyzja.** Kotwica renderuje się w `EvidenceShowcaseScreen`.

**Dlaczego tam.** Własna dokumentacja tego ekranu mówi, że jest „dla
zewnętrznej publiczności: audytora R&D, regulatora, inwestora" — komisja
grantowa to ta publiczność. Nowy ekran dodałby powierzchnię bez odbiorcy.

**Jedna właściwość, która przy tym powstała.** Reszta ekranu zależy od tego, czy
coś jest w Pamięci Naukowej, więc na świeżej przeglądarce jest pusta. Kotwica
jest przypięta w repo, więc jest widoczna ZAWSZE — recenzent otwierający
`#/evidence` bez żadnych zapisanych danych i tak widzi pełny łańcuch.

---

## D-014 (2026-09-12, P2.3/P3.2) — Odcisk payloadu jest LITERAŁEM, nie wyliczeniem

**Decyzja.** `ExternalAnchor.payloadDigest` to napis zapisany w źródle.

**Dlaczego — to jest opis realnego błędu, który sam popełniłem.** Pierwsza
wersja deklarowała kotwice tak:

```ts
export const EXTERNAL_ANCHORS = [
  { ...molecularWeightAnchor, payloadDigest: anchorPayloadDigest(molecularWeightAnchor.payload) },
];
```

Odcisk był więc liczony Z PAYLOADU przy ładowaniu modułu — czyli **zawsze się
zgadzał** i nie mógł wykryć niczego. Suma kontrolna była pozorna.

**Czego nie złapał test, a co złapało wykonanie.** Test jednostkowy
„ODMAWIA, gdy payload został zmieniony" przechodził, bo konstruował obiekt z
NOWYM payloadem i STARYM odciskiem — sprawdzał mechanizm, który w produkcji był
martwy. Złapał to dopiero realny scenariusz dryfu uruchomiony przez
`scripts/repro-demo.mjs`: po cichej edycji `MolecularWeight` na `999.99`
skrypt zgłosił rozbieżność WARTOŚCI, ale kotwica **nie odmówiła** — bo odcisk
przeliczył się razem z podmianą.

**Co z tego wynika metodologicznie.** Test, który porównuje wyliczenie z
wyliczeniem, nie sprawdza niczego. Dlatego doszła asercja na LITERAŁ
(`expect(anchor.payloadDigest).toBe('470de276')`) — edycja przypiętego JSON-a
czerwieni test i wymusza świadomą decyzję, zamiast cicho przyjąć nową wartość
jako „zewnętrzną obserwację".

**Koszt przyjęty świadomie.** Aktualizacja zbioru wymaga zmiany w TRZECH
miejscach (odcisk, `EXPECTED` w skrypcie, asercja w teście). To jest cena za to,
że obserwacja zewnętrzna nie zmienia się przez przypadek.
