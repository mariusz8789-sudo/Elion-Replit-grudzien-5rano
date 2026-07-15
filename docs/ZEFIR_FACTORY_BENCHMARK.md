# ZEFIR Phase 3O — Discovery Factory Benchmark

Adversarial benchmarks (`factoryBenchmark.test.mjs`) that try to make ZEFIR lie:
accept weak evidence, promote a candidate on one favorable score, confuse
MODEL_ESTIMATE with VERIFIED, treat a hypothesis as evidence, or repeat a failed path.

## The 20 classes (+ adversarial meta-check) — all pass
1 autonomous DAG execution · 2 safe restart · 3 no duplicate work · 4 candidate
rejection · 5 contradictory engine evidence · 6 misleading favorable score not
promoted · 7 ADMET stays MODEL_ESTIMATE (never VERIFIED) · 8 off-target risk signal ·
9 insufficient target coverage · 10 novelty not assessed (no reference) · 11
negative-result path avoidance · 12 compute budget exhaustion · 13 model provider
unavailable → CAPABILITY_GAP · 14 scientific resource unavailable → BLOCKED_BY_RESOURCES ·
15 sandbox promotion rejection · 16 experimental-result import integrity (typed claim
rejected) · 17 prediction-vs-measurement error recording · 18 dossier completeness ·
19 Translational Gap Warning enforcement · 20 end-to-end autonomous campaign that
eliminates a liability and survives a clean candidate. Plus: a hypothesis is not
evidence; malformed evidence is rejected.

**Result: 18/18 tests pass** (covering all 20 classes) — Genesis resisted every
attempt to manufacture success, confuse epistemic categories, or accept weak evidence.

## Verification
Full gate: backend **374/374** (0 skipped), frontend 601/601, build green, lint clean.
