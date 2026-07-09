# Architektura Genesis OS

Ten dokument opisuje jak i dlaczego, nie co — lista funkcji jest w
[`README.md`](README.md), historia zmian w [`CHANGELOG.md`](CHANGELOG.md).

## Zasada organizująca: pluginy fizyki, cienka powłoka UI

Każde laboratorium jest niezależnym modułem zgodnym z kontraktem
`LabDefinition` (`packages/frontend/src/core/types.ts`). Rdzeń aplikacji
(`App.tsx`, `LabShell.tsx`, `registry.ts`) nie zna żadnego laboratorium z
nazwy — renderuje wyłącznie to, co zarejestrował `registerLab()` w
`src/labs/index.ts`. Dodanie laboratorium to jeden nowy plik + jedna linia
w manifeście; usunięcie jednego laboratorium nie może wpłynąć na inne
(sprawdzane przez `sims.test.ts`, które iteruje `getLabs()` i uruchamia
każdą symulację 120 kroków).

### Kontrakt `Sim`

```ts
interface Sim {
  init(width: number, height: number): void;
  update(dt: number, params: SimParams): void;
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  getStats?(): Record<string, number>;
  reset?(): void;
}
```

`update()` i `getStats()` są czystym TypeScriptem bez żadnej zależności od
DOM czy Reacta — to jest granica przenośności. Tylko `render()` jest
adapterem specyficznym dla platformy (dziś: Canvas 2D). Port na Unity /
Unreal / natywną aplikację wymaga wymiany wyłącznie warstwy `render()`;
cała logika fizyczna, parametry i statystyki przenoszą się bez zmian.

### Warstwa Narratora — dwa poziomy

1. **Deterministyczny** (`narrator/engine.ts`) — zawsze aktywny, liczy
   realne wielkości fizyczne bezpośrednio z parametrów i statystyk
   symulacji. Zero zależności sieciowej, zero LLM.
2. **LLM opcjonalny** (`narrator/askAI.ts` → backend `/api/ask`) — pytania
   otwarte użytkownika. Model dostaje stan symulacji, który użytkownik i
   tak widzi na ekranie (parametry, statystyki, już policzone bloki
   narracji) ORAZ wyciąg z `knowledge/<lab>.md` dopasowany po `labId` —
   jedyne dozwolone źródło dla twierdzeń wykraczających poza samą
   symulację (`buildKnowledgeIndex`/`knowledgeExcerptFor` w
   `packages/backend/src/lib.mjs`). System prompt wymaga oznaczenia
   każdego takiego twierdzenia jedną z sześciu gwiazdek pewności ze
   skali w `knowledge/README.md` — to wymuszenie promptem, nie
   programowa weryfikacja treści (patrz `knowledge/ai-discovery.md` §
   Ryzyka). Bez klucza `ANTHROPIC_API_KEY` backend odpowiada uczciwym
   `503`, warstwa 1 działa dalej bez zmian.

### Źródła danych i cytowania

`core/dataSource.ts` to rejestr źródeł danych, świadomie skopiowany z
kształtu `core/registry.ts` (labów) zamiast nowego wzorca — każde źródło
deklaruje `id`, `citation` (skąd, jaki poziom pewności), `isSynthetic` i
`load()`. Dwóch realnych konsumentów dziś: `particle-invmass.ts`
(`particle.dimuon-masses`, syntetyczne dopóki `data/dimuon-real.ts` nie
istnieje) i `universe-solar-system.ts` (`universe.solar-system-elements`,
realne stałe NASA od razu, `isSynthetic: false`) —
`scripts/fetch-real-data.mjs` wie, jak wygenerować dane dla pierwszego z
CERN Open Data, JPL Horizons czy ESA Gaia (wymaga sieci bez blokady na te
hosty, patrz README „Znane ograniczenia").

`core/citation.ts` eksportuje ten sam sześciopoziomowy `ConfirmationLevel`
co baza wiedzy i `NarrationBlock.citation?` — opcjonalne pole źródła,
renderowane przez `NarratorPanel` jako link. Nie każdy blok ma cytowanie
(byłoby to szumem informacyjnym); wpięte tam, gdzie twierdzenie odwołuje
się do konkretnego wyniku eksperymentalnego (masy PDG, testy Bella).

### Stwórz eksperyment — bezpieczne przez konstrukcję

Dostępne jako dodatkowa zakładka na KAŻDYM laboratorium
(`components/CustomExperimentTab.tsx`, dopięte w `LabShell.tsx`).
Świadomie NIE pozwala użytkownikowi pisać ani wykonywać kodu — wybiera się
wyłącznie wartości `lab.params`, tego samego kontraktu `Sim`/`ParamDef` co
reszta platformy. Zero nowej powierzchni ataku, zero sandboxingu do
budowania.

Dwa nowe moduły, oba czyste i przetestowane bez zależności od UI:
- `core/experimentRun.ts` — bufor kołowy nagranych próbek statystyk
  (300 próbek ≈ 5 minut przy kadencji 1/s)
- `core/experimentAnalysis.ts` — deterministyczna analiza przebiegu:
  trend (regresja liniowa najmniejszych kwadratów), wykrywanie płaskich
  przebiegów, skoków między próbkami, korelacji Pearsona między dwiema
  najbardziej dynamicznymi wielkościami. To jest właściwa „warstwa 0" dla
  tego trybu — ta sama filozofia co `narrator/engine.ts`: liczy prawdziwe
  dane, zero LLM, zero halucynacji.

Kluczowa decyzja architektoniczna: wynik analizy ma dokładnie kształt
`NarrationBlock[]`, więc trafia do TEGO SAMEGO `NarratorPanel` i
`askAI()`/backendu z groundingiem w `knowledge/<lab>.md`, którego już
używa reszta platformy. Zero nowego endpointu, zero równoległego systemu
promptów — to jest odpowiedź na wyraźne polecenie „nie twórz równoległych
systemów, wykorzystuj istniejącą architekturę wszędzie, gdzie to możliwe".
Presety parametrów zapisywane lokalnie (`core/customExperiment.ts`),
wzorzec identyczny z `discoveryLog.ts`.

## Funkcje lokalne (bez backendu, bez konta)

`src/core/storage.ts` to jedyny punkt dostępu do `localStorage` w całej
aplikacji — bezpieczny wrapper (nigdy nie rzuca, degraduje się do no-op w
trybie prywatnym Safari czy przy wyłączonym storage). Na nim zbudowane są:

| Moduł | Co przechowuje | Kto czyta |
|---|---|---|
| `settings.ts` | redukcja ruchu, wysoki kontrast, kompaktowy Narrator, zgoda na analitykę | `useSettings()` (React), `applyDocumentFlags()` (klasy na `<html>`) |
| `analytics.ts` | liczniki zdarzeń UI (opt-out) | panel „Twoja aktywność" w Ustawieniach |
| `discoveryLog.ts` | odwiedzone (lab, eksperyment), odblokowane odznaki | ekran Dziennika odkryć |
| `search.ts` | (bez trwałości) indeks budowany z `getLabs()` na żądanie | paleta poleceń (`/`) |

Każdy odczyt z localStorage jest walidowany pole po polu (nie ufa całemu
zapisanemu obiektowi) — to jest granica zaufania, bo localStorage jest
edytowalny poza aplikacją (DevTools, stary format z przyszłej wersji).
Zero transmisji sieciowej z żadnego z tych modułów; to świadoma decyzja
architektoniczna, nie luka do wypełnienia.

## Backend

`packages/backend/src/server.mjs` używa gołego modułu `http` (bez
Express) w dwóch rolach: serwer statyczny produkcyjny (SPA fallback,
poprawne typy MIME, immutable cache dla hashowanych assetów) i proxy AI
(`POST /api/ask`, klucz API nigdy nie opuszcza serwera).

Cała logika bez efektów ubocznych sieciowych (walidacja wejścia, rate
limiter, rozwiązywanie ścieżek statycznych, nagłówki bezpieczeństwa) żyje
w `lib.mjs` — testowana przez `node --test` bez uruchamiania portu
(`lib.test.mjs`, 21 testów). `server.mjs` łączy tę logikę z
`http.createServer` i obsługą sygnałów (graceful shutdown).

## Testy

126 testów frontendowych (vitest) + 28 backendowych (`node --test`) = 154.

- **Fizyka i symulacje** (`__tests__/physics.test.ts`, `sims.test.ts`):
  twarde asercje naukowe (złamanie nierówności Bella |S|>2, twierdzenie
  Parsevala dla FFT, odwrócenie porządku czasowego w transformacji
  Lorentza) — nie tylko „nie rzuca wyjątku".
- **Funkcje lokalne** (`storage`, `settings`, `analytics`, `discoveryLog`,
  `search`, `registry`, `elements`, `glossary`, `dataSource`, `i18n`):
  każdy moduł osobno, włącznie ze ścieżkami degradacji (localStorage
  niedostępny, dane skorumpowane).
- **Backend** (`lib.test.mjs`): sanityzacja wejścia, rate limiting, oba
  wektory path traversal, obecność nagłówków bezpieczeństwa, ładowanie i
  przycinanie wyciągów z bazy wiedzy (z wstrzykniętym fake'owym czytnikiem
  plików — zero realnego dostępu do dysku w testach).

## Przyszły backend — punkty rozszerzenia (projekt, NIE zbudowane)

MVP celowo zostaje bez kont/bazy danych/płatności. Ten rozdział istnieje,
żeby dodanie tych rzeczy było decyzją o TYM, jak je dodać, a nie
przepisywaniem architektury od zera. Nic poniżej nie jest zaimplementowane.

**Dlaczego to w ogóle będzie potrzebne.** Funkcje lokalne (`storage.ts` i
moduły na nim, patrz wyżej) świetnie służą pojedynczemu użytkownikowi na
jednym urządzeniu. Nie obsłużą: postępu ucznia widocznego dla nauczyciela,
tego samego konta na telefonie i komputerze, wspólnego eksperymentu wielu
osób, ani danych do badania skuteczności edukacyjnej w skali większej niż
jedno urządzenie. To jest realny sufit obecnej architektury, nie hipoteza
— i to jest zamierzone: prostota MVP miała priorytet nad tą funkcją.

**Gdzie wpiąć konto/sesję.** `packages/backend/src/server.mjs` już ma
dokładnie ten kształt, w który wpina się REST API bez przepisywania: nowe
trasy obok istniejących `/api/health` i `/api/ask` (np. `/api/session`,
`/api/sync`), ten sam wzorzec `json()`/walidacji co `handleAsk`. Sesja =
nowa, osobna warstwa — NIE zamiennik `storage.ts`. Model docelowy: dane
lokalne zostają lokalnym cache'em/trybem offline (jak dziś), a warstwa
synchronizacji nakłada się na te same moduły (`settings.ts`,
`discoveryLog.ts`) przez ten sam kształt funkcji (`readJSON`/`writeJSON`),
tyle że zapisujące też do backendu, gdy zalogowany. Użytkownik bez konta
= dokładnie dzisiejsze zachowanie, bez regresji.

**Gdzie wpiąć bazę danych.** Backend dziś nie ma stanu poza limiterem
w pamięci (`createRateLimiter`, per-proces — już udokumentowane jako
ograniczenie do adresowania przy autoscale, patrz `SECURITY.md`). Baza
(Postgres/SQLite, do decyzji przy realnej potrzebie) wpinałaby się jako
kolejny moduł importowany przez `server.mjs`, analogicznie do `lib.mjs` —
czysta logika zapytań testowalna bez portu, `server.mjs` tylko łączy z
`http.createServer`. Minimalny schemat do zaprojektowania wtedy, nie
teraz: `users`, `sessions`, `progress` (odpowiednik dzisiejszego
`discovery-log/v1` per-user zamiast per-przeglądarka).

**Klasy/kohorty (funkcja edukacyjna z realną wartością komercyjną).**
Naturalne rozszerzenie modelu sesji: `classroom_id` grupujący `users`,
nauczyciel widzi zagregowany (nie per-uczniowski, RODO/COPPA) postęp.
Świadomie NIE projektuane szczegółowo tutaj — wymaga decyzji prawnej o
danych dzieci (patrz `SECURITY.md` „świadome ograniczenia") przed
jakimkolwiek kodem, nie tylko architektury.

**Co NIE zmienia się, gdy to wszystko powstanie:** kontrakt `LabDefinition`
i `Sim`, warstwa 0 Narratora, PWA offline, `core/dataSource.ts`. Backend z
kontem to dodatkowa warstwa nad dzisiejszą aplikacją, nie jej zastąpienie.

## Świadome decyzje architektoniczne

- **Canvas 2D, nie WebGL** — prostota i przenośność ważniejsze niż
  wydajność renderowania przy tej skali symulacji (setki, nie miliony,
  obiektów na ekranie).
- **Brak route-based code splitting** — rejestr laboratoriów
  (`labs/index.ts`) jest synchroniczny; od tego zależy zweryfikowane
  działanie offline PWA i `sims.test.ts`. Zamiast tego: bezpieczny
  `manualChunks` (React w osobnym, długo cache'owalnym chunku).
  Rozdzielenie na lazy-loaded route'y jest możliwe później, ale wymaga
  osobnego przeglądu wpływu na cache service workera — świadomy
  kompromis: mniejszy pierwszy bundle kosztem złożoności, dziś priorytet
  ma stabilność offline.
- **Brak Express/frameworka backendowego** — powierzchnia ataku i liczba
  zależności runtime jest dziś ważniejsza niż wygoda routingu przy trzech
  endpointach.
- **Brak jsdom w testach frontendowych** — testy DOM-owe (fokus, klasy na
  `<html>`) używają lekkich ręcznych fake'ów zamiast ciężkiej zależności;
  prawdziwe zachowanie przeglądarki weryfikują smoke-testy Playwright
  (nie w CI — ręcznie przy większych zmianach UI).
