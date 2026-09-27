import { describe, expect, it } from 'vitest';
import { WORLD_GRADES, applyGradeFloor, applyWorldGrade, gradePipelineOptions, type WorldGradeId } from '../core/three/graphics/worldGrade';

const IDS = Object.keys(WORLD_GRADES) as WorldGradeId[];

describe('per-world grade (D-132) — one mechanism, six identities that may never collapse', () => {
  it('every world declares its own intent, and no two worlds share a background or a floor', () => {
    expect(IDS.length).toBeGreaterThanOrEqual(6);
    const backgrounds = new Set(IDS.map((id) => WORLD_GRADES[id].background));
    const floors = new Set(IDS.map((id) => WORLD_GRADES[id].floor.color));
    expect(backgrounds.size).toBe(IDS.length);
    expect(floors.size).toBe(IDS.length);
    for (const id of IDS) {
      expect(WORLD_GRADES[id].id).toBe(id);
      expect(WORLD_GRADES[id].intent.length).toBeGreaterThan(20);
    }
  });

  it('every world keeps a real black point — the washed-out lab is the defect this fixes', () => {
    for (const id of IDS) {
      const g = WORLD_GRADES[id];
      // A background whose channels are all above ~0x30 cannot anchor a dark scene.
      const r = (g.background >> 16) & 0xff, gr = (g.background >> 8) & 0xff, b = g.background & 0xff;
      expect(Math.max(r, gr, b)).toBeLessThan(0x30);
      // Ambient fills shadows; a scene with no shadows has no form. Keep the bounce low.
      expect(g.hemisphere.intensity).toBeLessThanOrEqual(0.22);
      expect(g.exposure).toBeLessThanOrEqual(1);
    }
  });

  it('the biology lab is darker and glossier than it was, and cosmos alone has no fog', () => {
    expect(WORLD_GRADES.biology.fog.density).toBeGreaterThan(0.014); // the old value that gave no depth
    expect(WORLD_GRADES.biology.floor.roughness).toBeLessThan(0.66); // the old matte epoxy
    expect(WORLD_GRADES.cosmos.fog.density).toBe(0);
    for (const id of IDS.filter((i) => i !== 'cosmos')) expect(WORLD_GRADES[id].fog.density).toBeGreaterThan(0);
  });

  it('the pipeline never gets the generic studio box again — that box is what blew the lab out', () => {
    for (const id of IDS) {
      const opts = gradePipelineOptions(WORLD_GRADES[id], [0, 1.5, 2]);
      expect(opts.ambient.mode).toBe('room-probe');
      expect(opts.ambient.probe.intensity).toBe(WORLD_GRADES[id].environmentIntensity);
      expect(opts.toneMappingExposure).toBe(WORLD_GRADES[id].exposure);
    }
  });

  it('applying a grade sets background and fog, and returns a disposable hemisphere light', () => {
    const added: unknown[] = [];
    const scene = { background: null as unknown, fog: null as unknown, add: (o: unknown) => added.push(o) };
    class Color { v: number; constructor(v: number) { this.v = v; } setHex(v: number) { this.v = v; return this; } }
    class FogExp2 { constructor(public color: number, public density: number) {} }
    class HemisphereLight { name = ''; constructor(public sky: number, public ground: number, public intensity: number) {} }
    const THREE = { Color, FogExp2, HemisphereLight } as unknown as Parameters<typeof applyWorldGrade>[0];

    const hemi = applyWorldGrade(THREE, scene as never, WORLD_GRADES.biology);
    expect((scene.background as Color).v).toBe(WORLD_GRADES.biology.background);
    expect((scene.fog as FogExp2).density).toBe(WORLD_GRADES.biology.fog.density);
    expect(added).toContain(hemi);
    expect(hemi.name).toBe('grade:biology:hemisphere');

    // Cosmos has no air: the grade must clear the fog rather than leave a stale one behind.
    const scene2 = { background: null as unknown, fog: new FogExp2(1, 1) as unknown, add: () => {} };
    applyWorldGrade(THREE, scene2 as never, WORLD_GRADES.cosmos);
    expect(scene2.fog).toBeNull();
  });

  it('the floor treatment is applied in place, so a scene keeps its own normal map and geometry', () => {
    const mat = {
      color: { hex: 0xffffff, setHex(v: number) { this.hex = v; } },
      roughness: 1, metalness: 0, envMapIntensity: 1, needsUpdate: false,
      normalMap: { kept: true },
    };
    applyGradeFloor(mat as never, WORLD_GRADES.cern);
    expect(mat.color.hex).toBe(WORLD_GRADES.cern.floor.color);
    expect(mat.roughness).toBe(WORLD_GRADES.cern.floor.roughness);
    expect(mat.needsUpdate).toBe(true);
    expect(mat.normalMap.kept).toBe(true); // the grade tints a floor, it does not replace it
  });

  it('a grade is presentation only: it carries no epistemic field of any kind', () => {
    const forbidden = /epistemic|evidence|MODEL|REAL_IMAGE|REAL_DATASET|session|ledger/i;
    for (const id of IDS) {
      for (const key of Object.keys(WORLD_GRADES[id])) expect(key).not.toMatch(forbidden);
    }
  });
});
