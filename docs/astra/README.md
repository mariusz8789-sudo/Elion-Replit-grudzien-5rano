# Astra — product, evidence and commercial track

This documentation defines a product projection around the existing Genesis ResearchRun. It does not create another research runtime, lifecycle store, Evidence Ledger or Replay system.

## Decision

`Evidence Pack v2` is a working name for **consolidation and export**, not permission to build a second evidence system. The stable identity is `agent_runs.id` in domain `genesis.research-run`; its verified lifecycle is the hash-chained sequence in `agent_run_steps`.

Documents:

1. [Evidence contract decision](./EVIDENCE_CONTRACT_DECISION.md)
2. [Canonical ResearchRun Evidence Pack](./RESEARCHRUN_EVIDENCE_PACK_SPEC.md)
3. [Customer workflow](./CUSTOMER_RESEARCH_WORKFLOW.md)
4. [Commercial licence gate](./COMMERCIAL_LICENSE_GATE.md)
5. [Kosmos gap and 30-day Definition of Done](./KOSMOS_GAP_AND_30_DAY_DOD.md)

This PR is documentation only. Schema and example fixtures belong in an implementation PR after owners approve the mapping. No merge or deployment is implied.
