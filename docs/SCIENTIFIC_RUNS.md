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
