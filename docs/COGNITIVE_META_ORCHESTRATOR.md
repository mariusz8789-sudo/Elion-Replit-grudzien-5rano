# Cognitive Ceiling — Milestone 10: Meta-Orchestrator

**Priority 10.** Observes whole campaigns across runs, classifies outcomes into
DISTINCT causes, and scores strategies operationally from measured history — not a
pretend neural retrain. Additive schema `v11 → v12`. No Phase-1 code or engine touched.

## What was built (`cognitive/metaOrchestrator.mjs`, schema v12 `strategy_records`)

- **`summarizeMission`** — campaign metrics: hypotheses eliminated / revised, verified
  evidence, contradictions discovered, verification success rate, failed-task
  patterns, workflow mutations, compute consumed, and an explicitly-labelled
  `informationGainProxy` (verified evidence + contradictions + eliminated) — a proxy,
  not an information-theoretic measure.
- **`classifyOutcome`** — deterministic priority ladder into **distinct** classes,
  never collapsed: `CAPABILITY_GAP` (all engines unavailable), `ENGINE_FAILURE` (a
  task failed), `MODEL_FAILURE` (no reasoning/critic provider and no hypotheses),
  `SUCCESS` (verified evidence + accepted/supported hypothesis), `INSUFFICIENT_EVIDENCE`,
  `STRATEGY_FAILURE`, `MISSION_FAILURE`.
- **`recordOutcome`** — append-only `strategy_records` per mission (key = domain +
  planner signature).
- **`scoreStrategy` / `recommendStrategy`** — cross-run aggregation (runs, mean score,
  success rate, class histogram) and a best-strategy recommendation with **traceable
  reasons + mission evidence references**. No history → honest gap, no fabricated
  recommendation.

## Honesty

- Operational learning = measured aggregates over persisted outcomes. No model is
  retrained; nothing is invented. The information-gain metric is labelled a proxy.

## Verification

- `cognitiveMetaOrchestrator.test.mjs` — **6/6**: v12 migration; CAPABILITY_GAP vs
  ENGINE_FAILURE distinction; SUCCESS criteria; INSUFFICIENT_EVIDENCE; cross-run
  scoring + traceable recommendation; no-history honest gap.
- Full gate: backend **307/307** (0 skipped), frontend 601/601, build green, lint clean.
