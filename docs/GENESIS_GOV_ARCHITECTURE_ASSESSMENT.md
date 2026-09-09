# Genesis GOV — C1 architecture assessment

**Status:** assessment and recommendation. **No code follows from this document
by itself**, and none should until the direction below is a deliberate,
authorized product decision — not an inference from a vision doc.

**Author:** C1 (architecture / integration).
**Input:** `Genesis_GOV_Claude_Mythos_Cyber_Scope.md` (owner-supplied scope).

This document answers three questions and nothing else: (1) what in the GOV
scope Genesis's *existing* architecture already serves, (2) what is a large new
build, and (3) where the security line is and where I stand on it. The
external claims in the source doc about other vendors' products, model classes,
and news events are the owner's framing; none of them are load-bearing for the
engineering below, and I neither validate nor dispute them here.

---

## 1. The one architectural insight that matters

**The GOV "Cyber Discovery Loop" (source §4) is structurally identical to the
science discovery loop Genesis already has.** Put them side by side:

| Science loop (built, `discoveryOrchestrator.ts`) | Cyber loop (source §4) |
|---|---|
| question → admission | "check this system's security" → capability admission |
| choose MECHANISM/PARAMETER strategy | choose a risk-investigation strategy |
| fork world, run solver | run a test in a controlled environment |
| observe objective | observe result |
| falsify against preregistered criterion | confirm/reject a risk hypothesis |
| `deriveAlternativeCriteria` → next hypothesis | generate next hypothesis |
| Evidence Bundle + Replay | Evidence + replay fingerprint |

This is the same relationship chemistry has to epidemiology: **a new DOMAIN and
STRATEGY on the existing engine, not a second engine.** Genesis GOV cyber, done
honestly, is `runDiscovery` with a security-domain strategy whose "solver" is an
authorized analysis/test executor and whose "world" is a Cyber Matrix. Nothing
in the closed loop, the admission gate, the Evidence/Replay contract, the
`StrategyRun` reporting shape, the Matrix join, or the narration layer needs to
be rebuilt for it. That reuse is the whole architectural case for Genesis GOV,
and it is real.

**The corollary is the discipline that protects it:** the moment anyone proposes
a *parallel* cyber engine, a *parallel* evidence path, or a *parallel* belief
model, it is the same mistake this codebase already refused for
`inquiryLoop`/`discoveryLoop` and for `core/discovery/` vs `core/agent/`. One
engine, many domains.

---

## 2. The GOV gap list, classified against the actual code

The source doc's own gap list (§278–297), each item marked against what is in
the repository today — grep-verified, not taken from the doc.

| # | Gap (source) | Reality in code | Class |
|---|---|---|---|
| 1 | Voice Guide | `genesisNarration.ts` (text half) DONE and tested; audio (`speechSynthesis`) is C2's open prompt | **THIN INCREMENT** — in progress |
| 2 | Genesis Matrix | `genesisMatrix.ts` first increment DONE (join over `StrategyRun`+Evidence); space axis + cross-run linking absent | **THIN INCREMENT** |
| 3 | Broad Quest Engine | none — no quest/mission abstraction exists | **MEDIUM** — a layer above the orchestrator |
| 4 | Multiple initial competing hypotheses | none — `deriveAlternativeCriteria` regenerates AFTER falsification; nothing generates a broad initial set | **MEDIUM** — this is roadmap P4 |
| 5 | Model generation / selection | none | **MEDIUM** — roadmap P4/P6 |
| 6 | Long autonomous research loop | partial — `maxRounds` bounded, no checkpoint/resume/priority | **MEDIUM** |
| 7 | Active scientific memory affecting next experiments | partial — `scienceMemory.ts` stores/replays but does NOT feed experiment selection (grep-confirmed: `discoveryLoop` never reads it) | **MEDIUM** |
| 8 | Molecular → cell bridge | absent, and C3 documented it as absent (`TWO_AUTONOMOUS_LOOPS_DECISION.md` §10.1) — not a bug, a named gap | **HONEST GAP** |
| 9 | Production PARAMETER path | `proteinFoldingInquiry.ts` + `chemistry-arrhenius` are real; still no UI caller of `runDiscovery({shape:'PARAMETER'})` | **THIN INCREMENT** |
| 10 | Independent real-world observation loop | none — every "observation" is a solver, never an external sensor | **LARGE** |
| 11 | Physical lab / external executor | none | **LARGE** |
| 12 | Long-running job infrastructure | none | **LARGE (infra)** |
| 13 | Government sovereign stack (SSO/RBAC/ABAC/KMS/audit/air-gap) | none | **LARGE (infra) — product decision** |
| 14 | Cyber Scientist vertical | none | **LARGE — product + authorization decision** |
| 15 | Cyber Matrix / digital twin | none | **LARGE** |
| 16 | Authorized cyber-range execution layer | none | **LARGE — security-sensitive** |
| 17 | Cyber Evidence/Replay | Evidence/Replay exists for science; not extended to cyber | **EXTENSION of a built thing** |

Reading of the table: **items 1–9 are the science platform** — the work this
session has been doing, extensions of an engine that exists. **Items 10–17 are a
different product** with an infrastructure and security dimension that dwarfs the
engine, and several of them cannot honestly be "built" in this repo at all
without real external systems (a sovereign deployment, a real cyber-range, real
authorized targets).

---

## 3. The security boundary — where I stand, stated once and plainly

The source doc is careful, and its own framing is the right one: it repeatedly
scopes cyber to **defense/research in authorized, isolated environments**, keeps
destructive operations and any step outside the sandbox behind **human
approval** (§12), declares **NO SILENT PRODUCTION CHANGE** (§5), and states
plainly that automatically attacking real unauthorized systems or real data
exfiltration **is not the goal** (§210, §343). I take that framing at face
value, and it is the only framing under which I will engage with this at all.

Within it, here is my line, and it does not move:

- **I will help build defensive capability** on codebases and systems the
  operator is authorized to assess: vulnerability *discovery* on an authorized
  repository, threat modeling, the `FIND → VALIDATE → FIX → RETEST → PROVE` loop
  as a defensive research tool. This is legitimate, it is what Claude Code's own
  security work does, and — per §1 — it maps directly onto the existing loop.
  Each finding carries location, evidence, reproducer, proposed fix, retest —
  which is just an Evidence Bundle for a security criterion.

- **I will not build offensive tooling**: no exploit development against real
  targets, no lateral-movement or reconnaissance automation aimed at systems the
  operator does not own, no capability whose primary use is compromising a
  system rather than proving it defensible. The "attack-chain simulation" of §7
  is acceptable **only** as a simulation *inside the Matrix* — a model reasoning
  about hypothetical paths on a digital twin, with no capability to act on a real
  network — and the moment it stops being a simulation and starts being an
  executor against real infrastructure, it is out of scope for me, sandbox
  label notwithstanding.

- **Even the defensive vertical is not something I start on a vision doc.** A
  Cyber Scientist that runs tests needs a real authorized target, a real
  isolated executor, and a real authorization record establishing the operator
  may assess that target. None of those exist in this repo. Standing up a stub
  "cyber range" or a "sovereign stack" with none of the real controls behind it
  would be building the *appearance* of governed security tooling without the
  substance — which is worse than not building it, because it invites trust the
  system has not earned. When there is a real authorized target and a real
  sandbox, that is a scoped engagement with its own brief; it is not this.

This boundary is not an obstacle to the product. It is the same
honesty-contract discipline the science engine already runs on — REAL /
APPROXIMATION / NOT_MODELLED / BLOCKED — applied to the one domain where getting
it wrong has consequences outside a simulation.

---

## 4. What I recommend, and what needs a decision

**The source doc's own build order (§326) puts the science platform first** —
#1 Voice + full Matrix, #2 Broad Quest + multiple hypotheses, #3 Model
generation, #4 Long-running research — and only reaches cyber at #5. That order
is correct, and it happens to be the roadmap already in
`AUTONOMOUS_DISCOVERY_ROADMAP.md`. So the immediate path does not change and does
not require a GOV decision at all:

1. **Finish Voice** (C2 audio over the built narration layer — prompt already out).
2. **Widen the Matrix** (space axis; link successive runs of one investigation).
3. **P4 — broad initial hypothesis generation + model insufficiency** ("the
   declared space does not explain this" as a first-class outcome). This is the
   single most valuable next science increment and it serves every vertical,
   cyber included, because "generate competing risk hypotheses" (source §4.2) is
   the same capability.
4. **Make scientific memory active** (gap #7): let a prior run's result inform
   the next experiment's selection. Today it is written and replayed but never
   read back into the loop — closing that is what turns "adaptive within one
   run" into "learns across runs," and it is a genuine, bounded piece of work.

**What needs a decision from you, not from me:**

- Whether Genesis pivots to a **government/cyber product** at all. That is a
  business and go-to-market decision with a large infrastructure cost (item 13
  alone — SSO, RBAC/ABAC, KMS/HSM, immutable audit, air-gap — is a platform, not
  a feature) and a compliance/authorization dimension. I can advise on
  architecture; I should not choose the direction.

- If yes: the **first honest cyber increment is a defensive one on an authorized
  target you control**, framed as vulnerability *research* producing Evidence
  Bundles, reusing the existing loop — and it starts only with a real target and
  a real authorization record in hand. Not before.

My recommendation: **keep executing the science-platform order (steps 1–4
above), which the GOV doc itself asks for first and which needs no new decision;
treat the government/cyber vertical as a separate, deliberate product commitment
to be made explicitly when you choose to, with the security boundary in §3 as a
precondition, not an afterthought.**

---

## 5. One line to carry forward

Genesis GOV's real advantage, if it is built, is exactly what the source doc
says (§76): AI Scientist + Simulation/Matrix + Evidence/Replay in a sovereign
environment. Every one of those four is a thing Genesis *already has* for
science. The engineering job is never to rebuild them for cyber — it is to add
one honest domain, one honest strategy, one authorized executor, behind the same
admission gate and the same evidence contract that already refuse to overclaim.
The day that domain claims more than it can prove is the day it stops being
Genesis.
