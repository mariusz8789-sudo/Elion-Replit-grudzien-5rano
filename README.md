# Genesis OS

**Genesis OS** — mobilna platforma do eksploracji fizyki, kosmologii i nauki poprzez
interaktywne symulacje oraz warstwę AI. Od kwarku (10⁻¹⁸ m) do obserwowalnego
Wszechświata (8,8×10²⁶ m).

## Etap 0 — fundament (obecny stan)

- **Scale Journey** — płynna podróż przez 45 rzędów wielkości (ekran główny)
- **10 laboratoriów-pluginów**, każde z działającą symulacją i Narratorem AI:
  Universe, Space-Time, Einstein, Quantum, Atom, Nuclear, Particle, Multiverse,
  Civilization, AI Discovery
- **Narrator AI** — lokalny silnik narracji liczący realne wielkości fizyczne
  z żywych parametrów symulacji (interfejs pod LLM gotowy na Etap 1)
- **Etykiety uczciwości naukowej** na każdym module: dokładne wzory / model
  uproszczony / model edukacyjny / hipoteza

## Uruchomienie

```bash
npm install
npm run dev        # frontend: http://localhost:5000
npm test           # 37 testów fizyki (vitest)
npm run build      # produkcyjny build do packages/frontend/dist (PWA offline)

# Opcjonalny backend AI ("Zapytaj AI" w laboratoriach):
ANTHROPIC_API_KEY=sk-ant-... npm run dev:backend   # port 8080
```

Wymagania: Node.js ≥ 18. Bez backendu wszystko poza pytaniami otwartymi do AI
liczy się na urządzeniu i działa w pełni offline (PWA).

## Architektura pluginowa

```
packages/frontend/src/
├── core/        # kontrakty (types.ts), rejestr pluginów, pętla symulacji
├── labs/        # laboratoria — niezależne moduły; manifest w index.ts
├── narrator/    # warstwa AI (provider lokalny + interfejs LLM)
├── components/  # UI: LabShell, Controls, NarratorPanel, ScaleJourney
└── data/        # dane naukowe (118 pierwiastków itd.)
```

Nowe laboratorium = nowy plik w `src/labs/` + jedna linia `registerLab()` w
`src/labs/index.ts`. Rdzeń aplikacji nie zna żadnego laboratorium z nazwy.

**Granica przenośności** (Unity / Unreal / natywnie): logika fizyki
(`update`, `getStats`, parametry) to czysty TypeScript bez zależności od
DOM/Reacta. Web-specyficzny jest tylko cienki adapter renderujący (Canvas 2D)
i UI — patrz komentarz w `src/core/registry.ts`.

## Zasada uczciwości naukowej

Jeżeli czegoś nie da się wiernie zasymulować na telefonie, nie udajemy:
każdy moduł nosi widoczną etykietę poziomu wierności, a hipotezy
(multiwersum, napęd Alcubierre'a, rój Dysona) nigdy nie są przedstawiane
jako fakty.

Raporty rozwoju: [`RAPORT-ETAP-0.md`](RAPORT-ETAP-0.md) · [`RAPORT-ETAP-1.md`](RAPORT-ETAP-1.md) ·
[`RAPORT-ETAP-2.md`](RAPORT-ETAP-2.md) · [`RAPORT-AUDYT.md`](RAPORT-AUDYT.md) (gotowość produkcyjna).
Bezpieczeństwo: [`SECURITY.md`](SECURITY.md). Wdrożenie: Replit (Run/Deploy) albo `docker compose up --build`.
