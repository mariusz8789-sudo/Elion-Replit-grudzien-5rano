# Independent Audit — Claude Earthquake Vertical Slice

## Audited revision

| Item | Verified value |
|---|---|
| Branch | `origin/claude/earthquake-vertical-slice` |
| Audited head | `c0485926edf60ccc596b3914ff93fb6e1dcd28c9` |
| Genesis merge base | `8e58a13aeb88c259c1c96efe5d3d1ee0b41fbd07` |
| Audit method | Separate detached checkout at `/home/ubuntu/genesis-earthquake-audit` |

The branch includes the prior Phase 0 provenance foundation and the earthquake module. It is not merge-approved merely because it is isolated from City3D.

## Confirmed strengths

The actual changed paths are limited to `core/hazard`, the domain-neutral provenance store, the existing evidence store convergence adapter, dedicated tests, documentation and a standalone E2E script. Static import and changed-path checks found no changes to the epidemic simulation, contacts, Hospital Model, Scenario Engine, Discovery Engine, World Engine contract, routing, City3D renderer, asset governance, GIS/data fetch code or UI components.

The attenuation model and its exposure fixtures explicitly label themselves as synthetic, illustrative and `SCENARIO`; they do not claim calibration, real-world geodesy, observed assets or operational guidance. `projectEarthquakeWorldState()` is a pure read-only output mapper and no City3D source imports it.

In the isolated checkout, focused tests and the full frontend suite passed **121 files / 1,250 tests**. TypeScript no-emit, production build and the range whitespace check also passed. The branch’s package/build output keeps the City3D module isolated.

## Merge blockers

| Blocker | Verified finding | Required remediation |
|---|---|---|
| Non-portable Chromium E2E | `scripts/earthquake-e2e.mjs` imports a hard-coded `/opt/node22/lib/node_modules/playwright/index.js`, which does not exist in this environment. The independent E2E execution therefore stops before running any of its 25 checks. | Replace the absolute dependency/browser paths with a declared, resolvable test dependency or an existing project-supported CDP approach; rerun Node-to-Chromium comparison from the corrected committed script. |
| Missing semantic input gate | `runEarthquakeScenario()` accepts typed fields but performs no runtime rejection of invalid numeric scenario values. The Phase 0 admission gate validates record completeness, not finite/non-negative magnitude/depth or finite epicenter coordinates. | Add a narrow earthquake-spec validator before artifact/input/run construction, with tests for invalid numeric values. This must remain a scenario-contract guard, not a claim of scientific calibration. |
| Provenance timestamp acceptance | `checkSourceArtifactAdmission()` checks `typeof retrievedAt === 'number'` but currently accepts `NaN` and infinities. | Require a finite, non-negative `retrievedAt` and add regression tests. |

> **Audit verdict: the vertical slice is scope-clean and its synthetic/non-operational framing is credible, but it is BLOCKED FOR MERGE until portable cross-engine E2E and semantic/admission validation gates are corrected and independently rerun.**

## Remediation re-audit — `558aa03`

The revised branch was independently retested in a fresh isolated checkout. The committed E2E now resolves Playwright through declared project dependencies and selects system Chromium through its documented environment/discovery path. The cross-engine test completed **25/25** checks in this environment.

The branch also adds a scenario-contract guard before artifact construction, rejecting non-finite magnitude/depth/epicenter/seed values and negative depth without claiming scientific calibration. `SourceArtifact.provenance.retrievedAt` now requires a finite, non-negative value. The full isolated frontend suite completed **121 files / 1,268 tests**, alongside TypeScript, production build and clean diff validation.

> **Re-audit verdict: the three remediation blockers are closed for `558aa03`. The Earthquake vertical slice is eligible for a separate, deliberate merge review; City3D overlay activation remains disabled until a versioned coordinate-mapping artifact and the documented scenario-overlay gates are supplied.**

## Safe ownership after remediation

Claude may take a bounded **Earthquake Integration Readiness** correction: portability of the existing E2E, scenario/admission validation and tests only. Claude must not add a second hazard solver, cascade engine, real-data adapter, GIS wiring, City3D layer or epidemic/routing integration.

Kimi may prepare licensed data/GIS readiness and provenance metadata only. Manus retains any later one-renderer, read-only City3D projection integration after this audit is approved. Nuclear, radiological, chemical and cascade solvers remain explicitly deferred.
