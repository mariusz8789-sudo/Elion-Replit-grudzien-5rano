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
   otwarte użytkownika. Model dostaje WYŁĄCZNIE stan symulacji, który
   użytkownik i tak widzi na ekranie (parametry, statystyki, już policzone
   bloki narracji) — nigdy nie oblicza własnych wyników fizyki. Bez klucza
   `ANTHROPIC_API_KEY` backend odpowiada uczciwym `503`, warstwa 1 działa
   dalej bez zmian.

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

- **Fizyka i symulacje** (`__tests__/physics.test.ts`, `sims.test.ts`):
  twarde asercje naukowe (złamanie nierówności Bella |S|>2, twierdzenie
  Parsevala dla FFT, odwrócenie porządku czasowego w transformacji
  Lorentza) — nie tylko „nie rzuca wyjątku".
- **Funkcje lokalne** (`storage`, `settings`, `analytics`, `discoveryLog`,
  `search`, `registry`, `elements`, `glossary`): każdy moduł osobno,
  włącznie ze ścieżkami degradacji (localStorage niedostępny, dane
  skorumpowane).
- **Backend** (`lib.test.mjs`): sanityzacja wejścia, rate limiting, oba
  wektory path traversal, obecność nagłówków bezpieczeństwa.

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
