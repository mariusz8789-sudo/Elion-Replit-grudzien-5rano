# GENESIS_AUTONOMOUS_DISCOVERY_ENGINE_MASTER_SPEC.md — FINAL

> **C1 EDITORIAL NOTE (2026-09-12).** Ten plik to pakiet projektowy Qwena, zapisany
> DOSŁOWNIE, bez zmiany treści. Qwen nie ma dostępu do repo i sam to deklaruje w §0.
> Realna klasyfikacja REUSE / EXTEND / NEW / BLOCKED każdego elementu tej specyfikacji,
> z cytatami `plik:symbol` z tego repo, jest w
> **`docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md`** — i to tamten dokument,
> nie ten, jest podstawą do implementacji. Skrót: znacząca część pozycji oznaczonych tu
> jako `NEW` w §24 jest w rzeczywistości REUSE albo EXTEND (istnieje m.in. wielorundowa
> autonomiczna pętla odkrycia, historia rewizji przekonań, prymityw rozróżnialności
> hipotez i kontrakt domenowy dla laboratoriów). NIE implementuj wprost z tego pliku.

**STATUS: DESIGN / MASTER SPEC / NOT IMPLEMENTED / NOT VERIFIED AGAINST REPO.**
Qwen has **no repo access**, writes **no code**, and **does not claim** any module exists. Items drawn from the orchestrator-declared foundation are tagged **EXISTING FOUNDATION TO VERIFY**; everything else is **NEW/EXTEND** design. Nothing is RUN, VERIFIED, or GREEN.

---

## 0. PROVENANCE & VERIFICATION STANCE
- Foundations listed in §24 are **EXISTING FOUNDATION TO VERIFY** (orchestrator-declared; C1 must confirm in repo).
- All schemas/contracts below are **design**; C1 maps each to REUSE / EXTEND / NEW / BLOCKED after repo audit.
- No medical prescription, no individual treatment, no policy decree anywhere; **POLICY MAY LIMIT ACTION, NEVER TRUTH**.

## 1. AUTONOMOUS DISCOVERY CORE (domain-agnostic orchestrator)
State machine over the loop: `INTAKE → DECOMPOSE → GEN_HYPOTHESES → GEN_CANDIDATES → PREDICT → PLAN → EXECUTE → OBSERVE → EVIDENCE → SELF_FALSIFY → REVISE → DERIVE_NEW → (LOOP | STOP) → MEMORY → DISCOVERY_STATE`.
- Core holds **no domain logic**; domains enter via Laboratory plugins (§14).
- Core holds **no scientific content**; all content lives in typed records (§20).
- Every transition writes an append-only, fingerprinted event (reuses existing fingerprint/provenance/replay foundations).

## 2. HYPOTHESIS GENERATOR
Generation modes (each a declared operator, not free text): `COMPETE` (alternatives to a given hypothesis), `VARIANT` (parameter/structure perturbations), `ABDUCT` ("what must be true to explain observation O?"), `RESIDUAL` (explain anomaly/leftover), `CONFLICT` (reconcile/choose between conflicting evidence), `DERIVE` (next-generation from a result).
**Hypothesis schema:** `{id, statement, mechanism, modelRef, prediction[], falsificationCriterion, requiredEvidence[], assumptions[], confidence, provenance{source,parentHypothesisId,derivationOp}, lineage[], epistemicClass, status, fingerprint}`.
**Invariants:** `falsificationCriterion` non-empty; `prediction` epistemically sealed as PREDICTION (never auto-FACT); `fingerprint = fnv1a(canonicalJson(statement,mechanism,prediction,falsificationCriterion,assumptions))`.

## 3. CANDIDATE / MECHANISM GENERATOR
Type-agnostic: `{id, type∈{model,mechanism,parameter,solution,substance,strategy,scenario}, domainId, payload, generationOp, parentHypothesisId, constraints[], provenance, fingerprint}`.
Sources may be multi-model + search + tools + simulation + external data (not a single AI). Grounding rule: every candidate must cite an external anchor or a declared simulation; ungrounded candidates are labelled and down-weighted.

## 4. PREDICTION ENGINE
Strict separation enforced at record level: FACT / OBSERVATION / MODEL / PREDICTION / INFERENCE / HYPOTHESIS / UNKNOWN / CONFLICTING_EVIDENCE.
**Prediction schema:** `{id, hypothesisId, observable, expectedValueOrRange, direction, uncertainty, epistemicClass=PREDICTION, preregisteredAt, sealed, fingerprint}`.
**Hard rule:** promotion PREDICTION→OBSERVATION/FACT only via an Observation record from a Laboratory run; never automatic.

## 5. AUTONOMOUS EXPERIMENT PLANNER (formal scoring)
`priority(E) = α·EIG + β·Sep + γ·Fals + δ·Avail − ε·Cost − ζ·Time − η·Risk − θ·Redund`
- `EIG` = expected posterior-entropy reduction over the current hypothesis set.
- `Sep` = min pairwise distinguishability (d′) across competing hypotheses the experiment separates.
- `Fals` = P(experiment yields a falsifying outcome for ≥1 hypothesis).
- `Avail` = data/access feasibility; `Cost/Time/Risk` normalized; `Redund` = similarity to already-run experiments (fingerprint/Jaccard).
**Hard gates:** `Fals < τ_f → drop`; `Redund > τ_r ∧ no new info → drop`. Ranking = descending priority; planner emits chosen + runner-up + decision basis.

## 6. SELF-FALSIFICATION / ADVERSARIAL SCIENCE
After each result, mandatory checks: seek counterevidence; generate a discriminating experiment; test alternative explanations; detect confirmation bias; detect HARKing (prediction sealed after data access); detect tautological tests (T1–T8 gate); detect circular evidence (shared formalism/dataset/model/solver/derived-observable); detect model-dependent data. Each check emits a labelled finding that feeds Revision.

## 7. BELIEF REVISION
Ops: `support | weaken | falsify | unresolved | conflicting`.
**Revision schema:** `{id, hypothesisId, priorConfidence, posteriorConfidence, op, evidenceIds[], rationale, round, fingerprint}`; **append-only history** (no in-place overwrite). Reuses existing belief-revision + evidence-ceiling as foundation; extension = history + conflict op.

## 8. NEW-HYPOTHESIS GENERATION FROM RESULTS
Operators (must not be a fixed "next question" list): `REFINE` (narrowed hypothesis), `ALTERNATIVE`, `ANOMALY_MECHANISM`, `RESIDUAL_HYPOTHESIS`, `CONFLICT_HYPOTHESIS`, `NEXT_QUESTION`. Each output is a full Hypothesis record with `derivationOp` and parent lineage, so "why does this hypothesis exist?" is answerable.

## 9. LONG-HORIZON CAMPAIGN
`Round n = {hypotheses, candidates, predictions, chosenExperiment, execution, evidence, revision, derivedHypotheses}` chained; campaign persists across rounds and sessions; terminates only via §10.

## 10. STOPPING RULES (formal)
Stop when any: `DISCOVERY` (preregistered discovery criterion met + replicated); `FALSIFICATION` (all live hypotheses falsified); `CONVERGENCE` (posterior spread < τ); `NO_INFORMATION_GAIN` (max EIG < τ_eig for k rounds); `EXHAUSTED_SPACE` (no admissible new hypothesis); `RESOURCE_LIMIT`; `CONFIDENCE_THRESHOLD`; `EVIDENCE_THRESHOLD`; `UNRESOLVED_CONFLICT` (escalate, don't average); `SAFETY_BOUNDARY`.

## 11. CAMPAIGN DEDUPLICATION
Dedup key = `fnv1a(canonicalJson(hypothesisFingerprint, experimentDesign, datasetVersion, configFingerprint))`. Rerun allowed only with declared new justification (new data version, new instrument, new confounder control); otherwise planner must reject via `Redund` gate.

## 12. SCIENTIFIC MEMORY
Record types: hypotheses, experiments, evidence, failed paths, falsifications, discoveries, models, candidate-lineage, experiment-lineage, conflicts, unresolved questions, campaign state. All fingerprinted, append-only, retrievable by lineage and by dedup key.

## 13. DISCOVERY STATE (canonical)
`{campaignId, rankedHypotheses[{id,confidence,rank}], bestHypothesisId, whyBest{evidenceIds, revisionChain}, openConflicts[], unresolved[], stoppedReason|null, fingerprint}`. Must support the query "why is X currently best?" by replaying `revisionChain` + `evidenceIds`.

## 14. LABORATORY / PLUGIN CONTRACT
`{labId, kind∈{simulation,dataset,api,chem,phys,bio,astro,gov,spatial,external}, capabilities[], problemIntake(), hypothesisSeed(space), candidateSource(), observableSpec(), run(config,seed)→LaboratoryResult, safetyBoundary}`.
**LaboratoryResult:** `{observation, evidence[], provenance, fingerprint, replay{inputs,codeHash,seed,envHash}, uncertainty, epistemicClassification, status}`.

## 15. DRUG DISCOVERY EXTENSION (research infra, NOT prescribing)
Pipeline: disease→target hypothesis→candidate generation→mechanism→activity→selectivity→ADME/Tox→evidence→ranking→next experiment. Reuses ChEMBL/PubChem/quantum-chem + optional RDKit/OpenMM/PySCF hooks **[VERIFY]**. Safety boundary: population-level verdicts only; no prescription/dose/individual advice; substitution decision stays with clinician/regulator.

## 16. GOVERNMENT SCIENCE EXTENSION
Unrestricted research plane (truth): conflicting evidence, worst-credible-case, adversarial analysis, causal research, policy simulation, scenario generation. Controlled action plane: authorizations/roles/audit. **Invariant: policy configures ACTION (data access, tools, automation, classification) but can never alter TRUTH outputs; inconvenient results reported identically.**

## 17. SPATIAL / WORLD ENGINE (one engine, many worlds)
Single engine + World plugins: `{worldId∈{mars,earth,cityTwin,climate,transport,water,energy,population,risk,…}, geometry/grid, timeModel, observableSpec, datasetAdapters[]}`. Reuses existing solar/earth/relativity/geodesic foundations as world plugins **TO VERIFY**; no per-planet engine.

## 18. CROSS-DOMAIN DISCOVERY
Mechanism-pattern library (shared ODE forms, conservation laws, network motifs, scaling laws). Analogy detection = structural-signature match; every transfer emitted as `TRANSFERRED_HYPOTHESIS` with explicit assumptions + testable consequence in the target domain (never as FACT).

## 19. DISCOVERY GRAPH
Nodes: Question, Hypothesis, Model, Prediction, Experiment, Observation, Evidence, Revision, NewHypothesis, Candidate, Campaign, DiscoveryState. Edges: derives, predicts, tests, observes, supports/falsifies, revises, refines. Every node/edge carries id + fingerprint + provenance; graph is replayable from stored records.

## 20. FORMAL DATA CONTRACTS
(See schemas in §2,§3,§4,§7,§13,§14.) Universal rules: **fingerprint** = fnv1a(canonicalJson(declared fields)); **provenance** = source + version + checksum + access timestamp + derivation lineage; **replay** = frozen inputs + code hash + seed + env hash → bit-identical outputs else DRIFT; **invariants** enforced at record creation.

## 21. IMPLEMENTATION PHASING
- **P0:** DiscoveryCore orchestrator; HypothesisGenerator (bounded ops); ExperimentPlanner scoring; StoppingRules; dedup; truth-schema enforcement; autonomous-run provenance wiring.
- **P1:** first real autonomous discovery (demonstrator §22) end-to-end.
- **P2:** reusable engine (Laboratory interface generalized; open-ended generation).
- **P3:** Drug Discovery. **P4:** Government Science. **P5:** Spatial/World. **P6:** cross-domain autonomous discovery.

## 22. FIRST REAL AUTONOMOUS DEMONSTRATOR (minimal, real)
Bounded research space on the **pinned Brydges QE4 dataset** (public, checksummed, deterministic):
- Round 1: generator emits 2–4 competing regime hypotheses (linear-t volume-law / log-t sub-extensive / saturating) via `COMPETE`+`VARIANT` over a declared template space; planner scores and picks; execute recompute-S2 from `MeasuredStates` at preregistered partitions/times; evidence + tautology classify; falsify rejected regimes; revise.
- Derive: `RESIDUAL_HYPOTHESIS` (e.g., crossover time t*) from residual.
- Round 2: planner picks finer time-grid / alternate-partition experiment; execute; revise; stopping rule fires (convergence or no-info-gain); replay MATCH; memory + DiscoveryState written.
Real data, real computation, autonomous selection/refinement within a declared space (open-ended novelty = P2+).

## 23. DEFINITION OF DONE
"ENGINE IS WORKING" only when, runtime-verified: accepts a new problem; generates ≥2 competing hypotheses **not drawn from a fixed list** (parameterized/refined/derived); proposes candidates; designs experiment; planner selects by scoring; executes for real; evaluates evidence; attempts self-falsification; revises belief; derives a new hypothesis from the result; planner (not a script) chooses the second experiment; sustains a campaign; stops only by §10; writes full scientific history; reproduces via replay. **UI, mocks, hardcoded workflows, predefined hypothesis lists, and scripted sequences do NOT qualify.**

## 24. ANTI-DUPLICATION / EXISTING FOUNDATION TO VERIFY (REUSE/EXTEND/NEW)
| Foundation | Tag | Use / required extension |
|---|---|---|
| Evidence, Provenance, Fingerprinting, Replay | REUSE | wire into autonomous steps |
| Falsification, Tautology Gate | REUSE | add adversarial self-falsification step |
| Belief Revision (+ceiling) | REUSE/EXTEND | add history + conflict op |
| Competing Hypotheses | REUSE/EXTEND | feed generator |
| Next Question, Research Campaigns, Scientific Memory | EXTEND | planner scoring, dedup, cross-campaign retrieval |
| inquiryLoop, externalAnchor, externalDatasetCase.ts | REUSE | as Laboratory/anchor precedents |
| ChEMBL/PubChem/Kepler/CMS + domain foundations | REUSE | as Laboratory plugins |
| DiscoveryCore, HypothesisGenerator, CandidateGenerator, Planner-scoring, StoppingRules, Laboratory-iface, causal-inference, Policy Control Plane | NEW | minimal reusable abstractions |

## 25. FINAL MASTER ARCHITECTURE
**A. Diagram (text):** Laboratories → DiscoveryCore{Generator→Predictor→Planner→Executor→Evidence→SelfFalsify→Revise→Derive} → Memory/DiscoveryState; Policy Control Plane wraps ACTION only.
**B. Core modules:** orchestrator, generators, predictor, planner, revision, dedup, stopping, memory, discovery-state, truth-schema.
**C. Interfaces:** §2,3,4,7,13,14 contracts.
**D. State machines:** §1 core loop; §9 campaign; §10 stopping.
**E. Data flow:** problem→hypotheses→predictions→experiment→observation→evidence→revision→new hypothesis→memory.
**F. Discovery loop / G. Campaign loop / H. Falsification loop:** §1,§9,§6.
**I. Memory model:** §12. **J. Plugin model:** §14,§17.
**K. Drug / L. Government / M. Spatial / N. Cross-domain:** §15–§18.
**O. Roadmap:** §21. **P. Demonstrator:** §22. **Q. Definition of Done:** §23.

---
**Self-audit:** foundations = ORCHESTRATOR-DECLARED / TO VERIFY; optional chem-Python adapters = `[VERIFY]`; all modules = design only; **NOT IMPLEMENTED, NOT VERIFIED AGAINST REPO, NOT RUN.** C1 receives this MASTER SPEC + its own repo audit and decides REUSE / EXTEND / NEW / BLOCKED per component before implementing.
