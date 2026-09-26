# Genesis Video Training-Data Manifest Contract (Stage B preparation)

**No training starts in this branch, or is scoped by it.** This document
and its companion module, `packages/backend/src/cinematic/trainingDataManifest.mjs`,
define and validate the shape a future Genesis-owned fine-tuning dataset
entry must have — nothing more. `validateManifestEntry` is a gate: an
entry missing licensing or provenance is rejected, never silently
admitted.

## Required fields

Every manifest entry (`validateManifestEntry` in
`trainingDataManifest.mjs`, `requiredManifestFields()` lists these
programmatically) must carry:

| Field | Meaning |
|---|---|
| `datasetId` / `datasetVersion` | which dataset, which version |
| `sourceWorldId` | the Genesis world/scenario the clip came from |
| `sourceScientificStateFingerprint` | the scientific-state fingerprint at capture/generation time (traces back to a real `ScienceRun`/campaign state, never fabricated) |
| `promptOrShotDescription` | the text/shot description used, if any |
| `frameOrVideoReferences` | the real frame/video file references |
| `cameraMetadata` | camera parameters (FOV, position, etc.) |
| `frameTiming` | FPS + duration |
| `depth` / `normals` / `segmentation` references | when available (carried as part of the broader reference set; absence must stay explicit, exactly as in the control contract) |
| `license` | **required, non-empty** — the license this clip may be used for training under |
| `source` | **required, non-empty** — where the clip genuinely came from |
| `consentAndUsageConstraints` | any consent or usage restriction on the clip |
| `classification` | `GENERATED` or `OBSERVED` — never ambiguous |
| `qualityAnnotations` | quality scoring metadata |
| `scientificConsistencyAnnotations` | does the clip's content stay consistent with the scientific state it claims to represent |
| `split` | `train` / `validation` / `test` |
| `preprocessingVersion` | which preprocessing pipeline version produced this entry |
| `checkpointLineage` | which base checkpoint(s) this entry traces back to, if derived |
| `reproducibilitySeed` | the seed used, where applicable |

`validateManifestEntry` rejects an entry whose `license` or `source` is
missing, `null`, or an empty/whitespace-only string
(`error: 'incomplete_licensing_or_provenance'`), separately from the
general "any required field missing" check
(`error: 'missing_required_fields'`) — licensing and provenance are
singled out because a dataset can never be admitted without both, even if
every other field is present.

## Classification: `GENERATED` vs `OBSERVED`

`DATASET_CLASSIFICATION.GENERATED` — the clip was produced by this (or a
future) local AI-video model. `DATASET_CLASSIFICATION.OBSERVED` — the
clip is a real captured recording. A training set must never blur the
two; `validateManifestEntry` rejects any other value outright.

## Evaluation categories (`EVALUATION_CATEGORIES`)

A future Stage-B evaluation harness scores every trained checkpoint
against these nine categories (documented now so the manifest schema and
the eventual harness agree from day one):

1. `TEMPORAL_CONSISTENCY` — does the clip stay coherent frame to frame
2. `OBJECT_IDENTITY_STABILITY` — do entities keep their identity across frames
3. `CAMERA_ADHERENCE` — does the output follow the requested camera trajectory
4. `CONTROL_ADHERENCE` — does the output follow the supplied control references (depth/normals/segmentation/reference image or video)
5. `VISUAL_ARTIFACTS` — flicker, warping, texture breakup, etc.
6. `ANATOMY_CONSISTENCY` — for any human/biological subject content
7. `SCIENTIFIC_STATE_CONSISTENCY` — does the visualization stay honest to the scientific state it was generated from
8. `FORBIDDEN_CLAIM_PROMOTION` — did the output (or a caller) attempt to present it as Evidence/replay truth/clinical fact — must always score zero incidents
9. `PROVENANCE_COMPLETENESS` — is the full provenance chain (model, checkpoint, control fingerprint, source fingerprint, hash) intact

## Fingerprinting

`validateManifestEntry` computes a SHA-256 `fingerprint` over
`{ datasetId, datasetVersion, sourceWorldId, sourceScientificStateFingerprint,
checkpointLineage, preprocessingVersion }` — reusing the same
`sha256Hex` primitive `videoControlContract.mjs` uses, so dataset lineage
and generation provenance share one fingerprinting scheme across the
whole subsystem.

## What this module intentionally does NOT do

- It does not fetch, scrape, or curate any training data.
- It does not start, schedule, or reference a training job.
- It does not admit an entry on partial licensing/provenance information
  "to be filled in later" — the gate is enforced at validation time, not
  deferred.
