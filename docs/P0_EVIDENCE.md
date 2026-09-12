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
