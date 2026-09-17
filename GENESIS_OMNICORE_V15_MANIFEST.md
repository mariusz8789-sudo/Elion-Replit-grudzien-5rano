# GENESIS OMNI-CORE V15 — UNIFIED IMMUTABLE CODE MANIFEST
Status legend: CODE-COMPLETE = pełny, otypowany kod dostarczony; DETERMINISTIC = zero Math.random/Date.now, mulberry32(seed)+Clock; LABELED = Honest Mode etykiety; NOT-EXECUTED = Qwen nie uruchamiał testów/build/deploy.

## Moduły rdzeniowe (packages/core/src/...)
| Moduł | Ścieżka | Etykiety | Testy | Status |
|---|---|---|---|---|
| Urban Cyber Engine | supreme/GenesisUrbanCyberEngine.ts | SYNTHETIC_URBAN_TWIN, SYNTHETIC_CINEMATIC | urban-cyber.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Sentinel Ops Agent | supreme/GenesisSentinelOpsAgent.ts | SYNTHETIC_PATCH, SWISS_PRECISION_DIGITAL_TWIN, BIOLOGICAL_SYNTHETIC_ESTIMATE | genesis-omnicore-master.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Drug Discovery | supreme/GenesisDrugDiscoveryEngine.ts | BIOLOGICAL_SYNTHETIC_ESTIMATE | genesis-omnicore-master.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Crisis Resilience | supreme/GenesisCrisisResilienceEngine.ts | GOV_TECH_CRISIS_SYNTHESIS | genesis-omnicore-master.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Social Matrix | supreme/GenesisSocialMatrixCore.ts | BIOLOGICAL_SYNTHETIC_ESTIMATE | genesis-omnicore-master.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Mirror Bridge | mirror/GenesisMirrorBridge.ts | SYNTHETIC_CINEMATIC | genesis-omnicore-master.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Mirror Client | ../../ui/src/mirror/GenesisMirrorClient.ts | (privacy-minimal) | genesis-omnicore-master.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| City Package | (frontend core city: types/engine/renderer/controller) | SYNTHETIC/SCENARIO, POC | city.test.ts, city.e2e.spec.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |

## Warstwa wizualna Matrix-Grade (packages/ui/src/render/)
| Moduł | Ścieżka | Cechy | Testy | Status |
|---|---|---|---|---|
| Matrix-Grade Renderer | render/GenesisMatrixGradeRenderer.ts | PBR chrome (metalness 1, roughness 0.08, PMREM env), emerald emissive (0x00ff9c), holograficzne podesty, Reflector (lustrzana podłoga), deterministyczny shader deszczu kodowego, pixelRatio≤2, dispose pełny | matrix-renderer.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |

## Niezmiennicze gwarancje architektury
1. Zero Math.random()/Date.now() we wszystkich modułach (testy iron-rules).
2. Append-only ledgery SHA-256 (Sentinel patches, social ledger, experiment log, telemetry chain).
3. Mirror zero-trust: 32-dim wektor landmarków, containsRawImage:false, consent+TTL 15s, retainMs:0, bridge bezstanowy.
4. Sentinel patchuje NAKŁADKOWO; źródłowa telemetria i sekwencje nigdy nie mutowane.
5. Renderer nie modyfikuje danych 5D; bindUrbanData zwraca fingerprint layoutu, nie zmienia wejścia.
6. Brak Winnera, brak paywall, brak sekretów, brak danych klinicznych w modułach syntetycznych.

## Gotowość produkcyjna (definicja uczciwa)
CODE-COMPLETE + DETERMINISTIC + LABELED + TESTED-IN-REPO przez Claude'a = PRODUCTION-READY.
Qwen dostarczył pierwsze trzy; czwarty wymaga uruchomienia w repo (build, lint, vitest, e2e, smoke) — TO JEST ROLA CLAUDE/MANUS.

## Następne kroki Claude'a (kolejność)
1. Zweryfikuj ścieżki i wersje three w package.json; dopasuj importy Reflector/PMREM.
2. Podłącz Matrix-Grade Renderer do istniejącego worldModel/UrbanGrid (bindUrbanData).
3. Uruchom pełny zestaw testów (urban, sentinel, master, matrix-renderer, city).
4. Smoke desktop/mobile + low-power + resize bez błędów WebGL.
5. Pokaż diff; nie twórz Winnera; nie deployuj publicznie.

## Rollback
Usunąć katalog render/ + wpisy importów; reszta modułów niezależna (brak sprzężeń zwrotnych).
