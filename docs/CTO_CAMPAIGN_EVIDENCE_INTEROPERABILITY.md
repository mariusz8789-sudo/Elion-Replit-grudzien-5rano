# CTO Decision — Campaign Evidence Interoperability

**Decision:** `PARK / BLOCKER` for cross-pipeline Evidence export.  
**Accepted capability:** existing Campaign backend evidence remains real and usable inside CampaignScreen.  
**Not accepted:** automatic projection into the frontend Experiment Fabric Evidence Pack or RO-Crate.

## Finding

The Campaign backend persists candidates, scientific runs, decisions, transformations, strategy events, discovery graph nodes and WHY answers. Its evidence is real within the Campaign contract and is covered by backend tests, including honest replay failure when no replay path exists.

The frontend Experiment Fabric Evidence Pack has a stricter and different contract. It requires a `ScientificEvidenceChain` created from completed real runs, with Fabric run IDs, model metadata, input snapshots, output snapshots, units, limitations, provenance and an evidence status. Its RO-Crate serializer is a faithful projection of that chain; it is not a generic importer for arbitrary backend campaign events.

The two contracts are therefore not interchangeable. Campaign candidates may represent persisted chemistry search decisions and model estimates with lineage, while a Fabric Evidence Pack represents a confirmed structured experiment chain. A direct cast, field rename or parser-only projection would either lose lineage/authorization context or create a false impression that campaign decisions are equivalent to Fabric runs.

## Status table

| Surface | Status | Evidence-based decision |
|---|---|---|
| CampaignScreen and backend campaign evidence | `CONNECTED` | Keep as the source of truth for Campaign. |
| Campaign candidates, transformations and lineage | `CONNECTED` | Expose only through existing Campaign API/UI. |
| Campaign WHY and Discovery Graph | `CONNECTED` | Preserve persisted-event semantics. |
| Campaign replay | `PARTIAL` | Only existing wired replay paths may claim replay; unsupported cases remain explicit. |
| Campaign → Fabric Evidence Pack | `BLOCKED` | No safe shared chain schema exists today. |
| Campaign → Fabric RO-Crate | `BLOCKED` | Requires a reviewed mapping, not a direct serializer call. |
| Campaign → Science Chat execution | `NOT_CONNECTED` | Science Chat only opens CampaignScreen; it does not create/start campaigns. |

## Why this is a blocker

A safe adapter would need to define, at minimum, the campaign/project identity and RBAC context, campaign and job IDs, engine/version and runtime, candidate lineage, transformation history, objective definitions, model-estimate evidence class, persisted event ordering, cancellation state, replay method and result, failure semantics, and a lossless mapping into Evidence Pack/RO-Crate. The current contracts do not provide a proven lossless mapping.

Implementing a quick exporter would produce a second interpretation of evidence and would risk turning candidate search decisions into claims about validated scientific experiments. That violates the Genesis honesty contract and the single-source-of-truth rule.

## What remains allowed

Campaign may continue to use its own existing backend evidence, WHY, graph and verification screens. Science Chat may open the existing CampaignScreen as read-only navigation. A future interoperability milestone may define a versioned `CampaignEvidenceProjection` only after its schema, authorization, replay semantics, loss policy and compatibility tests are reviewed.

Until then, the correct statuses are `PARTIAL` and `BLOCKED`, not `FULLY_CONNECTED`.

## Next safe milestone

Do not implement the exporter in this sprint. First create a contract-only design and fixture set for one deterministic Campaign reference case, with explicit loss reporting. Only a fixture-backed, versioned projection can move this item from `BLOCKED` to `MANUAL_REVIEW`.
