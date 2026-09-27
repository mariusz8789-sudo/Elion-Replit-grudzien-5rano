import type * as THREE_NS from 'three';
import type { HighFidelityMaterialPalette } from '../three/graphics/highFidelityMaterialRegistry';
import { createPipe } from '../three/graphics/primitives';

/**
 * Premium micro-detail for visuals already declared by canonical ASSET_SLOTs.
 * It never binds a provider/solver and intentionally preserves UNBOUND metadata set by the base
 * builders. Palette materials are shared/owned by the existing resolver; this module adds only slot-owned geometry.
 */
export function enhanceScientificAssetSlotVisual(
  THREE: typeof THREE_NS,
  root: THREE_NS.Group,
  slotType: string,
  palette: HighFidelityMaterialPalette,
): THREE_NS.Group {
  root.userData.premiumVisualPass = 'GENESIS_PREMIUM_VISUAL_PASS_V1';
  root.userData.presentationOnly = true;
  root.userData.visualOnlyContext = false;

  if (slotType === 'COMPUTE_STATION') addComputeDetail(THREE, root, palette);
  else if (slotType === 'SPECTROMETER_STATION') addSpectrometerDetail(THREE, root, palette);
  else if (slotType === 'THERMAL_STAGE_STATION') addThermalDetail(THREE, root, palette);
  else if (slotType === 'LAB_BENCH_STATION') addBenchDetail(THREE, root, palette);
  root.traverse((object) => {
    object.userData.directObservation ??= false;
    object.userData.scientificStateMutation ??= false;
  });
  return root;
}

function instanced(
  THREE: typeof THREE_NS,
  name: string,
  geometry: THREE_NS.BufferGeometry,
  material: THREE_NS.Material,
  entries: readonly { position: THREE_NS.Vector3Tuple; rotation?: THREE_NS.Vector3Tuple; scale?: THREE_NS.Vector3Tuple | number }[],
): THREE_NS.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  mesh.name = name;
  const d = new THREE.Object3D();
  entries.forEach((entry, index) => {
    d.position.set(...entry.position); d.rotation.set(...(entry.rotation ?? [0, 0, 0]));
    if (typeof entry.scale === 'number') d.scale.setScalar(entry.scale); else d.scale.set(...(entry.scale ?? [1, 1, 1]));
    d.updateMatrix(); mesh.setMatrixAt(index, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function addComputeDetail(THREE: typeof THREE_NS, root: THREE_NS.Group, p: HighFidelityMaterialPalette): void {
  const fans = instanced(
    THREE, 'premium-compute-rack-fan-bank', new THREE.TorusGeometry(0.052, 0.009, 6, 18), p.stainless,
    Array.from({ length: 8 }, (_, index) => ({ position: [0.68 + (index % 2) * 0.23, 0.22 + Math.floor(index / 2) * 0.13, -0.382] as THREE_NS.Vector3Tuple, rotation: [Math.PI / 2, 0, 0] as THREE_NS.Vector3Tuple })),
  );
  root.add(fans);
  const rearVents = instanced(
    THREE, 'premium-compute-rear-vent-bank', new THREE.BoxGeometry(0.14, 0.012, 0.01), p.dark,
    Array.from({ length: 12 }, (_, index) => ({ position: [0.795, 0.18 + index * 0.042, -0.39] as THREE_NS.Vector3Tuple })),
  );
  root.add(rearVents);

  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), p.medical); mouse.scale.set(1, 0.42, 1.25); mouse.position.set(0.2, 0.817, 0.18); mouse.name = 'premium-compute-mouse'; root.add(mouse);
  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.028, 0.07), p.dark); wrist.position.set(-0.18, 0.805, 0.31); wrist.name = 'premium-compute-keyboard-wrist-rest'; root.add(wrist);
  root.add(createPipe(THREE, p.dark, { from: [-0.82, 0.46, -0.34], to: [0.93, 0.46, -0.34], radius: 0.009 }));
  root.add(createPipe(THREE, p.chrome, { from: [-0.82, 0.43, -0.32], to: [0.93, 0.43, -0.32], radius: 0.007 }));
  root.userData.computeBinding ??= 'UNBOUND';
}

function addSpectrometerDetail(THREE: typeof THREE_NS, root: THREE_NS.Group, p: HighFidelityMaterialPalette): void {
  const vials = instanced(
    THREE, 'premium-spectrometer-vial-rack', new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), p.glass,
    Array.from({ length: 12 }, (_, index) => ({ position: [-0.63 + (index % 6) * 0.055, 0.96, 0.16 + Math.floor(index / 6) * 0.06] as THREE_NS.Vector3Tuple })),
  );
  root.add(vials);
  const calibrationTicks = instanced(
    THREE, 'premium-spectrometer-optical-rail-ticks', new THREE.BoxGeometry(0.006, 0.022, 0.13), p.stainless,
    Array.from({ length: 18 }, (_, index) => ({ position: [-0.42 + index * 0.05, 0.936, 0.02] as THREE_NS.Vector3Tuple })),
  );
  root.add(calibrationTicks);
  root.add(createPipe(THREE, p.dark, { from: [-0.65, 0.82, -0.27], to: [0.65, 0.82, -0.27], radius: 0.009 }));
  root.userData.instrumentState ??= 'UNBOUND';
}

function addThermalDetail(THREE: typeof THREE_NS, root: THREE_NS.Group, p: HighFidelityMaterialPalette): void {
  const shieldRibs = instanced(
    THREE, 'premium-thermal-shield-ribs', new THREE.BoxGeometry(0.018, 0.31, 0.025), p.stainless,
    Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2;
      return { position: [Math.cos(angle) * 0.312, 1.09, Math.sin(angle) * 0.312] as THREE_NS.Vector3Tuple, rotation: [0, -angle, 0] as THREE_NS.Vector3Tuple };
    }),
  );
  root.add(shieldRibs);
  for (const side of [-1, 1] as const) {
    const probe = createPipe(THREE, p.chrome, { from: [side * 0.52, 1.18, -0.08], to: [side * 0.18, 1.05, 0], radius: 0.012 });
    probe.name = `premium-thermal-probe-arm:${side}`; root.add(probe);
  }
  root.userData.instrumentState ??= 'UNBOUND';
}

function addBenchDetail(THREE: typeof THREE_NS, root: THREE_NS.Group, p: HighFidelityMaterialPalette): void {
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.22), p.stainless); rack.position.set(0.46, 0.94, -0.22); rack.name = 'premium-lab-bench-sample-rack'; root.add(rack);
  const tubes = instanced(
    THREE, 'premium-lab-bench-sample-tubes', new THREE.CylinderGeometry(0.025, 0.022, 0.16, 10), p.glass,
    Array.from({ length: 10 }, (_, index) => ({ position: [0.18 + (index % 5) * 0.11, 1.04, -0.22 + Math.floor(index / 5) * 0.08] as THREE_NS.Vector3Tuple })),
  );
  root.add(tubes);
  const underShelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.32), p.dark); underShelf.position.set(0.2, 0.36, -0.26); underShelf.name = 'premium-lab-bench-under-shelf'; root.add(underShelf);
}
