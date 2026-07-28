# Genesis OS — Raport Etapu 2 (jakość produkcyjna / przygotowanie do bety)

Data: 2026-07-08
Zasada etapu: **zero nowych funkcji ponad zatwierdzoną listę — jakość, testy, offline, AI backend, wydajność, audyt.**

## Co zostało wykonane

**1. Testy jednostkowe i integracyjne (vitest) — 37 testów, wszystkie zielone**
- `core/physics.ts` — nowy moduł czystych funkcji fizycznych (γ, transformacja
  Lorentza, soczewka punktowa, prawo rozpadu, wzór Sagana, r_s, korelacje
  singletu, CHSH) współdzielony przez symulacje i testy
- Testy naukowe z twardymi asercjami: kwantowe próbkowanie łamie nierówność
  Bella (S > 2,6), model ukrytych zmiennych nigdy (S < 2,1); iloczyn pozycji
  obrazów soczewki = −θ_E²; kolejność zdarzeń przestrzennopodobnych odwraca
  się z obserwatorem; transmisja tunelowania > 0 poniżej bariery i rośnie
  z energią; FFT: roundtrip + twierdzenie Parsevala
- Testy integracyjne: KAŻDY eksperyment każdego laboratorium przechodzi
  120 kroków symulacji bez wyjątków, ze skończonymi statystykami i działającą narracją

**2. Splątanie kwantowe (CHSH)** — ostatni element planu Etapu 2 sprzed
zaostrzenia priorytetów: eksperyment "pokonaj lokalny realizm" w Quantum Lab;
zmierzono |S| = 2,849 ≈ 2√2 w trybie kwantowym, |S| ≤ 2 w trybie ukrytych zmiennych.

**3. PWA z pełnym działaniem offline — ZWERYFIKOWANE**
- manifest.webmanifest + ikony 192/512 + service worker (network-first dla
  nawigacji, cache-first dla hashowanych zasobów, /api nigdy nie cache'owane)
- Test przeglądarkowy: po odcięciu sieci aplikacja ładuje się z cache —
  wszystkie 10 laboratoriów działa offline (symulacje i narrator deterministyczny
  liczą się na urządzeniu)

**4. Backend AI (Claude) — `packages/backend`**
- Proxy `POST /api/ask` (Node, zero zbędnych zależności, oficjalny SDK
  `@anthropic-ai/sdk`, model `claude-opus-4-8`)
- Grounding wymuszony architektonicznie: model dostaje wyłącznie stan
  symulacji widoczny na ekranie + twarde zasady (liczby tylko z symulacji,
  hipotezy oznaczane, zero "odkryć"); prompt cache'owany
- Bezpieczeństwo: klucz tylko po stronie serwera, limit 16 kB/żądanie,
  pytanie ≤ 500 znaków, rate limit 10/min/IP, obsługa `stop_reason: refusal`
- UI "Zapytaj AI" w każdym laboratorium; bez klucza/backendu uczciwy komunikat,
  a warstwa deterministyczna działa dalej (zweryfikowane w przeglądarce)
- Uruchomienie: `ANTHROPIC_API_KEY=... npm run dev:backend` + `npm run dev`

**5. Wydajność mobilna**
- Pełna pauza pętli symulacji, gdy aplikacja w tle (visibilitychange) — realna
  oszczędność baterii
- Throttling odświeżania narracji do 1×/s — usunięty jank przerysowań
- DPR ograniczone do 2; bundle 92 kB gzip (bardzo lekki)

**6. Audyt i naprawy**
- [UX, wykryte testem] przyciski "uciekające" spod palca przy szybkozmiennych
  statystykach → throttling narracji (pkt 5)
- [Etap 0, pkt 2] Universe Lab: kamera oddala się częściowo przy dużej
  ekspansji — galaktyki nie znikają z ekranu
- [typy] `vite/client` w tsconfig; brak błędów konsoli na żadnym ekranie
- [bezpieczeństwo] przegląd: klucz API nieosiągalny z frontendu; SW nie
  cache'uje /api; brak zewnętrznych zależności runtime poza React i SDK;
  wejście użytkownika do LLM przycinane i limitowane

## Czego nie udało się zrobić (uczciwie)

**Realne dane CERN Open Data**: proxy sieciowe środowiska budowania blokuje
`opendata.cern.ch` (403). Zrobione zamiast tego: punkt podpięcia w kodzie —
wystarczy lokalnie pobrać CSV (rekord 545, CC0), zapisać masy do
`src/data/dimuon-real.ts`, a "Odkryj cząstkę" automatycznie przełączy się
z generatora syntetycznego na odtwarzanie realnych zdarzeń. Instrukcja w kodzie.

**Odpowiedź LLM end-to-end nie testowana z prawdziwym kluczem** — środowisko
nie ma ANTHROPIC_API_KEY. Cała ścieżka (frontend → proxy → backend → obsługa
błędów) zweryfikowana; do przetestowania z kluczem po Twojej stronie.

## Gotowość do bety

Aplikacja jest gotowa do zamkniętej bety: build produkcyjny w `packages/frontend/dist`
(statyczny hosting + opcjonalny backend AI), PWA instalowalna na telefonie,
działa offline, 37 testów w CI-ready `npm test`. Sugerowany zakres bety:
10–30 osób (nauczyciele fizyki + entuzjaści), zbierać: retencję 7-dniową,
najczęściej otwierane laboratoria, pytania zadawane AI.

## Następny krok (propozycja)
1. Beta: deploy frontendu (dowolny statyczny hosting) + backend z kluczem
2. Realne dane CERN wg instrukcji w kodzie (jednorazowe, ~30 min lokalnie)
3. Po feedbacku bety: decyzja o kolejnych pogłębieniach wg knowledge/
