# Genesis — Final Architecture & Product Consolidation

Written as Chief Product Architect, from the repository at commit `25b4e80`.
Every percentage below is an estimate of *implemented surface against a stated
definition of done*, and the definition is given each time so the number can be
argued with. Nothing is assumed.

---

# Part 1 — Remaining roadmap validation

## Phase 3 — Discovery Timeline

| | |
|---|---|
| **Status** | **Partially implemented — ~45%** |
| **Already provides it** | `livingGraph.confidenceTimeline()` returns one point per belief revision carrying `cause`, `cause_ref` and `rule`. `GET /api/reasoning/timeline` is live. `claim_revisions`, `edge_reviews.created_at`, `evidence_records.created_at` and `hypothesis_graveyard.buried_at` are all timestamped and append-only |
| **Genuinely missing** | (a) the timeline only covers *claims* — reviews, evidence and burials are not merged into one stream; (b) no UI |
| **Blocker type** | **Technical, small.** No external dependency |
| **Merge / skip?** | **Do not skip. Merge into Part 2's "Memory" surface** rather than shipping as its own screen |
| **Name collision — act on this** | `#/timeline` and `DiscoveryTimeline.tsx` (323 lines) are already taken by a **cosmology education timeline**, 15 epochs from the Big Bang. Entirely unrelated. Shipping a second "timeline" under that name would be a product bug on day one |

## Phase 4 — Virtual Laboratory

| | |
|---|---|
| **Status** | **Largely implemented in reasoning — ~70% — but not as a product** |
| **Already provides it** | `discovery.ts`: `nextExperiments`, `experimentFrontier` (Pareto), `recommendNextExperiment`, `FEASIBLE_OUTCOMES` (an in-vitro assay cannot measure lifespan), `TIER_EFFORT`, `rankingDegeneracy`. `experimentDesign.ts`: `designExperiment()` producing model systems, controls, endpoints and failure modes. `cognitive/laboratoryReadiness.mjs` is wired to the API |
| **Genuinely missing** | Cost in currency, an equipment model, and persistence — the `experiment_plans` table was designed and never created |
| **Important nuance** | `TIER_EFFORT` carries an explicit comment: *"PLANNING BANDS for prioritisation arithmetic, not costs, durations or prices."* The absence of costing is a deliberate refusal, not an omission. Adding fake currency figures would be the single easiest way to make the module dishonest |
| **Blocker type** | **Commercial/data.** Real costs require real quotes from real CROs |
| **Merge / skip?** | **Merge into the Discovery Engine as its output stage.** It is not a separate destination; it is what an answer ends with |

## Phase 5 — Discovery Engine

| | |
|---|---|
| **Status** | **Not implemented — ~0% composed, ~85% of the parts exist** |
| **Already provides the stages** | 1 resolve → `knowledgeGraph.ts`; 2 recall → `graveyard.assessHypothesis`; 3 read → `lookingGlass.openDiscovery` (**blocked, no corpus**); 4 generate → `discovery.generateHypotheses`; 5 rank → `nextExperiments` (VoI); 6 check → `cancerSafety.analyseCancerSafety`; 7 plan → `experimentFrontier`; 8 emit → `store.recordArtifact` with its gate |
| **Genuinely missing** | The composer itself, and its API. `safeRegeneration.answerCentralQuestion()` is a hardcoded composition for one specific question — proof the composition works, not a general engine |
| **Blocker type** | **Technical only, and small.** It is plumbing over tested parts |
| **Merge / skip?** | **Do not skip. This is the highest-value remaining work in the repository** — it converts eight tested libraries into one product |

## Phase 6 — Replay API

| | |
|---|---|
| **Status** | **Partially implemented — ~60%** |
| **Already provides it** | `inputs_hash` computed excluding clock and author, indexed; `replayHistory()`; `GET /api/reasoning/artifact/:id` already returns the artifact's history |
| **Genuinely missing** | The **diff** — given two artifacts with the same `inputs_hash`, say what changed and why. And re-running a stored question against the current graph |
| **Blocker type** | **Technical only, very small** |
| **Merge / skip?** | Keep. It is the highest moat-per-line item left: *"here is what Genesis concluded in March, here is the same question today, here are the three claims that changed and the papers that changed them."* No competitor can retrofit this without append-only history from the start |

## Phase 7 — AI Scientist

| | |
|---|---|
| **Status** | **Should be ELIMINATED as a phase** |
| **Already provides it** | `cognitive/autonomousLoop`, `missionPlanner`, `agentFabric`, `criticSwarm`, `metaOrchestrator` all exist and are tested — and all five are **unreachable from the HTTP server** and scoped to molecules |
| **Recommendation** | The AI Scientist is not a module. It is **the Discovery Engine plus a scheduler plus the review gate**. Building a separate agent layer would add the least defensible component in the entire design while duplicating what Phase 5 already composes |
| **Blocker type** | Conceptual. Nothing to build |

## Global Discovery Network

| | |
|---|---|
| **Status** | **Already an invariant, not a phase — ELIMINATE** |
| **Already provides it** | `campaign_invites`, `campaign_members`, the review ledger with public read, reviewer credit, evidence sharing with explicit opt-in |
| **Genuinely missing** | Users. That is not an engineering task |
| **Blocker type** | **Expert network.** Zero code will fix it |

## Summary

| Phase | Verdict | Real remaining work |
|---|---|---|
| 3 Timeline | Merge into Memory | Unify four event sources; one UI |
| 4 Virtual Laboratory | Merge into Discovery Engine | Persistence; costing stays refused |
| 5 Discovery Engine | **Build. Highest priority** | The composer + API + UI |
| 6 Replay | Build. Cheapest moat | A diff function + API |
| 7 AI Scientist | **Eliminate** | None |
| ∞ Network | **Eliminate as a phase** | Not engineering |

**Two of six remaining phases should not exist. Two should be merged into
others. The actual remaining roadmap is: the Discovery Engine, replay, and a
user interface for what already works.**

---

# Part 2 — Final Product Architecture

## The problem, measured

The discovery sidebar has **16 navigation items** (`DiscoveryShell.tsx`), the app
defines **30 routes**, and there are **32 top-level components**. Behind them sit
48 cognitive modules of which 31 are unreachable. A scientist opening Genesis
today has to choose between Mission Control, AI Chat, Drug Discovery, Discovery
Forge, Campaigns, Laboratory Readiness, Multi-Agent AI, Knowledge Graph, Compute
Cluster, Scientific Memory, Investor Dashboard, Billing, Truth Engine, Workspace,
Longevity and Expert Review — with no basis for the choice.

## The final navigation — five items

### 1. **Ask**
| | |
|---|---|
| **Purpose** | Submit a scientific question; receive a Discovery Artifact: hypotheses, reasoning paths, competing explanations, uncertainty, missing evidence, next experiments — with provenance and refusals |
| **Target user** | The principal investigator or research lead. The person who arrives with a question, not with a molecule |
| **Powered by** | The whole Phase 5 chain: `knowledgeGraph`, `graveyard`, `discovery`, `cancerSafety`, `experimentFrontier`, `recordArtifact` |
| **Why it exists** | It is the product. Everything else is where you go when you disagree with it |
| **Not duplicated because** | It is the only surface that *composes*. Every other screen shows one layer |

### 2. **Graph**
| | |
|---|---|
| **Purpose** | The mechanism graph, each edge carrying its review status, its version, this workspace's confidence and any contradiction it is part of |
| **Target user** | Domain scientists who want to interrogate or contest the model |
| **Powered by** | `reasoning/knowledgeGraph.ts`, `inference.ts`, `edgeReview`, `livingGraph` |
| **Why it exists** | Trust is inspected here. An answer nobody can drill into is a chatbot answer |
| **Not duplicated because** | **It replaces three separate graph screens** — `#/knowledge-graph` (campaign provenance), the Longevity graph tab, and the unbuilt claims view |

### 3. **Evidence**
| | |
|---|---|
| **Purpose** | Add, grade, share and retire evidence records; see the two axes and what produced them |
| **Target user** | Postdocs and research associates — the people who actually read papers |
| **Powered by** | `reasoning/evidence.ts`, `reasoning/store.mjs`, sharing |
| **Why it exists** | It is the only *input* surface. Without it Genesis has nothing to reason over |
| **Not duplicated because** | It is the sole write path for scientific facts |

### 4. **Memory**
| | |
|---|---|
| **Purpose** | What this laboratory has already tried and buried, what it learned, and how its beliefs moved over time |
| **Target user** | Research leads and anyone joining an ongoing programme |
| **Powered by** | `graveyard`, `livingGraph.confidenceTimeline`, `cognitive/necropolis` |
| **Why it exists** | It is the compounding asset — the only screen that becomes more valuable every month |
| **Not duplicated because** | It **absorbs** `#/scientific-memory`, `#/discovery-log` and the knowledge half of `#/timeline` |

### 5. **Review**
| | |
|---|---|
| **Purpose** | An expert reads one claim and files a verdict, without an account |
| **Target user** | An external domain expert arriving from a cold email. **Not** an existing user |
| **Powered by** | `edgeReview` + Phase 1a versioning |
| **Why it exists** | It is the recruitment instrument and the moat's only input |
| **Not duplicated because** | It is deliberately outside the app — public, linkable, and free of everything else |

**Plus one non-science destination:** *Settings & Billing*, merged.

## What moves out of the product

**`Genesis Labs` — a separate product.** The 13 interactive physics laboratories,
`ScaleJourney`, `RealityNavigator`, `DiscoveryTimeline` (cosmology) and
`#/glossary` are a competent, validated science-education product with a
different buyer (universities, EdTech) and a different sales motion. Keeping
them in the same navigation as a biotech reasoning platform makes both look
unfocused. They should share the codebase and split the front door.

---

# Part 3 — Product simplification

## Duplicated functionality, found in the repository

| Duplication | Evidence | Action |
|---|---|---|
| **Three "graph" screens** | `#/knowledge-graph` (campaign provenance), Longevity graph tab, `livingGraph` claims (no UI) | **Merge into Graph.** They are three views of the same object |
| **Two "memory" concepts** | `#/scientific-memory` (external source registry + campaign learning) and `graveyard`/`necropolis` (failure memory) | **Merge into Memory.** The source registry becomes a settings panel |
| **Four discovery surfaces** | `#/discovery-workspace` (73 lines), `#/discovery-forge` (172), `#/discovery-log` (63), `#/campaign` (458) | **Merge into Ask + Memory.** Three of the four are thin |
| **Three AI surfaces** | `#/ai-chat`, `#/multi-agent`, `#/assistant` | **Remove all three from navigation.** A platform whose thesis is "we do not generate authoritative conclusions" must not have a chatbot as a top-level item |
| **Two timelines** | Cosmology `#/timeline` vs the knowledge timeline | **Rename.** Cosmology moves to Genesis Labs |
| **Investor Dashboard inside the product** | `#/investor` | **Remove.** A screen that exists to impress investors, shipped to scientists, damages the credibility the rest of the platform is built on |

## Unnecessary API surface

- **31 of 48 cognitive modules are unreachable.** Do not "wire them up" — most are
  campaign-pipeline internals that were never meant to be endpoints. **Decide
  explicitly:** keep as internal libraries (correct for ~25 of them), or delete.
  An undecided module is worse than either.
- **`/api/v1`** — a public versioned API with no documented consumers. Keep, but
  it needs an owner or a sunset date.

## What should stay internal

`truthEngine`, `criticSwarm`, `preflightGate`, `modelRouter`, `taskGraph`,
`workflowEngine`, `recovery`, `resourceLayer` — these are correctness machinery.
Users should feel them, never see them. `#/truth-engine` (408 lines) exposing
one of them as a screen is a category error: it shows the audit apparatus
instead of the audited result.

## Net effect

**From 30 routes and 16 navigation items to 5 + settings.** No capability is
lost — every merged screen's function survives inside its destination.

---

# Part 4 — Product tiers

Designed around one principle: **never gate the things that build the moat.**
Review, provenance and refusals must be free forever, because a gated ledger
never fills.

| Tier | Contains | Rationale |
|---|---|---|
| **Free** | Review (no account), read the public graph, one personal workspace, evidence entry, graveyard, ADMET single-molecule | The reviewer and the curious postdoc must never hit a paywall — they are the supply side |
| **Professional** *(per seat)* | Discovery Engine, unlimited artifacts, replay & diff, contradiction monitoring, experiment frontier, export with provenance | The individual researcher's working tool. Replay is the retention feature |
| **Enterprise** *(per org)* | Shared workspaces, org-wide failure memory, private graph extensions, SSO, audit log, on-prem or VPC | Failure memory is the switching cost; it only works org-wide |
| **Research Institution** *(site licence, discounted)* | Everything in Professional for all staff, plus benchmark tooling and publication support | Deliberately cheap. Universities are where reviewers come from — this tier is customer acquisition for the moat, priced as such |
| **Pharmaceutical / Biotech** *(annual, negotiated)* | Everything, plus curated graph extension for their targets, provenance certification for regulatory dossiers, priority expert recruitment | The only tier that pays for the curation itself. Provenance certification is the pharma-specific product and needs regulatory review before being sold as such |

**What must never be gated:** filing a review; reading an edge and its verdicts;
seeing an artifact's provenance and refusals. Gate volume, collaboration and
convenience — never the audit trail.

---

# Part 5 — Long-term vision: what would still block Genesis

## Engineering — *solvable by code alone*
- No Discovery Engine composer (small)
- No UI for Phases 1a–2 (medium)
- No replay diff (small)
- 31 unreachable modules undecided (small, mostly deletion)
- Discovery Score degenerate on an empty database (small)
- ADMET isolated-execution debt (documented, small)

## Scientific validation — *not solvable by code*
- **The retrospective benchmark has never been run.** The platform's central
  claim is unevidenced and may fail
- No wet-lab validation of any output
- The mechanism graph is small and single-curator
- No published methodology paper

## Data — *partially solvable by code, mostly not*
- **No corpus.** The ingest code is written; running it needs egress and ~2–4
  days of unattended fetching. *This one IS solvable by engineering* — it is the
  only item in this section that is
- No real experimental outcomes to learn from
- No licensed proprietary datasets

## Expert network — *not solvable by code at all*
- **Zero reviews. Zero reviewers.** The ledger, the credit system, the
  worklist, the deep links and the versioning all exist and are tested. Nobody
  has used any of it
- No institutional partnership
- No advisory board

## Commercial — *not solvable by code*
- No paying customer, no pricing validation, no case study, no reference
- The sellable features are the least defensible ones

## Legal / Regulatory — *partly solvable, needs counsel*
- No medical-claim disclaimer review, though the architecture refuses medical
  claims structurally
- Licence compliance for DrugBank-class sources is coded as a constraint but
  never exercised
- Provenance certification for regulatory use needs an actual regulatory opinion
- Cross-tenant data policy is enforced in code; it has never been reviewed by a
  lawyer

## The two answers

**What engineering alone can achieve:** every item in Engineering; the corpus;
the entire product simplification; the Discovery Engine; replay. That is
perhaps 8–12 weeks of work and it would produce a **complete, coherent,
demonstrable platform with no users and no scientific validation.**

**What engineering can never achieve, however much code is written:**

1. **The first expert review.** The instrument is finished. It requires a named
   human to disagree with something in public
2. **A benchmark result.** It can be run — but its *outcome* is not chosen by us
3. **Wet-lab confirmation** that any Genesis-proposed experiment was worth doing
4. **A customer**
5. **The credibility that comes from publishing a failure**

This is the honest shape of the problem: **Genesis's remaining engineering work
is measured in weeks; its remaining non-engineering work is measured in years,
and no amount of the former substitutes for the latter.**

---

# Part 6 — Final recommendation

*As CTO, unlimited engineering, no marketing budget.*

## What I would build next, in order

**1. The Discovery Engine (2–3 weeks).** Eight tested libraries become one
product. Without it Genesis is a collection of correct components. With it there
is something to show a scientist in five minutes.

**2. Replay and diff (1 week).** The cheapest defensible thing left. *"This is
what Genesis concluded in March; here is the same question today; here are the
three claims that changed."* Impossible to retrofit without append-only history,
which we have and competitors do not.

**3. The five-item navigation (2–3 weeks).** Genesis currently fails the
five-minute test — not on capability, on legibility.

**4. The corpus (1 week of work, 2–4 days of fetching).** The only Data-section
blocker that engineering can remove. It also unblocks the benchmark.

**5. Run the benchmark and publish the result, whatever it is.**

## What I would never build

- **A chatbot front door.** It contradicts the thesis and there are already three
  AI surfaces to remove
- **Automatic contradiction resolution.** The conflict is the finding
- **Cross-tenant failure sharing.** Commercially seductive, legally hazardous,
  and it destroys the per-tenant moat it appears to strengthen
- **Text-similarity matching in the graveyard.** The asymmetry argument in
  `graveyard.mjs` still holds
- **Confidence auto-updated by a hidden rule.** Every number must name the rule
  that produced it
- **A cost model with invented currency figures.** `TIER_EFFORT` refuses this
  deliberately

## What I would postpone

- Compound-level drug discovery for longevity — the crowded market
- Any Global Discovery Network feature beyond what exists — premature at zero
  users
- Mobile
- The 31 unreachable modules — decide, then postpone the survivors
- Provenance certification — needs a regulatory opinion first

## The single highest priority

**Not a feature.**

> **Get one named domain expert to file one review, and run the retrospective
> benchmark once.**

Everything defensible in Genesis is downstream of those two events. The review
ledger, the versioning, the credit system, the worklist — 100% built, 0% used.
The benchmark harness, the pre-registration enforcement, the MeSH audit — 100%
built, 0% run.

If engineering continues at full speed and neither happens, Genesis in six
months is a larger, more elegant, equally unproven platform. If both happen next
month with the product exactly as it stands today, Genesis has something no
competitor in this space has: **one real expert verdict and one published
benchmark result, including if the result is negative.**

The engineering is not the bottleneck. It stopped being the bottleneck at
Phase 0.
