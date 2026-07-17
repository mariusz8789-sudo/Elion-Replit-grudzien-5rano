# Genesis — Scientific Version Control

"Git for Scientific Discovery," scoped to what a research lab actually needs to run a
Campaign with one collaborator: share a campaign, see its full history, understand *what
changed and why* between two points in time, restore an earlier state, and keep an
immutable, author-attributed audit trail. Git terminology never reaches the UI — the
product says "wersja" ("version"), never "commit"/"branch"/"snapshot".

Implemented Genesis 2.1, Part 4. Branch `claude/genesis-takeover-audit-kpz019`.

## 1. Data model

Three new tables, added additively in `store.mjs` as schema migration **v27** (`PRAGMA
user_version`-gated, idempotent — see `migrate()`). The existing `user_campaigns` table
(composite PK `(owner_id, id)`) is untouched; sharing is layered on top rather than by
restructuring that primary key.

```
campaign_members (campaign_id, user_id) PK
  role        'viewer' | 'collaborator' | 'owner'*  added_by  created_at
  * owner is derived from user_campaigns.owner_id, never stored as a member row.

campaign_snapshots (id) PK          -- id IS the content hash, see §2
  campaign_id  parent_id            -- previous snapshot id; NULL = first snapshot
  data                              -- full Campaign JSON at this point in time
  trigger_kind                      -- 'molecules_added' | 'analysis_completed' | 'restore' | 'manual'
  author_id    restored_from        -- set only when this snapshot is a restore
  rdkit_version  admet_version  grounding_version  scoring_version
  created_at

campaign_comments (id) PK
  campaign_id  snapshot_id?  molecule_id?  author_id  body  resolved  created_at
```

Access helpers live in `store.mjs` (`getCampaignRowById`, `addCampaignMember`,
`resolveCampaignRole`, `insertCampaignSnapshot`, `getSnapshot`, `getLatestSnapshot`,
`listCampaignSnapshots`, `insertCampaignComment`, `resolveCampaignComment`, …).

## 2. Content-addressed, immutable snapshots

A snapshot's own `id` is the SHA-256 hash of its **canonical** JSON (`campaignVersioning.mjs
→ canonicalJson`/`contentHash`) — the same idea as a git commit hash. Canonicalization
recursively sorts object keys before hashing, so key order never changes the hash.

- **Immutable**: no `UPDATE`/`DELETE` on `campaign_snapshots` exists anywhere in the code
  path. `insertCampaignSnapshot` is insert-only.
- **Content dedup**: inserting a snapshot whose hash already exists is a no-op that
  returns the existing row — two identical states are ALWAYS the same snapshot, never
  duplicated. Verified in `campaignVersioning.test.mjs` ("immutable and content-addressed").
- **History as a DAG, never rewritten**: `parentId` chains snapshots. `restoreSnapshot`
  creates a **new** snapshot whose `data` equals an old one (`restoredFrom` points back);
  it never deletes or edits history. If the target content already exists as a snapshot
  (e.g. restoring to the immediately-prior state), the "new" snapshot dedupes to that
  existing row — this is correct, not a bug.
- **Optimistic concurrency, not merging**: `createSnapshot`/`restoreSnapshot` accept an
  `expectedParentId`. If the actual latest snapshot has moved on since the client last
  read it, the write is rejected with **409 `stale_write`** — never silently merged. The
  caller must refresh and retry. Automatic triggers (see §4) omit `expectedParentId`
  (pass `undefined`) since they always read-then-write within the same request.

## 3. Scientific diff — never raw JSON

`campaignVersioning.mjs → diffCampaigns(oldSnapshot, newSnapshot)` computes a **structural**
diff over the two snapshots' `data`:

- molecules added / removed (by id)
- lifecycle **stage** changes (`NEW → ANALYSED`, …)
- structural-alert deltas (PAINS/BRENK added/removed)
- RDKit descriptor deltas, each tagged with `causedBy`:
  - `'rdkit_version_change'` when the two snapshots' `rdkitVersion` differ — the delta is
    explained by an engine upgrade, not a scientific anomaly
  - `'data_change'` otherwise — a genuine re-analysis / edit
- engine-version deltas (RDKit / ADMET-AI / Grounding / Scoring), each an explicit
  `{engine, from, to}` triple

**Deliberate scope boundary:** this diff does **not** recompute ranking/verdict. That
scoring algorithm lives in exactly one place — `core/moleculeComparison.ts`
(`SCORING_VERSION`, a frontend-only pure function) — and duplicating it in the backend
would create a second, driftable implementation of the same logic this project has
refused to duplicate everywhere else (see the ADMET integration notes in
`KNOWN_LIMITATIONS.md`). If a verdict-level diff is wanted, the frontend already has both
snapshots' `data` and can re-run the real ranking engine on each side itself.

**Deliberate scope boundary #2:** ADMET-AI predictions are not diffed per molecule,
because they are not persisted per molecule at all — `CampaignMolecule` only stores
verified RDKit `props`/`alerts` (see `campaigns.ts`); ADMET is fetched live, on demand, for
whichever candidate is currently selected in the UI (`ComparisonReport.tsx`). A snapshot
therefore records the *engine version* that was live at snapshot time
(`admetVersion` on `campaign_snapshots`), not a value to diff. Persisting per-molecule
ADMET history was out of scope for this milestone — see `KNOWN_LIMITATIONS.md`.

## 4. Automatic snapshot triggers

Per the approved architecture, snapshots are created automatically at exactly two points
— never per keystroke/per-stage-change:

- **`molecules_added`** — `CampaignScreen.tsx → doAdd()`, right after new molecules are
  added to the campaign.
- **`analysis_completed`** — `CampaignScreen.tsx → runPending()`, right after
  `markCompared()` at the end of a batch run.

Both call a best-effort `autoSnapshot()` helper: it never blocks the UI and never surfaces
an error to the user — a missed snapshot loses history depth, not data (the campaign body
itself is still saved via the existing `persist()`/`pushCampaign` write-through). A user
can also trigger a snapshot manually via the version-history panel (`triggerKind: 'manual'`).

## 5. Permissions

Three roles, checked on every new route (`campaignVersioning.mjs → hasRole`, rank
`viewer(1) < collaborator(2) < owner(3)`):

| Action | Viewer | Collaborator | Owner |
|---|---|---|---|
| Read campaign, snapshots, diff, comments | ✅ | ✅ | ✅ |
| Edit campaign body, create snapshot, restore | ❌ | ✅ | ✅ |
| Post a comment | ✅ | ✅ | ✅ |
| Resolve a comment | ❌ | ✅ | ✅ |
| Invite / remove / change a member's role | ❌ | ❌ | ✅ (self-removal is always allowed) |
| Delete the campaign | ❌ | ❌ | ✅ |

A user with no role on a campaign gets **404**, not 403, on every route under
`/api/campaigns/:id/*` — existence is never leaked to a non-member, matching the
project-wide RBAC convention.

## 6. API surface

All under `/api/campaigns/:id/...`, bearer-token authenticated (see `api.mjs`):

```
GET    /api/campaigns/:id                          → { campaign, role }
PUT    /api/campaigns/:id                           → upsert (collaborator+; owner if new)
DELETE /api/campaigns/:id                           → owner only

GET    /api/campaigns/:id/members                   → list
POST   /api/campaigns/:id/members                   → invite by email {email, role}  (owner only)
PUT    /api/campaigns/:id/members/:userId           → change role                    (owner only)
DELETE /api/campaigns/:id/members/:userId           → remove (owner, or self)

GET    /api/campaigns/:id/snapshots                 → list (metadata only, no `data` blob)
POST   /api/campaigns/:id/snapshots                 → create {data, triggerKind, expectedParentId?}
GET    /api/campaigns/:id/snapshots/:snapshotId     → one snapshot, full `data`
POST   /api/campaigns/:id/snapshots/:snapshotId/restore → restore (new snapshot)

GET    /api/campaigns/:id/diff?from=&to=            → { diff }  (see §3)

GET    /api/campaigns/:id/comments                  → list
POST   /api/campaigns/:id/comments                  → add {body, snapshotId?, moleculeId?}
POST   /api/campaigns/:id/comments/:commentId/resolve
```

Frontend client wrappers: `core/backend/client.ts` (`fetchCampaignWithRole`,
`listSnapshotsRemote`, `createSnapshotRemote`, `restoreSnapshotRemote`,
`diffSnapshotsRemote`, `listCampaignMembersRemote`, `inviteCampaignMember`,
`listCommentsRemote`, `addCommentRemote`, `resolveCommentRemote`, …).

## 7. Frontend

`components/product/VersionControlPanel.tsx` — one shared component, rendered once from
`CampaignScreen.tsx` (used identically regardless of desktop/mobile breakpoint, unlike the
hero/candidate-card layouts that genuinely differ per breakpoint). Renders: collaborator
list + invite control, version timeline (trigger, author, RDKit/ADMET version, restore
button), a two-version diff picker with a human-language rendering of §3's diff (never
raw JSON), and scientific comments.

Export integration: `core/campaignExport.ts`'s `ExportMeta.snapshot` optionally carries
`{id, createdAt, scoringVersion, admetVersion}`; when present, CSV gets a provenance
comment-row above the header and JSON gets `provenance.scientificSnapshot` — so an
exported report can always be traced back to the exact immutable version it came from.
`CampaignScreen.tsx` wires this from `VersionControlPanel`'s `onSnapshotsChange` callback
(the latest known snapshot). Compare (`ComparePlatformScreen`) has no campaign backing it
— it's an ephemeral, non-persisted ranking session — so there is no snapshot to attach to
its export; this is a real, not fixable-in-scope, boundary of what "snapshot metadata in
exports whenever applicable" can mean today.

## 8. Reproducibility guarantees

- Two snapshots with byte-identical canonical content **always** hash to the same id —
  verified directly (`campaignVersioning.test.mjs`: "same content, different key order →
  identical hash").
- Every snapshot records the exact engine versions (`rdkitVersion`/`admetVersion` via
  `rdkitAdapter.detect()`/`admetAdapter.detect()`, cached per-process) and the exact
  scoring algorithm version (`SCORING_VERSION` in `moleculeComparison.ts`, frontend-supplied)
  active when it was taken — so a later reviewer can tell "did this change because the
  science changed, or because the software changed?" without guessing.
- Restore is provably non-destructive: restoring never deletes the snapshots it restores
  from or to (`campaignVersioning.test.mjs`: "restore creates a NEW snapshot… both original
  snapshots still exist untouched").

## 9. Known limitations (honest, not deferred silently)

- **No branching.** The data model is DAG-capable (`parent_id`) but only ever produces a
  single linear chain per campaign today — branching/merge was a deliberate pre-implementation
  design decision (reject-stale-write over auto-merge; branching modeled at the data level
  only) and explicitly NOT built this milestone. Recommendation: defer to a future
  milestone; nothing in the schema needs to change to add it later, since `parent_id`
  already supports multiple children of the same snapshot.
- **No per-molecule ADMET history** (see §3). Recommendation: if this becomes a real
  pilot requirement, persist ADMET predictions onto `CampaignMolecule` the same way RDKit
  `props` already are, then extend the diff engine — a bounded, well-understood change.
  Not done here to avoid an unrequested schema change to `campaigns.ts`.
- **Invites require the invitee to already have a Genesis account** (looked up by email
  via `getUserByEmail`). There is no "invite a stranger by email who signs up later" flow.
  Acceptable for a pilot with a handful of named collaborators; not acceptable at scale.
- **No email/notification on invite.** The invited user only discovers access next time
  they open the campaign. Fine for a same-lab pilot; a real product would notify.
- **Snapshot `data` blobs are not paginated or diffed incrementally** — each snapshot
  stores the full campaign JSON. Fine at pilot scale (a campaign is at most a few thousand
  molecules); would need incremental storage before it scales to very large campaigns.

## 10. Tests

- `packages/backend/src/campaignVersioning.test.mjs` — 19 tests: hashing, immutability,
  DAG chaining, 409 conflict rejection, restore semantics, diff-engine correctness
  (including `causedBy`), and full owner/collaborator/viewer permission matrices.
- `packages/backend/src/moleculeFileImport.test.mjs` — adjacent pilot-readiness work
  (SDF/MOL import), not version control, but added the same milestone; see that file.
- Frontend: `src/__tests__/campaigns.test.ts` additions cover the snapshot-metadata export
  fields (present vs. absent) in both CSV and JSON.
- Frontend: `src/__tests__/moleculeImport.test.ts` covers the CSV import parser
  (headered/headerless, quoted fields, Polish "nazwa" header, cap enforcement).

Run: `cd packages/backend && node --test --test-concurrency=1 src/campaignVersioning.test.mjs`.
