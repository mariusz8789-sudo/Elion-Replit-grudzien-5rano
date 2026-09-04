# Claude Assignment — Genesis Campaign / Discovery Audit

## Rola

Działasz jako **Scientific Systems Review Engineer** dla Genesis Scientific Discovery OS. Manus pozostaje głównym integratorem i źródłem prawdy dla LIVE. Nie scalaj niczego samodzielnie do LIVE. Pracuj na świeżym branchu od aktualnego `origin/manus/high-fidelity-epidemic-digital-twin`.

## Kontekst LIVE

Genesis ma już zweryfikowane: Earthquake vertical slice, Epidemic → City3D same-world handoff, Minkowski, Schwarzschild radius, geodesics, c-Slider, Particle Energy, Universe models, Science Chat deterministic parser/router, Evidence/Replay entry point, Protocol / A-B designer, WHY / Next Experiment oraz Genesis Observatory visual language.

Raport Phase 3 wskazuje, że Discovery/Campaign nie są jednym pipeline’em. Istnieją osobne ścieżki: Experiment Fabric (`runExperiment`, `scientificExecutor`), starszy discovery engine (`scenarioEngine`, `discoveryReplay`, epidemic-domain path) oraz backend-driven Campaign (`CampaignScreen`, campaign persistence, async jobs, candidates, decisions, graph, WHY i science-runs).

## Jeden cel

Wykonaj **jeden** audyt techniczny i doprowadź go do decyzji `ACCEPT`, `ADAPT`, `PARK` albo `REJECT`.

Twoje pytanie brzmi:

> Czy istnieje bezpieczny, mały thin adapter, który może odsłonić istniejący Campaign/Discovery workflow w Genesis bez utworzenia drugiego routera, drugiego Evidence, drugiego Replay, drugiego WorldState, drugiego renderera lub drugiego źródła prawdy dla provenance?

Nie buduj szerokiego mostu między trzema systemami. Jeśli odpowiedź brzmi „nie”, formalny blocker jest poprawnym i wartościowym wynikiem.

## Obowiązkowy zakres audytu

Sprawdź aktualny LIVE HEAD, working tree i diff brancha. Następnie przeanalizuj tylko faktycznie związane kontrakty:

- `packages/frontend/src/core/experimentFabric/scientificExecutor.ts`;
- `packages/frontend/src/core/experimentFabric/evidencePack.ts`;
- `packages/frontend/src/core/experimentFabric/evidencePackRoCrate.ts`;
- `packages/frontend/src/core/discovery/*`;
- `packages/frontend/src/core/simulation/scenarioEngine.ts`;
- `packages/frontend/src/core/discovery/discoveryReplay.ts`;
- `packages/frontend/src/components/CampaignScreen.tsx`;
- `packages/frontend/src/core/backend/client.ts` campaign functions;
- backend `campaign/*`, API routes, persistence, jobs i event lineage;
- istniejące testy i skrypty campaign demo.

Dla każdego pipeline’u określ: wejście, model/engine, storage, provenance, status epistemiczny, replay, Evidence Pack, auth/RBAC, async execution, cancellation, route oraz możliwość bezpiecznego odczytu z Science Chat.

## Warunki ACCEPT / ADAPT

Zmiana może zostać zaakceptowana tylko, gdy:

1. nie powiela żadnego istniejącego routera, Evidence, Replay, WorldState ani renderera;
2. nie uruchamia kampanii z samej sugestii lub nawigacji Science Chat;
3. zachowuje backend auth/RBAC, project scope, job cancellation i persistence;
4. nie miesza chemicznego Campaign z epidemic-domain discovery bez jawnego kontraktu domenowego;
5. nie zmienia wyników ani provenance istniejącego Experiment Fabric;
6. pokazuje brakujące pola jako `PARTIAL`, `NOT_CONNECTED`, `BLOCKED` lub `NOT_MODELED`;
7. ma test deterministyczny, route proof i rollback path;
8. nie zmienia żadnego naukowego claimu i nie dodaje fikcyjnych danych.

Najbardziej prawdopodobny bezpieczny wynik to read-only entry point do już istniejącego `#/campaign`, ale sprawdź, czy ta nawigacja nie tworzy fałszywego wrażenia, że Science Chat steruje backendową kampanią.

## Czego bezwzględnie nie robić

Nie dodawaj nowych solverów, hazardów, GIS/live fetch, Matrix, Collidera, drugiego renderera, drugiego CityWorld, parser-only scientific cards, CRISPR/therapy claims, toxic dispersion, wildfire, power-grid cascade, FEA, czasu 2222 ani franczyzowych assetów/stylów. Nie kopiuj już wykonanych zmian Epidemic, Schwarzschild, Particle, Universe, Protocol, WHY ani visual refresh.

Nie twórz syntetycznych kandydatów, fake counters, fake terminal state ani „odkryć” z samych metadanych. Campaign chemistry remains a bounded model/search-control layer; it is not docking, MD, QM, ADMET, toxicity, binding affinity, therapeutic value or clinical outcome.

## Wymagany rezultat

### Jeśli ACCEPT / ADAPT

Dostarcz minimalną zmianę, najlepiej thin read-only adapter, z testem resolvera/UI i dokumentem `docs/CTO_DISCOVERY_CAMPAIGN_DECISION.md`. Dokument musi zawierać dokładny diff, reuse points, ograniczenia, statusy epistemiczne i instrukcję integracji dla Manus.

### Jeśli PARK / REJECT / BLOCKER

Nie implementuj pozornego mostu. Dodaj lub zaktualizuj `docs/CTO_DISCOVERY_CAMPAIGN_DECISION.md` z tabelą:

| Pipeline | Status | Dlaczego | Następny bezpieczny krok |
|---|---|---|---|
| Experiment Fabric |  |  |  |
| Discovery engine |  |  |  |
| Campaign backend |  |  |  |
| Cross-pipeline bridge |  |  |  |

Wskaż konkretne niekompatybilne kontrakty, pliki, wymagania auth/provenance/replay i koszt przyszłego adaptera. Formalny blocker nie jest porażką, jeśli zapobiega drugiemu Evidence/Replay systemowi.

## Definition of Done

Przed raportem końcowym wykonaj: frontend tests, backend tests jeśli dotykasz backendu, TypeScript, lint, production build, `git diff --check`, Chromium desktop smoke, Chromium mobile smoke, rzeczywisty proof route albo uczciwy proof blockera, GitHub Actions green, clean working tree, commit i push do własnego brancha.

Nie merge’uj do LIVE. Raport musi podać branch, aktualny base SHA, commity, diff stat, decyzję, testy, CI, Chromium, pliki do ewentualnego przeniesienia przez Manus oraz pliki/zmiany, których Manus nie powinien przenosić.

Po zamknięciu tego zadania nie rozpoczynaj nowej capability. Następny milestone zostanie wybrany przez Manus po review decyzji.
