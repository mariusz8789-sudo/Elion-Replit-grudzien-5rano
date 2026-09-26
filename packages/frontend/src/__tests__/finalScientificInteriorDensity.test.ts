import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createScientificAssetSlotVisual } from '../core/temporalCinematic/scientificInteriorVisuals';
import type { HighFidelityMaterialPalette } from '../core/three/graphics/highFidelityMaterialRegistry';
import type { WorldModelEntity } from '../core/worldModel/ecs/types';

function palette(): HighFidelityMaterialPalette {
  const material = () => new THREE.MeshStandardMaterial();
  return {
    white: material(), dark: material(), stainless: material(), chrome: material(), glass: material(),
    medical: material(), floor: material(), wall: material(), concrete: material(), asphalt: material(),
    wetAsphalt: material(), brick: material(), ground: material(), foliage: material(), skin: material(),
    fabric: material(), blueGlow: material(), redGlow: material(),
  };
}

function slot(slotType: string): WorldModelEntity {
  return {
    id: `slot:${slotType}`,
    ref: { kind: 'asset-slot', id: slotType },
    label: slotType,
    scale: { level: 'ROOM' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    geometry: {
      kind: 'ASSET_SLOT', slotType, position: { x: 0, z: 0 },
      roomRef: { kind: 'room', id: 'materials-lab' },
    },
    grounding: 'PROCEDURAL_APPROXIMATION',
    updatedAtTick: 0,
  };
}

function namedInstance(root: THREE.Object3D, name: string): THREE.InstancedMesh {
  const object = root.getObjectByName(name) as THREE.InstancedMesh | undefined;
  expect(object?.isInstancedMesh, `missing ${name}`).toBe(true);
  return object!;
}

function drawObjectCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => { if ((object as THREE.Mesh).isMesh) count += 1; });
  return count;
}

describe('final Materials Lab and Compute Station density', () => {
  it('renders the compute console with batched rack units, LEDs and keys instead of one mesh per detail', () => {
    const p = palette();
    const visual = createScientificAssetSlotVisual(THREE, slot('COMPUTE_STATION'), p);
    expect(visual.userData.computeBinding).toBe('UNBOUND');
    expect(namedInstance(visual, 'genesis-compute-rack-units').count).toBe(12);
    const leds = namedInstance(visual, 'genesis-compute-rack-led-bank');
    expect(leds.count).toBe(24);
    expect(leds.material).toBe(p.blueGlow);
    expect(namedInstance(visual, 'genesis-compute-key-array').count).toBe(40);
    expect(namedInstance(visual, 'genesis-compute-monitor-gantry-posts').count).toBe(2);
    expect(visual.getObjectByName('genesis-instrument-service-conduits')?.children).toHaveLength(3);
    // 78 repeated visible details above remain four draws; the whole station stays far below a
    // one-mesh-per-key/LED/rack implementation.
    expect(drawObjectCount(visual)).toBeLessThan(40);
  });

  it('adds batched sample handling and service structure to both materials instruments', () => {
    const p = palette();
    const spectrometer = createScientificAssetSlotVisual(THREE, slot('SPECTROMETER_STATION'), p);
    const thermal = createScientificAssetSlotVisual(THREE, slot('THERMAL_STAGE_STATION'), p);
    expect(namedInstance(spectrometer, 'genesis-spectrometer-sample-carousel').count).toBe(8);
    expect(namedInstance(spectrometer, 'genesis-spectrometer-vent-bank').count).toBe(6);
    expect(spectrometer.getObjectByName('genesis-instrument-service-conduits')?.children).toHaveLength(3);
    expect(namedInstance(thermal, 'genesis-thermal-sample-holders').count).toBe(8);
    expect(thermal.getObjectByName('genesis-instrument-service-conduits')?.children).toHaveLength(3);
    expect(spectrometer.userData.instrumentState).toBe('UNBOUND');
    expect(thermal.userData.instrumentState).toBe('UNBOUND');
  });

  it('is deterministic in structural and instance counts across repeated builds', () => {
    const p = palette();
    const first = createScientificAssetSlotVisual(THREE, slot('COMPUTE_STATION'), p);
    const second = createScientificAssetSlotVisual(THREE, slot('COMPUTE_STATION'), p);
    expect(drawObjectCount(first)).toBe(drawObjectCount(second));
    expect(namedInstance(first, 'genesis-compute-key-array').count).toBe(namedInstance(second, 'genesis-compute-key-array').count);
  });
});
