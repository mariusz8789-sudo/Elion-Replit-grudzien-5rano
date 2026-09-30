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
