# Reference Scientific Campaign & Acceleration Report

**Scope:** Drug Discovery *software-validation* campaign on the Genesis Scientific
Acceleration Engine. This benchmark validates the **campaign-control loop**
(generate → validate → execute → evaluate → rank → adapt → stop) on **real
RDKit**. It is **not** a therapeutic discovery and makes **no** clinical-efficacy
claim. It uses documented, non-novel reference chemicals.

## Reproduce

```bash
npm run campaign:demo
```

Deterministic by construction (no RNG; sorted parent/transformation selection;
fixed starting molecules). If RDKit is not installed the molecular capability is
reported as `BLOCKED_BY_RUNTIME` — an honest capability gap, not a fake result.

## Toolchain validation (runtime, real reference cases)

The engine is marked `AVAILABLE` only after passing real reference cases:

| Reference case | Expected | Actual | Result |
| --- | --- | --- | --- |
| aspirin Crippen logP | 1.31 (±0.1) | 1.3101 | PASS |
| benzene → methylation | `Cc1ccccc1` | `Cc1ccccc1` | PASS |

RDKit version: **2026.03.3**.

## The 15 benchmark questions (answered from persisted data)

Numbers below are from one recorded run (`npm run campaign:demo`). They are
persisted in the campaign tables (`campaigns`, `campaign_candidates`,
`campaign_decisions`, `campaign_events`) and re-derivable on every run.

| # | Question | Answer |
| --- | --- | --- |
| 1 | What was the objective? | MPO benchmark: approach target crippenLogP ≈ 2.5 and molWt ≈ 350 (multi-objective search-behaviour validation) |
| 2 | Starting population? | `c1ccccc1`, `Oc1ccccc1`, `Nc1ccccc1`, `Cc1ccccc1` (benzene, phenol, aniline, toluene — non-novel reference chemicals) |
| 3 | Candidates generated? | 196 |
| 4 | Valid? | 196 |
| 5 | Invalid? | 0 |
| 6 | Duplicates? | 24 |
| 7 | Why rejected? | duplicate: 24 (canonical-SMILES dedup) |
| 8 | How did the Pareto front move? | hypervolume 10.96 → 18.79 (per-gen 13.51 → 15.42 → 16.65 → 17.91 → 18.79); Pareto size 17 |
| 9 | Did diversity change? | 0.741 → 0.750 → 0.740 → 0.722 → 0.725 (mean pairwise Morgan-Tanimoto distance) |
| 10 | Which transformations worked? | add-amino, add-chloro, add-fluoro, add-hydroxyl, add-methyl, add-nitrile |
| 11 | Which transformations failed? | none (all produced valid, in-constraint products) |
| 12 | Next experiment selected? | gen1–4: INCREASE_HIGH_VALUE_TRANSFORMATION; gen5: STOP_RESOURCE_LIMIT |
| 13 | How did the strategy change? | Pareto-contributing transformations up-weighted each generation (add-chloro, then add-nitrile, then add-fluoro) and parent selection biased to the Pareto front |
| 14 | Did the next generation use the new strategy? | Yes — each generation consumes the strategy persisted by the prior decision; strategy weights and parent selection are read back from `campaign.strategy` before generating |
| 15 | Why did the campaign stop? | STOP_RESOURCE_LIMIT (generation budget of 5 reached) |

## Acceleration Report (measured execution metrics)

Factual counts and timings for the recorded run. **No acceleration-factor claim
is made** — statements like "one day in one hour" would require a controlled
human/manual baseline this benchmark does not measure.

| Metric | Value |
| --- | --- |
| wall-clock runtime | 137.1 s |
| engine (RDKit) runtime | 99.5 s |
| generations | 5 |
| candidates generated | 196 |
| candidates validated | 196 |
| invalid candidates | 0 |
| duplicates removed | 24 |
| Scientific Runs executed | 172 |
| Scientific Jobs | 0 (synchronous engine path; async Job System is used by the API `start` route) |
| retained results | 172 |
| rejected results | 24 |
| strategy changes | 4 |
| next-experiment decisions | 5 |
| Pareto front size | 17 |
| hypervolume start → end | 10.96 → 18.79 |
| stop reason | STOP_RESOURCE_LIMIT |
| Discovery Graph | 380 nodes, 579 edges |

## What this proves (and what it does not)

**Proves:** the control loop is real and evidence-driven — real canonicalization,
real descriptors, deterministic SMARTS-reaction transformations, invalid/duplicate
rejection, multi-objective Pareto ranking with monotonic hypervolume, structural
diversity measurement, adaptive next-experiment decisions that change the next
generation's execution, explicit resource-bounded stopping, and full persistence
with a Discovery Graph and WHY answers traceable to Scientific Runs.

**Does not prove:** any therapeutic value, binding affinity, ADMET, or clinical
outcome. Descriptors are 2D cheminformatics only (no docking, MD, or QM). The
"objective" is a synthetic MPO target chosen to exercise search behaviour, not a
biological endpoint.
