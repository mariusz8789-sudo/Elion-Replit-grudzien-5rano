import { describe, it, expect } from 'vitest';
import { computeField, heatColor } from '../core/simulation/analysis';
import type { SimAgent } from '../core/simulation/types';

const mk = (id: number, x: number, y: number, state: string, isolated = false): SimAgent => ({
  id, x, y, vx: 0, vy: 0, goalX: x, goalY: y, state, stateSince: 0, isolated, behavior: '', infectedBy: -1,
});

describe('analysis field — wnioski wprost ze stanu modelu', () => {
  it('density normalizuje do 0..1 i ma maksimum tam, gdzie jest tłum', () => {
    const agents = [mk(0, 10, 10, 'S'), mk(1, 12, 11, 'S'), mk(2, 11, 9, 'S'), mk(3, 800, 500, 'S')];
    const f = computeField(agents, 900, 620, 'density', 36, 24);
    expect(f.mode).toBe('density');
    let max = 0; for (const v of f.values) max = Math.max(max, v);
    expect(max).toBeCloseTo(1, 6);          // znormalizowane
    expect(f.max).toBeGreaterThanOrEqual(3); // 3 agentów w jednej komórce
  });

  it('risk = 0 gdy brak zakaźnych (heatmapa nie kłamie)', () => {
    const agents = [mk(0, 10, 10, 'S'), mk(1, 20, 20, 'R'), mk(2, 30, 30, 'E')];
    const f = computeField(agents, 900, 620, 'risk');
    expect(f.max).toBe(0);
    expect([...f.values].every((v) => v === 0)).toBe(true);
  });

  it('risk koncentruje się tam, gdzie są zakaźni (I), pomija odizolowanych', () => {
    const agents = [mk(0, 100, 100, 'I'), mk(1, 105, 102, 'I'), mk(2, 800, 500, 'I', true)];
    const f = computeField(agents, 900, 620, 'risk', 36, 24);
    expect(f.max).toBeGreaterThan(0);
    // komórka przy (100,100) powinna mieć wyższą wartość niż przy odizolowanym (800,500)
    const cell = (x: number, y: number) => f.values[Math.floor(y / (620 / 24)) * 36 + Math.floor(x / (900 / 36))];
    expect(cell(102, 101)).toBeGreaterThan(cell(800, 500));
  });

  it('immunity to udział odpornych w komórce (0..1)', () => {
    const agents = [mk(0, 10, 10, 'R'), mk(1, 12, 11, 'R'), mk(2, 11, 9, 'S'), mk(3, 13, 12, 'S')];
    const f = computeField(agents, 900, 620, 'immunity', 36, 24);
    const cell = (x: number, y: number) => f.values[Math.floor(y / (620 / 24)) * 36 + Math.floor(x / (900 / 36))];
    expect(cell(11, 10)).toBeCloseTo(0.5, 6); // 2 z 4 odporni w tej komórce
  });

  it('heatColor zwraca rosnąco „gorętsze" barwy', () => {
    const cold = heatColor(0), hot = heatColor(1);
    expect(cold[2]).toBeGreaterThan(cold[0]); // niski t → więcej niebieskiego
    expect(hot[0]).toBeGreaterThan(hot[2]);   // wysoki t → więcej czerwonego
  });
});
