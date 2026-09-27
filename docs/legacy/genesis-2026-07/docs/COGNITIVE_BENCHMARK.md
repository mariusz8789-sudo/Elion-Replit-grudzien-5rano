# Cognitive Ceiling — Milestone 13: Cognitive Research Benchmark Suite

**Priority 13 — the moment of truth.** Adversarial benchmarks designed to EXPOSE
cognitive weakness, not mirror the implementation. Each case feeds Genesis a hostile
situation and asserts it behaves HONESTLY. No Phase-1 code or scientific engine touched.

## What was built

- **`cognitiveBenchmark.test.mjs`** — **14 adversarial benchmarks** covering all 12
  mandated dimensions plus two adversarial specials:
  1. mission decomposition = real dependency DAG (not a flat list);
  2. competing hypothesis generation (opposite predictions);
  3. falsifiability enforcement (unfalsifiable → REJECT);
  4. critic independence (proposer disjoint from judge);
  5. contradiction handling (falsification dominates);
  6. workflow adaptation after failure (route-around restores the frontier);
  7. recovery after interruption (real file-DB restart, no duplicated work);
  8. strategy selection across runs (+ honest no-history gap);
  9. compute placement (GPU → BLOCKED_BY_RESOURCES, never faked);
  10. sandbox→evidence promotion integrity (unverified never enters main);
  11. capability-gap honesty (malformed/absent inputs → explicit gaps/errors);
  12. **misleading high-"confidence" candidate that contradicts → NOT accepted**;
  13. all engines unavailable → CAPABILITY_GAP outcome, no fabricated evidence;
  14. unavailable model provider → agent records CAPABILITY_GAP, no fake output.
- **`scripts/cognitive-benchmark.mjs`** (`npm run benchmark:cognitive`) — a readable
  scored report of enforced properties **and** the declared capability gaps as
  first-class results (general NL decomposition, live LLM reasoning, external novelty
  reference, GPU/HPC/quantum, 100 ns MD/FEP, wet-lab validation).

## Result

**14/14 adversarial benchmarks pass** — under malformed evidence, contradictory
evidence, unavailable engines, unavailable model providers, interruption, and a
misleading high-confidence candidate, Genesis fails **honestly** rather than
manufacturing success. The benchmark report additionally enumerates six honest
capability gaps so a skeptical reviewer sees exactly what Genesis cannot do.

## Verification

- Full gate: backend **333/333** (0 skipped), frontend 601/601, build green, lint clean.
