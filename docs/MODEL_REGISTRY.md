# Genesis Lab — Scientific Model Registry

`packages/backend/src/compute/registry.mjs`. Every model exposes: `id`, `name`,
`domain`, `version`, `description`, `inputs` (id/label/unit/range/type/default),
`outputs` (id/label/unit), `assumptions`, `validity`, `deterministic`,
`provenance` (source/formula/honesty), `backendExecutable`.

Two kinds behind one `execute(inputs) → { outputs, warnings }`:
- **graph** — an executable `ModelGraph` builder;
- **function** — a pure `physics.ts` / cheminformatics function.

Models may declare a `validate(values)` hook for domain constraints (e.g. formula
validity) → rejected rather than a fabricated result.

## Models
nuclear-semf · atom-bohr · sr-lorentz · universe-kepler ·
universe-atmospheric-escape · particle-relativistic-energy · chemistry-arrhenius ·
math-gaussian · biology-logistic · einstein-schwarzschild · einstein-chirp-mass ·
civilization-kardashev · chem-molecular-weight.

`GET /api/compute/models` · `GET /api/compute/models/:id`.
