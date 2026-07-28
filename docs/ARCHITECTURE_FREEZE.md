# Architecture freeze

Every module classified once, at the production freeze. **No new modules were
created.** Nothing here proposes a feature; the only verdicts available are
KEEP, MERGE, REMOVE and DEFER.

Measured at the freeze commit against the real import graph, treating both the
HTTP server *and* every CLI script as entry points.

---

## Reachability, measured

| | Backend `.mjs` (non-test) |
|---|---|
| Total production modules | **129** |
| Reachable from the HTTP server or a CLI script | **113** |
| No entry point at all | **16** |

### A correction to an earlier figure

Previous documents reported *"31 of 48 cognitive modules unreachable."* That was
true as stated — it counted HTTP reachability only — and misleading without the
caveat, because most of those are script-invoked tooling, which is the correct
shape for tooling. Counting scripts as entry points, the honest figure is **10 of
48 cognitive modules with no entry point at all**. The earlier number has been
corrected in the README, the capability report and the roadmap rather than
quietly dropped.

---

## The 16 modules with no entry point

### KEEP — reachable by design, just not by import

| Module | Lines | Why |
|---|---|---|
| `compute/computeWorker.mjs` | 44 | Loaded by path in a `Worker` constructor (`computePool.mjs`), not by `import`. Static analysis cannot see it; it is live in production |

### DEFER — blocked on data, not on code

| Module | Lines | Why |
|---|---|---|
| `lookingGlass/pubmed.mjs` | 302 | PubMed client. Unreachable because no corpus exists; NCBI is unreachable from the build environment |
| `lookingGlass/swanson.mjs` | 256 | Literature-based discovery. Needs a corpus |
| `lookingGlass/benchmark.mjs` | 307 | The retrospective benchmark harness. Needs a corpus and a pre-registered target list |
| `lookingGlass/preregistration.mjs` | 156 | Enforces the benchmark's target fingerprint. Meaningless without a benchmark run |

**1,021 lines, fully tested, waiting on one thing that is not code.** Deleting
them would delete the only path to validating the platform's central claim.
Wiring them to an API would expose an interface with nothing behind it.

### DEFER — tested libraries with no current consumer

| Module | Lines | Note |
|---|---|---|
| `cognitive/autonomousLoop.mjs` | 75 | Superseded in intent by the Discovery Engine, which the roadmap chose over an autonomous agent |
| `cognitive/computeOrchestrator.mjs` | 101 | Overlaps `compute/computePool.mjs`, which is live |
| `cognitive/denovoDesign.mjs` | 117 | Molecular generation; no campaign path reaches it |
| `cognitive/leadOptimization.mjs` | 94 | Same |
| `cognitive/fepEngine.mjs` | 43 | Free-energy perturbation; capability-gated, never invoked |
| `cognitive/bioFoundation.mjs` | 74 | Biological foundation-model adapter; no model configured |
| `cognitive/preflightGate.mjs` | 82 | Campaign pre-flight checks |
| `cognitive/realityBridge.mjs` | 50 | Bridge to physical-experiment records |
| `cognitive/reasoningContracts.mjs` | 90 | Contract declarations for the campaign reasoner |
| `cognitive/resourceLayer.mjs` | 48 | Resource accounting |
| `campaign/campaignBlocker.mjs` | 50 | Blocker dossier builder |

**824 lines across 11 modules.** All tested; none reachable by a user.

**Verdict: DEFER, not REMOVE — and the reason is stated so it can be
overturned.** Deleting 824 lines of passing, documented code during a freeze
trades a small tidiness gain for the risk of removing something a later campaign
path needs. Deleting them is a one-line `git rm` whenever someone decides the
campaign stack is not coming back. Keeping them undecided *forever* is the
failure mode, so this document is the decision record: **they stay, they are
listed, and they are not claimed as product anywhere.**

---

## Everything else

| Group | Verdict |
|---|---|
| `packages/reasoning` (19 modules) | **KEEP.** L3, pure, statically enforced, 88 tests |
| `backend/src/reasoning` (9 modules) | **KEEP.** L2/L4 — store, living graph, graveyard, engine, replay, timeline, criticality, tenancy |
| `backend/src/edgeReview.mjs` | **KEEP.** The moat |
| `backend/src/lookingGlass` (2 remaining) | **KEEP.** `store.mjs` and `mesh.mjs` are used by the deferred four |
| `backend/src/compute` | **KEEP.** Real RDKit and ADMET-AI |
| `backend/src/cognitive` (37 reachable) | **KEEP as internal libraries.** Not exposed, not claimed as product |
| `backend/src/{store,api,server,auth,provenance,lib}.mjs` | **KEEP.** L1 substrate |
| `packages/frontend` | **MERGE, per the consolidation.** 16 navigation items should become 5. That is a product change and is *not* part of this freeze |

## No REMOVE verdicts

Nothing was deleted at the freeze. That is a deliberate choice and worth stating:
every candidate for removal is either tested and possibly useful (the 11
deferred), blocked on data (the 4 Looking Glass modules), or invisible to static
analysis but live (`computeWorker`). Removing code during a freeze, to make a
count look better, is how a freeze introduces the bug it was meant to prevent.
