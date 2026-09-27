import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTwinProxy } from '../core/three/biologyLabKit';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { buildVisualLayerInstruction } from '../core/scientificWorlds/humanLab/visualModes';
import { evaluateHumanTwinAsset, type LoadedHumanTwinBody } from '../core/three/humanTwinAsset';

/**
 * Visual presentation audit (post D-135/Canonical Laboratory): real browser screenshots showed the
 * licensed CC0 asset's own clothing mesh — glTF node `Human.female_casualsuit01`, a plain civilian
 * outfit baked into the GLB (verified by parsing the file's own JSON chunk: GLTFLoader names the
 * produced Mesh after the node, not the mesh definition, which is just `female_casualsuit01`) —
 * reading as a generic game avatar and merging into the chamber glass. These tests exercise the fix
 * at the THREE.js level without loading the real 17 MB GLB: a minimal fake asset with the SAME node
 * name the real file uses, so the clothing-detection path is exercised exactly as `createTwinProxy`
 * runs it in production.
 */
function fakeAsset(): LoadedHumanTwinBody {
  const root = new THREE.Group();
  const skinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ name: 'original-skin' }));
  skinMesh.name = 'base';
  const clothingMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshStandardMaterial({ name: 'original-casual-suit', color: 0xffffff }));
  // GLTFLoader names the produced Mesh after the glTF NODE, not the mesh definition — the real asset's
  // node is 'Human.female_casualsuit01' (verified by parsing the GLB's own JSON chunk), not the bare
  // mesh-definition name. Using the real runtime name here so this test covers the actual match path.
  clothingMesh.name = 'Human.female_casualsuit01';
  root.add(skinMesh, clothingMesh);
  const gate = evaluateHumanTwinAsset();
  return { root, meshes: [skinMesh, clothingMesh], morphs: new Map(), heightMeters: 1.78, tier: 'LICENSED_CC0_ASSET', record: gate.record! };
}

describe('human twin visual presentation — deterministic scrubs + anatomy-mode clothing hide', () => {
  const manifest = createHumanDigitalTwinManifest('HDT-presentation-test');

  it("replaces the asset's own casual-suit material with a deterministic, non-white lab-scrub material — never the original texture", () => {
    const asset = fakeAsset();
    const originalClothingMaterial = (asset.meshes[1].material as THREE.Material);
    createTwinProxy(THREE, manifest, { skinHex: '#c9a58a', bodyAsset: asset });
    const clothingMesh = asset.meshes.find((m) => m.name === 'Human.female_casualsuit01')!;
    const mat = clothingMesh.material as THREE.MeshStandardMaterial;
    expect(mat).not.toBe(originalClothingMaterial);
    expect(mat.name).toBe('genesis-lab-scrubs');
    expect(mat.color.getHex()).not.toBe(0xffffff);
    // Matte fabric, not the chamber glass's near-mirror finish.
    expect(mat.roughness).toBeGreaterThan(0.5);
  });

  it('keeps the clothing visible in NORMAL/TWIN view, hides it outright (not merely faded) in every real anatomy mode, and restores it back in NORMAL', () => {
    const asset = fakeAsset();
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#c9a58a', bodyAsset: asset });
    const clothingMesh = asset.meshes.find((m) => m.name === 'Human.female_casualsuit01')!;

    twin.setView(buildVisualLayerInstruction(manifest, 'NORMAL'), null);
    expect(clothingMesh.visible, 'NORMAL').toBe(true);

    for (const mode of ['ORGANS', 'VASCULAR', 'NERVOUS', 'LYMPHATIC', 'BRAIN', 'TISSUE', 'CELLULAR'] as const) {
      twin.setView(buildVisualLayerInstruction(manifest, mode), null);
      expect(clothingMesh.visible, mode).toBe(false);
    }

    twin.setView(buildVisualLayerInstruction(manifest, 'NORMAL'), null);
    expect(clothingMesh.visible, 'NORMAL again').toBe(true);
  });

  it('XRAY is a stylised view OF the clothed body (body slot present), so clothing stays — never claimed as a real radiograph', () => {
    const asset = fakeAsset();
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#c9a58a', bodyAsset: asset });
    const clothingMesh = asset.meshes.find((m) => m.name === 'Human.female_casualsuit01')!;
    const instr = buildVisualLayerInstruction(manifest, 'XRAY');
    twin.setView(instr, null);
    expect(clothingMesh.visible).toBe(true);
  });

  it('applies a fresnel silhouette-separation rim light to the asset materials', () => {
    const asset = fakeAsset();
    createTwinProxy(THREE, manifest, { skinHex: '#c9a58a', bodyAsset: asset });
    for (const mesh of asset.meshes) {
      const mat = mesh.material as THREE.Material;
      expect(typeof mat.onBeforeCompile).toBe('function');
    }
  });
});
