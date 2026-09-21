/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export interface TunnelHandle { update(dt: number, t: number): void; setEnabled(on: boolean): void; lock(): void; dispose(): void; }
const RING_R = 60; const SPAN = Math.PI / 3;
class ArcCurve extends THREE.Curve<THREE.Vector3> {
  constructor() { super(); }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 { const a = -SPAN / 2 + t * SPAN; return target.set(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R); }
}
/** FPV walk inside a de-energized LHC-like ring segment: dipoles, cryo pipes, beam pipe, technical lighting. */
export function createTunnelWalkthrough(scene: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, _seed = 11): TunnelHandle {
  const group = new THREE.Group(); scene.add(group);
  const curve = new ArcCurve();
  const shell = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 2.6, 20, false), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.9, metalness: 0.1, side: THREE.BackSide }));
  group.add(shell);
  const beam = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.12, 12, false), new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.95, roughness: 0.15 }));
  beam.position.y = 0.4; group.add(beam);
  const dipGeo = new THREE.BoxGeometry(1.1, 0.9, 5.2);
  const dipMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.5, roughness: 0.4 });
  const N = 14;
  const dipoles = new THREE.InstancedMesh(dipGeo, dipMat, N);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const samples: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) samples.push(curve.getPoint(i / 64));
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N; const pos = curve.getPoint(t); const tan = curve.getTangent(t);
    Q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    M.compose(P.set(pos.x, 0.4, pos.z), Q, S.setScalar(1));
    dipoles.setMatrixAt(i, M);
  }
  dipoles.instanceMatrix.needsUpdate = true; group.add(dipoles);
  const cryo = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.18, 10, false), new THREE.MeshStandardMaterial({ color: 0xdfefff, metalness: 0.9, roughness: 0.2 }));
  cryo.position.y = 1.4; cryo.position.x += 0.9; group.add(cryo);
  const tray = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.1, 8, false), new THREE.MeshStandardMaterial({ color: 0x444c56, roughness: 0.7 }));
  tray.position.y = 1.8; tray.position.x -= 1.1; group.add(tray);
  const stripGeo = new THREE.BoxGeometry(0.08, 0.05, 2.4);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xdfefff, emissiveIntensity: 1.6 });
  const strips = new THREE.InstancedMesh(stripGeo, stripMat, 24);
  for (let i = 0; i < 24; i++) { const t = (i + 0.5) / 24; const pos = curve.getPoint(t); const tan = curve.getTangent(t); Q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan); M.compose(P.set(pos.x, 2.3, pos.z), Q, S.setScalar(1)); strips.setMatrixAt(i, M); }
  strips.instanceMatrix.needsUpdate = true; group.add(strips);
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5; const pos = curve.getPoint(t); const l = new THREE.PointLight(0xdfefff, 12, 18); l.position.set(pos.x, 2.2, pos.z); group.add(l); lights.push(l); }
  const controls = new PointerLockControls(camera, canvas);
  let enabled = false;
  const onKeyDown = (e: KeyboardEvent) => { if (!enabled) return; keys.add(e.code); };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const keys = new Set<string>();
  document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
  const nearest = (p: THREE.Vector3): THREE.Vector3 => { let best = samples[0]; let bd = Infinity; for (const s of samples) { const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < bd) { bd = d; best = s; } } return best; };
  return {
    lock: () => { if (enabled) controls.lock(); },
    setEnabled: (on) => { enabled = on; group.visible = on; if (!on && controls.isLocked) controls.unlock(); },
    update: (dt, t) => {
      stripMat.emissiveIntensity = 1.4 + 0.3 * Math.sin(t * 2.0);
      if (!enabled) return;
      if (controls.isLocked) {
        const sp = 2.2 * dt;
        if (keys.has('KeyW')) controls.moveForward(sp);
        if (keys.has('KeyS')) controls.moveForward(-sp);
        if (keys.has('KeyA')) controls.moveRight(-sp);
        if (keys.has('KeyD')) controls.moveRight(sp);
        const c = nearest(camera.position);
        const dx = camera.position.x - c.x; const dz = camera.position.z - c.z;
        const rad = Math.hypot(dx, dz);
        if (rad > 2.0) { camera.position.x = c.x + (dx / rad) * 2.0; camera.position.z = c.z + (dz / rad) * 2.0; }
        camera.position.y = 1.6;
      }
    },
    dispose: () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp); controls.dispose();
      [shell, beam, cryo, tray, dipoles, strips].forEach(o => { o.geometry.dispose(); (o.material as THREE.Material).dispose(); });
      lights.forEach(l => l.dispose()); scene.remove(group); },
  };
}
