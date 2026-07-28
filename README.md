# Genesis

**A scientific reasoning platform that refuses to tell you a therapy works.**

Genesis answers a different question — *what should be investigated next, and
why* — and makes every answer auditable: what it rested on, how uncertain it is
on two separate axes, what it declined to conclude, and which named expert has
or has not reviewed the underlying claim.

---

## Read this before evaluating anything

This repository is honest about its own state, which is unusual enough to say up
front.

| | |
|---|---|
| **Code** | ~72k lines of production code under ~22k lines of tests |
| **Tests** | 2,162 · 0 failures |
| **Users** | **0** |
| **Expert reviews filed** | **0** |
| **Literature corpus** | **none — the platform has never processed a real paper** |
| **Retrospective benchmark** | **built, never run** |

Everything below is demonstrated by tests, not by usage. Where a capability is
partial, the documentation says so. Where something is planned, it says that
instead of describing it in the present tense.

The full measured assessment is in
[`docs/GENESIS_CAPABILITY_REPORT.md`](docs/GENESIS_CAPABILITY_REPORT.md).

---

## The thesis

Every competitor in AI-for-biology produces confident scientific prose. None is
believed by people qualified to evaluate it. The scarce asset is not generation —
it is **trust**.

Genesis is therefore built around four constraints that make it look *worse* in a
demo and better in a laboratory:

1. **It refuses, and the refusal is an output.** Every answer carries a list of
   what the engine declined to conclude. The Ask screen prints refusals *above*
   the hypotheses.
2. **Uncertainty has two axes that are never merged.** *Coverage* (how much of
   an answer's mechanisms carry evidence) and *belief* (how much of it a named
   expert has confirmed) are stored separately, and the persistence layer
   refuses an artifact that collapses them into one number. Neither claims to
   measure how much of the published literature was read — nothing here can
   measure that without a corpus.
3. **One expert dispute is never outvoted.** A dispute names a specific problem
   that confirmations do not answer. Averaging expert opinion would destroy the
   most informative signal the system produces.
4. **Nothing is updated in place.** Graph snapshots supersede, evidence retires,
   beliefs revise. That is what makes replay possible — *"here is what Genesis
   concluded in March; here is the same question today; here is what changed."*

---

## What works today

| Capability | Where | State |
|---|---|---|
| Signed mechanism graph, conflict detection | `packages/reasoning` | Production · 88 tests |
| Two-axis evidence grading | `packages/reasoning/src/evidence.ts` | Production |
| Cancer-safety composition | `packages/reasoning/src/cancerSafety.ts` | Production |
| Version-bound expert review ledger | `backend/src/edgeReview.mjs` | Production · **empty** |
| Content-addressed snapshots, artifact gate | `backend/src/reasoning/store.mjs` | Production |
| Living knowledge graph, contradiction detection | `backend/src/reasoning/livingGraph.mjs` | Production · no UI |
| Hypothesis graveyard (per-tenant failure memory) | `backend/src/reasoning/graveyard.mjs` | Production · no UI |
| Discovery Engine (eight-stage composer) | `backend/src/reasoning/discoveryEngine.mjs` | Production · **Ask screen** |
| Replay and diff | `backend/src/reasoning/replay.mjs` | Production · no UI |
| Edge criticality + review priority | `backend/src/reasoning/criticality.mjs` | Production · on the review screen |
| ADMET-AI / RDKit prediction | `backend/src/compute` | Production · real models |
| Physics laboratories | `packages/frontend` | Production · validated to 0.23 K vs NASA reference |

### What does not work

- **Looking Glass** (PubMed ingest, MeSH audit, Swanson discovery, retrospective
  benchmark) is written and tested against fixtures built from published DTDs.
  It has never contacted NCBI.
- **16 of 129 backend modules have no entry point at all** — not reachable from
  the HTTP server *or* from any CLI script. Ten are in the molecular campaign
  stack; four are the retrospective-benchmark toolchain, which is blocked on a
  corpus rather than dead. A further ~45 are reachable only through scripts,
  which is correct for tooling.
- Most capabilities built after the reasoning core moved to the server have **no
  user interface** yet.

---

## Architecture

Five layers. A layer may depend only on layers below it, and this is enforced by
a static test (`backend/src/layerGuard.test.mjs`) rather than by convention.

```
L5  Surfaces        Ask · Graph · Evidence · Memory · Review
L4  Orchestration   Discovery Engine · replay · criticality
L3  Reasoning       @genesis-os/reasoning — PURE: no I/O, no clock, no randomness
L2  Memory          review ledger · graveyard · evidence · corpus
L1  Substrate       store · provenance · auth · compute
```

`packages/reasoning` is imported directly by both the server and the browser —
no build step and no generated artifact that can drift from its source. This
requires **Node ≥ 22.18**, declared in `engines`.

Full design: [`docs/DISCOVERY_OS_ARCHITECTURE.md`](docs/DISCOVERY_OS_ARCHITECTURE.md).

---

## Getting started

```bash
npm install                 # Node >= 22.18 required
npm test                    # reasoning + frontend + backend, then the isolated pass
npm run dev                 # frontend
npm run dev:backend         # API + static server
```

**`npm test` runs two passes.** Three ADMET tests drive a real Python ML
subprocess under a strict 30 s timeout and are serialised into their own pass;
they report as *skipped* in the parallel run, never as passed. A CI pipeline
that runs only the parallel glob will silently skip three real tests of a real
model — see [`docs/TECH_DEBT.md`](docs/TECH_DEBT.md).

---

## Documentation

| Start here | |
|---|---|
| [`docs/GENESIS_CAPABILITY_REPORT.md`](docs/GENESIS_CAPABILITY_REPORT.md) | Measured audit: what works, what does not, what it is worth |
| [`docs/GENESIS_CONSOLIDATION.md`](docs/GENESIS_CONSOLIDATION.md) | Product architecture, roadmap validation, tiers, blockers |
| [`docs/DISCOVERY_OS_ARCHITECTURE.md`](docs/DISCOVERY_OS_ARCHITECTURE.md) | Layers, boundaries, database design, security model |
| [`ROADMAP.md`](ROADMAP.md) | What is done, what is next, what will never be built |
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | What Genesis cannot do |
| [`docs/EDGE_CRITICALITY.md`](docs/EDGE_CRITICALITY.md) | Which claims decide the output |
| [`docs/RETROSPECTIVE_BENCHMARK.md`](docs/RETROSPECTIVE_BENCHMARK.md) | The protocol that would validate the thesis |

The molecular-discovery product line has its own documentation:
[`SCIENTIFIC_ENGINE.md`](SCIENTIFIC_ENGINE.md) ·
[`GROUNDING.md`](GROUNDING.md) ·
[`PROVENANCE.md`](PROVENANCE.md) ·
[`CAMPAIGNS.md`](CAMPAIGNS.md) ·
[`API.md`](API.md) ·
[`DEPLOYMENT.md`](DEPLOYMENT.md) ·
[`SECURITY.md`](SECURITY.md).

Historical audits and superseded reports are kept in
[`docs/history/`](docs/history/) rather than deleted — the record of what was
believed, and when, is part of the evidence.

---

## Engineering standards

Enforced, not aspirational:

- **Fail closed.** Unknown → refuse. A time-sliced corpus rebuild throws without
  a vocabulary guard; an unaudited vocabulary returns nothing rather than
  everything.
- **Refusals are mutation-verified.** Every guard added since the reasoning core
  moved to the server was checked by deleting it and confirming tests turn red.
  A refusal that can be removed with tests still green is not a refusal.
- **Derived, never cached.** Edge status, contradictions, timelines and
  criticality are recomputed on read. A cached scientific judgement eventually
  contradicts its own evidence.
- **Synthetic fixtures are unmistakable.** `FIXTURE-…` article ids, `D9…`
  descriptor UIs, impossible PMIDs. A fixture that leaks into real output must be
  obvious, not plausible.

---

## Licence

UNLICENSED — all rights reserved.
