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

## S4 — PySCF ResearchRun execution

Problem: the real PySCF adapter, H₂ reference case and pinned chem-light worker already existed, but there was no direct ResearchRun-shaped entry through the S3 execution record.

Delivered:

- fixed canonical H₂ at 0.74 Å, RHF/STO-3G request bound to ResearchRun and experiment identity;
- local canonical executor that reuses `executeCapability` and adds a hash of Node/platform/arch/validated engine identity;
- execution through the S3 port with `DETERMINISTIC_WITH_PINNED_ENGINE_AND_GEOMETRY` replay declaration;
- packaging assertions for pinned `pyscf==2.14.0`, binary-only install and image import check;
- honest runtime behaviour: real energy and hashes when PySCF is available, otherwise `BLOCKED_BY_RUNTIME` with no output.

Public contracts:

- `packages/backend/src/compute/localCanonicalScientificExecutor.mjs`
- `packages/backend/src/compute/pyscfResearchRunExecutor.mjs`

Existing components reused unchanged: `qmAdapter.mjs`, `qm_worker.py`, canonical capability contract, toolchain reference validation, chem-light worker image.

Claude integration: call `createPyScfResearchRunExecutor(...).runCanonicalH2(...)` for the bounded validation experiment or pass the same S3 port a broader already-validated PySCF request. Persist through existing `saveScienceRun` only after `SUCCESS`.

Validation: 37 pass, 0 fail, 10 runtime-dependent skips across PySCF ResearchRun, S3, remote worker and packaging tests.

Runtime proof here: local PySCF is absent, therefore the actual execution record is `BLOCKED_BY_RUNTIME`. The image is pinned and build-checked; `AVAILABLE_NOW` still requires the Linux worker runtime probe/CI to execute the real reference case.

Rollback: revert the S4 commit; the underlying PySCF adapter and worker remain intact.

## S5 — Vina / Meeko ResearchRun execution

Problem: the real Vina/Meeko adapter and protein-docking campaign path existed, but the vetted 1IEP files failed their byte hashes on Windows because Git converted LF to CRLF. ResearchRun also lacked a bounded canonical docking entry.

Delivered:

- `.gitattributes` now marks pinned PDB/SDF files `-text`, preserving manifest bytes across Windows/Linux;
- canonical ABL1 1IEP + imatinib docking request with fixed box, exhaustiveness, pose count and seed;
- deterministic target preparation through the existing registry and Meeko adapter;
- S3 execution record with Vina engine identity, input/output hashes and fixed-seed replay declaration;
- no path supplied by an API caller and no worker filesystem path returned;
- packaging assertions for `vina==1.2.7` and `meeko==0.8.0`.

Public contract: `packages/backend/src/compute/vinaResearchRunExecutor.mjs`.

Existing components reused unchanged: target registry, Vina/Meeko adapters, structural worker, campaign `science_runs` and replay.

Claude integration: invoke `runCanonicalDocking({ researchRunId, executionId })`; on `SUCCESS`, persist the existing ScienceRun shape and artifact hashes. A preparation failure returns a blocker and no pose/record.

Validation: 21 pass, 0 fail, 3 engine-dependent skips. The target hash test now passes on Windows and Linux semantics.

Runtime proof here: Vina/Meeko are absent locally, so the canonical run is honestly `BLOCKED_BY_RUNTIME`; worker runtime CI is required before `AVAILABLE_NOW`.

Rollback: revert the S5 commit. This also removes the PDB/SDF EOL protection, so the prior Windows hash failure will return.
