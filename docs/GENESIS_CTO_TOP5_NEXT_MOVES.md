# Genesis CTO Audit — TOP 5 next moves

**Audit baseline:** LIVE branch `manus/high-fidelity-epidemic-digital-twin`, verified at `87bb562` before this documentation reconciliation. The reconciliation itself is published as `ce49793`. The latest verified CI before reconciliation was `33091111045`.

**Scope decision:** This is a decision document, not an implementation ticket. No new scientific solver, fake result, mock screen, GIS ingestion, Wildfire module, biological claim, Matrix, Collider or second renderer is admitted by this report.

## Executive decision

Genesis already has a credible **Scientific Discovery Workflow spine**. Its highest-value remaining work is not adding more laboratory tiles. The largest gap is the distance between a successful bounded run and a partner-grade, inspectable, reproducible research artifact that another person can understand, revisit, compare and validate.

The operating gate remains:

> RESEARCH → MODEL → VALIDATION → ADMISSION → EXECUTOR → RESULT → VISUALIZATION → PROVENANCE → EVIDENCE → REPLAY

A route, parser, schema or catalog entry is not a connected scientific capability unless the complete chain is observable and tested.

## Current capability map

| Capability or surface | Status | Evidence in LIVE | Honest boundary |
|---|---|---|---|
| Epidemic city | **CONNECTED** | `epidemic-city` hands the same simulation instance to `#/city3d`; the run is synthetic and deterministic | Not a real-world forecast; unsupported transport/contact fields remain `NOT_MODELED` |
| Earthquake vertical slice | **CONNECTED** | Existing command-center confirmation path produces `ImpactResult`, bounded `DamageAssessment`, mapping, City3D projection and Evidence/Replay data | Structural damage, building inventory, live GIS and operational loss are `NOT_MODELED` |
| Scientific Chat | **CONNECTED with bounded commands** | Structured requests, typed intents, existing model/lab routing, Protocol/A-B route, Evidence/Replay route and Scientific Memory route | Deterministic command resolver; it does not autonomously invent or execute science |
| Experiment Pilot / Protocol | **CONNECTED** | Hypothesis, baseline, sweep parameter, metric, repetitions, falsification relation and explicit confirmation | A strong observation is not automatically causal or a discovery |
| Series Observation | **CONNECTED with honest boundary** | Existing `analyseExperimentSeries` over recorded `allRuns` | `REQUIRES_SCIENTIFIC_REVIEW`, `INSUFFICIENT_DATA` and `NO_THRESHOLD_FINDING` remain explicit |
| Evidence Pack / RO-Crate | **PARTIAL** | Existing Fabric Evidence Pack and RO-Crate projection | Requires a valid real-run protocol chain; Campaign-to-Fabric mapping remains blocked |
| Replay | **CONNECTED for Fabric paths** | Existing MATCH/DRIFT/BLOCKED/NOT_REPRODUCIBLE machinery | It verifies the declared record and contract, not truth in the physical world |
| Scientific Memory | **CONNECTED, local boundary** | `#/memory`, Home navigation, reopen with parameters, JSON export and delete | Local browser storage only; not shared collaboration or cloud evidence |
| Backend real engines | **CONNECTED where explicitly routed** | Canonical backend run ID, engine, model version, honesty and classification are surfaced | Fixed model envelopes; not a general-purpose scientific backend |
| Chemistry, water pump-pipe, quantum tunneling | **CONNECTED in bounded envelopes** | Existing engines/routes and provenance paths | Not CFD, full MD, therapeutic discovery, 2D/3D device prediction or broad chemistry |
| Discovery/Campaign | **PARTIAL / BLOCKED at interoperability seam** | Existing read-only Campaign entry point and contract fixture | No lossless, versioned Campaign → Fabric Evidence mapping has been proven |
| GIS/live data, Flood, FEA, CFD, Wildfire | **PARKED / VERIFY_REQUIRED** | Existing specifications or seams only | No admission until source, model, validation, licensing, security and provenance exist |
| Matrix, Collider, speculative time travel | **PARKED** | Strategy/specification material only | No executable capability is admitted |

## Largest gaps

The current gaps are primarily **trust, continuity and productization gaps**, not missing animations. Users can open a model, execute bounded work and inspect portions of evidence, but the platform still needs a more disciplined partner-grade path that answers: what was preregistered, what actually ran, which result is being shown, how can another person replay it, what changed, and what remains unsupported?

A second gap is admission governance at scale. The current generic executor honesty work prevents known false claims, but the platform still needs a maintained capability matrix that is treated as a release artifact: every admitted model must name its executor, validation evidence, route, visual output, provenance fields, failure behavior and explicit limitations.

A third gap is customer continuity. Scientific Memory is intentionally local and honest. That is useful for a single-browser demo, but a commercial research workflow eventually needs a validated project/session boundary, access policy, immutable artifact identity and server-side persistence. This should not be added until the existing account and Cloud Projects contracts are audited end to end.

## TOP 5 next CTO moves by ROI

### 1. Finish the partner-grade Evidence / Replay loop

**Priority:** P0. **Status:** `PARTIAL → target CONNECTED`.

**What exists:** Fabric Evidence Pack, RO-Crate projection, Protocol/A-B designer, series observations, provenance transparency, replay verdicts and Earthquake evidence already exist in separate connected portions. Relevant code lives under `packages/frontend/src/core/experimentFabric/` and the existing Evidence/Replay UI.

**What is missing:** One canonical, user-facing flow that starts from a confirmed Protocol, makes the completed real runs and provenance visible, exports one deterministic artifact, reopens it, and shows a replay verdict without asking the user to understand internal seams. Missing or incompatible inputs must remain `PROTOCOL_REQUIRED`, `VARIANT_REQUIRED`, `BLOCKED` or `NOT_REPRODUCIBLE` rather than being upgraded.

**Research required:** Review the existing Evidence Pack and RO-Crate contracts against the actual Pilot, Replay and export UI. Identify every field that can be lost between protocol, run, pack, RO-Crate and replay. No external scientific claim is needed; this is a contract and reproducibility audit.

**Specification required:** Define one canonical Evidence session envelope containing protocol ID, run fingerprints, model/version, engine, parameter snapshots, result origin, deterministic flag, limitations, replay verdict and disclaimer. Define explicit failure states and a no-fabrication invariant.

**Validation plan:** Contract tests for complete, missing-protocol, incompatible-variant, drifted-record and blocked-record cases; deterministic serialization tests; Chromium desktop/mobile proof from Pilot → evidence → export → reload/replay; backend/CI gate; verify Earthquake and Epidemic regressions.

**Value:** Highest immediate credibility for municipalities, research partners and investors. It converts “Genesis can run models” into “Genesis can preserve and challenge what was run.”

**Risks:** Accidentally creating a second Evidence system, implying causal discovery, or silently converting Campaign records. Campaign interoperability must remain `BLOCKED/PARKED` until lossless mapping is proven.

### 2. Establish a release-gated Capability Admission Matrix

**Priority:** P0. **Status:** `PARTIAL → target CONNECTED governance`.

**What exists:** Knowledge registry, router, capability labels, generic executor, backend execution seam, provenance and the new REAL_ENGINE coverage guard. Claude’s accepted honesty fix is now in LIVE.

**What is missing:** A single maintained machine-readable and human-readable matrix joining model ID, capability class, executor entry point, model version, route, visualization, validation evidence, provenance requirements, failure status and `NOT_MODELED` boundary. The matrix must be a CI gate, not merely documentation.

**Research required:** Enumerate every router model and compare it with generic executor coverage, backend adapter coverage, route registration, output fields and existing tests. Classify each as `CONNECTED`, `MODEL_AVAILABLE`, `NOT_CONNECTED`, `VERIFY_REQUIRED` or `PARKED`.

**Specification required:** Define admission rules: a `REAL_ENGINE` model must either complete through its named executor or declare a named adapter seam; a non-executed run cannot have `resultOrigin = real-engine`; every route must identify its proof boundary; every unsupported output remains `NOT_MODELED`.

**Validation plan:** Generate a coverage report in CI; fail on undocumented REAL_ENGINE exceptions, missing provenance fields, route-only claims or unbounded result origins. Add fixture tests for one completed, rejected, failed, backend and parked capability. Review the matrix before every new domain.

**Value:** Prevents Genesis from becoming a catalog of misleading buttons and creates a defensible scientific governance story.

**Risks:** False confidence from a green matrix, test fixtures that do not exercise real engines, or treating an adapter seam as completed science. The matrix must distinguish `MODEL_AVAILABLE` from `CONNECTED`.

### 3. Make Scientific Memory the honest bridge into Evidence / Replay

**Priority:** P1. **Status:** `CONNECTED local → target CONNECTED local-to-evidence handoff`.

**What exists:** `#/memory`, local records, fingerprints, parameter reopening, local JSON export, Science Chat navigation and the existing scenario bridge.

**What is missing:** A clear action from a saved record to the canonical Evidence/Replay surface that preserves the distinction between a local memory record and a formal Evidence Pack. The action must show whether the record is eligible for evidence, requires a protocol, or is only a historical local snapshot.

**Research required:** Trace `SavedExperiment` fields against `ExperimentRun`, `ScientificEvidenceChain`, Evidence Pack and replay contracts. Determine which local records can be linked losslessly and which must be marked `PROTOCOL_REQUIRED`.

**Specification required:** Add a read-only eligibility projection, not a new storage system: `LOCAL_SNAPSHOT`, `EVIDENCE_ELIGIBLE`, `PROTOCOL_REQUIRED`, `NOT_REPRODUCIBLE` or `BLOCKED`. Never infer a missing protocol or create a fabricated run.

**Validation plan:** Fixture tests for each eligibility state; browser proof for open-memory → inspect provenance → open Evidence/Replay; verify delete/export behavior remains local; desktop/mobile and CI gate.

**Value:** Improves demo continuity and makes the product feel like a research workspace rather than a set of disconnected screens.

**Risks:** Confusing local history with reproducibility, leaking local data into cloud state, or creating a second evidence representation.

### 4. Audit and validate customer workspace persistence

**Priority:** P1. **Status:** `VERIFY_REQUIRED`.

**What exists:** AccountPanel, optional account messaging, Cloud Projects surfaces and backend/session contracts are present in the repository. The current public demo deliberately works locally without login.

**What is missing:** Proof that one authenticated user can create/open a project, persist the intended artifacts, preserve provenance and replay identifiers, and recover safely after refresh or session change. The current code inventory does not by itself prove the complete customer path.

**Research required:** Audit the actual auth, project, database and storage routes end to end. Verify ownership, authorization, deletion, conflict behavior, artifact immutability, run identity and whether any data is sent to a server unexpectedly.

**Specification required:** Define the smallest workspace contract: project ID, owner, artifact IDs, immutable provenance references, versioning, access policy, deletion semantics and offline/local fallback. Do not add RBAC or enterprise administration until this base contract is proven.

**Validation plan:** Authenticated browser proof using a test account; create/open/refresh/reload/replay/export; unauthorized access and stale-session tests; backend tests, security checks, CI and explicit local-only fallback proof.

**Value:** Necessary for paid pilots and municipal/research collaboration, while keeping the free/local demo intact.

**Risks:** Authentication state, personal data, accidental public exposure, and premature enterprise complexity. This item requires a separate security review before implementation.

### 5. Admit one externally validated, bounded dataset-backed capability

**Priority:** P2. **Status:** `VERIFY_REQUIRED / PARKED until research passes`.

**What exists:** Dataset registry, provenance patterns, model routes, synthetic hazard contracts and prior audits. The repository contains specifications for GIS/multi-hazard and other domains, but not an admitted live-data capability under the current contract.

**What is missing:** A specific public dataset with clear license, version pin, schema, ingestion path, uncertainty policy, deterministic fixture and a bounded model that can produce evidence without pretending to forecast or diagnose. This is not a request to implement GIS or Wildfire now.

**Research required:** Select exactly one use case and source. Verify licensing, provenance, update policy, spatial/temporal resolution, missingness, bias, validation literature and whether the existing City3D/WorldState contract can represent it without filling `NOT_MODELED` fields.

**Specification required:** Define source artifact, dataset version, normalization, model assumptions, admission class, output schema, visualization projection, evidence fields, replay hash, uncertainty and prohibited claims. If any field cannot be represented honestly, stop at `VERIFY_REQUIRED`.

**Validation plan:** Offline pinned fixture; independent reference values; deterministic rerun; source-hash verification; malformed/missing-data cases; City3D read-only projection; provenance and replay; expert review before public admission.

**Value:** Long-term moat through trustworthy domain depth and a route toward municipal use cases, but only after the first four trust/product gates are stronger.

**Risks:** Licensing, data drift, false precision, live-network security, second-world contamination and unsupported operational claims. The default decision is `PARK`.

## Recommended sequence

The first implementation candidate is **TOP 1: the canonical Evidence / Replay loop**. TOP 2 should be designed in parallel as a governance specification but not used to justify new model count. TOP 3 can follow if its eligibility projection is demonstrably a thin adapter. TOP 4 requires a security and auth review. TOP 5 should not enter implementation until a concrete dataset and validation partner are identified.

No item should be marked `DONE` merely because its parser, route, UI, schema or documentation exists. The next decision gate is research and specification for TOP 1, followed by a written validation matrix. Only after that gate is accepted should implementation begin.

## Final CTO decision

Genesis should now optimize for **trust density per workflow**, not number of laboratories. The platform’s commercial advantage is the combination of bounded models, honest provenance, explicit uncertainty, visible Evidence and replayable history. The next milestone must strengthen that combination or remain parked.
