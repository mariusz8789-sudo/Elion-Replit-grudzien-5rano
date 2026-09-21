# QE4 — Preregistration: real Rényi-2 entropy recomputation from the Brydges dataset

**Sealed before any of this document's target files' entropy VALUES are opened,
parsed, or analysed.** Phase 0 (dataset identity, checksum, license, docx
description, CSV format, file/row/column layout) was verified first — that is
format verification, not scientific analysis, and is explicitly permitted
before sealing by the task's own Phase 0/Phase 1 ordering. See
`packages/frontend/src/core/biotechData/qe4-brydges/manifest.json` for the
exact provenance of every file this document commits to using.

**One disclosed exception, stated plainly rather than hidden.** While
confirming CSV column layout during Phase 0 (`qe4-brydges-recon` job log), a
`head -n 4` preview surfaced the AUTHORS' own published S2 values for the
first three rows of six `RenyiEntropy_T_Xms.csv` files (10Ions_CleanSystem)
and one row of a disorder `RenyiEntropy_T_10ms.csv`/`T_16ms.csv` file (e.g.
size-1/2/3 subsystem S2 ≈ 0.940/1.68/2.28 at T=5ms). These are the AUTHORS'
numbers from their own processing pipeline, not anything Genesis will ever
compute from — P4 explicitly forbids using published S2 as an input to
Genesis's own recomputation, and this document's own hypothesis text (P1–P4
below) is copied verbatim from the task instructions, fixed by the user
before this document existed, not something chosen after seeing those
numbers. The exact THRESHOLDS below (tolerance rule, extensivity ratio
cutoff) are stated as general, principled rules (±3σ bootstrap; a slope-sign
and ratio test) fixed independently of the specific glimpsed values, not
tuned to make them pass. Full transparency: the glimpsed values are
consistent with the growth-then-saturation shape P1 predicts, which is
reassuring but is not evidence of anything — it is a coincidence of what a
`head -n 4` happened to show, disclosed here so a reviewer can judge for
themselves rather than have it discovered later.

## 1. Dataset (see manifest.json for hashes)

Zenodo record 2527010, DOI 10.5281/zenodo.2527010, `Data_aau4963_Updated.zip`,
MD5 `5f027c6ee5d1283ca9338015e066dff6` (verified against both Zenodo's own API
and the task-stated value), license CC-BY-4.0, associated with Brydges et al.,
*Science* 364, 260 (2019), arXiv:1806.05747.

## 2. Exact files used (all pinned under `core/biotechData/qe4-brydges/`)

- **P1 + P4 (clean):** `10Ions_CleanSystem/MeasuredStates_T_{0,1,2,3,4,5}ms.csv`
  (raw), `10Ions_CleanSystem/RenyiEntropy_T_{0,1,2,3,4,5}ms.csv` (published
  reference, P4 comparison only).
- **P2 + P4 (disorder):**
  `10Ions_withDisorder/MeasuredStates_T_{01,02,04,06,10,16,20}ms.csv` (raw;
  filenames use the source's own zero-padded naming for T=1,2,4,6,10,16,20 ms),
  `10Ions_withDisorder/RenyiEntropy_T_{1,2,4,6,10,16,20}ms.csv` (published
  reference).
- **P3:** `Fig1a/PureState.csv`, `Fig1a/MixedState.csv`.
- **Excluded by scope, decided before opening:** `20Ions_CleanSystem/*` (not
  needed by any of P1–P4 as stated); `RenyiMutInfo_*.csv` and
  `RenyiTimeEvo_HalfPartition_Numerics.csv` (mutual information and
  author-simulated curves — outside scope, and `*_Numerics_*` is explicitly
  forbidden as a prediction input by the task).

## 3. Raw data format (confirmed from `Description_of_data.docx` + per-folder docx)

Each `MeasuredStates_T_Xms.csv` cell is the **decimal representation of a
10-bit binary outcome** of one projective measurement on the 10-ion string
(each ion = one qubit, 0/1). Each **row** = the 150 shots taken under ONE
random local-unitary setting (150 columns = 150 shots). For
`10Ions_CleanSystem`, 500 rows = 500 random-unitary settings. For
`10Ions_withDisorder`, 345 rows; **every 10 consecutive rows is one disorder
realization** (stated explicitly in the docx) — 345 = 34 complete blocks of
10 + one incomplete trailing block of 5 rows.

## 4. Partition convention (stated once, applies to every computation below)

Ion 1 = the most-significant bit (value 512) of the 10-bit decimal code; ion
10 = the least-significant bit (value 1). A size-*k* contiguous partition
"ions 1..*k*" = the top *k* bits. **Caveat, stated honestly:** neither this
document nor the source docx specifies which physical ion in the trapped-ion
string corresponds to which bit of the recorded integer — this is Genesis's
own fixed, arbitrary-but-consistent labeling, not the paper's. This does not
affect any claim P1–P4 make (extensivity of *S₂* vs. partition **size**;
half-vs-full comparison; growth **shape** over time) because all of those are
invariant under any fixed relabeling of the 10 ions. It would matter for a
claim about a specific physical ion's entanglement, which none of P1–P4 make.

## 5. Estimator (CONSISTENCY_CHECK layer — a published formula, not invented here)

The unbiased second-moment randomized-measurement estimator (Elben,
Vermersch, Dalmonte, Zoller, PRL **120**, 050406 (2018); van Enk & Beenakker,
PRL **108**, 110503 (2012); used by Brydges et al. 2019's own Methods for
this exact dataset). For a subsystem of *N_A* qubits, one random-unitary
setting (one row) with *N_M* = 150 shots, extract each shot's *N_A*-bit
outcome (top-*k* bits of the 10-bit code) and compute:

```
X_row = (1 / (N_M·(N_M−1))) · Σ_{i≠j} (−2)^(−D_H(s_i, s_j))
```

where `D_H` is the Hamming distance between two shots' *N_A*-bit outcomes,
summed over all *ordered* pairs of distinct shots *within the same row*
(never across rows/settings — this is what makes the estimator unbiased by
readout noise). Then, averaged over all included rows (one dataset/time
point):

```
Tr(ρ_A²) ≈ 2^(N_A) · mean_row(X_row)
S2 = −log2( Tr(ρ_A²) )
```

For the disorder dataset, `mean_row` is taken **within each disorder block**
first (mean over the block's rows), matching how a physical disorder-averaged
observable is built; the block means are then what gets bootstrap-resampled
(§7), not the raw rows, to preserve the two-level (unitary-setting +
disorder-realization) randomness structure the source data actually has.

For Fig1a (single-qubit Bloch-vector data, **not** raw per-shot bitstrings —
`Sx`/`Sy`/`Sz` are already per-unitary averaged expectation values per the
docx), purity is computed directly from each row's Bloch vector via
`purity_row = (Sx² + Sy² + Sz² + 1) / 2` (a textbook single-qubit identity,
CONSISTENCY_CHECK layer), then averaged over the 100 rows (valid because
purity is unitarily invariant: rotating the measurement frame per random
unitary does not change `Tr(ρ²)`, so each row is an independent noisy
estimate of the *same* physical purity) before converting to
`S2 = −log2(mean_purity)`.

## 6. Partitions and time points computed

- **Clean (P1):** *k* = 1..10 (all ten contiguous top-*k* partitions), every
  T ∈ {0,1,2,3,4,5} ms.
- **Disorder (P2):** *k* = 5 (half) and *k* = 10 (full), every
  T ∈ {1,2,4,6,10,16,20} ms.
- **P3:** full single qubit, both files, all 100 rows each.
- **P4:** every (T, k) pair Genesis computes above that a published
  `RenyiEntropy_T_Xms.csv` row also covers — clean: k=1..10 at each of
  T=0..5ms (60 comparisons); disorder: k∈{5,10} at each of the 7 T-values (14
  comparisons).

## 7. Bootstrap procedure

- Clean: resample the dataset's rows (unitary settings) **with replacement**,
  same count as the original (500), B = 2000 iterations; recompute `S2` each
  iteration; σ = sample standard deviation of the bootstrap `S2` distribution.
- Disorder: resample **disorder BLOCKS** (not individual rows) with
  replacement — 34 complete blocks available (the trailing incomplete 5-row
  block is **excluded from every computation**, a rule fixed here before
  looking at any disorder entropy value, to keep every included block's
  sample size equal) — B = 2000 iterations.
- Fig1a: resample the 100 rows with replacement, B = 2000 iterations.
- Tolerance band for every falsification test below: **±3σ_bootstrap**, per
  the task's explicit instruction. `*_Numerics_*.csv` / author-fitted curves
  are never used to set or adjust this band.

## 8. Preregistered hypotheses and exact verdict rules

**P1 — clean system, ballistic growth + extensive (volume-law) saturation.**
Structural test at the saturation point of the recorded window (T=5ms),
restricted to *k* = 1..5 (half-chain or smaller) to avoid the well-known
purity-constraint "Page-curve" turnover a GLOBALLY PURE state's entanglement
must show past the half-chain point (`S(k) = S(N−k)` for a pure global
state — a real physical constraint, not a defect of this analysis; P1's
"volume law" claim is about genuine bulk extensivity, which the k>5 branch
cannot cleanly test on its own regardless of dataset quality).
- Compute the linear-regression slope of `S2(k)` vs. `k` for k=1..5 at
  T=5ms, weighted by 1/σ²_bootstrap(k).
- **FALSIFIED** if the slope's bootstrap 3σ confidence interval includes
  zero or is negative (no significant growth with subsystem size — the area-
  law signature), OR if `S2(k=5)/S2(k=1) < 1.5` (saturates too early to call
  extensive).
- **SUPPORTED_WITHIN_MODEL** if the slope is significantly positive (3σ CI
  excludes zero) AND `S2(k=5)/S2(k=1) ≥ 1.5` AND `S2(k=5, T=5ms)` is not
  significantly below `S2(k=5, T=4ms)` (i.e., genuinely still growing or
  plateaued, not yet collapsing — ruling out a fluke single-time-point read).
- **INCONCLUSIVE** if bootstrap error bars are too wide to distinguish the
  two cases (3σ CI straddles the `1.5` ratio threshold without excluding
  either side cleanly).

**P2 — disorder (MBL) system, logarithmic-in-time growth + sub-extensive
saturation.** Uses *k*=5 (half) across all 7 disorder time points.
- **FALSIFIED** if `S2(k=5, T=20ms)` is not significantly greater (by
  3σ_bootstrap) than `S2(k=5, T=1ms)` (no real growth over the recorded
  window — contradicts "growing"), OR if the growth from T=1ms to T=20ms
  fits a LINEAR-in-T model significantly better (lower weighted residual)
  than a LOGARITHMIC-in-T model (`S2(t) = a·ln(t) + b`) — operationalized as
  comparing the two fits' weighted sum-of-squared-residuals; linear
  fitting decisively better (by more than a factor of 2 in residual sum of
  squares) falsifies the logarithmic-growth claim.
- **FALSIFIED (sub-extensivity)** if `S2(k=5, T=20ms)` is not significantly
  smaller (by 3σ_bootstrap) than what the CLEAN dataset's *own* recomputed
  `S2(k=5, T=5ms)` saturation value is (the clean run's own half-chain value
  stands in for "what volume-law saturation looks like for this same
  partition size and apparatus," since no clean value exists past T=5ms in
  this dataset) — i.e., disorder must show LESS entropy than the clean
  system's own half-chain saturation to count as sub-extensive.
- **SUPPORTED_WITHIN_MODEL** if growth is confirmed, the log-fit is at least
  as good as the linear fit, and the T=20ms value is significantly below the
  clean system's own half-chain saturation value.
- **INCONCLUSIVE** otherwise (bootstrap error too wide to separate log vs.
  linear, or to separate disorder's saturation value from the clean one).

**P3 — protocol validation (Fig1a).**
- **FALSIFIED** if `mean_purity(PureState.csv)` is not significantly greater
  (3σ_bootstrap) than `mean_purity(MixedState.csv)` — i.e., if the file
  labeled "pure" does not show higher purity (lower S2) than the file
  labeled "mixed."
- **SUPPORTED_WITHIN_MODEL** otherwise.
- (INCONCLUSIVE is structurally impossible here given the ±3σ band unless
  the two bootstrap distributions overlap at 3σ, in which case: INCONCLUSIVE.)

**P4 — integrity cross-check.**
- For each (T, k) pair in §6, `delta = |S2_genesis(T,k) − S2_published(T,k)|`.
- **FALSIFIED** if `delta > 3·σ_bootstrap(T,k)` for **any** (T, k) pair —
  reported per-point, not just as a single pass/fail, so a reviewer can see
  exactly which point(s) failed if any do.
- **SUPPORTED_WITHIN_MODEL** if every pair is within band.
- **INCONCLUSIVE**: not applicable to P4 (a deterministic per-point
  comparison against a fixed published number; either within band or not).

## 9. Tautology Gate declaration (per component, before any computation)

Reused verbatim from `core/agent/tautologyGate.ts` (`assessTautology`,
unmodified) — no new Gate, no new dictionary:

- **P1, P2 "prediction" side** (Genesis's own recomputed `S2(k,T)` from raw
  `MeasuredStates`): `source: 'hypothesis-parameter'` — genuinely varies with
  which raw file/partition is fed in; not an analytic ceiling of any model.
- **P1, P2 "observation" side**: the raw `MeasuredStates` samples themselves
  are the empirical substrate; framed as `source: 'independent-measurement'`
  (`modelId: 'zenodo-2527010-brydges-measuredstates'`) since they are a real,
  independently-collected experimental record, not anything Genesis produced.
- **P3 "prediction" side**: `source: 'hypothesis-parameter'`
  (`modelId: 'state-preparation-label'`) — the expected purity ORDERING
  (pure > mixed) is fixed by how each file's underlying state was
  deliberately PREPARED before measurement, a real experimental fact
  independent of Genesis, and could in principle have come out the other way
  (a failed/mislabeled preparation) — this is exactly what makes it a
  genuine claim, not a tautology.
- **P3 "observation" side**: `source: 'independent-measurement'`
  (`modelId: 'zenodo-2527010-brydges-fig1a'`).
- **P4**: Genesis's own recomputed `S2` is the "prediction"
  (`hypothesis-parameter`, same model as P1/P2's estimator); the AUTHORS'
  published `RenyiEntropy_T_Xms.csv` value is the "observation"
  (`independent-measurement`, `modelId: 'zenodo-2527010-brydges-published-pipeline'`)
  — a genuinely separate processing pipeline (the authors', not Genesis's own
  code) over the same physical substrate, which is a real integrity/
  replication check, not circular, precisely because Genesis's own estimator
  code is never given the published number as an input.
- **Estimator algebra itself** (the cross-correlation formula, Hamming
  distance, `-log2`, purity-from-Bloch-vector identity): `model-invariant`
  where it appears as a standalone claim — but it never appears as a
  standalone TautologyComponent here, because it is always paired with a
  real independent-measurement observation per the components above. Overall
  classification for each of P1–P4 individually is computed by
  `assessTautology` from its declared component(s), expected to be
  `EMPIRICAL_TEST` for all four given the declarations above — reported
  as-computed, not assumed.

## 10. Explicit exclusions

`RenyiMutInfo_*.csv`, `RenyiTimeEvo_HalfPartition_Numerics.csv`, and any
`Numerical Simulation Unitary`/`Numerical Simulation incl. Dec` column inside
a `RenyiEntropy_T_Xms.csv`/`Purity_T_Xms.csv` file are **never** read as an
input to any Genesis prediction — reference/plotting context only, and only
even glanced at for the format-verification purpose described in the
disclosed-exception note above (§0), never for a numeric value used in a
verdict.

## 11. Preregistration fingerprint

Computed as `fnv1a(canonicalJson(this document's own §1–§10 content, as a
structured object))` by `scripts/qe4-preregistration-fingerprint.mjs` —
recorded in the analysis's provenance record once computed (see
`docs/QE4_EVIDENCE.md`, once the analysis is run).
