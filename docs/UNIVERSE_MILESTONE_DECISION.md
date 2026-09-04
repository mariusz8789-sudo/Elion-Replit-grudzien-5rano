# CTO decision: next Universe milestone

After the green Particle Energy gate, the next active Universe milestone is **bounded stellar scaling (`universe-starlife`)**. The model already exists in the Fabric registry, parser, Universe Lab and regression tests. It computes the documented toy observables for a star mass input and explicitly discloses that it is not a full stellar-evolution solver and does not integrate stellar interiors.

This is preferable to exposing Discovery Timeline as if it were a solver. Discovery Timeline remains a narrative visualization and is not promoted to a scientific execution capability by this milestone.

## Scope

The only implementation scope is discoverability in Science Chat and a guided-flow regression proving: natural-language request → structured request → validated plan → existing `universe-starlife` executor → Universe Lab route → provenance capsule with honest Evidence/Replay status.

## Non-scope

No new stellar physics, no real-time astrophysical forecast, no N-body work, no GIS/data ingestion, no second renderer/world, and no claim of predicting a star's actual fate.

## Acceptance gate

The milestone is connected only if the existing model, route and capsule pass tests; TypeScript, lint, build, diff-check, desktop/mobile Chromium smoke and GitHub Actions remain green. The model's existing limitations stay visible.
