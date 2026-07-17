# Genesis — First-Users Readiness Report

Branch `claude/genesis-takeover-audit-kpz019`, commit `dadc989`. Scope: a production-readiness
audit assuming the next people to touch Genesis are biotech companies, pharmaceutical
researchers, universities, pilot customers, and investors. No new features were built. Every
major workflow was re-tested live (real backend, real browser — Compare, Campaigns, Scientific
Version Control, imports, exports, sharing, diffs, restore, comments, audit trail, PDF export,
mobile, desktop), and only issues that were real, reproduced bugs were fixed.

**What live testing found that static review and unit tests had missed:** four real bugs, all
fixed and re-verified this session (full detail in commit `dadc989`):
1. The mobile top nav (6 links) didn't wrap at narrow widths — horizontal page overflow on phones.
2. A user's account email overflowed the same nav bar, unbounded — no truncation.
3. `VersionControlPanel` silently rendered nothing on a failed first load — no error, no retry,
   just an invisible feature.
4. The persistence/compute rate limiter (60/min per IP) was reproducibly hit during normal,
   fast-paced use of Compare + Campaigns + Version Control together in one sitting — exactly
   the kind of session a live demo to an investor or pharma prospect looks like.

Each was reproduced live before being fixed, and re-verified live after (32/32 scripted browser
checks passing on the final pass, covering every workflow listed in the mission).

---

## COMPLETE — genuinely finished and verified

- **RDKit descriptors** — real, deterministic, subprocess-backed, fails closed
  (`BLOCKED_BY_RUNTIME`) when unavailable. Verified via the full backend suite and live use.
- **ADMET-AI predictions** — real `MODEL_ESTIMATE` outputs, never presented as measured fact,
  verified live (predictions render, no `NaN`/`undefined` leakage into the UI).
- **Compare workflow end-to-end** — paste molecules → real RDKit ranking → decision/verdict →
  ADMET → PDF export. Verified live on desktop (1440px) and mobile (390px) viewports; PDF export
  produces a real, non-trivial file.
- **Campaigns workflow end-to-end** — create → add molecules → run analysis → dashboard →
  ranking → lifecycle → CSV/JSON/PDF export. Verified live, both viewports.
- **Scientific Version Control** — immutable content-addressed snapshots, automatic triggers
  (molecules-added / analysis-completed) firing without a page reload, human-readable diff
  (never raw JSON), restore, Owner/Collaborator/Viewer sharing with a real second account,
  non-member 404 (no existence leak), scientific comments, audit trail (author + timestamp +
  engine versions). All verified live, not just unit-tested — this is the area that had the two
  UI-level bugs (#3 above, and the earlier "panel never refreshes" bug from the prior milestone,
  already fixed and re-confirmed here).
- **CSV / SDF / MOL import** — real RDKit `MolFromMolBlock` parsing (not a text hack), verified
  live for both single-molecule `.mol` and multi-record `.sdf`, including honest error handling
  for a garbage file (no crash).
- **PDF export fidelity** — verified the Version Control panel is correctly *excluded* from the
  printed report (a pre-existing generic print rule already handles this correctly; confirmed by
  actually rendering to PDF and inspecting it, not by reading the CSS).
- **Core security posture** — auth required on every mutating/read route past the public
  surface, 404-not-403 non-member handling verified live across owner/collaborator/stranger,
  parameterized SQL throughout the new surface (no string-interpolated queries), rate limiting
  now correctly sized for realistic use (see NEEDS FIX).
- **Automated test suites** — 872/873 backend (one flake, confirmed a resource-contention
  artifact of running the full suite concurrently with live browser tests on a 4-core box;
  passes cleanly in isolation), 740/740 frontend, clean `tsc --noEmit`, clean production build.

## NEEDS FIX — real issues, now fixed and verified this session

All four found via live re-testing, all fixed, all re-verified live afterward:

1. **Mobile nav overflow** — `.product-nav`'s 6 links didn't wrap at ≤620px. Fixed with
   `flex-wrap: wrap`. This affected *every* screen using the shared product chrome, not just
   this milestone's new work — the kind of first-impression bug that costs real credibility on
   a phone demo.
2. **Long email overflow** — `.product-email` had no width constraint. Fixed with a max-width +
   ellipsis (tighter on mobile).
3. **Silent panel failure** — `VersionControlPanel` returned `null` on any failed first load,
   with zero feedback. Fixed: shows an honest message + a "Spróbuj ponownie" (retry) button, and
   no longer clears an already-established role on a later transient failure.
4. **Rate limit too tight for real usage** — 60/min per IP was reproducibly exceeded by ordinary,
   fast-paced use of Compare + Campaigns + Version Control together (real RDKit/ADMET calls plus
   the version panel's 4-request refresh per action add up quickly). Raised to 180/min.

### Found, not fixed this session (documented, not blocking, but real)

- **Email enumeration on invite**: `POST /api/campaigns/:id/members` returns a distinct
  `user_not_found` for an email with no Genesis account, versus success for one that has an
  account. Any registered user can therefore probe whether an arbitrary email address has a
  Genesis account. Low severity for a small, named-collaborator pilot; a genuine gap before
  wider availability. The correct fix (queue an invite regardless, notify on signup) is new
  scope, not a contained bug fix — intentionally not built here.
- **Minor diff-engine completeness gap**: the descriptor diff only fires when both sides of a
  comparison already have RDKit `props` — the very common "unanalysed → analysed" transition
  shows a stage change but not "descriptors computed for the first time." Correct, not
  misleading, just less informative than it could be.
- **No ARIA-live region** on the new error/retry text in `VersionControlPanel` — a screen reader
  user wouldn't be announced the failure. Small, contained, worth a follow-up.

## DEFER — important, should wait until users request it

- **Branching / merge.** Data model is DAG-capable (`parent_id`); UI and merge logic are
  deliberately not built. Already documented as an explicit architecture decision, not an
  oversight.
- **Per-molecule ADMET version history.** ADMET predictions are fetched live, not persisted per
  molecule, so they can't be diffed snapshot-to-snapshot — only the *engine version* is recorded.
- **Verdict/ranking-level diff in the UI.** The structural diff (molecules/descriptors/alerts/
  stage/engine-version) is real and shown; "who was the winner before vs. after" is not
  currently rendered, though both snapshots' data are available via the API for it.
- **Invite-then-signup flow, invite email notifications.** Invites only work for existing
  accounts and are silent until the invitee next opens the app. Fine for a same-lab pilot with
  a handful of named collaborators typing correct emails.
- **Concurrency/stress testing at real scale** (many simultaneous collaborators snapshotting the
  same campaign). The one conflict path (stale write → 409) is unit-tested for a single race;
  there is no multi-user load test.
- **Reducing `VersionControlPanel`'s 4-parallel-GET-per-refresh pattern.** Works correctly now
  that the rate limit is sized for it, but it's more requests than strictly necessary; worth
  consolidating if usage patterns show it matters at scale.
- **A fresh, full audit of the ~230 files outside this session's touched surface** (the cognitive
  engine, education-simulation labs, docking/QM pipelines). `KNOWN_LIMITATIONS.md` §§0–5 remain
  the accurate, current source for that ground; nothing new surfaced there this session.

## VISION — long-term roadmap, must NOT be implemented now

- Multi-tenant, self-serve invite-by-email for people without existing accounts.
- Team/org billing tied to collaborator seats or version-control usage.
- Real-time collaborative editing / live presence indicators.
- A separate, structured, queryable access-audit-log (distinct from the scientific
  snapshot/comment trail) for SOC2-style enterprise compliance.
- A branching/merge UI with conflict resolution.
- An AI explainer that judges "which version is scientifically stronger" (the architecture
  explicitly constrains any future AI layer to narrate the deterministic diff, never
  independently judge that).
- Postgres/multi-region scale-out (the store layer is designed to allow this later; not needed
  now).

---

## Would I personally feel comfortable demonstrating Genesis today to a pharmaceutical company, university laboratory, or investor?

**Yes** — for what it actually is: a small, attended pilot demo (one or a few people in the
room, not an unattended self-serve trial), covering Compare, Campaigns, and the new sharing/
version-history workflow with real RDKit and ADMET-AI grounding.

I feel comfortable saying yes because the confidence isn't resting on unit tests alone — every
major workflow was driven live in a real browser this session, including the exact things that
would embarrass a demo (mobile rendering, PDF export contents, cross-account sharing, an
uninvited stranger being correctly denied), and that live pass is what caught the four real bugs
above, all now fixed and re-verified. The scientific-honesty guarantees that matter most to this
audience — RDKit values are genuinely computed, ADMET is labeled `MODEL_ESTIMATE` and never
presented as fact, unavailable engines fail closed instead of being faked, snapshots are
provably immutable and content-addressed — held up under live scrutiny, not just in prose.

What still needs monitoring during pilots, precisely because this was one audit session, not a
production soak test:
- **Watch for 429s** in server logs during the first live demos even after the rate-limit raise —
  if a demo involves several people behind one office network, the shared-IP assumption behind
  per-IP rate limiting could still bite; raise further or scope per-user if it recurs.
- **Don't demo the invite flow with an email you're not sure is registered** — it will visibly
  fail with "no such user," which is honest but not smooth; register the collaborator's account
  before the demo.
- **Treat sharing as single-collaborator, attended-session territory** — this hasn't been
  stress-tested with several people editing the same campaign at once, and the audit didn't
  attempt to break that concurrently on purpose.
- **This was one operator's audit, once.** A second, independent pass — ideally with a real
  pharma/university user driving instead of a scripted browser — is the natural next check
  before treating "pilot-ready" as a settled fact rather than a current, well-verified belief.
