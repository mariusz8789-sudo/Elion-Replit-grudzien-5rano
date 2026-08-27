# Phase 3 milestone: Minkowski 1+1D

## Selection

Minkowski 1+1D is the selected first Phase 3 milestone. It is already implemented as `spacetime-minkowski`, already recognized by Science Chat, already admitted by the Experiment Fabric router, and already executed by the deterministic `runMinkowskiScenario` path. The milestone is therefore an **integration and product-proof pass**, not a new physics solver.

## Existing path to preserve

`parseScienceChatMessage` → `spacetime-minkowski` → existing `ExperimentPlan`/`ExperimentRun` → `runMinkowskiScenario` → current lab route/visualization → current provenance and replay contracts.

The model is explicitly limited to two fixed events in 1+1 dimensions, with the convention `c=1` and bounded β. It does not represent acceleration, general relativity, body dynamics, physical wormholes, time travel, observational data, or a prediction about the universe.

## Thin-adapter scope

The next implementation may only:

1. verify that a natural-language Minkowski request reaches the existing model through Science Chat;
2. expose the existing plan parameters and limitations before confirmation;
3. show the existing computed outputs and units after confirmation;
4. preserve provenance, deterministic fingerprinting, and replay status;
5. make unsupported claims such as “zbuduj wehikuł czasu” resolve to an explicit `NOT_MODELED` or hypothetical response;
6. add regression tests and Chromium proof for the route.

No new router, solver, evidence registry, replay verifier, world, renderer, or LLM call is authorized for this milestone.

## Definition of Done

| Gate | Required proof |
|---|---|
| Request | Polish and English bounded Minkowski requests parse to `spacetime-minkowski` |
| Plan | User sees β bounds, model assumptions, visualization route, and limitations before execution |
| Execution | Existing deterministic runner returns numeric outputs and ordering |
| Honesty | No acceleration/OTW/wormhole/time-travel claim is upgraded to a physical result |
| Provenance | Existing Fabric fingerprint and provenance are present |
| Replay | Existing replay status is preserved and mismatch is not hidden |
| UI | Science Chat opens the existing Spacetime lab route with no blank state or blind action |
| Quality | Frontend/backend tests, typecheck, lint, build, desktop/mobile smoke, and CI remain green |

## Entry condition

Do not begin coding until the Earthquake Chat gate remains green and the current LIVE branch is clean. If any change would require a second renderer or a new world state, stop and return to review rather than expanding scope.
