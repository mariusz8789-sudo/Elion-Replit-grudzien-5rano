# Genesis Lab — Truth Map (what is real, partial, illustrative, not implemented)

Honest classification of every major capability. Verified by executed reference
tests, not by test count alone.

## Legend
- **REAL** — deterministic, textbook-accurate, tested against reference values.
- **PARTIAL** — real physics core + simplified assumptions and/or visual layer.
- **ILLUSTRATIVE** — visual/educational; no rigorous numeric engine by design.
- **NOT IMPLEMENTED** — declared, honestly absent; no fabricated output.
- **EXTERNAL ENGINE REQUIRED** — needs an external scientific engine/data.

## Labs (client-side simulations)
| Lab | Class | Basis |
|---|---|---|
| Nuclear | REAL | SEMF binding energy (`physics.ts:semfBindingEnergy`) |
| Space-Time | REAL | Lorentz γ / time dilation |
| Atom | REAL | Bohr levels + real periodic data |
| Mathematics | REAL | erf/Gaussian, Lorenz ODE, logistic chaos |
| Universe | REAL (+viz) | Kepler solver, atmospheric escape; galaxy/dark-matter scenes simplified |
| Einstein | PARTIAL | Schwarzschild r_s, ISCO, chirp mass real; lensing/beaming shaders visual |
| Quantum | PARTIAL | double-slit probability, CHSH, Bloch state real; teleportation illustrative |
| Chemistry | PARTIAL | Arrhenius, titration, Ising Monte-Carlo real; VSEPR geometric |
| Particle | PARTIAL | CMS Open Data + relativistic energy real; detector 3D visual |
| Civilization | PARTIAL | Kardashev + logistic real; Drake interpretive |
| Biology | PARTIAL | protein HP-lattice + logistic real; DNA helix visual |
| Multiverse | ILLUSTRATIVE | varying-constants visuals; not ModelGraph-backed |
| AI Discovery | ILLUSTRATIVE | LLM/narrative; no numeric engine |

## Backend compute models (server-side, REAL)
`nuclear-semf`, `atom-bohr`, `sr-lorentz`, `universe-kepler`,
`universe-atmospheric-escape`, `particle-relativistic-energy`,
`chemistry-arrhenius`, `math-gaussian`, `biology-logistic`,
`einstein-schwarzschild`, `einstein-chirp-mass`, `civilization-kardashev`,
`chem-molecular-weight` — all deterministic, tested against reference values.

## Drug discovery capabilities
| Capability | Class |
|---|---|
| Molecular weight / composition (formula) | REAL |
| Formula validation | REAL |
| Degree of unsaturation | REAL |
| Molecular descriptors from SMILES (RDKit) | REAL when RDKit installed, else BLOCKED_BY_RUNTIME |
| logP (Crippen, RDKit) | REAL when RDKit installed, else BLOCKED_BY_RUNTIME |
| Full Lipinski Ro5 (RDKit) | REAL when RDKit installed, else BLOCKED_BY_RUNTIME |
| SMILES structure validation (RDKit) | REAL when RDKit installed, else BLOCKED_BY_RUNTIME |
| Molecular docking | EXTERNAL ENGINE REQUIRED |
| Molecular dynamics | EXTERNAL ENGINE REQUIRED |
| Quantum chemistry (DFT/ab initio) | EXTERNAL ENGINE REQUIRED |
| ADMET | EXTERNAL ENGINE REQUIRED |
| Toxicity prediction | EXTERNAL ENGINE REQUIRED |
| Protein structure prediction | EXTERNAL ENGINE REQUIRED |
| Generative de-novo design | NOT IMPLEMENTED |

## Hard rules (enforced in code)
- No fabricated docking / ADMET / toxicity / binding / IC50 / BBB / efficacy.
- Missing capability → **CAPABILITY GAP DETECTED**, never a neutral guess.
- Never "drug discovered / safe / effective". Only "computational candidate —
  meets implemented model criteria; requires laboratory validation".
