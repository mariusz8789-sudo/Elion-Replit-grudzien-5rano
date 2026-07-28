# Raport: Audyt 2 — funkcje lokalne, utwardzanie i weryfikacja produkcyjna

**Data:** 2026-07-09
**Zakres:** kontynuacja pracy autonomicznej po `RAPORT-AUDYT.md` — dokończenie
wszystkiego, co da się zrobić bez kluczy API, kont zewnętrznych ani decyzji
biznesowych, zgodnie z poleceniem: *"finish everything that can be completed
autonomously... keep working until there is nothing meaningful left to
improve without my input."*

Commity tej sesji: `4bdc727` → `1d86a7f` (5 commitów, 47 plików, +2711/−171
linii). Każdy commit przechodził pełne `lint && test && build` przed pushem.

## Co zrobiono i dlaczego

### 1. Funkcje lokalne — bez konta, bez backendu, bez transmisji sieciowej

| Funkcja | Uzasadnienie |
|---|---|
| **Ustawienia** (redukcja ruchu, wysoki kontrast, kompaktowy Narrator, opt-out analityki) | Realny wpływ na CSS przez klasy na `<html>` (`applyDocumentFlags`), nie kosmetyka — `prefers-reduced-motion` i wysoki kontrast to wymogi WCAG, nie "nice to have" |
| **Paleta poleceń** (`/`) | Aplikacja ma 10 laboratoriów × ~2-3 eksperymenty = ~30 pozycji nawigacyjnych; przy tej skali wyszukiwanie tekstowe skraca czas dotarcia do konkretnej symulacji bardziej niż siatka kafelków |
| **Dziennik odkryć** | Gamifikacja BEZ nowej fizyki: 10 progów odblokowuje się z wartości, które `sim.getStats()` i tak już liczy i pokazuje w Narratorze — zero ryzyka niespójności z rzeczywistą symulacją |
| **Słowniczek** (29 pojęć) | Skondensowany z Genesis Knowledge Base (`knowledge/*.md`), nie kopiowany — zgodnie z zasadą cytowania z `RESEARCH.md` |
| **Skróty klawiszowe** (Spacja/R/`/`/`?`/Esc) | Symulacje fizyczne to appka do eksperymentowania — pauza/reset bez sięgania po mysz/dotyk jest realnym usprawnieniem UX dla iteracyjnego dostrajania parametrów |

Wszystkie oparte na jednym bezpiecznym wrapperze `core/storage.ts`
(nigdy nie rzuca, degraduje się do no-op bez localStorage) — zero nowej
powierzchni ataku, zero danych opuszczających urządzenie użytkownika.

**Walidacja graniczna:** każdy odczyt z localStorage (ustawienia, dziennik
odkryć, liczniki analityki) jest sprawdzany pole po polu zamiast ufać
całemu zapisanemu obiektowi. localStorage jest edytowalny poza aplikacją
(DevTools, ręczna edycja, stary format z przyszłej wersji) — to jest
granica zaufania w rozumieniu OWASP, nie internal trusted store.

### 2. Dostępność (WCAG)

- **Skip link** — pierwszy fokusowalny element, pozwala ominąć nawigację.
- **Pułapka fokusu** w nakładkach modalnych (Szukaj, Pomoc) — Tab nie
  ucieka poza panel, fokus wraca do wyzwalacza po zamknięciu. Zweryfikowane
  Playwrightem: 6× Tab w nakładce Szukaj, fokus wciąż wewnątrz panelu.
- **`aria-live="polite"`** na blokach Narratora i wynikach wyszukiwania —
  zmiany są ogłaszane czytnikom ekranu bez przerywania.
- **Granica błędu per-laboratorium** — awaria jednej symulacji nie
  zabiera topbara/nawigacji (wcześniej: cały `<ErrorBoundary>` na
  poziomie aplikacji zabierał WSZYSTKO, łącznie z przyciskiem powrotu).
- **Semantyczne landmarki** (`<main>` dla każdego ekranu, `role="tablist"`
  na przełączniku eksperymentów, `role="listbox"`/`role="option"` w
  wynikach wyszukiwania — te ostatnie już istniały, zweryfikowane bez zmian).

### 3. Bezpieczeństwo backendu

- **Nagłówki bezpieczeństwa na KAŻDEJ odpowiedzi**: CSP (`default-src
  'self'`, zero inline — zweryfikowane, że React nie pisze `<style>` ani
  `style=""` do DOM, więc `style-src 'self'` bez `'unsafe-inline'` jest
  bezpieczne), `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`.
- **Naprawiony błąd path traversal**: stary check
  `filePath.startsWith(STATIC_DIR)` błędnie przepuszczał katalogi
  siostrzane dzielące prefiks tekstowy (`/app/dist-evil` przechodzi
  `startsWith('/app/dist')`). Naprawione porównaniem do `staticDir +
  path.sep`. Zweryfikowane testem jednostkowym
  (`rejects sibling-directory prefix confusion`) i ręcznie przez curl
  (`--path-as-is` z literalnym `../../`, wariant zakodowany `..%2f`).
- **`lib.mjs`**: logika bez efektów ubocznych sieciowych (sanityzacja,
  rate limiter, rozwiązywanie ścieżek) wydzielona z `server.mjs` — 21
  testów `node:test`, zero portów TCP w testach.

### 4. Wydajność

- **`manualChunks`**: React/react-dom w osobnym chunku (`vendor-*.js`,
  142 KB / 45 KB gzip) — release aplikacji nie unieważnia cache
  przeglądarki dla Reacta, i odwrotnie. Świadomie NIE zrobiono
  route-based code splitting — rejestr laboratoriów jest synchroniczny,
  od tego zależy zweryfikowane działanie offline PWA i `sims.test.ts`.

### 5. Testy

86 testów frontendowych (było 37) + 21 backendowych (nowość) = **107
testów**, wszystkie w CI (`npm test` w korzeniu odpala oba workspace'y).

Nowe pliki testowe: `storage`, `settings`, `analytics`, `discoveryLog`,
`search`, `registry`, `elements`, `glossary` (frontend) + `lib.test.mjs`
(backend). Ciekawy błąd znaleziony PRZEZ pisanie testów: `core/settings.ts`
wykonuje `readJSON()` na poziomie modułu, natychmiast przy imporcie —
tranzytywny import przez `NarratorPanel → useSettings` cache'ował
`storageAvailable()=false` w współdzielonym module `storage.ts` ZANIM
test zdążył podstawić `localStorage`. Naprawione przez `resetModules()` +
dynamiczny import w testach trwałości; przy okazji dodana strażniczka
`typeof document === 'undefined'` w `applyDocumentFlags` (wcześniej
bezpieczna tylko przypadkiem — w prawdziwej przeglądarce `document`
zawsze istnieje).

### 6. Dokumentacja

`README.md` i `replit.md` opisywały stan z Etapu 0 (10 laboratoriów, brak
backendu, 37 testów) mimo że projekt przeszedł już przez Etap 1, Etap 2 i
pełny audyt produkcyjny — zaktualizowane do rzeczywistego stanu. Nowe:
`ARCHITECTURE.md` (dlaczego, nie co), `CONTRIBUTING.md` (checklist przed
commitem, jak dodać laboratorium/funkcję lokalną), `CHANGELOG.md`.

## Weryfikacja końcowa

```
npx tsc --noEmit         → 0 błędów
npm run lint              → 0 ostrzeżeń (frontend + backend)
npm test                  → 107/107 (86 vitest + 21 node:test)
npm run build              → OK, dist/ 3 pliki (index.html + vendor.js + index.js + css)
```

Ręczna weryfikacja w przeglądarce (Playwright, `vite preview`):
- Wszystkie 4 nowe ekrany (Ustawienia, Dziennik odkryć, Słowniczek,
  Szukaj) renderują się poprawnie, zero błędów w konsoli.
- Paleta poleceń: zapytanie "splatanie" (bez polskich znaków) trafia w
  "Splątanie (CHSH)", Enter nawiguje do `#/lab/quantum`.
- Pułapka fokusu: 6× Tab w nakładce Szukaj, fokus pozostaje w panelu.
- **PWA offline po rebudowaniu z `manualChunks`**: strona główna i
  laboratorium Quantum ładują się poprawnie z `context.setOffline(true)`
  — vendor chunk nie złamał cache'u service workera (cache-first jest
  dynamiczny, nie lista zahardkodowanych nazw plików).
- Bezpieczeństwo na żywo: `curl` na uruchomiony backend potwierdza
  wszystkie nagłówki bezpieczeństwa na `/api/health`, `/` i błędach 403/404;
  traversal (`..%2f`) zwraca 403 z treścią `{"error":"forbidden"}`.

## Czego NIE dało się zrobić autonomicznie (wymaga Twojej decyzji)

- **Klucz `ANTHROPIC_API_KEY`** — warstwa LLM Narratora ("Zapytaj AI")
  działa i jest przetestowana strukturalnie, ale nie może zwrócić
  prawdziwej odpowiedzi bez klucza. To jest oczekiwane i uczciwie
  komunikowane w UI (status "brak klucza" zamiast fałszywej odpowiedzi).
- **Konta użytkowników / baza danych / płatności** — świadomie poza
  zakresem tej sesji (jak wcześniej ustalono); `ARCHITECTURE.md` opisuje
  wzorzec (`core/storage.ts` → moduł domenowy), którym należałoby się
  kierować przy dodawaniu backendu z prawdziwym stanem serwerowym.
- **jsdom / pełne testy DOM w CI** — testy dostępności (fokus, klasy CSS)
  są dziś weryfikowane ręcznymi fake'ami w vitest + jednorazowymi
  przebiegami Playwright, nie zautomatyzowanym pakietem w CI. Dodanie
  jsdom jako zależności dev jest możliwe, ale to nowa zależność —
  zostawione do decyzji, żeby nie naruszać zasady "zero zależności bez
  wyraźnego powodu".
- **Realne wdrożenie na Replit** — kod i konfiguracja (`.replit`) są
  gotowe i zweryfikowane lokalnie identyczną komendą, jakiej użyje
  Deploy, ale rzeczywiste uruchomienie w środowisku Replit wymaga Twojej
  akcji importu/deploya.

## Wniosek

Repozytorium jest dziś w stanie, w którym każda widoczna funkcja jest
albo w pełni działająca (10 laboratoriów, PWA offline, funkcje lokalne,
dostępność), albo jawnie i uczciwie oznaczona jako niepełna wprost w UI —
najbardziej znaczący przykład to laboratorium cząstek: metoda i masy
rezonansów są prawdziwe, ale zbiór zderzeń jest syntetyczny, a UI mówi to
wprost w notatce uczciwości zamiast udawać realne dane (poprzednia wersja
tego zdania w tym raporcie błędnie twierdziła, że dane CERN są już
załadowane — poprawione po ponownej weryfikacji kodu, patrz `README.md` →
"Znane ograniczenia"). Kolejny sensowny krok to Twoja decyzja: import do
Replit i/lub ustawienie klucza AI — obie ścieżki
są przetestowane i udokumentowane (`README.md` → Uruchomienie, `replit.md`
→ Deployment).
