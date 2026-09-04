import { describe, expect, it } from 'vitest';
import { labNodeLayout } from '../core/three/genesisPulseScene';
import { listGenesisScenes, getGenesisScene, availableGenesisScenes } from '../core/three/sceneRegistry';

describe('Genesis Field — pure layout math (no WebGL)', () => {
  it('labNodeLayout places exactly `count` nodes inside the requested annulus', () => {
    const points = labNodeLayout(13, 5.5, 20);
    expect(points).toHaveLength(13);
    for (const p of points) {
      const radial = Math.sqrt(p.x * p.x + p.z * p.z);
      expect(radial).toBeGreaterThanOrEqual(5.5 - 1e-9);
      expect(radial).toBeLessThanOrEqual(20 + 1e-9);
    }
  });

  it('labNodeLayout is deterministic — no randomness in the scene layout', () => {
    expect(labNodeLayout(13)).toEqual(labNodeLayout(13));
  });

  it('labNodeLayout spreads nodes apart rather than stacking them', () => {
    const points = labNodeLayout(13);
    // Żadne dwa węzły nie mogą siedzieć w tym samym miejscu.
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y, points[i].z - points[j].z);
        expect(d).toBeGreaterThan(0.5);
      }
    }
  });

  it('labNodeLayout handles zero/negative count without throwing', () => {
    expect(labNodeLayout(0)).toEqual([]);
    expect(labNodeLayout(-3)).toEqual([]);
  });
});

describe('Genesis scene registry — swappable worlds, honest availability', () => {
  it('every AVAILABLE scene points at a real existing route', () => {
    const known = new Set(['#/city3d', '#/hf-slice', '#/city']);
    for (const scene of availableGenesisScenes()) {
      expect(scene.hash).toBeDefined();
      expect(known.has(scene.hash!)).toBe(true);
    }
  });

  it('PLANNED scenes expose NO create() — an unbuilt world cannot be run or faked', () => {
    for (const scene of listGenesisScenes().filter((s) => s.status === 'PLANNED')) {
      expect(scene.create).toBeUndefined();
      // ...i muszą powiedzieć, czego im brakuje (jak ENGINE_NOT_AVAILABLE).
      expect(scene.requires).toBeTruthy();
    }
  });

  it('registry covers the swap targets named in the brief', () => {
    const ids = listGenesisScenes().map((s) => s.id);
    for (const id of ['epidemic-city', 'city', 'lake', 'river', 'factory', 'ecosystem', 'laboratory']) {
      expect(ids).toContain(id);
    }
  });

  it('getGenesisScene resolves by id and returns undefined for unknown worlds', () => {
    expect(getGenesisScene('epidemic-city')?.status).toBe('AVAILABLE');
    expect(getGenesisScene('nope')).toBeUndefined();
  });
});
