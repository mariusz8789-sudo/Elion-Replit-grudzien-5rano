# P0 EVIDENCE — Genesis OS, pakiet operacyjny

Zasada dowodowa tego dokumentu: **żadnego twierdzenia bez komendy, wyjścia i
hasha commita.** Gdzie czegoś nie zweryfikowano wykonaniem, stoi `NOT VERIFIED`
wraz z powodem — i nie jest to prezentowane jako zrobione.

Środowisko wszystkich dowodów: `node v22.22.2`, Linux 6.18.44, repo
`Elion-Replit-grudzien-5rano`, gałąź `claude/genesis-autonomous-completion-95bt4e`.

---

## P0.1 — Runtime Node: deklaracja zgodna z rzeczywistością + fail-fast

**Status: DONE (zweryfikowane wykonaniem).**

### Co było zepsute (stan przed zmianą, commit `be5f222`)

| Miejsce | Deklarowało | Rzeczywistość kodu |
|---|---|---|
| `package.json` | `engines.node: ">=18"` | `node:sqlite` wymaga `>=22.5.0` |
| `packages/backend/package.json` | brak `engines` | j.w. |
| `packages/frontend/package.json` | brak `engines` | j.w. |
| `packages/csrn/package.json` | brak `engines` | j.w. |
| **`.replit`** | **`modules = ["nodejs-20", …]`** | **na Node 20 backend nie startuje wcale** |
| `Dockerfile` | `node:22-slim` | OK (jedyne miejsce zgodne) |
| `.github/workflows/ci.yml` | `node-version: 22` | OK |

`.replit` to znalezisko poza zakresem polecenia i najgroźniejsze z całej
tabeli: to JEDYNE miejsce, które nazywało konkretny runtime platformy — i
nazywało taki, na którym `import { DatabaseSync } from 'node:sqlite'` zawodzi
przy rozwiązywaniu modułu. Operator zobaczyłby `ERR_UNKNOWN_BUILTIN_MODULE`
bez żadnej wskazówki.

### Skąd podłoga 22.5.0 — u źródła, nie z pamięci

```bash
$ curl -sS https://nodejs.org/api/sqlite.json | python3 -c '<parse meta.added>'
sqlite | added: ['v22.5.0']
DatabaseSync | added: ['v22.5.0']
close | added: ['v22.5.0']
exec | added: ['v22.5.0']
```

### TDD — test na czerwono PRZED implementacją

```bash
$ cd packages/backend && node --test src/nodeRuntime.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/nodeRuntime.mjs'
# tests 1 | pass 0 | fail 1
```

Test złapał realny błąd w mojej pierwszej implementacji (patrz `DECISIONS.md`
D-003): sonda oparta na `module.builtinModules` zwracała `false` na
działającym Node 22.22.2, bo ta lista celowo pomija moduły eksperymentalne.
Weszłaby do repo jako „naprawa", która BLOKUJE poprawną produkcję.

```bash
$ node -e "const m=require('node:module'); console.log(m.builtinModules.includes('sqlite'), m.isBuiltin('node:sqlite'))"
false true
```

### Po implementacji — zielono

```bash
$ node -v
v22.22.2

$ cd packages/backend && node --test src/nodeRuntime.test.mjs
# tests 8 | suites 0 | pass 8 | fail 0 | skipped 0
```

Osiem testów pokrywa: parsowanie wersji (w tym odrzucenie nieparsowalnej jako
`false`, fail-closed), granicę 22.4.1/22.5.0, empiryczną sondę zdolności,
czytelność komunikatu (bez stack trace), oba tryby porażki, podłogę we
WSZYSTKICH czterech manifestach, `nodejs-NN` w `.replit` oraz to, że
każdy udokumentowany punkt wejścia procesu idzie przez bramkę.

### Dowód działania fail-fast na żywym procesie

```bash
$ node -e "import('./src/nodeRuntime.mjs').then(({assertSupportedNodeRuntime}) =>
    assertSupportedNodeRuntime({ version: 'v20.19.0', sqliteAvailable: false }))"
GENESIS RUNTIME BLOCKED
Wymagany Node >= 22.5.0; znaleziono v20.19.0.
Powód: trwały magazyn Genesis (konta, projekty, Serie Prób) stoi na wbudowanym module node:sqlite,
który pojawił się dopiero w Node 22.5.0. Na starszym runtimie import node:sqlite zawodzi
przy rozwiązywaniu modułu, więc backend nie wystartuje w ogóle.
Co zrobić: podnieś runtime (obraz node:22-slim, actions/setup-node node-version: 22, .replit modules = ["nodejs-22"]).

$ echo $?
1
```

### Dowód, że realny start przechodzi przez bramkę

```bash
$ GENESIS_DB_PATH=:memory: PORT=0 node packages/backend/src/start.mjs
{"t":"2026-09-12T14:33:23.987Z","level":"info","msg":"runtime_ok",
 "detail":"Node v22.22.2 — runtime OK (node:sqlite dostępny)."}
```

### Regresja całego backendu po zmianie

```bash
$ npm run test --workspace=packages/backend
# tests 404 | suites 92 | pass 370 | fail 0 | skipped 34
```

(34 skipy backendu są policzone i rozstrzygnięte w `docs/TEST_SKIPS.md` — pakiet P1.1.)

### NOT VERIFIED w tym punkcie

- **Istnienie modułu `nodejs-22` w rejestrze Replita.** Nazwa zgodna z
  konwencją `nodejs-NN`, ale nie mam stąd dostępu do rejestru platformy.
  Szczegóły i skutek: `DECISIONS.md` D-005.
- **Zachowanie na realnym Node 18/20.** W tym środowisku jest tylko
  v22.22.2; oba tryby porażki są przetestowane przez wstrzyknięcie wersji i
  flagi zdolności, nie przez drugi interpreter. Bramka jest z tego powodu
  celowo fail-closed na nieparsowalnej wersji.

---

## P0.2 — Trwałość danych: redeploy i restore drill

**Status: DONE dla wymiany procesu i katalogu (zweryfikowane wykonaniem).
NOT VERIFIED dla wymiany kontenera z woluminem — brak demona Dockera.**

### Znaleziony defekt (klasa: milcząca utrata wszystkich danych)

`GENESIS_DB_PATH` domyślnie wskazywał `packages/backend/data/genesis.db` —
WEWNĄTRZ drzewa aplikacji — a `Dockerfile` nie deklarował ani `VOLUME`, ani
`GENESIS_DB_PATH`:

```bash
$ grep -n "VOLUME\|GENESIS_DB_PATH\|data" Dockerfile   # stan przed zmianą
  BRAK — żadnego VOLUME, żadnego GENESIS_DB_PATH
```

Na wdrożeniu kontenerowym to warstwa zapisywalna obrazu, wymieniana przy
KAŻDYM redeployu. Konta, projekty i Serie Prób ginęły cicho, bez błędu, przy w
pełni poprawnie działającej aplikacji.

### Dlaczego backup to `VACUUM INTO`, a nie `cp`

Baza chodzi w trybie WAL (`store.mjs:527`), więc świeże wiersze siedzą w pliku
`-wal`. Kopia samego `genesis.db` daje backup bez ostatnich transakcji — i
wygląda przy tym na poprawną. Sprawdzone, że mechanizm jest dostępny:

```bash
$ node -e "... db.exec(\"VACUUM INTO '/tmp/vac.db'\") ..."
VACUUM INTO works, roundtrip x = 42
```

Test `RESTORE DRILL` celowo NIE zamyka bazy przed snapshotem i asertuje
istnienie pliku `-wal`, żeby sprawdzać dokładnie ten tryb porażki.

### Testy (8/8), TDD

```bash
$ cd packages/backend && node --test src/dbDurability.test.mjs   # przed implementacją
# tests 1 | pass 0 | fail 1        (ERR_MODULE_NOT_FOUND)

$ node --test src/dbDurability.test.mjs                          # po implementacji
ok 1 - P0.2 classifyDbPath wykrywa ścieżkę efemeryczną wewnątrz drzewa aplikacji
ok 2 - P0.2 klasyfikacja działa na ścieżkach relatywnych i nie daje się oszukać prefiksem nazwy
ok 3 - P0.2 nazwa pliku backupu jest sortowalna leksykograficznie i rozpoznawalna
ok 4 - P0.2 retencja zostawia N najnowszych i NIGDY nie tyka plików obcych
ok 5 - P0.2 RESTORE DRILL — backup jest spójny przy WAL, a odtworzenie zwraca dane
ok 6 - P0.2 restore ODMAWIA nadpisania istniejącej bazy bez jawnej zgody
ok 7 - P0.2 Dockerfile kieruje bazę na wolumen POZA drzewem aplikacji
ok 8 - P0.2 REDEPLOY — rekord utworzony przez HTTP przeżywa wymianę procesu i katalogu
# tests 8 | pass 8 | fail 0
```

Dwa z ośmiu testów wywaliły się najpierw na MOICH asercjach, nie na produkcie,
i są poprawione w miejscu z podanym powodem: `/api/auth/login` zwraca **201**
(`api.mjs::issueSession` TWORZY sesję, więc login i register dzielą kod stanu),
a `node:sqlite` zwraca wiersze bez prototypu, więc `deepEqual` wymaga
spłaszczenia. Żadna z tych porażek nie była defektem aplikacji i tak jest
opisana.

### Dowód REDEPLOYU (cytat z testu, nie opis)

Test `P0.2 REDEPLOY`: rejestruje użytkownika i tworzy projekt przez HTTP
przeciw katalogowi wdrożenia A → `SIGTERM` → **usuwa katalog A w całości** →
startuje nowy proces z katalogu B na tej samej ścieżce danych → loguje się
kontem sprzed redeployu i odczytuje projekt sprzed redeployu. To wyklucza
dokładnie ten tryb porażki, który znaleziono: bazę przywiązaną do katalogu
wdrożenia.

### Dowód backupu, retencji i restore na ŻYWYCH danych

```bash
$ GENESIS_DB_PATH=packages/backend/data/genesis.db GENESIS_BACKUP_DIR=/tmp/bk \
    node scripts/db-backup.mjs
{"msg":"db_backup_ok","db":".../packages/backend/data/genesis.db",
 "durability":"EPHEMERAL_IN_APP_TREE","file":"/tmp/bk/genesis.db.20260912T144035Z.bak",
 "bytes":471040,"keep":14,"pruned":[]}
UWAGA: Plik bazy ... leży WEWNĄTRZ drzewa aplikacji ... zostaną utracone bez żadnego błędu.

# retencja na REALNYCH plikach: 5 snapshotów, keep=3
  snapshot 20260912T144051Z pruned: ['genesis.db.20260912T144048Z.bak']
  snapshot 20260912T144053Z pruned: ['genesis.db.20260912T144049Z.bak']
  pliki po retencji: 3

# restore + weryfikacja, że odtworzona baza NAPRAWDĘ ma dane
$ node scripts/db-restore.mjs --from .../20260912T144053Z.bak --to /tmp/restored.db
{"msg":"db_restore_ok","dbPath":"/tmp/restored.db","bytes":471040}
$ node -e "<policz tabele/users/projects w /tmp/restored.db>"
  tabele: 26 | users: 44 | projects: 40

# odmowa nadpisania żywej bazy
$ node scripts/db-restore.mjs --from ... --to /tmp/restored.db ; echo $?
GENESIS DB RESTORE FAILED
restoreDatabase: /tmp/restored.db już istnieje. Użyj overwrite: true, ...
1
$ node scripts/db-restore.mjs --from ... --to /tmp/restored.db --overwrite ; echo $?
0
```

(Uwaga metodologiczna: pierwszy pomiar tego kodu wyjścia pokazał `0`, bo
mierzył status `grepa` z potoku, nie `node`. Powtórzone bez potoku — `1`, jak
wyżej. Zapisane, bo błędny pomiar jest błędnym dowodem.)

### Dowód, że serwer MÓWI, czy dane przeżyją redeploy

```bash
$ GENESIS_DB_PATH=/tmp/vol/genesis.db PORT=0 node packages/backend/src/start.mjs
{"msg":"started","persistence":"/tmp/vol/genesis.db","durability":"PERSISTENT"}

$ PORT=0 node packages/backend/src/start.mjs          # ścieżka domyślna
{"msg":"started","persistence":".../packages/backend/data/genesis.db","durability":"EPHEMERAL_IN_APP_TREE"}
{"level":"warn","msg":"db_not_durable","durability":"EPHEMERAL_IN_APP_TREE","why":"...konta, projekty i Serie Prób zostaną utracone bez żadnego błędu..."}
```

### NOT VERIFIED w tym punkcie

- **Redeploy na poziomie kontenera z zamontowanym woluminem.**
  `docker ps` → `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`.
  Zweryfikowana jest wymiana procesu ORAZ katalogu wdrożenia; zachowanie
  montowania woluminu przez platformę — nie.

---

## P0.3 — `/api/health`: wersja, commit, realny stan bazy

**Status: DONE (zweryfikowane wykonaniem) dla kodu. Alerty i retencja logów:
PRZYGOTOWANE, NIE ZASTOSOWANE — brak wybranej platformy.**

### Co było zepsute

`version` pochodziło z `npm_package_version`, czyli stałej `'1.0.0'`, która nie
zmieniła się nigdy. Nie było ŻADNEGO identyfikatora wydania. `persistence`
raportowało `'ready'`, jeśli obiekt bazy nie był nullem — więc instancja z
otwartym, ale niedziałającym połączeniem raportowała się jako zdrowa.

### Testy (4/4), TDD

```bash
$ node --test src/buildInfo.test.mjs      # przed implementacją
# tests 1 | pass 0 | fail 1

$ node --test src/buildInfo.test.mjs      # po
ok 1 - P0.3 resolveBuildInfo bierze commit ze środowiska i NIE wymyśla go, gdy go nie ma
ok 2 - P0.3 resolveBuildInfo czyta realny HEAD tego repo
ok 3 - P0.3 checkDatabaseState NAPRAWDĘ pyta bazę, a nie sprawdza istnienia obiektu
ok 4 - P0.3 Dockerfile przyjmuje commit jako build-arg i wstrzykuje go do runtime
# tests 4 | pass 4 | fail 0
```

Test 3 pokrywa przypadek, którego stary kod nie umiał zobaczyć: baza
ZAMKNIĘTA — obiekt istnieje, zapytania nie przechodzą. Test 1 pokrywa
odrzucenie śmieciowej wartości `GENESIS_COMMIT` (nie przepuszczamy czegoś, co
nie jest 40-znakowym SHA, jako identyfikatora wydania).

### Dowód na ŻYWYM endpoincie

```bash
$ curl -sS http://127.0.0.1:35343/api/health
{ "ok": true, "version": "1.0.0",
  "commit": "0847ab78ed5a7feb7b4f34ad43741f2c0ec42d06",
  "commitShort": "0847ab7", "commitSource": "git", "builtAt": null,
  "db": { "state": "ready", "ok": true, "durability": "PERSISTENT", "persistent": true },
  "persistence": "ready", "knowledgeLabs": 15, "toolchain": [ {"id":"rdkit", ...} ] }

$ git rev-parse HEAD
0847ab78ed5a7feb7b4f34ad43741f2c0ec42d06      # identyczny — endpoint nie zmyśla
```

Świadoma decyzja bezpieczeństwa: `/api/health` jest nieuwierzytelniony, więc
**nie** ujawnia absolutnej ścieżki pliku bazy (tylko `durability`/`persistent`).
Operator dostaje ścieżkę w logu startowym.

### Alerty i retencja logów

`docs/OPS_RUNBOOK.md` §2–§3: gotowe do wklejenia konfiguracje (Uptime
Kuma/Healthchecks, Fly, Railway/Render), warunek alarmu na TREŚCI
(`db.state == "ready"`), a nie tylko na kodzie 200, oraz decyzja o retencji
(30 dni minimum, 90 dla `error`/`warn`) z uzasadnieniem. **Nie zastosowane** —
to konfiguracja hosta, a platforma nie jest wybrana i nie ma zgody na deploy.

---

## P0.4 — Audyt sekretów i kontrakt `.env.example`

**Status: DONE (zweryfikowane wykonaniem). NIC DO ROTACJI — żaden sekret nigdy
nie wyciekł do repo.**

### Audyt CAŁEJ historii (nie tylko HEAD)

```bash
$ git log --all --full-history --name-only -- '*.env' '.env' '**/.env' '*secrets*' '*credentials*' '*.pem' '*.key' '*id_rsa*'
3bce0c2  packages/backend/src/secrets.mjs
```

Jedyne trafienie to `secrets.mjs` — moduł HASZUJĄCY sekrety (czyste funkcje
`hashSecret`/`keyHint`/`looksHashed`), bez żadnych wartości:

```bash
$ git show 3bce0c2:packages/backend/src/secrets.mjs | grep -nIE "[A-Za-z0-9_/+=-]{24,}"
  (pusto — żadnej wartości wyglądającej na sekret)
```

```bash
$ git log --all -S'sk-ant-' --oneline
6479fc0 / d5d0860 / bb925f3
# Co dokładnie:  "ANTHROPIC_API_KEY=sk-ant-... npm run dev:backend"
# → literalny PLACEHOLDER w README, nie klucz.

$ git grep -nIE 'ANTHROPIC_API_KEY\s*[=:]\s*["'"'"']?[A-Za-z0-9_-]{12,}' $(git rev-list --all)
  (pusto — ta zmienna nigdy nie miała w repo wartości)

$ git grep -nIE '(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|glpat-…|xox[baprs]-…|AIza…)' -- .
  (pusto w drzewie)
$ # ten sam skan po blobach pierwszych 400 commitów historii (pierwszy przebieg)
  (pusto)
```

**Uzupełnione później, na CAŁEJ historii, nie tylko pierwszych 400** (przy
pisaniu `GRANT_READINESS_REPORT.md` — precyzja dowodu ma znaczenie dla
komisji, więc dopełniono, zamiast zostawić lukę w zasięgu):

```bash
$ git rev-list --all | wc -l
1911
$ time git rev-list --all | xargs -P4 -n50 git grep -lIE \
    '(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|sk-ant-[A-Za-z0-9_-]{20,})'
real 3m2s
(pusto — zero trafień na WSZYSTKICH 1911 commitach)
```

**Wniosek: zero rotacji.** Nie ma czego rotować — i to jest twierdzenie z
komendą i wyjściem, nie zapewnienie.

### Znaleziony defekt: `.env.example` dokumentował 5 z 25 zmiennych

```bash
$ git grep -hoE "process\.env\.[A-Z_][A-Z0-9_]*" -- packages/ scripts/ | sort -u | wc -l
  25 realnych zmiennych
$ # udokumentowanych przed zmianą: ANTHROPIC_API_KEY GENESIS_AI_MODEL
  #   GENESIS_DB_PATH GENESIS_STATIC_DIR PORT  → 5
```

Wśród 20 nieudokumentowanych były **dwie zmienne kredencjałowe**:
`GENESIS_RESEARCH_API_KEY` i `GENESIS_INSTITUTIONAL_API_KEY` (`access.mjs:79-80`).
Operator wdrażający system nie mógł wiedzieć, jakie sekrety on w ogóle
przyjmuje — a to jest pierwsze pytanie audytu bezpieczeństwa przed grantem.

### Po naprawie

```bash
$ grep -oE "^[A-Z_][A-Z0-9_]*=" .env.example | wc -l
  29
$ # zmienne czytane przez kod i nieudokumentowane:
  (pusto — kompletne)
$ grep -E "^(ANTHROPIC_API_KEY|GENESIS_RESEARCH_API_KEY|GENESIS_INSTITUTIONAL_API_KEY)=.+" .env.example
  żaden sekret nie ma wartości — poprawnie
```

### Blokada dryfu (bo defekt polegał na dryfie)

```bash
$ node --test src/envContract.test.mjs
ok 1 - P0.4 .env.example dokumentuje KAŻDĄ zmienną, którą kod czyta
ok 2 - P0.4 żaden SEKRET nie ma w .env.example wartości
ok 3 - P0.4 w drzewie repo nie ma żadnego materiału wyglądającego na sekret
ok 4 - P0.4 .env jest ignorowany przez gita
# tests 4 | pass 4 | fail 0
```

Test 2 działa na WZORCU nazwy (`*KEY*`/`*TOKEN*`/`*SECRET*`/`*PASSWORD*`/
`*CREDENTIAL*`), nie na liście — nowa zmienna sekretna jest objęta regułą
automatycznie, bez dopisywania jej do testu. Test 3 przenosi jednorazowy
audyt w stałą blokadę na przyszłe commity.

### Ustalenie poboczne, zgłoszone jako OPEN (nie naprawione tutaj)

`store.mjs:634-644` zapisuje **token sesji w postaci jawnej** w tabeli
`sessions`. Snapshot bazy — który P0.2 właśnie uczynił łatwym do wykonania i
skopiowania — zawiera więc żywe tokeny użyteczne do końca TTL. To NIE jest
regresja tej gałęzi: implementacja haszowania w spoczynku istnieje w
`3bce0c2`, ale ten commit **nie jest przodkiem HEAD** (`git merge-base
--is-ancestor 3bce0c2 HEAD` → fałsz; leży na `origin/genesis/main` i
`origin/claude/genesis-takeover-audit-kpz019`). Zgłoszone w `docs/RISKS.md`
z konkretną propozycją (cherry-pick istniejącego modułu, nie nowa
implementacja); łagodzenie operacyjne opisane w `OPS_RUNBOOK.md` §4.

**Status: ZAMKNIĘTE w pakiecie P1** (C2) — cherry-pick bajt-w-bajt zgodnie z
propozycją, migracja idempotentna testowana na realnej legacy-bazie. Patrz
`docs/RISKS.md` R-001 i `docs/P1_EVIDENCE.md`.

---

## P0.3 — poprawka: `resolveBuildInfo` w `git worktree`

**Znalezisko C3** (przy okazji P2.1, budując na tej samej gałęzi): backendowy
suite raportował 1 nieoczekiwaną porażkę, poprawnie zdiagnozowaną jako
środowiskową i pozostawioną nierozwiązaną (poza zakresem jego zadania) —
`buildInfo.mjs` zakłada, że `.git` jest katalogiem. **Naprawione tutaj,
zweryfikowane wykonaniem, D-015.**

```bash
$ git worktree add /tmp/claude-0/worktree-test HEAD --detach
$ file /tmp/claude-0/worktree-test/.git
/tmp/claude-0/worktree-test/.git: ASCII text
$ cat /tmp/claude-0/worktree-test/.git
gitdir: /home/user/Elion-Replit-grudzien-5rano/.git/worktrees/worktree-test
```

Test dodany PRZED naprawą (czerwony):

```bash
$ node --test src/buildInfo.test.mjs
# tests 5 | pass 4 | fail 1   (worktree HEAD → commitSource 'unavailable')
```

Po naprawie (`resolveGitDir` podąża za `gitdir:`; `resolveCommonDir` czyta
`refs/heads`/`packed-refs` ze WSPÓLNEGO katalogu, bo w worktree gałęzie nie są
prywatne per-worktree — tylko `HEAD` jest):

```bash
$ node --test src/buildInfo.test.mjs
ok 1..6
# tests 6 | pass 6 | fail 0
```

Dwa scenariusze worktree, oba na realnym `git worktree add`, nie na atrapie
filesystemu: `--detach` (HEAD jako goły SHA) i `-b <gałąź>` (ścieżka `ref:`
przez `commondir` — bez tego drugiego testu naprawa dla detached HEAD dałaby
fałszywe poczucie bezpieczeństwa, bo nie przechodzi przez `resolveCommonDir`
wcale). Pełny backend po naprawie: **430 testów, 396 passed, 0 failed, 34
skipped** — jedna nieoczekiwana porażka, o której mówił C3, faktycznie
zniknęła.
