# Known Limitations

> This document is deliberately blunt. It is the output of an internal engineering +
> scientific audit (CTO / software-architect / investor / grant-reviewer lenses) run
> against the actual code, not the marketing. Nothing here is hidden. If you are a
> grant reviewer, investor, or laboratory evaluating Genesis, **read this first.**

Last audit: 2026-07 · Branch `claude/genesis-takeover-audit-kpz019`.

---

## 0. The single most important thing to understand

Genesis is **three products in one repository**:

1. **A science-education / simulation platform** ("Genesis OS") — 68 files under
   `packages/frontend/src/labs`, physics/astronomy/chemistry simulations, a 15-epoch
   cosmology timeline, and a lazy-loaded three.js 3D layer. This is the historical core.
2. **An ambitious "cognitive" scientific-reasoning backend** — 48 modules / ~6,500 LOC
   under `packages/backend/src/cognitive` (mission planner, hypothesis engine, critic
   swarm, verification bridge, model router). Real, tested, deterministic orchestration —
   **but its real-world scientific utility is unproven** (it orchestrates over the same
   descriptors + optional ADMET/docking; it does not add new predictive power).
3. **A commercial "Grounded Chemistry" product** (Stages 4–7) — the honest, well-tested
   molecule-analysis → comparison → campaign workflow in `components/product/*` and
   ~10 `core/*` modules. **This is the part with a defensible commercial thesis.**

The commercial value, the scientific honesty guarantees, and the strongest tests all
live in (3). Much of (1) and (2) is either educational or aspirational. Evaluate Genesis
on (3); treat (1) and (2) as context, not as the product.

---

## 1. Scientific limitations (verified against code)

### Confirmed correct (VERIFIED)
- RDKit descriptors are **real**, computed by RDKit 2026.03.3 via a Python subprocess
  (`packages/backend/src/compute/rdkit_worker.py`), never mocked. If RDKit is absent the
  system returns `BLOCKED_BY_RUNTIME` — it **fails closed**, never fabricates.
- MW, exact MW, LogP (Crippen), TPSA, HBD, HBA, rotatable bonds, rings, molecular formula,
  InChIKey, Lipinski count, PAINS/BRENK structural alerts, SA_Score, Tanimoto novelty are
  genuine RDKit outputs and **deterministic** (verified byte-identical across runs).
- The analysis hash (`core/provenance.ts`) is a reproducible SHA-256 over canonical JSON
  of `{canonicalSmiles, inchiKey, properties, rdkitVersion}`.

### Undisclosed-until-now scientific caveats (found in audit)
- **TPSA omits sulfur/phosphorus polar area.** `rdkit_worker.py` uses RDKit's default
  `Descriptors.TPSA(mol)` with `includeSandP=False`. Any S- or P-containing drug gets an
  **underestimated TPSA**, which can misclassify it in the "20–90 Å² favourable" band used
  by the developability score. Fixing this changes the scientific engine's output and is
  therefore **documented, not silently changed** (see FUTURE_WORK.md).
- **Lipinski HBA uses `NumHAcceptors`, not the literal Ro5 N+O count (`NOCount`).** This is
  RDKit's more modern definition and is defensible, but the UI labels it "Ro5 … HBA≤10",
  which is not literally the 1997 rule. Practically harmless (the ≤10 threshold rarely
  fires) but now stated explicitly.
- **LogP is a model estimate (~±0.5), not a measurement.** This *is* disclosed throughout
  (provenance confidence `MEDIUM`, decision report, exports). Grounding Layer matches LogP
  to ±0.2 internally while disclosing ±0.5 — a minor internal inconsistency, not a
  correctness bug.

### Honestly declared UNKNOWN (never predicted)
Biological activity, target/mechanism, efficacy, toxicity, solubility, permeability, PK,
metabolism. Genesis **never** predicts these. Every recommendation ends in *"Experimental
validation required."* The developability score is explicitly a **physicochemical
triage**, not an efficacy or safety prediction.

### HYPOTHESIS-level phrasing
"TPSA < 90 → BBB-penetration potential" is a directional heuristic (BBB penetration is
multifactorial). It is hedged, but treat it as a hypothesis, not a fact.

---

## 2. Backend / production-readiness blockers (from security audit)

These are **real and must be addressed before a production, multi-tenant deployment.**

### Critical
- **C1 — Unauthenticated subprocess spawning.** `/api/science/*` and `/api/compute/*`
  execute *before* the auth gate in `api.mjs`, and each spawns a Python RDKit subprocess.
  An unauthenticated caller can spawn processes. Mitigation today is only a per-IP limiter,
  which is defeated behind a proxy (C2). **Blocker for public deployment.**
- **C2 — Rate limiting keyed on raw socket IP.** No `X-Forwarded-For` handling
  (`server.mjs`), so behind Replit/any load balancer the limiter collapses to one global
  bucket. **The `/api/v1` monthly quota is the only real per-client limit** (and its usage
  increment is a non-atomic read-modify-write, racy under concurrency).

### High
- **H1 — Blocking event loop.** `node:sqlite` (`DatabaseSync`) and `execFileSync` compute
  calls are synchronous; `handleApi` is synchronous. One RDKit/Vina call freezes **all**
  other requests. This is the dominant scalability ceiling — a handful of concurrent
  compute calls produce multi-second latency for everyone. Fixing it is a **major
  redesign** (worker pool / async queue) and is documented, not implemented.
- **H2 — In-process background jobs, no orphan recovery.** Jobs run via `setImmediate`,
  uncapped; `cancelRequested` is an in-memory `Set`. On crash/restart, jobs stuck in
  `running` stay `running` forever.
- **H3 — Session tokens and API keys stored in plaintext** in SQLite. They are strong
  256-bit CSPRNG values, but a DB/backup leak yields directly usable credentials. Best
  practice: store a SHA-256 of the secret. (Schema migration required — documented.)

### Medium
- **M1** — No `uncaughtException` / `unhandledRejection` handlers; a throw in an async job
  path can take down the single process.
- **M2** — No per-account login throttle / lockout (only the broken IP limiter). scrypt
  N=16384 is on the low side but acceptable.
- **M3** — `server.mjs` dispatch allow-list must stay hand-synced with `api.mjs` routing;
  trailing-slash inconsistency means e.g. `POST /api/v1` (no slash) 404s. Fragile.
- **M4** — No CORS headers → the "public API for external developers" is unusable from
  browsers as-is.
- **M5** — `regenerateAccountKey` deletes all keys then creates one, non-transactionally.

### Positives (also verified — credit where due)
Parameterized SQL throughout; scrypt password hashing with per-user salt; Stripe webhook
verifies HMAC-SHA256 over the raw body with constant-time compare + timestamp tolerance;
RBAC roles genuinely enforced per handler; tenant/project ownership checks consistent;
graceful SIGTERM/SIGINT shutdown.

---

## 3. Frontend / architecture limitations

- **Three chrome systems in one 648-line `App.tsx`** (`TopBar`, `DiscoveryShell`,
  `ProductChrome`) — a 31-variant route union and a ~360-line if-ladder. Three product
  generations coexist with no shared shell or coherent information architecture.
- **858 KB main JS chunk.** `labs/index.ts` statically imports all 13 labs, and route-based
  code-splitting is deliberately disabled (to preserve an offline-PWA guarantee for the
  education product). A user who only wants the Chemistry Assistant still downloads all
  physics/astronomy/lab code. (three.js *is* correctly lazy-loaded.)
- **Client-side only persistence.** Campaigns and analysis history live in `localStorage`
  (per browser, no server sync, no team sharing). Quota-exceeded writes **fail silently** —
  `storage.ts` returns `false` but callers (`saveAnalysis`, campaign writes) ignore it, so a
  full quota loses data with no user feedback. Campaign molecule lists are uncapped, so a
  2,000-molecule campaign storing full descriptors per molecule is a real quota risk.
- **Zero UI/component tests.** All 72 frontend test files are pure-logic (engines,
  parsers). No test renders a React component; every screen, error state, and the
  quota-failure path are untested. (Type safety is otherwise excellent: `strict: true`,
  **zero `any`**.)
- **Duplicate `CampaignScreen`** — a legacy narrative one (`components/CampaignScreen.tsx`,
  `#/campaign`) and the new research one (`components/product/CampaignScreen.tsx`,
  `#/campaigns/:id`) coexist under an alias. A naming trap.

---

## 4. Repository hygiene

- **Documentation sprawl:** ~92 tracked `.md` files, including many short aspirational
  `docs/COGNITIVE_*` / `ZEFIR_*` design notes and 7 Polish status/audit reports. Risk is
  drift, not thinness.
- **No test coverage instrumentation**, no git hooks enforcing lint/format pre-commit.
- **E2E scripts reference Playwright, which is not a declared dependency** — they only run
  where Playwright is provided out-of-band.
- The backend is **not** zero-runtime-dependency as sometimes stated: it hard-imports
  `@anthropic-ai/sdk` (one runtime dep; everything else is `node:` builtins). It degrades
  gracefully without an API key.

---

## 5. What we fixed during this audit (small, safe)
- RDKit adapter ignored its per-call timeout override (`invoke()` took one argument), so
  heavy `embed3d`/`denovo` ran under the 10 s limit and could spuriously time out. Fixed.
- `engines.node` said `>=18`, but `node:sqlite` requires Node 22. Corrected to `>=22`.
- `vite.config.ts` comment claimed a ~187 kB main bundle; the real index chunk is ~858 kB.
  Comment corrected to state the truth and name the code-splitting debt.

Everything larger (C1/C2/H1/H2/H3, TPSA S/P, UI tests, chrome unification) is **documented
here and in FUTURE_WORK.md, deliberately not rushed**, because a hasty security or
scientific-engine change is worse than an honest disclosure.
