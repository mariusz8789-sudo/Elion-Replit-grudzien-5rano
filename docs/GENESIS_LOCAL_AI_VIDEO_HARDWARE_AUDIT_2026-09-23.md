# Genesis local AI-video hardware audit — 2026-09-23

This is an observed runtime inventory for the Windows host used by the final Genesis integration. It is not evidence that a local video model has executed.

## Observed host

| Resource | Observed value | Status |
|---|---:|---|
| OS / architecture | Windows `10.0.26200`, x64 | AVAILABLE |
| CPU | Intel Core i5-14400F, 16 logical processors | AVAILABLE |
| System RAM | 34,183,335,936 bytes (about 31.8 GiB) | AVAILABLE |
| GPU | AMD Radeon RX 7700 XT | AVAILABLE |
| Dedicated video memory | 12,662,247,424 bytes (about 11.8 GiB) | AVAILABLE |
| Free storage during audit | 676,059,877,376 bytes (about 629.6 GiB) | AVAILABLE |
| Python | CPython 3.14.0 | AVAILABLE, but unsuitable until a selected model stack publishes compatible wheels |
| PyTorch | not installed in the active Python | BLOCKED_RUNTIME |
| Diffusers | not installed in the active Python | BLOCKED_RUNTIME |
| Transformers | not installed in the active Python | BLOCKED_RUNTIME |
| ONNX Runtime DirectML | not installed in the active Python | BLOCKED_RUNTIME |
| ROCm/HIP command-line runtime | `rocminfo` and `hipinfo` not found | BLOCKED_RUNTIME |
| System FFmpeg | not found on `PATH` | NOT REQUIRED by the current deterministic encoder |
| Repository encoder | `ffmpeg-static`, H.264 MP4 | AVAILABLE |

The encoder probe returned the repository binary at `node_modules/ffmpeg-static/ffmpeg.exe`. The deterministic Genesis renderer can therefore continue to produce MP4 independently of an AI-video runtime.

## Admission decision

`LOCAL_AI_VIDEO_GENERATION: BLOCKED_RUNTIME`

The GPU has a useful memory budget, but the active host has no admitted execution stack or locally configured video-model checkpoint. Genesis must not return `GENERATED` until an adapter verifies all of the following:

1. a selected local model and checkpoint exist;
2. their licence permits the intended use;
3. a Windows/AMD-compatible runtime is installed in an isolated, version-pinned environment;
4. the requested capability fits measured VRAM and RAM limits;
5. a real output file is produced and its SHA-256 is verified;
6. model, checkpoint, seed, controls and limitations are written to provenance.

## Practical next tier

The first hardware admission should target a short, low-resolution 5–10 second reference run with an explicitly supported local/open model, not a five-minute film and not an unbounded download. Quantization, tiled decoding or CPU offload may be evaluated only after the concrete model/runtime combination is selected and measured. Large high-resolution foundation models and claims of Sora-equivalent quality remain unverified on this host.

The canonical deterministic path remains the production fallback:

`Genesis world state → camera plan → browser frames → ffmpeg-static → MP4 → manifest → SHA-256`

The optional AI path remains separate and non-authoritative:

`control package → admitted local adapter → generated media → SHA-256 → VISUALIZATION_ONLY provenance`

