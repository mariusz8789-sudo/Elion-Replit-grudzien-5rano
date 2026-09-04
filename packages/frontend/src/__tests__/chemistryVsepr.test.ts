import { describe, expect, it } from 'vitest';
import { bentCone, runVseprScenario, VSEPR_SHAPES, chemistryVsepr } from '../labs/experiments/chemistry-vsepr';

function angleBetween(a: [number, number, number], b: [number, number, number]): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

describe('VSEPR: geometria domen elektronowych', () => {
  it('każdy kształt ma tyle wektorów, ile deklaruje bonding+lone', () => {
    for (const s of VSEPR_SHAPES) {
      expect(s.bondingVecs.length, `${s.id} bondingVecs`).toBe(s.bonding);
      expect(s.loneVecs.length, `${s.id} loneVecs`).toBe(s.lone);
    }
  });

  it('wszystkie wektory domen są jednostkowe (długość 1)', () => {
    for (const s of VSEPR_SHAPES) {
      for (const v of [...s.bondingVecs, ...s.loneVecs]) {
        const len = Math.hypot(v[0], v[1], v[2]);
        expect(len, `${s.id} vector length`).toBeCloseTo(1, 5);
      }
    }
  });

  it('id-y kształtów są unikalne', () => {
    const ids = VSEPR_SHAPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('AX₄ (tetraedryczna, CH₄): kąt między dowolną parą wiązań = 109,47°', () => {
    const shape = VSEPR_SHAPES.find((s) => s.id === 'ax4')!;
    for (let i = 0; i < shape.bondingVecs.length; i++) {
      for (let j = i + 1; j < shape.bondingVecs.length; j++) {
        expect(angleBetween(shape.bondingVecs[i], shape.bondingVecs[j])).toBeCloseTo(109.47, 1);
      }
    }
  });

  it('AX₃E (piramida trygonalna, NH₃): kąt H-N-H = zmierzone 106,8°, nie idealne 109,5°', () => {
    const shape = VSEPR_SHAPES.find((s) => s.id === 'ax3e1')!;
    for (let i = 0; i < shape.bondingVecs.length; i++) {
      for (let j = i + 1; j < shape.bondingVecs.length; j++) {
        expect(angleBetween(shape.bondingVecs[i], shape.bondingVecs[j])).toBeCloseTo(106.8, 1);
      }
    }
  });

  it('AX₂E₂ (kątowa, H₂O): kąt H-O-H = zmierzone 104,5°, mniejsze niż NH₃', () => {
    const shape = VSEPR_SHAPES.find((s) => s.id === 'ax2e2')!;
    const angle = angleBetween(shape.bondingVecs[0], shape.bondingVecs[1]);
    expect(angle).toBeCloseTo(104.5, 1);
    const nh3 = VSEPR_SHAPES.find((s) => s.id === 'ax3e1')!;
    expect(angle).toBeLessThan(angleBetween(nh3.bondingVecs[0], nh3.bondingVecs[1]));
  });

  it('AX₆ (oktaedryczna, SF₆): sąsiednie wiązania pod 90°, przeciwległe pod 180°', () => {
    const shape = VSEPR_SHAPES.find((s) => s.id === 'ax6')!;
    const angles = [];
    for (let i = 0; i < shape.bondingVecs.length; i++) {
      for (let j = i + 1; j < shape.bondingVecs.length; j++) {
        angles.push(Math.round(angleBetween(shape.bondingVecs[i], shape.bondingVecs[j])));
      }
    }
    expect(angles.filter((a) => a === 90).length).toBe(12);
    expect(angles.filter((a) => a === 180).length).toBe(3);
  });

  it('AX₂ (liniowa, CO₂/BeCl₂): dwa wiązania pod dokładnie 180°', () => {
    const shape = VSEPR_SHAPES.find((s) => s.id === 'ax2')!;
    expect(angleBetween(shape.bondingVecs[0], shape.bondingVecs[1])).toBeCloseTo(180, 5);
  });

  it('bentCone(n=3) odtwarza dowolny zadany kąt (nie tylko 106,8°)', () => {
    for (const target of [95, 100, 108, 115]) {
      const vs = bentCone(3, target, true);
      expect(angleBetween(vs[0], vs[1])).toBeCloseTo(target, 1);
      expect(angleBetween(vs[1], vs[2])).toBeCloseTo(target, 1);
    }
  });

  it('narracja działa dla każdego z 13 kształtów', () => {
    for (const s of VSEPR_SHAPES) {
      const blocks = chemistryVsepr.narrate({ shape: s.id, autoRotate: true }, { bonding: s.bonding, lone: s.lone, domains: s.bonding + s.lone });
      expect(blocks.length).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b.title.length).toBeGreaterThan(0);
        expect(b.body.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('bounded VSEPR Fabric runner', () => {
  it('reads the shared tetrahedral CH₄ vectors deterministically', () => {
    const first = runVseprScenario({ shapeId: 'ax4' });
    const second = runVseprScenario({ shapeId: 'ax4' });

    expect(first).toEqual(second);
    expect(first).toMatchObject({ shapeId: 'ax4', example: 'CH₄', bonding: 4, lone: 0, angleLabel: '109,5°', angleMeasured: false });
    expect(first.bondingVecs).toHaveLength(4);
    expect(first.loneVecs).toHaveLength(0);
  });

  it('reads the shared measured-angle NH₃ geometry and rejects unknown shapes', () => {
    const ammonia = runVseprScenario({ shapeId: 'ax3e1' });

    expect(ammonia).toMatchObject({ shapeId: 'ax3e1', example: 'NH₃', bonding: 3, lone: 1, angleLabel: '106,8°', angleMeasured: true });
    expect(ammonia.bondingVecs).toHaveLength(3);
    expect(ammonia.loneVecs).toHaveLength(1);
    expect(() => runVseprScenario({ shapeId: 'unsupported' })).toThrow('Unknown VSEPR shape');
  });
});
