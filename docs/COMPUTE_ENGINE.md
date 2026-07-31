# Genesis Lab — Backend Compute Engine

Server-side, deterministic scientific computation. Resolves the audit finding
that all science previously ran only client-side.

## Where it lives
- `packages/frontend/src/core/compute/serverEntry.ts` — curated **single source**
  of pure formulas (re-exports `physics.ts`, `ModelGraph`, graph builders,
  `cheminformatics.ts`).
- `packages/backend/src/compute/core.bundle.mjs` — **generated** by esbuild from
  `serverEntry.ts` (`npm run compute:bundle`). The server executes this, so it
  runs the *identical* code the browser runs.
- `packages/backend/src/compute/registry.mjs` — model registry (metadata + execute).
- `packages/backend/src/compute/engine.mjs` — `runModel()`, validation, run schema.
- `packages/backend/src/compute/capabilities.mjs` — capability manifest.
- `packages/backend/src/compute/drugDiscovery.mjs` — candidate passport + ranking.

## No scientific logic drift
The backend never re-implements a formula. `npm run compute:bundle:check`
regenerates the bundle and byte-compares it to the committed file; the
verification gate fails if `serverEntry.ts` changed without regenerating. Result:
frontend and backend cannot silently diverge.

## Determinism & seeds
All current models are deterministic (no RNG); `seed` is recorded in every run
for reproducibility and passed through to `execute()`. Stochastic models (future)
declare `stochastic: true` and honour the seed — the contract is already in place.

## API
- `GET /api/compute/models` — list registry (public)
- `GET /api/compute/models/:id` — one model's metadata (public)
- `GET /api/compute/capabilities` — capability manifest (public)
- `POST /api/compute/run` — `{ modelId, inputs, seed?, projectId? }` → `{ run, persisted }`.
  Ephemeral by default; persisted to a project when `projectId` + editor+ role.
- `GET /api/projects/:id/runs` — audit trail of persisted runs (viewer+).

## Verification
`npm run test --workspace=packages/backend` — reference values with tolerances
(see `compute.test.mjs`, `cheminformatics.test.mjs`), validation, provenance,
persistence, RBAC. Reference cases: SEMF Fe-56 8.896 MeV/n, Bohr −13.606 eV,
γ(0.8c)=1.6667, Kepler 1.0 yr, escape 11.19 km/s, Schwarzschild 2953 m, chirp
26.1 M☉, aspirin 180.16 g/mol.
