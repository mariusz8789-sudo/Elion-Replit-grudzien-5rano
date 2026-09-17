# GENESIS RESEARCH PACKAGE FOR C1 — REAL-WORLD EXPERIMENT CANDIDATES

**STATUS NADRZĘDNY: RESEARCH ONLY / NOT RUN.** Dostarczone przez Qwena (Research Director,
external research only — brak dostępu do repo, brak kodu, brak wykonania). Nic poniżej nie jest
zaimplementowane ani uruchomione. Żadna zdolność Genesis nie jest zakładana — każda jest
oznaczona jako WYMAGANA i zostawiona do weryfikacji C1. Zapisane DOSŁOWNIE, tak jak dostarczone.

---

**Qwen = Research Director (external research only). No repo access, no code, no execution. Nothing below is implemented or run (NOT RUN). No Genesis capability is assumed; every capability is stated as REQUIRED and left for C1 to verify.**

---

## TOP 3 CANDIDATES + RANKING

| Criterion | C1 ULEZ→NO₂ adjudication | C2 Brydges dynamical entanglement | C3 GLP-1 substitution pharmacology |
|---|---|---|---|
| Scientific value | **high** (adjudicates live published disagreement) | medium (structural + integrity) | medium (topical substitution, mostly reproduction) |
| Data availability | high (DEFRA AURN hourly, no key) | high (Zenodo 2527010, checksums published) | high (ChEMBL FTP + ClinicalTrials API, no key) |
| Data quality | high (station-level hourly, ratified flags) | high (measurement-level CSV) | high (curated assays + posted results) |
| Falsifiability | high (CI-based, preregistered margin) | high (structural signatures) | medium-high (ratio/margin) |
| Independence | high (raw monitors vs published claims) | high (ion measurements) | high (wet-lab + trials) |
| Reproducibility | high | high | high |
| HARKing risk | low (estimator+range sealed pre-pull) | low | low-medium (margin sourcing) |
| Circularity risk | low | low | medium (shared assay labs; margin source) |
| Genesis fit | medium (needs causal-inference capability) | medium (needs entropy estimator) | medium (needs bioactivity+trial ingestion) |
| Implementation difficulty | medium | low-medium | medium |
| Reusable capability potential | **high** (causal inference → many policy experiments) | medium (entropy estimator → quantum experiments) | medium (cheminformatics/trial ingestion) |
| Discovery potential | medium-high (adjudication + heterogeneity) | low-medium | low |

**SELECTED BEST CANDIDATE: C1 — London-wide ULEZ (29 Aug 2023) → roadside NO₂, independent adjudication of conflicting published estimates.** C2 retained as fallback if C1 judges the causal-inference capability too heavy; C3 as low-risk replication warm-up.

---

## CANDIDATE 1 (SELECTED) — FULL A–E

### A. SCIENTIFIC PROBLEM
- **Question:** Did the 29-Aug-2023 London-wide ULEZ expansion reduce roadside NO₂ beyond background trend, relative to comparable UK cities without a charging scheme?
- **Why interesting:** published estimates **conflict**: Tong et al. 2025 report "no detectable impact on NO₂" from the 2023 expansion (PMC12545172), while the TfL one-year report and press summaries claim overall improvement / NOx −14% (content.tfl.gov.uk London-wide ULEZ One Year Report; london.gov.uk). An independent, preregistered re-analysis on raw monitor data **adjudicates** a live scientific disagreement — a genuine contribution, not reproduction.
- **Testable hypothesis:** H1: ULEZ caused a measurable reduction in London roadside NO₂ (DiD estimate meaningfully negative) vs H2: no detectable effect (null consistent with Tong et al.).

### B. REAL DATA
- **Dataset:** DEFRA UK Automatic Urban and Rural Network (AURN) hourly measurements + London local-authority hourly data.
- **URLs:** `https://uk-air.defra.gov.uk/data/` (Data Selector + preformatted files); network/station metadata `https://uk-air.defra.gov.uk/networks/network-info?view=aurn`; London LA hourly `https://www.airqualityengland.co.uk/local-authority/data`; aggregate statistics `https://www.gov.uk/government/statistical-data-sets/env02-air-quality-statistics`; cross-check EEA Air Quality Download Service `https://www.eea.europa.eu/en/datahub/datahubitem-view/778ef9f5-6293-4846-badd-56a29c70880d` and OpenAQ `https://openaq.org`.
- **DOI:** none minted for AURN raw files **[NOT VERIFIED — cite gov.uk ENV02 publication instead]**.
- **Version:** no formal versioning → **pin by download timestamp + full file manifest** (freeze step).
- **License:** UK Open Government Licence **[NOT VERIFIED exact string — C1 confirm]**; EEA open licence **[NOT VERIFIED]**.
- **Downloadable files:** hourly CSV per site/pollutant via Data Selector / preformatted archives.
- **Raw/processed:** raw-ish calibrated hourly concentrations + ratified/non-ratified status flags **[VERIFY field names]**.
- **Checksum:** not published by DEFRA → **C1 computes sha256 at freeze** (record in provenance).
- **Uncertainties:** per-point monitor uncertainty not published → use station-level variability + city-clustered SE + Newey-West; DEFRA QA flags as inclusion filter.
- **Provenance:** DEFRA/AURN network operator metadata, station siting (roadside/background), measurement method.

### C. EXPERIMENT
- **Hypothesis (H1):** DiD(London roadside NO₂, 12 mo post) ∈ [−6, −2] µg/m³ (range preregistered from prior inner-ULEZ evaluation literature **[VERIFY specific citation]**).
- **Alternative (H2):** DiD ≈ 0 (CI includes 0) — consistent with Tong et al. null.
- **Prediction:** monthly-mean roadside NO₂ in London falls relative to synthetic/DiD control by ≥1 µg/m³ within 12 months post.
- **Observable:** monthly-mean roadside NO₂ (µg/m³) per station.
- **Independent observable:** raw monitor readings (independent of both published claims being adjudicated).
- **Controls:** UK core cities with **no charging zone in window** (Manchester, Leeds, Sheffield, Liverpool, Newcastle — **policy status per city [VERIFY]**); station and month fixed effects; weather covariates optional.
- **Negative controls:** (a) control-city pair DiD (Manchester vs Leeds) expecting null; (b) less traffic-driven pollutant (SO₂) expecting smaller/null effect; (c) pre-period placebo treatment dates.
- **Uncertainty:** city-clustered robust SE + Newey-West for seasonal autocorrelation; preregistered ±CI decision bands.
- **Falsification criterion:** 95% CI of DiD excludes −1 µg/m³ (includes 0 or positive) → **FALSIFY** meaningful-reduction (adjudication favors Tong null).
- **Support criterion:** 95% CI entirely below −1 and overlapping preregistered [−6,−2] → **SUPPORTED** (adjudication favors TfL improvement claim); CI between −1 and 0 → **INCONCLUSIVE**.

### D. SCIENTIFIC INDEPENDENCE
- **Model:** two-way FE DiD / interrupted time series / synthetic control (estimator = model).
- **Prediction:** preregistered effect range [−6,−2] and falsification band (−1).
- **Observation:** raw hourly NO₂ monitor readings.
- **Evidence:** monitor readings passing preregistered DiD test (EMPIRICAL).
- **Consistency check:** aggregator/estimator algebra; CSV→monthly aggregation (weight 0).
- **Model-dependent:** causal identification assumptions (parallel trends, no differential shocks, stable stations); synthetic-control weights.
- **Empirical:** station readings; negative-control nulls.
- **Tautology risk:** estimator algebra only (weight 0); no self-generated data.
- **Circularity risk:** low — raw monitors independent of the two published claims being adjudicated; avoid reusing either paper's processed series.
- **HARKing risk:** low if estimator, range, controls, and bands sealed **before** data pull; medium if ranges tuned after seeing Tong/TfL numbers (mitigate: cite and seal range from prior inner-ULEZ literature only).

### E. GENESIS REQUIREMENTS (REQUIRED CAPABILITIES — existence left to C1)
- **CAP-1 Panel/time-series ingestion with freeze+checksum.** Min behavior: download manifest, compute sha256, store immutable snapshot + provenance. In: URLs/manifest. Out: frozen dataset + hashes + provenance record. Purpose: reproducibility/replay. Generic reusable: **yes**.
- **CAP-2 Causal-inference estimator library (DiD / ITS / synthetic-control, cluster-robust SE, placebo & negative-control tests).** **NEW REUSABLE CAPABILITY REQUIRED** — why: any future policy experiment (Scotland MUP, France 80 km/h, other LEZ/CAZ cities) reuses it; minimal interface `fit(panel, treatment, controls, estimator) → {estimate, CI, diagnostics, placebo_results}`; independent tests: simulated panels with known injected effect (must recover), placebo panels (must return null), parallel-trends pre-test.
- **CAP-3 Preregistration sealing + fingerprint.** Min behavior: seal hypothesis/prediction/thresholds pre-pull, fingerprint, order-enforce. Generic reusable: **yes** (C1 verify existing).
- **CAP-4 Evidence classification + Tautology Gate + belief revision + next-question.** Min behavior: label CONSISTENCY/MODEL/EMPIRICAL/MIXED; weight-0 for algebra; update belief; emit next question. Generic reusable: **yes** (C1 verify existing).
- **CAP-5 Deterministic replay.** Min behavior: frozen data + code hash + seed → bit-identical outputs. Generic reusable: **yes** (C1 verify existing).

---

## CANDIDATE 2 (FALLBACK) — CONDENSED A–E
**A.** Does trapped-ion dynamical entanglement show preregistered universal structural signatures (thermalizing volume-law saturation vs MBL sub-extensive/log-t growth; protocol pure-vs-mixed validation)? **B.** Zenodo 2527010 (Brydges et al., v2, 2018-10-05, DOI 10.5281/zenodo.2527010), `Data_aau4963_Updated.zip` md5 `5f027c6ee5d1283ca9338015e066dff6`, tab-delimited CSV (MeasuredStates/Purity/RenyiEntropy/MutInfo), measurement-level, bootstrap-able; licence on record **[VERIFY]**. **C.** H1 clean→extensive saturation, disorder→sub-extensive+log-t; falsify if clean sub-extensive or disorder extensive/linear-t; negative control Fig1a pure≈0/mixed>0; integrity check CSV-vs-JSON. **D.** Estimator algebra=consistency(weight 0); ion samples=empirical; universality labels=model-dependent; low circularity/HARKing. **E.** CAP-1, CAP-3, CAP-4, CAP-5 + **CAP-6 randomized-measurement Rényi-2 estimator** (pure function; reusable for future entanglement experiments; test on simulated product/maximally-entangled states).

## CANDIDATE 3 (WARM-UP) — CONDENSED A–E
**A.** Is liraglutide a pharmacologically defensible substitute for semaglutide at GLP-1R (potency within 1 log unit; HbA1c difference within ±0.4 pp)? **B.** ChEMBL_37 (`https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/latest`, release May-2026, CC-BY-SA-unported **[VERIFY]**); ClinicalTrials.gov API v2 (no key). **C.** H1 ratio∈[0.1,10] & |ΔHbA1c|≤0.4pp; falsify if outside; negative controls metformin (no GLP-1R potency), insulin glargine (large HbA1c gap). **D.** Aggregation=consistency; assays/trials=empirical; PK/regimen=model-dependent (excluded); circularity medium (margin must not come from pulled trials). **E.** CAP-1,3,4,5 + **CAP-7 bioactivity/trial-results ingestion+aggregation** (reusable for future pharmacology experiments).

---

# FINAL PACKAGE (SELECTED = CANDIDATE 1)

1. **EXECUTIVE SUMMARY:** Independent preregistered DiD/ITS re-analysis of raw DEFRA AURN NO₂ to adjudicate conflicting ULEZ-2023 effect claims; requires one NEW REUSABLE causal-inference capability (CAP-2); all other capabilities generic and C1-verified.
2. **SCIENTIFIC QUESTION:** as §A.
3. **HYPOTHESES:** H1 reduction [−6,−2]; H2 null.
4. **DATASET:** as §B.
5. **DATA PROVENANCE:** DEFRA/AURN operator metadata, station siting/method, freeze manifest + sha256, download timestamp.
6. **PREREGISTRATION:** question; H1/H2; primary endpoint = 12-mo DiD roadside NO₂; secondary = 6/24-mo, roadside-vs-background, borough heterogeneity, synthetic-control weights; inclusion = continuous-operation ratified stations, pre+post coverage; exclusion = siting changes, non-ratified; preprocessing = hourly→monthly mean per station, weather-optional; method = two-way FE DiD (cluster by city) + ITS + synthetic-control robustness; uncertainty = clustered+Newey-West; falsification = CI excludes −1; support = CI entirely <−1 ∩ prereg range; negative controls = control-pair DiD, SO₂, placebo dates. **Sealed pre-pull.**
7. **EXPERIMENT DESIGN:** as §C + robustness (leave-one-control-out, alternative windows).
8. **FALSIFICATION:** as §C.
9. **TAUTOLOGY ANALYSIS:** algebra/aggregation = CONSISTENCY (weight 0); monitor readings vs preregistered band = EMPIRICAL; identification assumptions = MODEL_DEPENDENT; overall **MIXED_TEST**.
10. **HARKING AUDIT:** estimator/range/controls/bands sealed pre-pull; range sourced only from prior inner-ULEZ literature; exploratory heterogeneity labelled exploratory.
11. **CIRCULARITY AUDIT:** raw monitors independent of adjudicated claims; do not ingest either paper's processed series; shared seasonal/weather confounders handled by FE/covariates.
12. **REQUIRED CAPABILITIES:** CAP-1…CAP-5 (§E), CAP-2 flagged NEW REUSABLE.
13. **C1 REPO VERIFICATION CHECKLIST:** (1) capability exists? (2) existing workflow usable? (3) existing adapter/dataset transport? (4) existing Evidence/Provenance/Replay path? (5) Tautology Gate path? (6) belief revision? (7) next-question mechanism? (8) runnable without new engine? → IF EXISTS reuse / IF PARTIAL extend / IF MISSING smallest reusable / IF REQUIRES NEW ENGINE mark FUTURE-or-justified-reusable (CAP-2 justified; anything else = BLOCKED).
14. **C1 EXECUTION CONTRACT:** 0 verify dataset → 1 verify license/access → 2 verify checksum/version → 3 freeze dataset → 4 freeze preregistration → 5 verify existing Genesis capabilities → 6 choose reuse/extend/new-reusable → 7 implement only if needed → 8 unit tests → 9 run experiment → 10 uncertainty → 11 falsification tests → 12 controls → 13 classify evidence → 14 Tautology Gate → 15 provenance → 16 fingerprint → 17 deterministic replay → 18 belief revision → 19 next question → 20 final verdict → 21 full quality gate → 22 Chromium/E2E if applicable.
15. **EXPECTED OUTPUTS:** frozen snapshot+hashes; sealed preregistration; DiD/ITS/synthetic-control estimates + CIs; placebo/negative-control table; evidence classification; adjudication statement vs Tong vs TfL; provenance+fingerprint; replay log; belief update; next question; final verdict.
16. **DISCOVERY vs REPRODUCTION RULE:** adjudicating a live disagreement with independent data = **genuine scientific contribution** but labelled ADJUDICATION, not DISCOVERY; DISCOVERY reserved for a preregistered novel finding beyond adjudication (e.g., unexpected station-type heterogeneity replicated out-of-sample); reproduction = re-confirming either published estimate.
17. **TOP 3 ALTERNATIVES:** C2 Brydges (fallback), C3 GLP-1 (warm-up), plus Scotland MUP / France 80 km/h as future CAP-2 consumers (not ranked now).
18. **SELECTED BEST CANDIDATE:** Candidate 1.
19. **BLOCKERS:** DEFRA/EEA licence strings [NOT VERIFIED]; per-city control policy status [NOT VERIFIED]; inner-ULEZ range citation [NOT VERIFIED]; CAP-2 existence in Genesis [NOT VERIFIED]; no checksums published (compute at freeze); **NOT RUN** throughout.
20. **SELF-AUDIT:** dataset existence/access **VERIFIED BY WEB** (DEFRA/EEA/OpenAQ URLs; ULEZ date 29-Aug-2023; Tong null; TfL improvement); licences/checksum-availability/control-status/range-citation **NOT VERIFIED**; causal capability in Genesis **NOT VERIFIED**; experiment **NOT RUN**; no code; no repo assumptions; no fictitious capabilities.

**VERDICT VOCABULARY (fixed):** SUPPORTED · FALSIFIED · INCONCLUSIVE · BLOCKED · CONSISTENCY_ONLY · MODEL_DEPENDENT · EMPIRICAL_TEST · MIXED_TEST. **DISCOVERY only per §16 rule.**
