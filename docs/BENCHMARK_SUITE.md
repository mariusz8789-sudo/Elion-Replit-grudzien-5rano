# Benchmark & Reproducibility Suite

Real, executable benchmarks for every heavy scientific engine registered in
Genesis (`docs/HEAVY_ENGINES.md`). Run it with:

```bash
npm run benchmark                    # full suite, human-readable
npm run benchmark -- rdkit pyscf     # subset, fast local iteration
npm run benchmark -- --json          # full machine-readable report to stdout
npm run benchmark -- --out report.json
```

Source: `packages/backend/src/benchmark/` (`stats.mjs`, `rdkitBenchmark.mjs`,
`qmBenchmark.mjs`, `mdBenchmark.mjs`, `admetBenchmark.mjs`,
`dockingBenchmark.mjs`, `proteinBenchmark.mjs`, `runner.mjs`). Tests:
`packages/backend/src/benchmarkSuite.test.mjs`.

## Why the ground truth is never an external dataset

This runtime's network egress is restricted to an explicit allowlist
(package registries, the Anthropic API). Every external scientific data
host tested during this milestone's construction — RCSB PDB, PDBbind,
Harvard Dataverse, the TDC (Therapeutics Data Commons) raw-data mirror,
EBI FTP, the AlphaFold DB, NCBI E-utilities, ExPASy — returned unreachable
(HTTP 403 or connection timeout). Downloading a held-out benchmark dataset
and scoring Genesis against it is therefore not possible from this
environment, today.

Rather than fabricate a "benchmark" against numbers that were never
actually downloaded and compared (which the platform's constitution
explicitly forbids), every ground truth in this suite is one of three
honest kinds:

1. **Exact deterministic arithmetic** — e.g. molecular weight computed
   independently from IUPAC standard atomic weights and RDKit's own
   reported molecular formula. No external number needed; the "expected"
   value is derived by code, not recalled.
2. **A physical or mathematical invariant that MUST hold for any correct
   implementation** — the variational principle (enlarging a basis set
   cannot raise the Hartree–Fock energy), translation/permutation
   invariance of a vacuum single-point energy, energy conservation in an
   NVE (Verlet, no thermostat) molecular-dynamics trajectory, canonical-SMILES
   idempotence, structural counts that are exact by construction (a PDB
   fixture this suite authored itself).
3. **A vendor's own published metric, explicitly labeled
   "publisher-reported"** — e.g. ADMET-AI's per-endpoint TDC ADMET
   Benchmark Group AUROC/R² values, bundled with the installed model and
   surfaced as-is. These are never presented as independently reproduced
   by Genesis, because the held-out TDC test data needed to reproduce them
   is unreachable from this runtime.

Whenever a check genuinely cannot be performed this way (canonical
protein-ligand affinity accuracy needs an experimental co-crystal set,
e.g. PDBbind), the suite reports `BLOCKED_BY_RESOURCES` with the exact
reason — never an invented number.

## Per-engine coverage

| Engine | Cases | Ground truth |
| --- | --- | --- |
| RDKit | MW-vs-formula consistency (10 molecules), canonicalization idempotence, SMILES-equivalence isomorphism, determinism | Exact atomic-weight arithmetic + structural invariants |
| PySCF | H2 literature anchor, variational principle (STO-3G vs 6-31G), translation invariance, permutation invariance | Physical/mathematical invariants + one reused literature value |
| OpenMM | NVE energy conservation, force-field-evaluation determinism (tight relative tolerance), reused minimization+NVT reference case | Energy conservation (physical law) + measured determinism |
| ADMET-AI | Reference case, endpoint-catalog completeness (52/52), prediction determinism, publisher-reported TDC metrics | Determinism + catalog completeness + labeled publisher metrics |
| AutoDock Vina + Meeko | Reference case, seeded determinism, search-effort monotonicity; affinity-accuracy vs. experimental is BLOCKED_BY_RESOURCES | Determinism + a docking-quality invariant; honest gap for accuracy |
| Biopython | Reference case, parse determinism, three exact-by-construction PDB fixtures (chains/residues, hetero/water, multi-model) | Exact-by-construction structural counts |

## A real finding surfaced while building this suite

Building the OpenMM determinism case turned up a genuine, worth-documenting
result: **energy-minimized configurations of a disordered TIP3P water box
are NOT bit-exact reproducible** across nominally identical runs, even
single-threaded. Measured directly: an unminimized single-point energy
evaluation IS reproducible to ~1e-8 relative (small residual floating-point
noise, traced to PME's reciprocal-space FFT), but after 200 iterations of
`LocalEnergyMinimizer`, that same sub-part-per-billion difference can steer
the optimizer into a different local minimum of a landscape with many
near-degenerate configurations — producing total-energy differences of
tens of kJ/mol between runs. This is a well-known property of
high-dimensional minimization on rugged/glassy landscapes, not an OpenMM
bug. The benchmark therefore tests force-field-evaluation determinism (true
and tight) rather than asserting minimized-trajectory reproducibility
(which would be a fabricated claim). See `mdBenchmark.mjs`'s module
docstring for the full account.

## Statistics

`benchmark/stats.mjs` provides `mean`, `rmse`, `mae`, `pearsonR`,
`accuracy`, `successRate`, `reproducibilityRate` — pure functions, no
engine dependency, unit-tested independently of any adapter.

## Reproducibility hash

`runBenchmarkSuite()` returns a `contentHash` (SHA-256) computed over the
per-case results and summary with all wall-clock `runtimeMs` fields
stripped first, so two runs against an unchanged engine on unchanged
inputs hash identically — a first building block toward the Scientific
Reproducibility milestone (provenance, seeds, environment snapshot).
