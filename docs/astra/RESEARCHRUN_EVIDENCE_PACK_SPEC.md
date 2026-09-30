# Canonical ResearchRun Evidence Pack

## Purpose

The pack lets a customer verify what was asked, proposed, frozen, executed, observed, falsified and approved, and whether the run can be reproduced. It is assembled from existing records under one `researchRunId`.

## Canonical contents

| Required item | Existing source / rule |
|---|---|
| Question | `PROBLEM_FORMALIZED` |
| Research plan and hypotheses | `HYPOTHESES_GENERATED`; model output remains `PROPOSED` and `NOT_EVIDENCE` |
| Preregistration | `experiment_records` created by `preregisterExperiment` before execution |
| Sources and licences | evidence references plus per-item licence decision; absent evidence remains absent |
| Engine identity/version | `research-run-execution@1` and canonical toolchain status |
| Environment | execution record: engine/runtime/toolchain fingerprint and bounded environment metadata |
| Inputs and hashes | preregistration/execution record; immutable input hash |
| Raw outputs and hashes | execution record/artifact store; immutable output hash |
| Errors and blocks | ResearchRun event or execution record with machine-readable reason; never synthesize output |
| Counter-evidence | hypothesis contradicting references and observed failed predictions |
| Falsification verdict | `SELF_FALSIFICATION`; applies only to the frozen hypothesis under the frozen protocol |
| Replay | existing Replay result and artifact references |
| Scientific Memory | references to existing memory/knowledge records; no copied memory store |
| Final report | existing JSON/PDF/RO-Crate projection, with claim-to-evidence links |
| Reproduction instructions | pinned versions, inputs, commands, environment and expected hashes |

R1-b currently exposes an executable ResearchRun adapter for **RDKit only** (`researchRunEngines.mjs`). Other installed or campaign-visible engines are not automatically executable through ResearchRun.

## Minimal envelope

```json
{
  "contract": "research-run-envelope@1",
  "researchRunId": "agent_runs.id",
  "researchRunContract": "research-run@1",
  "stateChainRef": "agent_run_steps",
  "eventRefs": [],
  "experimentRecordRefs": [],
  "executionRecordRefs": [],
  "evidenceRefs": [],
  "replayRefs": [],
  "memoryRefs": [],
  "reportRefs": [],
  "licenceDecisionRefs": [],
  "integrity": { "status": "VALID_INTEGRITY_ONLY" }
}
```

The JSON is illustrative documentation, not an implemented schema.

## Integrity and trust

Verification reports separate outcomes:

- `INVALID`: hash chain or referenced artifact integrity fails;
- `INCOMPLETE`: a required reference or artifact is absent;
- `BLOCKED`: runtime, licence, privacy or approval gate prevents delivery;
- `VALID_INTEGRITY_ONLY`: fingerprints and replay/integrity checks pass, without organizational authenticity;
- `VALID_TRUSTED`: **PLANNED** and permitted only after an organizational signing key and signature verification exist.

`SUPPORTED`, `REFUTED` and `INCONCLUSIVE` describe only a frozen hypothesis evaluated under its preregistered protocol. They are not universal scientific truth.

## Acceptance invariants

1. One question maps to one stable ResearchRun ID under existing deduplication rules.
2. Plan proposals cannot set evidence truth.
3. Preregistration exists before execution.
4. Every delivered claim links to a source, execution observation or explicit `UNKNOWN`.
5. Input/output/environment fingerprints are stable and verifiable.
6. Replay mismatch, unknown rights or missing mandatory approval fails closed.
7. Reports cannot upgrade the underlying verdict or trust state.
