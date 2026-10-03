# Astra product evidence and commercial track

This documentation defines an export/customer projection around the existing Genesis ResearchRun. It creates no research runtime, lifecycle store, Evidence Ledger, Replay engine or competing Sol contract.

Current audit: main `5d064c4e`, PR #54 `fc29ef60`, PR #56 `0a372cdd`, checked on GitHub 2026-10-01. Open-PR implementation is distinct from deployment. The review response records exactly what changed after Claude's blocking review.

1. [Evidence contract decision](./EVIDENCE_CONTRACT_DECISION.md)
2. [Canonical ResearchRun Evidence Pack](./RESEARCHRUN_EVIDENCE_PACK_SPEC.md)
3. [Customer workflow](./CUSTOMER_RESEARCH_WORKFLOW.md)
4. [Commercial licence gate](./COMMERCIAL_LICENSE_GATE.md)
5. [Capability gaps and approved 30-day sequence](./KOSMOS_GAP_AND_30_DAY_DOD.md)
6. [Genesis Advantage Track](./GENESIS_ADVANTAGE_PLAN.md)
7. [Reference-only JSON Schema](./schema.json) and [synthetic example](./example.json)
8. [Review response and validation](./REVIEW_RESPONSE.md)

The schema and example are documentation artifacts, not a new persistence model or working serializer. They index existing records and explicitly distinguish synthetic examples from resolved exports. Source verification, licence decisions, human publication, runtime integration and delivery controls stay with their current owners. No merge or deployment is implied.
