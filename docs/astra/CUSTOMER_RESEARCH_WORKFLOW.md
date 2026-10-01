# Customer ResearchRun workflow

Every customer label is a read-only projection of existing ResearchRun records and existing human approvals. Labels are never persisted as a second lifecycle, and cannot authorize execution, publish Evidence or change a verdict. Main `5d064c4e`, PR #54 `fc29ef60` and PR #56 `0a372cdd` were checked on 2026-10-01.

| Customer view | Existing authority | Honest projection and gap |
|---|---|---|
| Question | agent_runs + PROBLEM_FORMALIZED | INTAKE may be derived from the existing question; no separate request identity |
| Feasibility | Canonical toolchain + proposal decision; Sol ResourceProfile when integrated | FEASIBILITY_CHECK is PLANNED customer UX; installed engine, reference case, licence and executable adapter are separate |
| Sources and rights | Existing source/evidence references; Sol literature/custody ports | LICENCE_CHECK is PLANNED customer gate. UNKNOWN/BLOCKED fail commercial delivery; no human may manufacture missing rights |
| Proposed plan | HYPOTHESES_GENERATED via ENTITY-3 validation and ENTITY-2 claims | PLAN_PROPOSED only; hypotheses remain PROPOSED / NOT_EVIDENCE |
| Frozen protocol | PREDICTIONS_FROZEN plus experiment_records PREREGISTRATION | Show FROZEN. **Do not label PLAN_APPROVED:** automatic preregistration is not an authenticated human approval. Dedicated protocol-approval UX/record is PLANNED |
| Computation | EXPERIMENT_HANDOFF, research-run-execution@1, scienceRunId | Show actual engine/version/environment/input/output references; failed runtime has BLOCKED and no fabricated output |
| Analysis and falsification | SELF_FALSIFICATION plus sealed SESSION | Show SUPPORTED_WITHIN_PROTOCOL / FALSIFIED_WITHIN_PROTOCOL / INCONCLUSIVE and frozen criteria; reviewer may annotate but not overwrite |
| Evidence | EVIDENCE_UPDATE points to pending knowledge proposal | PROPOSED until a person publishes through existing knowledge proposal API. Resolve current publication separately; event itself is not approval |
| Replay | Existing science_run_verifications; NEXT_EXPERIMENT first summary | Show actual MATCH/DRIFT/version-change/runtime-block/unsupported outcome. NOT_APPLICABLE means no output to replay, not success |
| Report | Existing report/RO-Crate projections; proposed envelope index | READY_FOR_DELIVERY and DELIVERED are PLANNED until completeness, source rights, approvals and retained artifacts are actually checked; no source event currently proves delivery |
| Next experiment | NEXT_EXPERIMENT fixed-rule proposal | Proposed continuation or HUMAN_REVIEW. Customer spend/scope approval and wet-lab acceptance are separate, PLANNED where not implemented |

PR #54 also connects Science Chat `/badanie`, `/eksperyment` and `/powtórz` to the same ResearchRun. It uses canonical ScienceRun Replay; it does not implement autonomous literature, a complete customer export or GLP-1R science. Its ResearchRun executor registry remains RDKit-only. PR #56 has additional bounded engine ports and source/decision/infrastructure contracts; Claude integrates them rather than Astra duplicating them.

The approved month remains W1 orchestrator, W2 literature, W3 capability resolver, W4 GLP-1R. Astra owns this projection, licence evidence and report/proof acceptance; Claude owns ResearchRun; Sol owns the reviewed ports. Named scientific reviewer, commercial owner and wet-lab partner are external dependencies until actually assigned.

Customer outcomes are an appropriately scoped computational dossier, NO_WINNER or BLOCKED. A physical laboratory handoff needs a real partner's acceptance; it is not laboratory confirmation. Cancellation should stop future work and retain history, but durable cancellation/recovery across replicas is not delivered by these documents or Sol's queue-port definition.
