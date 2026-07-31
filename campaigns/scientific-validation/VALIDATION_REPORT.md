# Genesis Scientific Validation Report

**Version:** genesis-scientific-validation-suite/1 · **Generated:** (run timestamp omitted for deterministic hashing) · **Overall readiness:** MEDIUM (0.7493)

## Benchmark metrics
| metric | value | status | label_provenance |
| --- | --- | --- | --- |
| descriptor_MAE_gmol | 0.000 | COMPLETED | DETERMINISTIC_CHEMISTRY |
| descriptor_pearson_r | 1.000 | COMPLETED |  |
| reproducibility_rate | 1.000 | COMPLETED |  |
| truth_accuracy | 1.000 | COMPLETED | SOFTWARE_EXPECTATION |
| truth_consistency | 1.000 | COMPLETED |  |
| mcre_accuracy | 1.000 | COMPLETED | SOFTWARE_EXPECTATION |
| mcre_consistency | 1.000 | COMPLETED |  |
| recovery_roc_auc | 1.000 | COMPLETED | COMPUTATIONAL_CRITERION |
| recovery_precision | 1.000 | COMPLETED |  |
| recovery_recall | 1.000 | COMPLETED |  |

## Descriptor correctness
| molecule | formula | reference_MW | RDKit_MW | abs_error | within_tol |
| --- | --- | --- | --- | --- | --- |
| water | H2O | 18.015 | 18.015 | 0 | true |
| methanol | CH4O | 32.042 | 32.042 | 0 | true |
| ethanol | C2H6O | 46.069 | 46.069 | 0 | true |
| acetic acid | C2H4O2 | 60.052 | 60.052 | 0 | true |
| benzene | C6H6 | 78.114 | 78.114 | 0 | true |
| toluene | C7H8 | 92.141 | 92.141 | 0 | true |
| phenol | C6H6O | 94.113 | 94.113 | 0 | true |
| aspirin | C9H8O4 | 180.159 | 180.159 | 0 | true |
| paracetamol | C8H9NO2 | 151.165 | 151.165 | 0 | true |
| ibuprofen | C13H18O2 | 206.285 | 206.285 | 0 | true |
| caffeine | C8H10N4O2 | 194.194 | 194.194 | 0 | true |
| naproxen | C14H14O3 | 230.263 | 230.263 | 0 | true |
| glucose | C6H12O6 | 180.156 | 180.156 | 0 | true |

## Readiness
- **research**: HIGH (0.95) — descriptor correctness pass=true (MAE 0 g/mol)
- **biotech**: MEDIUM (0.6183) — real engines executed: RDKit, TruthEngine, MCRE, AutoDock Vina
- **pharma**: MEDIUM (0.55) — provenance integrity verified (hash recomputes)
- **grant**: HIGH (0.9) — reproducible, provenance-hashed validation with auto-generated methodology + figures + tables
- **investor**: MEDIUM (0.728) — quantified, reproducible benchmark metrics (not claims): descriptor MAE, reproducibility, recovery, Truth/MCRE accuracy

## Honest verdict
Genesis is a **scientifically validated computational** discovery platform: its descriptor, ranking,
Truth-Engine, and MCRE machinery are reproducible and measurably correct. It has **not** performed
biological or clinical validation, and did **not** discover a drug. Remaining gaps are external
(laboratory validation, live scientific data) — Genesis V3.
