# Roadmap

**The engineering is not the bottleneck, and has not been for some time.** This
document says what is done, what is worth doing next, and — the longest section —
what will not be built and why.

Everything here is measured against the repository, not against a plan. The
supporting analysis is in
[`docs/GENESIS_CONSOLIDATION.md`](docs/GENESIS_CONSOLIDATION.md) and
[`docs/GENESIS_CAPABILITY_REPORT.md`](docs/GENESIS_CAPABILITY_REPORT.md).

---

## Done

| Phase | Delivered | Capability it added |
|---|---|---|
| **0** | Reasoning core moved out of the browser into a shared package; evidence persisted; the artifact gate | Anything Genesis concludes can be stored, cited, reviewed and replayed |
| **1a** | Expert verdicts bound to the exact content version reviewed | The review ledger can be trusted — a re-curated edge no longer inherits old confirmations |
| **1b** | Living knowledge graph: append-only beliefs, causes, rules, contradiction detection | *"Why does Genesis believe this, and what changed it?"* is answerable |
| **2** | Hypothesis graveyard — per-tenant memory of refuted and unreplicated claims | The only capability that grows more valuable with use and cannot be copied |
| **3** | Knowledge timeline over four append-only sources | How a workspace's understanding moved, and what moved it |
| **5** | Discovery Engine — the eight-stage composer, plus the Ask screen | Eight tested libraries became one product |
| **6** | Replay and diff | *"Same question, six months later — here is what changed and why"* |
| **—** | Edge criticality and answer-driven review priority | The ask to an expert drops from 66 unranked edges to the 3 that decide the output |

## Deliberately eliminated

Two planned phases were cancelled after analysis rather than built:

- **AI Scientist.** Not a module — it is the Discovery Engine plus a scheduler
  plus the review gate. A separate autonomous agent layer would add the least
  defensible component in the design while duplicating what already exists, and
  an agent that emits confident scientific prose is precisely what this platform
  is built not to be.
- **Global Discovery Network as a phase.** It is already an invariant: invites,
  membership, a public review ledger, reviewer credit and explicit opt-in
  sharing all exist. What it lacks is people, which is not an engineering task.

---

## Next, if engineering continues

Ordered by value. **None of these changes the platform's binding constraint.**

1. **The remaining product surfaces — Graph, Evidence, Memory.** Ask exists; the
   other three of the five-item navigation do not. Most of what was built after
   Phase 0 has no user interface, which is the largest gap between what Genesis
   *does* and what a visitor can *see*.
2. **Decide the 31 unreachable cognitive modules.** Keep as internal libraries
   (correct for most) or delete. An undecided module is worse than either.
3. **Navigation consolidation.** 16 sidebar items, 30 routes, three separate
   graph screens, two memory concepts, four discovery surfaces. The plan is in
   `GENESIS_CONSOLIDATION.md` Part 2.
4. **Corpus ingest, when a networked host is available.** The code is written and
   fixture-tested; NCBI and NLM are unreachable from the development environment.
   This is the only Data-column blocker that engineering can remove, and it
   cannot be removed from here.

---

## Never

Rejected on principle. Each of these would make a demo better and the platform
worse.

- **A chatbot front door.** It contradicts the thesis, and there are already
  three AI surfaces slated for removal.
- **Automatic contradiction resolution.** The conflict *is* the finding. The
  platform is not entitled to decide which of two disagreeing claims is right.
- **Cross-tenant failure sharing.** Commercially seductive, legally hazardous,
  and it would destroy the per-tenant moat it appears to strengthen.
- **Text-similarity matching in the graveyard.** A false *"you already tried
  this"* suppresses a live hypothesis invisibly; a false *"this is novel"* wastes
  one experiment. The errors are not symmetric, so the matching is not either.
- **Confidence updated by a hidden rule.** Every number names the rule that
  produced it, or it is not stored.
- **Cost estimates in currency.** `TIER_EFFORT` carries planning bands and says
  in its own comment that they are not costs. Inventing prices would be the
  fastest way to make the module dishonest.
- **Any efficacy claim.** A test asserts the Discovery Engine's output never
  contains "therapy works", "is safe", "clinically proven" or their neighbours.

---

## What engineering cannot fix

This is the part of the roadmap that matters most.

| Blocker | Can code fix it? |
|---|---|
| No expert has filed a single review | **No.** The ledger, versioning, credit, worklist, deep links and priority ranking are all built and unused |
| The retrospective benchmark has never been run | **No.** It can be executed — its *outcome* is not ours to choose, and it may fail |
| No corpus | **Only with network access**, which the development environment does not have |
| No wet-lab validation of any output | **No** |
| No paying customer, no pricing validation | **No** |
| The mechanism graph is small and single-curator | **No** — expanding it without review would make the problem worse, not better |

**The single highest priority is not a feature.** It is one named domain expert
filing one review, and the retrospective benchmark being run once with its result
published — including if that result is negative.

Everything defensible in Genesis is 100% built and 0% used. If engineering
continues at full speed and neither of those two events happens, Genesis in six
months is a larger, more elegant, equally unproven platform.
