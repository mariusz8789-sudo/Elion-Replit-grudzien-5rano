import { describe, expect, it } from 'vitest';
import '../labs/index';
import { getLabs } from '../core/registry';
import { defaultParams } from '../components/Controls';
import { fft } from '../labs/experiments/quantum-tunneling';
import type { ExperimentDef, LabDefinition } from '../core/types';

/**
 * Testy integracyjne symulacji: każdy eksperyment musi dać się utworzyć,
 * zainicjalizować i policzyć wiele kroków bez wyjątków, z sensownymi
 * statystykami. Render (Canvas 2D) testują smoke-testy przeglądarkowe.
 *
 * Eksperymenty 3D (createSim3D, np. universe/solar-system-3d) są celowo
 * pominięte w tej pętli — WebGLRenderer wymaga prawdziwego <canvas> z
 * kontekstem GPU, którego nie ma w środowisku node:test/vitest bez DOM
 * (ten sam, udokumentowany powód co pominięcie Atom Lab CustomView).
 * Ich fizyka (keplerPosition) jest już pokryta w physics.test.ts; render
 * weryfikują smoke-testy Playwright.
 */

function experimentsOf(lab: LabDefinition): { name: string; exp: Pick<ExperimentDef, 'params' | 'createSim' | 'narrate'> & { createSim: () => ReturnType<NonNullable<ExperimentDef['createSim']>> } }[] {
  const list: { name: string; exp: Pick<ExperimentDef, 'params' | 'createSim' | 'narrate'> & { createSim: () => ReturnType<NonNullable<ExperimentDef['createSim']>> } }[] = [];
  if (lab.createSim) {
    list.push({ name: `${lab.id}/base`, exp: { params: lab.params, createSim: lab.createSim, narrate: lab.narrate } });
  }
  for (const e of lab.experiments ?? []) {
    if (!e.createSim) continue; // eksperyment tylko-3D — patrz komentarz wyżej
    list.push({ name: `${lab.id}/${e.id}`, exp: { ...e, createSim: e.createSim } });
  }
  return list;
}

describe('wszystkie symulacje: 120 kroków bez wyjątków', () => {
  for (const lab of getLabs()) {
    for (const { name, exp } of experimentsOf(lab)) {
      it(name, () => {
        const sim = exp.createSim();
        const params = defaultParams(exp.params);
        sim.init(390, 400);
        for (let i = 0; i < 120; i++) sim.update(1 / 60, params);
        const stats = sim.getStats?.() ?? {};
        for (const [k, v] of Object.entries(stats)) {
          expect(Number.isFinite(v), `stat ${k} ma być skończona`).toBe(true);
        }
        // narracja musi działać dla stanu po symulacji
        const blocks = exp.narrate(params, stats);
        expect(Array.isArray(blocks)).toBe(true);
        for (const b of blocks) {
          expect(b.title.length).toBeGreaterThan(0);
          expect(b.body.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe('FFT (silnik równania Schrödingera)', () => {
  it('roundtrip: ifft(fft(x)) = x', () => {
    const N = 256;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.sin(i * 0.37) + 0.3 * Math.cos(i * 0.11);
    const re0 = re.slice();
    fft(re, im, false);
    fft(re, im, true);
    for (let i = 0; i < N; i++) {
      expect(re[i]).toBeCloseTo(re0[i], 9);
      expect(im[i]).toBeCloseTo(0, 9);
    }
  });

  it('twierdzenie Parsevala: energia zachowana', () => {
    const N = 128;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.exp(-((i - 64) ** 2) / 200);
    const eTime = re.reduce((s, v) => s + v * v, 0);
    fft(re, im, false);
    let eFreq = 0;
    for (let i = 0; i < N; i++) eFreq += re[i] ** 2 + im[i] ** 2;
    expect(eFreq / N).toBeCloseTo(eTime, 8);
  });
});

// Tunelowanie 3D (createSim3D) ma własną wersję tych testów jakościowych —
// patrz quantumTunneling3D.test.ts (potrzebuje prawdziwych THREE.Scene/Camera).
