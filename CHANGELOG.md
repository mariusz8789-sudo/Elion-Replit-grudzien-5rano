# Changelog

Format luźno wzorowany na [Keep a Changelog](https://keepachangelog.com/).
Pełne raporty z uzasadnieniami decyzji: `RAPORT-ETAP-0.md` ·
`RAPORT-ETAP-1.md` · `RAPORT-ETAP-2.md` · `RAPORT-AUDYT.md`.

## [Unreleased]

### Dodano (Genesis Knowledge Engine + laboratoria, od RAPORT-AUDYT-2)
- Genesis Knowledge Base (`knowledge/*.md`): sześciostopniowa skala
  potwierdzenia naukowego, nowe pliki (mechanika klasyczna, elektrodynamika,
  termodynamika, dossier 13 naukowców), Narrator LLM ugruntowany wyłącznie
  w tej bazie (`buildKnowledgeIndex`/`knowledgeExcerptFor` w backendzie).
- `core/dataSource.ts` + `core/citation.ts` — jeden rejestr źródeł danych i
  wspólna skala pewności dla całej platformy (Narrator, DataSource, UI).
- Universe Lab: prawdziwy Układ Słoneczny (dane NASA Planetary Fact Sheet,
  równanie Keplera) jako flagowy eksperyment.
- "Stwórz eksperyment" na każdym laboratorium: własne presety parametrów +
  deterministyczna analiza trendu (bez LLM) w kształcie identycznym z
  resztą Narratora — zero równoległej infrastruktury AI.
- Nuclear Lab: Mapa nuklidów — ciągła "dolina stabilności" z wzoru SEMF
  (`core/physics.ts`) + ~55 realnie zmierzonych izotopów (NNDC,
  `data/nuclides.ts`) jako klikalna nakładka; kierunek rozpadu beta liczony
  z porównania energii wiązania sąsiednich izobarów.
- `core/i18n.ts` — architektura wielojęzyczna (polski kompletny, angielski
  jako świadomie pusty seam, bez „martwego" UI).
- `scripts/fetch-real-data.mjs` — gotowy fetcher JPL Horizons/Gaia/CERN
  (nieuruchomiony end-to-end — sieć sandboxa blokuje te hosty, patrz
  README „Znane ograniczenia").

## Etap Audytu 2 — utwardzanie produkcyjne i funkcje lokalne

Pełny raport z uzasadnieniem każdej zmiany: [`RAPORT-AUDYT-2.md`](RAPORT-AUDYT-2.md).

### Dodano
- Ustawienia (redukcja ruchu, wysoki kontrast, kompaktowy Narrator,
  opt-out z lokalnej analityki) — w pełni lokalne, `localStorage`.
- Paleta poleceń (`/` lub ikona Szukaj) — wyszukiwanie po wszystkich
  laboratoriach i eksperymentach, normalizacja polskich znaków.
- Dziennik odkryć — 10 odznak odblokowywanych z realnych progów
  fizycznych już liczonych przez symulacje (zero nowych obliczeń).
- Słowniczek — 29 pojęć skondensowanych z Genesis Knowledge Base,
  filtrowalny po laboratorium i tekście.
- Globalne skróty klawiszowe (Spacja/R/`/`/`?`/Esc) + nakładka pomocy.
- Dostępność: skip link, pułapka fokusu w nakładkach modalnych,
  `aria-live` w panelu Narratora, granica błędu per-laboratorium (jedna
  awaria symulacji nie zabiera nawigacji).
- Backend: nagłówki bezpieczeństwa na każdej odpowiedzi (CSP,
  X-Frame-Options, Referrer-Policy, Permissions-Policy,
  Strict-Transport-Security).
- Backend: `lib.mjs` — czysta, testowalna logika (walidacja, rate limiter,
  rozwiązywanie ścieżek statycznych) + 21 testów `node:test`.
- 49 nowych testów frontendowych dla nowych modułów lokalnych (86 razem).
- `ARCHITECTURE.md`, `CONTRIBUTING.md`, ten `CHANGELOG.md`.

### Zmieniono
- React/react-dom wydzielone do osobnego chunku (`manualChunks`) dla
  lepszego cache'owania długoterminowego.
- Refaktor DRY: wspólny `HonestyBadge` i pomocnicze funkcje rysowania
  krzywych na canvasie (`canvasHelpers.ts`) zamiast duplikacji w 4+
  plikach symulacji.
- `discovery.tsx` pokazuje żywy status backendu LLM (`GET /api/health`)
  zamiast statycznego tekstu z poprzedniego etapu.

### Naprawiono
- Path traversal na serwerze statycznym: stary check
  `filePath.startsWith(STATIC_DIR)` błędnie przepuszczał katalogi
  siostrzane dzielące prefiks (np. `/app/dist-evil` pasowało do
  `/app/dist`). Naprawione porównaniem do `staticDir + separator`.
- `core/settings.ts` mogło rzucić poza przeglądarką (brak `document`) —
  dodana jawna strażniczka.

## Etap Audytu — gotowość produkcyjna

Pełny audyt kodu, bezpieczeństwa, wydajności i UX bez nowych funkcji
użytkowych. Naprawiona konfiguracja `.replit` (Deploy wskazywał na
nieistniejący `dist/index.js`), dodane CI/CD (GitHub Actions), ESLint +
Prettier, Docker (multi-stage, non-root), `SECURITY.md`, `LICENSE`,
`.env.example`, ErrorBoundary, poprawki SEO/PWA/WCAG. Szczegóły:
`RAPORT-AUDYT.md`.

## Etap 2 — AI, offline, przygotowanie pod dane rzeczywiste

Splątanie kwantowe + gra CHSH (kwantowy vs. ukryte zmienne), PWA w pełni
offline (service worker, manifest), backend AI (proxy Anthropic), testy
fizyki w vitest (`core/physics.ts`). Laboratorium cząstek: masy rezonansów
(PDG) i metoda histogramu masy niezmienniczej są prawdziwe, ale zbiór
zderzeń pozostał syntetyczny — `opendata.cern.ch` był niedostępny z
ówczesnej sieci deweloperskiej (HTTP 403); punkt podpięcia realnych danych
CMS (CC0) istnieje (`data/dimuon-real.ts`), ale nikt jeszcze go nie
wypełnił. Szczegóły: `RAPORT-ETAP-2.md`.

## Etap 1 — rozwój istniejących laboratoriów

Framework wielu eksperymentów na laboratorium (`ExperimentDef`), 9 nowych
symulacji fizycznych, orbitale atomowe, presety multiwersum. Żadnych
nowych laboratoriów — pogłębienie istniejących dziesięciu. Szczegóły:
`RAPORT-ETAP-1.md`.

## Etap 0 — fundament

Architektura pluginowa (`LabDefinition`/`registry.ts`), Scale Journey,
10 laboratoriów z pierwszymi symulacjami, deterministyczny Narrator AI,
etykiety uczciwości naukowej. Szczegóły: `RAPORT-ETAP-0.md`.
