# Genesis Lab — Scientific Runs (reproducibility & provenance)

Every backend computation returns an auditable, reproducible **run**.

## Schema (`engine.mjs:runModel`)
`runId` (uuid) · `modelId` · `modelName` · `modelVersion` · `domain` · `status`
(`ok`|`rejected`|`error`) · `inputs` (snapshot) · `outputs` · `units` ·
`warnings` · `validity` · `assumptions` · `provenance` (source+formula+honesty) ·
`deterministic` · `seed` · `startedAt`/`finishedAt`/`durationMs` · `engine` version.

## Persistence (`store.mjs`, schema v3)
`runs` table, `saveRun`/`getRun`/`listRuns`. A run persists when `POST
/api/compute/run` is called with a `projectId` and editor+ role; otherwise it is
ephemeral (still fully returned). `GET /api/projects/:id/runs` is the audit trail.

## Reproducibility
Given a persisted run's `modelId` + `modelVersion` + `inputs` (+ `seed`), the same
result is reproducible by construction — the model version pins the formula, and
the shared bundle + drift-check guarantee the formula is the one that produced it.

## Heavy engines: Scientific Runs (`science_runs`, schema v7/v8)

`science_runs` persists every heavy-engine computation (docking/QM/ADMET/
toxicity) created via `campaign/multiFidelity.mjs`. Columns: `id`,
`project_id`, `campaign_id`, `candidate_id`, `engine`, `engine_version`,
`capability`, `method`, `status`, `evidence_class`, `inputs_json`,
`outputs_json`, `units_json`, `warnings_json`, `provenance_json`,
`input_hash`, `output_hash`, `artifacts_json`, `duration_ms`, `created_at`,
and (schema v8) `environment_hash` — a canonical fingerprint (see
`provenance.mjs#snapshotEnvironment`) of the exact runtime/engine versions
that produced the run, captured automatically at save time.

## Priority B — Scientific Reproducibility: replay verification

The flagship capability of this milestone: a stored Scientific Run can be
**replayed** — the real engine is re-executed with the exact stored inputs
and compared against the stored result — via `campaign/verify.mjs`
(`replayScienceRun` / `verifyScienceRun`) and the API:

```
GET  /api/projects/:id/campaigns/:cid/science-runs/:runId
POST /api/projects/:id/campaigns/:cid/science-runs/:runId/verify      (editor+)
GET  /api/projects/:id/campaigns/:cid/science-runs/:runId/verifications
```

Wired for the capabilities actually persisted today: `molecular-docking`,
`quantum-chemistry`, `admet-estimation`, `toxicity-risk-estimation`. Every
verification is appended (never overwritten) to `science_run_verifications`
— an audit trail, because a run may be re-verified more than once (e.g.
after an engine upgrade).

Verdicts are not collapsed to pass/fail:

| Verdict | Meaning |
| --- | --- |
| `MATCH` | Same engine version; output identical or within the capability's measured numerical tolerance. |
| `DRIFT` | Same engine version; output differs beyond tolerance — a real, measured discrepancy. |
| `ENGINE_VERSION_CHANGED` | The installed engine version differs from the one that produced the original run; a hash difference here isn't attributable to drift vs. environment change, so it gets its own verdict. |
| `BLOCKED_BY_RUNTIME` | The engine isn't available right now — honest, not a failure. |
| `REPLAY_UNSUPPORTED` | This run's capability has no wired replay path yet. |

**Why docking/QM use a tolerance of 0 but ADMET-AI does not (a real finding,
not a design guess):** AutoDock Vina with a fixed seed and PySCF for a fixed
geometry/basis were directly measured to be bit-exact reproducible across
independent replays. ADMET-AI's batched Chemprop D-MPNN ensemble was NOT —
predicting the same molecule alone vs. as part of a larger batch differs by
up to ~7.6e-6 absolute (~7e-7 relative) on stored (non-percentile) endpoints,
ordinary batched-neural-network floating-point non-associativity, not a
different answer. `campaign/verify.mjs`'s `TOLERANCE` table sets ADMET's
bound to `1e-4` — >100x margin above the measured noise floor while still
catching a genuinely different result. See that module's docstring for the
full account, and `docs/BENCHMARK_SUITE.md` for the same class of finding in
a different engine (OpenMM/PME).
