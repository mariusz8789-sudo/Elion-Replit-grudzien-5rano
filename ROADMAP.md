# Roadmap

Genesis has completed its feature-build phase (Stages 1–7) and now enters a **Product
Validation Phase**. The guiding principle from here: **no new feature development begins
until feedback from real users has been collected and analysed.**

---

## Where we are
- ✅ Real RDKit computational core (fail-closed, deterministic).
- ✅ Grounded Chemistry Assistant: SMILES → verified report (Stage 4).
- ✅ Scientific Decision Engine + Provenance (Stage 5).
- ✅ Molecule Selection / Comparison platform (Stage 6).
- ✅ Research Campaigns + Decision Trace + CSV/JSON/PDF export (Stage 7).
- ✅ Stripe checkout → webhook → auto API-key provisioning + self-service billing.
- ✅ Public `/api/v1` (analyze / render 2d / render 3d), tiered quotas.
- ⚠️ Documented, unresolved production + scientific limitations (KNOWN_LIMITATIONS.md).

## Product Validation Phase — the only sanctioned next steps
1. **Production deployment** (single-tenant / trusted pilot posture first — see DEPLOYMENT.md).
2. **Stripe Live** (currently test-mode wiring; needs live keys + a public webhook URL).
3. **Public HTTPS domain.**
4. **AI Copilot activation** (turn on a grounded model — the guardrail already exists).
5. **First laboratory pilot** (a real med-chem group running real campaigns).
6. **First grant applications** (see GRANTS.md).
7. **First paying customer.**

## Business-value audit (2026-07) — the top 5 product improvements
A code-cited UX audit (every screen, every persona: first-time user, PhD student,
researcher, biotech founder, professor, investor) plus a competitive analysis against
RDKit/ChemAxon/DataWarrior/Schrödinger/general LLMs produced a ranked top-5, all reusing
existing architecture (no new engine, no new AI model): **(1)** CSV/SDF bulk import for
Compare & Campaigns, **(2)** unify CSV/JSON export across Assistant/Compare to match
Campaigns, **(3)** server-side persistence for Assistant analysis history (matching the
Campaigns pattern), **(4)** surface the already-built ADMET-AI engine in Compare/Campaigns
(clearly tagged ⚠ MODEL_INFERRED), **(5)** a lightweight read-only share link for a
campaign/report. Full reasoning, effort/impact ranking, and rejected alternatives:
FUTURE_WORK.md "Current top 5". Full competitive table: COMMERCIALIZATION.md.

## Explicitly NOT on the roadmap right now
No new scientific engines. No new AI models. No scope expansion. The temptation after
Stage 7 is to build an Evidence Engine / PubMed-ChEMBL integration / docking pipeline — **do
not**, until a real user has told us it's the blocker. See FUTURE_WORK.md for the backlog,
ordered by *anticipated* impact, to be **re-ordered by actual user feedback** before any work
starts.

## Hard prerequisites before "public SaaS" (not "pilot")
From KNOWN_LIMITATIONS.md §2 — these gate the jump from pilot to public:
- Auth-before-compute (C1) and proxy-aware rate limiting (C2).
- Hashed credential storage (H3).
- Server-side persistence for campaigns (today: localStorage only).
- Async execution / worker pool (H1) for concurrency.
- DB backup / disaster recovery.
