# Engine truth table — main 5916987b

Each column is stated separately; none is inferred from another. YES / NO / NOT_VERIFIED (not checked in this audit, so not claimed).

| ENGINE | CONTRACT_EXISTS | INSTALLED | REFERENCE_CASE_PASS | ADMITTED | EXECUTABLE_NOW | RESEARCHRUN_INTEGRATED | REPLAYABLE | PRODUCT_ELIGIBLE | BLOCKED |
|---|---|---|---|---|---|---|---|---|---|
| RDKit | YES (toolchain + RESEARCH_RUN_EXECUTORS.rdkit) | YES in CI and in this sandbox (2026.03.6) | YES (CI backend job, GENESIS_REQUIRE_ENGINES=rdkit) | YES (BSD-3-Clause) | YES | YES: the only engine reachable through executeResearchExperiment, sync and async | YES (scienceCapability, existing replayer) | NOT_VERIFIED (commercial release admission not exercised for RDKit here) | — |
| PySCF | YES (pyscfResearchRunExecutor via EngineExecutionPort) | YES in the chem-light worker container and the "Real PySCF benchmark" CI job; NO in this sandbox | YES (CI job; worker probe run 37090215393 on 86823e70 succeeded) | YES (Apache-2.0) | NOT here; yes in worker | NO: not in RESEARCH_RUN_EXECUTORS, so the ResearchRun route cannot run it | NOT_VERIFIED | NOT_VERIFIED | not routable from the ResearchRun route |
| Vina / Meeko | YES (vinaResearchRunExecutor) | YES in structural worker container; NO here | YES (worker probe success) | licence: Apache-2.0 / LGPL, review not confirmed | worker only | NO | NOT_VERIFIED | NOT_VERIFIED | not routable from the ResearchRun route |
| OpenMM | YES (openmmResearchRunExecutor) | YES in structural worker container; NO here | YES (worker probe success) | MIT/LGPL | worker only | NO | NOT_VERIFIED | NOT_VERIFIED | not routable from the ResearchRun route |
| ADMET-AI | YES (admetResearchRunExecutor) | YES in admet worker container; NO here | YES (worker probe success) | admitted for TECHNICAL_VALIDATION only; COMMERCIAL_PRODUCT is BLOCKED_BY_LICENSE | worker only | NO | NOT_VERIFIED | NO (licence gate) | BLOCKED_BY_LICENSE for commercial use |
| Retrosynthesis (AiZynthFinder) | YES (toolchain entry, route with RETROSYNTHESIS_USE_PURPOSE) | NO here; not in any worker group of the container gate | NOT_VERIFIED | TECHNICAL_VALIDATION only | NO here | NO | NOT_VERIFIED | NO (licence gate) | BLOCKED_BY_RUNTIME in this sandbox |

Evidence: `packages/backend/src/campaign/toolchain.mjs` (statuses from the live probe), `researchRunEngines.mjs` (RESEARCH_RUN_EXECUTORS has only `rdkit`), workflow "Railway scientific workers — real container gate" run 37090215393 (success on main 86823e70; per-worker artifacts are not readable from this sandbox).

Biggest in-repo gap exposed: four engines have real execution contracts and worker proof but are not reachable from a ResearchRun. Closing it means routing them through the existing EngineExecutionPort inside executeResearchExperiment, one engine at a time, each with a real-engine test in CI.
