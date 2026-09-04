# Review: Gemini Package 06 — `genesis-chat-experiment-bridge`

## Decision

**Do not integrate as-is.** The package is conceptually useful as a state-machine checklist, but it is not compatible with the current LIVE Genesis contracts and would duplicate existing orchestration.

## Existing LIVE equivalent

The current repository already has the relevant execution seam in `packages/frontend/src/core/experimentFabric/evidenceGuidedChat.ts`, with `ScienceChat.tsx` handling plan confirmation and asynchronous execution. Earthquake is already dispatched through `executeEarthquakeCommandCenterScenario`, which returns the existing envelope containing ImpactResult, DamageAssessment, CityWorld projection, evidence/provenance information, and replay status. `earthquakeChatBridge.ts` is the existing thin handoff to the one City3D renderer.

Therefore a new `ChatExperimentBridge` would create a second orchestration path and would bypass the current `ExperimentPlan`, `ExperimentRun`, `ExperimentResult`, `EvidencePack`, and replay contracts.

## Incompatibilities

| Gemini assumption | LIVE reality | Decision |
|---|---|---|
| `parseAndValidateLLMRequest` | LIVE uses `parseScienceChatMessage` and structured Fabric validation | Do not copy; adapt only missing validation |
| `EarthquakeSolverAdapter` | LIVE uses `executeEarthquakeCommandCenterScenario` and existing envelope | Do not add a second adapter |
| `EvidenceInterceptor` | LIVE provenance/evidence gate is already inside the hazard envelope path | Do not add a second interceptor |
| `EarthquakeCityProjector` | LIVE uses `EarthquakeCityOverlayProjection` and the existing City3D renderer | Do not add a second projector/world state |
| `CityWorldState` | Current City3D consumes the existing epidemic world plus explicit immutable Earthquake overlay | Do not replace with a new city type |
| `jest.fn()` | Repository tests use Vitest | If testing, use existing Vitest style |
| `evidenceId` as the sole handoff | LIVE uses run/provenance fingerprints and envelope evidence, not a synthetic UUID-only registry | Preserve current provenance contract |
| `any` injected LLM/router | Current chat path is deterministic/offline for supported flows | Do not add an unneeded LLM dependency |

## Safe reuse

The only reusable idea is the **phase vocabulary**: parsing, validating, running, securing evidence, projecting, completed/failed. If the UI needs a progress indicator, add it to the existing Science Chat state around the current async confirmation call. Do not create a new bridge class or new registries.

The report’s suggestion of a future replay verifier is also not a reason to add Package 07 now. Replay already exists for the Earthquake MVP; the next work should be product-quality proof and fixing the local E2E environment, not a second verifier.

## Required honesty behavior

The package must not turn a mock or missing solver into a completed run. Unsupported domains remain `NOT_MODELED`; missing structural damage remains `NOT_MODELED`; a blocked provenance write remains `PROVENANCE_CONFLICT` or the existing blocked status. Evidence and Replay must report the actual envelope status.

## Recommendation

`MANUAL_REVIEW` only. Keep the phase vocabulary as a possible UI detail, reject the proposed bridge implementation, and continue using the current LIVE Experiment Fabric and Earthquake command-center path.
