# SOL/CODEX COMPLETION REPORT

Branch: `codex/sol-master-execution`  
Draft PR: #56  
No merge. No deploy. No force-push.

Latest backend regression on the BYT closure tree: 1,402 PASS / 0 FAIL / 84 explicit runtime-dependent skips across 1,486 tests and 329 suites; lint has 0 errors and 13 existing warnings. The latest complete frontend/core/build regression remains the `4b333dd8` proof: frontend 7,555 PASS / 0 FAIL / 1 skip, core 344/344 PASS and production build PASS. See `docs/evidence/byt-cross-run-restart-fbaaa467.json` and `docs/evidence/full-local-regression-4b333dd8.json`. Linux CI remains a separate gate for the new BYT commit.

Main synchronization: `origin/main@fc5c88ce` was merged normally at `d9afd1a1` with zero conflicts and no force-push. The source tree hash remained exactly `dced6090e5ccb1554eb1e3da241ee0fa19b28ad3`, proving no PR #56 content was replaced. Full local gates and the authenticated browser proof passed again; see `docs/evidence/main-sync-regression-d9afd1a1.json`. Both Linux quality gates are GREEN on sandbox cleanup commit `fbaaa467`; the new BYT commit requires its own post-push rerun.

| Capability | Before | After | Stage/commit | Tests | Real runtime proof | Production ready? | Blocker | Claude integration |
|---|---|---|---|---|---|---|---|---|
| Heavy-compute security | Public/runtime boundary incomplete | Auth, authorization, limits, timeout/output gates; passive health | S0 `d579907c`, `7a983b3f` | Focused security/worker suites | HTTP worker tests | PARTIAL | Shared quota/production secrets | Review and merge |
| Europe PMC literature | No canonical literature port | Fail-closed connector plus canonical ResearchRun snapshot and contradiction-candidate search | S1 plus post-S11 integration | Full backend + restart integration | File-SQLite chain/restart fixture; live access not claimed | PARTIAL | Network, full-text review and more connectors | Integrated; no extra lifecycle |
| Claim to source | No shared ResearchRun port | Links plus idempotent KNOWLEDGE_SNAPSHOT; source ids remain NOT_EVIDENCE until canonical review | S2 plus post-S11 integration | Focused + full backend | Hash-chain and restart proof | PARTIAL | Passage extraction and human review policy | Integrated into canonical ResearchRun |
| Engine execution | Engine-specific records | One request/admission/runtime/record contract | S3 `1ccd8e75` | Focused engine tests | RDKit existing; others gated | PARTIAL | Per-engine runtime proof | Use shared record |
| PySCF | Adapter/toolchain present | Canonical H2 ResearchRun entry | S4 `efa88d55` | Targeted pass; runtime skip | BLOCKED locally | NO | Installed Linux runtime | Persist existing record |
| Vina/Meeko | Adapter/target present | Canonical fixed docking ResearchRun entry | S5 `905916b5` | 21 pass, 3 skips | BLOCKED locally | NO | Installed runtime/CI proof | Persist existing record |
| ADMET | Real adapter, unclear commercial boundary | Technical gate plus commercial licence block | S6 `be916e4e` | 12 pass, 5 skips | BLOCKED locally | NO | Weights/data licences | Default product path stays blocked |
| OpenMM | Adapter/reference present | Bounded TIP3P ResearchRun entry | S7 `09e42d7b` | 43 pass, 15 skips | BLOCKED locally | NO | Runtime; candidate protocol | Reference validation only |
| Retrosynthesis | Adapter could reach missing external files | Code/model/template/stock gate | S8 `8241a459` | 27 pass, 1 skip | No route produced | NO | Licence and model data | Existing path now blocks |
| Worker infrastructure | SQLite/local process | Shared queue and ArtifactRef ports; current state labelled unsafe | S9 `2650784e` | 46 pass, 10 skips | Contract/local lifecycle | NO | Shared backend/storage | Provider adapters later |
| Scientific sandbox and generated analysis | No safe generated-code product path | Python-only isolation contract plus canonical ResearchRun adapter, Science Chat front door and real Docker Linux-CI execution of frozen provider-generated Python | S10 `c25deb66`, post-S11 `236c72da`, `af73553e`, real runtime `5f385e5c` | 33 backend/security PASS; 9 Science Chat PASS; real runtime/isolation/resource/restart/Replay CI PASS; current full backend 1,400 PASS / 0 FAIL / 84 skips | Immutable image digest, network/read-only/non-root/no-secret/no-socket/no-capability/cgroup proofs, timeout/output cleanup proof, file-SQLite restart and Replay MATCH in `scientific-sandbox-runtime-${GITHUB_SHA}` | PARTIAL | Production sandbox deployment plus transitive image licence review; generated output remains `NOT_EVIDENCE` | No second lifecycle; existing ScientificSandboxPort only |
| Decision metadata | Domain-specific shapes | ResourceProfile, AgreementRecord, eight-part uncertainty, falsification checks | S11a `1cb0bf5b` | 5 pass | Pure contract proof | CONTRACT_READY | Real calibration data | Report/plan projection |
| BYT scientific self-model | Frontend/domain fragments plus a partial backend read projection | One canonical read model over verified ResearchRuns with cross-run Prediction Ledger, scoped calibration, deterministic Surprise events, Necropolis and DecisionTrace; identical after file-SQLite restart | final closure BYT milestone | 14/14 focused PASS | Two real RDKit runs, two Replay MATCH results, one preregistered anomaly and one falsification in `docs/evidence/byt-cross-run-restart-fbaaa467.json` | PARTIAL | Linux CI pending; probabilistic calibration remains `NOT_AVAILABLE`; surprise is `NOT_EVIDENCE` | Integrated over existing records; no BYT store or second lifecycle |
| Self-falsification challenge | Plans carried prose falsification proposals but NEXT_EXPERIMENT did not distinguish an executable challenge | Validated challenge relation in the frozen plan; after a supported result and Replay exactly `MATCH` the fixed rule prioritizes and executes the related real RDKit challenge | post-S11 `2a65c9ec`, hardened `047de5ca` | 19 focused PASS; ESLint PASS | Two consecutive real RDKit executions, Evidence proposals, Replay MATCH and one verified ResearchRun chain | PARTIAL | Only preregistered bounded challenges; no autonomous post-result experiment generation | Integrated into the existing plan and NEXT_EXPERIMENT event |
| Candidate laboratory handoff | Candidate, preclinical protocol and lab loop existed separately | Server-derived, idempotent candidate to protocol to external-lab request with restart recovery and honest NO_WINNER/BLOCKED outcomes | post-S11 integration | 60 focused PASS; lint PASS | File-SQLite API/restart proof | PARTIAL | External lab, expert review and observations | Integrated through existing campaign log and lab closed loop |
| Customer research delivery | Scientific and commercial gates existed separately | Canonical computational report plus exact server-side rights manifest, fail-closed export state and restart-stable fingerprints | post-S11 integration | 16 focused PASS; lint PASS | Real RDKit + file-SQLite restart proof | PARTIAL | Trusted production licence provider, delivery receipt, payment and customer acceptance | Integrated as read-only ResearchRun projection; no second lifecycle |
| Full-app route proof | Sampled visual QA covered 8 surfaces but was described too broadly | Automatic inventory from canonical navigation/router; 94 routes at desktop and mobile with hashed report/screens | post-S11 integration | 188/188 route cases PASS; production build PASS | Real local backend + production frontend in Edge/Chromium | PARTIAL | Physical devices, real GPU and populated authenticated states | Repeat `npm run proof:full-app` after route changes |
| Authenticated ResearchRun UI | No browser proof of a populated authenticated Science Chat golden path | Owner/project/session plus `/badanie` → `/eksperyment` → `/powtórz`; `/analiza` additionally proves the absent-sandbox refusal before provider execution | post-S11 `5301ad52`, extended `382ab489` | 2/2 viewport cases PASS; 24 total canonical events; 4 real RDKit executions; Replay MATCH; generated-analysis provider calls after block 0 | Production frontend/backend, file SQLite and real local RDKit; hashed screenshots/report | PARTIAL | Headless browser is not physical-device/real-GPU proof; real generated-code container remains blocked | Merge proof; provision sandbox separately |
| Promotion and ingest | Benchmark runner plus source-specific ingestion | Unseen-data promotion gate and server-hashed custody ingest | S11b `2fb87c43` | 24 pass | In-memory storage fixture | PARTIAL | Real datasets/storage/licences | Connect existing connectors |
| Observability | IDs/redaction varied by component | Correlated bounded execution-event contract | S11c (this commit) | 65 pass with security/worker suites | Worker HTTP proof | CONTRACT_READY | Production telemetry backend | Emit from worker/ResearchRun |

## What Claude only needs to merge

- Security/admission gates, literature foundation, generic execution records and fail-closed engine admission contracts.
- Worker, artifact, sandbox, promotion, ingestion, decision and observability contracts.
- Handoff and audit documents.

## What Claude connects through a thin adapter

- Literature is now integrated into canonical ResearchRun; Claude only reviews the API and event projection.
- Engine results persisted through the existing ScienceRun/Evidence/Replay path.
- ResourceProfile and UncertaintyBreakdown projected into the existing final report.
- Existing source connectors routed through custody ingest once storage, schema and licence decisions exist.

## What still requires Mariusz or external decisions

- Select/pay for shared queue, object storage, container compute and secrets infrastructure.
- Approve commercial licence decisions only after evidence from the rights holders.
- Provide or authorize production credentials without placing them in source control.
- Select an external scientific/wet-lab reviewer and validation partner.

## What remains BLOCKED

- Multi-replica worker production, object storage and production generated-code sandbox deployment.
- Local real runtime proof for PySCF, Vina/Meeko, ADMET and OpenMM in this environment.
- Commercial ADMET and retrosynthesis admission.
- Candidate-specific MD validation and any wet-lab efficacy/safety claim.

## Honest AVAILABLE_NOW boundary

- Existing RDKit-based ResearchRun is the strongest verified executor described by the current repository state.
- The new ports/contracts and security gates are reviewable now.
- Other engines are `CONTRACT_READY` or `BLOCKED`, not `AVAILABLE_NOW`, until real Linux runtime evidence passes.

## Quality advantage

Genesis can differentiate through fail-closed execution, preregistration, raw artifact hashes, claim-to-source links, counter-evidence, falsification, Replay and explicit uncertainty dimensions. The advantage is the auditable chain around real computation, not the number of screens or adapters.
