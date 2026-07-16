# Scientific Engine

How Genesis turns a SMILES string into a trustworthy report — and, just as importantly,
what it refuses to claim. Every statement in the product is one of four kinds:

| Tag | Meaning | Example |
|-----|---------|---------|
| ✓ **VERIFIED** | Real computation by a real engine | MW 180.16 g/mol (RDKit `Descriptors.MolWt`) |
| ⚠ **GROUNDED** | Deterministic rule applied to verified values | "Ro5-compliant → oral drug-like profile" |
| ⓘ **GENERAL** | Standard scientific knowledge, molecule-independent | "Structural alert X warrants expert review" |
| ✕ **UNKNOWN** | Not computable from structure — never predicted | biological activity, toxicity, PK |

Nothing is displayed without a tag. Genesis **never** presents a GROUNDED interpretation
as a VERIFIED fact, and **never** predicts an UNKNOWN.

---

## 1. The computational core (VERIFIED)

**Engine:** RDKit 2026.03.3, invoked as a short-lived Python subprocess.

- Worker: `packages/backend/src/compute/rdkit_worker.py`
- Node adapter: `packages/backend/src/compute/rdkitAdapter.mjs` (`execFileSync`, fails
  closed → `BLOCKED_BY_RUNTIME` if RDKit is unavailable; **no fabricated fallback**).

Descriptors computed (all genuine RDKit calls):

| Descriptor | RDKit call | Confidence |
|-----------|-----------|-----------|
| Molecular weight | `Descriptors.MolWt` | HIGH (exact) |
| Exact mass | `Descriptors.ExactMolWt` | HIGH |
| LogP | `Crippen.MolLogP` (Wildman–Crippen 1999) | **MEDIUM (~±0.5)** |
| TPSA | `Descriptors.TPSA` (Ertl 2000) | HIGH¹ |
| H-bond donors / acceptors | `Lipinski.NumHDonors` / `NumHAcceptors` | HIGH |
| Rotatable bonds, rings | `Descriptors.NumRotatableBonds`, `CalcNumAromaticRings` | HIGH |
| Molecular formula | `rdMolDescriptors.CalcMolFormula` | HIGH |
| InChIKey | `MolToInchi → InchiToInchiKey` | HIGH (canonical) |
| Structural alerts | PAINS / BRENK catalogs | HIGH |
| Synthetic accessibility | SA_Score | MEDIUM (heuristic) |

¹ **Caveat:** RDKit's default TPSA omits sulfur/phosphorus polar area (`includeSandP=False`).
S/P-containing molecules get an underestimated TPSA. See KNOWN_LIMITATIONS.md §1.

Other real engines available in the platform (not required by the product workflow):
ADMET-AI 2.0.1 and AutoDock Vina, each via the same fail-closed subprocess pattern.

---

## 2. The interpretation layer (GROUNDED)

Rule-based, deterministic readings of verified values. No AI, no new computation.

- `packages/frontend/src/core/moleculeInterpretation.ts` — Lipinski / LogP / TPSA / H-bond
  practical notes. Each note is a factual consequence of a verified value.
- `packages/frontend/src/core/scientificDecision.ts` — the Scientific Decision Report:
  what is VERIFIED, what looks PROMISING, what is UNKNOWN, what REQUIRES VALIDATION, and
  what to do NEXT. Enumerates removed claims and scientific limitations explicitly.

### Developability score (physicochemical triage — NOT efficacy)
`packages/frontend/src/core/moleculeComparison.ts`. A transparent 0–100 score; **every
point is attributed to a named rule with a reason**:

| Component | Max | Rule (standard med-chem heuristics) |
|-----------|-----|------|
| Lipinski (Ro5) | 25 | MW≤500, LogP≤5, HBD≤5, HBA≤10 |
| Lipophilicity | 25 | ideal LogP 1–3, acceptable 0–5 |
| Polar surface area | 20 | oral-favourable TPSA 20–90, acceptable ≤140 |
| H-bonding | 15 | HBD≤5 and HBA≤10 |
| Molecular weight | 15 | favourable 250–500 |
| Structural alerts | −24 | −8 per alert |

The verdict (`decisionFor`) is a pure physicochemical triage:
`CONTINUE` / `NEEDS_EXPERIMENTS` / `HIGH_UNCERTAINTY` / `REJECT`. REJECT fires only on hard
liabilities (≥2 Ro5 violations, LogP>6, MW>700). **Every path appends "Experimental
validation required."** The thresholds are conventional and correctly applied — not novel,
not a predictive model.

---

## 3. What is never computed (UNKNOWN)

Genesis does **not** predict, estimate, or imply: biological activity, molecular target,
mechanism of action, efficacy, potency (IC50/EC50), toxicity, hERG, LD50, solubility (as a
measured value), permeability, oral bioavailability, PK, or metabolism. These are declared
UNKNOWN in the decision report and can only be resolved by experiment.

---

## 4. Reproducibility

- Scalar descriptors are fully deterministic (verified byte-identical across runs).
- 3D embedding uses `ETKDGv3` with a fixed `randomSeed` → deterministic-seeded coordinates.
- Each report carries an **Analysis Hash** (SHA-256, see PROVENANCE.md); same molecule +
  same RDKit version → same hash, so a second scientist can confirm the run.
- Reproducibility is **version-scoped**: a different RDKit release could shift LogP/TPSA and
  therefore the hash. This is honest and by design — the RDKit version is part of the hash
  input and is printed on every report.

See also: GROUNDING.md (the AI guardrail), PROVENANCE.md (metadata + hashing),
KNOWN_LIMITATIONS.md (every caveat, undiluted).
