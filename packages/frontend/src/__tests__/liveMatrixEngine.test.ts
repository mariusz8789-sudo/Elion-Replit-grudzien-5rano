import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, QUALITY_DPR_CAP, buildStreams, createParticleField, dprCapFor, effectiveQuality,
  hashGlyph, mulberry32, normalizeConfig, renderFrame, renderStatic, updateParticles, updateStreams,
  type MatrixConfig, type RenderContext,
} from '../components/liveMatrix/matrixEngine';

/**
 * LIVE MATRIX ENGINE — pure-function tests, no DOM required.
 *
 * Several cases below are REGRESSION tests for defects proven by execution
 * during the audit of the v1 prototype, not by reading it. Each one is
 * labelled with what it would have caught.
 */

/** A recording stand-in for `CanvasRenderingContext2D` — the engine's `RenderContext` is exactly this narrow. */
function recordingContext() {
  const calls = { fillRect: [] as unknown[][], fillText: [] as unknown[][], clearRect: [] as unknown[][] };
  const fills: string[] = [];
  const ctx: RenderContext & { calls: typeof calls; fills: string[] } = {
    fillStyle: '', shadowBlur: 0, shadowColor: '', font: '',
    fillRect: (...a: unknown[]) => { calls.fillRect.push(a); },
    fillText: (...a: unknown[]) => { calls.fillText.push(a); fills.push(String(ctx.fillStyle)); },
    clearRect: (...a: unknown[]) => { calls.clearRect.push(a); },
    calls, fills,
  };
  return ctx;
}

const cfg = (over: Record<string, unknown> = {}): MatrixConfig => normalizeConfig(over);

describe('normalizeConfig', () => {
  it('produces the documented default from an empty object', () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('falls back to defaults for every wrong-typed field instead of propagating garbage', () => {
    const c = normalizeConfig({ activity: 99, density: 'xyz', speed: null, glow: 5, quality: 'NOPE', seed: -12 });
    expect(c.activity).toBe(4);       // clamped to the top tier
    expect(c.density).toBe('MEDIUM');
    expect(c.speed).toBe('MEDIUM');
    expect(c.glow).toBe('MEDIUM');
    expect(c.quality).toBe('HIGH');
    expect(c.seed).toBe(0);           // clamped to the bottom
  });

  /**
   * REGRESSION — proven by execution: the v1 prototype only CLAMPED activity,
   * so a fractional 2.7 indexed the ACTIVITY table at 2.7, got `undefined`,
   * and the next property read threw
   * `TypeError: Cannot read properties of undefined (reading 'speed')`.
   */
  it('rounds a fractional activity to a real tier — a clamp alone left an undefined table index', () => {
    expect(normalizeConfig({ activity: 2.7 }).activity).toBe(3);
    expect(normalizeConfig({ activity: 0.4 }).activity).toBe(0);
    for (const value of [2.7, 0.4, 3.5, -0.2, 4.9]) {
      const c = normalizeConfig({ activity: value });
      expect(Number.isInteger(c.activity)).toBe(true);
      // The real proof: every stage downstream reads the table without throwing.
      expect(() => buildStreams(400, 300, c)).not.toThrow();
      expect(() => updateStreams(buildStreams(400, 300, c), 0.016, c, 300)).not.toThrow();
    }
  });

  it('rejects NaN and Infinity rather than letting them reach the layout maths', () => {
    expect(normalizeConfig({ activity: NaN }).activity).toBe(DEFAULT_CONFIG.activity);
    expect(normalizeConfig({ seed: Infinity }).seed).toBe(DEFAULT_CONFIG.seed);
  });
});

describe('determinism', () => {
  it('same seed and size produce byte-identical stream layout', () => {
    expect(buildStreams(800, 600, cfg({ seed: 7 }))).toEqual(buildStreams(800, 600, cfg({ seed: 7 })));
  });

  it('a different seed produces a different layout', () => {
    const a = buildStreams(800, 600, cfg({ seed: 7 }));
    const b = buildStreams(800, 600, cfg({ seed: 8 }));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('mulberry32 and hashGlyph are pure', () => {
    expect(hashGlyph(1, 2, 3)).toBe(hashGlyph(1, 2, 3));
    const r1 = mulberry32(42); const r2 = mulberry32(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });

  it('no layout path consults Math.random — the same config replayed after seeding others is unchanged', () => {
    const first = buildStreams(640, 480, cfg({ seed: 99 }));
    buildStreams(1920, 1080, cfg({ seed: 1 }));
    buildStreams(320, 240, cfg({ seed: 2 }));
    expect(buildStreams(640, 480, cfg({ seed: 99 }))).toEqual(first);
  });
});

describe('density responds to quality and activity', () => {
  it('LOW quality yields fewer streams than HIGH', () => {
    expect(buildStreams(800, 600, cfg({ seed: 7, quality: 'LOW' })).length)
      .toBeLessThan(buildStreams(800, 600, cfg({ seed: 7, quality: 'HIGH' })).length);
  });

  it('a busier activity tier yields more streams than IDLE', () => {
    expect(buildStreams(800, 600, cfg({ seed: 7, activity: 3 })).length)
      .toBeGreaterThan(buildStreams(800, 600, cfg({ seed: 7, activity: 0 })).length);
  });

  it('all three depth layers are present, and deeper layers are denser than the foreground', () => {
    const streams = buildStreams(1440, 900, cfg({ seed: 3 }));
    const perLayer = [0, 1, 2].map((l) => streams.filter((s) => s.layer === l).length);
    for (const count of perLayer) expect(count).toBeGreaterThan(0);
    expect(perLayer[0]!).toBeGreaterThan(perLayer[2]!);
  });

  it('a zero-sized canvas yields no streams rather than NaN geometry', () => {
    expect(buildStreams(0, 0, cfg())).toEqual([]);
    expect(buildStreams(-5, 100, cfg())).toEqual([]);
  });

  /**
   * REGRESSION — proven by execution (real headless Chromium, real elapsed
   * time), not by reading the code: the v1 build placed every stream's `y`
   * strictly above the viewport (`-rng()*height*1.6 - ...`), so on a fresh
   * mount the canvas measured fully black for ~10-14s and still <0.2%
   * populated at 30s, even at IDLE (the calmest, but also the DEFAULT tier
   * for a fresh Home visit with an empty Science Memory — exactly a first
   * grant-demo impression). `buildStreams` is the initial-build path;
   * `updateStreams`'s respawn re-entering above y=0 (tested above) is correct
   * and untouched — only the FIRST build must already look "in progress."
   */
  it('immediately after build (zero elapsed time, no updateStreams), some stream heads are already inside the visible viewport at every activity tier including IDLE', () => {
    for (const activity of [0, 1, 2, 3, 4] as const) {
      const streams = buildStreams(1280, 800, cfg({ seed: 42, activity }));
      const visible = streams.filter((s) => s.y >= 0 && s.y <= 800);
      expect(visible.length, `activity tier ${activity} has no immediately-visible stream heads`).toBeGreaterThan(0);
    }
  });

  it('a frame rendered right after build (no updateStreams) actually draws visible glyphs, at IDLE too', () => {
    const c = cfg({ seed: 42, activity: 0 });
    const streams = buildStreams(1280, 800, c);
    const ctx = recordingContext();
    renderFrame(ctx, streams, [], c, 1280, 800);
    expect(ctx.calls.fillText.length).toBeGreaterThan(0);
  });
});

describe('movement and respawn', () => {
  it('updateStreams advances every stream', () => {
    const c = cfg({ seed: 7 });
    const streams = buildStreams(800, 600, c);
    const before = streams.map((s) => s.y);
    updateStreams(streams, 0.016, c, 600);
    expect(streams.every((s, i) => s.y > before[i]!)).toBe(true);
  });

  it('respawn is staggered — streams never reset onto one line', () => {
    const c = cfg({ seed: 7, speed: 'HIGH' });
    const streams = buildStreams(400, 300, c);
    for (let i = 0; i < 600; i++) updateStreams(streams, 0.05, c, 300);
    expect(streams.some((s) => s.epoch > 0)).toBe(true); // respawn really happened
    expect(new Set(streams.map((s) => Math.round(s.y))).size).toBeGreaterThan(10);
  });

  it('a stream re-enters above the viewport at the moment it respawns, never popping in mid-screen', () => {
    const c = cfg({ seed: 11, speed: 'HIGH' });
    const streams = buildStreams(400, 300, c);
    const epochs = streams.map((s) => s.epoch);
    let respawnsChecked = 0;
    // The invariant holds AT respawn, so it has to be observed at respawn —
    // checking it at some arbitrary later tick only re-measures ordinary falling.
    for (let step = 0; step < 400; step++) {
      updateStreams(streams, 0.05, c, 300);
      streams.forEach((s, i) => {
        if (s.epoch > epochs[i]!) {
          expect(s.y).toBeLessThanOrEqual(0);
          epochs[i] = s.epoch;
          respawnsChecked++;
        }
      });
    }
    expect(respawnsChecked).toBeGreaterThan(0); // the assertion above really ran
  });
});

describe('particle field', () => {
  it('grows toward a width-derived target and removes particles that leave the viewport', () => {
    const c = cfg({ seed: 5, activity: 3 });
    const field = createParticleField();
    updateParticles(field, 0.016, c, 1920, 1080);
    expect(field.items.length).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) updateParticles(field, 0.05, c, 1920, 1080);
    expect(field.items.every((p) => p.y <= 1080 + 20)).toBe(true);
  });

  /**
   * REGRESSION — proven by execution: v1 seeded each new particle from
   * `items.length`, so slot N always got the same x forever. Measured: the
   * same four x-positions (676, 1759, 870, 721) on every refill cycle, which
   * reads as a looping GIF rather than an organic field.
   */
  it('refilled particles do not reuse the same x-positions — the field never visibly loops', () => {
    const c = cfg({ seed: 1337, activity: 3 });
    const field = createParticleField();
    const seen = new Set<number>();
    for (let cycle = 0; cycle < 6; cycle++) {
      updateParticles(field, 0.016, c, 1920, 1080);
      for (const p of field.items) seen.add(Math.round(p.x));
      field.items.length = 0; // force a full refill
    }
    expect(field.spawned).toBeGreaterThan(10);
    // Distinct x-positions must scale with how many particles were ever spawned.
    expect(seen.size).toBeGreaterThan(field.spawned * 0.6);
  });

  it('is still deterministic: the same seed replays the same particle sequence', () => {
    const c = cfg({ seed: 42, activity: 3 });
    const run = () => {
      const f = createParticleField();
      for (let i = 0; i < 20; i++) updateParticles(f, 0.016, c, 800, 600);
      return f.items.map((p) => [p.x, p.y, p.glyph]);
    };
    expect(run()).toEqual(run());
  });

  it('IDLE keeps the particle field sparse compared with RUNNING', () => {
    const idle = createParticleField(); const running = createParticleField();
    updateParticles(idle, 0.016, cfg({ seed: 4, activity: 0 }), 1920, 1080);
    updateParticles(running, 0.016, cfg({ seed: 4, activity: 3 }), 1920, 1080);
    expect(idle.items.length).toBeLessThan(running.items.length);
  });
});

describe('reduced motion', () => {
  it('maps effective quality to REDUCED_MOTION regardless of the requested tier', () => {
    expect(effectiveQuality(cfg({ reducedMotion: true, quality: 'HIGH' }))).toBe('REDUCED_MOTION');
    expect(effectiveQuality(cfg({ reducedMotion: false, quality: 'HIGH' }))).toBe('HIGH');
  });

  it('renderStatic composes full columns and keeps the glow, with no trail fade', () => {
    const c = cfg({ seed: 8, reducedMotion: true });
    const ctx = recordingContext();
    renderStatic(ctx, buildStreams(800, 600, c), c, 800, 600);
    expect(ctx.calls.clearRect.length).toBe(1);
    // Far more glyphs than a single animated frame: whole trails are composed.
    expect(ctx.calls.fillText.length).toBeGreaterThan(buildStreams(800, 600, c).length * 3);
  });

  it('renderStatic on an unsized canvas draws nothing rather than throwing', () => {
    const ctx = recordingContext();
    renderStatic(ctx, [], cfg({ reducedMotion: true }), 0, 0);
    expect(ctx.calls.fillText.length).toBe(0);
  });
});

describe('rendering', () => {
  it('draws the trail-fade rect first, then glyphs', () => {
    const c = cfg({ seed: 2 });
    const ctx = recordingContext();
    renderFrame(ctx, buildStreams(800, 600, c), [], c, 800, 600);
    expect(ctx.calls.fillRect.length).toBe(1);
    expect(ctx.calls.fillRect[0]).toEqual([0, 0, 800, 600]);
    expect(ctx.calls.fillText.length).toBeGreaterThan(0);
  });

  it('LOW quality disables glow entirely — shadowBlur never rises', () => {
    const c = cfg({ seed: 2, quality: 'LOW' });
    const ctx = recordingContext();
    let maxBlur = 0;
    const spy: RenderContext = new Proxy(ctx, {
      set(target, prop, value) {
        if (prop === 'shadowBlur') maxBlur = Math.max(maxBlur, Number(value));
        return Reflect.set(target, prop, value);
      },
    });
    renderFrame(spy, buildStreams(800, 600, c), [], c, 800, 600);
    expect(maxBlur).toBe(0);
  });

  it('an unsized canvas renders nothing rather than throwing', () => {
    const ctx = recordingContext();
    renderFrame(ctx, [], [], cfg(), 0, 0);
    expect(ctx.calls.fillRect.length).toBe(0);
  });

  /**
   * REGRESSION — proven by execution: v1 compared a unit-interval hash against
   * `amber * 10`, i.e. `< 1.2`, which is true for every possible value.
   * Measured on 5000 streams: 100.0% amber at ATTENTION instead of ~12%.
   */
  it('ATTENTION tints only a minority of streams amber — never the whole field', () => {
    const c = cfg({ seed: 21, activity: 4, quality: 'HIGH' });
    const ctx = recordingContext();
    const streams = buildStreams(1920, 1080, c);
    renderFrame(ctx, streams, [], c, 1920, 1080);
    const amberFills = ctx.fills.filter((f) => f.startsWith('rgba(255,214,170')).length;
    const headFills = streams.length; // one head glyph per stream
    const ratio = amberFills / headFills;
    expect(ratio).toBeGreaterThan(0);     // the accent is genuinely present
    expect(ratio).toBeLessThan(0.35);     // ...and genuinely subtle
  });

  it('non-ATTENTION tiers show no amber at all', () => {
    for (const activity of [0, 1, 2, 3]) {
      const c = cfg({ seed: 21, activity });
      const ctx = recordingContext();
      renderFrame(ctx, buildStreams(1200, 800, c), [], c, 1200, 800);
      expect(ctx.fills.some((f) => f.startsWith('rgba(255,214,170'))).toBe(false);
    }
  });

  /**
   * REGRESSION — same `* 10` defect on the flicker probability. Measured:
   * 49.8% of streams flickering at HIGH quality instead of the intended ~5%.
   */
  it('the trail flicker stays sporadic rather than firing on half the field', () => {
    const c = cfg({ seed: 33, quality: 'HIGH' });
    const streams = buildStreams(1920, 1080, c);
    const ctx = recordingContext();
    renderFrame(ctx, streams, [], c, 1920, 1080);
    // Head + neck are unconditional; anything beyond 2 glyphs per stream is flicker.
    const flickerGlyphs = ctx.calls.fillText.length - streams.length * 2;
    expect(flickerGlyphs).toBeGreaterThanOrEqual(0);
    expect(flickerGlyphs / streams.length).toBeLessThan(0.2);
  });
});

describe('QUALITY_DPR_CAP is the single source of truth', () => {
  it('exports a cap for every quality tier', () => {
    for (const q of ['HIGH', 'MEDIUM', 'LOW', 'REDUCED_MOTION'] as const) {
      expect(typeof QUALITY_DPR_CAP[q]).toBe('number');
      expect(QUALITY_DPR_CAP[q]).toBeGreaterThan(0);
    }
  });

  it('dprCapFor reads that same table, including the reduced-motion override', () => {
    expect(dprCapFor(cfg({ quality: 'HIGH' }))).toBe(QUALITY_DPR_CAP.HIGH);
    expect(dprCapFor(cfg({ quality: 'LOW' }))).toBe(QUALITY_DPR_CAP.LOW);
    expect(dprCapFor(cfg({ quality: 'HIGH', reducedMotion: true }))).toBe(QUALITY_DPR_CAP.REDUCED_MOTION);
  });
});
