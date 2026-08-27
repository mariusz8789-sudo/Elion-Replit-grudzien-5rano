# Genesis Phase 3 readiness

## Decision summary

Earthquake is the completed reference vertical slice and is not the only future direction. The next Phase 3 candidate should be one existing, bounded spacetime experiment that already has a parser route, Fabric model, deterministic executor, and an existing lab visualization. Do not start wormholes, branching timelines, 4D worlds, or a new renderer as a bundle.

| Candidate | Existing model/solver | Science Chat parser | Fabric route/executor | Existing visualization | Evidence/Replay fit | Readiness |
|---|---|---|---|---|---|---|
| Minkowski 1+1D | `runMinkowskiScenario` | `spacetime-minkowski` | yes | numeric/canvas-2d | high through existing Fabric run/provenance | **highest** |
| Schwarzschild radius | `schwarzschildRadius` | `einstein-schwarzschild` | yes | numeric/graph/scene-3d | high through existing Fabric run/provenance | high |
| Schwarzschild geodesic | existing geodesic model | `einstein-schwarzschild-geodesic` | yes | numeric/graph/canvas-2d | high | high, but narrower UI proof |
| c-Slider | bounded existing thought-experiment graph | `spacetime-c-slider` | yes | existing spacetime lab | medium; must preserve thought-experiment disclosure | medium |
| Wormhole / grandfather paradox | no verified solver contract in current Fabric | not a completed Fabric path | no | conceptual/partial only | low | **NOT READY** |
| Branching / 4D world | no verified shared world contract | no completed route | no | no approved single-world implementation | low | **PARK** |
| Particle Lab expansion | several existing educational models | partial/existing routes | mixed | existing lab | medium | defer until one spacetime slice is complete |

## Recommended next milestone

Select **Minkowski 1+1D** as the next Phase 3 candidate if the product wants a small, honest relativity proof. It is bounded, deterministic, already routed by Science Chat, and explicitly discloses that it uses two fixed events, unit convention `c=1`, and no acceleration, general relativity, body dynamics, or observational data. The implementation should extend the existing Experiment Fabric flow rather than create a new orchestration layer.

Schwarzschild radius is the secondary candidate because it already has a scene-3d route, but it should be selected only if the product goal is a stronger visual demo. It still remains an analytical calculation, not an astrophysical observation or full black-hole simulation.

## Entry gate

Before Phase 3 implementation, keep the following gate green: Earthquake Chat flow remains green; frontend and backend tests pass; desktop and mobile Chromium smoke pass with backend running; no new renderer/world is introduced; unsupported relativity claims remain `NOT_MODELED` or explicitly hypothetical; Evidence and Replay use current Fabric contracts.
