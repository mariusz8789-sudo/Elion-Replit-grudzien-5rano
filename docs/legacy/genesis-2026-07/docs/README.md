# Genesis documentation

A map of this directory, so 50+ files read as a structure rather than a pile.
Start with the top table; everything below it is reference.

---

## Start here

| Document | What it answers |
|---|---|
| [`GENESIS_CAPABILITY_REPORT.md`](GENESIS_CAPABILITY_REPORT.md) | What works, what does not, and what it is worth — measured, not recalled |
| [`GENESIS_CONSOLIDATION.md`](GENESIS_CONSOLIDATION.md) | Product architecture, roadmap validation, tiers, and what blocks Genesis |
| [`DISCOVERY_OS_ARCHITECTURE.md`](DISCOVERY_OS_ARCHITECTURE.md) | Layers, module boundaries, database design, security model |
| [`PHASE_0_REVIEW.md`](PHASE_0_REVIEW.md) | What building the reasoning core changed about the design |

## The reasoning platform

| Document | Subject |
|---|---|
| [`EDGE_CRITICALITY.md`](EDGE_CRITICALITY.md) | Which curated claims decide the output, and how the counterfactual is computed |
| [`RETROSPECTIVE_BENCHMARK.md`](RETROSPECTIVE_BENCHMARK.md) | The protocol that would validate the central thesis. Designed, never run |
| [`SCIENTIFIC_VERSION_CONTROL.md`](SCIENTIFIC_VERSION_CONTROL.md) | Versioning of scientific artefacts |
| [`GENESIS_PHYSICS_VALIDATION.md`](GENESIS_PHYSICS_VALIDATION.md) | Physics engine checked against NASA reference values |

## Molecular discovery

| Document | Subject |
|---|---|
| [`DRUG_DISCOVERY.md`](DRUG_DISCOVERY.md) · [`COMPUTE_ENGINE.md`](COMPUTE_ENGINE.md) | The campaign pipeline and its compute layer |
| [`BENCHMARK_SUITE.md`](BENCHMARK_SUITE.md) · [`COGNITIVE_BENCHMARK.md`](COGNITIVE_BENCHMARK.md) | Benchmarks for the campaign stack |
| [`GENESIS_CORPUS_FACTORY.md`](GENESIS_CORPUS_FACTORY.md) · [`GENESIS_KNOWLEDGE_BASE_ACQUISITION.md`](GENESIS_KNOWLEDGE_BASE_ACQUISITION.md) | Evidence acquisition |
| [`GENESIS_DISCOVERY_TRIAL.md`](GENESIS_DISCOVERY_TRIAL.md) | A recorded campaign run |

## Cognitive module reference

Per-module documentation for `packages/backend/src/cognitive`. **Read the
readiness note first:** of 48 modules, 17 are reachable from the HTTP server and
10 have no entry point at all — see the capability report. These documents
describe modules that are tested and, in several cases, not reachable by a user.

[`COGNITIVE_AGENT_FABRIC.md`](COGNITIVE_AGENT_FABRIC.md) ·
[`COGNITIVE_COMPUTE_ORCHESTRATOR.md`](COGNITIVE_COMPUTE_ORCHESTRATOR.md) ·
[`COGNITIVE_CRITIC_SWARM.md`](COGNITIVE_CRITIC_SWARM.md) ·
[`COGNITIVE_EVIDENCE_STORE.md`](COGNITIVE_EVIDENCE_STORE.md) ·
[`COGNITIVE_HYPOTHESIS_ENGINE.md`](COGNITIVE_HYPOTHESIS_ENGINE.md) ·
[`COGNITIVE_META_ORCHESTRATOR.md`](COGNITIVE_META_ORCHESTRATOR.md) ·
[`COGNITIVE_MISSION_PLANNER.md`](COGNITIVE_MISSION_PLANNER.md) ·
[`COGNITIVE_MODEL_ROUTER.md`](COGNITIVE_MODEL_ROUTER.md) ·
[`COGNITIVE_RECOVERY.md`](COGNITIVE_RECOVERY.md) ·
[`COGNITIVE_SANDBOX_LAB.md`](COGNITIVE_SANDBOX_LAB.md) ·
[`COGNITIVE_VERIFICATION_BRIDGE.md`](COGNITIVE_VERIFICATION_BRIDGE.md) ·
[`COGNITIVE_WORKFLOW_ENGINE.md`](COGNITIVE_WORKFLOW_ENGINE.md) ·
[`GENESIS_COGNITIVE_GAP_ANALYSIS.md`](GENESIS_COGNITIVE_GAP_ANALYSIS.md)

## Operations

| Document | Subject |
|---|---|
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Build, container, configuration, deployment targets |
| [`API_REFERENCE.md`](API_REFERENCE.md) | Endpoint reference |
| [`EXTERNAL_DEPENDENCIES.md`](EXTERNAL_DEPENDENCIES.md) | What Genesis depends on, and what is unreachable |
| [`TECH_DEBT.md`](TECH_DEBT.md) | Known debt, deliberately not fixed, with the conditions for fixing it |
| [`CAPABILITY_MANIFEST.md`](CAPABILITY_MANIFEST.md) | Machine-readable capability declarations |

## History

[`history/`](history/) holds superseded audits and stage reports. They are kept
rather than deleted: the record of what was believed, and when, is part of the
evidence for everything claimed now. Nothing in `history/` should be read as a
current statement.

Campaign outputs under `campaigns/` are artefacts of specific runs and are dated
by the run that produced them.
