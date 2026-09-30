# Customer ResearchRun workflow

This workflow is a customer-facing projection of the existing ResearchRun chain and approvals. It is not a new state store.

| Stage | Input | Genesis component | Artifact / projected status | Blocker | Who may approve transition |
|---|---|---|---|---|---|
| Question | customer question, intended use, project | `researchRun.mjs` | `PROBLEM_FORMALIZED`; `INTAKE` | missing scope/project rights | authorized customer user |
| Feasibility | question and available capabilities | capability/toolchain resolver; ResearchRun plan | capability decision; `FEASIBILITY_CHECK` **PLANNED projection** | no executable adapter/runtime | Genesis product owner; scientific reviewer for scope |
| Data/licence check | exact sources, data, models, APIs, assets | commercial licence gate | immutable decision refs; `LICENCE_CHECK` **PLANNED projection** | `UNKNOWN` or `BLOCKED` item | designated licence owner; nobody may override missing rights |
| Plan | allowed sources/tools and constraints | `proposeResearchPlan` | `HYPOTHESES_GENERATED`; `PLAN_PROPOSED` | malformed proposal or unsupported engine | customer approves scope; scientific reviewer approves protocol intent |
| Preregistration | one selected proposed experiment | `preregisterExperiment` / `experiment_records` | `PREDICTIONS_FROZEN`; `PLAN_APPROVED` | mutable criteria or missing acceptance rule | authorized protocol approver |
| Computation | frozen protocol and input | `researchRunExecution.mjs`, canonical worker/toolchain | `EXPERIMENT_HANDOFF`; execution record | runtime unavailable, timeout, invalid input | system gate only after approval; no model self-approval |
| Analysis | raw output | deterministic adapter and bounded analysis | output hashes and observations; `ANALYSIS` **PLANNED projection** | incomplete/corrupt output | scientific reviewer for interpretation |
| Falsification | frozen predictions plus observations | `deriveVerdict` | `SELF_FALSIFICATION` | protocol mismatch | deterministic contract; reviewer may annotate, not rewrite |
| Evidence | scoped verdict and artifacts | existing evidence proposal/ledger contracts | `EVIDENCE_UPDATE`; proposed evidence | integrity/licence/approval failure | existing human evidence approver |
| Replay | pinned execution and artifacts | existing Replay | replay result; `REPLAYED` **PLANNED projection** | hash/environment drift | verification policy; exceptions remain visible |
| Report | verified references | existing report/RO-Crate exporters | JSON/PDF/RO-Crate; `READY_FOR_DELIVERY` **PLANNED projection** | incomplete pack or `UNKNOWN` rights | customer delivery owner plus required scientific approval |
| Next experiment | unresolved claim/gap | ResearchRun | `NEXT_EXPERIMENT` | no admissible experiment | customer approves spend/scope; wet-lab partner approves laboratory work |

Cancellation stops future work but never deletes the verified history. A wet-lab handoff is a bounded dossier, not proof that a physical experiment occurred.

## Drug Discovery customer outcome

The honest terminal outcomes are:

- candidate set supported within the frozen computational protocol;
- `NO_WINNER` when no candidate clears preregistered gates;
- `BLOCKED` when runtime, rights, data or approvals are missing;
- laboratory handoff only after the dossier is complete and a real partner accepts it.

The current ResearchRun execution path proves RDKit descriptor evaluation. Vina, ADMET and OpenMM remain separate capabilities until explicit ResearchRun adapters, reference-case proof and licence gates exist.
