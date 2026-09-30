# ADR — canonical Evidence Pack strategy

Status: **proposed for Claude acceptance**

Decision owner: Claude / Genesis integration

Author: Astra

Date: 2026-09-30

## Question

Should “Evidence Pack v2” be an extension of the existing pack, a consolidation of existing contracts, or a new contract?

## Decision

Use **consolidation through a thin `ResearchRunEnvelope`**, with backward-compatible extensions only where an existing contract already owns the data.

- `ResearchRunEnvelope` is a read-only export projection that references existing project, campaign, authorization, Fabric, ledger and artifact records. It is not another ledger or runtime store.
- `ScientificEvidencePack` remains the canonical scientific projection of completed Fabric runs. It can be absent before execution or when a run is rejected before Fabric.
- `EvidenceLedger` remains the append-only scientific evidence/publication history. It anchors IDs or hashes of authenticated approvals but does not replace the backend authorization audit.
- `evidenceContainer` is a reuse pattern for state reconstruction and a minimal SHA-256 bundle. It requires extension and hardening before it can carry arbitrary ResearchRun artifacts.
- RO-Crate/PROV-DM remains an export projection.
- Discovery reports, certificates and customer PDFs remain presentation projections.
- Campaign records may enter the pack only through a lossless, explicitly accepted mapping. The current fixture-only/manual-review bridge is not sufficient.

Do not call the first implementation `v2` automatically. Preserve `ScientificEvidencePack` v1 and its IDs. Version the thin envelope independently; ship additive changes to existing contracts under compatible minor versions. Introduce `ScientificEvidencePack` `2.0.0` only if implementation requires a breaking change to identifiers, required semantics or verification.

## Why

Genesis already has at least four useful evidence representations. Replacing them would create migration risk and two sources of truth. Keeping them unrelated would preserve ambiguity: one format carries scientific runs, another carries files and SHA-256 verification, and another carries provenance export.

The consolidation establishes one envelope and assigns every current component one role:

| Concern | Canonical owner | Rule |
|---|---|---|
| Research lifecycle/export index | `ResearchRunEnvelope` | References records; does not duplicate their content as a new system of record |
| Completed experiment and protocol | `ScientificEvidencePack` | No invented or post-hoc run |
| Scientific evidence/publication history | `EvidenceLedger` | Preserve its current semantics and reference entry IDs/chain root |
| Authenticated approvals | backend governance/auth audit | Named identity, role, separation of duties and approved-object hash |
| Binary/file delivery and verification | hardened artifact bundle derived from `evidenceContainer` patterns | SHA-256 for every declared and included byte; reject undeclared files |
| Interoperability | RO-Crate/PROV-DM adapter | Projection only; never computes results |
| Customer narrative | report adapter | Every material claim resolves to evidence |
| Long-term storage | backend project/campaign persistence | Browser local storage is a cache only |

## Compatibility rules

1. Existing v1 `evidencePackId`, `evidenceChainId`, run IDs and run fingerprints remain stable; a v1 pack is referenced, not regenerated under a new version.
2. Existing serialized packs remain readable.
3. New fields are optional until a migration gate promotes them to required.
4. Missing information is represented as `UNKNOWN`, `NOT_CAPTURED` or `NOT_APPLICABLE`; it is never synthesized.
5. FNV-derived legacy identifiers may remain as compatibility IDs, but portable artifact integrity uses SHA-256.
6. A report or RO-Crate identifies the canonical ResearchRun and source pack IDs. A redacted view records `canonicalPackId`, `parentManifestDigest` and its own `viewManifestDigest`.
7. `MATCH`, `DRIFT`, `BLOCKED` and `NOT_EXECUTED` remain distinct replay outcomes.

## Conditions that justify `2.0.0`

Use a major version only if one or more applies:

- required semantics of an existing field change;
- IDs can no longer remain stable;
- verification rejects valid v1 packs without an adapter;
- run provenance is replaced rather than extended;
- a new trust/signature model makes the old verification result ambiguous.

## Rejected options

### A second “autonomous scientist Evidence Pack”

Rejected because it would duplicate Fabric evidence and EvidenceLedger.

### RO-Crate as the internal source of truth

Rejected because RO-Crate is an interoperability projection and does not own execution state, approvals or project persistence.

### Keep all current formats independent

Rejected because a customer could receive mutually incomplete claims, artifacts and provenance.

## Implementation gate

No runtime implementation begins until Claude approves:

- the canonical owner table and field-to-source mapping above;
- the Drug Discovery pilot ResearchRun;
- required human approval points;
- deployment model and license red lines;
- file ownership for the implementation PR.
