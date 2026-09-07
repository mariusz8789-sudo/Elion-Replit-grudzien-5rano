import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Diagnostics
 *
 * Before this module, the engine had NO visibility into what a frame actually costs — every
 * performance claim in this codebase (PERFORMANCE.md included) was structural reasoning ("GTAO
 * adds a normal pre-pass"), never a measured number, because there was nothing to measure with.
 * That's honest given this sandbox has no real GPU, but it also means every REAL deployment of
 * this engine has been flying blind: a world-builder adding a hundred more instanced buildings has
 * no way to see the draw-call count actually change.
 *
 * `WebGLRenderer.info` already tracks draw calls, triangle/point/line counts, live geometry and
 * texture counts, and compiled shader-program counts — for free, updated by three.js itself every
 * frame. This module doesn't invent new tracking; it exposes that existing counter in one small,
 * typed, engine-owned API, plus frame-time sampling for the one thing `renderer.info` doesn't
 * cover.
 *
 * WHAT'S HONEST HERE AND WHAT ISN'T: draw calls / triangles / geometries / textures / programs are
 * EXACT counts from the renderer itself — true on any GPU, including software rendering, because
 * they count CPU-side submitted work, not GPU execution time. Frame time / "FPS" is NOT verified
 * hardware performance — it's wall-clock time between `sample()` calls in whatever environment
 * this runs in, and this module labels it that way in its own return type
 * (`frameTimeMs`/`fps`, never bare "performance"). Never report `fps` from this module as a
 * hardware performance claim without independently verifying on real target hardware — see
 * PERFORMANCE.md's own "NOT VERIFIED ON HARDWARE" convention.
 */

export interface FrameCounters {
  /** Draw calls submitted this frame. The single most direct proxy for CPU-side rendering
   * overhead — see PERFORMANCE.md's instancing section for why this is the number instancing
   * exists to keep down. */
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  /** Live (undisposed) BufferGeometry count. A number that only grows across scene changes without
   * ever shrinking back down is a disposal leak — see `disposeSceneResources` below. */
  geometries: number;
  /** Live (undisposed) Texture count — same leak signal as `geometries`, for textures. */
  textures: number;
  /** Distinct compiled shader programs. Each unique material/light/shadow/tone-mapping
   * combination that appears in the scene compiles its own program; a surprisingly high count
   * relative to your material palette size usually means material variants are being created
   * per-object instead of shared (see `materials.ts`'s "one shared instance per category"
   * convention). */
  programs: number;
}

export interface FrameSample extends FrameCounters {
  /** Wall-clock milliseconds since the previous `sample()` call on this tracker (or since
   * construction, for the first sample). NOT a hardware performance measurement — see the module
   * doc above. */
  frameTimeMs: number;
  /** `1000 / frameTimeMs`, provided for convenience — same caveat as `frameTimeMs`. Never quote
   * this as a verified frame rate; label it "NOT VERIFIED ON HARDWARE" wherever it's surfaced to a
   * person. */
  fps: number;
}

function readCounters(renderer: THREE_NS.WebGLRenderer): FrameCounters {
  const info = renderer.info;
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    points: info.render.points,
    lines: info.render.lines,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
  };
}

/**
 * Reads `renderer.info` for the counters of the frame(s) rendered since the last `.reset()`. Call
 * once, any time after `render()`/`pipeline.render()` — this is a read of state three.js already
 * maintains, not something that needs to run inside the render loop itself.
 *
 * `renderer.info.autoReset` defaults to `true` in three.js, which zeroes `render.calls`/
 * `render.triangles`/etc. at the start of every frame automatically — call this right after the
 * frame you want to inspect, before the next one starts, or the counts you read will already be
 * gone.
 */
export function readFrameCounters(renderer: THREE_NS.WebGLRenderer): FrameCounters {
  return readCounters(renderer);
}

/**
 * Stateful frame-time tracker — the one piece `renderer.info` doesn't provide on its own. Call
 * `.sample(renderer)` once per rendered frame (typically right after `pipeline.render()`) to get
 * that frame's counters plus the wall-clock time since the previous sample.
 */
export class FrameProfiler {
  private lastSampleAt: number | null = null;

  /** Records one frame sample. `now` defaults to `performance.now()` — pass it explicitly in a
   * test or a non-browser environment that doesn't have the global. */
  sample(renderer: THREE_NS.WebGLRenderer, now: number = performance.now()): FrameSample {
    const counters = readCounters(renderer);
    const frameTimeMs = this.lastSampleAt === null ? 0 : Math.max(0, now - this.lastSampleAt);
    this.lastSampleAt = now;
    return {
      ...counters,
      frameTimeMs,
      fps: frameTimeMs > 0 ? 1000 / frameTimeMs : 0,
    };
  }

  /** Forgets the last sample time — the next `.sample()` call reports `frameTimeMs: 0` instead of
   * measuring across a gap (a paused scene, a route change) that isn't a real frame-time cost. */
  reset(): void {
    this.lastSampleAt = null;
  }
}

/**
 * GRAPHICS V3 — texture memory, estimated in real bytes.
 *
 * `renderer.info.memory.textures` (above) is a COUNT, not a size — `PERFORMANCE_BUDGET.md` §6 has
 * named this as a real, open gap since Graphics V2: "texture memory is currently unmeasured, not
 * merely unbudgeted". three.js's public API has no byte-size readback (unlike geometry, which
 * `BufferGeometry.attributes` at least makes countable), so this is a REAL COMPUTATION over the
 * actual scene graph, not a renderer-reported number — and it says so wherever it's surfaced.
 *
 * WHAT IS COMPUTED, EXACTLY: for every `Texture` reachable from a material's own map-shaped
 * properties (`map`, `normalMap`, `roughnessMap`, ... — the same properties `materials.ts`'s
 * factories actually populate), `width * height * bytesPerPixel`, deduplicated by `texture.uuid`
 * so a shared procedural `CanvasTexture` (the common case here — `materials.ts`'s worn-surface
 * factories are built once and cloned across many material instances) is counted once, not once
 * per material that references it.
 *
 * WHAT IS ASSUMED, STATED HONESTLY: `bytesPerPixel = 4` (RGBA8) — every texture this engine
 * produces is a `CanvasTexture`/`DataTexture` uploaded at that format; there is no compressed-
 * texture (KTX2/Basis) path anywhere in this codebase today, so this is not a simplification of a
 * real alternative, it is the actual format. Mipmaps add the standard `4/3` factor
 * (`1 + 1/4 + 1/16 + ...`) unless `texture.generateMipmaps === false`. This is an ESTIMATE of GPU
 * upload size, not a driver-reported allocation (real drivers pad/align; this does not model that)
 * — good enough to catch a texture-budget regression, not a substitute for a real GPU profiler.
 */
export interface TextureMemoryEstimate {
  /** Estimated total GPU bytes across every unique texture reachable from the scene graph. */
  totalBytes: number;
  /** Count of unique textures included (deduplicated by `texture.uuid`). Compare against
   * `renderer.info.memory.textures` the same way `geometries` is already used to spot a leak: a
   * persistent, growing gap between the two numbers means textures are being created and not
   * disposed. */
  uniqueTextureCount: number;
}

/** Every material property this engine's own materials (`materials.ts`, `water.ts`, `atmosphere.ts`,
 * and any future map-carrying material) actually populate — the full set three.js's standard/
 * physical materials expose, so a new map added anywhere is picked up without touching this list. */
const TEXTURE_MAP_PROPERTIES = [
  'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'emissiveMap', 'envMap', 'lightMap',
  'metalnessMap', 'normalMap', 'roughnessMap', 'specularMap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'transmissionMap', 'thicknessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'specularColorMap', 'specularIntensityMap', 'iridescenceMap', 'iridescenceThicknessMap', 'matcap',
  'gradientMap',
] as const;

function collectMaterialTextures(material: THREE_NS.Material, into: Map<string, THREE_NS.Texture>): void {
  const record = material as unknown as Record<string, unknown>;
  for (const prop of TEXTURE_MAP_PROPERTIES) {
    const value = record[prop];
    if (value && typeof value === 'object' && 'uuid' in (value as object) && 'isTexture' in (value as object)) {
      const texture = value as THREE_NS.Texture;
      if (!into.has(texture.uuid)) into.set(texture.uuid, texture);
    }
  }
}

function estimateTextureBytes(texture: THREE_NS.Texture): number {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!(width > 0) || !(height > 0)) return 0;
  const bytesPerPixel = 4; // RGBA8 — see module doc; no compressed-texture path exists in this codebase.
  const mipmapFactor = texture.generateMipmaps === false ? 1 : 4 / 3;
  return width * height * bytesPerPixel * mipmapFactor;
}

/**
 * Walks `scene`, collects every unique texture any material actually references, and sums a real
 * byte estimate — see the module doc above for exactly what is computed vs. assumed. Safe to call
 * on any real frame (it is a plain graph walk, no GPU readback), but it is not free — call it on an
 * interval (a settings/diagnostics panel), not every frame, the same way this file's own
 * `FrameProfiler` is meant to be sampled once per frame while THIS is meant to be sampled
 * occasionally.
 */
export function estimateSceneTextureMemory(scene: THREE_NS.Scene): TextureMemoryEstimate {
  const textures = new Map<string, THREE_NS.Texture>();
  scene.traverse((node) => {
    const material = (node as unknown as { material?: THREE_NS.Material | THREE_NS.Material[] }).material;
    if (!material) return;
    for (const mat of Array.isArray(material) ? material : [material]) collectMaterialTextures(mat, textures);
  });
  let totalBytes = 0;
  for (const texture of textures.values()) totalBytes += estimateTextureBytes(texture);
  return { totalBytes, uniqueTextureCount: textures.size };
}

/**
 * A short rolling window over `FrameSample`s — smooths out single-frame noise (a GC pause, a
 * one-off asset load) so a displayed number doesn't jitter uselessly. Pure math, no rendering
 * knowledge; feed it samples from `FrameProfiler`.
 */
export class RollingFrameStats {
  private readonly samples: FrameSample[] = [];

  constructor(private readonly windowSize = 30) {
    if (windowSize <= 0) throw new Error(`RollingFrameStats: windowSize must be > 0 (got ${windowSize})`);
  }

  push(sample: FrameSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.windowSize) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  /** Average frame time across the current window, in ms. `NaN` when no samples have been pushed
   * yet — check `.count` first if that matters to the caller. */
  get averageFrameTimeMs(): number {
    if (this.samples.length === 0) return NaN;
    const sum = this.samples.reduce((total, s) => total + s.frameTimeMs, 0);
    return sum / this.samples.length;
  }

  /** `1000 / averageFrameTimeMs` — same NOT-VERIFIED-ON-HARDWARE caveat as `FrameSample.fps`. */
  get averageFps(): number {
    const avg = this.averageFrameTimeMs;
    return avg > 0 ? 1000 / avg : 0;
  }

  /** Most recent sample's draw-call/triangle/geometry/texture/program counts — these don't need
   * averaging (they're exact per-frame CPU-side counts, not a noisy timing measurement), so this
   * just returns the latest one, or `null` before the first `push()`. */
  get latestCounters(): FrameCounters | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1]! : null;
  }
}
