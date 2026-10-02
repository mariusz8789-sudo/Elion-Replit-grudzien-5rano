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

## S6 — ADMET ResearchRun execution and commercial admission

Problem: Genesis already had a real ADMET-AI adapter and pinned worker, but ResearchRun lacked a bounded S3 entry and the existing comments did not distinguish the MIT package from the separate licence obligations of its training datasets and bundled weights.

Delivered:

- canonical aspirin request through the existing admet-estimation capability and S3 execution record;
- explicit MODEL_ESTIMATE / NOT_A_MEASUREMENT classification and scientific limitations;
- model identity for ADMET-AI 2.0.1, including separate package, weights and training-data licence fields;
- fail-closed commercial admission: BLOCKED_BY_LICENSE until exact weight identity and dataset-by-dataset commercial rights are documented;
- bounded TECHNICAL_VALIDATION execution mode that may run the real installed model but never promotes commercial rights or measurement status;
- corrected adapter/worker comments so MIT is attributed to the code/package, not silently to all training inputs.

Public contract: packages/backend/src/compute/admetResearchRunExecutor.mjs.

Existing components reused unchanged: ADMET-AI adapter/worker, canonical capability contract, local executor, S3 record and existing ScienceRun persistence.

Claude integration: use the default commercial mode in product flows. It intentionally blocks today. Use TECHNICAL_VALIDATION only for the bounded engineering proof. Do not remove the commercial gate until a reviewed manifest pins exact bundled weights and the relevant TDC dataset licences.

Validation: node --test packages/backend/src/engineExecutionContract.test.mjs packages/backend/src/admetResearchRunExecutor.test.mjs packages/backend/src/admetEngine.test.mjs — 12 pass, 0 fail, 5 runtime-dependent skips.

Runtime proof here: ADMET-AI is absent locally, so technical validation records BLOCKED_BY_RUNTIME. The worker stays pinned to admet-ai==2.0.1. Official ADMET-AI documentation confirms TDC-trained models; official TDC documentation states that individual dataset licences must be reviewed separately.

Known blocker: commercial admission remains blocked until the weights and complete training dataset set have reviewed identities, hashes/versions and licence decisions.

Rollback: revert the S6 commit; the underlying ADMET pipeline remains intact.

## S7 — OpenMM ResearchRun execution

Problem: the real OpenMM adapter, bounded TIP3P reference and canonical ScienceRun builder already existed, but ResearchRun lacked a direct S3 entry with an explicit simulation protocol and runtime limitations.

Delivered:

- canonical 300-step TIP3P water-box NVT request bound to ResearchRun and experiment identity;
- explicit force field, ensemble, integrator, temperature, timestep, seed, PME cutoff and CPU-platform protocol;
- MODEL_ESTIMATE classification and SOFTWARE_INTEGRATION_REFERENCE_NOT_CANDIDATE_STABILITY scope;
- REPLAY_UNSUPPORTED_PLATFORM_NUMERICS declaration, consistent with the existing Replay verifier;
- runtime metadata for Node/OS/architecture/engine platform plus an honest null hardware identity because the current worker does not report full hardware identity;
- no candidate-specific MD claim, no silent GPU fallback and no second OpenMM adapter.

Public contract: packages/backend/src/compute/openmmResearchRunExecutor.mjs.

Existing components reused unchanged: mdAdapter, md_worker.py, openmmRuntime, canonical molecular-dynamics capability, structural worker and existing ScienceRun builder.

Claude integration: call runCanonicalTip3p only as the bounded engine-validation experiment. It must not be presented as stability evidence for a docked candidate. Persist successful output through the existing ScienceRun path; Replay remains unsupported for this capability.

Validation: 43 pass, 0 fail, 15 runtime-dependent skips across the S7 adapter, S3, heavy-engine and existing Virtual Lab closed-loop tests.

Runtime proof here: OpenMM is absent locally, so the real canonical run is BLOCKED_BY_RUNTIME with no energy output. The structural image is pinned to OpenMM 8.6.1 and must pass its Linux runtime probe before AVAILABLE_NOW.

Known blocker: a candidate-specific protein-ligand MD vertical still needs a validated topology/preparation protocol, full environment/hardware identity and external scientific review. This bounded reference does not satisfy that future scope.

Rollback: revert the S7 commit; the underlying OpenMM pipeline remains intact.

## S8 — retrosynthesis licence and data admission

Problem: AiZynthFinder code is MIT, but route execution also requires an expansion model, reaction templates and stock data. Their commercial licences were not proven, while the existing product stage could call the adapter directly.

Delivered:

- separate admission identities for engine code, expansion-policy model, templates and stock;
- code status APPROVED/MIT while all three external artifact licences remain UNKNOWN;
- commercial product path now fails closed with BLOCKED_BY_LICENSE before invoking the engine;
- technical validation distinguishes missing package (BLOCKED_BY_RUNTIME), missing/unhashed artifacts (BLOCKED_BY_DATA) and a complete hashed technical fixture;
- route output remains MODEL_ESTIMATE / ROUTE_PROPOSAL / NOT_A_LABORATORY_PROCEDURE;
- no model download, synthetic route, conditions, quantities, yield or safety procedure.

Public contract: packages/backend/src/compute/retrosynthesisAdmission.mjs.

Existing components reused: retroAdapter, AiZynthFinder worker, campaign retrosynthesis stage, canonical ScienceRun persistence, Evidence handoff and Replay.

Claude integration: none for the gate. The existing product endpoint now blocks until the model/template/stock licence decisions are reviewed. Technical validation must pass usePurpose TECHNICAL_VALIDATION explicitly and still requires all three artifacts with SHA-256 identities.

Validation: 27 pass, 0 fail, 1 real-model skip across admission, campaign retrosynthesis and handoff tests. The campaign API suite also passed its retrosynthesis route test after the gate was connected.

Runtime proof here: AiZynthFinder data is absent. No route was generated. Commercial execution is BLOCKED_BY_LICENSE independent of runtime availability.

Known blockers: obtain and review the exact policy-model, template-library and stock licences; pin their versions and SHA-256 values; then run the aspirin reference in an isolated worker. Code alone cannot clear those rights.

Rollback: revert the S8 commit to restore the previous runtime-only gate.

## S9 — shared worker and artifact-storage foundation

Problem: Genesis has a useful SQLite-backed in-process job lifecycle and authenticated scientific workers, but it has no atomic distributed claim lease, shared concurrency, retry/dead-letter policy or object storage. Calling the current system multi-replica safe would be false.

Delivered:

- validated scientific job envelope with job/idempotency/ResearchRun/experiment/capability identity, priority, bounded attempts and timeout;
- provider-neutral queue port requiring enqueue, atomic claim, heartbeat, completion, failure and cancellation operations;
- explicit current-state admission report: BLOCKED_FOR_MULTI_REPLICA_PRODUCTION;
- ArtifactRef with provider/key/MIME/size/SHA-256/time/producer/ResearchRun/experiment identity;
- object-storage port that hashes actual bytes server-side and returns metadata only;
- traversal-safe keys and no raw artifact bytes in the reference object;
- no Redis, Kubernetes or cloud provider dependency invented.

Public contract: packages/backend/src/compute/workerInfrastructureContract.mjs.

Existing components reused unchanged: SQLite jobs, local runner, worker authentication, remote scientific worker client/server and ScienceRun artifact reference arrays.

Claude integration: none until a shared backend is selected. A future Redis/Postgres adapter must implement the six queue-port operations atomically. A future S3-compatible adapter supplies putObject; persist only the returned ArtifactRef in ScienceRun.

Validation: 46 pass, 0 fail, 10 runtime-dependent skips across S9, the existing job runner and worker client/server. The focused S9 + jobs rerun is 14 pass, 0 fail.

Production blockers: a shared multi-host queue backend, shared concurrency/quota and object-storage credentials/provider. The scientific SQLite path now has durable lease/heartbeat, retry/dead-letter and cancellation state; legacy in-process jobs still use a process-local cancellation set and neither path is multi-replica safe.

Rollback: revert the S9 commit; existing local jobs and workers remain unchanged.

### S9b — durable single-node scientific worker runtime

Problem: the queue could persist and lease work, but no runtime consumed those leases through the
canonical EngineExecution port. A server restart therefore had queue recovery semantics without a
tested execution consumer.

Delivered: `scientificWorkerRuntime.mjs` claims one durable job, maintains its lease, applies its
timeout signal, independently enforces the persisted deadline even if an executor ignores abort,
executes only through `EngineExecutionRecord`, and atomically completes or fails the
same row. Transient failures are retried within the stored bound; data/licence/configuration blockers
are dead-lettered immediately; stale workers cannot write after cancellation or lease loss. A second
runtime instance proves restart recovery by claiming the same queued row and completing attempt two.

Existing components reused: the S9 SQLite queue, S3 execution contract, canonical capability input
validation and the existing jobs table. No second scheduler, ResearchRun lifecycle or result store.

Validation: `node --test packages/backend/src/scientificWorkerRuntime.test.mjs
packages/backend/src/workerInfrastructureContract.test.mjs` — 14 pass, 0 fail; focused ESLint and
`git diff --check` pass. The focused runtime/queue rerun is 15 pass, 0 fail.

Production limit remains explicit: this runtime is real for one SQLite deployment. Multi-replica
admission still fails until a shared queue/concurrency backend and object storage are configured.

Rollback: revert the S9b commit; persisted S9 jobs and existing in-process jobs remain readable.

## S10 — scientific Python sandbox foundation

Problem: Genesis needs a safe path for model-proposed analysis, but the repository does not yet contain an attested container backend. Executing generated code on the host would violate the security boundary.

Delivered:

- a Python-only request contract; Bash, R, caller-selected commands, packages, environment variables and secrets are rejected;
- immutable container-image digest and deterministic environment fingerprint;
- deny-all network, read-only root, no host filesystem, no secrets, dropped capabilities and no-new-privileges requirements;
- bounded CPU, RAM, wall-clock, process, stdout, stderr and artifact output policies;
- dataset admission only through allowlisted, content-addressed ArtifactRefs whose IDs match their SHA-256 values;
- an injected backend port that refuses execution unless every isolation control is attested;
- explicit current product result: BLOCKED_BY_CONFIGURATION / CONTAINER_SANDBOX_BACKEND_NOT_CONFIGURED.

Public contract: packages/backend/src/compute/scientificSandboxContract.mjs.

Existing components reused: canonical provenance hashing and the S9 ArtifactRef identity. No second ResearchRun, Evidence, Replay, queue or storage system was introduced.

Claude integration: none today. Keep the product blocked. A later container adapter may implement attest and execute, but it must pass the frozen plan to a controlled runner protocol and return bounded stdout/stderr plus S9 ArtifactRefs.

Validation: 13 pass, 0 fail across the focused sandbox, speculative-sandbox and S9 contract tests.

Runtime proof here: none claimed. No host process or container was launched. Backend self-attestation is only an admission interface and still requires independent implementation and security review.

Production blockers: isolated container backend, pinned image digest, safe dataset staging, enforced cgroup/process/output limits, artifact collection through object storage, Linux security review and adversarial tests.

Rollback: revert the S10 commit; no current execution path changes.

## S11a — resource, agreement, uncertainty and falsification contracts

Problem: engine selection and final reporting need shared metadata, while existing campaign code already owns execution, comparison with observations and falsification. A new scoring or discovery loop would duplicate that architecture.

Delivered:

- ResourceProfile with runtime, cost, risk, availability, data availability and cheaper-prerequisite metadata;
- transparent lexicographic ordering with no opaque scalar score and no promotion of blocked work;
- AgreementRecord requiring distinct methods, a named calibration dataset, sample size and measured reliability;
- UncertaintyBreakdown retaining data, model, measurement, engine disagreement, extrapolation, missing evidence, runtime and literature completeness as separate dimensions;
- aggregate uncertainty fixed to null: the contract never invents one confidence number;
- self-falsification check proposals for sensitivity, independent engine comparison, applicability domain, data shift, contradictory sources and replay drift.

Public contract: packages/backend/src/compute/scientificDecisionContracts.mjs.

Existing components reused unchanged: campaign multi-fidelity execution, descriptor/docking conflict detection, lab observation comparison, Replay verification, benchmark statistics and ResearchRun falsification. The new helper proposes metadata/checks only.

Claude integration: ResearchRun may consume ResourceProfiles when ordering experiments and attach AgreementRecord/UncertaintyBreakdown to its existing report. It remains the only owner of experiment planning, execution and verdicts.

Validation: 5 pass, 0 fail in the focused contract suite.

Known limitation: measured reliability must come from a real calibration protocol and dataset. UNKNOWN must stay UNKNOWN; the contract computes no reliability itself.

Rollback: revert the S11a commit; no existing campaign behavior changes.

## S11b — benchmark promotion and external data custody

Problem: development-set performance must never grant product approval, and externally supplied bytes need server-side hashing, licence admission, schema validation and ArtifactRef custody.

Delivered:

- strict DEVELOPMENT → FROZEN → UNSEEN_EVALUATION → PROMOTION_DECISION state sequence;
- preregistration hash and frozen pass criteria before unseen evaluation;
- refusal when development and unseen dataset identities are the same;
- PRODUCT_APPROVED only after a distinct unseen evaluation passes every frozen criterion and an explicit APPROVE decision is recorded;
- external artifact ingest requiring source identity, APPROVED or accepted CONDITIONAL licence, raw bytes and schema validator;
- UNKNOWN/BLOCKED licences fail closed before storage;
- actual bytes are hashed server-side through the S9 ArtifactStorage port; caller-supplied hashes are not accepted as proof;
- custody record binds source, licence, retrieval time, schema identity and returned ArtifactRef.

Public contracts: packages/backend/src/compute/benchmarkPromotionGate.mjs and packages/backend/src/compute/externalArtifactIngestion.mjs.

Existing components reused unchanged: benchmark suite, provenance canonical hashing, D-149 allowlisted scientific ingestion and S9 ArtifactRef/object-storage port.

Claude integration: use the promotion record only as an admission artifact for an existing ResearchRun capability. Route bytes fetched by existing connectors through externalArtifactIngestion after a source-specific licence decision and schema validator are available.

Validation: 24 pass, 0 fail across promotion/ingestion, existing scientific ingestion and ArtifactRef/queue tests.

Known blockers: no production object storage is configured; source-specific licences and schema validators remain connector responsibilities; unseen benchmark datasets must be independently selected and licensed.

Rollback: revert the S11b commit; the existing D-149 ingestion remains unchanged.

## S11c — execution observability and independent audit

Delivered:

- correlated scientific execution event with request, ResearchRun, experiment and engine identity;
- status, timing, bounded resource use, error code and ArtifactRef metadata;
- recursive rejection of secrets, tokens, authorization, passwords, private/raw datasets and raw stdout/stderr fields;
- bounded path-redacted error detail;
- independent enterprise/security readiness audit and full completion report.

Public contract: packages/backend/src/compute/scientificObservabilityContract.mjs.

Validation: 65 pass, 0 fail across observability, worker HTTP, durable audit, supply-chain, secret, integrity, source-independence and egress suites.

Claude integration: emit this event shape from the existing ResearchRun/worker lifecycle into the selected production telemetry backend. Do not log scientific payload bytes or credentials.

Known blocker: no production telemetry backend, retention policy or deployment-specific encryption proof was selected in this track.

Audit: docs/CODEX_SOL_INDEPENDENT_AUDIT.md. Completion table: docs/CODEX_SOL_COMPLETION_REPORT.md.

Rollback: revert the S11c commit; existing logs and execution paths remain unchanged.

## Post-S11 integration — literature in canonical ResearchRun

Problem: the S1/S2 connector and claim-link port were present, but a real ResearchRun could not retrieve, persist or recover a literature snapshot.

Delivered:

- one editor-authorized ResearchRun API for retrieval; no second run, ledger, store or lifecycle;
- primary metadata retrieval plus an explicit contradiction-candidate query;
- one idempotent KNOWLEDGE_SNAPSHOT event in the existing ResearchRun hash chain;
- file-SQLite restart recovery and duplicate-request protection;
- planning context marked NOT_EVIDENCE; literature source ids cannot enter Evidence reference fields without canonical admission.

Public API: GET|POST /api/projects/:projectId/research-runs/:runId/literature.

Validation: focused ResearchRun/literature suite 16/16 PASS, including pause-during-retrieval race rejection; full backend 1,464 tests, 1,383 PASS, 0 fail, 81 declared runtime skips; lint 0 errors; production build PASS.

Claude integration: none required beyond review. ResearchRun remains the sole lifecycle owner. A future reviewed passage extractor may propose links through the existing port, but must not publish Evidence.

Known blockers: live provider/network availability, full-text access, passage review and commercial reuse rights remain external or source-specific.

Rollback: revert this integration commit; S1/S2 ports remain available without altering stored ResearchRuns.
## Post-S11 integration — DecisionTrace in NEXT_EXPERIMENT

Problem: ResearchRun selected the next experiment deterministically, but its canonical NEXT_EXPERIMENT event did not carry the structured D-141 DecisionTrace consumed by BYT and product inspection.

Delivered:

- deterministic DecisionTrace embedded in the existing NEXT_EXPERIMENT event; no table, store, lifecycle or private reasoning log;
- evidence references bind the preregistration, execution output, falsification seal, Evidence proposal and Replay output;
- every planned hypothesis is SELECTED, REJECTED with a machine reason code, or NOT_EVALUATED;
- HUMAN_REVIEW is explicit when Replay or remaining capability prevents autonomous continuation;
- BYT projects the trace from the verified ResearchRun event chain.

Validation: 14/14 focused DecisionTrace, ResearchRun execution/restart and BYT tests PASS; focused ESLint PASS.

Known limitation: trace quality is bounded by the frozen plan and current capability registry. It is structured decision provenance, not a claim that Genesis exposes private chain-of-thought.

Rollback: revert this integration commit; the prior NEXT_EXPERIMENT proposal remains compatible but loses its attached trace.
## Post-S11 integration - canonical candidate to laboratory handoff

Problem: the computational candidate protocol, preclinical protocol and external-laboratory closed loop existed, but a client had to assemble and submit the protocol boundary manually.

Delivered:

- one editor-authorized POST /api/projects/:projectId/campaigns/:campaignId/lab-handoff endpoint;
- server-side projection from persisted candidate and Science Run records into the existing computational and preclinical protocol contracts;
- one idempotent LAB_VALIDATION_REQUESTED event in the existing campaign log;
- file-SQLite restart recovery with stable preclinical, request and handoff fingerprints;
- explicit LAB_HANDOFF_READY, NO_WINNER and BLOCKED outcomes;
- a hard boundary that the Vina score is not a measurement, the physical assay was not executed, clinical efficacy is UNKNOWN, and execution requires an external laboratory plus human approval.

Validation: 60/60 focused candidate/protocol/laboratory tests PASS; full ESLint PASS.

Known blocker: physical validation remains BLOCKED_EXTERNAL_WET_LAB. The handoff contains high-level assay/falsification endpoints only; it does not authorise or execute synthesis, dosing or laboratory procedures.

Rollback: revert this integration commit; the existing manual lab-validation API and closed loop remain unchanged.

## Post-S11 integration - customer research delivery and commercial gate

Problem: a complete canonical ResearchRun could be inspected scientifically, and the commercial admission contract existed, but there was no single customer-facing projection proving both boundaries together. Accepting licence decisions from an API caller would also let a customer self-authorise an export.

Delivered:

- one read-only computational report projected from the canonical ResearchRun, literature snapshots, frozen experiments, falsification, Evidence proposals, Replay and DecisionTrace;
- one exact required commercial manifest for every cited source, executed engine and reasoning model;
- server-side-only commercial decision provider; request bodies cannot submit or override licence decisions;
- exact category, immutable identity and Evidence-reference matching before an item can satisfy the manifest;
- explicit `BLOCKED_SCIENTIFIC_INCOMPLETE`, `BLOCKED_COMMERCIAL_POLICY` and `READY_FOR_AUTHORISED_EXPORT` states;
- stable report and delivery fingerprints across a real SQLite restart;
- explicit `delivered=false`, `customerAccepted=false` and `paymentStatus=NOT_INTEGRATED` truth boundaries.

Public API: `POST /api/projects/:projectId/research-runs/:runId/customer-delivery`. Without a configured server-side commercial policy provider it fails closed as `BLOCKED_EXTERNAL_LICENSE_REVIEW`. A configured provider receives the server-derived required manifest and must return reviewed immutable records; client-supplied `items` are ignored.

Validation: 16/16 focused customer, commercial, ResearchRun execution and literature tests PASS; focused ESLint PASS. The golden fixture uses real RDKit and recovers identical report/delivery fingerprints after process/database restart.

Known blockers: no payment, customer acceptance, signed delivery receipt or production licence-decision provider is claimed. Evidence remains proposed until canonical human publication, and the report remains computational rather than clinical or wet-lab evidence.

Rollback: revert this integration commit; canonical ResearchRun, commercial admission and all scientific records remain unchanged.

## Post-S11 integration - full-app route proof

Problem: the previous visual QA covered 8 representative surfaces and 60 states, but the matrix called it full-app coverage and its raw artifacts were not bound to the current PR head.

Delivered:

- a repeatable route inventory generated from the canonical navigation model, App router literals and all parameterized laboratories;
- desktop 1440×900 and mobile 390×844 runtime checks for blank roots, page errors, console errors, ErrorBoundary fallbacks and document overflow;
- explicit classification of 401/403/429 responses as observed auth/admission boundaries while 5xx, request failures and missing non-API assets remain failures;
- representative screenshots plus SHA-256 hashes and a hashed raw JSON report;
- a checked-in evidence summary bound to tested commit `cc9c68b1` and exact App/navigation source hashes.

Validation: production build PASS; 94 routes × 2 viewports = 188/188 PASS, 0 runtime/render/overflow failures, 14 representative screenshot hashes. Evidence: `docs/evidence/full-app-route-proof-cc9c68b1.json`.

Known limitations: headless Edge/Chromium is not physical-device or real-GPU performance proof. Authenticated populated states remain covered by their focused product E2Es rather than this anonymous route inventory.

Rollback: revert the route-proof commits; product routes and UI code remain unchanged.

## Post-S11 integration - preregistered self-falsification challenge

Problem: ResearchRun already sealed every experiment against its frozen prediction, but a positive protocol result selected the next executable hypothesis without recording whether it was an explicit attempt to challenge that result.

Delivered:

- optional `challengesHypothesisIndex` in the model plan response, converted by the server to a canonical earlier `challengesHypothesisId`;
- fail-closed degradation of malformed, forward or rejected-hypothesis references;
- fixed-rule priority for a surviving executable challenge only after `SUPPORTED_WITHIN_PROTOCOL` and a usable Replay result;
- user focus remains the higher-priority steering decision;
- the challenge reason is recorded in the existing NEXT_EXPERIMENT proposal and fingerprinted DecisionTrace;
- no new run, store, lifecycle, Evidence record or falsification engine.

Validation: 18/18 focused ResearchRun/steering tests PASS and focused ESLint PASS. The integration fixture executes a first real RDKit experiment, obtains `SUPPORTED_WITHIN_PROTOCOL` and Replay `MATCH`, selects its preregistered null challenge, executes it through the same API, seals `FALSIFIED_WITHIN_PROTOCOL`, replays `MATCH` and verifies the canonical chain. Evidence: `docs/evidence/research-run-self-falsification-2a65c9ec.json`.

Known limitation: this proves bounded prioritization and execution of a challenge proposed before the first result. It does not claim that Genesis autonomously invents a new scientifically useful experiment after seeing the result.

Rollback: revert `2a65c9ec`; ordinary next-hypothesis selection remains available, but the explicit challenge relationship and reason disappear.
