# Canonical ResearchRun Evidence Pack specification

## Purpose

The pack lets a customer or independent reviewer answer five questions:

1. What question was approved?
2. What exactly ran, with which data, code, models and environment?
3. Which outputs support or contradict each report claim?
4. Can the result be verified or replayed?
5. Were all commercial-use and delivery obligations satisfied?

It is an export of existing records and artifacts. The `ResearchRunEnvelope` is a thin index over authoritative records; it is not another ledger, orchestrator, workflow database or scientific engine.

## Source-of-truth mapping

| Envelope area | Existing authoritative source |
|---|---|
| Customer request/project | backend intake and project persistence |
| Lifecycle, cancellation, budget, jobs | backend campaign/job/event records |
| Authenticated approvals | backend governance/auth audit record |
| Protocol and completed scientific runs | `ScientificEvidencePack` / Fabric IDs |
| Scientific evidence publication | `EvidenceLedger` entry IDs and chain root |
| Raw/derived files | artifact store object IDs and hashes |
| Portable metadata | RO-Crate/PROV-DM projection |
| Narrative | report projection from claim JSON |

Intake, rejection, cancellation and pre-execution blocks are lifecycle events, never fabricated Fabric runs. A ResearchRun may have no `ScientificEvidencePack` if execution never started.

## Logical envelope

```text
ResearchRunEvidenceBundle
├── identity and scope
├── approved plan and preregistration
├── hypotheses and decision history
├── sources and licensed inputs
├── execution runs and environment
├── raw and derived artifacts
├── claims and claim→evidence graph
├── counterevidence, failures and limitations
├── replay and independent verification
├── approvals and audit references
└── report projections
```

## Portable layout

```text
genesis-evidence-<packId>/
├── manifest.json
├── checksums.sha256
├── research-run.json
├── protocol/preregistration.json
├── hypotheses/hypotheses.json
├── sources/source-index.json
├── licenses/license-index.json
├── environment/software-bom.cdx.json
├── environment/runtime.json
├── runs/<runId>/request.json
├── runs/<runId>/provenance.json
├── runs/<runId>/stdout.log
├── runs/<runId>/stderr.log
├── artifacts/raw/...
├── artifacts/derived/...
├── claims/claim-evidence-graph.json
├── replay/replay-result.json
├── reports/customer-report.pdf
├── reports/customer-report.json
├── ro-crate-metadata.json
└── verification/verify.md
```

Files absent for legal, privacy or size reasons remain listed in `manifest.json` with an exclusion reason, retention location and immutable external identifier.

## Required sections

### 1. Identity and scope

- canonical `evidencePackId`, `researchRunId`, project/tenant ID;
- contract and exporter versions;
- created/closed timestamps from trusted execution records;
- customer question verbatim;
- normalized research objective;
- declared scope, exclusions, budget, time limit and stop conditions;
- risk class and intended use;
- responsible customer and Genesis approver references.

### 2. Plan and preregistration

- feasibility decision and reasons;
- approved engines, datasets and tools;
- primary/secondary metrics and units;
- success, failure and inconclusive criteria fixed before execution;
- sampling, statistical method and tolerance where applicable;
- authenticated approval record ID, approver identity/role and approved-object hash;
- immutable protocol fingerprint.

The backend appends a preregistration event containing the protocol hash and hashes of admitted inputs **before** the first data-access or execute event. Its sequence and previous-event hash form the anti-HARKing anchor. Any later change creates an authenticated amendment with author, reason and affected claims; it never overwrites the original plan.

### 3. Hypotheses and decisions

Each hypothesis records:

- stable ID and exact statement;
- origin: customer, literature, deterministic derivation or model proposal;
- parent hypothesis and generation rule where applicable;
- assumptions and required capabilities;
- test criterion fixed before the run;
- state history: proposed, admitted, tested, supported, refuted, inconclusive;
- linked runs, counterevidence and next-experiment decision.

### 4. Sources and data

Every source or dataset records:

- canonical URL/DOI/accession/release;
- publisher or provider;
- retrieved-at time and query parameters;
- immutable snapshot/hash when redistribution permits;
- exact passage/table/figure/page supporting a claim;
- transformations and parent artifact IDs;
- license record ID and redistribution decision;
- quality/retraction/version status;
- privacy, consent and customer-data classification.

Metadata-only references are allowed when full text cannot be redistributed. The report must not imply that unavailable content is present in the pack.

### 5. Software, models and environment

- Git commit and dirty-tree state;
- OS, architecture, CPU/GPU and driver details relevant to reproducibility;
- container image digest or environment lock;
- CycloneDX/SPDX SBOM including transitive dependencies;
- engine name, exact version and invocation;
- model code, weight/checkpoint identity and hash separately;
- training-data declaration or `UNKNOWN`;
- random seeds and determinism flags;
- secrets excluded by policy, with only secret identifiers recorded.

### 6. Runs and artifacts

Every attempted run is retained, including failures:

- request, normalized parameters and input artifact hashes;
- execution status, start/end, resource/cost usage;
- stdout/stderr or structured log;
- engine provenance and environment identity;
- raw outputs before interpretation;
- derived outputs with transformation lineage;
- warnings, assumptions, validity envelope and `resultOrigin`;
- cancellation, timeout and failure reasons.

### 7. Claim→evidence graph

Every material report claim has:

- stable claim ID and exact text;
- epistemic status;
- supporting source passage IDs and/or result artifact IDs;
- contradicting evidence IDs;
- method/run IDs that generated the result;
- uncertainty and validity boundary;
- reviewer decision.

Unsupported claims are blocked from the final report or explicitly labeled `HYPOTHESIS`, `UNKNOWN` or `NOT_MODELED`.

### 8. Replay and verification

Replay records:

- requested replay mode: offline verification, deterministic rerun or tolerance-based rerun;
- clean environment identity;
- expected artifact hashes or numeric tolerances;
- actual outcome: `MATCH`, `DRIFT`, `BLOCKED`, `NOT_EXECUTED`;
- drift explanation and affected claims;
- verifier version and signed result.

Deterministic outputs must match byte-for-byte. Nondeterministic methods require preregistered tolerances and comparison metrics.

### 9. Licenses and approvals

Every code, model, weight, dataset, publication, API and visual asset has a license gate record. `UNKNOWN`, prohibited noncommercial use, incompatible redistribution or missing customer rights block commercial delivery of the affected artifact.

### 10. Reports and views

The canonical pack may produce:

- internal full view;
- customer view;
- redacted/shareable view;
- JSON report;
- PDF report;
- RO-Crate/PROV-DM export.

All projections reference the same canonical ResearchRun and source pack IDs. Redaction creates a new view manifest, records removed entries, preserves verifiable hashes of retained content, and carries `parentManifestDigest`; it does not claim the canonical manifest root as its own.

## Integrity and trust model

1. SHA-256 digest for every included file.
2. Canonically serialized manifest without a self-hash.
3. `manifestSha256` stored in a separate signed envelope or independently retained trust record.
4. A verified organizational signature is required for `VALID_TRUSTED`; an unsigned pack can reach only `VALID_INTEGRITY_ONLY`.
5. EvidenceLedger chain root and referenced ledger entry IDs.
6. No secrets, tokens, personal data or licensed full text in logs by default.
7. Any change to declared content is detected relative to the trusted manifest digest.
8. The parser rejects duplicate paths, absolute paths, `..`, undeclared files, missing manifest entries, unsupported versions, oversized entries and decompression bombs.

## Minimum verifier result

```text
VALID_INTEGRITY_ONLY
VALID_TRUSTED
INVALID_HASH
INVALID_MANIFEST
MISSING_REQUIRED_ARTIFACT
LICENSE_BLOCKED
SIGNATURE_UNVERIFIED
REPLAY_MATCH
REPLAY_DRIFT
REPLAY_BLOCKED
```

Completeness, integrity, authenticity, license clearance and replay are separate results. Verification must never convert a partial or blocked pack into success.

## Acceptance criteria

- A clean offline verifier detects any declared-byte change relative to an independently trusted digest/signature.
- Every material claim resolves to exact evidence or is truthfully labeled unsupported.
- Failed and negative runs survive export.
- Inputs, outputs, environment and license decisions are versioned and hashed.
- The acceptance run in a fresh environment produces `MATCH` or passes its preregistered numerical tolerance for all primary outputs. `DRIFT` and `BLOCKED` remain truthful run results but fail the positive pilot readiness gate.
- Internal and redacted views point to the same canonical ResearchRun.
- Existing v1 packs remain readable through a compatibility adapter.
