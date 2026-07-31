# Cognitive Ceiling — Milestone 4: Competing Hypothesis Engine

**Priority 4.** Generates SETS of genuinely competing, falsifiable hypotheses for a
research question and evaluates them against evidence with Popperian discipline.
No Phase-1 code or scientific engine touched.

## What was built (`cognitive/hypothesisEngine.mjs`)

- **`generateCompetingHypotheses`** — deterministic, template-driven. The
  `descriptor-vs-binding` template emits H1 (descriptor-favorable ⇒ binds) and H2
  (descriptor-favorable ⇏ binds) — genuinely competing: opposite structured
  predictions on the SAME observable (`dockingAffinity`), each with a disconfirming
  prediction. Never lets the first plausible explanation win by default.
- **Structured predicates** `{metric, op, value}` for predicted/disconfirming
  observations, so evaluation is deterministic and auditable (`evalPredicate`
  returns true/false when evaluable, `null` when not — honestly distinct from false).
- **`evaluateHypothesesAgainstEvidence`** — Popperian: a single satisfied
  disconfirming prediction → `CONTRADICTED` (falsification dominates); otherwise a
  satisfied prediction → `SUPPORTED`. Updates each hypothesis's epistemic + lifecycle
  status. Confidence is never fabricated.

## Honesty

- Unknown template → explicit `CAPABILITY_GAP` (general NL hypothesis generation
  needs the Model Router, Priority 7). No hypotheses invented. In-order choice.
- This engine applies deterministic falsification; independent adversarial critics
  (proposer ≠ sole judge) are Priority 5 and build on it.

## Verification

- `cognitiveHypothesisEngine.test.mjs` — **6/6**: predicate semantics; competing
  set with opposite predictions; strong-binding supports H1 / contradicts H2;
  symmetric weak-binding case; falsification dominance (one disconfirming
  observation contradicts amid support); unknown-template CAPABILITY_GAP.
- Full gate (with Priority 5): backend **276/276** (0 skipped), frontend 601/601,
  build green, eslint clean.
