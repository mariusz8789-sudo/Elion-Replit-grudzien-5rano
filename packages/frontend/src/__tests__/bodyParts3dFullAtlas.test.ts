import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FULL_ATLAS_BASE, FULL_ATLAS_HIDDEN_BY_DEFAULT, loadFullAtlas, mergeSystemParts, type FullAtlasPart } from '../core/three/bodyParts3dFullAtlas';

/**
 * The full BodyParts3D male body is served from committed files. These tests read those exact files, so a
 * missing or truncated chunk fails here instead of silently leaving the lab with the old proxy body.
 */
const PUBLIC = resolve(__dirname, '../../public');
const serve = async (url: string): Promise<Response> => {
  const bytes = readFileSync(resolve(PUBLIC, `.${url}`));
  return new Response(bytes, { status: 200 });
};

describe('full BodyParts3D atlas', () => {
  it('loads all 2,234 committed meshes and merges them into one geometry per system', async () => {
    const atlas = await loadFullAtlas(THREE, undefined, serve);
    expect(atlas.structures).toBe(2234);
    expect(atlas.concepts).toBe(3432);
    expect(atlas.systems.reduce((s, x) => s + x.partCount, 0)).toBe(2234);
    expect(atlas.triangles).toBe(2288268);
    // Life-size: an adult male reference, feet at y = 0.
    expect(atlas.heightMeters).toBeGreaterThan(1.6);
    expect(atlas.heightMeters).toBeLessThan(1.9);
    const systems = atlas.systems.map((s) => s.system);
    for (const s of ['skeletal', 'muscular', 'arterial', 'venous', 'nervous']) expect(systems).toContain(s);
    for (const hidden of FULL_ATLAS_HIDDEN_BY_DEFAULT) expect(systems).toContain(hidden);
    for (const s of atlas.systems) s.geometry.dispose();
  }, 60_000);

  it('rebases each part’s indices onto the merged vertex array', () => {
    const chunk = new ArrayBuffer(3 * 12 + 3 * 6 + 3 * 4 + 12 /* padding */);
    new Float32Array(chunk, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    new Int16Array(chunk, 36, 9).set([0, 0, 32767, 0, 0, 32767, 0, 0, 32767]);
    new Uint32Array(chunk, 56, 3).set([0, 1, 2]);
    const part = (id: string): FullAtlasPart => ({ id, name: id, conceptId: id, system: 'test', chunk: 0, positions: 0, normals: 36, indices: 56, vertexCount: 3, indexCount: 3, bounds: [[0, 0, 0], [1, 1, 0]] });
    const g = mergeSystemParts(THREE, [part('a'), part('b')], [chunk]);
    expect(g.getAttribute('position').count).toBe(6);
    expect(Array.from(g.index!.array)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('serves the atlas from the public assets folder with its licences beside it', () => {
    expect(FULL_ATLAS_BASE).toBe('/assets/bodyparts3d/full');
    expect(readFileSync(resolve(PUBLIC, 'assets/bodyparts3d/full/HUMAN-ATLAS-ATTRIBUTION.md'), 'utf8')).toContain('CC Attribution 4.0 International');
    expect(readFileSync(resolve(PUBLIC, 'assets/bodyparts3d/full/HUMAN-ATLAS-LICENSE.txt'), 'utf8')).toContain('MIT License');
  });
});
