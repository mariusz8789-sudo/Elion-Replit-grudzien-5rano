import * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type QualityTier = 'MOBILE' | 'DESKTOP';

export function pickTier(): QualityTier {
  if (typeof window === 'undefined') return 'DESKTOP';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile || window.innerWidth < 700 ? 'MOBILE' : 'DESKTOP';
}

export function buildEnvProbe(renderer: THREE.WebGLRenderer, scene: THREE.Scene): THREE.Texture {
  const probeScene = new THREE.Scene();
  probeScene.background = new THREE.Color(0x020806);
  probeScene.add(new THREE.HemisphereLight(0x00e5ff, 0x001108, 1.4));
  const emerald = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: 0x003d19 }));
  probeScene.add(emerald);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(probeScene, 0, 0.1, 100);
  scene.environment = target.texture;
  pmrem.dispose();
  probeScene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
  return target.texture;
}

export function upgradeMaterialsToPBR(root: THREE.Object3D, envMap: THREE.Texture): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    object.material = materials.map((material) => {
      if (material instanceof THREE.MeshStandardMaterial) { material.envMap = envMap; material.envMapIntensity = 0.45; material.needsUpdate = true; return material; }
      const source = material as THREE.MeshBasicMaterial | THREE.MeshPhongMaterial;
      return new THREE.MeshStandardMaterial({ color: source.color?.getHex() ?? 0x00ff41, map: source.map ?? null, roughness: 0.38, metalness: 0.72, envMap, envMapIntensity: 0.45, transparent: material.transparent, opacity: material.opacity });
    });
  });
}

export function applyCinematicQuality(renderer: THREE.WebGLRenderer, composer: EffectComposer, bloom: UnrealBloomPass): void {
  const tier = pickTier();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = tier === 'MOBILE' ? 0.82 : 0.95;
  renderer.shadowMap.enabled = tier === 'DESKTOP';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  bloom.strength = tier === 'MOBILE' ? 0.42 : 0.5;
  bloom.radius = tier === 'MOBILE' ? 0.32 : 0.4;
  bloom.threshold = 0.85;
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}
