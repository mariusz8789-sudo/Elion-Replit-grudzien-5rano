import * as THREE from 'three';
import type { BayRuntimePhase, RegenerativeBayRuntimeState } from './regenerativeMedicineBayRuntime';

function disposeMaterial(material: THREE.Material): void { material.dispose(); }

export function updateRegenerativeBayVisualRuntime(root: THREE.Object3D, state: RegenerativeBayRuntimeState): void {
  const phase = state.phase as BayRuntimePhase;
  const ring = root.getObjectByName('imaging.multimodalRing');
  const emitter = root.getObjectByName('imaging.multimodalRing.emitter');
  const leftArm = root.getObjectByName('biomed.robotArm.left');
  const rightArm = root.getObjectByName('biomed.robotArm.right');
  const progress = Math.max(0, Math.min(1, state.progress));
  const active = phase !== 'IDLE' && phase !== 'COMPLETE' && phase !== 'BLOCKED';

  if (ring) ring.rotation.y += active ? 0.012 : 0.003;
  if (emitter) emitter.rotation.y = ring?.rotation.y ?? emitter.rotation.y;
  if (leftArm) leftArm.rotation.z = active ? -0.08 - progress * 0.14 : 0;
  if (rightArm) rightArm.rotation.z = active ? 0.08 + progress * 0.12 : 0;

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const name = node.name.toLowerCase();
    if (!name.includes('display')) return;
    const material = node.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    material.emissiveIntensity = active ? 1.4 : phase === 'COMPLETE' ? 0.75 : 0.45;
  });
}

export function disposeRegenerativeBayGeometry(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
  root.parent?.remove(root);
}
