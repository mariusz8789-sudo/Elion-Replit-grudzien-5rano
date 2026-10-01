# SOL/CODEX COMPLETION REPORT

Branch: `codex/sol-master-execution`  
Draft PR: #56  
No merge. No deploy. No force-push.

| Capability | Before | After | Stage/commit | Tests | Real runtime proof | Production ready? | Blocker | Claude integration |
|---|---|---|---|---|---|---|---|---|
| Heavy-compute security | Public/runtime boundary incomplete | Auth, authorization, limits, timeout/output gates; passive health | S0 `d579907c`, `7a983b3f` | Focused security/worker suites | HTTP worker tests | PARTIAL | Shared quota/production secrets | Review and merge |
| Europe PMC literature | No canonical literature port | Fail-closed structured connector with licence/provenance | S1 `1e6727ce` | Focused connector tests | Fixture proof; live access not claimed | PARTIAL | Network and more connectors | Thin ResearchRun call |
| Claim to source | No shared ResearchRun port | SUPPORTS/CONTRADICTS/CONTEXT/METHOD/UNKNOWN links | S2 `0b0bc395` | Focused tests | Contract proof | PARTIAL | Extraction review policy | Thin adapter |
| Engine execution | Engine-specific records | One request/admission/runtime/record contract | S3 `1ccd8e75` | Focused engine tests | RDKit existing; others gated | PARTIAL | Per-engine runtime proof | Use shared record |
| PySCF | Adapter/toolchain present | Canonical H2 ResearchRun entry | S4 `efa88d55` | Targeted pass; runtime skip | BLOCKED locally | NO | Installed Linux runtime | Persist existing record |
| Vina/Meeko | Adapter/target present | Canonical fixed docking ResearchRun entry | S5 `905916b5` | 21 pass, 3 skips | BLOCKED locally | NO | Installed runtime/CI proof | Persist existing record |
| ADMET | Real adapter, unclear commercial boundary | Technical gate plus commercial licence block | S6 `be916e4e` | 12 pass, 5 skips | BLOCKED locally | NO | Weights/data licences | Default product path stays blocked |
| OpenMM | Adapter/reference present | Bounded TIP3P ResearchRun entry | S7 `09e42d7b` | 43 pass, 15 skips | BLOCKED locally | NO | Runtime; candidate protocol | Reference validation only |
| Retrosynthesis | Adapter could reach missing external files | Code/model/template/stock gate | S8 `8241a459` | 27 pass, 1 skip | No route produced | NO | Licence and model data | Existing path now blocks |
| Worker infrastructure | SQLite/local process | Shared queue and ArtifactRef ports; current state labelled unsafe | S9 `2650784e` | 46 pass, 10 skips | Contract/local lifecycle | NO | Shared backend/storage | Provider adapters later |
| Scientific sandbox | No safe generated-code path | Python-only isolation contract; product blocked | S10 `c25deb66` | 13 pass | No container claimed | NO | Attested backend/review | None until backend exists |
| Decision metadata | Domain-specific shapes | ResourceProfile, AgreementRecord, eight-part uncertainty, falsification checks | S11a `1cb0bf5b` | 5 pass | Pure contract proof | CONTRACT_READY | Real calibration data | Report/plan projection |
| Promotion and ingest | Benchmark runner plus source-specific ingestion | Unseen-data promotion gate and server-hashed custody ingest | S11b `2fb87c43` | 24 pass | In-memory storage fixture | PARTIAL | Real datasets/storage/licences | Connect existing connectors |
| Observability | IDs/redaction varied by component | Correlated bounded execution-event contract | S11c (this commit) | 65 pass with security/worker suites | Worker HTTP proof | CONTRACT_READY | Production telemetry backend | Emit from worker/ResearchRun |

## What Claude only needs to merge

- Security/admission gates, literature foundation, generic execution records and fail-closed engine admission contracts.
- Worker, artifact, sandbox, promotion, ingestion, decision and observability contracts.
- Handoff and audit documents.

## What Claude connects through a thin adapter

- ResearchRun asking the literature port for sources and contradictions.
- Engine results persisted through the existing ScienceRun/Evidence/Replay path.
- ResourceProfile and UncertaintyBreakdown projected into the existing final report.
- Existing source connectors routed through custody ingest once storage, schema and licence decisions exist.

## What still requires Mariusz or external decisions

- Select/pay for shared queue, object storage, container compute and secrets infrastructure.
- Approve commercial licence decisions only after evidence from the rights holders.
- Provide or authorize production credentials without placing them in source control.
- Select an external scientific/wet-lab reviewer and validation partner.

## What remains BLOCKED

- Multi-replica worker production, object storage and generated-code sandbox.
- Local real runtime proof for PySCF, Vina/Meeko, ADMET and OpenMM in this environment.
- Commercial ADMET and retrosynthesis admission.
- Candidate-specific MD validation and any wet-lab efficacy/safety claim.

## Honest AVAILABLE_NOW boundary

- Existing RDKit-based ResearchRun is the strongest verified executor described by the current repository state.
- The new ports/contracts and security gates are reviewable now.
- Other engines are `CONTRACT_READY` or `BLOCKED`, not `AVAILABLE_NOW`, until real Linux runtime evidence passes.

## Quality advantage

Genesis can differentiate through fail-closed execution, preregistration, raw artifact hashes, claim-to-source links, counter-evidence, falsification, Replay and explicit uncertainty dimensions. The advantage is the auditable chain around real computation, not the number of screens or adapters.
