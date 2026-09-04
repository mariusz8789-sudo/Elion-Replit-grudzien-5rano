import { describe, it, expect } from 'vitest';
import {
  defaultCamera, computeTransform, worldToScreen, screenToWorld, zoomAt, panBy, clampZoom, baseScale,
} from '../core/simulationRenderer/camera';
import { lodFor } from '../core/simulationRenderer/agentVisual';
import { EpidemicCitySimulation, type EpidemicCityParams } from '../core/simulation/epidemicCity';

const run = (over: Partial<EpidemicCityParams>, days: number): EpidemicCitySimulation => {
  const sim = new EpidemicCitySimulation(over);
  const steps = Math.round(days / 0.05);
  for (let i = 0; i < steps; i++) sim.tick(0.05);
  return sim;
};

describe('camera — transformacja świat↔ekran', () => {
  it('worldToScreen i screenToWorld są wzajemnie odwrotne', () => {
    const cam = defaultCamera(900, 620);
    const t = computeTransform(cam, 900, 620, 800, 600);
    const p = worldToScreen(t, 300, 200);
    const w = screenToWorld(t, p.x, p.y);
    expect(w.x).toBeCloseTo(300, 6);
    expect(w.y).toBeCloseTo(200, 6);
  });

  it('zoom jest ograniczony do zakresu', () => {
    expect(clampZoom(0.1)).toBe(1);
    expect(clampZoom(999)).toBe(8);
  });

  it('zoomAt utrzymuje punkt pod kursorem w miejscu', () => {
    const cam = defaultCamera(900, 620);
    const vw = 800, vh = 600;
    const before = computeTransform(cam, 900, 620, vw, vh);
    const anchorScreen = { x: 200, y: 150 };
    const worldBefore = screenToWorld(before, anchorScreen.x, anchorScreen.y);
    const cam2 = zoomAt(cam, 2, anchorScreen.x, anchorScreen.y, 900, 620, vw, vh);
    const after = computeTransform(cam2, 900, 620, vw, vh);
    const worldAfter = screenToWorld(after, anchorScreen.x, anchorScreen.y);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 4);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 4);
    expect(cam2.zoom).toBe(2);
  });

  it('pan przesuwa centrum i pozostaje w granicach świata', () => {
    const cam = defaultCamera(900, 620);
    const panned = panBy(cam, 1000, 1000, 900, 620);
    expect(panned.cx).toBeGreaterThanOrEqual(0);
    expect(panned.cx).toBeLessThanOrEqual(900);
    expect(panned.cy).toBeLessThanOrEqual(620);
  });

  it('wyższy zoom → większa skala px/jednostkę', () => {
    const base = baseScale(900, 620, 800, 600);
    const t1 = computeTransform({ zoom: 1, cx: 450, cy: 310 }, 900, 620, 800, 600);
    const t2 = computeTransform({ zoom: 3, cx: 450, cy: 310 }, 900, 620, 800, 600);
    expect(t1.scale).toBeCloseTo(base, 6);
    expect(t2.scale).toBeCloseTo(base * 3, 6);
  });
});

describe('agent visual — LOD', () => {
  it('dobiera poziom szczegółowości wg rozmiaru na ekranie', () => {
    expect(lodFor(4)).toBe('low');
    expect(lodFor(10)).toBe('medium');
    expect(lodFor(20)).toBe('high');
  });
});

describe('model — cechy ludzkie + hospitalizacja', () => {
  it('agenci mają wiek, rolę i fazę chodu', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 120, seed: 4 });
    const a = sim.agents()[0];
    expect(typeof a.age).toBe('number');
    expect(typeof a.role).toBe('string');
    expect(typeof a.gait).toBe('number');
  });

  it('ciężkie przypadki trafiają do szpitala (severeRate>0), a severeRate=0 → brak', () => {
    const withHosp = run({ nAgents: 260, r0: 4, seed: 6, severeRate: 0.4 }, 60);
    const noHosp = run({ nAgents: 260, r0: 4, seed: 6, severeRate: 0 }, 60);
    expect(withHosp.stats().hospitalizowani + (withHosp.stats().R)).toBeGreaterThan(0);
    // W wariancie z ciężkimi przypadkami ktoś przeszedł przez hospitalizację (peak hosp > 0 w trakcie).
    const anyHospEver = (() => {
      const s = new EpidemicCitySimulation({ nAgents: 260, r0: 4, seed: 6, severeRate: 0.4 });
      let seen = 0; for (let i = 0; i < Math.round(60 / 0.05); i++) { s.tick(0.05); seen = Math.max(seen, s.stats().hospitalizowani); }
      return seen;
    })();
    expect(anyHospEver).toBeGreaterThan(0);
    expect(noHosp.stats().hospitalizowani).toBe(0);
  });

  it('gait rośnie, gdy agent się porusza (animacja z ruchu, nie losowa)', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 150, seed: 8 });
    const before = sim.agents().map((a) => a.gait ?? 0);
    for (let i = 0; i < 40; i++) sim.tick(0.05);
    const after = sim.agents().map((a) => a.gait ?? 0);
    const changed = after.filter((g, i) => g !== before[i]).length;
    expect(changed).toBeGreaterThan(0);
  });
});
