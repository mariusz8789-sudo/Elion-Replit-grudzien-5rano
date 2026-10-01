# SOL/CODEX master execution handoff

Branch: `codex/sol-master-execution`  
Draft PR: #56  
Integration owner: Claude

## S0 — security / compute admission

Problem: heavy scientific execution and worker engine routes lacked a complete admission boundary.

Delivered:

- authenticated heavy-compute execution;
- process-local per-principal rate limit and global concurrency guard;
- authenticated worker inventory, reference-case and execution routes;
- passive public worker health only;
- masked CI worker token and compatibility tests.

Existing APIs reused: backend auth/RBAC, compute registry, canonical worker contract.

Claude integration: none. Merge retains current routes; clients calling protected heavy execution must send the existing bearer session token. Worker callers must set `GENESIS_WORKER_TOKEN`.

Known limit: the admission limiter is process-local and `NOT_MULTI_REPLICA_SAFE`; shared quotas remain S9.

Validation: `node --test packages/backend/src/apiCompute.test.mjs packages/backend/src/compute/computeAdmission.test.mjs packages/backend/src/compute/workerContract.test.mjs packages/backend/src/compute/workerHttp.test.mjs packages/backend/src/compute/workerClient.test.mjs packages/backend/src/compute/workerRailwayWorkflow.test.mjs`.

Rollback: revert commits `7a983b3f` and `d579907c` together.

## S1 — literature foundation

Problem: the existing frontend OpenAlex/Crossref novelty heuristic does not provide a canonical backend source record with licence, access status, provenance and stable metadata hash.

Delivered:

- canonical `LiteratureQuery` validation and `LiteratureSource` record vocabulary;
- retrieval statuses: `AVAILABLE`, `METADATA_ONLY`, `NO_ACCESS`, `BLOCKED_BY_LICENSE`, `BLOCKED_BY_NETWORK`, `NOT_FOUND`;
- commercial licence statuses: `APPROVED`, `CONDITIONAL`, `BLOCKED`, `UNKNOWN`;
- real Europe PMC REST connector with exact HTTPS allowlist, bounded timeout, redirect revalidation and fail-closed errors;
- DOI/PMID/PMCID identity, deterministic metadata hash and canonical deduplication;
- conservative rights handling: open/full-text availability never implies commercial permission; missing licence remains `UNKNOWN`;
- connector aggregation without synthetic fallback sources.

Existing APIs reused: `canonicalHash` from the shared provenance module. No ResearchRun, Evidence, Replay or Scientific Memory lifecycle was added.

Public contracts:

- `packages/backend/src/literature/literatureContracts.mjs`
- `packages/backend/src/literature/europePmcConnector.mjs`
- `packages/backend/src/literature/literatureService.mjs`

Claude integration for S2: import `searchLiterature` behind a thin ResearchRun literature port. Do not call the Europe PMC connector directly from ResearchRun.

Validation: `node --test packages/backend/src/literatureFoundation.test.mjs` — 7 pass, 0 fail.

Full backend result in this Windows worktree: 1283 pass, 8 fail, 81 skip. None of the eight failures imports or exercises S1. They comprise existing worktree permission/fixture drift failures plus the S0 capability-status expectation already documented in PR #56; Linux CI remains authoritative.

Known blockers:

- live API behaviour is intentionally not a deterministic unit-test dependency;
- most Europe PMC search responses no longer expose an article licence, so those records remain `UNKNOWN` until a licence-specific source is added;
- claim-to-source binding belongs to S2 and is not duplicated here.

Rollback: revert the S1 commit; no database migration or production route depends on it.

## S2 — Literature → ResearchRun contract

Problem: ResearchRun needs a bounded way to request literature for an existing claim without acquiring a second lifecycle or treating model extraction as Evidence.

Delivered:

- `ClaimEvidenceLink` proposal contract with `SUPPORTS`, `CONTRADICTS`, `CONTEXT_ONLY`, `METHOD_SOURCE`, `UNKNOWN`;
- thin `createResearchRunLiteraturePort()` adapter over S1 `searchLiterature`;
- structured support, contradictions, missing-evidence and access-blocker output;
- source-ID admission: a linker cannot cite a source absent from the retrieved source set;
- all extracted relationships are forcibly `PROPOSED`, `NOT_EVIDENCE`, `humanReviewed:false` even if an external linker claims otherwise;
- no database write, lifecycle event, Evidence publication or ResearchRun core modification.

Public contracts:

- `packages/backend/src/literature/claimEvidenceLink.mjs`
- `packages/backend/src/literature/researchRunLiteraturePort.mjs`

Claude integration: instantiate the port once and call `findForClaim({ researchRunId, claimId, claim, query? })` from the existing ResearchRun orchestration point. Any later admission into Evidence must use the canonical Evidence review path; this port never performs that transition.

Validation: `node --test packages/backend/src/literatureFoundation.test.mjs packages/backend/src/researchRunLiteraturePort.test.mjs packages/backend/src/researchRun.test.mjs` — 19 pass, 0 fail.

Rollback: revert the S2 commit; ResearchRun core and persistence are untouched.

## S3 — generic engine execution contract

Problem: canonical worker dispatch and `science_runs` already existed, but ResearchRun lacked a small provider-neutral request/record adapter carrying ResearchRun and experiment identity.

Delivered:

- `EngineExecutionRequest` validation that reuses the existing per-capability schemas and fingerprints;
- `EngineExecutionRecord` with run/experiment/engine/environment/hash/timing/failure/replay fields;
- admission hook capable of fail-closed `BLOCKED_BY_LICENSE`, `BLOCKED_BY_DATA` and configuration decisions before execution;
- exact mapping of the existing `DISPATCH_STATE` vocabulary to `SUCCESS`, `BLOCKED_BY_RUNTIME`, `BLOCKED_BY_CONFIGURATION`, `BLOCKED_BY_DATA`, `TIMEOUT`, `FAILED`, `CANCELLED`;
- output hash recomputed on the main side;
- no new executor, registry, persistence table, queue or ResearchRun lifecycle.

Public contract: `packages/backend/src/compute/engineExecutionContract.mjs`.

Claude integration: construct `createEngineExecutionPort({ executor, admit })` with the existing local/remote dispatcher. Persist successful output through the existing `saveScienceRun`; do not create another execution store.

Validation: `node --test packages/backend/src/engineExecutionContract.test.mjs packages/backend/src/compute/remoteScientificWorkerClient.test.mjs packages/backend/src/compute/workerServer.test.mjs` — 38 pass, 0 fail, 10 runtime-dependent skips.

Rollback: revert the S3 commit; existing dispatch and `science_runs` are untouched.
