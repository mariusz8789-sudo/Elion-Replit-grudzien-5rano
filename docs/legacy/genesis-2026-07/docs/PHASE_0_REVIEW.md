# Phase 0 review — what building it changed about the design

Companion to `DISCOVERY_OS_ARCHITECTURE.md`. Written after Phase 0 shipped and
before Phase 1 starts, as agreed.

---

## 1. What was delivered

| # | Deliverable | Verified by |
|---|---|---|
| 0.1 | 18 reasoning modules moved to `packages/reasoning`, imported by both server and browser | Backend loads the graph and runs `netInfluence`; 88 tests moved with them and pass |
| 0.1 | `layerGuard.test.mjs` — L3 purity and world separation enforced statically | 6 tests; mutation-tested |
| 0.2 | Content-addressed graph snapshots, persisted evidence, artifact gate | 23 tests; all five refusals mutation-tested |
| 0.3 | `/api/reasoning`, tenancy resolved in one function | 21 tests; isolation mutation-tested |
| 0.4 | Evidence reaches the server without breaking local-first | 9 tests; both honesty failures mutation-tested |

Counts: **reasoning 88 · frontend 780 · backend suites touched 147**, all green.
Frontend went 859 → 771 → 780 (88 moved out, 9 added).

Four defects were found by the tests, all mine, all fixed rather than
worked around: `validation.valid` against a `{ ok }` return (every evidence POST
would have failed); a fixture using an invented tier vocabulary; a tenancy test
that passed with the guard removed; and a dispute fixture missing the comment
`submitReview` correctly requires.

---

## 2. Three things Phase 0 changed in the architecture

### 2.1 The build-step problem disappeared

The design assumed the shared reasoning core would need a build or a checked-in
bundle, following the repo's existing `compute:bundle` pattern. Node 22.18+
strips types on import, so the server reads the same `.ts` source the browser
does — no build, no generated artifact, no drift, and no `*:check` guard needed
to police a copy.

**Consequence for later phases:** every future shared module can be plain
TypeScript in `packages/reasoning`. The cost is a hard floor of Node ≥ 22.18,
now declared in `engines`. This is worth naming as a real constraint: it rules
out deployment targets stuck on older Node.

### 2.2 Phase estimates were too high

Phase 0 was budgeted at 1–2 weeks. It took hours. The reason is worth recording
because it changes how much to trust the rest of the roadmap: the reasoning core
turned out to be genuinely pure already — no React import, no DOM access, no
clock, one type-only dependency on a UI package. Whoever wrote it kept the
discipline without a guard forcing them to.

**Consequence:** treat the remaining estimates as upper bounds where the code
already exists and is clean, and as unchanged where it does not exist at all
(Timeline, Virtual Laboratory cost model, replay diff).

### 2.3 A design flaw the document missed, and it matters for Phase 1

The document said snapshots exist so that "reviews stay attached to the claim
they were actually about". **The implementation does not achieve that**, and
building Phase 1 on top of it would bake the flaw in.

What actually happens today:

- `edge_reviews.edge_key` is `from→to→kind`.
- A snapshot stores edges under the same key.
- A curation change produces a new snapshot — but the review still points at the
  bare key, so it silently attaches to the **new** version of the edge.

The failure mode: an edge is confirmed by three experts. The mechanism is later
re-curated and its `effect` flips from `promotes` to `counteracts`. The three
confirmations follow the key onto the reversed claim, and `edgeStatus` reports an
expert-confirmed edge that no expert ever confirmed.

This is exactly the class of error the platform exists to prevent, so it must not
wait. Three options:

| Option | Behaviour | Verdict |
|---|---|---|
| A — key only (today) | Robust to typo fixes; silently transfers verdicts across substantive changes | **Unacceptable** |
| B — (snapshot, key) | Any curation change invalidates every review | Too brittle — one typo fix destroys the ledger |
| C — key + per-edge content hash | A change to *this* edge marks its reviews "reviewed against a previous version"; unrelated edits do nothing | **Correct** |

Option C is cheap now — the per-edge hash is a column and a comparison — and
expensive later, once verdicts have accumulated under the wrong model. **It is
the first item of Phase 1.**

Note that `orphanReviews()`, written in Phase 0.2 to catch typo'd edge keys,
already found the *adjacent* problem. It reports keys that resolve to nothing. It
cannot report keys that resolve to something different from what was reviewed.

---

## 3. Decisions that need you

### 3.1 The tenancy default

Evidence currently lands in a **personal tenant** (`user:<id>`) unless the caller
names a project they belong to. That is honest isolation, but it means two
scientists in the same lab cannot see each other's evidence without someone
creating a project first.

Phase 1 should either (a) create a default shared workspace on registration, or
(b) leave personal as the default and make "share this evidence" an explicit act.
(b) is safer and matches the review-first philosophy; (a) is friendlier. I lean
to **(b)**, because evidence that silently becomes visible to a lab is a privacy
surprise, and the ledger — which is public by design — is where sharing is
supposed to happen.

### 3.2 What Phase 1 covers

The architecture put the Living Knowledge Graph in Phase 1. Phase 0 suggests
splitting it:

1. **1a — per-edge content hashing and review versioning.** The flaw in §2.3.
   Small, urgent, blocks correctness of everything downstream.
2. **1b — `graph_claims` / `claim_revisions`, confidence over time, contradiction
   detection.** The full temporal graph as designed.

1a should ship on its own and be reviewed before 1b starts, for the same reason
Phase 0 was: it is where a silent error would do the most damage.

---

## 4. What did not change

The invariants held under contact with the code and are worth restating because
they are what the platform is:

- **The reasoning is pure and now provably so.** Not a convention — a test that
  fails when someone adds a clock.
- **The gate refuses at the write.** Provenance, two-axis uncertainty, refusals,
  review status. All five refusals fail loudly when deleted.
- **No endpoint accepts an artifact from a client.** A test asserts the POST 404s
  and the table stays empty, because an absent endpoint is easy to add back by
  accident.
- **The network effect is not a module.** Phase 0 added `orphanReviews` and
  content-addressed snapshots — both exist only to keep the ledger trustworthy.

---

## 5. Recommendation

Ship 1a before anything else, then review again. The rest of Phase 1 is
substantial work that should not be built over a ledger that can transfer a
verdict onto a claim nobody made.
