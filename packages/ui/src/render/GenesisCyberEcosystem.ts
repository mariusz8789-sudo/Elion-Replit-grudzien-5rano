/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';

export interface SimClockLike { readonly t: number; }
export interface CyberEcosystemOptions { seed?: number; podiums?: number; agents?: number; traffic?: number; cats?: number; shops?: number; }
export interface CyberEcosystemHandle { readonly group: THREE.Group; update(clock: SimClockLike): void; dispose(): void; }

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function instances(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, rng: () => number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 8 + rng() * 24;
    position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
    scale.set(0.7 + rng() * 0.8, 0.7 + rng() * 1.8, 0.7 + rng() * 0.8);
    matrix.compose(position, new THREE.Quaternion(), scale);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function createCyberEcosystem(options: CyberEcosystemOptions = {}): CyberEcosystemHandle {
  const rng = mulberry32(options.seed ?? 0x9d5);
  const group = new THREE.Group();
  group.name = 'GenesisCyberEcosystem';
  const materials = [
    new THREE.MeshStandardMaterial({ color: 0x92a4b8, metalness: 0.92, roughness: 0.14 }),
    new THREE.MeshStandardMaterial({ color: 0x00ffc8, emissive: 0x00ffc8, emissiveIntensity: 2.1, metalness: 0.35, roughness: 0.28 }),
    new THREE.MeshStandardMaterial({ color: 0x145cff, emissive: 0x145cff, emissiveIntensity: 1.5, metalness: 0.2, roughness: 0.35 }),
  ];
  const podiums = instances(new THREE.CylinderGeometry(1.2, 1.5, 0.5, 16), materials[1], options.podiums ?? 8, rng);
  const agents = instances(new THREE.CapsuleGeometry(0.32, 1.1, 4, 8), materials[0], options.agents ?? 32, rng);
  const traffic = instances(new THREE.BoxGeometry(0.7, 0.3, 1.5), materials[2], options.traffic ?? 24, rng);
  const cats = instances(new THREE.ConeGeometry(0.25, 0.6, 4), materials[1], options.cats ?? 12, rng);
  const shops = instances(new THREE.BoxGeometry(1.2, 1.1, 0.8), materials[2], options.shops ?? 10, rng);
  [podiums, agents, traffic, cats, shops].forEach((mesh) => group.add(mesh));
  return {
    group,
    update(clock) {
      const t = clock.t;
      agents.rotation.y = t * 0.03;
      traffic.position.x = Math.sin(t * 0.18) * 3;
      cats.rotation.y = -t * 0.12;
      shops.position.y = 0.05 + Math.sin(t * 0.7) * 0.03;
    },
    dispose() {
      group.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else if (mesh.material) mesh.material.dispose();
      });
      group.clear();
    },
  };
}
