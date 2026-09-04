import type * as THREE from 'three';
import type { TransitState } from './transit';

/**
 * Reality Transit — WARSTWA WIZUALNA (oryginalna tożsamość Quantum Forge,
 * nie kopia żadnej produkcji filmowej). Steruje NIĄ wyłącznie model stanu
 * (transit.ts): faza i postęp są źródłem prawdy, ten kod tylko je maluje.
 * Etykieta epistemiczna: 'cinematic' — to reżyserski efekt przejścia, nie
 * fizyczne twierdzenie o podróży między rzeczywistościami.
 *
 * Efekt: pole strug energii („warp streaks") biegnących ku kamerze wzdłuż
 * osi patrzenia, gęstniejące w fazie in-transit i rozrzedzające się przy
 * departing/arriving — wrażenie ciągłego lotu przez tunel, ale sterowane
 * fazą, nie losem. Renderowane jako THREE.Points przywiązane do kamery
 * (position kopiowane z kamery co klatkę), więc zawsze otacza widza.
 */

const STREAK_COUNT = 480;
const TUNNEL_RADIUS = 6;
const TUNNEL_DEPTH = 60;

export class TransitVisual {
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private speeds: Float32Array;
  private visible = false;

  constructor(three: typeof THREE, scene: THREE.Scene) {
    const positions = new Float32Array(STREAK_COUNT * 3);
    this.speeds = new Float32Array(STREAK_COUNT);
    for (let i = 0; i < STREAK_COUNT; i++) {
      this.reseed(positions, i, true);
    }
    this.geometry = new three.BufferGeometry();
    this.geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
    const tex = makeStreakTexture(three);
    this.material = new three.PointsMaterial({
      color: 0x8fdcff, size: 0.35, sizeAttenuation: true, transparent: true, opacity: 0,
      map: tex, depthWrite: false, blending: three.AdditiveBlending,
    });
    this.points = new three.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  private reseed(positions: Float32Array, i: number, anywhere: boolean): void {
    const ang = Math.random() * Math.PI * 2;
    const rad = TUNNEL_RADIUS * (0.25 + Math.random() * 0.75);
    positions[i * 3] = Math.cos(ang) * rad;
    positions[i * 3 + 1] = Math.sin(ang) * rad;
    // z: gdzie na głębokości tunelu (przed kamerą = ujemne wzdłuż -Z lokalnego)
    positions[i * 3 + 2] = anywhere ? -Math.random() * TUNNEL_DEPTH : -TUNNEL_DEPTH;
    this.speeds[i] = 18 + Math.random() * 34;
  }

  /**
   * Aktualizuje efekt na podstawie STANU przejścia. Zwraca 0..1 „intensywność"
   * (0 = niewidoczny), którą silnik może wykorzystać (np. do przygaszenia sceny).
   */
  update(state: TransitState, dt: number, camera: THREE.PerspectiveCamera): number {
    const intensity = intensityForPhase(state);
    if (intensity <= 0.001) {
      if (this.visible) {
        this.visible = false;
        this.points.visible = false;
        this.material.opacity = 0;
      }
      return 0;
    }
    if (!this.visible) {
      this.visible = true;
      this.points.visible = true;
    }
    // Tunel podąża za kamerą i jest zorientowany wzdłuż jej kierunku patrzenia.
    this.points.position.copy(camera.position);
    this.points.quaternion.copy(camera.quaternion);
    this.material.opacity = 0.9 * intensity;
    this.material.size = 0.28 + 0.4 * intensity;

    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < STREAK_COUNT; i++) {
      arr[i * 3 + 2] += this.speeds[i] * dt * (0.4 + intensity); // ku kamerze (rośnie z do 0)
      if (arr[i * 3 + 2] > 2) this.reseed(arr, i, false);
    }
    pos.needsUpdate = true;
    return intensity;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
    this.points.parent?.remove(this.points);
  }
}

/** Intensywność efektu wg fazy: narasta (departing) → pełnia (in-transit) → opada (arriving) → 0. */
function intensityForPhase(state: TransitState): number {
  switch (state.phase) {
    case 'departing': return 0.15 + 0.75 * state.phaseProgress;
    case 'in-transit': return 1;
    case 'arriving': return 0.9 * (1 - state.phaseProgress);
    default: return 0;
  }
}

function makeStreakTexture(three: typeof THREE): THREE.Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(180,225,255,0.6)');
  grad.addColorStop(1, 'rgba(140,200,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
