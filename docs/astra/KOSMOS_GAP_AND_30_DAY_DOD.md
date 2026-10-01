# Research capability gaps and 30 day Definition of Done

This is a functional gap analysis, not a verified parity or superiority claim about Edison Kosmos. Persistent research state is distinct from a rendered world. Baseline checked 2026-10-01: main `5d064c4e`, PR #54 `fc29ef60`, PR #56 `0a372cdd`; PRs remain open.

| Capability | Inspected state and repository evidence | Remaining gap |
|---|---|---|
| Plan and persistent ResearchRun | Main `researchRun.mjs`, `agentRun.mjs`, ENTITY-0..3 | Customer projection and integration of open PRs |
| Preregistration and falsification | PR54 `experimentMemory.mjs`, `researchRunExecution.mjs` | More admissible protocols; verdict stays within protocol |
| Replay and chat | PR54 ScienceRun persistence + `campaign/verify.mjs`; `scienceChat/researchRunTurn.ts` | Portable export and independent clean-environment customer acceptance |
| Literature and claim-source | PR56 `literature/europePmcConnector.mjs`, `researchRunLiteraturePort.mjs`, `claimEvidenceLink.mjs` | Claude orchestration, live access proof, passage extraction/review and rights |
| Scientific engines | PR54 RDKit registry; PR56 PySCF/Vina/OpenMM bounded ports and ADMET/retrosynthesis admission | Installed Linux reference-case evidence, integration; commercial weights/data gates |
| Queue and storage | Main jobs/workers; PR56 `workerInfrastructureContract.mjs` | Real shared queue, atomic leases/quotas, retry persistence and object-storage provider |
| Generated-code sandbox | PR56 `scientificSandboxContract.mjs` | Container backend not configured; enforcement and adversarial review |
| Agreement and uncertainty | PR56 `scientificDecisionContracts.mjs` | Real independent calibration data; aggregate uncertainty stays null |
| Unseen evaluation and custody | PR56 `benchmarkPromotionGate.mjs`, `externalArtifactIngestion.mjs` | Licensed unseen datasets and production storage; no retroactive Run 8 promotion |
| Long-running autonomy | Main persisted runs/jobs; PR56 queue/resource contracts | Scheduler integration, checkpoints, total budgets, durable recovery |
| Enterprise/observability | Main auth/projects; PR56 `scientificObservabilityContract.mjs`, `docs/CODEX_SOL_INDEPENDENT_AUDIT.md` | Telemetry, secrets, retention, isolation and deployment-specific proof |
| Wet lab | Main `campaign/labClosedLoop.mjs`, `labEvidenceBridge.mjs` | Frozen physical design, verified custody and qualified partner |

Backend paths are under `packages/backend/src/`; the chat path is under `packages/frontend/src/core/`. Sol's contracts exist in PR #56; they are not production infrastructure. See [Advantage plan](./GENESIS_ADVANTAGE_PLAN.md) for scale, 7/14/30-day acceptance and independent-method limitations.

## Approved sequence and parallel Astra track

| Week | Core owner roadmap | Astra deliverable |
|---|---|---|
| W1 | Claude ResearchRun orchestrator and PR54 review | Canonical mapping, reference-only schema/example, customer projection; no second lifecycle |
| W2 | Sol literature ports, Claude integration | Source/licence records, metadata versus full-text boundaries, claim-source acceptance |
| W3 | Capability resolver, engine admission and runtime proof | Executability/licence/readiness view and release proof checklist, reusing PR56 contracts |
| W4 | GLP-1R flagship under frozen gates | Scoped dossier, Evidence/Replay/export acceptance, honest NO_WINNER/BLOCKED and partner handoff |

This schedule is a target conditional on access/runtime/rights. It does not assume a named medicinal-chemistry reviewer or partner already exists.

## Primary acceptance

One bounded question has one stable ResearchRun ID, proposed plan, immutable preregistration, real admitted execution, exact protocol-scoped falsification, pending then properly approved Evidence, positive Replay, and claim-linked JSON/RO-Crate report with per-item rights and reproduction instructions. Raw errors, negative results and UNKNOWN remain visible. A rejected input with NOT_APPLICABLE Replay does not pass positive Replay acceptance.

RDKit descriptors are the current PR54 baseline, not a full screening pipeline. Vina/ADMET/OpenMM do not enter the customer promise merely because PR56 contains ports. GLP-1R D-152 proves functional data sufficiency, not a trained model passing its gate. Preserve D-144 failed validation and all frozen thresholds. An engineering demo may pass with NO_WINNER while candidate readiness fails.

Only after the primary acceptance passes, a canonical PySCF H2 or bounded physics case may demonstrate reuse of the same lifecycle/export. Organizational signing, real calibration, private-data rights, independent science review and physical laboratory work cannot be completed by documentation or a schema.
