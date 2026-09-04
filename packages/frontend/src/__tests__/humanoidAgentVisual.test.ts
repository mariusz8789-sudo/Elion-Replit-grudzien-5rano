import { describe, expect, it } from 'vitest';
import type { SimAgent } from '../core/simulation/types';
import { mapSimAgentToHumanoid } from '../core/three/humanoidAgentVisual';

const agent = (overrides: Partial<SimAgent> = {}): SimAgent => ({
  id: 17,
  x: 450,
  y: 310,
  vx: 0,
  vy: 0,
  goalX: 450,
  goalY: 310,
  state: 'S',
  stateSince: 0,
  isolated: false,
  behavior: 'dom',
  infectedBy: -1,
  age: 31,
  role: 'pracownik',
  hospitalized: false,
  gait: 1.25,
  ...overrides,
});

describe('mapSimAgentToHumanoid — most wyłącznie do odczytu', () => {
  it('mapuje pozycję środka świata i nie mutuje agenta modelu', () => {
    const source = agent();
    const before = JSON.stringify(source);
    const visual = mapSimAgentToHumanoid(source, 900, 620, 0.018, 90);

    expect(visual.worldX).toBe(0);
    expect(visual.worldZ).toBe(0);
    expect(visual.pose).toBe('idle');
    expect(visual.gait).toBe(1.25);
    expect(visual.age).toBe(31);
    expect(visual.role).toBe('pracownik');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('wyprowadza kierunek, prędkość i chód bez osobnej animacji demonstracyjnej', () => {
    const visual = mapSimAgentToHumanoid(agent({ vx: 45, vy: 0, gait: 4.2, behavior: 'sklep' }), 900, 620, 0.018, 90);

    expect(visual.pose).toBe('walk');
    expect(visual.speed).toBeCloseTo(0.5);
    expect(visual.facing).toBeCloseTo(Math.PI / 2);
    expect(visual.gait).toBe(4.2);
    expect(visual.behavior).toBe('sklep');
  });

  it('przenosi stan epidemiologiczny, izolację i hospitalizację jako niezależne wskazówki wizualne', () => {
    const visual = mapSimAgentToHumanoid(agent({ state: 'I', isolated: true, hospitalized: true, behavior: 'szpital' }), 900, 620, 0.018, 90);

    expect(visual.health).toBe('I');
    expect(visual.isolated).toBe(true);
    expect(visual.hospitalized).toBe(true);
    expect(visual.behavior).toBe('szpital');
  });
});
