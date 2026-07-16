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
