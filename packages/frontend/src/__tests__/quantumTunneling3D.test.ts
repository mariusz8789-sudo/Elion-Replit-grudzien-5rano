import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { defaultParams } from '../components/Controls';
import { phaseColor, quantumTunneling, totalProbability } from '../labs/experiments/quantum-tunneling';

// Minimal document/canvas stub — same pattern genesisWorldScreenFirstPerson.test.ts already
// established for exercising a real Sim3D.init() (procedural canvas textures/HUD readouts) in
// this repo's plain-Node (no jsdom) vitest environment.
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {}, fill: () => {},
    roundRect: (() => {}) as unknown as CanvasRenderingContext2D['roundRect'],
    measureText: () => ({ width: 40 }) as TextMetrics,
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  const fakeImage = { addEventListener: () => {}, removeEventListener: () => {}, set src(_v: string) {} };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeImage }),
    createElementNS: () => ({ ...fakeImage }),
  };
});

function buildInitializedTunnelingSim() {
  const sim = quantumTunneling.createSim3D!();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 390 / 400, 0.01, 2000);
  sim.init(THREE, scene, camera, 390, 400);
  return sim;
}

describe('phaseColor — reveals the real local phase of ψ, never a fabricated shade', () => {
  it('maps phase 0 (positive real amplitude) to hue 0 (red-dominant)', () => {
    const [r, g, b] = phaseColor(1, 0);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('is a pure function of atan2(im,re) — same phase, same color, regardless of amplitude magnitude', () => {
    const small = phaseColor(0.01, 0.02);
    const large = phaseColor(10, 20);
    expect(small[0]).toBeCloseTo(large[0], 10);
    expect(small[1]).toBeCloseTo(large[1], 10);
    expect(small[2]).toBeCloseTo(large[2], 10);
  });

  it('returns channel values within the valid 0..1 range for every quadrant', () => {
    for (const [re, im] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]] as const) {
      const [r, g, b] = phaseColor(re, im);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('totalProbability — the same dx-weighted |ψ|² integral the solver itself uses', () => {
  it('integrates a known constant-density array exactly', () => {
    const n = 10;
    const re = new Float64Array(n).fill(1);
    const im = new Float64Array(n).fill(0);
    const dx = 0.5;
    // density = 1 at every point, n points, dx spacing -> n * dx
    expect(totalProbability(re, im, dx)).toBeCloseTo(n * dx, 10);
  });

  it('is zero for an all-zero wavefunction', () => {
    const re = new Float64Array(5);
    const im = new Float64Array(5);
    expect(totalProbability(re, im, 0.2)).toBe(0);
  });

  it('combines real and imaginary contributions as |re|²+|im|²', () => {
    const re = new Float64Array([3]);
    const im = new Float64Array([4]);
    // 3²+4² = 25, dx=1
    expect(totalProbability(re, im, 1)).toBeCloseTo(25, 10);
  });
});

describe('TunnelingSim3D — tunelowanie: fizyka jakościowa (te same testy co dawny Canvas 2D, teraz przez createSim3D)', () => {
  function transmissionAfter(energyFrac: number, seconds: number): number {
    const sim = buildInitializedTunnelingSim();
    const params = { ...defaultParams(quantumTunneling.params), energy: energyFrac };
    for (let i = 0; i < seconds * 60; i++) sim.update(1 / 60, params);
    return Number(sim.getStats!().trans);
  }

  it('prawdopodobieństwo jest zachowane (trans+refl ≤ 100%)', () => {
    const sim = buildInitializedTunnelingSim();
    const params = defaultParams(quantumTunneling.params);
    for (let i = 0; i < 300; i++) sim.update(1 / 60, params);
    const s = sim.getStats!();
    expect(Number(s.trans) + Number(s.refl)).toBeLessThanOrEqual(101);
    expect(Number(s.trans)).toBeGreaterThanOrEqual(0);
  });

  it('transmisja poniżej bariery > 0 (tunelowanie!) i rośnie z energią', () => {
    const low = transmissionAfter(0.4, 6);
    const high = transmissionAfter(0.9, 6);
    expect(low).toBeGreaterThan(0); // klasycznie byłoby 0
    expect(high).toBeGreaterThan(low);
  });

  it('stepping through many real frames never throws, and syncScene() reads the real solver state without crashing', () => {
    const sim = buildInitializedTunnelingSim();
    const params = defaultParams(quantumTunneling.params);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 390 / 400, 0.01, 2000);
    expect(() => {
      for (let i = 0; i < 120; i++) {
        sim.update(1 / 60, params);
        sim.syncScene(scene, camera);
      }
    }).not.toThrow();
    const stats = sim.getStats!();
    for (const [k, v] of Object.entries(stats)) {
      expect(Number.isFinite(v), `stat ${k} ma być skończona`).toBe(true);
    }
  });

  it('narracja działa z realnymi statystykami po symulacji', () => {
    const sim = buildInitializedTunnelingSim();
    const params = defaultParams(quantumTunneling.params);
    for (let i = 0; i < 60; i++) sim.update(1 / 60, params);
    const stats = sim.getStats!();
    const blocks = quantumTunneling.narrate(params, stats);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b.title.length).toBeGreaterThan(0);
      expect(b.body.length).toBeGreaterThan(0);
    }
  });
});
