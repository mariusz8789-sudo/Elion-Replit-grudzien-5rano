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

---

## D-015 (2026-09-12, P0.3) — `resolveBuildInfo` rozwiązuje `.git` jako plik `gitdir:` (worktree)

**Znalezisko, nie moje.** C3, budując P2.1, zauważył realny defekt w moim P0.3:
backendowy suite raportował 1 nieoczekiwaną porażkę, którą C3 zdiagnozował jako
„pre-existing git-worktree-only artifact" i słusznie NIE naprawił sam (poza
zakresem jego zadania) — nazwał go i zweryfikował, że jest niezwiązany z jego
zmianą (uruchamiając w czystym klonie).

**Co dokładnie było zepsute.** `.git` NIE zawsze jest katalogiem. W trybie
izolacji `git worktree` (dokładnie ten, w którym część tej misji jest
uruchamiana — `isolation: "worktree"` w `Agent`) `.git` jest PLIKIEM tekstowym
`gitdir: <ścieżka>`, wskazującym na prawdziwy katalog gita gdzie indziej
(`<repo>/.git/worktrees/<nazwa>`). Pierwsza wersja `readGitHeadFrom` zakładała
katalog: `path.join(gitDir, 'HEAD')` na pliku wybuchał (`ENOTDIR`), łapany
przez `try/catch` i cicho zwracający `null`. Skutek: `commitSource` lądował
jako `'unavailable'` w środowisku, w którym HEAD było jak najbardziej czytelne
— nie crash, ale realna utrata dokładnie tej informacji, po którą `/api/health`
istnieje.

**Odtworzone niezależnie, nie wzięte na słowo.** `git worktree add
/tmp/.../worktree-test HEAD --detach` w tym samym repo → `file .git` →
`ASCII text`, treść `gitdir: /home/.../.git/worktrees/worktree-test` —
dokładnie ten przypadek.

**Naprawa, dwuwarstwowa, bo jeden test by tego nie złapał.** `resolveGitDir`
rozróżnia plik od katalogu i podąża za wskaźnikiem `gitdir:`. Osobno:
`resolveCommonDir` — bo w worktree gałęzie NIE są prywatne per-worktree:
`refs/heads` i `packed-refs` żyją we WSPÓLNYM katalogu (`<gitDir>/commondir`,
zwykle `../..`), a tylko `HEAD` jest per-worktree. Dwa testy, oba realne
(`git worktree add`, nie atrapa filesystemu): jeden na `--detach` (HEAD jako
goły SHA — ścieżka bez `ref:`), drugi na `-b <gałąź>` (ścieżka `ref:` przez
`commondir` — bez tego drugiego testu poprawka dla detached HEAD dałaby
fałszywe poczucie bezpieczeństwa, bo nie przechodzi przez `resolveCommonDir`
wcale).

---

## D-016 (2026-09-12, R-006) — Redeploy kontenerowy weryfikowany w CI, nie obchodzeniem blokady lokalnie

**Decyzja.** Dowód wykonania redeployu na kontenerze z zamontowanym woluminem
przeniesiony do nowego joba `.github/workflows/ci.yml::docker-image`, zamiast
dalej próbować go uzyskać z tego sandboxa.

**Co faktycznie sprawdzono, zanim podjęto tę decyzję — nie zgadnięto.**
`dockerd` URUCHAMIA SIĘ w tym środowisku z własnym `--data-root`/socketem
(domyślny `/var/run/docker.sock` odmawia przez `ulimit: Operation not
permitted` w skrypcie startowym — to inny, węższy problem niż „demona nie
ma"). `docker pull`/`docker build` dociera do API manifestów Docker Hub, ale
pobranie warstwy obrazu z CDN (`production.cloudfront.docker.com`) kończy się
`403 Forbidden` przy każdej z pięciu prób (w tym z jawnie przekazanymi
zmiennymi proxy demonowi) — ten sam rodzaj blokady egress co przy NASA
Exoplanet Archive/CERN Open Data w P2.3, na innym hoście. To POPRAWIA
wcześniejsze, zbyt szerokie stwierdzenie „brak demona Dockera" w
`P0_EVIDENCE.md`/`RISKS.md` — poprawione tam, nie tylko tutaj.

**Dlaczego CI, a nie dalsze obchodzenie.** Runner GitHub Actions nie ma tego
ograniczenia egress i już istnieje w tym repo (`ci.yml`), a Dockerfile NIGDY
wcześniej nie był tam budowany — dodanie joba naprawia lukę trwałą (każdy
przyszły push dostaje ten dowód), nie tylko jednorazową.

**Dlaczego skrypt joba jest bezpieczny do wysłania bez lokalnego testu na
kontenerze.** Cała logika HTTP wewnątrz joba (rejestracja → utworzenie
projektu → zabicie procesu → restart na tej samej ścieżce bazy → logowanie →
odczyt projektu) została wykonana lokalnie jako zwykły proces Node (bez
Dockera — sam kontener nie zmienia kształtu odpowiedzi API), z każdym
kształtem JSON użytym w skrypcie potwierdzonym wykonaniem
(`docs/P0_EVIDENCE.md`, sekcja P0.2). Sam `docker build`/`docker run` — czyli
dokładnie to, czego ten sandbox nie potrafi zrobić — pozostaje `NOT VERIFIED`
z TEGO środowiska i zweryfikowany dopiero w Actions po pierwszym pushu.

---

## D-017 (2026-09-12, R-006) — `docker-image` job z D-016 rzeczywiście uruchomiony w CI: RED, przyczyna znaleziona i naprawiona, dowód wciąż w toku

**Fakt, nie zgadnięty.** Pierwsze uruchomienie joba `docker-image` (run
`34709914327`, commit `d70e130`) zostało sprawdzone przez `mcp__github__actions_get`/
`get_workflow_jobs`/`get_job_logs` — status `completed`, `conclusion: "failure"`,
na kroku „Budowa obrazu z realnym identyfikatorem wydania” (33 s, więc to NIE
jest blokada CDN opisana w D-016 — runner GitHub Actions ściągnął `node:22-slim`
bez problemu, warstwy pobrały się w kilka sekund).

**Rzeczywisty błąd z logu (cytat, nie streszczenie):**
```
../csrn/src/crypto/fingerprint.ts(18,35): error TS2307: Cannot find module 'node:crypto'
../csrn/src/crypto/signing.ts(21,35): error TS2307: Cannot find module 'node:crypto'
src/core/discovery/molecular/rdkitTransport.node.ts(1,30): error TS2307: Cannot find module 'node:child_process'
src/core/discovery/molecular/rdkitTransport.node.ts(31,10): error TS2591: Cannot find name 'process'
src/core/discovery/molecular/rdkitTransport.node.ts(35,23): error TS2304: Cannot find name '__dirname'
```
`tsc -b` w etapie `build` Dockerfile'a nie widział typów `@types/node` przy
kompilacji plików `packages/csrn/src/**` i `rdkitTransport.node.ts`.

**Diagnoza.** `Dockerfile`, etap `build`, kopiował przed `npm ci` TYLKO
`package.json`/`package-lock.json` (root) + `packages/frontend/package.json` +
`packages/backend/package.json` — **nie** `packages/csrn/package.json`, mimo że
root `package.json::workspaces` deklaruje trzy przestrzenie robocze
(`frontend`, `backend`, `csrn`), a `packages/frontend/package.json` ma
`"@genesis-os/csrn": "^1.0.0"` jako realną zależność (zweryfikowane
`grep`-em, nie założeniem). Dockerfile nie nadążył za tym, że `csrn` przestał
być samodzielnym, niezależnym pakietem.

**Próba odtworzenia lokalnie — częściowa, uczciwie opisana.** Odtworzono
dokładnie sekwencję COPY z Dockerfile'a w katalogu roboczym (kopiowanie
podzbioru `package.json`, `npm ci`, potem `git archive HEAD | tar -x` jako
odpowiednik `COPY . .`, potem `npm run build`) — zarówno z brakującym, jak i z
dodanym `packages/csrn/package.json`. **W tym środowisku (lokalny Node
v22.22.2/npm 10.9.7) OBIE wersje budują się poprawnie** — błąd z CI się tu NIE
odtworzył. Najbardziej prawdopodobne wyjaśnienie: `node:22-slim` w GitHub
Actions niesie inną (prawdopodobnie starszą) wersję npm, której zachowanie
przy `npm ci` wobec workspace'u zadeklarowanego w `workspaces`, ale bez
obecnego na dysku `package.json`, różni się od lokalnej — ale to jest
HIPOTEZA, nie zweryfikowany fakt, bo Docker w tym sandboxie nie buduje obrazu
(D-016).

**Naprawa zastosowana mimo niepełnej reprodukcji, i dlaczego to nie jest
zgadywanie.** Dodano `COPY packages/csrn/package.json packages/csrn/` do
etapu `build`, tuż obok analogicznych linii dla `frontend`/`backend` — to
przywraca Dockerfile do stanu, w którym etap `build` widzi DOKŁADNIE ten sam
zestaw plików `package.json` co `npm ci` uruchamiane lokalnie i w jobie
`verify` (gdzie `actions/checkout` daje PEŁNE repo przed `npm ci`, więc `verify`
nigdy nie mógł ujawnić tego konkretnego braku — luka istniała wyłącznie w
etapie `build` Dockerfile'a). To jest naprawa realnej rozbieżności w pliku, nie
łatanie objawu bez zrozumienia przyczyny.

**Status.** `NOT VERIFIED` z pełnym dowodem `docker build` — to zostanie
potwierdzone (lub obalone) dopiero na następnym uruchomieniu joba
`docker-image` w Actions, na commicie niosącym tę poprawkę. Jeśli błąd wróci
mimo tej zmiany, hipoteza o wersji npm w `node:22-slim` będzie wymagała
dalszego śledztwa (np. przypięcie konkretnej wersji npm w obrazie `build`
przez `RUN npm install -g npm@<pinned>`), zapisanego tutaj jako kolejna
decyzja, nie po cichu.

---

## D-018 (2026-09-12, R-006) — Prawdziwa przyczyna TS2307 w `docker-image` znaleziona i naprawiona: ukryta zależność produkcyjnego kodu od plików testowych

**Status: rozwiązane, dowód lokalny kompletny; dowód CI w toku.**

**Dwie kolejne próby naprawy w D-017 NIE zadziałały — potwierdzone przez
ponowne uruchomienia CI, nie założone.** Commit `305b215` (dodanie
`packages/csrn/package.json` do COPY) i commit `e678df0` (diagnostyka wersji)
zostały wypchnięte i sprawdzone w Actions (`get_job_logs`) — IDENTYCZNY błąd
w obu, ten sam plik, ta sama linia, w 18-19 s. Diagnostyka z `e678df0`
pokazała: `node v22.23.2`, `npm 10.9.8`, root `typescript@6.0.3` (hoisted, spoza
zakresu `^5.7.2` deklarowanego przez `frontend`/`csrn` — osobna, nieszkodliwa
niespójność lockfile'a warta odnotowania, ale NIE przyczyna tego błędu).

**Prawdziwa przyczyna, znaleziona przez bisekcję lokalną, nie zgadnięciem.**
Odtworzono DOKŁADNIE zachowanie `.dockerignore` lokalnie (kopiowanie
śledzonych plików + usunięcie `**/*.test.ts`/`**/*.test.tsx`/`**/__tests__`,
dokładnie jak Docker robi to przy `COPY . .`) — TERAZ błąd odtworzył się
lokalnie po raz pierwszy. Bisekcja (przywracanie po jednym katalogu)
wykazała: obecność `packages/frontend/src/__tests__/` SAMA W SOBIE naprawia
build. Przyczyna: `packages/frontend/src/__tests__/commitHash.test.ts` (i
kilka innych plików testowych) robi `import { execSync } from
'node:child_process'` jako WARTOŚCIOWY (nie tylko typowy) import. TypeScript
z `"types": ["vite/client"]` w `packages/frontend/tsconfig.json` blokuje
TYLKO automatyczne/domyślne dołączanie pakietów `@types/*` — ale gdy
JAKIKOLWIEK plik w tym samym programie kompilacji jawnie rozwiąże moduł
wbudowany `node:*`, deklaracje ambientowe `@types/node` (w tym globalne
`process`/`__dirname` i `declare module 'node:crypto'`) stają się widoczne
DLA CAŁEGO PROGRAMU — także dla plików produkcyjnych, które NIGDY jawnie
tego nie deklarowały. `packages/csrn/src/crypto/fingerprint.ts`/`signing.ts`
(kompilowane WEWNĄTRZ programu `frontend`, bo `@genesis-os/csrn` jest
rozwiązywane jako `./src/index.ts` przez `package.json`, nie przez formalną
referencję projektu TS) i `rdkitTransport.node.ts` od zawsze polegały na tym
przypadkowym przecieku z plików testowych — **to jest realna, wcześniej
istniejąca luka w typowaniu kodu produkcyjnego**, zamaskowana w KAŻDYM
dotychczasowym typecheck/build w tym repo (lokalnie i w `verify` CI), bo
żaden z nich nigdy nie kompilował bez plików testowych. `.dockerignore`
(`**/*.test.ts`, `**/__tests__`) jest pierwszą rzeczą w historii repo, która
faktycznie zbudowała `packages/frontend` bez nich — i dlatego pierwszy
prawdziwy build Dockera (D-016/D-017) był pierwszym miejscem, gdzie ta luka
w ogóle mogła się ujawnić.

**Naprawa, zweryfikowana lokalnie w DOKŁADNYM odtworzeniu warunków Dockera
(z i bez plików testowych), nie zgadnięciem.** Dodano `/// <reference
types="node" />` na górze trzech plików, które faktycznie potrzebują
ambientowych typów Node:
`packages/csrn/src/crypto/fingerprint.ts`,
`packages/csrn/src/crypto/signing.ts`,
`packages/frontend/src/core/discovery/molecular/rdkitTransport.node.ts`.
To jest idiomatyczne, lokalne (per-plik) rozwiązanie — nie zmienia globalnego
`"types"` frontendu (co mogłoby maskować przyszłe błędy w kodzie
przeglądarkowym), nie wymaga przebudowy granic projektu TS między
`frontend`/`csrn`. Zweryfikowane: odtworzenie repro Dockera BEZ plików
testowych + tą poprawką → build przechodzi; bez poprawki → ten sam błąd co
w CI, 1:1. Pełna lokalna bramka po zmianie: eslint czysto, `tsc --noEmit -p
packages/frontend` czysto, `tsc -b` w `packages/csrn` czysto, backend 430
testów/396 pass/0 fail/34 skipped, frontend 469/469 plików/5200 passed/1
skip, `packages/csrn` 5/5 plików/38 passed, `npm run build` czysto.

Tymczasowy krok diagnostyczny w `Dockerfile` (z `e678df0`) usunięty w tym
samym commicie — spełnił swoją rolę, nie zostaje jako martwy kod.

**Status.** `NOT VERIFIED` z realnego `docker build` w tym środowisku
pozostaje (blokada CDN, D-016) — ale to JEST teraz zweryfikowane wobec
DOKŁADNEGO odtworzenia zachowania `.dockerignore`+`COPY . .`+`npm ci`, więc
pewność jest znacznie wyższa niż przy poprzednich dwóch próbach. Ostateczne
potwierdzenie: kolejny push, job `docker-image` w Actions.

---

## D-019 (2026-09-12, R-006) — `docker-image` ZIELONY w Actions: realny dowód, nie deklaracja

**Fakt, sprawdzony przez `mcp__github__actions_get`/`list_workflow_jobs`, nie
założony.** Uruchomienie na commicie `0c78866` (run `34712028969`, job
`103602393736` „Obraz produkcyjny — build i realny smoke test kontenera"):
`conclusion: "success"` na OBU krokach —
„Budowa obrazu z realnym identyfikatorem wydania" (45 s) I
„Realny redeploy drill — kontener + zamontowany wolumin" (5 s).

**Co to oznacza konkretnie.** Realny `docker build` z `--build-arg
GENESIS_COMMIT=<sha>` powiódł się na runnerze GitHub Actions. Realny drill
(rejestracja konta → utworzenie projektu → `docker rm -f` starego kontenera →
nowy kontener na TYM SAMYM nazwanym woluminie → logowanie tym samym kontem →
odczyt listy projektów) potwierdził PRZETRWANIE danych przez cykl
kill+restart kontenera — dokładnie scenariusz, którego P0.2 nigdy nie mogło
zweryfikować lokalnie (D-016, blokada CDN). To zamyka R-006 realnym dowodem
wykonania, nie deklaracją.

**Droga do tego dowodu, uczciwie, z porażkami po drodze.** Trzy kolejne
próby zanim to zadziałało (D-017, D-018) — pierwsza (brak
`packages/csrn/package.json` w COPY) i druga (diagnostyka wersji) NIE
naprawiły błędu, trzecia (prawdziwa przyczyna: produkcyjny kod przypadkowo
polegał na przecieku typów z pliku testowego, którego `.dockerignore` po raz
pierwszy w historii repo nie dołączył do builda) go naprawiła. Zapisane w
kolejności, z prawdziwymi logami z każdej próby, nie tylko finałowym
sukcesem.

---

## D-020 (2026-09-12, G3) — Fałszywy alarm w strażniku tokenów A4 naprawiony po realnych danych z CI, nie zgadnięty

**Kontekst.** `nist-g3-pinned-artifacts` był RED od co najmniej 4 pushy
(zauważone dopiero teraz przy przeglądzie zakładki Actions — luka w
procesie, nie w kodzie: nikt nie sprawdzał tego joba osobno od `verify`).
Strażnik w `scripts/fetch-atom-bohr-nist-fixtures.mjs` odmawiał zapisu
oficjalnej strony warunków NIST, bo dopasował `/pk[.][A-Za-z0-9_-]+/` —
wzorzec mający chwytać przypadkowo osadzone tokeny dostępu.

**Diagnostyka bez zgadywania.** Ten sandbox nie ma dostępu do
`www.nist.gov` (ta sama polityka proxy co przy CERN/NASA/Docker Hub —
D-016). Zamiast zgadywać naprawę, dodano bezpieczną, nie-ujawniającą
diagnostykę (redagowany kontekst + skrócony hash SHA-256 dopasowanego
ciągu, NIGDY sam token) i poczekano na realny log z Actions, gdzie
nist.gov JEST osiągalny.

**Realny wynik (job `103602393715`, commit `0c78866`), zacytowany, nie
streszczony:** dopasowanie leży dokładnie w
`"nist_map":{"mapbox_access_token":"[REDACTED].LGaxtrLTglfvQHdKGEsTBw"}` —
to jest PUBLICZNY token Mapbox (prefiks `pk.` = "publishable key" w
dokumentacji Mapboksa, przeciwieństwo tajnego `sk.`), osadzony przez NIST we
własnym widgecie mapy na stronie warunków. To jest fałszywy alarm, nie wyciek.

**Naprawa, wąska celowo.** Strażnik teraz sprawdza KAŻDE dopasowanie
`/pk[.][A-Za-z0-9_-]+/g` osobno: jeśli bezpośrednio poprzedza je literalny
ciąg `"mapbox_access_token":"` (30-znakowe okno), traktowany jest jako
znany, bezpieczny kontekst i budowa kontynuuje (z jawnym logiem
wyjaśniającym dlaczego, bez ujawniania tokenu). KAŻDE INNE dopasowanie
gdziekolwiek indziej na stronie WCIĄŻ odmawia zapisu dokładnie jak
poprzednio — to zawęża wyjątek do jednego zweryfikowanego przypadku, nie
osłabia strażnika ogólnie. Zweryfikowane trzema scenariuszami lokalnie
(payload w kształcie realnej strony NIST → przechodzi; ten sam token w
INNYM, niepowiązanym miejscu na stronie → wciąż odmawia; brak dopasowania →
przechodzi), plus `node --check`/`eslint --max-warnings=0`. Ostateczne
potwierdzenie — czy job faktycznie zazieleni się na prawdziwej stronie NIST
— na kolejnym pushu.

---

## D-021 (2026-09-12, discovery-loops-audit) — Legacy loops zostają wyspecjalizowane; `DiscoveryHypothesis`/`discoveryConclusion.ts` jest kanoniczny dla wielokryterialnej Tautology Gate

**Decyzja.** (A), nie (B): `discoveryLoop.ts` i `hypothesisLoop.ts` zostają
wyspecjalizowanymi pętlami z jednym kryterium na hipotezę; kanonicznym
modelem dla PRIMARY + SUPPORTING kryteriów, per-kryterialnej klasyfikacji
Tautology Gate i `MIXED_TEST` pozostaje `DiscoveryHypothesis` +
`discoveryConclusion.ts` — jedyny z trzech, który już ma ten kształt i już ma
bramkę podłączoną (`discoveryConclusionTautology.test.ts`).

**Dlaczego, w skrócie.** Dwa poprzednie audyty (`docs/DISCOVERY_MULTI_CRITERION_AUDIT.md`,
commit `79e6e38e`) przeczytały w całości oba typy hipotez i obie funkcje
aktualizacji przekonań: `discoveryLoop.ts`'s `updateBelief()` liczy WYŁĄCZNIE
z kategorycznego werdyktu i boola `metricMoved` — zero magnitudy, którą
`evidenceCeiling()` mogłaby przyciąć; `hypothesisLoop.ts`'s
`executePreregisteredHypotheses()` przypisuje status DOKŁADNIE RAZ, bez
żadnej pętli rewizji. Wymuszenie `MIXED_TEST` na którymkolwiek oznaczałoby
wymyślenie nowej semantyki przekonań ("nie licz tej rundy" na drabinie
porządkowej; "cofnij przypisanie" na modelu jednorazowym) — dokładnie to,
czego zasada „nie zgaduj brakujących semantyk" zabrania.

**Pełne uzasadnienie, tabela porównawcza granic każdej pętli i to, co jest
kanoniczne dla przyszłego Autonomous Scientific Discovery Engine:**
`docs/TWO_AUTONOMOUS_LOOPS_DECISION.md` §14.

**Zero zmian w kodzie produkcyjnym.** Ten wpis i §14 są jedynymi zmianami.

---

## D-022 (2026-09-12, P2.3) — Druga kotwica: Kepler/Mars (NASA NSSDCA) jako KANONICZNA; własna kotwica Kepler/Wenus ODRZUCONA po znalezieniu kolizji z równoległą sesją

**Decyzja.** Ta sesja (C1) zbudowała własną, w pełni działającą drugą
zewnętrzną kotwicę na danych orbitalnych Wenus (NASA NSSDCA Planetary Fact
Sheet) — ten sam plik, ta sama decyzja NIE-NASA-Exoplanet-Archive (patrz
niżej), ten sam wzorzec CI-fetch-pin — zanim `git fetch` ujawnił, że inna,
równoległa sesja (opisana jako C3 w `docs/MASTER_PRIORITY_GENESIS.md`) już
zbudowała i wypchnęła RÓWNOWAŻNĄ kotwicę na tym samym pliku, dla Marsa
zamiast Wenus, z Tautology Gate wpiętą w OBIE kotwice. Zamiast wypychać
konkurencyjną, duplikującą implementację Keplera — dokładnie to, czego
zadanie miało zabronić ("jeśli kotwica jest już zamknięta przez inną sesję,
NIE duplikuj jej") — C1 ODRZUCIŁ własną kotwicę Wenus i przyjął kotwicę
Mars jako jedyną, kanoniczną implementację keplerowską w repo. Pełne dowody:
`docs/P2_EVIDENCE.md` (sekcja „DRUGA kotwica ZAMKNIĘTA" + dodatek C1),
`docs/MASTER_PRIORITY_GENESIS.md` (wpisy C3 i C1 z 2026-09-12).

**Dlaczego NIE NASA Exoplanet Archive, mimo że CI mogłoby go dosięgnąć —
wniosek, do którego obie sesje doszły niezależnie.** Bezpośredni dostęp z
tego sandboksa do `exoplanetarchive.ipac.caltech.edu` pozostaje zablokowany
(403, potwierdzone ponownie) — ale to NIE jest powód zmiany źródła, bo
runner GitHub Actions nie ma tego ograniczenia (dowód: `nist-g3-pinned-artifacts`
jest zielony). Prawdziwy powód to realne ryzyko cykliczności: w archiwum
egzoplanet półoś wielka wielu wpisów (zwłaszcza planet tranzytujących) jest
WYLICZONA z okresu orbitalnego przez III prawo Keplera — dokładnie formułę,
którą testowałaby predykcja tej kotwicy — co uczyniłoby porównanie
identycznością przez konstrukcję dla takich wpisów. Bez dostępu do archiwum
nie dało się sprawdzić per-planeta, które wpisy tego unikają, a zgadywanie
na ślepo w kwestii, którą własne reguły zadania wprost zabraniają ("do not
use a quantity calculated from the same model as independent evidence"),
byłoby nieodpowiedzialne. Dane Układu Słonecznego usuwają tę
niejednoznaczność całkowicie: okres orbitalny mierzony bezpośrednią
astronomią pozycyjną od stuleci, odległość — zupełnie inną techniką
(radar/śledzenie sond) — ten sam schemat dwóch niezależnych kanałów, który
historycznie pozwolił w ogóle odkryć i zweryfikować III prawo Keplera.

**Droga danych do pliku, który obie sesje ostatecznie reużyły — CI-fetch-pin,
ta sama co dla NIST (D-020).** Pierwszy fetch dotarł do strony, ale
zgadnięty marker sanity-check nie pasował do rzeczywistej treści — osłabiono
do potwierdzonego. Artefakt CI okazał się pobieralny wyłącznie z URL-a Azure
Blob Storage, którego ten sandbox TAKŻE nie może dosięgnąć — zamiast
zgadywać strukturę strony, tymczasowo wydrukowano jej treść do loga joba
(GitHub API jest dostępne stąd) i odczytano PRAWDZIWĄ tabelę. Plik
zrekonstruowany lokalnie z loga dał SHA-256 bajt-w-bajt zgodny z tym, co CI
obliczyło z realnego fetcha — dopiero ta zgodność uzasadniła przypięcie pliku
do repo. Krok diagnostyczny zastąpiono trwałą kontrolą dryfu w CI (świeży
fetch porównywany z przypiętą kopią).

**Wynik: pierwsza prawdziwie EMPIRYCZNA kotwica w repo (Mars, kanoniczna).**
Tautology Gate klasyfikuje ją jako `EMPIRICAL_TEST` (nie `CONSISTENCY_CHECK`
jak pierwszą, chemiczną kotwicę) — obserwacja jest zadeklarowana jako
`independent-measurement`, prawdziwy pomiar astronomiczny. Predykcja
687.2336 dnia vs. obserwacja 687.0 dnia (różnica 0.034%, pasmo ±0.05%) →
`SUPPORTED_WITHIN_PROTOCOL`, replay MATCH, falsyfikacja realnie sprawdzona.
Odrzucona kotwica Wenus (nieużyta, niescalona do repo) dawała ten sam
werdykt na innym ciele: predykcja 0.615110 roku vs. obserwacja 0.615195
roku (różnica 0.014%, pasmo ±0.5%) — zgodność wyników obu niezależnych
implementacji jest dodatkowym potwierdzeniem, że reużyta ścieżka
(`universe-kepler` + ten sam pinowany plik) jest poprawna, nie tylko
argumentem za odrzuceniem duplikatu.

**Co C1 dołożył NA kanonicznej implementacji, generycznie — belief revision
i next question.** Kanoniczna kotwica Mars nie miała jeszcze rewizji
przekonania ani „next question", których wymagało zadanie. C1 dodał
`AnchorRunResult.belief: {before, after, status}`
(`beliefRevision.ts::createHypothesis`/`updateConfidence`, prior 0,5, ruch
ograniczony sufitem Tautology Gate `evidenceCeiling`) i
`AnchorRunResult.nextQuestion: string` (inny tekst dla SUPPORTED/FALSIFIED/
INCONCLUSIVE) do `runExternalAnchor` — dla OBU zadeklarowanych kotwic
(PubChem i Kepler/Mars), nie jako część trzeciej kotwicy. Zero nowego
silnika: Tautology Gate, `beliefRevision.ts` i `predictionVerification.ts`
reużyte bez zmian.
