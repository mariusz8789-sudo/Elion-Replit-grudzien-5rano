# Future Work

A backlog ordered by **anticipated** impact. Per ROADMAP.md, this ordering is a hypothesis —
it must be **re-prioritised by real user feedback** before any item is started. No new
scientific engine or AI model is to be built speculatively.

Each item links to the audit finding that motivates it (KNOWN_LIMITATIONS.md).

## Current top 5 (2026-07 business-value + competitive audit)

Superseding the ordering below for anything not already shipped. Grounded in a code-cited
UX audit of every product screen — see COMMERCIALIZATION.md "Competitive positioning" for
the full analysis. Each item reuses existing architecture; none require a new engine.

1. **CSV/SDF bulk import (Compare + Campaigns).** Today both screens accept only a
   line-delimited textarea (`ComparePlatformScreen.tsx` `parseMoleculeLines`,
   `CampaignScreen.tsx`) — no file upload anywhere in the product. This is the single most
   cited real-world blocker: a working chemist's molecule list lives in Excel/SDF, not typed
   SMILES. Reuses the existing `batchRunner` pipeline; only a parser + file input are new.
2. **Unify CSV/JSON export across Assistant + Compare** to match Campaigns (which already has
   full CSV/JSON/PDF export via `campaignExport.ts`). Assistant and Compare are print-only
   today — a real, visible inconsistency between three screens doing the same core job at
   different capability tiers.
3. **Server-side persistence for `assistantHistory`** (Assistant's saved-analysis history).
   Confirmed still localStorage-only (`core/assistantHistory.ts`: *"No backend, no new
   endpoint"*) even though Campaigns got the equivalent sync layer in Genesis 2.1
   (`core/campaignSync.ts`). This is a silent, trust-breaking inconsistency exactly where the
   product's pitch is reproducibility — replicate the proven Campaigns pattern.
4. **Surface ADMET-AI (already-built, already-tested engine) in Compare/Campaigns** as an
   optional column, clearly tagged ⚠ MODEL_INFERRED (reuse the existing evidence-tag system).
   The engine (52 endpoints, published TDC metrics) is wired into the backend
   (`compute/admetAdapter.mjs`) but never surfaced in the commercial product layer. Highest
   "saves me hours" potential of any item here — pure wiring, no new science.
5. **Lightweight read-only share link for a campaign/report** — a scoped, revocable token +
   a public read-only route, reusing existing report-rendering components. Solves "show my
   PI/investor the result" without the larger, riskier full team-account/RBAC redesign.

## Original top 10 (2026-07 security/infra audit) — status

1. ✅ **DONE (Genesis 2.1).** Server-side campaign persistence shipped (`user_campaigns` +
   `campaignSync.ts`). Team accounts remain an open question (no membership model) — see
   COMMERCIALIZATION.md.
2. ✅ **DONE (Genesis 2.0).** Auth-before-compute + proxy-aware rate limiting shipped.
3. ✅ **DONE (Genesis 2.0).** Session tokens + API keys hashed at rest (schema v24).
4. ✅ **DONE, flag-gated (Genesis 2.1).** Async worker pool shipped behind `ASYNC_EXECUTION`
   (default off — verified live to keep the event loop responsive; not yet the default).
5. **Still open.** File import/export in lab formats — promoted to current top-5 item #1 above.
6. **Still open.** TPSA sulfur/phosphorus fix + disclosure. (§1)
7. **Still open.** UI/component tests — zero exist; every screen in the 2026-07 audit was
   verified by reading source, not by an automated test.
8. **Still open.** Frontend chrome unification + route-based code splitting.
9. ⚠️ **Partially done.** Crash handlers (M1), CORS (M4), login lockout (M2) shipped in
   Genesis 2.0. Job durability/crash recovery for the cognitive campaign runner (H2) still open.
10. **Still open, now sharper.** Measured-data layer — see current top-5 item #4 (ADMET
    surfacing) as the concrete, lowest-risk first step toward this.

## Deliberately deferred (do NOT build speculatively)
- Evidence Engine / PubMed / ChEMBL integration (blocked in-sandbox by egress policy anyway;
  requires a networked microservice — see the environment audit).
- New predictive models of any biological property (violates the honesty contract unless
  clearly labelled as a separate, validated, opt-in predictor).
- Docking/MD pipelines as a product feature (engines exist; not a validated user need).

## Repository hygiene backlog
- Prune documentation sprawl (~92 `.md`; many short aspirational `docs/COGNITIVE_*`).
- Declare Playwright as a dev dependency (e2e scripts reference it undeclared).
- Add test-coverage instrumentation and pre-commit lint/format hooks.
- Resolve the duplicate `CampaignScreen` name.
- Decide the fate of the education/cognitive layers vs. a commercial product spin-out.
