# Future Work

A backlog ordered by **anticipated** impact. Per ROADMAP.md, this ordering is a hypothesis —
it must be **re-prioritised by real user feedback** before any item is started. No new
scientific engine or AI model is to be built speculatively.

Each item links to the audit finding that motivates it (KNOWN_LIMITATIONS.md).

## Top 10 (anticipated impact — to be validated by users)

1. **Server-side persistence + team accounts for campaigns.** Today campaigns/history are
   per-browser `localStorage` with silent quota failures (§3). This is the single biggest
   blocker to selling to a laboratory. Reuse the existing backend `/api/projects` + auth
   rather than a new system.
2. **Auth-before-compute (C1) + proxy-aware rate limiting (C2).** Gate `/api/science` and
   `/api/compute` behind the token check; parse trusted `X-Forwarded-For`. Prerequisite for
   any public exposure. (§2)
3. **Hash stored credentials (H3).** Store SHA-256 of session tokens and API keys; migrate
   the schema. Removes a direct credential-leak path. (§2)
4. **Async execution / worker pool (H1).** Replace synchronous SQLite + `execFileSync`
   compute on the request path with a queue + worker pool so one RDKit/Vina call stops
   freezing every other request. Major redesign — scope carefully. (§2)
5. **File import/export in lab formats.** SDF and bulk-CSV import; keep the honest CSV/JSON
   export. A 500-molecule-a-week lab will not paste SMILES by hand. (COMMERCIALIZATION.md)
6. **TPSA sulfur/phosphorus fix + disclosure.** Decide between disclosing the
   `includeSandP=False` caveat prominently or switching to `includeSandP=True` (changes
   engine output → needs re-baselining and a version bump). (§1)
7. **UI/component tests.** Add React Testing Library coverage for the product screens, error
   states, and the localStorage-save-failure path (currently zero UI tests). (§3)
8. **Frontend chrome unification + route-based code splitting.** Collapse the three chrome
   systems; split the 858 KB index chunk so a product user does not download 13 physics labs.
   (§3)
9. **Job durability + crash recovery (H2), crash-safety handlers (M1), CORS (M4), login
   lockout (M2).** The medium-severity production hardening set. (§2)
10. **Measured-data layer.** Let users attach *experimental* results (ADMET assays, in-house
    measurements) alongside computed descriptors — turning the honest framework into a place
    real data lives, which is the capability free tools lack. **Only if a pilot confirms it.**

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
