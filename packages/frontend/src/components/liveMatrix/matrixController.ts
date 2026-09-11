import {
  DEFAULT_CONFIG, buildStreams, createParticleField, dprCapFor, effectiveQuality,
  normalizeConfig, renderFrame, renderStatic, updateParticles, updateStreams,
  type ActivityLevel, type DensityLevel, type GlowLevel, type MatrixConfig,
  type ParticleField, type QualityLevel, type RenderContext, type SpeedLevel, type Stream,
} from './matrixEngine';

/**
 * MATRIX CONTROLLER — the animation lifecycle, with every host capability
 * injected rather than reached for.
 *
 * ## Why this layer exists at all
 *
 * The lifecycle is where the real defects live: duplicate rAF loops, stale
 * closures over props, resize races, a loop that keeps running after unmount.
 * Held inside a React component those are reachable only through a DOM test
 * runner — and this repository has no jsdom and no @testing-library (checked,
 * not assumed: neither is in `package.json`, and vitest runs on `node`). A
 * component that can only be tested by machinery the project does not have is,
 * in practice, an untested component.
 *
 * So the lifecycle lives here, driven by an injected `MatrixHost`, and the
 * React component below it is a thin adapter that owns no logic. Every
 * behaviour the brief asks to prove — no duplicate loops, correct cleanup,
 * reduced-motion means zero frames, resize rebuilds, visibility pauses — is
 * asserted directly against this class in plain Node.
 *
 * ## One configuration, one writer
 *
 * `input` is the single source of truth. Props and the imperative API both
 * write into it, with LAST WRITE WINS, and props write only fields that
 * genuinely changed since the previous render (diffed against `lastProps`).
 * That is what stops the two from fighting: an imperative `setActivityLevel(3)`
 * survives unrelated re-renders, while a real `activity` prop change still
 * takes effect. There is no second "override" layer shadowing props forever,
 * and no `useMemo` object whose identity silently decides whether the engine
 * rebuilds.
 */

export interface MatrixConfigInput {
  activity?: ActivityLevel;
  density?: DensityLevel;
  speed?: SpeedLevel;
  glow?: GlowLevel;
  /** 0..1 convenience for `glow`; ignored when `glow` is given explicitly. */
  intensity?: number;
  quality?: QualityLevel;
  seed?: number;
  /** Explicit override. When undefined the host's `prefersReducedMotion()` decides. */
  reducedMotion?: boolean;
}

const CONFIG_KEYS = ['activity', 'density', 'speed', 'glow', 'intensity', 'quality', 'seed', 'reducedMotion'] as const;

/** Everything the controller needs from the outside world. No globals are read directly. */
export interface MatrixHost {
  now(): number;
  requestAnimationFrame(cb: (ts: number) => void): number;
  cancelAnimationFrame(handle: number): void;
  devicePixelRatio(): number;
  prefersReducedMotion(): boolean;
  isHidden(): boolean;
  /** The 2D context, cached by the host. Returning null disables rendering honestly. */
  getContext(): RenderContext | null;
  /** Applies the backing-store size and the DPR transform. */
  setCanvasSize(deviceWidth: number, deviceHeight: number, cssWidth: number, cssHeight: number, dpr: number): void;
}

/**
 * HONEST TELEMETRY. `fps` and `frameTimeMs` are null until the controller has
 * actually measured a full sampling window of its OWN frames — never a host
 * rAF rate, never an optimistic default. In reduced motion they stay null
 * because there is genuinely no loop to measure, and reporting 0 or 60 would
 * both be lies.
 */
export interface MatrixTelemetry {
  readonly running: boolean;
  readonly quality: QualityLevel;
  readonly reducedMotion: boolean;
  /** Frames per second of THIS renderer, over the last sampling window. */
  readonly fps: number | null;
  /** Wall-clock between consecutive frames (includes host idle), EMA. */
  readonly frameTimeMs: number | null;
  /** Time spent inside update+render only — the renderer's own cost, EMA. */
  readonly renderTimeMs: number | null;
  readonly streamCount: number;
  readonly particleCount: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly deviceWidth: number;
  readonly deviceHeight: number;
  readonly dpr: number;
  /** Frames drawn since start — lets a caller prove "no loop" rather than infer it. */
  readonly framesRendered: number;
}

const FPS_WINDOW_MS = 500;
const EMA_ALPHA = 0.15;

export class MatrixController {
  private readonly host: MatrixHost;
  private input: MatrixConfigInput = {};
  private lastProps: MatrixConfigInput = {};
  private config: MatrixConfig = DEFAULT_CONFIG;

  private streams: Stream[] = [];
  private particles: ParticleField = createParticleField();

  private rafHandle: number | null = null;
  private running = false;
  private lastTs: number | null = null;
  private destroyed = false;
  /**
   * The controller owns this fact. `host.isHidden()` is read ONCE, to seed it;
   * after that only `setHidden()` moves it. Consulting the host again on every
   * sync would mean two sources of truth for one fact — found by this file's
   * own test, where pausing via `setHidden(true)` was silently undone by the
   * next `resize()` because the host had not been told anything.
   */
  private hidden: boolean;

  private cssWidth = 0;
  private cssHeight = 0;
  private deviceWidth = 0;
  private deviceHeight = 0;
  private dpr = 1;

  private framesRendered = 0;
  private windowFrames = 0;
  private windowStart: number | null = null;
  private fps: number | null = null;
  private frameTimeMs: number | null = null;
  private renderTimeMs: number | null = null;

  constructor(host: MatrixHost, initial: MatrixConfigInput = {}) {
    this.host = host;
    this.input = { ...initial };
    this.lastProps = { ...initial };
    this.config = this.resolve();
    this.hidden = host.isHidden();
  }

  /** Resolves `input` + host reduced-motion into a fully normalised config. */
  private resolve(): MatrixConfig {
    const { intensity, glow } = this.input;
    return normalizeConfig({
      ...this.input,
      glow: glow ?? (typeof intensity === 'number'
        ? (intensity < 0.34 ? 'LOW' : intensity < 0.67 ? 'MEDIUM' : 'HIGH')
        : undefined),
      reducedMotion: this.input.reducedMotion ?? this.host.prefersReducedMotion(),
    });
  }

  /**
   * Props pass. Only genuinely CHANGED keys are written, so a re-render with
   * unchanged props never clobbers an imperative write.
   */
  applyProps(next: MatrixConfigInput): void {
    if (this.destroyed) return;
    let changed = false;
    for (const key of CONFIG_KEYS) {
      if (!Object.is(next[key], this.lastProps[key])) {
        (this.input as Record<string, unknown>)[key] = next[key];
        changed = true;
      }
    }
    this.lastProps = { ...next };
    if (changed) this.reconfigure();
  }

  setActivityLevel(level: ActivityLevel): void {
    if (this.destroyed) return;
    this.input.activity = level;
    this.reconfigure();
  }

  setQuality(quality: QualityLevel): void {
    if (this.destroyed) return;
    this.input.quality = quality;
    this.reconfigure();
  }

  /** Called when the host's `prefers-reduced-motion` media query flips. */
  systemMotionPreferenceChanged(): void {
    if (this.destroyed) return;
    this.reconfigure();
  }

  private reconfigure(): void {
    const previous = this.config;
    this.config = this.resolve();
    // The backing store only needs resizing when the DPR ceiling actually moves.
    if (dprCapFor(this.config) !== dprCapFor(previous)) this.applySize();
    this.rebuild();
    this.syncLoopToState();
  }

  /** New CSS size from the host (ResizeObserver). Rebuilds layout and re-syncs the loop. */
  resize(cssWidth: number, cssHeight: number): void {
    if (this.destroyed) return;
    this.cssWidth = Math.max(0, cssWidth);
    this.cssHeight = Math.max(0, cssHeight);
    this.applySize();
    this.rebuild();
    this.syncLoopToState();
  }

  private applySize(): void {
    const cap = dprCapFor(this.config);
    const dpr = Math.min(Math.max(1, this.host.devicePixelRatio() || 1), cap);
    this.dpr = dpr;
    this.deviceWidth = Math.max(1, Math.round(this.cssWidth * dpr));
    this.deviceHeight = Math.max(1, Math.round(this.cssHeight * dpr));
    this.host.setCanvasSize(this.deviceWidth, this.deviceHeight, this.cssWidth, this.cssHeight, dpr);
  }

  private rebuild(): void {
    this.streams = buildStreams(this.cssWidth, this.cssHeight, this.config);
    this.particles = createParticleField();
  }

  setHidden(hidden: boolean): void {
    if (this.destroyed) return;
    this.hidden = hidden;
    this.syncLoopToState();
  }

  /**
   * The ONE place that decides whether a loop should be running. Reduced
   * motion draws a single static frame and starts nothing; a hidden document
   * or an unsized canvas starts nothing either.
   */
  private syncLoopToState(): void {
    if (effectiveQuality(this.config) === 'REDUCED_MOTION') {
      this.stop();
      this.drawStatic();
      return;
    }
    if (this.hidden || this.cssWidth <= 0 || this.cssHeight <= 0) { this.stop(); return; }
    this.start();
  }

  /** Idempotent by construction: a second call while running is a no-op, so loops cannot duplicate. */
  start(): void {
    if (this.destroyed || this.running) return;
    if (effectiveQuality(this.config) === 'REDUCED_MOTION') return;
    this.running = true;
    this.lastTs = null;
    this.windowStart = null;
    this.windowFrames = 0;
    this.rafHandle = this.host.requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle !== null) {
      this.host.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.fps = null;
    this.frameTimeMs = null;
  }

  private readonly frame = (ts: number): void => {
    if (!this.running || this.destroyed) return;
    this.rafHandle = null;

    const ctx = this.host.getContext();
    if (!ctx) { this.stop(); return; } // honest: no context ⇒ no pretending to render

    const last = this.lastTs ?? ts;
    const rawDelta = ts - last;
    // Clamped so a backgrounded tab returning after seconds cannot teleport the
    // whole field; floored so a zero delta cannot freeze it.
    const dt = Math.min(0.05, Math.max(0.001, rawDelta / 1000));
    this.lastTs = ts;

    const renderStart = this.host.now();
    updateStreams(this.streams, dt, this.config, this.cssHeight);
    updateParticles(this.particles, dt, this.config, this.cssWidth, this.cssHeight);
    renderFrame(ctx, this.streams, this.particles.items, this.config, this.cssWidth, this.cssHeight);
    const renderMs = this.host.now() - renderStart;

    this.framesRendered++;
    this.renderTimeMs = this.renderTimeMs === null ? renderMs : this.renderTimeMs + EMA_ALPHA * (renderMs - this.renderTimeMs);
    if (this.lastTs !== null && rawDelta > 0) {
      this.frameTimeMs = this.frameTimeMs === null ? rawDelta : this.frameTimeMs + EMA_ALPHA * (rawDelta - this.frameTimeMs);
    }
    if (this.windowStart === null) this.windowStart = ts;
    this.windowFrames++;
    const elapsed = ts - this.windowStart;
    if (elapsed >= FPS_WINDOW_MS) {
      this.fps = Math.round((this.windowFrames * 1000) / elapsed);
      this.windowStart = ts;
      this.windowFrames = 0;
    }

    if (this.running) this.rafHandle = this.host.requestAnimationFrame(this.frame);
  };

  private drawStatic(): void {
    const ctx = this.host.getContext();
    if (!ctx) return;
    renderStatic(ctx, this.streams, this.config, this.cssWidth, this.cssHeight);
  }

  destroy(): void {
    this.stop();
    this.destroyed = true;
    this.streams = [];
    this.particles = createParticleField();
  }

  getConfig(): MatrixConfig { return this.config; }
  isRunning(): boolean { return this.running; }

  telemetry(): MatrixTelemetry {
    return {
      running: this.running,
      quality: effectiveQuality(this.config),
      reducedMotion: this.config.reducedMotion,
      fps: this.fps,
      frameTimeMs: this.frameTimeMs,
      renderTimeMs: this.renderTimeMs,
      streamCount: this.streams.length,
      particleCount: this.particles.items.length,
      cssWidth: this.cssWidth,
      cssHeight: this.cssHeight,
      deviceWidth: this.deviceWidth,
      deviceHeight: this.deviceHeight,
      dpr: this.dpr,
      framesRendered: this.framesRendered,
    };
  }
}

/**
 * The real browser host. The only file in this component that touches globals,
 * kept deliberately small so the untestable surface is a handful of lines.
 * `getContext` caches the 2D context and re-acquires it only if the canvas
 * element itself changes — the previous implementation called `getContext`
 * once per frame AND once per resize.
 */
export function createBrowserHost(canvas: HTMLCanvasElement): MatrixHost {
  let cached: CanvasRenderingContext2D | null = null;
  let cachedFor: HTMLCanvasElement | null = null;
  return {
    now: () => performance.now(),
    requestAnimationFrame: (cb) => window.requestAnimationFrame(cb),
    cancelAnimationFrame: (h) => window.cancelAnimationFrame(h),
    devicePixelRatio: () => window.devicePixelRatio || 1,
    prefersReducedMotion: () =>
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    isHidden: () => typeof document !== 'undefined' && document.hidden,
    getContext: () => {
      if (cachedFor !== canvas || cached === null) {
        cached = canvas.getContext('2d');
        cachedFor = canvas;
      }
      return cached;
    },
    setCanvasSize: (deviceWidth, deviceHeight, cssWidth, cssHeight, dpr) => {
      canvas.width = deviceWidth;
      canvas.height = deviceHeight;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      // Resizing the backing store resets context state, so the transform is
      // re-applied here rather than anywhere else.
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
  };
}
