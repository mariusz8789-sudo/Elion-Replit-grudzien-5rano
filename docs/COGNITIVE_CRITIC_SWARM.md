# Cognitive Ceiling — Milestone 5: Independent Critic Swarm

**Priority 5.** Genesis actively tries to DISPROVE its own hypotheses, and the
component that proposes a hypothesis is **not** the sole authority that accepts it.
No Phase-1 code or scientific engine touched.

## What was built (`cognitive/criticSwarm.mjs`)

An independent swarm of six deterministic critic lenses, each attacking a
hypothesis from a distinct angle, whose votes decide `ACCEPT / REVISE / REJECT`:

| Lens | Fails/concerns when |
|---|---|
| falsifiability | no disconfirming prediction (unfalsifiable) → **fail** |
| contradictory-evidence | an observation satisfies a disconfirming prediction → **fail** |
| alternative-explanation | no competing hypothesis for the question → concern |
| stated-assumptions | assumptions not stated → concern |
| evidence-sufficiency | predicted metric never observed (untested claim) → concern |
| numerical-stability | non-finite metric values → concern |

- **Decision rule:** falsifiability or contradiction fail, or ≥2 fails → `REJECT`;
  any other fail or concern → `REVISE`; all clear → `ACCEPT`.
- **Separation of authority:** the Hypothesis Engine proposes; this module judges.
  Only the swarm can set a hypothesis to `accepted`; `REVISE` marks it
  `PROVISIONAL` (not accepted); `REJECT` marks it `rejected`.
- **Append-only critiques:** every lens verdict is persisted as its own evidence
  object (`origin: 'agent'`, linked to the hypothesis) — the criticism is auditable.

## Honesty

- Richer semantic critics (subtle confounders, natural-language causal-claim
  analysis) need reasoning models behind the Model Router (Priority 7) — a declared
  `CAPABILITY_GAP`, not faked. The deterministic lenses cover the checkable failure
  modes.

## Verification

- `cognitiveCriticSwarm.test.mjs` — **5/5**: decision aggregation; supported +
  competitor + no contradiction → ACCEPT (set by the swarm, critiques persisted);
  contradicted → REJECT; unfalsifiable lone hypothesis → REJECT; falsifiable but
  untested & lone → REVISE (PROVISIONAL, not accepted).
- Full gate: backend **276/276** (0 skipped), frontend 601/601, build green,
  eslint clean.
