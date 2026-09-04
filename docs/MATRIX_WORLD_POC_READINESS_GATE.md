# Matrix World POC Readiness Gate

> **Current decision: NOT READY TO IMPLEMENT.** Genesis may proceed only to a contract-review and POC-design checkpoint. No Matrix World runtime, agent, UI, renderer, GIS, live-data or operational implementation is authorized by this gate.

**Owner:** Genesis technical leadership
**Prepared:** 26 August 2026
**Purpose:** Convert the Matrix/Agent World research recommendation into observable, fail-closed entry criteria for a future deterministic 50–100 synthetic-agent POC.

## Why this gate exists

Genesis already has valuable, domain-bounded components: seeded Scenario Engine runs and replay, a deterministic generic event registry, a read-only World Engine projection, evidence stores, hazard provenance/replay, and a one-renderer City3D boundary. Those components are not a generic agent-world engine. Beginning a “Matrix World” without an explicit contract would risk a second world state, hidden LLM non-determinism, fake scientific semantics, or a visual demo that cannot be replayed.

This gate therefore separates **design readiness** from **implementation authority**. A green row below permits only the stated next design activity; it never upgrades synthetic results into an operational, calibrated or real-city claim.

## Current readiness assessment

| Gate                             | Required acceptance evidence                                                                                                         | Current state                                                                                                        | Consequence if not satisfied                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| G1 — Bounded question            | One named research/education/policy-lab question; one synthetic scenario; measurable success condition; named owner.                 | **Missing**                                                                                                          | Park implementation. Do not build a generic society simulator.                       |
| G2 — Synthetic data boundary     | Written declaration that all 50–100 agents, locations and events are synthetic; no personal, municipal, sensor, GIS or live data.    | **Partially reusable** through current Earthquake `SCENARIO`/`SYNTHETIC` conventions, but no POC declaration exists. | Block ingest and UI claims.                                                          |
| G3 — Deterministic action policy | Every allowed agent action maps to a versioned deterministic rule and seeded input; no live LLM decision path.                       | **Missing**                                                                                                          | No `MATCH` claim. Any unreplayable decision must be `NOT_REPRODUCIBLE` or `BLOCKED`. |
| G4 — Generic run contract        | Reviewed design for `MatrixWorldScenarioInput`, `MatrixAgentSpec`, `MatrixRun`, `MatrixWorldState` and `MatrixEvidencePack`.         | **Design proposed, not approved**                                                                                    | No code may be started.                                                              |
| G5 — Trace/replay test plan      | Explicit input, ordered event-trace, final-state and result fingerprints; tests for `MATCH`, `DRIFT`, `BLOCKED`, `NOT_REPRODUCIBLE`. | **Partially reusable** from Scenario/Hazard replay patterns.                                                         | Block a POC that reports a result without a replay verdict.                          |
| G6 — One-world projection        | Read-only projection via the existing City3D/CityWorld boundary; proof that the POC would retain exactly one renderer/canvas/world.  | **Reusable boundary, no Matrix adapter**                                                                             | No second renderer, canvas or mutable CityWorld.                                     |
| G7 — Evidence and retention      | Versioned local evidence export, model/rule/code provenance, corrupt-retention behavior and schema-evolution policy.                 | **Partially reusable** from Discovery/Hazard Provenance.                                                             | Block durable run history claims.                                                    |
| G8 — Safety and positioning      | Written `SYNTHETIC`, `SCENARIO`, `NON_OPERATIONAL`, `NOT_MODELED` copy and a prohibited-claims list.                                 | **Reusable patterns, no POC copy**                                                                                   | Block public or buyer-facing demonstration.                                          |
| G9 — Feasibility budget          | Target environment, deterministic 50/100-agent budget, event-rate budget, memory budget and benchmark procedure.                     | **Missing**                                                                                                          | No scale claim.                                                                      |
| G10 — Independent review         | Manus verifies boundaries/runtime proof; Claude reviews determinism/evidence test design; a domain partner validates the question.   | **Missing**                                                                                                          | No implementation start.                                                             |

## Existing Genesis components that may be reused — no more, no less

| Component                                            | Permitted future reuse                                                                       | Non-permitted reinterpretation                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `core/simulation/scenarioEngine.ts`                  | Seeded run inputs, fixed steps, fingerprints, comparison and replay pattern.                 | Replacing the existing epidemic engine or calling its epidemiology generic social behavior.          |
| `core/events/genesisEvent.ts` and `eventRegistry.ts` | Versioned event shape, deterministic IDs, parent causal links, ordered trace and provenance. | Treating the in-memory registry as durable event sourcing without a new approved persistence design. |
| `core/simulation/worldEngineContract.ts`             | Read-only projection, clock, entities, locations and `notModeled` discipline.                | Adding Matrix state to the existing epidemic world or creating a second mutable world.               |
| Discovery Evidence / Hazard Provenance               | Evidence, content/fingerprint, replay verdict and retention-hardening patterns.              | Collapsing distinct domain contracts or pretending a future Matrix model is already validated.       |
| City3D / CityWorld                                   | One-canvas read-only visualization pattern and Chromium proof harness.                       | A second renderer, world, routing system or standalone demo.                                         |

## Required POC contract-review package

Before code, the assigned reviewers must approve a short design package containing the following exact artifacts:

| Artifact                          | Minimum fields                                                                                                                                        | Review question                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `MatrixWorldScenarioInput` design | schema/model/rule versions, seed, tick interval, synthetic map reference, intervention and agent collection reference.                                | Can an identical input be recreated without hidden defaults?        |
| `MatrixAgentSpec` design          | synthetic ID, initial state, allowed actions, deterministic priorities, declared memory facts and resource references.                                | Is there any personal-data proxy, opaque persona or live LLM state? |
| Rule registry design              | ID, version, pure input/output signature, declared capability and non-modelled behavior.                                                              | Can each emitted action be attributed to a rule?                    |
| `MatrixEvent` mapping             | Existing event fields, payload schema/version and causal parent semantics.                                                                            | Does the ordered trace fully explain state transitions?             |
| `MatrixWorldState` digest         | tick, canonical state/fingerprint, projection boundary and declared unavailable fields.                                                               | Can the renderer read it without mutating the simulation?           |
| `MatrixRun` and evidence design   | input/event/final/result fingerprints, verdict, code/model/rule provenance, missing fields and export structure.                                      | Does replay make truthful failure visible?                          |
| Test matrix                       | normal `MATCH`, altered input `DRIFT`, malformed record `BLOCKED`/`NOT_REPRODUCIBLE`, unsupported capability `NOT_MODELED`, one-canvas runtime proof. | Does the test suite prohibit fabricated success?                    |

## Explicit no-build boundaries

Until all ten gates are satisfied, the team must not:

1. Add any Matrix World runtime code, generic agent class, memory store, LLM call, goal planner or synthetic “social intelligence” behavior.
2. Add a new renderer, canvas, world state, routing layer, standalone application or deployment.
3. Ingest external GIS, municipal, sensor, personal or live data.
4. Build a new disaster solver, cascade engine, health model or operational decision workflow.
5. Claim prediction, calibration, real-city fidelity, human behavioral validity or investor/customer readiness.
6. Merge external/Claude work automatically; every future branch remains independently audited.

## Next permitted action

The next permitted activity is a **one-to-two-week contract-review package** that resolves G1–G5 on paper and in tests of existing primitives only. Implementation can be proposed only after the review marks every gate green and the future POC retains the same current boundaries: synthetic data, one City3D renderer/canvas/world, explicit evidence and replay, no live data, and no operational claims.
