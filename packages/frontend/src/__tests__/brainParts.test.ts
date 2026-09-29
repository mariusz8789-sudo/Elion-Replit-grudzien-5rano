import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FULL_ATLAS_ORGAN_PARTS, type FullAtlasManifest } from '../core/three/bodyParts3dFullAtlas';
import { brainPartLabel, brainRegionOf } from '../core/three/brainParts';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const atlas = JSON.parse(readFileSync(join(ROOT, 'public/assets/bodyparts3d/full/atlas.json'), 'utf8')) as FullAtlasManifest;
const brain = atlas.parts.filter(FULL_ATLAS_ORGAN_PARTS.brain!);

describe('brain close-up parts', () => {
  it('every brain structure has a Polish name and a named region', () => {
    expect(brain.length).toBeGreaterThan(50);
    for (const p of brain) {
      expect(brainPartLabel(p.name).label, p.name).not.toBe(p.name);
      expect(brainRegionOf(p.name).id, p.name).not.toBe('other');
    }
  });

  it('keeps the side of the hemisphere', () => {
    expect(brainPartLabel('Left hippocampus')).toEqual({ label: 'Hipokamp', side: 'lewa' });
    expect(brainPartLabel('Posterior part of right superior temporal gyrus')).toEqual({ label: 'Zakręt skroniowy górny (tylna część)', side: 'prawa' });
  });
});
