# Sol/Codex independent technical audit

Date: 2026-10-01  
Scope: security, literature, engine execution, workers, artifacts, sandbox, promotion, ingestion and observability.  
Method: repository inspection plus targeted tests. No deploy and no production infrastructure probe.

## Enterprise foundation

| Control | Status | Evidence | Remaining blocker |
|---|---|---|---|
| Project isolation and RBAC | PARTIAL | Existing API/store tests cover owner/admin/editor/viewer and cross-project refusal. | Independent production tenant-escape test and database policy review. |
| Heavy-compute authorization | IMPLEMENTED | S0 gates executable endpoints and keeps health passive. | Deploy configuration and production token rotation proof. |
| Worker authentication | IMPLEMENTED | Service token required before engine lookup/execution. | Managed secret store and rotation runbook. |
| Secrets | PARTIAL | Server-side secret boundary, secret scanning and response redaction are tested. | Production secret manager, rotation and incident process. |
| Rate/concurrency limits | LOCAL_ONLY | Per-user and concurrent heavy-job limits exist in-process. | Shared atomic quota for multiple replicas. |
| Queue | BLOCKED_FOR_MULTI_REPLICA | Durable SQLite rows exist; S9 defines lease-capable port. | Shared backend, atomic claims, heartbeat, retry and dead-letter persistence. |
| Artifact storage | BLOCKED | S9 defines content-addressed ArtifactRef and storage port. | Object-storage provider, credentials, lifecycle and deletion policy. |
| Scientific sandbox | BLOCKED | S10 defines Python-only deny-by-default contract. | Attested container backend and adversarial security review. |
| Audit integrity | IMPLEMENTED_LOCALLY | Hash-chained durable audit and scientific-integrity watchdog tests pass. | Central retention, access control and external archival policy. |
| Observability | CONTRACT_READY | Correlated request/run/experiment/engine event contract; sensitive fields rejected. | Connect workers and ResearchRun to a production metrics/log backend. |
| Data retention/export/delete | UNKNOWN | No complete enterprise policy verified in this track. | Product/legal policy plus implementation and tenant-level tests. |
| Encryption at rest/in transit | UNKNOWN | No deployment configuration was inspected. | Infrastructure-specific proof. |
| Dependency/supply chain | PARTIAL | Lockfile provenance, integrity and registry checks exist. | Recurring CVE/SBOM pipeline and image-signing policy. |
| SSO/billing | OUT_OF_SCOPE | Explicitly excluded from this track. | Separate product decision. |

## Scientific execution admission

| Capability | Honest status after this track | Proof boundary |
|---|---|---|
| RDKit | BEST_PROVEN_EXISTING_EXECUTOR | Existing ResearchRun path; not rebuilt here. |
| PySCF | CONTRACT_READY / LOCAL_RUNTIME_BLOCKED | Canonical H2 request and execution record; runtime absent locally. |
| Vina/Meeko | CONTRACT_READY / LOCAL_RUNTIME_BLOCKED | Canonical fixed target/ligand/seed/box contract; runtime absent locally. |
| ADMET-AI | TECHNICAL_CONTRACT / COMMERCIAL_BLOCKED | Runtime absent locally; weights and per-dataset commercial rights unresolved. |
| OpenMM | CONTRACT_READY / LOCAL_RUNTIME_BLOCKED | Bounded TIP3P reference only; no candidate-stability claim. |
| AiZynthFinder | BLOCKED_BY_LICENSE_AND_DATA | Code licence known; model/templates/stock rights and files unresolved. |

An adapter file is not runtime proof. `AVAILABLE_NOW` requires a real Linux execution with version, environment, hashes, provenance, failure behavior and ResearchRun-compatible output.

## Findings that cannot be closed by code alone

- Commercial review of ADMET weights/training datasets and retrosynthesis model/templates/stock.
- Independently selected and licensed unseen benchmark datasets.
- Production object storage, shared queue, secrets manager and container runtime.
- External scientific review for candidate-specific docking/MD protocols.
- Wet-lab partner, assay protocol, chain of custody and accepted observations.
- Deployment-specific encryption, retention and regional data requirements.

## Final risk judgement

The architecture now has clear fail-closed contracts and thin adapters around existing ResearchRun/Evidence/Replay. It is not production-ready infrastructure. The strongest honest demonstration remains one bounded end-to-end run with real installed engines, stored artifacts, Replay and a `NO_WINNER/BLOCKED` outcome when evidence is insufficient.
