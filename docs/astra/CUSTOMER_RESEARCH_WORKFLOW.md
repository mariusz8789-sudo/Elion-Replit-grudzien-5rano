# Customer workflow — question to verified report

## Product promise

Genesis converts an approved scientific question into an auditable computational ResearchRun. It does not promise a therapeutic conclusion, wet-lab validation or autonomous external action.

## Canonical state machine

```text
INTAKE
  → CLARIFY
  → FEASIBILITY_AND_LICENSE_GATE
  → PLAN_DRAFTED
  → CUSTOMER_APPROVAL
  → PREREGISTERED
  → EXECUTING
  → ANALYZING
  → VALIDATING_AND_REPLAYING
  → REPORT_REVIEW
  → DELIVERED
  → FOLLOW_UP_PROPOSED
```

Durable terminal states:

```text
REJECTED_OUT_OF_SCOPE
BLOCKED_LICENSE
BLOCKED_DATA
BLOCKED_RUNTIME
BLOCKED_BUDGET
CANCELLED
FAILED
```

There is no success-shaped fallback from a blocked state.

Scientific outcome is separate from lifecycle. `SUPPORTED`, `REFUTED` and `INCONCLUSIVE` can all proceed through review and honest delivery. A removed blocker resumes only through an authenticated transition that preserves the original protocol and authorization; otherwise it requires an amendment and new approval.

## Stage contract

| Stage | Required input | Output | Human gate |
|---|---|---|---|
| Intake | Customer question, intended use, tenant | Verbatim request and project ID | Identity/authority check |
| Clarify | Missing target, data, constraints | Normalized question and exclusions | Customer confirms meaning |
| Feasibility/license | Candidate engines, data, APIs | Capability and license decision | Required for conditional assets |
| Plan | Accepted question | Protocol, budget, metrics, risks, stop rules | Customer approves plan and spend |
| Preregister | Approved plan | Immutable protocol fingerprint | Genesis records approval |
| Execute | Protocol and permitted resources | Real run records and raw artifacts | Approval for exceptional cost/external action |
| Analyze | Completed/failed runs | Derived artifacts, uncertainty, counterevidence | Scientific review for high-risk claims |
| Replay | Expected outputs and environment | MATCH/DRIFT/BLOCKED | Reviewer records drift; primary-claim drift fails positive readiness |
| Report | Claim graph and evidence | JSON/PDF and Evidence Pack | Named reviewer approves delivery |
| Follow-up | Gaps and counterevidence | Ranked next experiments with rationale | Customer selects next run |

## Customer-visible behavior

The customer can always see:

- current durable state and last completed transition;
- approved question and protocol;
- actual engine/runtime status;
- consumed and remaining budget;
- real progress derived from persisted jobs;
- warnings, failures and blocked reasons;
- draft findings with epistemic labels;
- Evidence Pack and replay state after completion.

The customer can approve/reject the plan, cancel future work, download permitted artifacts, request replay and submit feedback. Cancellation does not delete already-produced evidence.

## Autonomy boundary

Genesis may autonomously:

- normalize an in-scope question;
- select among pre-approved engines and datasets;
- execute within an approved protocol, budget and sandbox;
- analyze outputs using declared methods;
- propose follow-up experiments.

Genesis requires human approval before:

- changing the primary hypothesis, success criterion or intended use;
- accepting a remediated conditional license decision. Human approval alone can never override `UNKNOWN` or `BLOCKED` rights;
- exceeding budget/time/resource limits;
- sending data to a new external service;
- executing hazardous, clinical or physical-lab actions;
- delivering claims classified as medical, regulatory or high impact.

## Persistence and reliability

- The backend project/campaign store is authoritative; browser storage is a cache.
- Every transition is idempotent and has an event ID.
- Retrying a request cannot duplicate a paid run without a new execution authorization.
- The workflow resumes after service restart from the last durable state.
- Tenant/project boundaries apply to data, artifacts, logs and reports.
- Timeout, cancellation and worker failure create durable evidence events.

## Drug Discovery pilot

The 30-day pilot uses one bounded question and pre-approved inputs. During days 1–3 every mandatory engine must pass a real reference-case runtime proof and license gate. Unavailable or uncleared engines become optional before protocol approval. Suggested shape:

> For an approved target structure and a customer-provided or legally cleared small candidate set, rank candidates using only the subset of structure preparation, RDKit descriptors, bounded Vina docking, ADMET model estimates and OpenMM analysis that passed the reference-case gate.

Required honesty:

- Docking score is not binding affinity or efficacy.
- ADMET output is a model estimate, not a measured safety result.
- Short MD is a computational stability probe, not clinical evidence.
- Candidate ranking must preserve failed candidates and counterevidence.
- A medicinal-chemistry reviewer approves the final customer interpretation.

## Workflow acceptance

- One ResearchRun reaches a verified report through this state machine.
- A second unlike contract fixture/dry run can reuse the same envelope without Drug Discovery-specific fields; it is not a second customer acceptance run.
- Refresh/restart, retry and cancellation are demonstrated.
- License, data, runtime and replay failures end truthfully.
- Every material report claim links to the Evidence Pack.
