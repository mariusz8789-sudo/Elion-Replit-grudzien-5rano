import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, LINK_RADIUS, QUALITY_DPR_CAP, buildStreams, createParticleField, dprCapFor, effectiveQuality,
  hashGlyph, linkPairs, mulberry32, nodeTag, normalizeConfig, renderFrame, renderStatic, updateParticles, updateStreams,
  type MatrixConfig, type RenderContext,
} from '../components/liveMatrix/matrixEngine';

/**
 * EVIDENCE FIELD ENGINE — pure-function tests, no DOM required (D-117: the
 * renderer behind `LiveMatrixBackground` composes an evidence lattice, not
 * digital rain; the public API and the config vocabulary are unchanged).
 *
 * Several cases are REGRESSION tests for defects proven by execution in the
 * previous renderer (a clamp-only activity index, `* 10` probability bugs,
 * particle slots that looped the same x-positions, a first build that left
 * the canvas empty for ~10 s). They stay because the same mistakes are just
 * as easy to make in this renderer.
 */

/** A recording stand-in for `CanvasRenderingContext2D` — the engine's `RenderContext` is exactly this narrow. */
function recordingContext() {
  const calls = {
    fillRect: [] as unknown[][], fillText: [] as unknown[][], clearRect: [] as unknown[][],
    arc: [] as unknown[][], stroke: 0, fill: 0,
  };
  const fills: string[] = [];
  const rectFills: string[] = [];
  const strokes: string[] = [];
  const ctx: RenderContext & { calls: typeof calls; fills: string[]; rectFills: string[]; strokes: string[] } = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, shadowBlur: 0, shadowColor: '', font: '',
    fillRect: (...a: unknown[]) => { calls.fillRect.push(a); rectFills.push(String(ctx.fillStyle)); },
    fillText: (...a: unknown[]) => { calls.fillText.push(a); },
    clearRect: (...a: unknown[]) => { calls.clearRect.push(a); },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: (...a: unknown[]) => { calls.arc.push(a); },
    fill: () => { calls.fill++; fills.push(String(ctx.fillStyle)); },
    stroke: () => { calls.stroke++; strokes.push(String(ctx.strokeStyle)); },
    calls, fills, rectFills, strokes,
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
    expect(c.activity).toBe(4);
    expect(c.density).toBe('MEDIUM');
    expect(c.speed).toBe('MEDIUM');
    expect(c.glow).toBe('MEDIUM');
    expect(c.quality).toBe('HIGH');
    expect(c.seed).toBe(0);
  });

  it('rounds a fractional activity to a real tier — a clamp alone left an undefined table index', () => {
    expect(normalizeConfig({ activity: 2.7 }).activity).toBe(3);
    expect(normalizeConfig({ activity: 0.4 }).activity).toBe(0);
    for (const value of [2.7, 0.4, 3.5, -0.2, 4.9]) {
      const c = normalizeConfig({ activity: value });
      expect(Number.isInteger(c.activity)).toBe(true);
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
  it('same seed and size produce byte-identical node layout', () => {
    expect(buildStreams(800, 600, cfg({ seed: 7 }))).toEqual(buildStreams(800, 600, cfg({ seed: 7 })));
  });

  it('a different seed produces a different layout', () => {
    expect(JSON.stringify(buildStreams(800, 600, cfg({ seed: 7 })))).not.toBe(JSON.stringify(buildStreams(800, 600, cfg({ seed: 8 }))));
  });

  it('mulberry32, hashGlyph and nodeTag are pure', () => {
    expect(hashGlyph(1, 2, 3)).toBe(hashGlyph(1, 2, 3));
    const r1 = mulberry32(42); const r2 = mulberry32(42);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    expect(nodeTag({ seed: 99, epoch: 1 })).toBe(nodeTag({ seed: 99, epoch: 1 }));
    expect(nodeTag({ seed: 99, epoch: 1 })).toMatch(/^[0-9a-f]{8}$/);
    expect(nodeTag({ seed: 99, epoch: 2 })).not.toBe(nodeTag({ seed: 99, epoch: 1 }));
  });

  it('no layout path consults Math.random — the same config replayed after building others is unchanged', () => {
    const first = buildStreams(640, 480, cfg({ seed: 99 }));
    buildStreams(1920, 1080, cfg({ seed: 1 }));
    buildStreams(320, 240, cfg({ seed: 2 }));
    expect(buildStreams(640, 480, cfg({ seed: 99 }))).toEqual(first);
  });

  it('link selection is a pure function of positions', () => {
    const nodes = buildStreams(800, 600, cfg({ seed: 5 }));
    expect(linkPairs(nodes, LINK_RADIUS, 3)).toEqual(linkPairs(nodes, LINK_RADIUS, 3));
  });
});

describe('density responds to quality and activity', () => {
  it('LOW quality yields fewer nodes than HIGH', () => {
    expect(buildStreams(800, 600, cfg({ seed: 7, quality: 'LOW' })).length)
      .toBeLessThan(buildStreams(800, 600, cfg({ seed: 7, quality: 'HIGH' })).length);
  });

  it('a busier activity tier yields more nodes than IDLE', () => {
    expect(buildStreams(800, 600, cfg({ seed: 7, activity: 3 })).length)
      .toBeGreaterThan(buildStreams(800, 600, cfg({ seed: 7, activity: 0 })).length);
  });

  it('all three depth layers are present, and the far layer is denser than the near one', () => {
    const nodes = buildStreams(1440, 900, cfg({ seed: 3 }));
    const perLayer = [0, 1, 2].map((l) => nodes.filter((s) => s.layer === l).length);
    for (const count of perLayer) expect(count).toBeGreaterThan(0);
    expect(perLayer[0]!).toBeGreaterThan(perLayer[2]!);
  });

  it('a zero-sized canvas yields no nodes rather than NaN geometry', () => {
    expect(buildStreams(0, 0, cfg())).toEqual([]);
    expect(buildStreams(-5, 100, cfg())).toEqual([]);
  });

  it('immediately after build (no updateStreams), most nodes are already inside the viewport at every activity tier including IDLE', () => {
    for (const activity of [0, 1, 2, 3, 4] as const) {
      const nodes = buildStreams(1280, 800, cfg({ seed: 42, activity }));
      const visible = nodes.filter((s) => s.y >= 0 && s.y <= 800 && s.x >= 0 && s.x <= 1280);
      expect(visible.length, `activity tier ${activity}`).toBeGreaterThan(nodes.length * 0.6);
    }
  });

  it('a frame rendered right after build draws nodes, links and at least one fingerprint tag, at IDLE too', () => {
    const c = cfg({ seed: 42, activity: 0 });
    const nodes = buildStreams(1280, 800, c);
    const ctx = recordingContext();
    renderFrame(ctx, nodes, [], c, 1280, 800);
    expect(ctx.calls.arc.length).toBeGreaterThanOrEqual(nodes.length);
    expect(ctx.calls.stroke).toBeGreaterThan(0);
    expect(ctx.calls.fillText.length).toBeGreaterThan(0);
  });

  it('every layer carries at least one labelled node, so the tag layer can never be empty by chance', () => {
    const nodes = buildStreams(320, 200, cfg({ seed: 1, quality: 'LOW', activity: 0 }));
    for (const layer of [0, 1, 2]) expect(nodes.some((s) => s.layer === layer && s.labelled)).toBe(true);
  });
});

describe('movement and respawn', () => {
  it('updateStreams lifts every node and sways it around its home column', () => {
    const c = cfg({ seed: 7 });
    const nodes = buildStreams(800, 600, c);
    const before = nodes.map((s) => s.y);
    updateStreams(nodes, 0.016, c, 600);
    expect(nodes.every((s, i) => s.y < before[i]!)).toBe(true);
    expect(nodes.every((s) => Math.abs(s.x - s.homeX) <= s.sway + 1e-9)).toBe(true);
  });

  it('respawn is staggered — nodes never reset onto one line', () => {
    const c = cfg({ seed: 7, speed: 'HIGH', activity: 3 });
    const nodes = buildStreams(400, 300, c);
    for (let i = 0; i < 2000; i++) updateStreams(nodes, 0.05, c, 300);
    expect(nodes.some((s) => s.epoch > 0)).toBe(true);
    expect(new Set(nodes.map((s) => Math.round(s.y))).size).toBeGreaterThan(10);
  });

  it('a node re-enters below the viewport at the moment it respawns, never popping in mid-screen', () => {
    const c = cfg({ seed: 11, speed: 'HIGH', activity: 3 });
    const nodes = buildStreams(400, 300, c);
    const epochs = nodes.map((s) => s.epoch);
    let respawnsChecked = 0;
    for (let step = 0; step < 2000; step++) {
      updateStreams(nodes, 0.05, c, 300);
      nodes.forEach((s, i) => {
        if (s.epoch > epochs[i]!) {
          expect(s.y).toBeGreaterThanOrEqual(300);
          epochs[i] = s.epoch;
          respawnsChecked++;
        }
      });
    }
    expect(respawnsChecked).toBeGreaterThan(0);
  });
});

describe('links', () => {
  it('connects only nodes closer than the radius, at most maxPerNode links each', () => {
    const nodes = buildStreams(1440, 900, cfg({ seed: 9 }));
    const links = linkPairs(nodes, LINK_RADIUS, 3);
    const degree = new Map<number, number>();
    for (const l of links) {
      expect(l.distance).toBeLessThan(LINK_RADIUS);
      expect(l.a).toBeLessThan(l.b);
      degree.set(l.a, (degree.get(l.a) ?? 0) + 1);
      degree.set(l.b, (degree.get(l.b) ?? 0) + 1);
    }
    expect(links.length).toBeGreaterThan(0);
    for (const d of degree.values()) expect(d).toBeLessThanOrEqual(3);
  });

  it('a zero budget or a lone node yields no links rather than throwing', () => {
    const nodes = buildStreams(800, 600, cfg({ seed: 9 }));
    expect(linkPairs(nodes, LINK_RADIUS, 0)).toEqual([]);
    expect(linkPairs(nodes.slice(0, 1), LINK_RADIUS, 3)).toEqual([]);
  });

  it('LOW quality draws fewer links than HIGH for the same layout', () => {
    const nodes = buildStreams(1440, 900, cfg({ seed: 9 }));
    const high = recordingContext(); const low = recordingContext();
    renderFrame(high, nodes, [], cfg({ seed: 9, quality: 'HIGH' }), 1440, 900);
    renderFrame(low, nodes, [], cfg({ seed: 9, quality: 'LOW' }), 1440, 900);
    expect(low.calls.stroke).toBeLessThan(high.calls.stroke);
  });
});

describe('particle field', () => {
  it('grows toward a width-derived target and removes motes that leave the viewport', () => {
    const c = cfg({ seed: 5, activity: 3 });
    const field = createParticleField();
    updateParticles(field, 0.016, c, 1920, 1080);
    expect(field.items.length).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) updateParticles(field, 0.05, c, 1920, 1080);
    expect(field.items.every((p) => p.y >= -10)).toBe(true);
  });

  it('refilled motes do not reuse the same x-positions — the field never visibly loops', () => {
    const c = cfg({ seed: 1337, activity: 3 });
    const field = createParticleField();
    const seen = new Set<number>();
    for (let cycle = 0; cycle < 6; cycle++) {
      updateParticles(field, 0.016, c, 1920, 1080);
      for (const p of field.items) seen.add(Math.round(p.x));
      field.items.length = 0;
    }
    expect(field.spawned).toBeGreaterThan(10);
    expect(seen.size).toBeGreaterThan(field.spawned * 0.6);
  });

  it('is still deterministic: the same seed replays the same mote sequence', () => {
    const c = cfg({ seed: 42, activity: 3 });
    const run = () => {
      const f = createParticleField();
      for (let i = 0; i < 20; i++) updateParticles(f, 0.016, c, 800, 600);
      return f.items.map((p) => [p.x, p.y, p.radius]);
    };
    expect(run()).toEqual(run());
  });

  it('IDLE keeps the mote field sparse compared with RUNNING', () => {
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

  it('renderStatic composes the whole lattice once on an opaque background, with no afterglow fade', () => {
    const c = cfg({ seed: 8, reducedMotion: true });
    const nodes = buildStreams(800, 600, c);
    const ctx = recordingContext();
    renderStatic(ctx, nodes, c, 800, 600);
    expect(ctx.calls.clearRect.length).toBe(1);
    expect(ctx.calls.fillRect.length).toBe(1);
    expect(ctx.rectFills[0]).toBe('#0a0e1c');
    expect(ctx.calls.arc.length).toBeGreaterThanOrEqual(nodes.length);
    expect(ctx.calls.stroke).toBeGreaterThan(0);
  });

  it('renderStatic on an unsized canvas draws nothing rather than throwing', () => {
    const ctx = recordingContext();
    renderStatic(ctx, [], cfg({ reducedMotion: true }), 0, 0);
    expect(ctx.calls.arc.length).toBe(0);
    expect(ctx.calls.fillRect.length).toBe(0);
  });
});

describe('rendering', () => {
  it('draws the afterglow fade rect first, then links, then nodes', () => {
    const c = cfg({ seed: 2 });
    const ctx = recordingContext();
    renderFrame(ctx, buildStreams(800, 600, c), [], c, 800, 600);
    expect(ctx.calls.fillRect.length).toBe(1);
    expect(ctx.calls.fillRect[0]).toEqual([0, 0, 800, 600]);
    expect(ctx.rectFills[0]).toMatch(/^rgba\(10,14,28,/);
    expect(ctx.calls.arc.length).toBeGreaterThan(0);
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

  it('ATTENTION tints only a minority of nodes amber — never the whole field', () => {
    const c = cfg({ seed: 21, activity: 4, quality: 'HIGH' });
    const ctx = recordingContext();
    const nodes = buildStreams(1920, 1080, c);
    renderFrame(ctx, nodes, [], c, 1920, 1080);
    const amberFills = ctx.fills.filter((f) => f.startsWith('rgba(255,214,170')).length;
    const ratio = amberFills / nodes.length;
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.35);
  });

  it('non-ATTENTION tiers show no amber at all', () => {
    for (const activity of [0, 1, 2, 3]) {
      const c = cfg({ seed: 21, activity });
      const ctx = recordingContext();
      renderFrame(ctx, buildStreams(1200, 800, c), [], c, 1200, 800);
      expect(ctx.fills.some((f) => f.startsWith('rgba(255,214,170'))).toBe(false);
    }
  });

  it('fingerprint tags stay sparse — roughly one node in seven, never the whole field', () => {
    const c = cfg({ seed: 33, quality: 'HIGH' });
    const nodes = buildStreams(1920, 1080, c);
    const ctx = recordingContext();
    renderFrame(ctx, nodes, [], c, 1920, 1080);
    const tagged = ctx.calls.fillText.length;
    expect(tagged).toBeGreaterThan(0);
    expect(tagged / nodes.length).toBeLessThan(0.25);
    for (const call of ctx.calls.fillText) expect(String(call[0])).toMatch(/^[0-9a-f]{8}$/);
  });

  it('the pulse ring stays sporadic rather than firing on half the field', () => {
    const c = cfg({ seed: 33, quality: 'HIGH' });
    const nodes = buildStreams(1920, 1080, c);
    const ctx = recordingContext();
    renderFrame(ctx, nodes, [], c, 1920, 1080);
    // Every node draws exactly one filled disc; every extra arc is a pulse ring.
    const pulses = ctx.calls.arc.length - nodes.length;
    expect(pulses).toBeGreaterThanOrEqual(0);
    expect(pulses / nodes.length).toBeLessThan(0.2);
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
