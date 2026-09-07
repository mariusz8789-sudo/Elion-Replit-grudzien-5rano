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
