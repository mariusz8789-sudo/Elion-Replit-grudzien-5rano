# Genesis Local AI-Video — Stage-B environment (owned by this branch)

This directory is the **safe, isolated, reproducible** local runtime
contract for a real Stage-B local AI-video model. Nothing here has been
installed, downloaded, or executed by this branch — every command below
is documented for you to run yourself, when you choose to.

It exists alongside, and reuses, the canonical
`packages/backend/src/cinematic/` foundation (`videoControlContract.mjs`,
`localVideoRuntime.mjs`, `genesisVideoEngine.mjs`, `trainingDataManifest.mjs`)
and the Stage-B adapter this branch adds
(`packages/backend/src/cinematic/localVideoWorkerAdapter.mjs`). It is not
a second engine or a second runtime-discovery system — see
`docs/GENESIS_LOCAL_AI_VIDEO_STAGE_B.md` at the repo root for the full
architecture and how it reuses `localVideoRuntime.detectRuntime()`.

## What this reviewed from the starter pack

This environment contract was informed by an audit of
`Genesis_AI_Video_Starter_Pack.zip` (SHA-256, manifest, and full script
review recorded in `docs/GENESIS_LOCAL_AI_VIDEO_STAGE_B.md`). Nothing
from that package was copied verbatim; its worker/adapter *shape*
(stdin/stdout JSON, `available()` + `generate()`) was a useful reference
and is echoed here as an independently-written, owned file.

## 1. Create the isolated environment (you run this)

```powershell
cd tools\genesis-local-video
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

This creates `.venv/` **inside this directory only** — no global Python
site-packages are touched. Nothing else on the system is modified.

### GPU backend (install separately, matches your hardware)

`requirements.txt` deliberately does NOT pin a GPU backend. Pick ONE,
matching the runtime `detectRuntime()`/`check_admission.py` actually
report for your machine:

- **NVIDIA (CUDA):** `.venv\Scripts\python.exe -m pip install torch` (see
  pytorch.org for the CUDA-version-specific index URL for your driver).
- **AMD on Windows (DirectML) — the RX 7700 XT case:**
  `.venv\Scripts\python.exe -m pip install torch-directml` or
  `onnxruntime-directml`, depending on which local model you choose (a
  diffusers pipeline typically wants `torch-directml`; an ONNX-exported
  model wants `onnxruntime-directml`). **AMD/DirectML limitation, stated
  plainly:** DirectML is not CUDA. A checkpoint or pipeline that only
  ships a CUDA code path will not run under DirectML without a
  DirectML-compatible build or an ONNX export — check the specific
  model's own documentation before choosing it for this hardware.
- **CPU only:** no extra install; expect generation to be far too slow
  for practical use, but the admission/contract checks all still work.

## 2. Configure the models directory (you run this)

```powershell
$env:GENESIS_LOCAL_VIDEO_MODELS_DIR = "C:\Genesis\models\video"
[Environment]::SetEnvironmentVariable("GENESIS_LOCAL_VIDEO_MODELS_DIR", $env:GENESIS_LOCAL_VIDEO_MODELS_DIR, "User")
New-Item -ItemType Directory -Force -Path $env:GENESIS_LOCAL_VIDEO_MODELS_DIR
```

This is the SAME environment variable `localVideoRuntime.mjs` already
reads (the only one it ever reads — see the canonical runtime doc). This
step sets a **persistent, user-scoped** Windows environment variable —
not machine-wide, not an execution-policy change. To undo it:
`[Environment]::SetEnvironmentVariable("GENESIS_LOCAL_VIDEO_MODELS_DIR", $null, "User")`.

## 3. Place a real checkpoint, compute its SHA-256

```powershell
Get-FileHash -Algorithm SHA256 "$env:GENESIS_LOCAL_VIDEO_MODELS_DIR\your-model\checkpoint.safetensors"
```

Record that hash — it is the `checkpointFingerprint` both the model
registry entry (`createModelRegistry().registerLocalModel(...)`) and this
adapter's own admission check require. **Path validation:** the Node
adapter refuses any checkpoint or output path that does not resolve
inside its configured approved roots — see
`localVideoWorkerAdapter.mjs`'s `PathSafety` section.

## 4. Run the admission check (read-only, no installs, no model load)

```powershell
.venv\Scripts\python.exe scripts\check_admission.py --model-id your-model-id --checkpoint "C:\Genesis\models\video\your-model\checkpoint.safetensors" --checkpoint-sha256 <the hash from step 3>
```

Prints one JSON report with an honest `admitted: true/false` verdict and
the exact `admissionBlockers` if not. It never installs, downloads, or
loads a checkpoint into memory — existence + SHA-256 only.

## 5. Attach a real model (Stage B, not done in this branch)

Copy `worker/adapters/_example_adapter.py.txt` to
`worker/adapters/<your-model-id>.py` and implement `generate(request)`
for real — see that template for the exact request/response contract.
Nothing runs until you do this: with no adapter plugged in, every
generation attempt honestly resolves to `BLOCKED_MODEL_UNAVAILABLE`.

## Cleanup

```powershell
Remove-Item -Recurse -Force tools\genesis-local-video\.venv
[Environment]::SetEnvironmentVariable("GENESIS_LOCAL_VIDEO_MODELS_DIR", $null, "User")
# Optionally remove the models directory itself if you no longer want it:
Remove-Item -Recurse -Force $env:GENESIS_LOCAL_VIDEO_MODELS_DIR
```

## What this directory will NOT do

- Never installs anything automatically.
- Never downloads model weights.
- Never modifies global Python, only this directory's own `.venv`.
- Never calls `Set-ExecutionPolicy` with a persistent scope (if you use
  it at all, use `-Scope Process` — reverts when you close the shell).
- Never talks to a paid provider or requires an API key.
- Never weakens TLS verification.
