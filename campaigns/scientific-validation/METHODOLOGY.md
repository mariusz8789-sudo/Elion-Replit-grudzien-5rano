# Methodology — Genesis Scientific Validation Suite

**Suite version:** genesis-scientific-validation-suite/1 · **Generated:** (run timestamp omitted for deterministic hashing)
**Engines:** RDKit 2026.03.3, ADMET-AI 2.0.1, Vina 1.2.7

## Descriptor correctness
RDKit molecular-weight descriptors were compared against reference molecular weights computed from
molecular formulae and IUPAC conventional atomic weights (first principles). Agreement is reported as
MAE, max absolute error, and Pearson correlation over 13 public-domain
reference molecules. Tolerance: 0.6 g/mol.

## Reproducibility
Each measured pipeline was executed 3 times; results
were canonically hashed (SHA-256 over key-sorted JSON) and required to be bit-identical.

## Known-item recovery
A labelled set (label provenance: **COMPUTATIONAL_CRITERION**, criterion: curated small-molecule drug set (aspirin/ibuprofen/caffeine/paracetamol/naproxen) vs simple non-drug molecules) was ranked and scored with
precision, recall, F1, precision/recall@K (K∈{1,5,10}), enrichment factor, and ROC-AUC (Mann–Whitney).
Biological known-active recovery requires EXPERIMENTAL labels; where absent it is reported as such.

## Truth Engine & MCRE
Decision accuracy was measured against defined software-behaviour expectations; consistency was
measured as bit-identical decisions across repeated runs.

## Honesty
No metric is fabricated. Unavailable capabilities/data are reported as BLOCKED_BY_RUNTIME /
BLOCKED_BY_RESOURCES. Computational results are not experimental validation.
