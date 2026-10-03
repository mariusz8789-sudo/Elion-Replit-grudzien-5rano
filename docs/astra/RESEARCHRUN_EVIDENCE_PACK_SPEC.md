# Canonical ResearchRun Evidence Pack

The customer must be able to inspect what was asked, proposed, frozen, executed, observed, falsified and approved, and what Replay actually did. This is a read-only projection of existing records. Baseline: main `5d064c4e`, PR #54 `fc29ef60`, PR #56 `0a372cdd`, checked 2026-10-01; open PR code is not a deployed capability.

## Source mapping

| Required content | Authoritative source |
|---|---|
| Question, project and identity | `agent_runs`; `PROBLEM_FORMALIZED` |
| Plan, hypotheses, source/counter-evidence references | `HYPOTHESES_GENERATED`; proposals remain NOT_EVIDENCE |
| Preregistration | `PREDICTIONS_FROZEN` and `experiment_records` PREREGISTRATION |
| Execution and environment | `EXPERIMENT_HANDOFF.payload`: `research-run-execution@1`, engine/runtime/toolchain metadata |
| Protocol binding | `protocolId`, `preregistrationRecordId`, `preregistrationFingerprint`, `predictionFingerprint` in PR #54 execution |
| Inputs and raw output | Execution hashes plus canonical `science_runs` referenced by `scienceRunId`; existing artifacts |
| Falsification | `SELF_FALSIFICATION` and experiment_records SESSION; server-derived criteria/verdict |
| Evidence admission | `EVIDENCE_UPDATE.evidenceProposalId`, proposal content hash and existing human publication decision |
| Replay | `science_run_verifications` rows and first summary in NEXT_EXPERIMENT; later attempts remain distinct |
| Next action | `NEXT_EXPERIMENT.proposal`; fixed rule, not a model's truth decision |
| Licences, sources, report artifacts | References to reviewed source decisions and existing exports; absent references stay absent |

PR #54's lifecycle is `PROBLEM_FORMALIZED → HYPOTHESES_GENERATED → PREDICTIONS_FROZEN → EXPERIMENT_HANDOFF → SELF_FALSIFICATION → EVIDENCE_UPDATE → NEXT_EXPERIMENT`. Replay uses existing ScienceRun verification and is not a newly invented research-state event. Runtime/engine faults return BLOCKED without sealing a scientific verdict; a transient API error is not automatically a persisted lifecycle event. Exports must not invent a persisted error record when none exists.

## Schema and example

[schema.json](./schema.json) is the contract for the index, version `research-run-envelope@1`, extended with the embedded experiment records described under Implementation. [example.json](./example.json) shows a synthetic, unexecuted run with a PROBLEM_FORMALIZED event locator and empty scientific result arrays. It claims no actual run, rights clearance, approval, valid integrity or Replay. The schema also describes an executed pack, which embeds the experiment events' payloads so their hashes can be recomputed (see Implementation).

| Envelope field | Resolution |
|---|---|
| `researchRunId`, `projectId` | Existing agent_runs identity and project; enforce ownership on every read |
| `eventRefs[]` | `{agentRunId, seq, type}` identifies `agent_run_steps` with `toolInvoked=mind.researchState`, `step_index=seq`; type must match observation.type |
| `experimentRecordRefs[]` | `experiment_records.id` and PREREGISTRATION/SESSION kind |
| `executionRecordRefs[]` | An EXPERIMENT_HANDOFF event locator; execution has no separate Astra table |
| `scienceRunRefs[]` | `science_runs.id` |
| `evidenceRefs[]` | Existing `evidenceProposalId` as `proposalId`; resolve through knowledge API, never assume published |
| `replayRefs[]` | `science_run_verifications.id` as `verificationId`, with its existing scienceRunId |
| `sourceArtifactRefs[]`, `reportArtifactRefs[]`, `licenceDecisionArtifactRefs[]` | Existing artifact IDs only; S9 ArtifactRef resolver when integrated. Empty if the producer/store is absent; no new store implied |
| `verification` | Export verifier report only; independent completeness, reference resolution, integrity and delivery checks. Not ResearchRun lifecycle |

Execution SHA-256 hashes and canonical ScienceRun hashes are not interchangeable: PR #54 uses full SHA-256 for execution inputs/outputs and `sha256Hex16` for ScienceRuns. Likewise prediction fingerprint and preregistration content hash have distinct meanings. Preserve each source field and algorithm; never pad/truncate one and present it as another. The reference schema deliberately does not redefine these algorithms.

## Semantic checks beyond JSON Schema

The serializer/verifier must resolve all references against the caller's project, verify existing state/memory chains, match run/experiment/protocol identity, check execution before/after ordering (implemented: chain order freeze → execution → falsification → evidence → next), preserve hashes in their original namespaces and resolve Evidence publication through its existing authority. Source/report/licence artifact references require actual retained bytes and access rights. Missing, cross-project, mismatched or unresolvable references fail delivery. JSON Schema cannot prove any of these facts.

Each material report claim needs exact source passage/table/version or execution observation and a rights decision; a proposal/UNKNOWN can be reported as such but cannot become a factual conclusion. Negative outcomes and counter-evidence survive export. Scientific Memory is referenced through existing experiment records and knowledge sources, never copied to a competing store.

## Verdicts and Replay

At PR #54 `fc29ef60`, `PROTOCOL_VERDICT` is `SUPPORTED → SUPPORTED_WITHIN_PROTOCOL`, `FALSIFIED → FALSIFIED_WITHIN_PROTOCOL`, `WEAKENED/UNRESOLVED → INCONCLUSIVE`. The sealed experiment retains the lower-level vocabulary. All apply only to the frozen hypothesis under its protocol, never universal scientific truth. Earlier CONFIRMED/REFUTED wording is obsolete for this head.

Canonical Replay distinguishes `MATCH`, `DRIFT`, `ENGINE_VERSION_CHANGED`, `BLOCKED_BY_RUNTIME`, `REPLAY_UNSUPPORTED`. PR #54 additionally summarizes a rejected input without Scientific Run as `NOT_APPLICABLE`. Its fixed-rule next-step gate accepts MATCH and NOT_APPLICABLE; other replay verdicts route to HUMAN_REVIEW. NOT_APPLICABLE is not a positive replay and fails the pilot's positive-execution acceptance requirement.

## Integrity and delivery

`verification.referenceResolution` and `integrity` remain UNVERIFIED until an actual verifier checks records/bytes. Completeness is separate from chain validity; licence/approval blockers are separate from scientific verdict and replay. A synthetic example always has UNVERIFIED references/integrity and NOT_EVALUATED delivery.

`VALID_INTEGRITY_ONLY` means verified fingerprints, references and relevant replay checks, without organizational authenticity. `VALID_TRUSTED` is PLANNED until a real signing key, trusted digest/signature distribution and verification exist; it is intentionally excluded from this schema. No signature is fabricated in the example. A report cannot upgrade any underlying outcome.

Organizational signing, report/licence-decision artifact producers and a durable customer-delivery workflow remain implementation work.

## Implementation (2026-10-03)

`packages/backend/src/researchRunEvidencePack.mjs` builds and verifies RESOLVED_EXPORT packs from the existing records; it adds no table, ledger or chain.

- `buildResearchRunEvidencePack(db, projectId, runId, { artifactStorage })` projects every closed experiment (frozen → handoff → falsification → evidence → next, plus ARTIFACT_PERSISTED). A run with no real execution returns `BLOCKED` (`NO_EXECUTED_EXPERIMENT` / `EXPERIMENT_NOT_EXECUTED`); nothing is assembled from a mock or substitute.
- `verifyResearchRunEvidencePack(pack, { db, projectId, artifactStorage })` recomputes, offline: input and output SHA-256, the prediction fingerprint (`hypothesisFingerprint`) and preregistration content hash from the frozen payload, the criteria statuses and `deriveVerdict` from the observed output, the execution-bundle digest of the artifact, each embedded payload's chain fingerprint, the chain head and the pack hash. With `db` it anchors every locator, payload, experiment record, Scientific Run, Replay row and Evidence proposal to the stored records, and with `artifactStorage` it re-reads the artifact bytes. Rejections name the class: `PARAMETER_MUTATED`, `DATA_MUTATED`, `ARTIFACT_MUTATED`, `ANALYSIS_MUTATED`, `ENGINE_OR_ENVIRONMENT_MUTATED`, `PROVENANCE_MISSING` (plus chain/anchor/pack-hash codes).
- Routes: `GET /api/projects/:projectId/research-runs/:runId/evidence-pack` (409 `BLOCKED` without an executed experiment) and `POST …/evidence-pack/verify` with `{ pack }`.
- Integrity is at most `VALID_INTEGRITY_ONLY`; without artifact storage it stays `UNVERIFIED`. Report and licence-decision artifacts have no producer, so `completeness` is `INCOMPLETE` and `delivery` is `BLOCKED` for every real pack today; they are listed in `verification.missing`, never invented.
- Science Run hashes (`sha256Hex16`) are compared only with the stored Scientific Run and its Replay rows, never with execution SHA-256.

### Schema changes made with the implementation

The schema followed the code where they differed; the synthetic example is unchanged and still validates.

| Change | Reason (code name) |
|---|---|
| `eventRefs[].type` enum = all `RESEARCH_STATE_EVENT_TYPES` | The chain also carries `SURPRISE_DETECTED`, `RESEARCH_STEERING`, `RUN_CONTROLLED`, `ARTIFACT_PERSISTED`, `GENERATED_ANALYSIS_*` (agentRun.mjs) |
| optional `eventRefs[].payloadFingerprint`, `transitionFingerprint` | The chain's own field names; needed to recompute the head offline |
| `producerCommit` may be `"unknown"` (never for ELIGIBLE) | `buildInfo.mjs` reports `unknown` instead of inventing a hash |
| new `experiments[]` (embedded event payloads, Replay rows, `summary`) and `integrity` (section digests, chain head, `packHash`), required for RESOLVED_EXPORT | The pack must carry what the verifier recomputes. This deliberately copies the experiment events' payloads; the chain stays authoritative and the anchored check compares them byte for byte |
| execution bundle artifact id in `experiments[].summary.artifactId` | ARTIFACT_PERSISTED bundles are neither source, report nor licence artifacts |

Validated with `jsonschema` Draft 2020-12 (metaschema, a real built pack, `example.json`) and in `researchRunEvidencePack.test.mjs`.
