# A10 — External Benchmark Selection & Run Report

## 1. Which benchmark, and why

Candidates evaluated: **ScienceAgentBench**, **DiscoveryBench**, **DiscoveryWorld**.

| Criterion | ScienceAgentBench | DiscoveryBench | DiscoveryWorld |
|---|---|---|---|
| Public data, no login | Annotation sheet on HF is free; full eval bundle is a password-protected zip | Real CSV/JSON data shipped directly in the GitHub repo (no HuggingFace needed — verified: `huggingface.co` is blocked by this sandbox's egress policy, `raw.githubusercontent.com`/git clone are not) | Python package on PyPI (`discoveryworld`, verified reachable), env data bundled |
| Scoring needs a private API | **Yes, hard requirement.** `A valid OpenAI API key is required since our evaluation leverages GPT-4o to judge output visualizations.` (upstream README, verified) | **Yes, for the official HMS metric.** Fetched `eval/new_eval.py` at the frozen commit and traced `run_eval_gold_vs_gen_NL_hypo_workflow`: every facet (context/variable/relation match) calls an external LLM (`get_response`/`run_chatgpt_query_multi_turn`); there is no rule-based fallback path in the source. | No — scoring is in-environment (task completion / actions / discovered-knowledge scorecard), procedural. |
| Task shape vs. Genesis's actual capability | Agent must WRITE ARBITRARY PYTHON to solve open-ended data-science tasks — a general code-generation capability Genesis's discovery engine does not have and was not asked to build here (would be a second, unrelated engine). | Given real tabular data, derive a quantitative/statistical hypothesis about a relationship between named variables — a close match to `discoveryCampaign.ts`/`modelSpace.ts`'s existing model-fitting-and-selection engine. | An embodied, step-based virtual environment (movement, instrument use, up to 1000 actions/task) — a completely different capability (navigation/actuation) Genesis has none of; building it would mean a new agent, not reuse. |
| Verdict | **Eliminated**: private API requirement (hard "no private API" violation) + capability mismatch. | **Selected**, with the OFFICIAL HMS metric marked NO_ACCESS (see §2) and a disclosed rule-based substitute used instead. | **Eliminated**: capability mismatch would require a new, unrelated agent to attempt honestly; out of proportion to this task's scope. |

**Selected: DiscoveryBench, DB-REAL split, `evolution_freshwater_fish` task family, `train` subset — 4 of its real cases, frozen before any run.**

This is an explicit MVP subset, not the full 144-task DB-REAL set or the held-out `test` split. DiscoveryBench ships a small `train` set precisely for this kind of harness-calibration use before attempting the held-out set; using it and saying so plainly is the honest way to report a first run, not the same claim as "solved the benchmark."

## 2. Exact dataset / version

- Repo: `https://github.com/allenai/discoverybench`
- Commit: `c31fcf011e070f021a5f5b906896d0821f6880e8` (2025-06-08)
- Path: `discoverybench/real/train/evolution_freshwater_fish/`
- License: ODC-By 1.0 (Open Data Commons Attribution)
- Dataset: `body-size-evolution-in-south-american-freshwater-fishes.csv`, 460 rows, sha256 `d2498eaafba0a583f3a434e53eec682b3a58cddc16c6fd3d70cc49e5cd645d57`
- Frozen case manifest: `packages/frontend/src/core/benchmark/discoveryBenchManifest.ts` (mirrored, byte-for-byte, in `fixtures/discoverybench/evolution_freshwater_fish/MANIFEST.json`)
- 4 cases (`metadata_0..3`), each naming a real published OLS regression finding (variable, sign, and — for 3 of the 4 — an explicit coefficient) over the SAME 10-covariate model (`RML_evol, MBL_evol, OGP_evol, BEL_evol, diversity, runoff, Elevation, sgr, soil_div, area` → `BAMM_speciation`).
- Independently re-verified via a from-scratch OLS (numpy, outside this codebase) against the real CSV before writing the manifest: every gold coefficient reproduces to 3–4 significant figures, and the one "no significant association" claim (BEL_evol) reproduces as |t| = 1.245, below the 1.96 threshold.

## 3. The official metric is NO_ACCESS — what that means and why

DiscoveryBench's own scorer (`discovery_eval.py` → `eval/new_eval.py::run_eval_gold_vs_gen_NL_hypo_workflow`) requires a live call to an external LLM (OpenAI/Anthropic/Google — configurable, but mandatory) for every facet of its HMS score; there is no rule-based fallback in the upstream source. This sandbox has no private LLM API key wired for scripted use. Rather than fabricate that call or approximate it with an ad hoc LLM judge (which would also break exact replay — model updates over time change LLM-judge outputs even at temperature 0), the official metric is reported as **NO_ACCESS** by construction (`ReproA10BenchmarkReport.officialMetricStatus`), and a disclosed, deterministic, rule-based substitute is used instead: sign match against the real published coefficient, and (for the null-hypothesis case) a real t-statistic significance check using a new `standardErrors` field added to `modelSpace.ts::fitModelSpec` (classical weighted-least-squares coefficient covariance, `σ̂²(XᵀWX)⁻¹`).

## 4. Two real Genesis facets, not one

- **Facet A** — `fitModelSpec` on the full, published 10-covariate model (the same grammar the real study used). The primary "scientific correctness" check.
- **Facet B** — `runDiscoveryCampaign`'s own autonomous search over the same 10 candidate variables (no instruction on which matter), reusing the canonical discovery loop unmodified except for two additive, backward-compatible extensions this run's needs actually required:
  - `CampaignOptions.variables`/`includeInteractions`, threading C3-2's existing multi-variable `ModelSpaceConstraints` fields through to the campaign for the first time (they existed in `modelSpace.ts` but had no caller before this).
  - `CampaignLaboratory.candidateVars`, so multi-variable EXPERIMENT SELECTION (`discriminationAt`/`falsificationPowerAt`) can evaluate live models' predictions at a not-yet-admitted candidate whose independent-variable values are already known (true for any already-collected observational dataset) — without it, selection would silently treat every candidate as a single bare `x`, undefined on every declared variable but one.

This run's honest finding: **Facet A matches gold on all 4 cases; Facet B's `reasoningValidity` (does its own winning model structurally agree) is 25% (1/4)** — the autonomous campaign's `NO_INFORMATION_GAIN` stop rule settles on a constant-only model after only 6 rounds, before the full-sample signal would show up in a small admitted subset. That constant-only model happens to agree with the ONE null-hypothesis case and disagree with the three real-effect cases. This is reported as a genuine, disclosed limitation of the current stopping heuristic under a wide, sparse-data covariate search — not patched to look better, per this task's "the runner is a measurement tool, it may not improve Genesis's own answers" rule.

## 5. Remaining gaps (explicitly not fabricated as solved)

- Only 4 of DiscoveryBench's 144 real tasks are attempted; every other task/domain is `NOT_ATTEMPTED`, never scored as PASS or FAIL.
- The official HMS metric is not computed anywhere in this run (`NO_ACCESS`); the substitute score is a disclosed proxy, not a benchmark-comparable number to DiscoveryBench's own published baselines.
- No public baseline numbers are recorded for this specific 4-case subset (DiscoveryBench's own published baselines are over the full benchmark and the officially-computed HMS, not comparable to this run's disclosed substitute) — inventing a baseline for a metric nobody else reports would not be honest, so none is given.
- Facet B's low `reasoningValidity` (25%) reflects a real limitation in `runDiscoveryCampaign`'s stopping heuristic for wide covariate searches with few initial points — a legitimate follow-up for whoever owns the discovery engine's stopping rules, out of this benchmark harness's own scope to fix.
