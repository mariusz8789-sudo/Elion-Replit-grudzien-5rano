# Genesis Generative Cinematic Layer

Genesis keeps two media paths separate:

1. The canonical renderer captures deterministic frames from the real Genesis world/runtime state and can encode them as an MP4.
2. The optional generative adapter may enhance those controls through a future text-to-video, image-to-video, or video-to-video provider.

The generative path is permanently classified as `GENERATED_MEDIA` and `VISUALIZATION_ONLY`. Its output is not eligible for scientific Evidence and cannot mutate the source world, solver result, replay status, candidate identity, or experiment result.

`generativeCinematicAdapter.ts` packages the canonical world ID, scientific-state fingerprint, camera keyframes, optional image/depth/normals/segmentation references, and a deterministic source fingerprint. A provider must return its identity, model, execution ID, output reference, and SHA-256. Missing providers, unsupported modes, incomplete inputs, and unverifiable outputs return explicit `BLOCKED_*` states.

No paid provider is configured or called by this implementation. `WorldDirectorScreen` exposes the control package through the existing `window.__GENESIS_WORLD_DIRECTOR__` integration hook so a provider can be added later without replacing the deterministic renderer.
