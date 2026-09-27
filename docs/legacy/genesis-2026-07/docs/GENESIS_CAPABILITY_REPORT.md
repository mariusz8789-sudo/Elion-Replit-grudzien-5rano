# Genesis — Capability Report

**Method.** Every number and claim below was measured against the repository at
commit `9865929`, not recalled. Where a capability is partial, it says so. Where
something is planned and does not exist, it says that instead of describing it in
the present tense. Nothing here should be repeated to an investor without the
qualifier attached to it.

**The single most important fact, stated first:** the production database
contains **4 users, 0 projects, 0 campaigns, 0 expert reviews and 0 evidence
records**. Genesis is a working system with no users and no data in it. Every
capability described below is demonstrated by tests, not by usage.

> **Superseded in part.** This report was written at commit `9865929`. Phases 5
> (Discovery Engine), 6 (replay + diff) and 3 (knowledge timeline) were built
> afterwards, and the Ask screen gave the engine a user interface. See
> `GENESIS_CONSOLIDATION.md` §7. Three gaps named in §6 below are now closed —
> "no Discovery Engine", "no replay API", and "no UI for anything built after
> Phase 0.4" (partly: Ask exists, Graph/Evidence/Memory do not). Everything in
> §7 (scientific gaps) and §8 (commercial risks) is unchanged, because none of
> it was engineering.

---

## 0. What was measured

| | Production code | Test code |
|---|---|---|
| `packages/backend` | 23,985 lines / 125 files | 14,173 lines / 106 files |
| `packages/frontend` | 42,987 lines / 246 files | 7,735 lines / 78 files |
| `packages/reasoning` | 5,361 lines / 19 files | 844 lines / 2 files |
| **Total** | **72,333 lines** | **22,752 lines** |

Test suites, measured at this commit: **backend 1192 (1189 pass, 0 fail, 3
skipped by design into an isolated pass that runs 7/7) · frontend 780 ·
reasoning 88 — 2,067 tests, 0 failures.** The ratio of test to production code
is roughly 1:3, which is high, and the tests are unusually adversarial: they
pin refusals and failure modes rather than happy paths, and several exist to
assert that something does NOT happen (an endpoint that must 404, a verdict
that must not transfer, a record that must not be reported as saved).

---

## 1. How Genesis evolved, phase by phase

The user asked what each completed phase *added*. Short answers, then the audit.

### Phase 0 — the reasoning core became a real system component
**Before:** the 18 modules that do the actual science ran only in a browser tab.
Evidence lived in React state and vanished on refresh.
**After:** they are a shared package (`@genesis-os/reasoning`) that the server
imports and runs. Evidence persists with provenance and a recorded grading
version. Every conclusion the platform stores must carry provenance, two-axis
uncertainty, a refusals list and a review status, refused at the write if absent.
**New capability:** anything Genesis concludes can now be stored, cited,
reviewed and replayed. Nothing could be before.

### Phase 1a — verdicts became version-bound
**Before:** an expert review pointed at an edge key. Re-curating the edge
transferred every verdict to the new version.
**After:** a review records the content hash of what it reviewed. Only matching
reviews count.
**New capability:** the review ledger can be trusted. Without this, an edge could
report "confirmed by three experts" after a sign flip that none of them saw.

### Phase 1b — belief became a history
**Before:** a mechanism edge was true or it was not.
**After:** each tenant holds beliefs over the shared graph, every change is an
append naming its cause *and the rule that produced the number*, and
contradictions are detected as a live query.
**New capability:** "why does Genesis believe this, and what changed it?" is
answerable. Confidence curves can be interrogated point by point.

### Phase 2 — failure became an asset
**Before:** failed molecule campaigns were remembered (`cognitive/necropolis`);
failed *hypotheses* were not remembered at all.
**After:** a per-tenant graveyard of refuted, unreplicated and retracted claims,
with the lesson attached and structural-only matching.
**New capability:** the platform can say "this laboratory already tried this, here
is what killed it" — the only capability here that gets *more* valuable every
month and cannot be copied by a competitor.

---

## 2. Module-by-module audit

Legend for readiness: **Production** = wired to the HTTP surface, tested,
usable. **Library** = tested code with no user-facing path. **Blocked** = built
correctly but cannot run in this environment. **Planned** = does not exist.

### 2.1 Reasoning core — `packages/reasoning` (19 modules, 5,361 lines)

| | |
|---|---|
| **What it does** | Signed mechanism graph over 10 ageing hallmarks; two-axis evidence grading; cancer-safety composition; value-of-information experiment ranking; species translation; cell-state modelling; reprogramming windows; a scientific critic |
| **Problem solved** | Turning "is this therapy promising?" (not answerable) into "what should be investigated next, and why?" (answerable, auditable) |
| **How it works** | Pure functions, data in / verdict out. Signed digraph algebra: `promotes`/`counteracts` multiply along paths; an odd count of `counteracts` means net counteracts; opposite-sign paths are reported as a detected conflict and **never averaged** |
| **Readiness** | **Production.** 88 tests, enforced pure by a static guard (no I/O, no clock, no randomness, no DOM) |
| **Differentiator** | The two-axis grading. Every competitor collapses study quality into one score. Genesis keeps *strength* (does the study support its own conclusion in its own system) apart from *humanRelevance* (does it transfer to a human), because a worm study can be strong and barely transferable, and one number cannot say that |
| **Who pays** | Longevity biotechs, academic ageing labs, VC scientific diligence |
| **Demo** | `netInfluence('telomere-attrition', 'genomic-instability')` returns a verdict plus every signed path behind it, including conflicting ones |

### 2.2 Review ledger — `edgeReview.mjs` + Phase 1a versioning

| | |
|---|---|
| **What it does** | Named domain experts file `confirm` / `dispute` / `refine` / `insufficient-expertise` verdicts on individual mechanism edges, bound to the exact version reviewed |
| **Problem solved** | A curated graph is only worth what its curation is worth. This makes curation attributable and contestable |
| **How it works** | Status is **derived on every read, never cached**. One dispute outweighs any number of confirmations — it names a problem the confirmations do not answer. Verdicts do not transfer across a re-curation; a dispute cannot be cleared by re-wording |
| **Readiness** | **Production, and empty.** The instrument works; nobody has used it |
| **Differentiator** | "I am not the right expert" is a first-class answer, so the graph can say which edges need a different specialist instead of filling with confident noise. Reviewer contribution is exportable as CV-citable credit |
| **Who pays** | Nobody directly. This is the moat, not the product — it makes everything downstream defensible |
| **Demo** | Deep link `#/review?edge=…` opens one edge, readable without an account |

### 2.3 Reasoning persistence — `reasoning/store.mjs`

| | |
|---|---|
| **What it does** | Content-addressed graph snapshots, persisted graded evidence, the artifact gate, replay keys |
| **How it works** | A snapshot's id **is** the hash of its content, so re-seeding is a no-op and a curation change supersedes rather than replaces. `inputs_hash` excludes the clock and the author, so the same question over the same inputs hashes identically next year |
| **Readiness** | **Production.** 23 tests; all five refusals verified by deletion |
| **Differentiator** | The gate. It refuses uncertainty collapsed into one number, an absent refusals list, and any artifact asserting its own review status — the platform cannot mark its own output expert-confirmed |
| **Demo** | Two artifacts sharing an `inputs_hash` but differing in body = the reasoning changed while the inputs did not |

### 2.4 Living Knowledge Graph — `reasoning/livingGraph.mjs`

| | |
|---|---|
| **What it does** | Per-tenant beliefs over the shared graph, append-only revisions, contradiction detection, confidence timelines |
| **How it works** | Every revision names a cause from an audited vocabulary, a reference to what moved it, and **which rule turned that into a number** |
| **Readiness** | **Production** (backend). **No UI.** |
| **Differentiator** | Contradictions are detected and never resolved automatically. A resolved conflict is *still shown* — resolving records a judgement, it does not erase the disagreement |
| **Who pays** | Biotech R&D teams tracking why a programme's confidence moved |
| **Demo** | `GET /api/reasoning/timeline` returns one point per revision — never resampled, because interpolating would draw a line through moments when nobody believed anything in particular |

### 2.5 Hypothesis graveyard — `reasoning/graveyard.mjs`

| | |
|---|---|
| **What it does** | Remembers refuted, unreplicated and retracted hypotheses with the lesson attached |
| **How it works** | Matching is **structural only** — exact triple, reversed direction, or same pair. No text similarity, deliberately |
| **Readiness** | **Production** (backend). **No UI.** |
| **Differentiator** | The asymmetry argument: a false "already tried" suppresses a live hypothesis *invisibly*, while a false "novel" wastes one experiment. So the matching is conservative by design, and the reversed direction is reported as a different claim rather than the same one |
| **Who pays** | Any laboratory with more than two years of history. Switching cost rises every month |
| **Demo** | `POST /api/reasoning/graveyard/assess` returns a graded verdict plus the graves behind it, so a scientist can disagree |

### 2.6 Looking Glass — `lookingGlass/` (6 modules)

| | |
|---|---|
| **What it does** | PubMed ingest, MeSH vocabulary with establishment dates, Swanson ABC literature-based discovery, a retrospective benchmark harness |
| **Readiness** | **Blocked.** Parsers written from published DTDs and tested against fixtures; `eutils.ncbi.nlm.nih.gov` and `nlmpubs.nlm.nih.gov` both return 403 through this environment's egress proxy. **No corpus exists.** `verifyAgainstLive()` exists and has never been run |
| **Differentiator** | The benchmark refuses to run without a pre-registration whose target fingerprint it checks, and a "hit" requires beating frequency-matched controls, not merely appearing in the output. Designed so a negative result is publishable |
| **Honest status** | This is the most scientifically ambitious module and the least demonstrable. **It has never processed a real paper** |

### 2.7 Campaign / molecular stack — `cognitive/` (48 modules)

| | |
|---|---|
| **What it does** | Molecular discovery campaigns: ADMET prediction, off-target, docking, molecular dynamics, de-novo design, candidate funnels, per-tenant failure regions |
| **Readiness** | **Mixed.** Of 48 modules, 17 are reachable from the HTTP server. **Corrected at the production freeze:** counting CLI scripts as entry points too, only **10 of the 48 have no entry point at all**. The earlier figure of 31 was true as stated (HTTP only) and misleading without that caveat — most of the rest are script-invoked tooling, which is the correct shape for them |
| **What that means** | ~6,500 lines of tested, working library code with no user-facing path. It is not dead code (it passes ~1,000 tests) and it is not product either |
| **Genuinely production** | ADMET-AI (real D-MPNN ensemble on TDC benchmarks), RDKit physicochemistry, `necropolis` (per-tenant failure regions), `truthEngine`, `laboratoryReadiness` |
| **Who pays** | Small-molecule discovery teams — the conventional, crowded market |

### 2.8 Frontend — 30 routes, 246 files

Includes `#/longevity` (12 tabs), `#/review`, `#/knowledge-graph`, `#/campaigns`,
`#/drug`, `#/labs`, `#/investor`, `#/timeline`, plus 13 interactive physics
laboratories.

**Physics validation is the one externally checkable result in the whole
platform:** equilibrium temperature within **0.23 K** of NASA reference across 6
bodies (110–440 K), escape velocity worst case **1.14%**, semi-empirical mass
formula within **0.118 MeV/nucleon** for A≥40. Three known failures are pinned by
tests rather than hidden.

---

## 3. What is integrated, and what is not

### Integrated and reachable by a user
Auth · projects · campaigns · invitations · compute (RDKit, ADMET) · science
endpoints · review ledger · reasoning graph, evidence, claims, contradictions,
timeline, graveyard · billing · 13 physics labs · longevity workspace

### Built, tested, and NOT reachable by a user
- **31 of 48 cognitive modules** — including `autonomousLoop`, `missionPlanner`,
  `agentFabric`, `criticSwarm`, `hypothesisEngine`, `metaOrchestrator`
- **Looking Glass in its entirety** — no corpus, no API surface
- **Living graph and graveyard** — backend complete, no UI
- **Evidence sharing** — endpoint complete and tested; the frontend never sends a
  `projectId`, so it currently has no caller

### The three worlds problem
`cognitive/`, `lookingGlass/` and `reasoning/` do not import each other. That
separation is now deliberate and enforced by a static test, but it also means
**the molecular stack cannot see the literature, and the literature cannot see
the mechanism graph.** Bridging them is the Discovery Engine, which is Phase 5
and does not exist.

---

## 4. Ten strongest competitive advantages

1. **A review ledger where one dispute is never outvoted.** Every comparable
   platform aggregates expert opinion into a score. Averaging destroys the most
   informative signal present.
2. **Verdicts bound to the exact version reviewed.** Competitors that curate
   graphs and collect expert feedback almost certainly transfer verdicts across
   edits, because doing it correctly requires deciding this before the ledger
   fills.
3. **Two-axis evidence grading, never merged.**
4. **The artifact gate.** Refusal enforced at the write, not by convention.
   Uncertainty collapsed into one number is rejected.
5. **Refusals as a first-class output.** What the engine declined to conclude is
   stored alongside what it did.
6. **Per-tenant failure memory that compounds.** Cannot be copied — it is the
   customer's own history.
7. **A benchmark designed so failure is publishable.** Pre-registration is
   verified by fingerprint, not cited. Nobody in this space publishes failures,
   which is why nobody believes the successes.
8. **Provenance with checksums** on the MeSH release, the corpus and every
   artifact — a run reproducible by someone who does not trust the authors.
9. **Mutation-verified refusals.** Every refusal added in Phases 0–2 was checked
   by deleting it and confirming tests turn red — 34 such checks, each recorded
   in the commit that introduced it. **Caveat to state plainly:** this was a
   development practice, not a re-runnable suite in the repository. The
   refusals and their tests are in the code; the mutation runs are in the git
   history. Making it a standing CI job is open work.
10. **A physics engine validated against NASA reference data** — an unusual,
    externally checkable credibility anchor.

## 5. Ten monetization opportunities

Ordered by how close each is to being sellable **today**.

| # | Opportunity | Status | Buyer |
|---|---|---|---|
| 1 | ADMET + off-target prediction API | Working now | Small-molecule teams |
| 2 | Laboratory-readiness assessment | Working now | Preclinical CROs |
| 3 | Provenance-certified reasoning artifacts | Backend done, no UI | Regulatory-facing biotech |
| 4 | Per-tenant failure memory (subscription) | Backend done, no UI | Any lab with history |
| 5 | Expert review network, sponsored curation | Instrument built, empty | Foundations, consortia |
| 6 | Retrospective-benchmark diligence for VCs | Harness built, unrun | Life-science VC |
| 7 | Replay / artifact diff ("what changed since March") | Data model ready, API not built | Pharma portfolio review |
| 8 | Literature-based discovery seats | Blocked — no corpus | Ageing biotech |
| 9 | Educational physics/biology labs | Working now | Universities, EdTech |
| 10 | Contradiction monitoring over a company's own graph | Backend done, no UI | R&D leadership |

**Honest note:** items 1, 2, 9 are sellable today and are the *least* defensible.
Items 4, 5, 7 are the moat and are not yet sellable. That gap is the central
commercial problem.

## 6. Biggest technical gaps

1. **10 of 48 cognitive modules have no entry point at all** (revised down from
   31 once CLI scripts were counted as entry points). All ten are tested; none
   is reachable by a user.
2. **No Discovery Engine.** The eight-stage flow that would compose the three
   worlds is designed, not built.
3. **No UI for anything built after Phase 0.4** — claims, contradictions,
   timeline, graveyard, sharing.
4. **No replay API**, despite the data model supporting it.
5. **The Discovery Score does not discriminate on an empty database** — 3 of 6
   components constant, all 37 hypotheses scoring novelty 95. Known, unfixed.
6. **ADMET tests require isolated execution** (documented in `TECH_DEBT.md`).
7. **Two parsers never verified against live servers** (PubMed, NLM).

## 7. Biggest scientific gaps

1. **No corpus.** Looking Glass has never seen a real paper.
2. **No expert reviews.** The ledger is built, tested and empty. This is the
   binding constraint on the entire thesis, and no amount of engineering removes
   it.
3. **The retrospective benchmark has never been run**, so the central claim —
   "Genesis would have pointed at discoveries before they were made" — is
   **unevidenced**. It may fail.
4. **No pre-registered target list**; writing one requires a domain expert.
5. **The mechanism graph is small** — 10 hallmarks, tens of edges, all
   single-curator and none reviewed.
6. **No wet-lab validation of anything.**

## 8. Biggest commercial risks

1. **Empty-network risk.** Both moats (review ledger, failure memory) are worth
   nothing until people use them. A platform whose defensibility begins at first
   use has a cold-start problem, not a moat, until the first user arrives.
2. **The benchmark may fail.** Betting the pitch on it before running it is the
   largest unforced error available.
3. **Demo-vs-moat inversion.** What is sellable today is commodity; what is
   defensible is not yet demonstrable.
4. **Single-curator graph.** Today the "expert-curated mechanism graph" is one
   author's assertions with a review instrument attached and nobody using it.
5. **Two blocked integrations** on which several claims depend.
6. **Breadth risk.** 72k lines across physics education, drug discovery,
   longevity reasoning and literature mining. An investor will reasonably ask
   which company this is.
7. **Key-person concentration.**

---

## 9. One-page investor summary

**What Genesis is.** A scientific reasoning platform for ageing biology that
refuses to tell you a therapy works. It answers a different question — *what
should be investigated next, and why* — and makes every answer auditable: what it
was based on, how uncertain it is on two separate axes, what it declined to
conclude, and which named expert has or has not reviewed the underlying claim.

**Why that is the right product.** Every competitor in AI-for-biology produces
confident scientific prose. None of them is believed by people who can evaluate
it. The scarce asset is not generation; it is trust. Genesis is built around the
constraint that generation is cheap and verification is what compounds.

**What works today.** 72,000 lines of production code under 22,000 lines of
adversarial tests. A pure reasoning core (88 tests, statically enforced
determinism). A version-bound expert review ledger. Content-addressed graph
snapshots with replay keys. Per-tenant belief histories with contradiction
detection. A per-tenant failure memory. Real ADMET/RDKit prediction. A physics
engine matching NASA reference data to 0.23 K.

**What does not.** There is no corpus, no expert review has been filed, and the
retrospective benchmark has never been run. 31 of 48 modules in the molecular
stack are unreachable from the product. Most of what was built in the last three
phases has no user interface.

**The honest thesis.** Genesis has built the hard, unglamorous half — the
provenance, the refusals, the version binding, the failure memory — which is the
half that cannot be retrofitted and which competitors skip because it slows the
demo down. What it has not done is put a single scientist in front of it.

**The next milestone that matters** is not a feature. It is one named biologist
filing one review, and one retrospective benchmark run with its result published
whatever it says.

---

## 10. Direct answers

### If I pitched tomorrow, what can I honestly claim?

**Claim as working:**
- A reasoning core that composes signed mechanism paths and reports conflicts
  rather than averaging them
- Two-axis evidence grading, server-side, with the grading version recorded
- An expert review ledger where verdicts are bound to the exact reviewed version
- Content-addressed graph snapshots, replay keys, per-tenant belief histories
- A hypothesis graveyard with structural matching
- ADMET-AI and RDKit predictions against real models
- Physics validated against NASA reference data
- ~2,000 automated tests; 34 refusals verified by deletion during development,
  recorded in commit messages (not yet a standing CI job)

**Must be presented as future:**
- Any claim that Genesis reads the literature — **it has never processed a
  paper**
- Any claim about retrospective validation — **the benchmark has not been run**
- Any claim about expert consensus — **zero reviews exist**
- The AI Scientist, Discovery Engine, Virtual Laboratory, Global Discovery
  Network, Discovery Timeline — designed, not built
- Any UI for claims, contradictions, timelines or the graveyard

**Do not say** "expert-curated". Say "curated, with an expert review instrument
built and not yet used". The difference will be found in ten minutes by anyone
competent, and being the one to say it first is worth more than the adjective.

### What does Genesis combine that nothing else does?

Four things, in one system:

1. Reasoning that **refuses to conclude** and stores the refusal as output
2. Expert review **bound to a content version**, where one dispute is never
   outvoted
3. **Two-axis uncertainty** that cannot be collapsed, enforced at the database
   write
4. **Per-tenant failure memory** feeding back into what gets proposed

Individually each exists somewhere. The combination is unusual because each one
makes the product *look worse* in a demo — fewer confident answers, more
caveats, more refusals — and is only worth building if trust is the thesis.

### Better than competitors — and worse?

**Better:** provenance and reproducibility; honest uncertainty; conflict
handling; failure memory; test discipline; willingness to publish a negative
result.

**Worse, plainly:** no data at scale; no users; no wet-lab validation; a small
single-curator graph; unreachable modules; no polished UI for the newest and
best work; and a product-surface breadth that reads as unfocused.

### Greatest assets, valued from the implementation alone

1. **The refusal architecture** (34 guards, each verified by deletion). Genuinely
   hard to retrofit, because retrofitting means invalidating everything already
   stored.
2. **The version-bound review ledger.** Correct *before* it filled — the only
   time it can be made correct cheaply.
3. **The reasoning core** — 5,361 lines of pure, deterministic, statically
   enforced scientific logic with 88 behavioural tests.
4. **The test suite itself** (~22,000 lines) — it encodes *why*, not just what.
5. **The graveyard and Necropolis**, as the only components whose value rises
   with use.

Everything else — the engines, the endpoints, the UI — is competent work a good
team could reproduce in months. Those five are the reason to believe.
