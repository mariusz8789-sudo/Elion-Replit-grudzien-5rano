# Astra — ResearchRun Evidence and 30-day roadmap

Status: specification package for Claude review. No runtime or UI code is changed by this branch.

## Decision

Genesis should **consolidate existing evidence contracts through a thin export envelope**. It should not create another Evidence system. The envelope references authoritative intake, campaign, authorization, Fabric, ledger and artifact records; it does not replace them.

The package contains:

1. [Evidence contract decision](./EVIDENCE_CONTRACT_DECISION.md)
2. [Canonical ResearchRun Evidence Pack specification](./RESEARCHRUN_EVIDENCE_PACK_SPEC.md)
3. [Customer research workflow](./CUSTOMER_RESEARCH_WORKFLOW.md)
4. [Commercial license gate](./COMMERCIAL_LICENSE_GATE.md)
5. [Kosmos gap analysis and 30-day Definition of Done](./KOSMOS_GAP_AND_30_DAY_DOD.md)

## Ownership boundary

- Astra owns only these documents.
- Claude remains integration coordinator.
- Existing `ScientificEvidencePack`, `EvidenceLedger`, `evidenceContainer`, Fabric, Campaign, workers and report generators remain owned by their current maintainers.
- Any implementation must be proposed in a separate PR after Claude assigns file ownership.

## Evidence examined

The specification is based on the checkout at `022ad816`, especially:

- `packages/frontend/src/core/experimentFabric/evidencePack.ts`
- `packages/frontend/src/core/experimentFabric/evidencePackRoCrate.ts`
- `packages/frontend/src/core/experimentFabric/evidencePackStore.ts`
- `packages/core/src/evidence/evidenceContainer.ts`
- `packages/core/src/knowledge/EvidenceLedger.ts`
- `docs/GENESIS_EVIDENCE_PACK_INTEROPERABILITY.md`

The current implementation already has valuable pieces, but they are separate projections with different persistence and integrity properties. The goal is one canonical ResearchRun envelope with adapters, not replacement subsystems.
