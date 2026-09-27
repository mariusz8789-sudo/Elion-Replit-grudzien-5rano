# Genesis OS

## Overview
Mobilna platforma symulacyjna (PWA): fizyka, kosmologia i nauka przez
interaktywne symulacje + warstwa AI. Monorepo z dwoma workspace'ami:
`packages/frontend` (React PWA) i `packages/backend` (proxy LLM + serwer
statyczny produkcyjny, zero zależności poza `@anthropic-ai/sdk`).

## Running
- `npm run dev` — Vite dev server na porcie 5000 (proxy /api → 8080)
- `npm run dev:backend` — backend AI (wymaga ANTHROPIC_API_KEY; bez klucza
  serwer i tak startuje, "Zapytaj AI" zwraca uczciwy komunikat 503)
- `npm test` — 107 testów: 86 vitest (frontend) + 21 node:test (backend)
- `npm run build` — build produkcyjny (PWA offline)
- `npm run lint` / `npm run format` — ESLint (flat config) / Prettier

## Deployment (Replit)
- **Run**: `npm run dev` (Vite dev server, port 5000)
- **Deploy**: `node packages/backend/src/server.mjs` — serwuje static build
  z `packages/frontend/dist` + `/api/*`; ustaw `ANTHROPIC_API_KEY` w
  Secrets, jeśli chcesz aktywną warstwę LLM Narratora

## Architecture
- **Frontend**: React 18 + Vite + TypeScript, canvas 2D, zero dodatkowych
  zależności runtime poza React
- **Pluginy**: laboratoria rejestrowane w `src/labs/index.ts`; kontrakty w
  `src/core/types.ts`; fizyka oddzielona od UI (przenośna na inne silniki)
- **Narrator AI**: `src/narrator/engine.ts` — deterministyczny provider
  lokalny (zawsze aktywny) + `src/narrator/askAI.ts` → backend `/api/ask`
  (opcjonalny LLM, ugruntowany wyłącznie w stanie symulacji)
- **Funkcje lokalne** (`src/core/`): `settings.ts`, `analytics.ts`,
  `discoveryLog.ts`, `search.ts` — wszystkie na `storage.ts` (bezpieczny
  wrapper localStorage, no-op gdy niedostępny), zero backendu
- **Backend**: `http` moduł Node (bez Express); czysta logika wydzielona do
  `lib.mjs` (testowalna bez portu); nagłówki bezpieczeństwa na każdej
  odpowiedzi (CSP, X-Frame-Options, Permissions-Policy, ...)
- **Środowisko**: brak wymaganych zmiennych środowiskowych — aplikacja
  działa w pełni bez `.env` (AI po prostu nieaktywna)

## Conventions
- Każdy moduł symulacji nosi etykietę uczciwości naukowej
  (exact / simplified / educational / theoretical) — hipotezy nigdy nie
  udają faktów; to twarda zasada produktu
- Język UI: polski
- Nowe laboratorium: plik w `src/labs/` + `registerLab()` w manifeście
- Każdy nowy moduł projektuje się w oparciu o `knowledge/<lab>.md`
  (Genesis Knowledge Base) i aktualizuje ją w tym samym commicie
- Szczegóły konwencji i checklisty przed commitem: [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
