# Genesis OS

## Overview
Mobilna platforma symulacyjna (PWA): fizyka, kosmologia i nauka przez
interaktywne symulacje + warstwa AI. Monorepo z jednym workspace
(packages/frontend); backend dojdzie w Etapie 1 (proxy LLM).

## Running
- `npm run dev` — Vite dev server na porcie 5000
- `npm run build` — build produkcyjny

## Architecture
- **Frontend**: React 18 + Vite + TypeScript, canvas 2D, zero dodatkowych
  zależności runtime poza React
- **Pluginy**: laboratoria rejestrowane w `src/labs/index.ts`; kontrakty w
  `src/core/types.ts`; fizyka oddzielona od UI (przenośna na inne silniki)
- **Narrator AI**: `src/narrator/engine.ts` — provider lokalny aktywny,
  interfejs LLM czeka na Etap 1
- **Środowisko**: brak zmiennych środowiskowych i backendu w Etapie 0

## Conventions
- Każdy moduł symulacji nosi etykietę uczciwości naukowej
  (exact / simplified / educational / theoretical) — hipotezy nigdy nie
  udają faktów; to twarda zasada produktu
- Język UI: polski
- Nowe laboratorium: plik w `src/labs/` + `registerLab()` w manifeście
- Każdy nowy moduł projektuje się w oparciu o `knowledge/<lab>.md`
  (Genesis Knowledge Base) i aktualizuje ją w tym samym commicie
