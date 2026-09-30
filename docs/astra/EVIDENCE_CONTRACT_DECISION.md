# ADR — canonical Evidence Pack strategy

## Status

Proposed consolidation, corrected against current `main` and the open R1-b implementation in PR #54.

## Decision

Genesis should expose one read-only `ResearchRunEnvelope` assembled from existing authoritative records. It is an export projection, not a database, ledger or orchestrator.

| Concern | Existing source of truth | Action |
|---|---|---|
| Research identity | `agent_runs.id`, domain `genesis.research-run` in `packages/backend/src/researchRun.mjs` | Reuse unchanged |
| Research lifecycle | verified hash chain in `agent_run_steps` via `agentRun.mjs` | Reuse unchanged |
| Question and proposed plan | `PROBLEM_FORMALIZED`, `HYPOTHESES_GENERATED` | Reference from envelope |
| Frozen predictions and protocol | `PREDICTIONS_FROZEN` plus `experimentMemory.preregisterExperiment` / `experiment_records` in PR #54 | Reference; do not duplicate |
| Execution identity and results | `research-run-execution@1` in `researchRunExecution.mjs` | Reference execution record |
| Falsification | `SELF_FALSIFICATION` | Reference scoped verdict |
| Evidence proposal/update | `EVIDENCE_UPDATE`, existing Evidence Ledger/knowledge contracts | Reference IDs; preserve human approval rules |
| Next experiment | `NEXT_EXPERIMENT` | Reference event |
| Fabric/campaign/science runs | existing domain execution records | Link when used; they do not own ResearchRun lifecycle |
| Replay, reports, RO-Crate | existing projections/generators | Export without replacing |

The customer workflow states are derived from this chain plus existing approval records. They must not be persisted as a competing lifecycle.

## Compatibility

- Existing v1 Evidence Packs remain readable.
- Stable record IDs are referenced instead of copied into a new ledger.
- A run blocked before computation may have no Fabric/science-run pack and must still export its honest ResearchRun state.
- `schema.json` and `example.json` are intentionally deferred to the implementation PR that binds this approved mapping to real serializers.

## Rejected options

1. A new autonomous-scientist Evidence database: duplicates ResearchRun and Evidence/Replay.
2. Treating `ScientificEvidencePack` as the lifecycle owner: it cannot represent intake or pre-execution blocks.
3. Letting UI status create scientific truth: presentation is never authoritative.
