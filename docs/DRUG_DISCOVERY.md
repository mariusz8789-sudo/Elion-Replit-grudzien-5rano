# Genesis Lab — Drug Discovery (computational foundation)

A real, auditable computational drug-discovery workflow built on the Backend
Compute Engine, Scientific Runs, Model Registry, and RBAC/persistence. **Not** a
fake AI drug dashboard — it computes only real chemistry and makes every missing
capability visible.

## Workflow
```
TARGET → CANDIDATE LIBRARY → VALIDATION → COMPUTATIONAL SCORING
→ CAPABILITY GAPS → RANKING → MEASUREMENT RECOMMENDATIONS → LAB VALIDATION
```

## Data model (persisted, project-scoped, RBAC)
- **Target**: name, type, gene/protein, organism, indication, mechanism,
  constraints, evidence status, provenance.
- **Candidate**: label, formula, SMILES (optional), composition, molecular weight,
  charge, lineage/parent, generation method, provenance. On create, the formula
  is parsed and MW + composition are computed (invalid formula → rejected, never
  stored with a guessed value).

## Candidate Passport
`GET /api/projects/:id/candidates/:cid/passport` returns:
calculated properties (MW, atom count, degree of unsaturation, with run IDs) ·
score components tagged `calculated` vs `heuristic` · **visible capability gaps**
· MCRE-ready conflicts · measurement recommendations · required lab validation ·
uncertainty · honest verdict.

Never returns "drug discovered / safe / effective". Always: *computational
candidate — meets implemented model criteria; requires laboratory validation.*

## Ranking
`GET /api/projects/:id/candidates/ranking` — transparent decomposition over only
the implemented heuristics (Lipinski MW term + chemistry completeness). Missing
capabilities stay visible per candidate; no invented neutral values; carries a
note that ranking does not reflect efficacy or safety.

## API
- `GET/POST /api/projects/:id/targets`
- `GET/POST /api/projects/:id/candidates` (`?targetId=`)
- `GET /api/projects/:id/candidates/:cid/passport`
- `GET /api/projects/:id/candidates/ranking`
- `GET /api/compute/capabilities`

## UI
`#/drug` — login-gated workspace: pick project → define target → add candidates
(real MW) → inspect passport (properties, score components, **CAPABILITY GAP
DETECTED**, measurement recommendations, required lab validation) → ranking →
capability manifest.

## What is NOT implemented (and never faked)
docking, molecular dynamics, quantum chemistry, ADMET, toxicity, protein
structure prediction, generative de-novo, logP. See `CAPABILITY_MANIFEST.md`
and `compute/capabilities.mjs` — each declares the adapter interface and the
external engine/data it needs.
