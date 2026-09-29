import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FullAtlasManifest } from '../core/three/bodyParts3dFullAtlas';
import { EXPLORE_BODY, EXPLORE_ORGANS, exploreBack, exploreCrumbs, exploreInto, regionOfAtlasPoint, structureLabel } from '../core/three/anatomyExplore';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const atlas = JSON.parse(readFileSync(join(ROOT, 'public/assets/bodyparts3d/full/atlas.json'), 'utf8')) as FullAtlasManifest;
const height = Math.max(...atlas.parts.map((p) => p.bounds[1]![1]!));
const centre = (p: FullAtlasManifest['parts'][number]) => [0, 1, 2].map((i) => (p.bounds[0]![i]! + p.bounds[1]![i]!) / 2) as [number, number, number];

describe('Human Explorer descent', () => {
  it('every explorable organ exists in the atlas and sits in its own region', () => {
    for (const organ of EXPLORE_ORGANS) {
      const parts = atlas.parts.filter(organ.atlas);
      expect(parts.length, organ.id).toBeGreaterThan(0);
      const inRegion = parts.filter((p) => { const [x, y] = centre(p); return regionOfAtlasPoint(x, y, height) === organ.region; });
      expect(inRegion.length / parts.length, organ.id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('names the structures of the heart and brain in Polish', () => {
    for (const id of ['brain', 'heart']) {
      const organ = EXPLORE_ORGANS.find((o) => o.id === id)!;
      for (const p of atlas.parts.filter(organ.atlas)) expect(structureLabel(id, p.name).label, p.name).not.toBe(p.name);
    }
    expect(structureLabel('brain', 'Left hippocampus')).toEqual({ label: 'Hipokamp', detail: 'lewa półkula · Układ limbiczny: Pamięć i emocje.' });
  });

  it('goes down one level per tap and back up one level per Back', () => {
    const head = exploreInto(EXPLORE_BODY, { kind: 'region', id: 'head' });
    const brain = exploreInto(head, { kind: 'organ', id: 'brain' });
    const hippo = exploreInto(brain, { kind: 'structure', name: 'Left hippocampus' });
    expect(exploreCrumbs(hippo)).toEqual(['Ciało', 'Głowa', 'Mózg', 'Hipokamp']);
    expect(exploreBack(hippo)).toEqual(brain);
    expect(exploreBack(brain)).toEqual(head);
    expect(exploreBack(head)).toEqual(EXPLORE_BODY);
  });

  it('places the obvious landmarks in the right region', () => {
    expect(regionOfAtlasPoint(0, 1.62, height)).toBe('head');
    expect(regionOfAtlasPoint(0.03, 1.3, height)).toBe('chest');
    expect(regionOfAtlasPoint(0, 1.05, height)).toBe('abdomen');
    expect(regionOfAtlasPoint(0.1, 0.4, height)).toBe('legs');
    expect(regionOfAtlasPoint(0.28, 1.0, height)).toBe('arms');
  });
});
