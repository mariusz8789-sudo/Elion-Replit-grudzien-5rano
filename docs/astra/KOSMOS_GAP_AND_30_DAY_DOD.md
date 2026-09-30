# Edison Kosmos gap analysis and 30-day Definition of Done

This is a functional comparison, not a parity or compatibility claim. “Research world model” means persistent structured research state, not a rendered world.

## Functional matrix

| Capability | Genesis status | Repository evidence | Remaining gap |
|---|---|---|---|
| Experiment planning | `GENESIS HAS` | `packages/backend/src/researchRun.mjs` | model proposals still require capability and human gates |
| Persistent research state | `GENESIS HAS` | `packages/backend/src/agentRun.mjs`, `researchRun.mjs` | customer projection and operational hardening |
| Preregistration / anti-HARKing | `GENESIS HAS` in PR #54 | `experimentMemory.mjs`, `researchRunExecution.mjs` | merge/review and broader adapters |
| Falsification | `GENESIS HAS` in PR #54 | `researchRunExecution.mjs` | validate beyond RDKit and keep verdict scope narrow |
| Claim → source/evidence binding | `PARTIAL` | `claimProposal.mjs`, `knowledgeRegistry.mjs`, evidence references in `researchRun.mjs` | literature-level binding and export completeness |
| Reproducibility / Replay | `PARTIAL` | existing Replay/Evidence/RO-Crate modules; `research-run-execution@1` | end-to-end positive replay acceptance and environment capture |
| Scientific tools | `PARTIAL` | `campaign/toolchain.mjs`; `researchRunEngines.mjs` | ResearchRun executes RDKit only today |
| Sandboxed code execution | `PARTIAL` | worker architecture and bounded engine adapters | hardened untrusted-code sandbox, quotas and egress policy |
| Autonomous literature research | `MISSING` | proposal prompt consumes existing refs only | allowlisted discovery, retrieval, licence gate, quality/ranking |
| Data analysis | `PARTIAL` | engine adapters and campaign analyses | general tabular/statistical analysis contracts |
| Long-running autonomy | `PARTIAL` | persisted ResearchRun and campaigns | scheduler, checkpoint/resume, budgets, failure recovery |
| Research world model | `PARTIAL` | ResearchRun chain + knowledge registry + Scientific Memory | unified typed graph and cross-run synthesis |
| Enterprise/customer workflow | `PARTIAL` | projects, authorization, reports and this projection | durable approval UX, tenant policy, delivery controls |
| Wet-lab execution | `EXTERNAL DEPENDENCY` | handoff concepts only | accredited partner, assay capacity, samples, contracts and data |

## Approved 30-day sequence and Astra track

| Week | Core roadmap owned by Claude/Sol | Parallel Astra deliverable |
|---|---|---|
| W1 | ResearchRun orchestrator | approve canonical mapping; document customer projection and integrity states |
| W2 | literature layer | source/licence record contract; Europe PMC and selected dataset gates; claim-to-source acceptance |
| W3 | capability resolver | product eligibility view: executable adapter + runtime proof + licence status; no capability inflation |
| W4 | GLP-1R flagship | customer dossier, Evidence export checklist, report language, `NO_WINNER`/handoff gate |

This track does not resequence the approved roadmap and does not assume a named medicinal-chemistry reviewer is already available. Reviewer and wet-lab partner are external dependencies.

## Primary Definition of Done — Drug Discovery

1. One bounded customer question has one stable ResearchRun ID.
2. The plan and hypotheses remain proposals until approved.
3. Every selected experiment is supported by the capability resolver.
4. Predictions, protocol and criteria are preregistered before execution.
5. The actual execution record includes pinned engine, environment, inputs and hashes.
6. Raw outputs, errors and hashes are retained without invented fallback results.
7. A deterministic, protocol-scoped falsification verdict is recorded.
8. Evidence is proposed and approved through existing contracts.
9. Positive Replay passes; drift or failure remains visible.
10. JSON/RO-Crate report links every material claim to evidence and licence decisions.
11. Terminal result is an honest candidate dossier, `NO_WINNER` or `BLOCKED`.
12. Wet-lab handoff occurs only if a partner accepts the dossier; it does not claim laboratory validation.

The first acceptable implementation may be RDKit-bounded. Vina, ADMET or OpenMM enter the DoD only after real ResearchRun adapters, runtime reference cases and licence clearance. A full computational screening claim cannot be made from RDKit descriptors alone.

## Secondary Definition of Done — quantum chemistry

Only after the primary path passes: one PySCF experiment uses the same ResearchRun lifecycle and Evidence envelope, with a distinct protocol, executable adapter, reference-case proof and Replay. It proves domain generality without changing the evidence schema.

## Cannot be closed by code alone

- rights to unknown/private datasets, model weights and commercial APIs;
- independent scientific validation and medicinal-chemistry review;
- wet-lab capacity, biosafety, samples and assay quality;
- organizational signing key/governance required for `VALID_TRUSTED`;
- evidence that a model generalises beyond its validated domain.

## Executive comparison

| GENESIS DZISIAJ | ZA 30 DNI | KOSMOS | POZOSTAŁA LUKA |
|---|---|---|---|
| Persistent ResearchRun, proposed plans, hash-chained state; R1-b adds preregistration, RDKit execution and scoped falsification | One auditable GLP-1R-oriented customer vertical with honest Evidence/Replay/report and `NO_WINNER`; optional PySCF only after primary | Broader autonomous literature/data research and long-running research synthesis | Literature scale, more executable adapters, hardened sandbox, commercial rights, independent reviewer and wet-lab partner |
