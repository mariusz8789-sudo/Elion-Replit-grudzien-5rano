# PROMPT DLA C3 — implementacja QE5, QE6, QE7 wg pakietu Qwena

Gałąź: `claude/genesis-autonomous-completion-95bt4e`, stan wejściowy: commit `a822fa0`. Pakiet
badawczy `docs/prompts/QWEN-QE4-QE7-obserwable.md` jest już w repo (dostarczony przez Qwena) —
**przeczytaj go w CAŁOŚCI, sekcje QE5/QE6/QE7, zanim zaczniesz.** QE4 jest OSOBNYM zadaniem, na
osobnym torze (C2, prawdziwy zbiór Brydgesa z Zenodo) — nie duplikuj go, nie dotykaj plików C2
(`docs/QE4_REAL_DATASET_AND_EXPERIMENT.md`, nic w `core/quantum/randomizedMeasurementEstimator*`).

## Wzorzec, który musisz powtórzyć — dokładnie QE1→QE3, nie coś nowego

`knowledge/quantum.md:228-238` ma tabelę QE1–QE7 z falsyfikatorami. QE1–QE3 przeszły realny cykl:
`packages/frontend/src/core/agent/entanglementInquiry.ts` (dochodzenia, `qe1BoundEntanglementInquiry`
itd.) → `inquiryLoop.ts::runAutonomousInquiry` → realny `StrategyRun` przez Fabric. Twoje zadanie:
zbudować analogiczne dochodzenia `qe5...Inquiry`/`qe6...Inquiry`/`qe7...Inquiry` w TYM SAMYM pliku
(`entanglementInquiry.ts`), używając TEGO SAMEGO `runAutonomousInquiry`, zero nowego executora.

Solvery, które już istnieją w `core/quantum/entanglementMeasures.ts` i z których korzystasz —
NIE pisz ich drugi raz: `vonNeumannEntropy`, `renyiEntropy`, `concurrence`, `negativity`/
`logarithmicNegativity`, `peresHorodeckiTest`, `checkCKWMonogamy`, `maximumCHSH`,
`schmidtDecomposition`, `partialTraceA`/`partialTraceB`, `horodeckiBoundEntangled3x3`.

## Co robić dla KAŻDEJ hipotezy — zgodnie z tym, co pakiet Qwena już rozstrzygnął

Pakiet Qwena już nazwał, gdzie jest granica na tym substracie (przeczytaj dokładnie te akapity —
nie licz ponownie od zera, on już to przemyślał):

- **QE5 (PLOB ogranicza QKD)**: pakiet mówi sprawdzić, czy granicę PLOB da się wyrazić jako funkcję
  ZANY policzonej negatywności/log-negatywności stanów Wernera/izotropowych (`entanglementMeasures.ts`
  już to liczy). **Jeśli TAK — to jest prawdziwa obserwabla, zaimplementuj falsyfikowalny test**
  (preparatyka bezużyteczna: stan całkowicie separowalny → brak sygnału; preparatyka rozstrzygająca:
  stan blisko granicy Wernera separowalności → test realnie rozróżnia). **Jeśli wymaga osobnego
  modelu kanału (transmitancja/szum) — zgłoś jako brakujący komponent, `BLOCKED`, nie buduj modelu
  kanału na siłę.**
- **QE6 (formuła wysp / krzywa Page'a)**: pakiet mówi, że da się to policzyć NA MAŁYCH N jako czysty
  fakt o macierzach losowych (średnia entropia podukładu losowego stanu czystego, bez fizyki
  czarnych dziur) — **to jest wykonalne z tym, co jest**: potrzebujesz próbkowania Haara losowego
  stanu czystego na N kubitach + `vonNeumannEntropy`/`schmidtDecomposition` na podukładzie. Jeśli
  Genesis nie ma generatora losowego stanu Haara — to JEDNA wąska, uzasadniona nowa funkcja
  (`sampleHaarRandomState(n)` czy podobna), nie nowy silnik. Falsyfikator: krzywa Page'a
  (⟨S_A⟩ jako funkcja rozmiaru podukładu) ma znaną, policzalną postać analityczną (przybliżenie
  Page'a) — porównaj empiryczną średnią z wielu losowych próbek Haara przeciw tej formule,
  prerejestrowane pasmo z liczby próbek (błąd statystyczny średniej).
- **QE7 (monogamia/SSA)**: pakiet mówi wprost — SSA i CKW są TWIERDZENIAMI algebry, którą Genesis
  liczy dokładnie, więc żaden run nie może ich sfalsyfikować (jak CKW w QE2,
  `QE2_NOT_MODELLED`/analogiczna stała). **Jedyna uczciwa treść: test WERYFIKACJI IMPLEMENTACJI**
  — czy repo poprawnie liczy SSA na losowych/granicznych przypadkach (np. stan GHZ, stan W, stan
  losowy Haara z QE6 jeśli go zbudujesz) — nie test fizyki. Nazwij to wprost w kodzie, analogicznie
  do `QE1_NOT_MODELLED`/`QE2_NOT_MODELLED` w `entanglementInquiry.ts` — dodaj `QE7_NOT_MODELLED`
  (albo podobną nazwę) z tym samym komentarzem-ostrzeżeniem.

## Tautology Gate — obowiązkowe dla wszystkich trzech

Każde dochodzenie MUSI jawnie zadeklarować klasyfikację przez `assessSingleTautology`/
`assessTautology` (`core/agent/tautologyGate.ts`) — QE7 z definicji wychodzi `CONSISTENCY_CHECK`
(algebra), QE5/QE6 powinny wyjść `EMPIRICAL_TEST` lub `MIXED_TEST` w zależności od tego, co
faktycznie zaimplementujesz. Jeśli którekolwiek wyjdzie `CONSISTENCY_CHECK`, a spodziewałeś się
`EMPIRICAL_TEST` — to znak, że observable nie jest tak niezależna, jak zakładałeś (dokładnie
lekcja z QE1: granica Tsirelsona jest sufitem algebry).

## Aktualizacja tabeli hipotez

`knowledge/quantum.md:228-238` — po realnym uruchomieniu zmień status QE5/QE6/QE7 z obecnego
(`ESTABLISHED`/`SUPPORTED WITHIN MODEL`/`SEARCHING` — to są STARE, sprzed uruchomienia adnotacje)
na rzeczywisty wynik z Twojego przebiegu, tym samym słownictwem co QE1–QE3
(`SUPPORTED_WITHIN_PROTOCOL`/`FALSIFIED_WITHIN_PROTOCOL`/`INCONCLUSIVE`/`BLOCKED`), z odsyłaczem do
dowodu w `docs/MASTER_PRIORITY_GENESIS.md`.

## TDD i weryfikacja

1. Test na czerwono najpierw dla każdej z trzech hipotez — wzorzec:
   `entanglementInquiry.test.ts`/testy QE1-3 istniejące w repo (znajdź przez
   `grep -rn "qe1BoundEntanglementInquiry\|qe2\|qe3BoundEntanglementInquiry" packages/frontend/src/__tests__`).
2. Realny `runAutonomousInquiry` per hipoteza — falsyfikacja musi być REALNA (co najmniej jeden
   kandydat musi paść na złych danych, dokładnie jak QE1-3 pokazały).
3. `scripts/inquiry-e2e.mjs` — rozszerz o QE5/QE6/QE7 (aktualnie sprawdza 6 dochodzeń QE1-3
   warianty; dodaj nowe wpisy, nie nowy skrypt).
4. Regresja: QE1–QE3 nietknięte, `externalObservationAnchor.test.ts`/`keplerExternalAnchor.test.ts`
   nietknięte (to nie Twoja domena w tym zadaniu).

## ZASADY TWARDE

1. Dowód = komenda + wyjście + hash commita.
2. `git fetch` przed KAŻDYM pushem — C1 (CMS) i C2 (QE4/Brydges) pchają równolegle.
3. Zero nowego silnika: `runAutonomousInquiry`, `entanglementMeasures.ts`, `tautologyGate.ts`
   reużyte. Jedna wąska nowa funkcja (np. próbkowanie Haara dla QE6) jest dozwolona, jeśli
   naprawdę potrzebna — nie architektura wokół niej.
4. Gdziekolwiek pakiet Qwena mówi `BLOCKED` (np. QE5 wymaga modelu kanału, którego nie ma) —
   ZOSTAW to jako `BLOCKED` w dokumentacji, nie projektuj nowego solvera żeby to obejść.
5. Pełna bramka przed pushem: eslint, tsc, oba suite'y, build, `node scripts/repro-demo.mjs`,
   `scripts/inquiry-e2e.mjs`.

## DONE

- QE5, QE6, QE7 każde: albo realnie uruchomione (dochodzenie, falsyfikacja realna, Tautology Gate
  sklasyfikowane, tabela hipotez zaktualizowana), albo jawnie `BLOCKED` z konkretnym brakującym
  komponentem nazwanym — nigdy symulowany sukces.
- `scripts/inquiry-e2e.mjs` pokrywa wszystkie zaimplementowane dochodzenia, zero błędów konsoli.
- `docs/MASTER_PRIORITY_GENESIS.md` i `knowledge/quantum.md` zgodne z rzeczywistym stanem po
  uruchomieniu.
