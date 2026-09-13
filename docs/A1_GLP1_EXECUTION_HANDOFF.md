# A1 GLP-1 SUBSTITUTION — EXECUTION HANDOFF

> **C1 EDITORIAL NOTE (2026-09-13).** Pakiet Qwena, zapisany dosłownie. Qwen nie ma dostępu
> do repo. **Jedna aktualizacja wobec stanu repo:** po zbudowaniu generycznego silnika
> (`core/agent/discoveryCampaign.ts`, commit `166665f`) A1 może wejść nie tylko przez
> `externalDatasetCase`, ale jako **trzeci adapter `CampaignLaboratory`** — i byłaby to
> pierwsza domena INTERWENCYJNA, czyli pierwszy realny test `PracticalCandidate`
> (na QE4 i Keplerze `proposedProtocol` jest zawsze `null`, bo obie są opisowe).
> Granica medyczna z §14 musi być egzekwowana w warstwie wyniku, nie w promptcie.

**STATUS: READY FOR EXECUTION / NOT RUN.** Qwen = Research Director (no repo, no code). This document is the complete execution contract for the agent that takes A1. It runs on existing Genesis infrastructure (`DatasetLaboratory` P0.1 + `externalDatasetCase` + ChEMBL/PubChem anchors); it requires NO new engine and NO causal-inference component.

## 1. GOAL AND SCOPE
Population-level pharmacological evaluation of whether **liraglutide** is a defensible substitute for **semaglutide** at the GLP-1 receptor during semaglutide shortage — based solely on public data. Output is an evidence-graded verdict, never a clinical directive.

## 2. RESEARCH QUESTION
During semaglutide shortage, is liraglutide a pharmacologically defensible substitute at GLP-1R with comparable glycaemic efficacy at labelled doses?

## 3. HYPOTHESES
- **H1 (substitution supported):** median GLP-1R potency ratio lira/sema ∈ [0.1, 10] AND |ΔHbA1c| ≤ 0.4 percentage points with overlapping 95% CIs across ≥2 qualifying trials per drug.
- **H2 (not supported):** potency ratio outside [0.1,10] OR |ΔHbA1c| CI entirely outside ±0.4 pp.
- **H0 (null):** no detectable difference beyond assay/trial noise.

## 4. DATA SOURCES
- **ChEMBL** (bioactivity): latest release via `https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/latest` (SQLite/CSV/SDF); licence CC-BY-SA-3.0-Unported **[UNVERIFIED exact string — confirm at freeze]**. Target = GLP-1R (ChEMBL target id **[UNVERIFIED — resolve at runtime, do not hardcode]**).
- **ClinicalTrials.gov API v2**: `https://clinicaltrials.gov/api/v2/studies` (free, no key, JSON) — posted results, arm-level HbA1c change-from-baseline.
- Manufacturer/label numbers are CLAIMS only — never thresholds, never evidence.

## 5. PREREGISTRATION (sealed BEFORE any data pull)
Sealed record (fingerprinted) containing: ratio window [0.1,10]; HbA1c margin ±0.4 pp (sourced from regulatory non-inferiority convention, NOT from the pulled trials); assay filters (human GLP-1R, functional + binding, ≥3 independent assays per drug); trial inclusion (T2DM, ≥24 weeks, HbA1c primary/secondary endpoint, posted results, arm-level data available); aggregation method; decision thresholds; analysis-code hash. Order enforced: seal → download → compute. Prediction closed before analysis.

## 6. INCLUSION / EXCLUSION CRITERIA
- Assays: human GLP-1R only; standard_type ∈ {IC50, EC50, Ki, Kd}; standard_units nM; exclude confounded/invalidated flags; require ≥3 independent assays per drug (mitigates shared-lab circularity).
- Trials: T2DM population; duration ≥24 weeks; HbA1c change-from-baseline reported per arm with SE/SD and n; exclude trials used to set any prior margin; exclude open-label-only if blinded available.

## 7. AGGREGATION METHODS
- Potency: log10(median) per drug across qualifying assays; ratio lira/sema; inter-assay IQR as spread.
- Efficacy: inverse-variance pooled mean HbA1c change per drug; difference with 95% CI (reported SE; between-trial heterogeneity noted).
- All aggregation is pure algebra over measured values → CONSISTENCY layer (weight 0 for the scientific claim).

## 8. DECISION THRESHOLDS
- **SUPPORTED_WITHIN_MODEL:** ratio ∈ [0.1,10] AND |ΔHbA1c| ≤ 0.4 pp with overlapping CIs, with ≥3 assays and ≥2 trials per drug.
- **FALSIFIED:** ratio ∉ [0.1,10] OR ΔHbA1c 95% CI entirely outside ±0.4 pp.
- **INCONCLUSIVE:** insufficient independent assays/trials, or CI straddling the band without clear separation.
- Thresholds are preregistered; never tuned to the observed result.

## 9. EXPECTED OUTPUTS
Per-hypothesis verdict (SUPPORTED_WITHIN_MODEL / FALSIFIED / INCONCLUSIVE); potency ratio + IQR; ΔHbA1c + 95% CI; assay/trial counts; negative-control results; evidence list with epistemic classes; case-level provenance + fingerprint; uncollapsed verdict tally; belief revision; next question. Aggregated DiscoveryState entry: ranked hypotheses + whyBest (revision chain + evidence ids).

## 10. PROVENANCE / FINGERPRINT / REPLAY
- Provenance: ChEMBL release string + file sha256 + access timestamp; ClinicalTrials query string + response sha256 + access timestamp; preregistration fingerprint; analysis-code hash.
- Fingerprint: fnv1a(canonicalJson(declared fields)) per record; case-level fingerprint over the full result.
- Replay: frozen inputs + code hash + seed → bit-identical outputs, else DRIFT. Deterministic aggregation (no nondeterministic sampling; if bootstrap used, fixed seed).

## 11. BELIEF REVISION
One independent `Hypothesis` per H1/H2/H0 with fresh prior (0.5), updated by `updateConfidence` capped by `evidenceCeiling`; append-only revision history (prior → posterior, op ∈ {support, weaken, falsify, unresolved, conflicting}, evidence ids, rationale, round).

## 12. TAUTOLOGY GATE / EPISTEMIC STATUS
Every output record carries epistemic class ∈ {FACT, OBSERVATION, MODEL, PREDICTION, INFERENCE, HYPOTHESIS, UNKNOWN, CONFLICTING_EVIDENCE} and tautology class:
- **CONSISTENCY_CHECK (weight 0):** aggregating ChEMBL/CT.gov numbers; computing the ratio/CI; the bound/margin arithmetic.
- **EMPIRICAL_TEST:** the measured bioactivity values and trial HbA1c outcomes passing the preregistered thresholds.
- **MODEL_DEPENDENT:** PK/regimen equivalence (half-life differs → dosing differs) — explicitly EXCLUDED from the substitution claim; the claim is limited to "same target engagement + comparable glycaemic efficacy at labelled doses".
- **MIXED_TEST:** overall (empirical measurements + model-dependent exclusions + algebra).
- Self-falsification checks: HARKing (prediction sealed pre-pull), circularity (shared assay labs mitigated by ≥3 independent assays; margin not from pulled trials), tautology (aggregation weight 0).

## 13. NEGATIVE CONTROLS
- Semaglutide vs metformin at GLP-1R → expect no/low potency (pipeline must not false-positive a substitute).
- Semaglutide vs insulin glargine HbA1c → expect large difference (margin test is not vacuous).

## 14. MEDICAL SAFETY BOUNDARY (binding, follows the output through every layer)
- NEVER a prescription.
- NEVER an individual dose for a person.
- NEVER individual medical advice.
- NEVER "approved replacement" / "clinical substitution" / "equivalent therapy".
- The verdict may state AT MOST a population-level pharmacological justification (target engagement + glycaemic efficacy at labelled doses), explicitly labelled SUPPORTED_WITHIN_MODEL / FALSIFIED / INCONCLUSIVE — never a clinical directive.
- The substitution decision belongs to the physician / pharmacist / regulator — never the engine.
- This constraint is enforced at the record/output layer, the UI layer, and any downstream consumer; it is not a today-only UI label. Any future scope expansion (new drug pairs, receptors, dosing, interactions, ADME/Tox) requires an explicit user authorization of the same rank as building this experiment.
- Natural compounds, if ever added as candidates, are treated identically (mechanism, evidence, toxicity) — no "natural = safe" aura; no side-effect-free guarantee (unfalsifiable → out of science).

## 15. C1 EXECUTION CONTRACT (A1)
0 verify ChEMBL release + CT.gov API reachability → 1 verify licence/access → 2 checksum/version → 3 freeze datasets → 4 freeze preregistration → 5 verify existing capabilities (`DatasetLaboratory`, `externalDatasetCase`, ChEMBL anchor, beliefRevision, tautologyGate) → 6 REUSE (no new engine) → 7 implement only missing wiring → 8 unit tests (aggregation, thresholds, negative controls) → 9 run experiment → 10 uncertainty → 11 falsification + controls → 12 classify evidence (epistemic + tautology) → 13 Tautology Gate → 14 provenance → 15 fingerprint → 16 deterministic replay → 17 belief revision → 18 next question → 19 final verdict → 20 full quality gate → 21 safety-boundary assertion test (output cannot emit prescription/dose/individual advice/"approved replacement").
- **GREEN:** all steps pass, replay MATCH, safety-boundary assertions hold, verdict emitted with epistemic/tautology labels.
- **BLOCKED:** ChEMBL/CT.gov unreachable, licence unclear, insufficient independent assays/trials, or required capability missing and not justified to build.
- **FAIL:** safety-boundary assertion violated, replay DRIFT, or quality gate red.

## 16. DISCOVERY vs REPRODUCTION RULE
Within-threshold agreement = reproduction of known pharmacology (labelled SUPPORTED_WITHIN_MODEL, not DISCOVERY). DISCOVERY is reserved for a preregistered, replicated finding beyond reproduction (e.g., an unexpected selectivity/off-target divergence contradicting label assumptions) and must be justified as such. A1 is expected to yield reproduction or falsification, not discovery.

## 17. SELF-AUDIT (A1)
Data sources public, no key. Preregistration seals prediction pre-pull. Decision thresholds independent of observed result. Epistemic/tautology classification enforced. Medical safety boundary binding across all layers. No Qwen code; no new engine; relies on P0.1 `DatasetLaboratory` + existing anchors. STATUS: READY FOR EXECUTION / NOT RUN.
