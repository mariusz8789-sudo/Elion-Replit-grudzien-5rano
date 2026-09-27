# Genesis Local AI-Video — Stage-B Adapter (Claude Stage-B branch)

**No real AI-video generation happened in this branch.** Nothing here
claims `GENESIS_SORA_EQUIVALENT` or `REAL_LOCAL_AI_VIDEO_GENERATED` — no
installed checkpoint has actually produced and hashed an output. This
document separates, throughout: **ARCHITECTURE READY** (the adapter,
worker protocol, path/checkpoint verification, and tests below all exist
and pass) from **REAL MODEL EXECUTED** (has not happened).

## 1. Starter pack audit

**Package:** `Genesis_AI_Video_Starter_Pack.zip`
**SHA-256:** `1e4de8b701f4e60c5f313a478728dfd4d7914fe22a0384bec09722b49f0cdda6`

All 14 files inside matched the package's own `SHA256SUMS.json` exactly
(no unlisted extras, no mismatches). Every PowerShell, Python, and config
file was read in full. Findings, by the audit checklist:

- **Installs dependencies:** `scripts/02_Przygotuj_Srodowisko.ps1` runs
  `pip install` into an isolated `.venv` it creates in the package's own
  directory only — never global Python. An optional `-InstallTorch`
  switch (off by default) additionally installs `torch` from the default
  pip index.
- **Downloads models:** none, anywhere. `huggingface_hub` is listed as a
  dependency but no script ever calls a download function on it.
- **Modifies environment variables:** yes —
  `[Environment]::SetEnvironmentVariable("GENESIS_LOCAL_VIDEO_MODELS_DIR", ..., "User")`
  in two scripts. This is a **persistent, user-scoped** (not machine-wide)
  Windows variable, limited to that one path setting, and reversible
  (`SetEnvironmentVariable(..., $null, "User")`).
- **Changes execution policy:** the README's own quickstart recommends
  `Set-ExecutionPolicy -Scope Process Bypass` — **process-scoped only**,
  reverts automatically when the shell closes. No script calls
  `Set-ExecutionPolicy` itself.
- **Writes outside the repository:** the models directory
  (`C:\Genesis\models\video` by default, user-configurable) is
  intentionally outside the package — that is its documented purpose.
  `04_Test_FFmpeg.ps1` writes its test clip inside the package root only.
- **Accesses the network:** only via `pip install` (dependency/optional
  torch install). No direct HTTP calls anywhere.
- **Invokes FFmpeg:** `04_Test_FFmpeg.ps1` generates a 2-second synthetic
  test clip via `imageio-ffmpeg`'s bundled binary and SHA-256-hashes the
  result. Self-contained, no network.
- **Starts Python workers:** `python/genesis_local_video_worker.py` is a
  stdin/stdout JSON-lines stub that **always returns
  `BLOCKED_MODEL_UNAVAILABLE`** — it never fabricates a result. Nothing
  in the package auto-invokes it.
- **Secrets / TLS weakening / paid providers:** none found anywhere.

**No file was rejected.** Compatibility matrix:

| File / component | Purpose | Verdict | Reason |
|---|---|---|---|
| `README_PL.md`, `docs/*.md` | Documentation | SAFE | Accurate, matches the canonical Genesis direction |
| `SHA256SUMS.json` | Manifest | SAFE | 14/14 verified |
| `.env.example` | Config template | SAFE | No secrets; adds `GENESIS_LOCAL_VIDEO_MODEL_ID`/`GENESIS_LOCAL_VIDEO_DEVICE` beyond the canonical single env var — not adopted as new canonical env vars, but as `modelConfiguration`/adapter-config fields instead (see §5) |
| `config/models.example.json` | Model registry example | REQUIRES ADAPTATION | Missing `checkpointFingerprint`; `device: "cuda"` doesn't fit AMD/DirectML — superseded by `localVideoModelDescriptor.mjs` |
| `scripts/01_Diagnostyka.ps1` | Read-only diagnostics | SAFE | — |
| `scripts/02_Przygotuj_Srodowisko.ps1` | Env setup | SAFE, noted | Isolated venv + persistent user env var (documented above); not run by this branch |
| `scripts/03_Sprawdz_Srodowisko.ps1` | Runs Python diagnostics | SAFE | — |
| `scripts/04_Test_FFmpeg.ps1` | FFmpeg smoke test | SAFE | — |
| `scripts/05_Ustaw_Katalog_Modeli.ps1` | Sets models dir | SAFE | — |
| `python/model_adapter_base.py` | Protocol (`available()`+`generate()`) | DUPLICATES CURRENT GENESIS DIRECTION | Its shape directly informed (not copied into) this branch's own `available()`/`generate()` design |
| `python/genesis_local_video_worker.py` | stdin/stdout worker stub | SAFE, REQUIRES ADAPTATION | Its IPC shape informed this branch's own, independently-written `tools/genesis-local-video/worker/genesis_local_video_worker.py`, extended with a real plug-in seam (`adapters/<modelId>.py`) the starter pack did not define |
| `python/requirements-common.txt` | Dependency list | SAFE, REQUIRES ADAPTATION | No pins — this branch's `tools/genesis-local-video/requirements.txt` pins versions; nothing installed by either |
| `python/diagnose_runtime.py` | CUDA/torch-only diagnostics | SAFE, WEAKER THAN CANONICAL | See §2 — not ported |

## 2. Host inspection

**Important limitation, stated honestly:** this branch was built inside a
Linux cloud sandbox, not on the target Windows machine with the AMD
Radeon RX 7700 XT. Every claim below about "this sandbox" is real and
reproducible here; nothing here is a claim about your Windows machine's
actual hardware — run `detectRuntime()` (already wired to
`GET /api/compute/local-video/runtime` by Codex's integration) or
`tools/genesis-local-video/scripts/check_admission.py` on that machine
for the real answer.

**Comparison — starter pack's `diagnose_runtime.py` vs. the canonical
`localVideoRuntime.mjs`:** the package's own diagnostics call
`torch.cuda.is_available()` and enumerate CUDA devices only — it has
**no AMD/DirectML-specific detection at all**. The canonical
`localVideoRuntime.mjs` (already extended by Codex's integration commit,
read in full for this branch) is strictly more capable for the AMD case:
it already has `probeWindowsGpu()` (Windows-registry `DriverDesc` +
`MaxDedicatedVideoMemory` query, tagging AMD/Radeon names as
`DIRECTML_OR_ROCM_CANDIDATE`) and an `onnxruntime-directml` probe via
`pip show`. **Conclusion: nothing in the starter pack is worth porting —
the canonical probe is already the better one for this exact hardware
case.** No second runtime-discovery system was created; this branch adds
none.

**Real probe result in THIS sandbox** (via the unmodified canonical
`detectRuntime()`): Linux, 4-core Intel Xeon, ~15.7 GiB RAM, ~16.7 GiB
free storage, Python 3.11.15 available, no GPU (`nvidia-smi` absent, no
Windows registry to query), no CUDA, no PyTorch/diffusers/transformers,
no `onnxruntime-directml`, no ffmpeg, no `GENESIS_LOCAL_VIDEO_MODELS_DIR`
configured.

## 3. Safe environment contract — `tools/genesis-local-video/`

See `tools/genesis-local-video/README.md` for the full, copy-pasteable
sequence. Summary:

1. **Install command (documented, not run by this branch):**
   ```powershell
   cd tools\genesis-local-video
   python -m venv .venv
   .venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
   .venv\Scripts\python.exe -m pip install -r requirements.txt
   ```
   Pinned versions in `requirements.txt`: diffusers 0.31.0, transformers
   4.46.3, accelerate 1.1.1, safetensors 0.4.5, huggingface_hub 0.26.2,
   numpy 1.26.4, Pillow 11.0.0, imageio 2.36.0, imageio-ffmpeg 0.5.1,
   psutil 6.1.0. GPU backend (`torch`/`torch-directml`/
   `onnxruntime-directml`) is deliberately unpinned — pick the one
   matching your actual detected hardware.

2. **Model placement contract:** set
   `GENESIS_LOCAL_VIDEO_MODELS_DIR` (the same, only, env var
   `localVideoRuntime.mjs` reads), place your real checkpoint under it,
   compute its SHA-256 with `Get-FileHash`.

3. **Checkpoint verification:** both
   `tools/genesis-local-video/scripts/check_admission.py` (read-only,
   no installs) and this branch's own
   `localVideoWorkerAdapter.mjs`/`localVideoModelDescriptor.mjs` (Node
   side) independently re-hash the checkpoint file and refuse to proceed
   on any mismatch — a wrong or corrupted checkpoint is `BLOCKED`, never
   silently accepted.

4. **AMD/DirectML limitation, stated plainly:** DirectML is not CUDA.
   Many diffusers-based video pipelines assume CUDA kernels; running them
   under DirectML requires either a DirectML-compatible build
   (`torch-directml`) or an ONNX export runnable through
   `onnxruntime-directml`. Check your specific chosen model's own support
   matrix before committing to it on the RX 7700 XT — this branch cannot
   verify that compatibility for you, only that the runtime and
   checkpoint are genuinely present.

5. **Cleanup:** delete `tools/genesis-local-video/.venv`, unset
   `GENESIS_LOCAL_VIDEO_MODELS_DIR` (User scope), optionally delete the
   models directory. Full commands in the tool's own README.

## 4. Stage-B adapter

`packages/backend/src/cinematic/localVideoWorkerAdapter.mjs` —
`createLocalWorkerAdapter(config)` returns a `runner` object with exactly
the shape `genesisVideoEngine.mjs`'s `executeGeneration({ runner })`
already expects: `generate({ capability, controlInput, model, runtime })
-> { ok: true, outputPath, limitations } | { ok: false, reason }`. It
never returns a `status`, never returns `GENERATED`, never classifies
anything — `genesisVideoEngine.mjs` alone (unmodified) verifies the
output file, computes its real SHA-256, and assigns the final status.

**Reused canonical interfaces (nothing duplicated):**
`genesisVideoEngine.createModelRegistry`/`registerLocalModel`/
`planGeneration`/`executeGeneration`, `videoControlContract.
normalizeControlInput`/`sha256Hex`/`CAPABILITY`/`STATUS`,
`localVideoRuntime.detectRuntime` (used exactly as-is by
`planGeneration`, never re-implemented here).

**Safety mechanics:**
- **Path safety:** `resolveWithinRoot()` refuses any checkpoint or output
  path that resolves outside its configured `approvedModelsRoot`/
  `outputRoot`, including a caller-supplied `outputLocation` in the
  control package.
- **Checkpoint verification:** `available()` re-hashes the real
  checkpoint file on every call and refuses a mismatch — never trusts a
  cached or claimed hash.
- **Timeout/cancellation:** every `generate()` call is bounded by
  `timeoutMs` (default 10 minutes); on timeout the worker subprocess is
  killed (`SIGTERM`, then `SIGKILL` after a grace period) and the call
  resolves `{ ok:false, reason: '...timed out...' }`. A caller holding
  the adapter object directly can also call `adapter.cancelCurrent()` to
  kill an in-flight process proactively — the canonical
  `runner.generate()` call signature itself carries no cancellation
  channel, so this is the adapter's own mechanism, documented here rather
  than silently assumed.
- **Output verification (defense in depth):** the adapter itself checks
  the output file exists and is non-empty before returning `ok:true`,
  even though `genesisVideoEngine.mjs` re-verifies independently too.

**On "BLOCKED" vs. `FAILED_GENERATION` — an honest architectural note:**
`genesisVideoEngine.mjs`'s real, unmodified contract only ever maps ANY
`runner.generate()` failure (`ok:false`) to `STATUS.FAILED_GENERATION` —
the `BLOCKED_*` vocabulary exists solely at the `planGeneration` layer,
before a runner is ever invoked. So checks like "wrong checkpoint SHA-256"
or "missing worker script" are BLOCKED-*shaped* at this adapter's own
`available()` method (a caller or test can see the distinct reason
directly there), but read as `FAILED_GENERATION` in the full
`executeGeneration` result, because that is genuinely how the canonical
file — which this branch does not modify — is built. This is stated here
rather than silently reinterpreted.

## 5. Model registry seam

`packages/backend/src/cinematic/localVideoModelDescriptor.mjs` — ONE
shared descriptor shape (`capability`, `modelId`, `version`,
`checkpointFingerprint`, `checkpointPath`, `requiresDevice`,
`requiresPython`, `requiresPackages`, `requiredAccelerator`,
`supportedResolutions`, `supportedDurationSeconds`, `supportedFps`,
`vramRequirementMb`, `limitations`) that `validateModelDescriptor()`
refuses to admit unless the checkpoint is physically present AND its real
SHA-256 matches — then projects cleanly onto:
- `toRegistryDescriptor()` → exactly what
  `createModelRegistry().registerLocalModel(...)` accepts (unmodified).
- `toAdapterConfig()` → exactly what `createLocalWorkerAdapter(...)`
  needs, plus the operator-supplied roots/paths it cannot know on its own.

## 6. How Codex should attach this (not done in this branch)

```js
import { validateModelDescriptor, toRegistryDescriptor, toAdapterConfig } from './cinematic/localVideoModelDescriptor.mjs';
import { createLocalWorkerAdapter } from './cinematic/localVideoWorkerAdapter.mjs';
import { createModelRegistry, executeGeneration } from './cinematic/genesisVideoEngine.mjs';

const validated = validateModelDescriptor(rawDescriptor, { checkpointRoot: approvedModelsRoot });
if (!validated.ok) { /* refuse to register — surface validated.error/reason */ }

const registry = createModelRegistry();
registry.registerLocalModel(toRegistryDescriptor(validated.descriptor));

const adapter = createLocalWorkerAdapter(toAdapterConfig(validated.descriptor, {
  approvedModelsRoot, outputRoot, workerScript: 'tools/genesis-local-video/worker/genesis_local_video_worker.py',
}));

// POST /api/.../cinematic/video/execute -> executeGeneration(body, { runner: adapter, modelRegistry: registry })
```

## 7. Expected hardware limits (documentation only, not enforced here)

| Tier | Example | Expected result on THIS adapter |
|---|---|---|
| No GPU | CPU-only box | `BLOCKED_GPU_UNAVAILABLE` for any model registered `requiresDevice: 'gpu'` |
| AMD RX 7700 XT (12 GB VRAM, DirectML) | this task's target | Admitted only if a DirectML-compatible build/model is chosen (§3.4); 12 GB likely bounds you to short clips / lower resolution / smaller models |
| NVIDIA consumer (8-12 GB, CUDA) | RTX 3060-class | Works with `torch` + CUDA index install; similar resolution/duration bounds |
| NVIDIA 24 GB+ (CUDA) | RTX 4090 / A6000-class | Full-resolution generation more comfortably |

## 8. Exact remaining step for the first real 5-10 second generation

1. Choose ONE real, licensed, local video model whose support matrix
   actually covers your device (CUDA or DirectML).
2. Run the install command in §3.1 on the real machine, add the GPU
   backend package matching your choice.
3. Place the real checkpoint under `GENESIS_LOCAL_VIDEO_MODELS_DIR`,
   compute its SHA-256.
4. Copy `tools/genesis-local-video/worker/adapters/_example_adapter.py.txt`
   to `adapters/<your-model-id>.py` and implement `generate(request)` for
   real, using that model's real local inference API.
5. Run `check_admission.py` — it must report `admitted: true`.
6. Build a `localVideoModelDescriptor`, validate it, register it, attach
   `createLocalWorkerAdapter(...)` as the `runner`, and call
   `executeGeneration(...)` (Codex's future API route or a direct script).
7. Only then does `STATUS.GENERATED` with a real, verified SHA-256 become
   possible — nothing before step 6 can produce it.

This branch completes steps 0 (audit) through the CONTRACT for steps 1-6;
none of steps 1-6 were executed here (no install, no download, no real
model plugged in).
