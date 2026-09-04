import type * as THREE from 'three';
import { scaleCount, type RenderTier } from './quality';

/**
 * Pole gwiazd w tle — wspólna geometria dla wszystkich scen 3D (Einstein,
 * Universe), zamiast osobnej kopii w każdym pliku (patrz wymóg dzielonej
 * architektury renderującej). Zwraca też surowe kierunki jednostkowe
 * każdej gwiazdy względem środka sceny — Einstein Lab używa ich do
 * policzenia poglądowego ugięcia grawitacyjnego (patrz
 * einstein-blackhole-3d.ts::applyGravitationalLensing), Universe Lab
 * renderuje je bez modyfikacji.
 */
export interface Starfield {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  /** Tekstura miękkiej kropki użyta jako `material.map` — dispose() osobno, material.dispose() jej nie zwalnia. */
  texture: THREE.Texture;
  /** Kierunki jednostkowe (od środka sceny) — stała referencja, NIEzmieniana przy soczewkowaniu. */
  directions: Float32Array;
  /** Promień każdej gwiazdy (stały, losowany raz przy tworzeniu). */
  radii: Float32Array;
  count: number;
}

/**
 * Miękka, okrągła tekstura punktu (radialny gradient na canvasie) — bez
 * niej THREE.PointsMaterial rysuje twarde kwadraty, co przy dużej gęstości
 * cząstek wygląda jak ziarnisty szum zamiast świecącej materii/gwiazd.
 * Reużywalna w każdej scenie z cząstkami (dysk akrecyjny, pole gwiazd, …).
 */
export function makeSoftDotTexture(three: typeof THREE): THREE.Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createStarfield(three: typeof THREE, tier: RenderTier, baseCount = 2600, radiusRange: [number, number] = [260, 600]): Starfield {
  const count = scaleCount(baseCount, tier);
  const positions = new Float32Array(count * 3);
  const directions = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const [rMin, rMax] = radiusRange;
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.sin(phi) * Math.sin(theta);
    const dz = Math.cos(phi);
    const r = rMin + Math.random() * (rMax - rMin);
    directions[i * 3] = dx;
    directions[i * 3 + 1] = dy;
    directions[i * 3 + 2] = dz;
    radii[i] = r;
    positions[i * 3] = dx * r;
    positions[i * 3 + 1] = dy * r;
    positions[i * 3 + 2] = dz * r;
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  const texture = makeSoftDotTexture(three);
  const material = new three.PointsMaterial({
    color: 0xdfe6ff, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.85,
    map: texture, depthWrite: false,
  });
  const points = new three.Points(geometry, material);
  return { points, geometry, material, texture, directions, radii, count };
}
