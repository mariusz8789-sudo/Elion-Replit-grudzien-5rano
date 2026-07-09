# Genesis OS

**Genesis OS** — mobilna platforma do eksploracji fizyki, kosmologii i nauki poprzez
interaktywne symulacje oraz warstwę AI. Od kwarku (10⁻¹⁸ m) do obserwowalnego
Wszechświata (8,8×10²⁶ m).

## Obecny stan

- **Scale Journey** — płynna podróż przez 45 rzędów wielkości (ekran główny)
- **10 laboratoriów-pluginów**, każde z wieloma eksperymentami i Narratorem AI:
  Universe, Space-Time, Einstein, Quantum, Atom, Nuclear, Particle, Multiverse,
  Civilization, AI Discovery
- **Narrator AI, dwie warstwy**: deterministyczny silnik liczący realne wielkości
  fizyczne z żywych parametrów symulacji (zawsze aktywny) + opcjonalne pytania
  otwarte przez backend LLM ("Zapytaj AI"), ugruntowane wyłącznie w stanie
  symulacji widocznym na ekranie
- **Etykiety uczciwości naukowej** na każdym module: dokładne wzory / model
  uproszczony / model edukacyjny / hipoteza
- **Realne dane CERN Open Data** (CC0) w laboratorium cząstek
- **PWA w pełni offline** — service worker, manifest, zweryfikowane działanie
  bez sieci
- **Funkcje lokalne, bez konta i bez backendu**: Ustawienia (redukcja ruchu,
  wysoki kontrast, opt-out z lokalnej statystyki aktywności), paleta poleceń
  (`/`), Dziennik odkryć (10 odznak odblokowanych z realnych progów fizycznych),
  Słowniczek — wszystko w `localStorage`, zero transmisji sieciowej
- **Dostępność**: skip link, pułapka fokusu w nakładkach, `aria-live` w
  Narratorze, granica błędu per-laboratorium
- **107 testów** (86 vitest frontend + 21 node:test backend)

## Uruchomienie

```bash
npm install
npm run dev        # frontend: http://localhost:5000
npm test           # 107 testów (fizyka + funkcje lokalne + backend)
npm run build      # produkcyjny build do packages/frontend/dist (PWA offline)

# Opcjonalny backend AI ("Zapytaj AI" w laboratoriach):
ANTHROPIC_API_KEY=sk-ant-... npm run dev:backend   # port 8080
```

Wymagania: Node.js ≥ 18. Bez backendu wszystko poza pytaniami otwartymi do AI
liczy się na urządzeniu i działa w pełni offline (PWA).

## Architektura pluginowa

```
packages/frontend/src/
├── core/        # kontrakty (types.ts), rejestr pluginów, pętla symulacji,
│                # ustawienia/analityka/dziennik odkryć/wyszukiwanie (localStorage)
├── labs/        # laboratoria — niezależne moduły; manifest w index.ts
├── narrator/    # warstwa AI (provider lokalny + interfejs LLM)
├── components/  # UI: LabShell, Controls, NarratorPanel, ScaleJourney,
│                # SettingsScreen, DiscoveryLogScreen, GlossaryScreen, SearchOverlay
└── data/        # dane naukowe (118 pierwiastków, słowniczek pojęć)

packages/backend/src/
├── server.mjs   # http.createServer: static + /api/ask + /api/health
└── lib.mjs      # czysta logika (walidacja, rate limit, ścieżki) — testowana
                 # bez uruchamiania serwera (node --test)
```

Nowe laboratorium = nowy plik w `src/labs/` + jedna linia `registerLab()` w
`src/labs/index.ts`. Rdzeń aplikacji nie zna żadnego laboratorium z nazwy.
Więcej: [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Granica przenośności** (Unity / Unreal / natywnie): logika fizyki
(`update`, `getStats`, parametry) to czysty TypeScript bez zależności od
DOM/Reacta. Web-specyficzny jest tylko cienki adapter renderujący (Canvas 2D)
i UI — patrz komentarz w `src/core/registry.ts`.

## Zasada uczciwości naukowej

Jeżeli czegoś nie da się wiernie zasymulować na telefonie, nie udajemy:
każdy moduł nosi widoczną etykietę poziomu wierności, a hipotezy
(multiwersum, napęd Alcubierre'a, rój Dysona) nigdy nie są przedstawiane
jako fakty.

## Dokumentacja

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — kontrakty, granica przenośności, warstwy AI, bezpieczeństwo
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — konwencje projektu, jak dodać laboratorium, wymagania przed commitem
- [`CHANGELOG.md`](CHANGELOG.md) — historia zmian
- [`SECURITY.md`](SECURITY.md) — model zagrożeń
- [`RESEARCH.md`](RESEARCH.md) i [`knowledge/`](knowledge/) — Genesis Knowledge Base (źródła naukowe per laboratorium)
- Raporty etapów: [`RAPORT-ETAP-0.md`](RAPORT-ETAP-0.md) · [`RAPORT-ETAP-1.md`](RAPORT-ETAP-1.md) ·
  [`RAPORT-ETAP-2.md`](RAPORT-ETAP-2.md) · [`RAPORT-AUDYT.md`](RAPORT-AUDYT.md)

Wdrożenie: Replit (Run/Deploy) albo `docker compose up --build`.
