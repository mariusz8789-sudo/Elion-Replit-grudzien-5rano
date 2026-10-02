# Canonical Evidence Pack decision

Status: proposed export contract, updated against GitHub main `5d064c4e`, PR #54 `fc29ef60` and PR #56 `0a372cdd` on 2026-10-01. All three were read; both implementation PRs remain open. This documentation does not claim their changes are deployed.

Genesis exposes one read-only ResearchRunEnvelope assembled from existing authoritative records. It is an export projection, not a database, ledger, workflow or execution authority. ENTITY-0 research state, ENTITY-1 self-model/capability decisions, ENTITY-2 knowledge and ENTITY-3 model proposals retain their existing ownership.

| Concern | Existing source of truth | Projection rule |
|---|---|---|
| Research identity | `agent_runs.id`, domain `genesis.research-run`; `researchRun.mjs` | Reuse existing ID/project; never mint a second run |
| Lifecycle | `agent_run_steps`, `toolInvoked = mind.researchState`; `agentRun.mjs` | Reference existing event sequence; reverify chain |
| Question and proposed plan | `PROBLEM_FORMALIZED`, `HYPOTHESES_GENERATED` | Model items remain PROPOSED / NOT_EVIDENCE |
| Frozen predictions/protocol | `PREDICTIONS_FROZEN`; `experimentMemory.preregisterExperiment`, `experiment_records` | Existing preregistration before execution; no new protocol store |
| Execution | `EXPERIMENT_HANDOFF.payload`, `research-run-execution@1`; PR #54 `researchRunExecution.mjs` | Event reference, `protocolId`, preregistration/fingerprint and `scienceRunId` links |
| Falsification | `SELF_FALSIFICATION` plus sealed SESSION via `sealExperimentSession` | Exact protocol-scoped verdict; no export-side reclassification |
| Evidence | `EVIDENCE_UPDATE.evidenceProposalId`; `knowledgeApi.mjs` | Proposal is not publication; resolve existing publish/approval record separately |
| Scientific output | `science_runs.id` saved by PR #54 | The existing canonical output and hashes, not a duplicate run |
| Replay | `science_run_verifications`; PR #54 uses `campaign/verify.mjs` | Reference every verification ID; first summary lives in NEXT_EXPERIMENT; later replays do not rewrite it |
| Next experiment | `NEXT_EXPERIMENT` | Reference fixed-rule proposal and its replay summary |
| Source/engine/artifact metadata | PR #56 literature, execution, S9 ArtifactRef, S11 decision/custody/observability contracts | Reuse ports/refs when integrated; no Astra replacement schemas for them |
| Reports and customer views | Existing report/ScientificEvidencePack/RO-Crate projections | Read-only views of these records; missing delivery/approval features stay PLANNED |

Backend paths above are under `packages/backend/src/`. Fabric/campaign records own their domain execution; they do not own ResearchRun lifecycle. No customer status can authorize execution or create scientific truth.

## Compatibility and scope

- Existing ScientificEvidencePack v1 remains readable; this schema neither replaces it nor requires rewriting old packs.
- [schema.json](./schema.json) validates a reference index over existing records; [example.json](./example.json) is explicitly synthetic documentation. Neither is a runtime serializer or proof that any run occurred.
- Failed intake/execution may have no Scientific Run or Evidence Pack. Empty arrays are honest; a partial export cannot claim successful delivery.
- The schema has no editable customer state, verdict, approval or ledger payload. Referential integrity and content hashes require the existing resolvers/verifiers, not JSON Schema alone.
- `VALID_TRUSTED` and organizational signatures remain PLANNED. Current schema permits no trusted-signature claim.

## Rejected approaches

1. A second autonomous-scientist ledger, store or scheduler.
2. ScientificEvidencePack/Fabric as the owner of intake or lifecycle.
3. A model, UI label or schema-validation pass promoting a hypothesis to evidence.
4. Reimplementing Sol's completed ports in documentation or a parallel runtime.
