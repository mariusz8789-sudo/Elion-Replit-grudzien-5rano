# Genesis continuation delivery: World Engine topology

This delivery continues the real Genesis repository from **`claude/quantum-forge-p845ux`** at commit `62776ba509ea2efca881de1fbf21aa7daba916a0`. It does not create a second application or a standalone demo. The selected increment is a deterministic, read-only **World Engine road-network topology** that uses the existing `CityLayout` geometry already rendered by the City 3D Command Center.

## What was added

The new provider in `packages/frontend/src/core/world/roadNetwork.ts` publishes stable identifiers for road, sidewalk, and crossing segments; a map identifier, version, and fingerprint; and deterministic planning helpers. Stable location identifiers are now part of the existing city layout. `EpidemicCitySimulation` exposes an immutable copy of the topology through `roadNetworkView()`, while `projectWorldState()` exposes it as `WorldStateView.routing` for downstream consumers.

The City 3D Command Center now displays a **SIEĆ MIEJSKA** panel. It reports the delivered topology counts and explicitly labels agent route assignment and contact-segment attribution as `NOT_MODELED`. This preserves the distinction between available world geometry and unavailable epidemiological evidence.

| Delivered data | Source | Consumer boundary |
| --- | --- | --- |
| Road, sidewalk, and crossing segment IDs | Existing deterministic `CityLayout.streetsH` and `streetsV` | `WorldStateView.routing` and City 3D status panel |
| Map identifier, version, and fingerprint | Deterministic layout topology | Read-only provenance for future adapters |
| Segment type and geometric length | World Engine provider | Available topology; not used to relabel contacts |
| Agent movement route and contact segment | Not supplied | Remains `NOT_MODELED` |

## Deliberate scientific boundary

An initial route-following prototype was evaluated against the existing contact and discovery tests. It changed established epidemic and evidence trajectories, so it was intentionally not retained. The merged implementation does **not** alter `EpidemicCitySimulation` movement, `resolveContacts`, transmission probabilities, hospital logic, Scenario Engine, replay, or provenance. It only adds immutable World Engine geometry and an honest UI projection.

> Topology exists. Per-agent path assignment and contact-to-segment attribution do not yet exist, and are not inferred by this delivery.

## Validation

The complete frontend suite passed with **110 test files and 1,153 tests**. The production frontend build passed, as did `git diff --check`. Chromium verification confirmed that the 3D Command Center loads, starts and pauses a real run, shows a real transmission event, activates the transmission-risk overlay, focuses the selected event target, and displays the topology panel with no console output.

## Changed files

| Area | Files |
| --- | --- |
| World topology | `core/world/roadNetwork.ts`, `core/world/cityWorld.ts`, `core/world/worldEngineInterface.ts` |
| Read-only projection | `core/simulation/epidemicCity.ts`, `core/simulation/worldEngineContract.ts` |
| Command Center | `components/visual-simulation/City3DWebGLScreen.tsx` |
| Coverage | `__tests__/roadNetwork.test.ts`, `__tests__/worldEngineContract.test.ts`, `__tests__/worldEngineInterface.test.ts` |

## Remaining work

The next architectural step is not UI polish. It is an explicit Scientific Core contract change, approved by the Scientific Core owner, that supplies a per-agent route and current `routeSegmentId` without changing transmission ownership. Only after that data exists can contact attribution distinguish street, sidewalk, and crossing, and only then can the `ROAD_NETWORK_VS_STRAIGHT_LINE` experiment become available.
