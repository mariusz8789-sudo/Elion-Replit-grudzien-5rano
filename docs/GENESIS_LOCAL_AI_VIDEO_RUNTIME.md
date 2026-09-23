# Genesis Local AI-Video Runtime — Backend Foundation (Stage A)

**Status: ARCHITECTURE READY.** No real local AI-video model shipped, ran,
or was downloaded in this branch. Every capability plan in this sandbox
honestly resolves to `BLOCKED_MODEL_UNAVAILABLE` — that is the correct,
truthful outcome for a machine with no local model registered, not a bug.

This document is deliberately explicit about the difference between:

- **ARCHITECTURE READY** — the contract, validation pipeline, runtime
  probe, provenance/hashing, and test-only harness described below all
  exist, are tested, and work correctly end to end against an injected
  runner.
- **REAL MODEL EXECUTED** — a genuine local model (OpenSora, AnimateDiff,
  Stable Video Diffusion, a ComfyUI workflow, …) actually produced and
  hashed an output file. **This branch never claims this.** See
  [Real generation result](#real-generation-result) below.

## 1. Architecture

```
caller (future: Codex API route)
   │
   ▼
videoControlContract.mjs   — capability/status vocabulary, control-input
                              normalization (explicit absence, never
                              manufactured references), SHA-256
                              fingerprinting, scientific-state-promotion
                              rejection guard
   │
   ▼
genesisVideoEngine.mjs     — planGeneration() (6-step pre-execution
                              validation) -> executeGeneration() (invokes
                              an injected `runner`, verifies the real
                              output file, hashes it, builds immutable
                              provenance)
   │              ▲
   ▼              │ (dependency injection — no import cycle)
localVideoRuntime.mjs      — read-only hardware/software probe
   │
   ▼
trainingDataManifest.mjs   — future Stage-B fine-tuning dataset contract
                              (validation only; no training starts here)
```

Every file lives under `packages/backend/src/cinematic/` and is
self-contained: no imports from `campaign/*`, `knowledgeApi.mjs`,
`api.mjs`, or any shared registry. This keeps the branch additive and
independently cherry-pickable, per the task's isolation requirement.

## 2. Public contracts

### `videoControlContract.mjs`

- `CAPABILITY` — `TEXT_TO_VIDEO`, `IMAGE_TO_VIDEO`, `VIDEO_TO_VIDEO`,
  `FRAME_ENHANCEMENT`, `TEMPORAL_UPSCALE`.
- `STATUS` — `READY`, `GENERATED`, `BLOCKED_MODEL_UNAVAILABLE`,
  `BLOCKED_GPU_UNAVAILABLE`, `BLOCKED_RUNTIME`,
  `BLOCKED_UNSUPPORTED_CAPABILITY`, `FAILED_GENERATION`. Blocked and
  failed are never collapsed: a blocked run never invoked a model; a
  failed run did, and it genuinely errored.
- `MEDIA_CLASS = 'GENERATED_MEDIA'`, `MEDIA_SCOPE = 'VISUALIZATION_ONLY'`
  — fixed tags on every record this subsystem ever produces.
- `normalizeControlInput(raw)` — builds the frozen, provider-agnostic
  control object. Every optional reference field (`referenceImage`,
  `referenceVideo`, `depthReference`, `normalsReference`,
  `segmentationReference`, `cameraTrajectory`, `cameraMetadata`,
  `entityIds`, `sourceRenderHash`, `deterministicSeed`,
  `modelConfiguration`, `outputLocation`, …) is **always present**, `null`
  when the caller omitted it — absence stays explicit, nothing is
  invented.
- `assertNoScientificStatePromotion(raw)` — throws
  `ScientificStatePromotionRejected` if the raw payload tries to set
  `evidenceEligible`, `scientificStateMutation`, `promoteToEvidence`,
  `evidenceProposal`, `replayTruth`, `candidateIdentity`,
  `scienceRunResult`, `campaignResult`, `wetLabClassification`,
  `clinicalClassification`, `worldGraphState`, or `evidenceClass`. Called
  automatically, first, inside `normalizeControlInput`.
- `computeControlFingerprint(input)` / `sha256Hex(data)` — full,
  un-truncated SHA-256 hex digests (64 chars). Canonical key ordering
  means two structurally-equal inputs always fingerprint identically.

### `genesisVideoEngine.mjs`

- `planGeneration(rawInput, { runtime?, modelRegistry? })` — pre-execution
  only, never invokes a model:
  1. reject scientific-state promotion + validate/normalize the contract
  2. validate the capability
  3. discover runtime (`localVideoRuntime.detectRuntime()`, or an injected
     `runtime` object for tests)
  4. verify the selected model exists in `modelRegistry` (empty by
     default — nothing is bundled)
  5. verify required device (GPU) / runtime (Python) support
  6. verify the capability's required reference input(s) are present
- `executeGeneration(rawInput, { runner?, runtime?, modelRegistry? })` —
  calls `planGeneration`; if `READY`, invokes the injected
  `runner.generate({ capability, controlInput, model, runtime })`; then:
  1. confirms the returned `outputPath` file genuinely exists
  2. confirms it is non-empty
  3. computes its real SHA-256
  4. builds the immutable provenance record (below)
  5. never returns `GENERATED` without both 1–3 having genuinely happened
- `createModelRegistry()` — in-memory, provider-agnostic. Empty by
  default. `registerLocalModel({ capability, modelId, version,
  checkpointFingerprint, requiresDevice, requiresPython })` is how a real
  local adapter (or a test) registers itself.
- `createTestOnlyRunner({ behavior, writeFile })` — the ONLY runner this
  branch ships. Writes a real (tiny, fake-content) file to disk so the
  hashing/verification steps are genuinely exercised, and marks every
  result `testOnly: true` plus a `limitations` entry naming it explicitly.
  **Never call this outside this module's own test suite; never present
  its output as real AI-video generation.**

### Provenance record shape (every `executeGeneration` result)

```
executionId, createdAt, capability,
modelId, modelVersion, modelCheckpointFingerprint,
runtimeDevice, seed, generationConfiguration,
sourceScientificStateFingerprint, controlPackageFingerprint,
inputReferenceHashes: { referenceImage, referenceVideo, depthReference,
                         normalsReference, segmentationReference, sourceRenderHash },
outputPath, outputSha256,
status, reason, limitations, durationMs,
mediaClass: 'GENERATED_MEDIA', mediaScope: 'VISUALIZATION_ONLY',
evidenceEligible: false, scientificStateMutation: false,
testOnly
```

`evidenceEligible` and `scientificStateMutation` are hardcoded `false` in
the record-building code itself (`baseRecord()` in
`genesisVideoEngine.mjs`) — there is no code path, caller option, or
runner return value that can flip them.

## 3. Runtime discovery (`localVideoRuntime.mjs`)

`detectRuntime()` is READ-ONLY: no network calls, no checkpoint loading
(directory listings/stat only), no system modification. Every sub-probe
is individually wrapped so one missing tool never takes the whole probe
down. It reports: OS/CPU, Python (executable + version), RAM, storage
(`fs.statfsSync`), CUDA (`nvcc`/`nvidia-smi`), GPU identity + VRAM
(`nvidia-smi --query-gpu`), ROCm/DirectML/Apple-MPS (best-effort, `unknown`
rather than a guessed `true` where it cannot genuinely check), PyTorch
availability/version, diffusers availability/version, ffmpeg
availability/version, and configured local model checkpoints (via the
one opt-in `GENESIS_LOCAL_VIDEO_MODELS_DIR` environment variable — the
**only** environment variable this module ever reads or reports; no other
`process.env` value is ever surfaced).

### Real probe result in this sandbox (captured at implementation time)

```json
{
  "os": { "platform": "linux", "release": "6.18.44-fc-v37", "arch": "x64" },
  "cpu": { "arch": "x64", "cores": 4, "model": "Intel(R) Xeon(R) Processor @ 2.10GHz" },
  "python": { "available": true, "executable": "python3", "version": "Python 3.11.15" },
  "ram": { "totalBytes": 16877547520, "freeBytes": 16281427968 },
  "storage": { "available": true, "availableBytes": 17969037312, "totalBytes": 270553174016 },
  "cuda": { "available": false, "reason": "neither nvcc nor nvidia-smi report a CUDA version" },
  "gpu": { "available": false, "gpus": [], "reason": "spawnSync nvidia-smi ENOENT" },
  "vramMb": null,
  "otherAccelerators": {
    "rocm": { "available": false },
    "directml": { "available": "unknown", "reason": "no portable read-only DirectML probe on this platform" },
    "appleMps": { "available": false }
  },
  "pytorch": { "available": false, "reason": "no torch import succeeded (timed out / not installed)" },
  "diffusers": { "available": false, "reason": "ModuleNotFoundError" },
  "ffmpeg": { "available": false, "reason": "spawnSync ffmpeg ENOENT" },
  "localModels": { "configured": false, "reason": "GENESIS_LOCAL_VIDEO_MODELS_DIR is not set" }
}
```

RAM ≈ 15.7 GiB, storage ≈ 16.7 GiB free of 252 GiB. No GPU, no CUDA, no
PyTorch, no diffusers, no ffmpeg, no configured model directory in this
container. This is an honest, real result — not a placeholder.

## 4. Blocked states — when each fires

| Status | Fires when |
|---|---|
| `BLOCKED_UNSUPPORTED_CAPABILITY` | `capability` is not one of the five canonical values |
| `BLOCKED_MODEL_UNAVAILABLE` | no model is registered in `modelRegistry` for the requested capability/modelId (the default, empty registry — this branch bundles none) |
| `BLOCKED_GPU_UNAVAILABLE` | the resolved model requires `device: 'gpu'` and `runtime.gpu.available !== true` |
| `BLOCKED_RUNTIME` | the resolved model requires Python and none was detected, OR `executeGeneration` was called with no `runner` attached at all |
| `FAILED_GENERATION` | the runner was invoked, and either it returned `ok:false`, threw, reported success with no real output file, or the output file was empty |

## 5. Security / scientific boundaries

- `assertNoScientificStatePromotion` runs before any other validation —
  a hostile payload setting `evidenceEligible`/`scientificStateMutation`/
  etc. is rejected at the door, never reaches planning or execution.
- Every provenance record — GENERATED, BLOCKED, or FAILED — carries
  `evidenceEligible: false` and `scientificStateMutation: false`
  unconditionally.
- The runtime probe never reads or reports any environment variable other
  than `GENESIS_LOCAL_VIDEO_MODELS_DIR`.
- No network call anywhere in this branch. No API key is read, required,
  or referenced.

## 6. Integrated API admission seam

The canonical router exposes two public, read-only/admission surfaces:

- `GET /api/compute/local-video/runtime` returns a sanitized hardware/runtime summary.
- `POST /api/compute/local-video/plan` validates a canonical control package and returns an honest `READY` or `BLOCKED_*` result.

No production execution endpoint is exposed until a real local runner and
registered checkpoint exist. The API strips executable paths, model-directory
paths and checkpoint filenames. World Director consumes these endpoints and
shows the observed admission state without promoting generated media to
Evidence or changing scientific state.

## 7. How to register a real local model adapter (Stage B)

```js
import { createModelRegistry, CAPABILITY } from './cinematic/genesisVideoEngine.mjs';

const registry = createModelRegistry();
registry.registerLocalModel({
  capability: CAPABILITY.TEXT_TO_VIDEO,
  modelId: 'open-sora-v2',
  version: '2.0.0',
  checkpointFingerprint: '<sha256 of the checkpoint file>',
  requiresDevice: 'gpu',
  requiresPython: true,
});

const runner = {
  async generate({ capability, controlInput, model, runtime }) {
    // spawn the real local adapter process/subprocess here, write a real
    // file, and return { ok: true, outputPath, limitations: [...] } or
    // { ok: false, reason }. Never return testOnly:true from a real
    // adapter — that flag is reserved for this branch's own test harness.
  },
};

await executeGeneration(rawInput, { runner, modelRegistry: registry });
```

## 8. Expected hardware tiers (for Stage B planning, not enforced here)

| Tier | GPU | VRAM | Expected capability |
|---|---|---|---|
| Minimum | none | — | `BLOCKED_GPU_UNAVAILABLE` for every capability that requires GPU (all five, by default) |
| Entry | consumer GPU (e.g. RTX 3060) | 8–12 GB | short, low-resolution text/image-to-video |
| Recommended | RTX 4090 / A6000-class | 24 GB | full-resolution generation, frame enhancement |
| Production | multi-GPU / A100-class | 40–80 GB per device | batch generation, temporal upscale at scale |

This table is documentation only — `detectRuntime()` reports the real
tier of the machine it runs on; nothing here enforces a minimum.

## 9. Remaining work for Stage B

1. A real local model adapter (`runner.generate`) for at least one
   capability (e.g. text-to-video via an open-source local pipeline).
2. `registerLocalModel` calls wiring that adapter's real checkpoint
   fingerprint into the registry.
3. Codex's API route + frontend/UI integration (explicitly out of scope
   here).
4. The Stage-B evaluation harness scoring the categories listed in
   `docs/GENESIS_VIDEO_TRAINING_DATA_CONTRACT.md`.
5. Fine-tuning itself — **not started, not scoped, not attempted in this
   branch.**

## Real generation result

**`LOCAL_GENERATION: BLOCKED_MODEL_UNAVAILABLE`** — no local AI-video
model is installed, registered, or bundled in this branch or this
container. Every `executeGeneration` call against the default (empty)
model registry resolves honestly to `BLOCKED_MODEL_UNAVAILABLE`. The only
provenance records this branch's own test suite ever produces with
`status: GENERATED` come from `createTestOnlyRunner`, and every one of
those carries `testOnly: true` plus an explicit limitations note. This
branch does **not** claim `GENESIS_SORA_EQUIVALENT` or
`REAL_LOCAL_AI_VIDEO_GENERATED`.
