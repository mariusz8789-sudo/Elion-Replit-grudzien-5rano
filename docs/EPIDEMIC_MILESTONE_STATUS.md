# Epidemic milestone status

## CTO decision

Epidemic is **connected at the Experiment Fabric and renderer handoff level**. No change to `EpidemicCitySimulation` was required. Science Chat creates a structured request, validates a preflight plan, confirms the existing `epidemic-city` model, executes one deterministic run, and receives a live-world route.

## Verified flow

`Science Chat → StructuredExperimentRequest → validation → Experiment Fabric → EpidemicCitySimulation → ExperimentRun → provenance → live-world handoff → HighFidelitySliceScreen`

The actual route in the LIVE contract is `#/hf-slice`, not `#/city3d`. The high-fidelity screen consumes the original `EpidemicCitySimulation` reference once through `worldHandoff`; it does not create a second simulation or renderer. This is an important product distinction and must not be reported as a `#/city3d` proof.

## Evidence boundary

A confirmed single run carries provenance and result/event summaries. The user-facing Evidence Guided Chat contract honestly reports `PROTOCOL_REQUIRED` for a formal evidence pack and `VARIANT_REQUIRED` for A/B or counterfactual comparison. No evidence pack or counterfactual result is fabricated.

## Regression fixed during gate

Chromium smoke exposed a real runtime error in the existing Universe collision laboratory. The frame step was clamped before, but the UI speed multiplier was applied after the clamp and could produce `dt > 0.03`. The final step is now clamped after speed scaling, with a regression test through the existing `universeCollision.createSim()` factory. This does not alter the scientific equations or scenario parameters.

## Quality gate

| Gate | Result |
|---|---|
| Focused Fabric, World Engine, visual and Universe tests | PASS; 114 tests |
| Full repository tests | PASS during the previous LIVE gate |
| TypeScript | PASS |
| Lint | PASS |
| Production build | PASS; chunk-size warning remains informational |
| `git diff --check` | PASS |
| Desktop Chromium smoke | PASS; 27 routes + 13 labs, 242 interactions, zero runtime errors |
| Mobile Chromium smoke | PASS; 27 routes + 13 labs, 238 interactions, zero runtime errors |
| GitHub Actions | PASS on CI run `33033847918` for the preceding code commit |

## Remaining limitation

The interactive browser session can lose its document while navigating from Science Chat to `#/hf-slice`, so that session is not used as visual evidence. Repository-native desktop and mobile smoke both pass the route sweep with zero runtime errors. A future UI proof should capture the loaded high-fidelity screen explicitly, but no new renderer or architecture should be introduced for that purpose.

## Status

Epidemic is **DONE for the current integration contract**, with the explicit UI proof limitation above. It is not a claim that the model predicts real-world epidemics, and it is not a claim that formal evidence or A/B comparison exists without a preregistered protocol and second variant.
