# Discovery Engine Audit vs. Qwen's Master Spec (2026-09-12)

**Method.** Qwen submitted `docs/GENESIS_AUTONOMOUS_DISCOVERY_ENGINE_MASTER_SPEC.md` with its own foundation-capability list explicitly labeled `ORCHESTRATOR-DECLARED, not independently repo-verified` (Qwen has no repo access). This document is the real, repo-verified audit against that spec, produced by reading the actual files at commit `03be47c` on `claude/genesis-autonomous-completion-95bt4e`. AUDIT ONLY — no code was written to produce this.

**Headline finding.** Qwen's spec significantly *understated* what already exists. In particular, `packages/backend/src/campaign/*` is a full, real, already-autonomous, already-demoed multi-generation drug-discovery campaign engine (orchestrator, adaptive stopping rules, Pareto ranking, within-run dedup, multi-fidelity funnel, replay verification, explainability) that the spec's "MISSING" list treats as absent. The one area the spec assessed correctly as genuinely missing is causal inference (DiD/ITS/synthetic control) for policy/government discovery — already scoped in `docs/prompts/C1-B1-ulez-no2-adjudication.md`.

---

## A. CO JUŻ MAMY (what already exists)

| Capability | REUSE/EXTEND file(s) | Real public API (one line) |
|---|---|---|
| Multi-round autonomous parameter inquiry | `core/agent/inquiryLoop.ts` — `runAutonomousInquiry`, `selectNextProbe` | Chains measure→judge→revise-belief→pick-next-probe for `maxRounds`, entirely unattended, choosing the probe that discriminates surviving hypotheses (`checkDiscriminability`) |
| Multi-cycle campaign chaining (frontend) | `core/experimentFabric/researchCampaign.ts` — `runResearchCampaign`, `continueResearchCampaign` | Loops up to `maxCycles`, each cycle starting only from the previous cycle's real `nextExperiment.request`; stops on `NO_JUSTIFIED_NEXT_QUESTION`/`MAX_CYCLES_REACHED` |
| Full autonomous multi-generation drug-candidate campaign (backend) | `packages/backend/src/campaign/orchestrator.mjs::runCampaign` | generate→validate(RDKit)→execute→Pareto-rank→adapt-strategy→stop, zero human input per round; demoed via `npm run campaign:demo` (`scripts/campaign-demo.mjs`) |
| Adaptive next-experiment / stopping-rule engine (backend) | `packages/backend/src/campaign/nextExperiment.mjs::analyzeAndDecide` | Rule-based on Pareto hypervolume/diversity/success-rate; returns `STOP_OBJECTIVE_REACHED`/`STOP_NO_IMPROVEMENT`/`STOP_RESOURCE_LIMIT` or an adaptive strategy change |
| Candidate generation + dedup (backend, chemistry) | `campaign/drugAdapter.mjs::generateProposals/generateRecombinationProposals`; dedup in `orchestrator.mjs` `seenCanonical` | Transformation + BRICS-recombination proposals; canonical-SMILES dedup is real (within one campaign run) |
| Novel hypothesis generation (parameter side) | `core/agent/parameterAlternative.ts` | Derives an undeclared parameter value by bracketing two falsified hypotheses' real predictions |
| Novel hypothesis generation (mechanism side) | `core/agent/mechanismGeneration.ts`, `structuralAlternative.ts`, `beliefRevision.ts::HypothesisGenerationMechanism` | `RELATION_FLIP`/`TOLERANCE_WIDENED`/`STRUCTURAL_ALTERNATIVE`, wired into `discoveryLoop.ts` |
| Orchestrator that routes+admits/refuses a question | `core/agent/discoveryOrchestrator.ts::runDiscovery` | Admits/refuses `MECHANISM/PARAMETER/CALIBRATION`, dispatches to the owning strategy — "a HOST, not a third investigation loop" |
| One shared "what to run next" contract across 5 substrates | `core/agent/nextAction.ts::NEXT_ACTION_SELECTORS` | Normalizes 5 independently-built next-experiment selectors behind one `NextActionSelector<TState>` type |
| Candidate ranking (not "first eligible") | `biotechData/substitutionPlanner.ts::selectNextValidationCandidate`; `biotechRealEvidenceRerank.ts` | Sorts by `rankingScore`, returns best + runner-up with rationale |
| Multi-objective Pareto ranking | `campaign/pareto.mjs`; `biotechData/substitutionPareto.ts` | Real Pareto-front + hypervolume, used on both sides |
| Falsification / prediction-vs-measurement judging | `predictionVerification.ts`, `falsificationRelation.ts`, `scientificDiscovery.ts` | One shared judge, refuses `SIMULATED`-tagged comparisons, reused everywhere |
| Tautology/circularity gate | `tautologyGate.ts::assessTautology/assessSingleTautology/evidenceCeiling` | Classifies from declared derivation metadata only, caps evidence for non-testable pairs |
| Multi-verdict generic evidence container | `core/agent/externalDatasetCase.ts::buildExternalDatasetCase` | See dedicated note below |
| Domain-plugin-like router | `experimentFabric/router.ts` (`ROUTER_MODELS`) | 50+ models across 17 distinct `domainId`s, uniform parameter/engine/knowledge-source declaration |
| Domain-plugin-like adapter registry (backend) | `compute/registry.mjs`; `campaign/toolchain.mjs` (`TOOLS`) | Every heavy engine (RDKit, PySCF, OpenMM, Vina, ADMET-AI, DepMap) registers with `capabilityId`, `validate()`, real runtime status — never fakes availability |
| Drug-discovery multi-fidelity funnel | `campaign/multiFidelity.mjs` | CHEAP(descriptors)→FILTER(Pareto)→EXPENSIVE(docking→QM→ADMET), persisted, replay-verified |
| Explainability over a running campaign | `campaign/why.mjs`, `discoveryGraph.mjs` | `whyCandidate`/`whyStatus` answer lineage/rejection purely from persisted events |
| Replay/reproducibility verification | `campaign/verify.mjs::verifyScienceRun`; `scienceMemory.ts` | Re-executes a persisted run, reports `MATCH`/`DRIFT`/`ENGINE_VERSION_CHANGED`/`BLOCKED_BY_RUNTIME` |
| Data-provenance axis | `core/dataProvenance.ts` | `'SIMULATED'|'REFERENCE'|'REAL_EXPERIMENTAL'`, required on every `StrategyRun` |
| Content fingerprinting | `events/hash.ts::fnv1a/canonicalJson` | The one hashing primitive used by every replay/fingerprint function |

**`externalDatasetCase.ts` in detail.** Takes N already-computed, domain-specific verdicts and produces an `ExternalDatasetCase`: every hypothesis keeps its own independent belief (unmodified `createHypothesis`/`updateConfidence`, capped by unmodified `evidenceCeiling`), verdict/tautology counts are tallies (never one scalar), one `caseFingerprint` for replay. It knows nothing about QE4/Brydges specifically — that glue lives in `biotechData/qe4EvidenceCase.ts`.
- Already covers: N co-equal hypothesis verdicts over one external dataset, each with its own belief trajectory and `nextQuestion` prose.
- Does NOT cover: (1) no `selectNextExperiment` — `nextQuestion` is prose, not an executable request; (2) never triggers a *new* measurement; (3) no persistence path (deliberate, following `externalAnchor.ts`'s precedent); (4) exactly one real caller (`qe4EvidenceCase.ts`) so far.

## B. CZEGO BRAKUJE (genuinely NEW)

| Capability | Why genuinely new | Smallest reuse-first sketch |
|---|---|---|
| Causal-inference primitive (DiD/ITS/synthetic control) | Confirmed absent by repo-wide grep; already named as a gap in `docs/prompts/C1-B1-ulez-no2-adjudication.md`, scoped as `core/agent/causalInference.ts::fit(panel, treatment, controls, estimator) → {estimate, CI, diagnostics}` | Build as ONE new estimator module; feed `{estimate, CI}` into the EXISTING `FalsificationCriterion`/`evaluateTwoArmRelation`, not a second significance test |
| Live target-disease evidence adapter with ranking | Existing ChEMBL/PubChem files are single **pinned** records, not a parametrized fetch+cache for arbitrary target+disease | Extend `chembl.ts`/`pubchem.ts` to a parametrized fetch, feeding the same `objectiveVector`/`constraintViolations` shape `drugAdapter.ts` already defines |
| Government/policy discovery pipeline | Zero causal-inference code confirmed; `cmsOpenDataAdapter.mjs` is particle physics, unrelated to policy | Build ON TOP of the causal-inference primitive above; route through `discoveryOrchestrator.ts`'s existing admission pattern, not a new loop |

**Correction to the first pass of this audit**: the cross-substrate dispatcher item ("a 6th `nextAction.ts` selector wrapping the backend campaign engine") was listed here as missing in the first draft. It is **not** missing — `core/agent/nextAction.ts::makeCampaignNextAction` already wraps `campaign/nextExperiment.mjs::analyzeAndDecide`, registered as `CAMPAIGN_SELECTOR_ID` in `NEXT_ACTION_SELECTORS` (6 selectors total, not 5). Verified directly by reading the file before writing any prompt against this finding — this is exactly the kind of claim this mission requires checking twice before assigning work from it.

## C. CO TRZEBA TYLKO ROZSZERZYĆ (EXTEND)

- **Campaign dedup**: `orchestrator.mjs`'s `seenCanonical` dedups *within one run*. No cross-campaign dedup exists — a new campaign can re-propose a molecule a prior one already exhausted. `hypothesisLoop.ts`'s `priorRunFingerprints` is an anti-HARKing check, not a repeat-experiment guard. Gap: a small lookup against `scienceMemory.ts`/`campaign/persistence.mjs` before queueing a new candidate.
- **Stopping rules**: real and working, but two incompatible vocabularies exist side by side (`InquiryStopReason` in `inquiryLoop.ts`; `DECISIONS` STOP_* in `nextExperiment.mjs`). Gap: a shared `StopReason` union, documented like `nextAction.ts` already documents "what next".
- **`docs/DRUG_DISCOVERY.md` is stale**: still says docking/MD/QM/ADMET/toxicity are "NOT implemented" — but `dockingAdapter.mjs`, `qmAdapter.mjs`, `admetAdapter.mjs` are real and wired into `multiFidelity.mjs`. Documentation fix, not code, but a real risk if a session trusts the stale doc over the real backend.

## D. Where Qwen's spec is wrong or overstated

1. **"Needs an orchestrator" — overstated as fully new.** Both `discoveryOrchestrator.ts` (frontend) and `campaign/orchestrator.mjs` (backend) already run unattended end-to-end with tests and a reproduction script, and `nextAction.ts::makeCampaignNextAction` already dispatches to the backend engine from the frontend's shared "what next" contract. The real remaining gap is narrower still than first drafted: cross-*campaign* memory (see B/C), not a missing dispatcher.
2. **"Stopping rules" as a new engine.** Real stop logic already exists twice; the gap is unification, not invention.
3. **"Campaign memory/dedup" as wholly new.** Within-run dedup already exists; only cross-run dedup is missing.
4. **Drug-discovery readiness understated.** A real generate/dock/QM/ADMET/rank/replay pipeline with its own e2e demo already exists in `packages/backend/src/campaign/*`, one level below the frontend `DrugDiscoveryScreen.tsx` (which the spec's author likely looked at instead — that screen is stale relative to the backend it could call).
5. **Causal inference/policy pipeline** — the one area Qwen's severity assessment is accurate: this genuinely does not exist.

## E. Smallest P0 set for ONE more real, runtime-verified autonomous-loop proof point

The backend campaign engine is already the most complete, already-autonomous loop in the repo. The smallest next step is proving cross-run behavior on it, not building a new engine:

1. **Extend** `campaign/persistence.mjs` (confirmed: `listCandidates(db, campaignId, generation)` is scoped to one `campaignId` — no cross-campaign query exists) + `orchestrator.mjs`: add a repo-wide `seenCanonicalGlobal` lookup keyed by objective+constraints fingerprint, sourced across prior campaigns (~30-60 lines).
2. **Extend** `scripts/campaign-demo.mjs` (or a parametrized sibling): run the same engine against a second real objective to prove `analyzeAndDecide`'s adaptive stopping genuinely reacts to different data, and that (1)'s dedup actually skips a candidate the first run already exhausted.
3. **New, minimal**: `packages/backend/src/compute/causalInference.mjs`, exactly CAP-2 from `docs/prompts/C1-B1-ulez-no2-adjudication.md`, tested the way `campaign/verify.mjs` tests other adapters.
4. **Do not** build a new "Laboratory" domain-plugin interface — `experimentFabric/router.ts` (17 domains) and `campaign/toolchain.mjs` already are that interface; formalizing a shared name for it is documentation, not code.
5. **Do not** add a cross-substrate `nextAction.ts` selector for the campaign engine — it already exists (`makeCampaignNextAction`/`CAMPAIGN_SELECTOR_ID`, see correction in section B).

## F. Is the spatial/World Engine relevant?

No. `core/three/labScene3D.ts` is a documented pure presentation layer that only renders already-computed `ScenarioDaySample[]` from `experimentFabric/labSession.ts`; nothing in `core/three/` is imported by `discoveryLoop.ts`, `inquiryLoop.ts`, or the backend campaign engine, and vice versa. `GenesisScientificCityScreen.tsx`/world-generation is a separate visualization feature line. Out of scope for autonomous-loop work unless a future task explicitly wires a discovery decision to the 3D world state.
