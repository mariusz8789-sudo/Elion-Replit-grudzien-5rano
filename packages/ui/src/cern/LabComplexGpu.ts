/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { TunnelHandle } from './TunnelWalkthroughGpu.js';
export type CameraMode = 'WALK' | 'GLASS' | 'CONSOLE' | 'TUNNEL';
export interface LabComplexHandle {
  setCameraMode(m: CameraMode): void; getCameraMode(): CameraMode;
  openDoor(section: 1 | 2 | 3, open: boolean): void;
  setBackdrop(tex: THREE.Texture | null): void;
  lock(): void; update(dt: number, t: number): void; dispose(): void;
}
const GLASS_VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const GLASS_FRAG = `precision highp float; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
uniform sampler2D uBackdrop; uniform float uIor; uniform float uTime; uniform float uThickness; uniform float uHasBackdrop;
void main(){
  vec3 n = normalize(vN + vec3(sin(vUv.x*60.0+uTime)*0.015, sin(vUv.y*40.0-uTime*0.7)*0.015, 0.0));
  float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
  vec2 refr = vUv + n.xy * uThickness * (1.0 - 1.0/uIor);
  vec3 base;
  if (uHasBackdrop > 0.5) {
    float r = texture2D(uBackdrop, refr + vec2(0.0015,0.0)).r;
    float g = texture2D(uBackdrop, refr).g;
    float b = texture2D(uBackdrop, refr - vec2(0.0015,0.0)).b;
    base = vec3(r,g,b);
  } else { base = vec3(0.02,0.05,0.09) + 0.05*sin(vUv.y*80.0); }
  vec3 col = base * (1.0 - fres*0.5) + vec3(0.6,0.85,1.0) * fres * 0.8;
  gl_FragColor = vec4(col, 0.55 + fres*0.3);
}`;
const SCREEN_FRAG = `precision highp float; varying vec2 vUv; uniform float uTime; uniform float uSeed;
float hash(vec2 p){ return fract(sin(dot(p,vec2(269.5,183.3)))*43758.5453); }
void main(){ float line = floor(vUv.y*24.0); float blink = step(0.5, hash(vec2(line, floor(uTime*3.0)+uSeed))); vec3 col = mix(vec3(0.0,0.35,0.25), vec3(0.0,0.9,0.6), blink*0.6+0.2); col *= 0.7+0.3*sin(vUv.x*120.0); gl_FragColor = vec4(col,1.0); }`;
const SCREEN_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
export function createLabComplex(scene: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, tunnel: TunnelHandle | null, _seed = 21): LabComplexHandle {
  const group = new THREE.Group(); scene.add(group);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.85, metalness: 0.15, side: THREE.BackSide });
  const hub = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), wallMat); hub.position.set(0, 2.5, 0); group.add(hub);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.4, metalness: 0.5 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; group.add(floor);
  interface Door { panels: THREE.Mesh[]; open: number; target: number; axis: THREE.Vector3; base: THREE.Vector3; }
  const doors: Door[] = [];
  const mkDoor = (x: number, z: number, rotY: number): Door => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; group.add(g);
    const pMat = new THREE.MeshStandardMaterial({ color: 0x22303f, metalness: 0.7, roughness: 0.3, emissive: 0x0a2a44, emissiveIntensity: 0.4 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 0.15), pMat); a.position.set(-0.7, 1.5, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 0.15), pMat); b.position.set(0.7, 1.5, 0);
    g.add(a, b);
    const d: Door = { panels: [a, b], open: 0, target: 0, axis: new THREE.Vector3(1, 0, 0), base: new THREE.Vector3() };
    doors.push(d); return d;
  };
  mkDoor(7, 0, Math.PI / 2); mkDoor(-7, 0, Math.PI / 2); mkDoor(0, -7, 0);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 1.2), new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.6 }));
  bench.position.set(4.5, 0.45, 3); group.add(bench);
  const crystalDisplay = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.2, roughness: 0.15, emissive: 0x00ff9c, emissiveIntensity: 0.3 }), 24);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  for (let i = 0; i < 24; i++) { M.compose(P.set(-4.5 + (i % 6) * 0.5, 1.2 + Math.floor(i / 6) * 0.5, 3 + ((i * 0.31) % 1 - 0.5)), Q, S.setScalar(0.6 + ((i * 0.618) % 1) * 0.8)); crystalDisplay.setMatrixAt(i, M); }
  crystalDisplay.instanceMatrix.needsUpdate = true; group.add(crystalDisplay);
  const consoles: THREE.Mesh[] = [];
  const screens: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x0e141c, metalness: 0.6, roughness: 0.4 }));
    c.position.set(-2 + i * 2, 0.55, -5.6); c.rotation.x = -0.3; group.add(c); consoles.push(c);
    const sMat = new THREE.ShaderMaterial({ vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG, uniforms: { uTime: { value: 0 }, uSeed: { value: i * 13.7 } } });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), sMat); s.position.set(-2 + i * 2, 1.05, -5.3); s.rotation.x = -0.3; group.add(s); screens.push(s);
  }
  const glassUni = { uBackdrop: { value: null as THREE.Texture | null }, uIor: { value: 1.52 }, uTime: { value: 0 }, uThickness: { value: 0.06 }, uHasBackdrop: { value: 0 } };
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(12, 4), new THREE.ShaderMaterial({ vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, uniforms: glassUni, transparent: true, depthWrite: false }));
  glass.position.set(0, 2.2, -6.6); group.add(glass);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x2b3440, metalness: 0.8, roughness: 0.3 }));
  frame.position.set(0, 2.2, -6.75); group.add(frame);
  const controls = new PointerLockControls(camera, canvas);
  const keys = new Set<string>();
  const kd = (e: KeyboardEvent) => { keys.add(e.code); if (e.code === 'Digit1') handle.setCameraMode('WALK'); if (e.code === 'Digit2') handle.setCameraMode('GLASS'); if (e.code === 'Digit3') handle.setCameraMode('CONSOLE'); if (e.code === 'Digit4') handle.setCameraMode('TUNNEL'); };
  const ku = (e: KeyboardEvent) => keys.delete(e.code);
  document.addEventListener('keydown', kd); document.addEventListener('keyup', ku);
  let mode: CameraMode = 'WALK';
  const setCam = (m: CameraMode): void => {
    mode = m;
    tunnel?.setEnabled(m === 'TUNNEL');
    if (m === 'GLASS') { camera.position.set(0, 2.2, -4.5); camera.lookAt(0, 2.2, -30); if (controls.isLocked) controls.unlock(); }
    if (m === 'CONSOLE') { camera.position.set(0, 1.6, -4.2); camera.lookAt(0, 1.0, -5.6); if (controls.isLocked) controls.unlock(); }
    if (m === 'WALK') { camera.position.set(0, 1.6, 4); }
    if (m === 'TUNNEL') { tunnel?.lock(); }
  };
  const handle: LabComplexHandle = {
    setCameraMode: setCam,
    getCameraMode: () => mode,
    openDoor: (section, open) => { const d = doors[section - 1]; if (d) d.target = open ? 1 : 0; },
    setBackdrop: (tex) => { glassUni.uBackdrop.value = tex; glassUni.uHasBackdrop.value = tex ? 1 : 0; },
    lock: () => { if (mode === 'WALK') controls.lock(); },
    update: (dt, t) => {
      glassUni.uTime.value = t;
      screens.forEach(s => { (s.material as THREE.ShaderMaterial).uniforms.uTime.value = t; });
      for (const d of doors) { d.open += (d.target - d.open) * Math.min(1, dt * 3); d.panels[0].position.x = -0.7 - d.open * 1.3; d.panels[1].position.x = 0.7 + d.open * 1.3; }
      crystalDisplay.rotation.y = t * 0.1;
      if (mode === 'WALK' && controls.isLocked) {
        const sp = 2.4 * dt;
        if (keys.has('KeyW')) controls.moveForward(sp);
        if (keys.has('KeyS')) controls.moveForward(-sp);
        if (keys.has('KeyA')) controls.moveRight(-sp);
        if (keys.has('KeyD')) controls.moveRight(sp);
        camera.position.y = 1.6;
        camera.position.x = Math.max(-6.6, Math.min(6.6, camera.position.x));
        camera.position.z = Math.max(-6.4, Math.min(6.6, camera.position.z));
      }
      tunnel?.update(dt, t);
    },
    dispose: () => { document.removeEventListener('keydown', kd); document.removeEventListener('keyup', ku); controls.dispose();
      group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose(); });
      scene.remove(group); },
  };
  return handle;
}
