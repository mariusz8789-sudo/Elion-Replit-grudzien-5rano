# Genesis City Disaster (PROPOSED — REQUIRES REPO INTEGRATION — NOT EXECUTED BY QWEN)
Modules: GenesisCityDigitalTwin (view-model adapter over core generator), GenesisDisasterEngine (real-time SEIR/flood/blast wrapper), CityDisasterController (UI/renderer bridge, append-only telemetry, technical traceChecksum — NOT SHA-256 custody).
Imports use alias '@genesis/core/city-enterprise/...'; Claude must wire this alias (or switch to relative monorepo path) in tsconfig/bundler.
Labels: DISASTER_SCENARIO / SYNTHETIC_CRISIS_MODEL on all snapshots. Never present as real forecast.
Integration: place under packages/frontend/src/core/city/; connect controller frames to existing renderer/telemetry; do not change Winner Gate/prereg; no secrets.
Rollback: delete the three module files + test; no migrations.
