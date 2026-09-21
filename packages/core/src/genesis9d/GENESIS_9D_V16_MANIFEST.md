# GENESIS OMNI-CORE V16 — UNIFIED 9D MANIFEST
| Moduł | Ścieżka | dataLabel | Testy | Status |
|---|---|---|---|---|
| IceWall Beyond | genesis9d/GenesisIceWallBeyondEngine.ts | SYNTHETIC_GEO_EXPLORATION | ice-wall-beyond.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Pyramid Interior | genesis9d/GenesisPyramidInteriorEngine.ts | SYNTHETIC_ARCHAEO_RECONSTRUCTION | pyramid-interior.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Chronos Scale | genesis9d/GenesisChronosScaleEngine.ts | SYNTHETIC_CHRONO_MODEL | chronos-scale.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Time-Machine Core | genesis9d/GenesisMathematicalTimeMachineCore.ts | RELATIVISTIC_SIMULATION | time-machine-core.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Platform UX | genesis9d/GenesisPlatformUXEnvironment.ts | (UX state) | platform-ux.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
| Interactive Entity | genesis9d/GenesisInteractiveEntityEngine.ts | SYNTHETIC_HISTORICAL_NPC | interactive-entity.test.ts | CODE-COMPLETE (v2: chained dialogue ledger), DETERMINISTIC, NOT-EXECUTED |
| Genealogical Tree | genesis9d/GenesisGenealogicalTreeEngine.ts | GENETIC_HISTORICAL_ESTIMATE | genealogical-tree.test.ts | CODE-COMPLETE, DETERMINISTIC, NOT-EXECUTED |
Gwarancje: zero Math.random/Date.now; mulberry32(seed)+Clock; append-only ledgery SHA-256 (ekspedycje, skoki czasowe, utterances, linki genealogiczne); każdy moduł ma disclaimer(); równania fizyczne (Kretschmann, Lorentz, Tesla, Dirac) jawne w kodzie i logach.
Rollback: usunąć katalog genesis9d/; brak sprzężeń z Winner Gate / danymi klinicznymi.

ACTION STEPS FOR MANUS:
 * Write the 5 files above to packages/core/src/genesis9d/.
 * Update packages/core/src/genesis9d/index.ts to export all entities and tree tools.
 * Run tests: npx vitest run packages/core/src/genesis9d/
 * Run project build: npm run build
 * Report final status in console format.
