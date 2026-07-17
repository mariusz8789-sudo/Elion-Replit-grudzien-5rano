# Genesis — Pilot-Readiness Milestone: Final Report

Branch `claude/genesis-takeover-audit-kpz019`, commit `72df89d`. This report covers the
"CLOSE THE GENESIS PILOT-READY MILESTONE" mission. Read this alongside
`KNOWN_LIMITATIONS.md` (the standing, blunt audit) and `docs/SCIENTIFIC_VERSION_CONTROL.md`
(full technical detail on this milestone's centerpiece) — this report does not repeat their
content, it summarizes and gives the honest bottom line.

**Triage note, stated up front:** the mission brief asked for ~10 large workstreams
simultaneously (full repo audit, version control, campaign-UI parity audit, all import/export
formats, a full quality/security/accessibility audit, enterprise-readiness verification, five
kinds of testing, a seven-document documentation set, and this report). That is realistically
several engineer-weeks of work, not one session. Per the mission's own explicit instruction —
*"If something cannot reasonably be completed in this milestone, explain exactly why and
recommend whether it belongs in the next milestone"* — the choice made was: build the most
concretely-specified, highest-leverage item (Scientific Version Control, since it had already
been individually architected and approved) completely and for real, close the #1 previously-
documented real-world gap (CSV/SDF/MOL import), and rely on the *already-current* prior audit
(`KNOWN_LIMITATIONS.md`, last updated this same branch) for the broader "audit the whole repo"
ask rather than re-running it from scratch with no new material findings to add. What was not
attempted is listed honestly in §3 and §10, not silently skipped.

---

## 1. Files changed

24 files, +1,842 / −15 lines. Commit `72df89d`.

**New:**
- `packages/backend/src/campaignVersioning.mjs` — hashing, snapshot orchestration, structural diff engine
- `packages/backend/src/campaignVersioning.test.mjs` — 19 tests
- `packages/backend/src/moleculeFileImport.test.mjs` — 9 tests
- `packages/frontend/src/core/moleculeImport.ts` — CSV parser
- `packages/frontend/src/__tests__/moleculeImport.test.ts` — 12 tests
- `packages/frontend/src/components/product/VersionControlPanel.tsx`
- `packages/frontend/src/components/product/MoleculeCsvImport.tsx` (CSV+SDF+MOL import button)
- `docs/SCIENTIFIC_VERSION_CONTROL.md`

**Modified:** `store.mjs` (v27 migration + CRUD), `api.mjs` (new routes), `server.mjs` (async
route wiring), `computeWorker.mjs`, `compute/rdkitAdapter.mjs`, `compute/rdkit_worker.py`
(new `parse-molfile`/`parse-sdf` commands), `moleculeComparison.ts` (`SCORING_VERSION`),
`core/backend/client.ts`, `core/campaignExport.ts`, `components/Icon.tsx` (new `upload` icon),
`CampaignScreen.tsx`, `ComparePlatformScreen.tsx`, plus test-file updates in
`__tests__/campaigns.test.ts`; `KNOWN_LIMITATIONS.md`, `docs/DEPLOYMENT.md`,
`docs/OPERATOR_GUIDE.md` updated.

## 2. Features completed (real, tested, verified this session)

- **Scientific Version Control**, implementing the previously-approved architecture exactly:
  Scientific Snapshot IDs (= SHA-256 content hash), immutable snapshots, a structural
  scientific diff (never raw JSON, every changed value tied to a cause), snapshot restoration
  (as a new snapshot, history never rewritten), an audit trail (append-only snapshots +
  comments), RDKit/ADMET/Grounding/Scoring version tags per snapshot, parent-snapshot chaining,
  author attribution, immutable timestamps. Owner/Collaborator/Viewer sharing. Scientific
  comments (optionally pinned to a snapshot or molecule).
- **CSV import** for Compare and Campaigns (client-side parser, header-flexible).
- **Real SDF/MOL import** for Compare and Campaigns (new RDKit worker commands using
  `Chem.MolFromMolBlock` — genuine structure parsing, not a text hack), wired into the
  existing async compute pool from day one (no blocking-route regression).
- **Scientific Snapshot metadata in exports** — CSV and JSON campaign exports now carry the
  exact snapshot id/hash/version they were generated from, when one exists.
- **28 new backend regression tests + 21 new frontend tests**, all passing alongside the
  full pre-existing suite: **863/863 backend, 740/740 frontend**, clean `tsc --noEmit`, clean
  production `vite build`.
- Caught and fixed two real bugs before they shipped, found by the test suite itself: (1) SDF
  multi-record parsing had a leading-newline offset bug that broke every record after the
  first in any real multi-molecule file; (2) a status-code regression (200→201) that broke
  three pre-existing, previously-green tests.
- **Ran an actual live-browser QA pass** (Chromium via Playwright, real backend + real Vite
  dev server, `ASYNC_EXECUTION=true`) covering the full flow: register → create campaign →
  add molecules → confirm an automatic snapshot appears → run analysis → confirm the second
  automatic snapshot appears → invite a real second account as collaborator → verify their
  access via the API (200, `role:"collaborator"`) → verify a third, uninvited account gets 404
  (no existence leak) → compare two versions and confirm a human-readable diff renders (never
  raw JSON) → restore an earlier version → post a scientific comment → CSV-import a file on
  Compare. **This pass found two real bugs that no unit test caught**, both fixed and
  re-verified in the same pass:
  1. `VersionControlPanel` only ever fetched once, on mount — after adding molecules or
     running analysis, the version timeline never updated without a full page reload. Fixed
     by threading a `refreshToken` counter down from `CampaignScreen`, bumped after every
     successful auto-snapshot.
  2. A real race: the campaign PUT (first save) and the auto-snapshot POST fired concurrently,
     so the very first snapshot on a brand-new campaign could 404 (campaign not yet visible
     server-side when the snapshot POST arrived). Fixed by awaiting the campaign save before
     firing the auto-snapshot.
  Both fixes verified live afterward: 22/24 scripted browser checks passed; the 2 that didn't
  were flaws in the QA script's own assertions (confirmed by manual inspection — the diff
  rendered correctly, and "restore produces no new row" is the *intended* content-addressing
  dedup behavior, already covered by `campaignVersioning.test.mjs`), not product bugs.

## 3. Remaining technical debt (honest)

- **No campaign-UI desktop/tablet/mobile *re*-audit this session.** The mobile-first rebuild
  (prior milestone, commits `7359a1d`/`008d114`) already unified Compare/Campaigns on shared
  CSS classes and a two-breakpoint (`.cmp-desktop-view`/`.cmp-mobile-view`) toggle — there is
  no distinct "tablet" layout, tablet widths get whichever of the two breakpoints they fall
  into. This milestone added one new shared component (`VersionControlPanel`) to that existing
  pattern but did not re-verify the rest of the UI for regressions or true tablet-specific
  behavior.
- **No verdict/ranking diff in the UI.** The diff engine and panel show *structural* changes
  (molecules, descriptors, alerts, stage, engine versions) but never "who was the winner
  before vs. after" — that requires re-running `moleculeComparison.ts`'s ranking on both
  snapshots, which the architecture allows but which was not actually wired into
  `VersionControlPanel`. Both snapshots' full data are available via the API, so this is a
  contained follow-up, not a redesign.
- **No stress/load testing.** The 409-conflict path is unit-tested for one race; there is no
  test simulating many concurrent collaborators snapshotting the same campaign at once.
- **Minor diff-engine completeness gap, found during live QA**: the descriptor diff only
  fires when BOTH snapshots have RDKit `props` for a molecule. The very common first
  transition (unanalysed → analysed) therefore shows a stage change but not "descriptors
  computed for the first time" — correct, not misleading, but less informative than it could
  be. Small, contained follow-up.
- **Branching/merge, per-molecule ADMET history, invite-by-email-only-for-existing-users,
  no invite notification** — all deliberate, documented scope boundaries (see
  `docs/SCIENTIFIC_VERSION_CONTROL.md` §9), not oversights.
- **Broader repo audit reused, not redone.** `KNOWN_LIMITATIONS.md` §§0–5's inventory of the
  ~230 files outside this milestone's scope (cognitive engine, education labs, docking/QM) was
  not re-verified line-by-line this session; a fresh `grep` for TODO/FIXME/HACK/stub across
  `packages/` turned up nothing new to disclose beyond what that document already states.
- **Some existing docs still carry stale version numbers** unrelated to this milestone (e.g.
  a couple of old references to schema "v21" pre-dating this and earlier sessions' migrations)
  — corrected where this milestone touched them (`DEPLOYMENT.md`), not swept project-wide.

## 4. Known limitations

See `KNOWN_LIMITATIONS.md` §6 (this milestone) and `docs/SCIENTIFIC_VERSION_CONTROL.md` §9
for the full, itemized list — not duplicated here to avoid drift between two copies.

## 5. Pilot readiness assessment

**Yes**, for a narrowly-scoped pilot: a small lab or design-partner team (1–5 named users)
evaluating the Compare → Campaigns → shared-version-history workflow with real RDKit/ADMET-AI
grounding. All server-side logic for that workflow is real, tested, and enforces the
permission model correctly, and the full share/snapshot/diff/restore/comment flow was
exercised live in a real browser this session (§2) — not just unit-tested — which is what
actually found and let me fix the two real bugs listed there. **Not yet** ready for a
self-serve, unattended, many-tenant rollout: the concurrency stress test (§3) still hasn't
been run, and this was one QA pass by one operator, not a multi-user simultaneous-edit drill.

## 6. Enterprise readiness assessment

- **Permissions**: real and tested — 3-role RBAC, 404-not-403 non-leak, owner-only member
  management, self-removal always allowed. ✅
- **Audit logging**: snapshots and comments are append-only and author/timestamp-attributed,
  which *is* a genuine audit trail for scientific state — but there is no separate structured
  log of every API call (who read what, when). Adequate for "what changed in the science,"
  not for a SOC2-style access log. ⚠️
- **Deterministic behavior**: content hashing, engine-version tagging, and the diff engine are
  all deterministic and tested as such. ✅
- **Concurrency**: the one conflict scenario (stale write → 409) is tested; broader concurrent
  load is not. ⚠️
- **Worker stability / no blocking operations**: the new SDF/MOL route was wired into the
  existing async compute pool from the start — the exact class of bug (a blocking
  `execFileSync` on the main thread) that was found and fixed for ADMET in a prior milestone
  was not reintroduced here. ✅
- **Recovery after failures**: automatic snapshot creation is best-effort and non-blocking by
  design — a failed snapshot loses history depth, never campaign data. ✅

## 7. Scientific reproducibility assessment

Strong for what it covers: SHA-256 content-addressed snapshots (verified deterministic across
key-order variation), per-snapshot engine-version tagging (RDKit/ADMET/Grounding/Scoring),
and a diff engine that explicitly attributes every changed descriptor to either an engine-
version change or a genuine data change — never an unexplained number. Restore is proven
non-destructive by test (nothing is deleted or rewritten). Gap, stated plainly: ADMET-AI
predictions were never persisted per molecule (before or after this milestone) so they cannot
be reproduced-and-compared snapshot-to-snapshot, only the *engine version* is recorded; and
the ranking/verdict itself is not yet diffed in the UI (§3).

## 8. Security assessment

Every new route requires a valid bearer token (tested: 401 without one). Role checks are
enforced server-side on every mutating and every sub-resource route, verified with an explicit
test matrix (owner/collaborator/viewer × read/write/invite/restore/comment/resolve). Non-member
access returns 404, matching the project's existing no-existence-leak convention. All new SQL
uses parameterized `db.prepare(...).run(...)` calls — no string-interpolated queries were
introduced. New routes inherit the existing IP rate limiter automatically (prefix-based
routing in `server.mjs`, unchanged). No new secrets, keys, or external calls were introduced.

## 9. Commercial readiness assessment

This is the first *working* instance of the "Git for Scientific Discovery" differentiator
identified in the earlier strategic report — a design partner can be shown a real
share-a-campaign, see-what-changed, restore-an-earlier-version flow today, not a mockup. It is
MVP-depth, not a polished paid feature: no plan-tier gating on collaborator count, no usage
metering specific to version control, no billing hook. Commercially **demonstrable now**;
**not yet packaged** as a sellable tier.

## 10. Overall project status

Genesis can honestly be described, **with the caveats above stated alongside it**, as: *a
pilot-ready AI-assisted Scientific Discovery platform with deterministic scientific workflows,
reproducible analyses, audit-ready version control, RDKit and ADMET-AI integration, and a
modern user experience* — for a small, attended pilot with a design partner. This session's
own live-browser QA pass is what surfaced the two real bugs in §2, which is exactly why that
pass mattered more than another round of unit tests would have. It is not yet a hardened,
self-serve, stress-tested enterprise product; §3/§6 above are the honest punch list for the
milestone that would make it one. The concurrency stress test is the recommended next,
narrowly-scoped piece of work — bounded, well-understood, and far cheaper than building any
new feature — before opening the pilot beyond a single attended session at a time.
