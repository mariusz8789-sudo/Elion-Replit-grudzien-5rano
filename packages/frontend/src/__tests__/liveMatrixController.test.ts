import { describe, expect, it } from 'vitest';
import { MatrixController, type MatrixHost } from '../components/liveMatrix/matrixController';
import { QUALITY_DPR_CAP, type RenderContext } from '../components/liveMatrix/matrixEngine';
import { toMatrixConfig, type GenesisVisualState } from '../components/liveMatrix/genesisVisualState';

/**
 * LIVE MATRIX LIFECYCLE — the part that actually breaks, tested directly.
 *
 * This repository has no jsdom and no @testing-library (checked against
 * package.json, not assumed), and vitest runs on `node`. That is precisely why
 * the lifecycle was extracted into `MatrixController` behind an injected
 * `MatrixHost`: duplicate rAF loops, cleanup, resize, visibility and
 * reduced-motion are all observable here, in plain Node, with a fake host that
 * hands frame timing to the test rather than to a browser.
 *
 * Several cases are REGRESSION tests for defects proven by execution during
 * the v1 audit; each says what it would have caught.
 */

function fakeHost(over: Partial<MatrixHost> = {}) {
  const state = {
    pending: new Map<number, (ts: number) => void>(),
    nextHandle: 1,
    cancelled: [] as number[],
    clock: 0,
    dpr: 2,
    reducedMotion: false,
    hidden: false,
    contextRequests: 0,
    sizes: [] as { deviceWidth: number; deviceHeight: number; cssWidth: number; cssHeight: number; dpr: number }[],
    drawn: { fillRect: 0, fillText: 0, clearRect: 0 },
  };

  const ctx: RenderContext = {
    fillStyle: '', shadowBlur: 0, shadowColor: '', font: '',
    fillRect: () => { state.drawn.fillRect++; },
    fillText: () => { state.drawn.fillText++; },
    clearRect: () => { state.drawn.clearRect++; },
  };

  const host: MatrixHost = {
    now: () => state.clock,
    requestAnimationFrame: (cb) => { const h = state.nextHandle++; state.pending.set(h, cb); return h; },
    cancelAnimationFrame: (h) => { state.cancelled.push(h); state.pending.delete(h); },
    devicePixelRatio: () => state.dpr,
    prefersReducedMotion: () => state.reducedMotion,
    isHidden: () => state.hidden,
    getContext: () => { state.contextRequests++; return ctx; },
    setCanvasSize: (deviceWidth, deviceHeight, cssWidth, cssHeight, dpr) => {
      state.sizes.push({ deviceWidth, deviceHeight, cssWidth, cssHeight, dpr });
    },
    ...over,
  };

  /** Runs exactly `count` frames, advancing the fake clock by `stepMs` each. */
  const pump = (count: number, stepMs = 16): void => {
    for (let i = 0; i < count; i++) {
      const due = [...state.pending.entries()];
      state.pending.clear();
      state.clock += stepMs;
      for (const [, cb] of due) cb(state.clock);
    }
  };

  return { host, state, pump };
}

const sized = (controller: MatrixController, w = 1440, h = 900): void => controller.resize(w, h);

describe('MatrixController — loop lifecycle', () => {
  it('starts a loop once sized, and renders real frames', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    expect(c.isRunning()).toBe(true);
    pump(3);
    expect(state.drawn.fillRect).toBeGreaterThan(0);
    expect(state.drawn.fillText).toBeGreaterThan(0);
    expect(c.telemetry().framesRendered).toBe(3);
    c.destroy();
  });

  it('does not start before it has a size — an unsized canvas renders nothing', () => {
    const { host, state } = fakeHost();
    const c = new MatrixController(host);
    expect(c.isRunning()).toBe(false);
    expect(state.drawn.fillRect).toBe(0);
    c.destroy();
  });

  /** REGRESSION: the defect class this whole controller exists to make testable. */
  it('start() is idempotent — repeated calls never create a second loop', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    c.start(); c.start(); c.start();
    expect(state.pending.size).toBe(1);
    pump(1);
    expect(state.pending.size).toBe(1); // still exactly one chain
    expect(c.telemetry().framesRendered).toBe(1);
    c.destroy();
  });

  it('reconfiguring while running does not fork the loop', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    c.setActivityLevel(3);
    c.setQuality('MEDIUM');
    c.applyProps({ seed: 99 });
    expect(state.pending.size).toBe(1);
    pump(5);
    expect(state.pending.size).toBe(1);
    expect(c.telemetry().framesRendered).toBe(5); // one frame per pump, not five per pump
    c.destroy();
  });

  it('destroy() cancels the pending frame and stops rendering for good', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    pump(2);
    const drawnBefore = state.drawn.fillRect;
    c.destroy();
    expect(state.cancelled.length).toBeGreaterThan(0);
    expect(state.pending.size).toBe(0);
    pump(5);
    expect(state.drawn.fillRect).toBe(drawnBefore);
    expect(c.isRunning()).toBe(false);
  });

  it('a destroyed controller ignores every further command rather than resurrecting', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    c.destroy();
    c.setActivityLevel(4);
    c.setQuality('HIGH');
    c.applyProps({ seed: 7 });
    c.resize(800, 600);
    c.setHidden(false);
    c.start();
    pump(3);
    expect(c.isRunning()).toBe(false);
    expect(state.drawn.fillRect).toBe(0);
  });

  it('stops honestly when the host cannot provide a drawing context', () => {
    const { host, pump } = fakeHost({ getContext: () => null });
    const c = new MatrixController(host);
    sized(c);
    pump(1);
    expect(c.isRunning()).toBe(false); // no pretending to render into nothing
    c.destroy();
  });
});

describe('MatrixController — visibility', () => {
  it('pauses when the document hides and resumes when it returns', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    pump(2);
    const drawnWhileVisible = state.drawn.fillRect;

    c.setHidden(true);
    expect(c.isRunning()).toBe(false);
    pump(5);
    expect(state.drawn.fillRect).toBe(drawnWhileVisible); // genuinely nothing drawn while hidden

    c.setHidden(false);
    expect(c.isRunning()).toBe(true);
    pump(2);
    expect(state.drawn.fillRect).toBeGreaterThan(drawnWhileVisible);
    c.destroy();
  });

  it('mounting into an already-hidden tab starts nothing', () => {
    const { host, state } = fakeHost();
    state.hidden = true; // the host reports hidden BEFORE the controller is built
    const c = new MatrixController(host);
    sized(c);
    expect(c.isRunning()).toBe(false);
    expect(c.telemetry().framesRendered).toBe(0);
    c.destroy();
  });
});

describe('MatrixController — reduced motion', () => {
  it('explicit reducedMotion draws ONE static frame and starts no loop at all', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host, { reducedMotion: true });
    sized(c);
    expect(c.isRunning()).toBe(false);
    expect(state.pending.size).toBe(0);
    expect(state.drawn.clearRect).toBe(1);     // the static compose ran
    expect(state.drawn.fillText).toBeGreaterThan(0); // ...and it has real content
    const after = state.drawn.fillText;
    pump(10);
    expect(state.drawn.fillText).toBe(after);  // zero animation
    expect(c.telemetry().framesRendered).toBe(0);
    c.destroy();
  });

  it('the host OS preference alone also suppresses the loop', () => {
    const { host, state } = fakeHost();
    state.reducedMotion = true;
    const c = new MatrixController(host);
    sized(c);
    expect(c.isRunning()).toBe(false);
    expect(state.drawn.clearRect).toBe(1);
    c.destroy();
  });

  it('an explicit reducedMotion={false} OVERRIDES the OS preference — the explicit value wins', () => {
    const { host, state } = fakeHost();
    state.reducedMotion = true;
    const c = new MatrixController(host, { reducedMotion: false });
    sized(c);
    expect(c.isRunning()).toBe(true);
    c.destroy();
  });

  it('reacts live when the OS preference flips in both directions', () => {
    const { host, state, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    expect(c.isRunning()).toBe(true);

    state.reducedMotion = true;
    c.systemMotionPreferenceChanged();
    expect(c.isRunning()).toBe(false);
    const frozen = state.drawn.fillText;
    pump(4);
    expect(state.drawn.fillText).toBe(frozen);

    state.reducedMotion = false;
    c.systemMotionPreferenceChanged();
    expect(c.isRunning()).toBe(true);
    pump(2);
    expect(state.drawn.fillText).toBeGreaterThan(frozen);
    c.destroy();
  });

  it('reports no FPS in reduced motion rather than a comforting zero or sixty', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host, { reducedMotion: true });
    sized(c);
    const t = c.telemetry();
    expect(t.fps).toBeNull();
    expect(t.frameTimeMs).toBeNull();
    expect(t.running).toBe(false);
    expect(t.quality).toBe('REDUCED_MOTION');
    c.destroy();
  });
});

describe('MatrixController — resize', () => {
  it('applies the backing store size, the CSS size and the DPR transform', () => {
    const { host, state } = fakeHost();
    const c = new MatrixController(host, { quality: 'HIGH' });
    c.resize(800, 600);
    const last = state.sizes[state.sizes.length - 1]!;
    expect(last.cssWidth).toBe(800);
    expect(last.cssHeight).toBe(600);
    expect(last.dpr).toBe(QUALITY_DPR_CAP.HIGH); // host reports 2, cap is 2
    expect(last.deviceWidth).toBe(1600);
    expect(last.deviceHeight).toBe(1200);
    c.destroy();
  });

  it('caps DPR per quality tier, from the one exported table', () => {
    const { host, state } = fakeHost();
    state.dpr = 4; // an absurd display
    const c = new MatrixController(host, { quality: 'LOW' });
    c.resize(1000, 1000);
    expect(state.sizes[state.sizes.length - 1]!.dpr).toBe(QUALITY_DPR_CAP.LOW);
    c.destroy();
  });

  it('never lets a low-DPR host scale BELOW 1 — the backing store is never smaller than CSS', () => {
    const { host, state } = fakeHost();
    state.dpr = 0; // a host that reports nonsense
    const c = new MatrixController(host);
    c.resize(500, 400);
    const last = state.sizes[state.sizes.length - 1]!;
    expect(last.dpr).toBeGreaterThanOrEqual(1);
    expect(last.deviceWidth).toBeGreaterThanOrEqual(500);
    c.destroy();
  });

  it('rebuilds the field for the new size, and keeps rendering afterwards', () => {
    const { host, pump } = fakeHost();
    const c = new MatrixController(host);
    c.resize(400, 300);
    const narrow = c.telemetry().streamCount;
    c.resize(1920, 1080);
    const wide = c.telemetry().streamCount;
    expect(wide).toBeGreaterThan(narrow); // the layout really responded to width
    pump(2);
    expect(c.telemetry().framesRendered).toBe(2);
    expect(c.isRunning()).toBe(true);
    c.destroy();
  });

  it('a resize to zero stops the loop instead of spinning on an empty canvas', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    expect(c.isRunning()).toBe(true);
    c.resize(0, 0);
    expect(c.isRunning()).toBe(false);
    expect(c.telemetry().streamCount).toBe(0);
    c.destroy();
  });

  it('resizing while hidden does not secretly restart the loop', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    c.setHidden(true);
    c.resize(1000, 800);
    expect(c.isRunning()).toBe(false);
    c.destroy();
  });
});

describe('MatrixController — configuration has exactly one source of truth', () => {
  it('props apply on change', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host, { activity: 1 });
    sized(c);
    c.applyProps({ activity: 3 });
    expect(c.getConfig().activity).toBe(3);
    c.destroy();
  });

  /**
   * REGRESSION — the v1 design kept imperative values in refs that a `useMemo`
   * over props could not see, so the two silently disagreed. Here a re-render
   * with UNCHANGED props must not clobber an imperative write.
   */
  it('an imperative setActivityLevel survives re-renders with unchanged props', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host, { activity: 1, seed: 5 });
    sized(c);
    c.setActivityLevel(4);
    expect(c.getConfig().activity).toBe(4);
    c.applyProps({ activity: 1, seed: 5 }); // same props, a plain re-render
    expect(c.getConfig().activity).toBe(4); // imperative value still stands
    c.destroy();
  });

  it('a genuinely changed prop wins over an earlier imperative write — last write wins, no permanent shadow', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host, { activity: 1 });
    sized(c);
    c.setActivityLevel(4);
    c.applyProps({ activity: 2 }); // the prop really changed
    expect(c.getConfig().activity).toBe(2);
    c.destroy();
  });

  it('an unrelated prop change leaves an imperative override alone', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host, { activity: 1, seed: 5 });
    sized(c);
    c.setQuality('LOW');
    c.applyProps({ activity: 1, seed: 6 }); // only the seed moved
    expect(c.getConfig().quality).toBe('LOW');
    expect(c.getConfig().seed).toBe(6);
    c.destroy();
  });

  it('intensity maps to a glow tier, and an explicit glow prop outranks it', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host, { intensity: 0.9 });
    expect(c.getConfig().glow).toBe('HIGH');
    c.applyProps({ intensity: 0.1 });
    expect(c.getConfig().glow).toBe('LOW');
    c.applyProps({ intensity: 0.1, glow: 'HIGH' });
    expect(c.getConfig().glow).toBe('HIGH');
    c.destroy();
  });

  it('switching quality re-sizes the backing store, because the DPR ceiling moved', () => {
    const { host, state } = fakeHost();
    const c = new MatrixController(host, { quality: 'HIGH' });
    c.resize(800, 600);
    const before = state.sizes.length;
    c.setQuality('LOW');
    expect(state.sizes.length).toBeGreaterThan(before);
    expect(state.sizes[state.sizes.length - 1]!.dpr).toBe(QUALITY_DPR_CAP.LOW);
    c.destroy();
  });
});

describe('MatrixController — telemetry is measured, never assumed', () => {
  it('reports the renderer\'s own frame rate, not the host rAF rate', () => {
    const { host, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    // 32 ms per frame ⇒ ~31 fps. A hook that merely counted host rAF ticks
    // would report whatever the host does; this must report what was rendered.
    pump(40, 32);
    const fps = c.telemetry().fps;
    expect(fps).not.toBeNull();
    expect(fps!).toBeGreaterThan(25);
    expect(fps!).toBeLessThan(36);
    c.destroy();
  });

  it('reports render time separately from frame time', () => {
    let clock = 0;
    const { host, pump } = fakeHost({ now: () => (clock += 2) }); // 2 ms of "work" per read pair
    const c = new MatrixController(host);
    sized(c);
    pump(20, 16);
    const t = c.telemetry();
    expect(t.renderTimeMs).not.toBeNull();
    expect(t.frameTimeMs).not.toBeNull();
    expect(t.frameTimeMs!).toBeCloseTo(16, 0); // wall clock between frames
    c.destroy();
  });

  it('is null before anything has been measured rather than optimistic', () => {
    const { host } = fakeHost();
    const c = new MatrixController(host);
    const t = c.telemetry();
    expect(t.fps).toBeNull();
    expect(t.frameTimeMs).toBeNull();
    expect(t.renderTimeMs).toBeNull();
    expect(t.framesRendered).toBe(0);
    c.destroy();
  });

  it('exposes the real geometry and workload the renderer is carrying', () => {
    const { host, pump } = fakeHost();
    const c = new MatrixController(host, { quality: 'HIGH', activity: 3 });
    c.resize(1440, 900);
    pump(5);
    const t = c.telemetry();
    expect(t.cssWidth).toBe(1440);
    expect(t.cssHeight).toBe(900);
    expect(t.deviceWidth).toBe(2880);
    expect(t.dpr).toBe(2);
    expect(t.streamCount).toBeGreaterThan(0);
    expect(t.particleCount).toBeGreaterThan(0);
    expect(t.quality).toBe('HIGH');
    c.destroy();
  });

  it('drops the fps reading when the loop stops, instead of leaving a stale number', () => {
    const { host, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    pump(40, 16);
    expect(c.telemetry().fps).not.toBeNull();
    c.setHidden(true);
    expect(c.telemetry().fps).toBeNull();
    c.destroy();
  });
});

describe('MatrixController — frame timing safety', () => {
  it('a long gap (backgrounded tab) cannot teleport the field', () => {
    const { host, pump } = fakeHost();
    const c = new MatrixController(host, { seed: 3 });
    sized(c, 800, 600);
    pump(1, 16);
    const afterOne = c.telemetry().framesRendered;
    // A 30-second stall: dt must be clamped, so this stays one ordinary step.
    pump(1, 30_000);
    expect(c.telemetry().framesRendered).toBe(afterOne + 1);
    expect(c.isRunning()).toBe(true); // survived rather than throwing on a huge dt
    c.destroy();
  });

  it('a zero-length frame still advances rather than freezing', () => {
    const { host, pump } = fakeHost();
    const c = new MatrixController(host);
    sized(c);
    pump(3, 0);
    expect(c.telemetry().framesRendered).toBe(3);
    c.destroy();
  });
});

describe('Genesis visual-state adapter', () => {
  it('maps every declared activity to a distinct renderer tier', () => {
    const tiers = (['IDLE', 'ACTIVE', 'RESEARCH', 'RUNNING', 'ATTENTION'] as const)
      .map((activity) => toMatrixConfig({ activity }).activity);
    expect(tiers).toEqual([0, 1, 2, 3, 4]);
  });

  it('passes intensity, quality, seed and reducedMotion straight through', () => {
    const state: GenesisVisualState = { activity: 'RUNNING', intensity: 0.8, quality: 'MEDIUM', seed: 21, reducedMotion: true };
    expect(toMatrixConfig(state)).toEqual({
      activity: 3, intensity: 0.8, quality: 'MEDIUM', seed: 21, reducedMotion: true,
    });
  });

  it('is total: an unknown activity degrades to ACTIVE instead of throwing', () => {
    // A background that crashes the app it decorates is a worse failure than a wrong tier.
    const rogue = { activity: 'NOT_A_TIER' } as unknown as GenesisVisualState;
    expect(() => toMatrixConfig(rogue)).not.toThrow();
    expect(toMatrixConfig(rogue).activity).toBe(1);
  });

  it('feeds the controller end to end', () => {
    const { host, pump } = fakeHost();
    const c = new MatrixController(host, toMatrixConfig({ activity: 'ATTENTION', seed: 4 }));
    sized(c);
    expect(c.getConfig().activity).toBe(4);
    pump(2);
    expect(c.telemetry().framesRendered).toBe(2);
    c.destroy();
  });
});
