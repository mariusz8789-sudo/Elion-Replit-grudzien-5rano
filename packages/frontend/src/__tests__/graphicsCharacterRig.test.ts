import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCharacter } from '../core/three/characterRig';

/**
 * Regression coverage for the per-call Color-allocation fix in setEpidemicTint(): it used to
 * .clone() two Colors on every call, now reuses scratch fields. This checks the tint still
 * actually converges toward the target color after the refactor, not just that it runs.
 */
describe('buildCharacter — setEpidemicTint after the scratch-reuse fix', () => {
  it('converges the shirt/pants material color toward a strong red tint over repeated calls', () => {
    const character = buildCharacter(THREE, { shirt: 0x4a76c4, pants: 0x2f3a4c });
    const materials = new Set<THREE.MeshStandardMaterial>();
    character.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) materials.add(mesh.material as THREE.MeshStandardMaterial);
    });
    expect(materials.size).toBeGreaterThan(0);

    // High intensity, called repeatedly — .lerp(target, 0.14) is a partial step per call, so it
    // needs several calls to converge close to the target tint.
    for (let i = 0; i < 60; i++) character.setEpidemicTint(0xff0000, 0.78);

    const redDominant = [...materials].some((m) => m.color.r > m.color.g && m.color.r > m.color.b && m.color.r > 0.5);
    expect(redDominant).toBe(true);
  });

  it('does not mutate the underlying color object identity across calls (same material.color instance)', () => {
    const character = buildCharacter(THREE, { shirt: 0x4a76c4 });
    let torsoMaterial: THREE.MeshStandardMaterial | undefined;
    character.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && !torsoMaterial) torsoMaterial = mesh.material as THREE.MeshStandardMaterial;
    });
    const colorRef = torsoMaterial!.color;
    character.setEpidemicTint(0x00ff00, 0.5);
    character.setEpidemicTint(0x0000ff, 0.3);
    expect(torsoMaterial!.color).toBe(colorRef); // still the same Color instance, only its values changed
  });
});
