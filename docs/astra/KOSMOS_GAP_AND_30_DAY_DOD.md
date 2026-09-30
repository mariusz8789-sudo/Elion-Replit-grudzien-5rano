# Edison Kosmos gap analysis and 30-day Definition of Done

## Comparison boundary

Kosmos “world model” means a persistent structured research state connecting hypotheses, literature, analyses and findings. It is not a rendered 3D world.

Genesis should claim an **auditable ResearchRun pilot informed by selected Kosmos capabilities**. Kosmos parity or compatibility must not be claimed until an independent benchmark defines and proves it. Edison materials are comparison inputs and vendor claims, not a compliance standard.

## Current strengths to preserve

- deterministic scientific engine adapters and fail-closed runtime states;
- Experiment Fabric protocols, provenance and replay concepts;
- EvidenceLedger and propose/approve discipline;
- multiple discovery strategies, falsification and belief revision;
- campaigns, persistence, Science Memory and reporting components;
- strong asset governance patterns and explicit epistemic labels.

## Gap matrix

| Capability | Genesis evidence observed | Gap relative to selected Kosmos capabilities | 30-day commitment |
|---|---|---|---|
| Literature research | Metadata/title-oriented adapters and domain sources | Full text, tables, figures, patents, passage citations, retraction/version checks | Licensed pilot corpus with passage-level citations |
| Arbitrary data analysis | Domain-specific workers and adapters | General Python/R/Bash/Jupyter sandbox, uploaded datasets, generated code provenance | Reuse one fixed worker image with allowlisted commands/scripts, no dynamic install, default-deny egress, resource limits and no runtime secrets |
| Long-running autonomy | Several loops and campaigns | Durable multi-hour planning, parallel agents, checkpoint/recovery, spend governance | One durable ResearchRun with restart/cancel/budget |
| Research world model | Several memories, ledgers and domain states | One shared claim/hypothesis/source/run graph | Canonical claim→evidence graph for pilot |
| Dataset discovery | Pinned and domain-specific sources | Autonomous search, schema understanding, quality/license selection | One or two allowlisted sources with license gate |
| Claim traceability | Evidence packs and reports exist separately | Every material sentence linked to passage/code/result | Enforced for pilot report |
| Secure execution | Scientific workers and runtime gates | Tenant-isolated code sandbox, egress controls, resource quotas, secrets policy | Threat model and bounded sandbox proof |
| Evaluation | Many repository tests and reference cases | Blind expert benchmark, scientific claim accuracy and reproducibility measures | Independent replay plus expert review |
| Collaboration | Approval concepts exist | Shared checkpoints, reviewer roles and durable decisions across a long run | Named customer and scientific reviewer gates |

## 30-day delivery plan

### Days 1–3 — freeze the pilot

- approve one bounded Drug Discovery customer question and reserve a named medicinal-chemistry reviewer;
- choose authoritative Fabric/campaign path;
- run reference-case proof for every proposed mandatory engine, then freeze inputs, engines, metrics, budget and human gates;
- accept Evidence contract ADR and implementation ownership.

**Exit:** signed scope, protocol skeleton, architecture map and baseline test list.

### Days 4–7 — commercial and data admission

- generate dependency/container/model/data inventory;
- review exact engine, weight, dataset and API terms;
- pin permitted target/candidate data;
- block unresolved artifacts from the delivery path.

**Exit:** no `UNKNOWN` license item in the intended customer deliverable, or a documented replacement/exclusion.

### Days 8–13 — canonical Evidence Pack

- connect the existing scientific pack, container, ledger references and RO-Crate projection;
- add SHA-256 artifact manifest, SBOM/environment and source/license indexes;
- persist packs in the backend project store;
- implement an artifact-bundle adapter and hardened offline verification; the current minimal `evidenceContainer` is a reuse pattern, not a ready general container.

**Exit:** export, restart, reload and tamper test pass without a second ledger.

### Days 14–18 — customer state machine

- connect intake, license/feasibility gate, plan approval, preregistration and execution;
- expose truthful progress, budget, cancel, retry and durable failures;
- maintain tenant/project isolation.

**Exit:** question reaches real run output after restart; license/runtime/cancel paths remain truthful.

### Days 19–23 — analysis, claims and replay

- construct claim→source/result graph;
- preserve counterevidence, negative runs and uncertainty;
- run clean-environment replay;
- produce canonical claim JSON and RO-Crate without adding unsupported conclusions. Every declarative report statement has a `claimId`; rendered formats may use only this JSON.

**Exit:** every material report claim resolves to evidence; the positive acceptance replay is MATCH or within preregistered tolerance for every primary output. Primary-claim DRIFT and BLOCKED fail this gate.

### Days 24–27 — scientific and security validation

- positive, negative, missing-data, unavailable-engine and corrupted-pack cases;
- fixed-worker allowlist/egress/secret/tenant tests;
- independent dataset or holdout where validation is claimed;
- medicinal-chemistry review.

**Exit:** review log and residual-risk register signed by named owners.

### Days 28–30 — independent acceptance

- clean installation and replay by a second person;
- measured cost and elapsed time;
- customer demo from question to downloadable JSON/RO-Crate evidence;
- explicit limitations and go/no-go decision;
- optional PySCF validation run only after primary DoD is secure.

## Primary Drug Discovery DoD

The pilot is complete only when:

1. A customer question and intended use are approved and preregistered.
2. All inputs are pinned, hashed, licensed and attributable.
3. Real configured engines execute; unavailable engines produce `BLOCKED_RUNTIME`.
4. Every attempted candidate and failed run remains in evidence.
5. Docking, ADMET and MD outputs retain their scientific limitations.
6. The report contains claim-level links to sources and run artifacts.
7. An offline verifier detects any mutation.
8. A clean positive replay yields MATCH or passes preregistered tolerance for every primary output. DRIFT affecting a primary claim and BLOCKED fail readiness.
9. The whole workflow survives restart and supports cancellation/idempotent retry.
10. A named scientific reviewer approves the customer interpretation.
11. Cost, duration, environment and residual limitations are recorded.
12. No evidence, license or runtime status is inferred from UI appearance or unexecuted code.
13. Core/backend/frontend tests relevant to the path, TypeScript, lint, production build and CI pass; v1 Evidence Pack read compatibility is regression-tested.
14. Service interruption during an active job resumes without duplicate execution or duplicate billing authorization.

## Optional PySCF validation DoD

- uses the same workflow and Evidence Pack without chemistry-specific schema changes;
- pins geometry, charge, spin, basis, method and PySCF environment;
- records convergence, energy units, warnings and validity bounds;
- clean replay meets the declared deterministic/tolerance rule;
- does not delay the primary Drug Discovery acceptance.

## Explicitly outside 30 days

- full Kosmos parity or thousands-of-paper scale;
- arbitrary autonomous internet access;
- arbitrary generated-code execution or dynamic package installation;
- unsupervised clinical or wet-lab decisions;
- general-purpose self-modifying code agents;
- multi-tenant regulated production certification;
- automatic redistribution of copyrighted full text;
- customer PDF polishing and a second full-domain acceptance run unless primary DoD finishes early;
- Hollywood visual-world work unrelated to this scientific acceptance path.

## Reference baseline

- Kosmos technical report: https://arxiv.org/abs/2511.02824
- Edison architecture: https://advances.edisonscientific.com/research/how-we-built-kosmos/
- Edison Analysis: https://advances.edisonscientific.com/research/introducing-edison-analysis/

These references define the comparison target. Genesis claims only capabilities demonstrated by its own executable evidence.
