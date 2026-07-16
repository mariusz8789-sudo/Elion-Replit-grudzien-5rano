# Public API (`/api/v1`)

Genesis exposes a small, honest, versioned HTTP API for programmatic molecular analysis. It
returns **only real RDKit computations** — the same fail-closed contract as the product:
if RDKit is unavailable you get `BLOCKED_BY_RUNTIME`, never a fabricated value.

Implementation: `packages/backend/src/apiV1.mjs`.

> **Production note:** several deployment blockers apply before exposing this publicly —
> unauthenticated compute routes, IP-based rate limiting behind proxies, no CORS. See
> KNOWN_LIMITATIONS.md §2 and SECURITY.md. Treat `/api/v1` today as **beta / self-hosted**.

---

## Authentication
API-key auth via bearer token. Keys are provisioned automatically on Stripe checkout (see
COMMERCIALIZATION.md) or by an admin. Send:

```
Authorization: Bearer <api_key>
```

## Tiers & quotas
`API_TIERS = { free: 100, starter: 10_000, pro: 100_000 }` requests per month
(`store.mjs`). The monthly quota is the **real** per-client limit and is enforced per key.
(The per-IP limiter is best-effort and unreliable behind proxies — see SECURITY.md.)

## Endpoints

### `POST /api/v1/analyze`
Molecular properties + InChIKey.
```jsonc
// request
{ "smiles": "CC(=O)Oc1ccccc1C(=O)O" }
// response (shape)
{ "ok": true, "computed_by": "RDKit <version>",
  "data": { "molWt": 180.16, "logP": 1.31, "tpsa": 63.6, "hbd": 1, "hba": 3,
            "lipinskiViolations": 0, "inchiKey": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N", ... } }
```

### `POST /api/v1/render/2d`
2D depiction as SVG. `{ "smiles": "..." }` → `{ svg }`.

### `POST /api/v1/render/3d`
3D atom coordinates (Å) + bonds (ETKDGv3, seeded → deterministic). `{ "smiles": "..." }` →
`{ atoms, bonds }`.

## Error contract
- `400` invalid SMILES — explicit parse error.
- `401` missing/invalid API key.
- `429` monthly quota exceeded (tier limit).
- Body may carry `error: "BLOCKED_BY_RUNTIME"` when the RDKit engine is unavailable — the
  API **fails closed** rather than returning a guessed value.

## What the API will never return
Biological activity, efficacy, toxicity, IC50/LD50/hERG, PK, or any prediction of
experimental outcome. It returns physicochemical descriptors only. (See SCIENTIFIC_ENGINE.md.)

## Internal / product endpoints (not the public contract)
The product screens use authenticated, session-based routes (`/api/science/*`,
`/api/account/*`, `/api/billing/*`) that are **not** part of the versioned public API and may
change. `docs/API_REFERENCE.md` documents the broader internal surface.
