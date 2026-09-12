# PROMPT DLA C2 — PAKIET P1: higiena testów i danych (Genesis OS)

Gałąź: `claude/genesis-autonomous-completion-95bt4e` (P0 jest już na niej zamknięte,
commity `108be87`, `0847ab7`, `5f88c8f` — przeczytaj `docs/P0_EVIDENCE.md` przed startem).

## ZASADY TWARDE (te same, co w całej misji grant-readiness)
1. Każde twierdzenie „naprawione/zweryfikowane" = **komenda + wyjście + commit hash**.
   Bez dowodu piszesz `NOT VERIFIED` i nie prezentujesz tego jako done.
2. **TDD dla każdego bugfixa integralności**: test na czerwono PRZED implementacją,
   z wklejonym wyjściem czerwonego przebiegu.
3. **Nie łamiesz zapisanych danych.** Testy graniczne (pusta baza, baza z danymi)
   przed każdą zmianą schematu. Brak downgrade'ów bez migracji.
4. Nie tworzysz nowych silników (evidence/replay/memory/graph/epistemic/conflict).
   Nowe = tylko pola metadanych i czyste funkcje.
5. Uczciwość ponad domykanie: czego nie domkniesz → wpis `OPEN` z powodem i terminem.
6. Pełna bramka przed pushem: `eslint .`, `tsc --noEmit` (frontend),
   `npm run test --workspace=packages/backend`, `npx vitest run` (frontend), `npm run build`.

## P1.1 — audyt WSZYSTKICH skipów

**Uwaga: liczba „58" z pierwotnego briefu NIE zgadza się z pomiarem.** Zmierzone na
`5f88c8f`:
```
backend  (node --test):  34 skipped   (npm run test --workspace=packages/backend)
frontend (vitest):        1 skipped   (npx vitest run)
```
Zacznij od USTALENIA prawdziwej liczby i jej rozbicia — nie przyjmuj ani 58, ani 35 na słowo.
Skipy runtime (`{ skip: ... }`, warunkowe) to inna kategoria niż `.skip(` w pliku;
policz oba i powiedz, ile ich jest naprawdę.

Deliverable: `docs/TEST_SKIPS.md` — tabela
`{ plik::test, powód skipu, decyzja: DOMKNĄĆ / ZAAKCEPTOWAĆ / ZDEPRECJONOWAĆ, uzasadnienie (1 zdanie) }`.

Reguły decyzji:
- **DOMKNĄĆ** — skip ukrywa lukę w integralności (prowieniencja, falsyfikacja, replay,
  RBAC, trwałość) ALBO domknięcie jest tanie. Domknij w tym pakiecie.
- **ZAAKCEPTOWAĆ** — skip jest warunkowy na brakującym zewnętrznym silniku
  (PySCF/RDKit/OpenMM/MEEP) albo na zasobie, którego nie ma w CI. Wtedy **udowodnij**,
  że skip jest warunkowy, a nie permanentny: pokaż linię warunku.
- **ZDEPRECJONOWAĆ** — test pilnuje zachowania, którego już nie ma. Usuń go i powiedz,
  co go zastąpiło.

## P1.2 — pełny suite zielony + flaki z dowodem izolacji

Znany flak, potwierdzony dwukrotnie: `packages/frontend/src/__tests__/nextActionSelectors.test.ts`
(„the precision-analysis adapter…") pada pod obciążeniem pełnego suite'u, przechodzi w izolacji.
Dla każdego flaka: wyjście z pełnego przebiegu (czerwone) + wyjście z izolacji (zielone)
+ hipoteza przyczyny. Nie „naprawiaj" flaka przez `retry` — to ukrycie, nie naprawa.

## P1.3 — migracje schematu bez utraty danych

Kontekst, który już istnieje: `store.mjs::openDatabase` woła `migrate(db)` i
`ensureAccessSchema(db)`. Zadanie:
1. Test graniczny **pusta baza** → schemat powstaje, wszystkie tabele są.
2. Test graniczny **baza z danymi** → migracja NIE gubi ani jednego wiersza
   (policz wiersze przed i po, w każdej tabeli).
3. **Guard przed downgrade'em**: starszy kod na nowszym schemacie musi ODMÓWIĆ
   z czytelnym komunikatem, a nie działać i cicho psuć dane. Dziś nie ma wersji
   schematu w bazie — dodanie pola `schema_version` (metadana, dozwolona) jest
   właściwym minimum.
4. Test idempotencji: `openDatabase` na tej samej bazie dwa razy = bez zmian.

Realny materiał testowy: `packages/backend/data/genesis.db` ma 26 tabel, 44 użytkowników,
40 projektów. Kopiuj go do tempa, nie testuj na nim wprost.

## BONUS, który pasuje dokładnie do tego pakietu — R-001 z `docs/RISKS.md`

`store.mjs:634-644` zapisuje **token sesji w postaci jawnej**. Snapshot bazy
(`scripts/db-backup.mjs`) zawiera więc żywe tokeny użyteczne do końca TTL.
Gotowa implementacja haszowania istnieje w commicie `3bce0c2`
(`packages/backend/src/secrets.mjs`: `hashSecret`/`keyHint`/`looksHashed`), który
**NIE jest przodkiem HEAD** (`git merge-base --is-ancestor 3bce0c2 HEAD` → fałsz;
leży na `origin/genesis/main`). **Cherry-pick, nie przepisuj** — a migracja musi być
idempotentna (`looksHashed` istnieje właśnie po to) i objęta testami granicznymi z P1.3.
To jest zmiana schematu na żywych danych, więc bez P1.3 jej nie rób.

## Definicja DONE dla P1
- `docs/TEST_SKIPS.md` z rozstrzygnięciem KAŻDEGO skipu i jego uzasadnieniem.
- Pełny suite zielony; flaki wylistowane z dowodem izolacji.
- Migracje z testami granicznymi + guard downgrade'u.
- Wpisy `OPEN` dla wszystkiego, czego nie domknąłeś, z powodem i terminem.
