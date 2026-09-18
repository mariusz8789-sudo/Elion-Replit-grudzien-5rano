/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { LabResult } from '@genesis/core/lab/ThermodynamicLabEngine.js';
export interface LabVisualState { readonly temperatureK: number; readonly color: readonly [number, number, number]; readonly gasRate: number; readonly crystallization: number; readonly explosionFlash: number; readonly ignited: boolean; }
export interface LabFpvHandle { update(dt: number, t: number): void; setLabState(s: LabVisualState): void; lock(): void; dispose(): void; }
export function mapLabResultToVisual(r: LabResult, ignited: boolean): LabVisualState {
  const c = new THREE.Color(r.outcome.colorChange ? '#0ea5e9' : '#e2e8f0');
  return { temperatureK: r.adiabaticTK, color: [c.r, c.g, c.b], gasRate: r.outcome.gasMol, crystallization: r.outcome.crystallization ? 1 : 0, explosionFlash: r.outcome.explosion ? 1 : 0, ignited };
}
const LIQUID_VERT = `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const LIQUID_FRAG = `precision highp float; varying vec2 vUv; varying vec3 vN; uniform vec3 uColor; uniform float uTemp; uniform float uTime; uniform float uBubble;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){ float boil = smoothstep(370.0, 420.0, uTemp); float wave = sin(vUv.x*30.0 + uTime*3.0)*0.02*boil; float fres = pow(1.0 - max(dot(normalize(vN), vec3(0.0,0.0,1.0)),0.0), 2.0);
 vec3 col = uColor * (0.6 + 0.4*fres) + vec3(1.0)*boil*0.25*(0.5+0.5*hash(floor(vUv*40.0)+floor(uTime*8.0))); gl_FragColor = vec4(col, 0.85 - uBubble*0.1); }`;
const FLAME_FRAG = `precision highp float; varying vec2 vUv; uniform float uTime; uniform float uIntensity;
float hash(vec2 p){ return fract(sin(dot(p,vec2(269.5,183.3)))*43758.5453); }
void main(){ float n = hash(floor(vec2(vUv.x*12.0, vUv.y*20.0 - uTime*6.0))); float a = smoothstep(1.0, 0.2, abs(vUv.x-0.5)*2.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y); vec3 col = mix(vec3(1.0,0.4,0.05), vec3(1.0,0.85,0.3), n); gl_FragColor = vec4(col * uIntensity, a * uIntensity); }`;
const BUBBLE_N = 120;
export function createLabFpv(scene: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement): LabFpvHandle {
  const controls = new PointerLockControls(camera, canvas);
  const keys = new Set<string>();
  const onKeyDown = (e: KeyboardEvent) => keys.add(e.code); const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  document.addEventListener('keydown', onKeyDown); document.addEventListener('keyup', onKeyUp);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0x1a2332, roughness: 0.6, metalness: 0.3 }));
  bench.position.set(0, 0.9, -1.6); scene.add(bench);
  const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xdfefff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, side: THREE.DoubleSide }));
  beaker.position.set(0, 1.4, -1.6); scene.add(beaker);
  const liqUni = { uColor: { value: new THREE.Color(0.2, 0.6, 0.9) }, uTemp: { value: 298 }, uTime: { value: 0 }, uBubble: { value: 0 } };
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 32), new THREE.ShaderMaterial({ vertexShader: LIQUID_VERT, fragmentShader: LIQUID_FRAG, uniforms: liqUni, transparent: true }));
  liquid.position.set(0, 1.25, -1.6); scene.add(liquid);
  const bubGeo = new THREE.BufferGeometry();
  const bubPos = new Float32Array(BUBBLE_N * 3); const bubPhase = new Float32Array(BUBBLE_N);
  for (let i = 0; i < BUBBLE_N; i++) { bubPhase[i] = (i * 0.61803398875) % 1; bubPos[i * 3] = (bubPhase[i] - 0.5) * 0.5; bubPos[i * 3 + 1] = 0; bubPos[i * 3 + 2] = ((bubPhase[i] * 7.13) % 1 - 0.5) * 0.5; }
  bubGeo.setAttribute('position', new THREE.BufferAttribute(bubPos, 3));
  const bubbles = new THREE.Points(bubGeo, new THREE.PointsMaterial({ color: 0xdfefff, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false }));
  bubbles.position.set(0, 1.05, -1.6); scene.add(bubbles);
  const crystGeo = new THREE.OctahedronGeometry(0.04);
  const crystals = new THREE.InstancedMesh(crystGeo, new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.1 }), 40);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  for (let i = 0; i < 40; i++) { M.compose(P.set(((i * 0.618) % 1 - 0.5) * 0.5, 1.05 + ((i * 0.31) % 1) * 0.3, -1.6 + (((i * 0.77) % 1) - 0.5) * 0.5), Q, S.setScalar(0.001)); crystals.setMatrixAt(i, M); }
  crystals.instanceMatrix.needsUpdate = true; scene.add(crystals);
  const flameUni = { uTime: { value: 0 }, uIntensity: { value: 0 } };
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.ShaderMaterial({ vertexShader: LIQUID_VERT, fragmentShader: FLAME_FRAG, uniforms: flameUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.set(0, 1.0, -1.35); scene.add(flame);
  const heat = new THREE.PointLight(0xff7733, 0, 6); heat.position.set(0, 1.2, -1.4); scene.add(heat);
  const flash = new THREE.PointLight(0xffffff, 0, 20); flash.position.set(0, 1.6, -1.6); scene.add(flash);
  let state: LabVisualState = { temperatureK: 298, color: [0.2, 0.6, 0.9], gasRate: 0, crystallization: 0, explosionFlash: 0, ignited: false };
  let flashT = 0;
  const vel = new THREE.Vector3();
  return {
    lock: () => { controls.lock(); },
    setLabState: (s) => { state = s; if (s.explosionFlash > 0) flashT = 0.6; },
    update: (dt, t) => {
      liqUni.uTime.value = t; liqUni.uTemp.value = state.temperatureK; liqUni.uColor.value.setRGB(state.color[0], state.color[1], state.color[2]); liqUni.uBubble.value = Math.min(1, state.gasRate);
      flameUni.uTime.value = t; flameUni.uIntensity.value = state.ignited ? 0.9 + 0.1 * Math.sin(t * 12) : 0;
      heat.intensity = state.ignited ? 2.2 : Math.max(0, (state.temperatureK - 298) / 400);
      flashT = Math.max(0, flashT - dt); flash.intensity = flashT * 30 * state.explosionFlash;
      const posAttr = bubGeo.getAttribute('position') as THREE.BufferAttribute;
      const rate = Math.min(1, state.gasRate);
      for (let i = 0; i < BUBBLE_N; i++) { const ph = bubPhase[i]; const y = ((t * (0.2 + rate * 0.6) + ph) % 1) * 0.5; posAttr.setY(i, y); }
      posAttr.needsUpdate = true;
      bubbles.visible = rate > 0.01;
      const cs = state.crystallization;
      for (let i = 0; i < 40; i++) { const s = cs > 0 ? 0.001 + cs * (0.02 + 0.03 * ((i * 0.31) % 1)) * Math.min(1, t * 0.15 + ph(i)) : 0.001; M.compose(P.set(((i * 0.618) % 1 - 0.5) * 0.5, 1.05 + ((i * 0.31) % 1) * 0.3, -1.6 + (((i * 0.77) % 1) - 0.5) * 0.5), Q, S.setScalar(s)); crystals.setMatrixAt(i, M); }
      crystals.instanceMatrix.needsUpdate = true;
      function ph(i: number): number { return (i * 0.61803398875) % 1; }
      if (controls.isLocked) {
        const speed = 1.6 * dt;
        vel.set(0, 0, 0);
        if (keys.has('KeyW')) vel.z -= speed; if (keys.has('KeyS')) vel.z += speed; if (keys.has('KeyA')) vel.x -= speed; if (keys.has('KeyD')) vel.x += speed;
        controls.moveRight(vel.x); controls.moveForward(-vel.z);
        camera.position.y = 1.6;
      }
    },
    dispose: () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('keyup', onKeyUp); controls.dispose();
      [bench, beaker, liquid, bubbles, crystals, flame].forEach(o => { o.geometry.dispose(); (o.material as THREE.Material).dispose(); scene.remove(o); });
      heat.dispose(); flash.dispose(); },
  };
}
