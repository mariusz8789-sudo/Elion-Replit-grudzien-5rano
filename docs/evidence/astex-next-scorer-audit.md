# Astex - audit of the next ranking step (independent / CNN rescorer)

**AUDIT AND PLAN ONLY. NOTHING WAS INTEGRATED, NOTHING WAS INSTALLED INTO THE PROJECT, NO BENCHMARK WAS RUN.**

No dependency was added to any manifest. `packages/backend/src/compute/dock_worker.py` and every
`scripts/astex-*.py` file are untouched. No rescoring run over the 85 cases was started. Everything
installed for this audit lives in a throwaway directory, `/tmp/claude-0/gnina-audit`, outside the
repository. Runs 1-6 and all preregistrations are unchanged.

What *was* done: the candidate scorers were downloaded outside the repo, made to run, and timed on
real run-6 poses. The numbers below marked MEASURED are wall-clock measurements taken in this
container on 2026-09-28. The numbers marked ESTIMATE are arithmetic on those measurements and say so.

---

## 0. The licence finding, stated first because it is decision-grade

**GNINA's distributed binary is effectively GPL.** The gnina repository has no top-level licence
file at all - `LICENSE`, `LICENSE.md`, `LICENSE.txt` and `COPYING` all return 404 on
`raw.githubusercontent.com/gnina/gnina/master/`. The only licence statement is in `README.md`:

> gnina is dual licensed under GPL and Apache. The GPL license is necessitated by the use of
> OpenBabel (which is GPL licensed). In order to use gnina under the Apache license only, all
> references to OpenBabel must be removed from the source code.

So the Apache option is theoretical: it applies only to a build with OpenBabel stripped out, which
is not the build anyone uses and not the prebuilt binary. **The v1.3 release binary is a GPL-2.0
work.**

What that permits, concretely:

- **Grant submission: yes, unreservedly.** Running GPL software to produce numbers, and citing it,
  creates no obligation of any kind. GPL-2.0 attaches to *distribution*, not to use.
- **Internal use to produce a benchmark result: yes.** Invoking the binary as an external
  executable, not linking it, is use.
- **Shipping it inside a commercial product: this is where it bites.** Bundling the binary, or
  linking against gnina/libmolgrid/OpenBabel, triggers GPL-2.0 copyleft on whatever the FSF and a
  court would consider the combined work. Invoking an unmodified, separately-obtained binary over a
  process boundary is the standard mitigation, but it is a position that needs a lawyer's sign-off,
  not an engineer's. **Do not assume the product can ship GNINA.**
- **Model weights.** The 40-odd TorchScript `.pt` model files are checked into the same repository
  (`gninasrc/lib/models/*.pt`) and compiled into the binary; there is no separate weights licence
  file, so they inherit the same ambiguous dual statement. **I could not verify the licence of the
  data those weights were trained on** (CrossDocked2020 and PDBbind derivatives; PDBbind's own terms
  are academic-use). That is an unverified gap, and for a commercial product it is the second thing
  a lawyer would ask about.

**ODDT (RF-Score, NNScore, PLECscore) is BSD 3-clause** - `LICENSE`, "Copyright (c) 2014, Maciej
Wójcikowski". Commercially clean. Its shipped descriptor tables are PDBbind-derived, so the same
academic-use question applies to the *training data*, though not to the code.

---

## 1. Can it be attached without breaking the pipeline?

**Yes, and it does not touch the docking path at all.** This is confirmed, not assumed.

The project already contains a pure-rescoring script that does exactly the shape of thing needed:
`scripts/astex-ranking-rule-select.py`. Its `score_case()` (lines 255-320) is the template. It:

1. runs `integrity_gate()`, which sha256-verifies every `docked.pdbqt` and `receptor.pdbqt` against
   what run 6 recorded, and never re-docks or repairs;
2. splits the stored multi-model PDBQT with `dock_worker.pose_models()`;
3. rebuilds the RDKit molecule with `meeko.RDKitMolCreate.from_pdbqt_mol`;
4. recomputes each pose's symmetry-aware RMSD and `dock_worker.pose_identity()` hash and refuses the
   case on any mismatch;
5. scores each pose at its stored coordinates.

A GNINA rescorer is a **new sibling script** that keeps steps 1-4 byte-for-byte and replaces only
step 5. Concretely:

| item | needed change |
|---|---|
| `packages/backend/src/compute/dock_worker.py` | **none.** Imported read-only for `pose_models()` and `pose_identity()`, exactly as phase 4 already does. |
| `scripts/astex-redock-topn-diagnostic.py` | **none.** It is a docking-side diagnostic; the rescorer never calls it and never re-docks. |
| docking pipeline | **none.** `Vina.dock()` and `Vina.optimize()` are never called. |
| new file | `scripts/astex-gnina-rescore.py` (new), plus its own preregistration JSON. |

**Inputs, and they are exactly what we already have on disk.** GNINA takes the rigid receptor PDBQT
directly - I passed `/tmp/claude-0/run6/work/<PDB>/seed42/receptor/receptor.pdbqt` unmodified and it
parsed. The only conversion required is on the ligand side: GNINA **rejects a multi-MODEL PDBQT**
("Parse error ... Unexpected multi-MODEL input. Use vina_split first?"), so each case's poses must be
written either as one file per pose or, better, as a single multi-molecule SDF. The SDF is produced
by the code path phase 4 already uses (`RDKitMolCreate.from_pdbqt_mol` then `Chem.SDWriter`), so no
new chemistry handling is introduced.

**A property worth more than it looks: GNINA does not need our grid box.** `--score_only` autoboxes
around each ligand. I scored 1GM8 - the single case phase 4 had to report UNAVAILABLE because a
pooled pose falls outside run 6's Vinardo grid - and **GNINA scored all 20 of its seed-42 poses
without complaint**. A GNINA experiment therefore has 85/85 availability and does not inherit phase
4's one structural loss.

For ODDT/RF-Score the answer is the same in kind: it is a pure Python function over an
`oddt.toolkit` protein and ligand, touching no docking code. It needs the receptor as **PDB**, not
PDBQT - `receptor_clean.pdb` is already written next to every case in the run-6 work tree - and the
ligand as SDF, via the same conversion.

---

## 2. Is it actually installable and runnable here?

**GNINA: YES. It is installed and running in this container right now, CPU-only, on real run-6
poses.** This was the outcome I least expected and it is the load-bearing finding of this audit.

The route that works, measured step by step:

- `github.com/gnina/gnina/releases/download/v1.3/gnina` is **reachable** through the proxy (the
  GitHub *API* is not - `api.github.com` returns 403 "not enabled for this session" - and
  `codeload.github.com` is 403, but the release-asset redirect to
  `release-assets.githubusercontent.com` goes through). Downloaded 1,277,859,864 bytes, matching the
  advertised `Content-Length` exactly. `raw.githubusercontent.com` also works, which is how the
  README, CMakeLists and a sample `.pt` weight file were read.
- **Building from source is not an option and does not need to be considered.** `CMakeLists.txt`
  line 2 is `project (gnina C CXX CUDA)` and line 38 is `find_package(CUDA 12.0 REQUIRED)`; the
  build also fetches libtorch from `download.pytorch.org`, which **is blocked here (curl exit 000)**,
  and libmolgrid from GitHub, and wants OpenBabel 3, protobuf, boost and a CUDA toolchain. On 4
  cores this is a multi-hour build that would fail at the libtorch fetch. Irrelevant, because:
- **The prebuilt binary runs.** Out of the box it fails with
  `error while loading shared libraries: libcudart.so.12`. `ldd` names seven missing CUDA libraries:
  `libcudart.so.12`, `libcusparse.so.12`, `libcufft.so.11`, `libnvToolsExt.so.1`, `libcublas.so.12`,
  `libcublasLt.so.12`, `libcusolver.so.11`. **Every one is a plain PyPI wheel**, needs no GPU and no
  NVIDIA driver:

  ```
  pip install nvidia-cuda-runtime-cu12 nvidia-cusparse-cu12 nvidia-cufft-cu12 \
              nvidia-cublas-cu12 nvidia-cusolver-cu12 "nvidia-nvtx-cu12==12.1.105"
  export LD_LIBRARY_PATH=<venv>/lib/python3.11/site-packages/nvidia/*/lib
  ```

  The `nvidia-nvtx-cu12` **version pin is required**: 12.9.79 ships `libnvtx3interop.so.1` and no
  longer ships `libnvToolsExt.so.1`, so the current version does not satisfy the binary. 12.1.105
  does.
- With that, `./gnina --version` prints `gnina v1.3 master:97fa6bc+ Built Oct 3 2024.` and
  `--score_only --no_gpu` works. `libcuda.so.1` (the driver library) is never needed.

**The weights are not a blocker, contrary to expectation.** GNINA's CNN models are not downloaded at
runtime from Zenodo or Hugging Face. They are TorchScript `.pt` files **checked into the git repo**
(`gninasrc/lib/CMakeLists` lists `lib/models/crossdock_default2018.pt`, `dense_1.3*.pt`,
`dense_1_3_PT_KD*.pt` and about forty others) and **compiled into the binary** by a `make_model_cpp.py`
step at build time. A prebuilt binary is self-contained: no network access is needed at scoring time.
I separately downloaded `crossdock_default2018.pt` (1,597,789 bytes) from `raw.githubusercontent.com`
to confirm the files are individually fetchable here if they were ever needed on their own.

**MEASURED smoke test.** Receptor `1G9V/seed42/receptor/receptor.pdbqt`, ligand = pose 1 of
`1G9V/seed42/dock/docked.pdbqt`, default CNN, `--no_gpu --cpu 4`:

```
Affinity:    -8.49694 (kcal/mol)
CNNscore:     0.21097
CNNaffinity:  4.37026
CNNvariance:  0.66203
```

Re-running the identical command reproduced all four numbers to the printed precision, so the
scorer is deterministic on fixed input - a precondition for a frozen protocol.

**One caveat about "the default".** I did not pass `--cnn`, and `--cnn default` is rejected
("Invalid model name: default"), so the built-in default has some other internal name that I could
not pin down from the source files reachable here (`gninasrc/lib/cnn_scorer.cpp` is 404 on raw).
It is definitely an *ensemble* - it reports `CNNvariance`, and it costs ~3.5x a single named model.
**A preregistration must pin an explicitly named model or `PREFIX_ensemble`, not "the default",**
because "whatever this binary defaults to" is not a reproducible specification.

**ODDT: YES, fully offline, but with two pins.** `pip install oddt` (0.7) fails under build isolation
(`ModuleNotFoundError: six`); it installs with `pip install --no-build-isolation oddt` after
`pip install six numpy scipy scikit-learn joblib pandas`. It then needs **`numpy<2`** - oddt 0.7 is
from 2019 and calls `np.in1d`, removed in NumPy 2. With those two pins it imports cleanly against
modern scikit-learn (1.9.1) using the **RDKit** backend, so no OpenBabel is needed.

Crucially, **the pretrained-model download problem does not arise**: ODDT ships the precomputed
PDBbind descriptor tables inside the wheel (`RFScore/rfscore_descs_v{1,2,3}.csv`,
`NNScore/nnscore_descs.csv`, 4.1 MB), so the scoring function is *trained locally from shipped data*.
**MEASURED:** `rfscore(version=1).train(pdbbind_version=2016)` completed in **20.4 s** on 4 cores,
entirely offline, reporting `Test R2 0.5502, Rp 0.7889, RMSE 1.4576`. No blocked host was contacted.

**Blocked hosts confirmed in this container:** `api.github.com` (403), `codeload.github.com` (403),
`download.pytorch.org` (no connection), `sourceforge.net` (403). **Reachable:**
`raw.githubusercontent.com`, `github.com/.../releases/download/...`, `files.pythonhosted.org`,
`pypi.org`, `conda.anaconda.org`. Disk used by the whole audit sandbox: **4.5 GB** of the ~28 GB free,
all under `/tmp/claude-0/gnina-audit`.

---

## 3. Compute cost - MEASURED, not estimated

All timings: this container, 4 cores, no GPU, `--no_gpu --cpu 4`, poses read from the real run-6
work tree, scored at stored coordinates.

| what | poses | wall time | per pose |
|---|---|---|---|
| GNINA, default ensemble, 1G9V | 20 | 9.07 s | 0.454 s |
| GNINA, default ensemble, 1S19 | 20 | 8.68 s | 0.434 s |
| GNINA, default ensemble, 1GM8 | 20 | 7.99 s | 0.400 s |
| GNINA, default ensemble, 1KZK | 19 | 8.02 s | 0.422 s |
| GNINA, single model `crossdock_default2018`, 1G9V | 20 | 2.39 s | 0.119 s |
| GNINA, one pose per process (1G9V) | 1 | 1.05 s | 0.6 s of that is process startup |
| RF-Score v1 (ODDT), 1G9V, single-threaded | 20 | 6.04 s | 0.302 s |

Cost is flat in receptor size (1GM8's receptor is 4x 1KZK's and scores no slower) and flat in ligand
size (24 to 41 heavy atoms, no trend), because the CNN grid is a fixed volume. That makes
extrapolation safe.

**ESTIMATE for the full job**, from those measurements. Run 6's deduplicated pool is **3991 poses**
across 85 cases (mean 46.95), stated in `astex-run6-multiseed-ensemble.md`. One GNINA process per
case amortises the ~0.6 s startup over ~47 poses, so:

- **GNINA, default ensemble: 3991 x 0.43 s + 85 x 0.6 s = 1716 + 51 s = ~30 minutes.**
- GNINA, single named model: 3991 x 0.12 s + 51 s = ~9 minutes.
- RF-Score v1, 4 processes in parallel: 3991 x 0.30 s / 4 = ~5 minutes.

Add PDBQT-to-SDF conversion and RMSD/hash re-verification, which phase 4 already does for the same
3991 poses and which is not the bottleneck. **Budget 1 hour of machine time for a GNINA rescore of
the whole pool, with 30 minutes as the central estimate.** This is not a day-long job. The cost of
this experiment is almost entirely the cost of writing and testing the harness, not of running it.

---

## 4. Licence

Covered in section 0 above, where it belongs. In one line each:

| | code licence | weights licence | commercial product | grant submission |
|---|---|---|---|---|
| GNINA 1.3 binary | GPL-2.0 in practice (README's Apache option requires stripping OpenBabel; no LICENSE file in repo) | same repo, no separate file, **training-data terms unverified** | **needs legal sign-off; do not assume** | yes |
| ODDT (RF-Score, NNScore, PLECscore) | BSD 3-clause | trained locally from BSD-shipped, PDBbind-derived CSVs | yes, subject to the PDBbind data question | yes |

---

## 5. One honest preregisterable experiment

**Proposal: `astex-gnina-rescore`, a single frozen rescore of the run-6 pooled poses.**

- **What gets rescored.** All 3991 poses of run 6's frozen, deduplicated pool, 85 cases, at their
  stored coordinates. Same integrity gate as phase 4: every `docked.pdbqt` and `receptor.pdbqt`
  sha256-verified against run 6, every pose's RMSD and identity hash recomputed and required to
  match. No docking, no minimisation, no pose movement. `--score_only` only; **`--minimize`,
  `--cnn_scoring refinement` and `--cnn_scoring all` are forbidden by the protocol** because they
  move poses and would make this a docking run.
- **The single fixed rule.** Rank each case's pool by `CNNscore` descending; the rank-1 pose is the
  prediction. One rule. Not a blend with Vina, not a blend with Vinardo, no weight to fit. One
  named CNN model or ensemble, pinned by name in the protocol together with the binary's sha256 and
  the `gnina --version` string. **No second candidate is evaluated.** If a second is ever wanted,
  it is a separate preregistration written after this result is in.
- **Frozen success criterion.** RMSD < 2.0 Å, symmetry-aware heavy-atom, no superposition.
  Denominator 85, always. No case excluded for any reason. Identical to runs 1-6.
- **Positive result:** top-1 >= 60/85. That is +7 over the frozen linear rule's 53 and beyond the
  4-case seed-to-seed spread that Vina alone shows, so it would be a real effect rather than noise.
- **Negative result:** top-1 <= 56/85. Within about one seed-spread of the 53 the frozen rule
  already achieves - meaning a pretrained 3D CNN buys nothing a linear blend of two empirical
  functions did not, and the ranking approach is exhausted. **57-59 is the declared grey band and is
  reported as "inconclusive", not spun as a win.**
- **Falsifiable prediction, recorded before the run:** top-1 will land in **54-62 of 85, centred
  near 58**. Reasoning: 80 of the 85 cases hold a native-like pose that some rule could rank first
  (81 with 1GM8, which GNINA can score - see section 6), GNINA's published Astex/CASF redocking
  advantage over Vina is of the order of 5-10 percentage points, and 10 points of 85 is 8.5 cases
  on top of Vina's pooled 50. It will **not** reach 69. I am predicting a real but insufficient
  gain. If it lands above 62 I was wrong and should say so.

**Why this is *less* contaminated than phase 4, explicitly.** Phase 4 evaluated four candidate rules
on the same 85 cases and kept the best, so its 53 carries selection optimism the document itself
estimates at 1-2 cases, and the winner had to be rescued by a preregistered "within one case, prefer
the simpler" tie-break. This experiment evaluates **one** rule, **once**, with a model whose
parameters were fitted by someone else, years ago, on CrossDocked2020 and PDBbind - not on our
poses, not on our pool, not to our metric, and with no knowledge that this run exists. There is
nothing to select over, so there is no maximum-of-several-noisy-estimates bias to correct: the
number that comes out is the number. That is a strictly weaker claim on the test set than phase 4
made, and therefore a stronger result.

**The one contamination that remains, stated plainly.** GNINA's training sets are PDBbind and
CrossDocked derivatives, and Astex Diverse Set complexes are in PDBbind. The model has very likely
seen some of these 85 structures. This is not fatal - it is the standard and disclosed condition of
every pretrained docking rescorer, and it is *far* weaker than fitting on the test set ourselves -
but it must be written into the preregistration and into any grant text, and it is a further reason
the resulting number cannot be quoted as prospective performance. The generalisation claim still
needs a separate, non-Astex, separately frozen run.

**Protocol hygiene, carried over from phase 4 unchanged:** preregistration JSON frozen and
fingerprinted before any score is computed, runner recomputes the fingerprint and refuses on drift,
pinned code sha256s verified, immutability of runs 1-6 re-checked, unit tests for the ranking rule
and the denominator. Additionally pin the **gnina binary sha256** and the **exact model name** -
without those the run is not reproducible, and "the default model" is not a specification.

---

## 6. Alternatives to GNINA - only what I actually checked

| scorer | installable here | licence | cost for 3991 poses | verdict |
|---|---|---|---|---|
| **GNINA 1.3 CNN** | **YES - measured, running now** (prebuilt binary + 6 CUDA runtime wheels, `nvidia-nvtx-cu12==12.1.105` pinned) | GPL-2.0 in practice | **~30 min (measured 0.43 s/pose)** | the strongest independent rescorer available here |
| **RF-Score v1/v2/v3 (ODDT)** | **YES - measured, trained and scored** (`--no-build-isolation`, `numpy<2`) | BSD 3-clause | **~5 min (measured 0.30 s/pose, 1 core)** | clean licence, but see below |
| **NNScore v2 (ODDT)** | imports cleanly; descriptors ship in the wheel, so training is offline. **I did not train or run it.** | BSD 3-clause | same order as RF-Score (ESTIMATE, same descriptor machinery) | unverified |
| **PLECscore (ODDT)** | imports; fetches its descriptor file from `raw.githubusercontent.com`, which is reachable. **I did not train or run it.** | BSD 3-clause | unmeasured | unverified |
| **libmolgrid + PyTorch, rolling our own CNN scorer** | **partially.** `molgrid` 0.5.5 has a manylinux wheel that installs and imports on CPU with no GPU (needs `numpy<2`), and gnina's TorchScript weights download individually from raw.githubusercontent. **But PyTorch cannot be installed:** `download.pytorch.org` is blocked, and PyPI's Linux torch wheel pulls ~4 GB of CUDA dependencies. And it would require reimplementing gnina's exact atom typing and grid construction. | Apache-2.0 / GPL-2.0 (molgrid is dual-listed on PyPI) | unmeasured | **do not do this.** All the risk of GNINA and none of the convenience. |
| building GNINA from source | **NO.** `find_package(CUDA 12.0 REQUIRED)`, plus a libtorch fetch from the blocked `download.pytorch.org` | - | - | ruled out |
| **Vinardo / AutoDock4 scoring** | already available in the installed Vina 1.2.7 | Apache-2.0 | minutes | already done in phase 4; exhausted |

**An honest warning about RF-Score**, since it is the licence-clean option and will look tempting.
RF-Score v1-v3 are **binding-affinity regressors**, trained to predict pKd for a single
crystallographic pose. In the CASF benchmarks their "docking power" - the ability to pick the right
pose out of decoys, which is exactly our problem - is well known to be poor, materially worse than
Vina's own scoring function. The smoke test is consistent with that: across 1G9V's 20 poses, RF-Score
v1 returned 6.33 to 7.04 pKd, a spread of 0.7 log units with no obvious structure, i.e. it barely
discriminates between poses at all. I am **not** reporting that as a result - it is one case and the
brief forbids a benchmark - but it is a reason not to expect RF-Score to close a 27-case ranking gap.
GNINA's CNN, by contrast, was trained with pose classification as an explicit objective (`CNNscore`
is literally P(pose is good)), which is why it is the right candidate despite the worse licence.

---

## The 81 vs 80 question - resolved

**Confirmed: the single difference is 1GM8, and nothing else differs.** Verified mechanically, not
from the prose. Comparing the per-case records of `astex-run6-multiseed-ensemble.json` and
`astex-ranking-rule-selection.json`:

- cases with `nativeLikeAvailable == true`: **81 in run 6, 80 in phase 4**;
- set difference, run 6 minus phase 4: **`{1GM8}`**; phase 4 minus run 6: **empty**;
- across all 85 cases, the only record that differs in pool size or best-RMSD-in-pool is 1GM8
  (run 6: pool 58, best 1.848 Å; phase 4: pool 0, best `null`). **Every other case matches exactly.**

The cause is as the coordinator described and as phase 4 documents: 1GM8's best pooled pose is
**1.848 Å, seed 2042, rank 8 within that seed, pooled rank 14** - genuinely native-like. Phase 4 had
to Vinardo-score every pose inside run 6's own frozen grid box, at least one pooled pose of 1GM8
extends past that box, and Vina refuses with *"The ligand is outside the grid box."* The protocol
then reports the case UNAVAILABLE rather than re-docking or repairing it, and counts it as a top-1
failure for all four rules alike. Phase 4's 80 is therefore not a different measurement of the
ceiling; it is 81 with one case conservatively withheld because the *scorer* could not reach it.

**The correct number to quote for the sampling ceiling is 81/85.** The ceiling is a property of the
pose pool - "does a native-like pose exist anywhere in the frozen pool" - and for 1GM8 one
demonstrably does, at 1.848 Å. 80/85 is a property of *phase 4's Vinardo scoring step*, not of the
sampling. Two consequences follow:

- **When describing sampling**, in a grant or anywhere else, say **81/85**, and state that the four
  hard sampling failures are 1HVY, 1Q41, 1T9B and 1W1P. If the raw union before deduplication is
  ever cited, that is 83/85, and deduplication's 2-case cost (1HVY, 1W1P) must be stated with it.
- **When describing what a rule achieved**, 80/85 remains the honest cap *for phase 4 specifically*,
  because that rule could not score 1GM8. It is a limit of that experiment, not of the data.
- **A GNINA experiment would face neither limit.** `--score_only` autoboxes per ligand, needs no
  grid box, and I verified it scores all 20 of 1GM8's seed-42 poses without error. Its cap is the
  full **81/85**.

---

## Recommendation: **TEST GNINA**

One recommendation, and it is not the one I expected to give when the brief warned that the weights
would be the blocker. They are not. The binary runs on this CPU-only container today, the weights
are baked into it, and a full rescore of all 3991 pooled poses is **half an hour of machine time**,
measured, not guessed.

Why this and not STOP:

- **The experiment is cheap and the harness is mostly written.** `astex-ranking-rule-select.py`
  already does the integrity gate, the pose splitting, the RMSD re-verification and the per-case
  accounting over exactly these 3991 poses. The new work is a subprocess call, a PDBQT-to-SDF
  conversion using a code path that already exists, and a preregistration JSON.
- **It is the cleanest experiment this project has been able to run.** One rule, one model, one
  evaluation, no tuning, no candidate list, no tie-break. It is strictly less contaminated than
  phase 4, and it is the only remaining step that can be described as honest science rather than as
  fitting.
- **It resolves the question either way.** Phase 4 established that reweighting Vina against
  Vinardo cannot close the gap and named "a rescoring model that is not a linear blend of these two"
  as the only remaining direction. GNINA is exactly that model, and it is the obvious one a reviewer
  will ask about. Running it and reporting 56/85 is a publishable, defensible closing of the line of
  enquiry. Not running it leaves the obvious question open.

Why it is not a plan to reach 69:

- **I predict 54-62, centred near 58.** That is three to eight cases, most likely around five. It
  will not reach 69, and the preregistration should say so before the run, not after. If five cases
  is not worth a day to you, the honest move is STOP, and STOP is defensible on the phase 4 evidence
  alone. But five cases costs half a day here, not a week.

**Time to a result: 4 to 6 hours.** Roughly 2.5-4 h to write `scripts/astex-gnina-rescore.py` and
its unit tests, reusing phase 4's gate and accounting; ~0.5 h to write and freeze the
preregistration; **~0.5 h of measured compute**; ~1 h to write the evidence document. The single
largest risk to that estimate is not compute - it is pinning the CNN model name, since `--cnn default`
is rejected and the default ensemble's internal name could not be determined from the sources
reachable here. Budget an extra hour for that, or sidestep it entirely by pinning a named model such
as `crossdock_default2018` or a `PREFIX_ensemble`, which also makes the run three times faster.

**What I could not verify, stated plainly:** the exact identity of GNINA's built-in default CNN
ensemble; the licence of the data GNINA's weights were trained on; whether NNScore or PLECscore
actually run here (they import; I did not execute them); and anything at all about how well GNINA
ranks these poses - no accuracy measurement of any kind was made, by design.
