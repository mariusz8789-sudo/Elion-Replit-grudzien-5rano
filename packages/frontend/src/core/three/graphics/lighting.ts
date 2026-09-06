import type * as THREE_NS from 'three';
import { isWorldAssetApproved } from '../assetGovernance';

/**
 * GENESIS GRAPHICS RUNTIME — Environment / IBL
 *
 * Environment lighting (image-based reflections) is pure rendering-layer
 * technique — it doesn't know or care what geometry it's lighting, unlike
 * fixture placement (gantries, pendants, ceiling grids), which is
 * facility/world composition and lives with that layer instead.
 *
 * Both functions here are extracted from the lab scene's original
 * `setupPostProcessing`/`applyStudioEnvironment` so any Sim3D can get
 * "metal and glass actually have something to reflect" without re-deriving
 * a PMREM studio-env setup from scratch.
 */

/**
 * Otoczenie studyjne bez żadnego assetu: mała scena z jasnym "sufitem", ciemną "podłogą" i
 * dwoma świetlówkami, przepuszczona przez PMREMGenerator. Bez niej chrom, stal i szkło
 * wyglądają jak jednolity plastik, niezależnie od parametrów PBR — metal musi mieć co odbijać.
 * Ustawiana natychmiast (nie czeka na asynchroniczne HDRI, które i tak ją tylko zastąpi).
 */
export function applyStudioEnvironment(THREE: typeof THREE_NS, renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene): void {
  const envScene = new THREE.Scene();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x35415c, side: THREE.BackSide }));
  envScene.add(shell);
  const envCeiling = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0xdfeaff }));
  envCeiling.rotation.x = Math.PI / 2;
  envCeiling.position.y = 3.9;
  envScene.add(envCeiling);
  const envFloor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: 0x0d1220 }));
  envFloor.rotation.x = -Math.PI / 2;
  envFloor.position.y = -3.9;
  envScene.add(envFloor);
  for (const ex of [-2.4, 2.4]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    strip.rotation.x = Math.PI / 2;
    strip.position.set(ex, 3.85, 0);
    envScene.add(strip);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.06).texture;
  scene.environmentIntensity = 1.15;
  pmrem.dispose();
}

/** HDRI TYLKO jako mapa środowiska (reflections/IBL) — BEZ podmiany tła, żeby zachować nastrój
 * ciemnego laboratorium. Reużywa jedyny zatwierdzony w assetGovernance.ts asset środowiskowy. */
export async function loadHdriEnvironment(THREE: typeof THREE_NS, renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene): Promise<void> {
  const hdriPath = '/assets/genesis-hf/hdr/braustuble_alley_1k.hdr';
  if (!isWorldAssetApproved(hdriPath)) return;
  try {
    const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
    const pmrem = new THREE.PMREMGenerator(renderer);
    new RGBELoader().load(hdriPath, (texture) => {
      const environment = pmrem.fromEquirectangular(texture).texture;
      scene.environment = environment;
      // Podniesione: przy obniżonym świetle ambientowym to IBL niesie większość odbić.
      scene.environmentIntensity = 1.45;
      texture.dispose();
      pmrem.dispose();
    }, undefined, () => pmrem.dispose());
  } catch {
    // Materiały PBR i światła sceny pozostają pełnym fallbackiem bez HDRI.
  }
}
