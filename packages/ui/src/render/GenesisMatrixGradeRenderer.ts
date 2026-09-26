import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mulberry32, canonicalJson as stableStringify, sha256Hex as sha256hex } from '@genesis/core/determinism.js';
export { mulberry32, stableStringify, sha256hex };
export interface Clock { now(): number; }
export interface UrbanBinding { readonly buildings: readonly { x: number; z: number; heightM: number; footprintM: number }[]; readonly emitters: readonly { x: number; y: number; z: number; colorHex: string; intensity: number; flickerHz: number }[]; }
export interface MatrixRendererHandle { readonly ok: boolean; bindUrbanData(u: UrbanBinding): string; update(dt: number, t: number): void; setLowPower(on: boolean): void; resize(): void; dispose(): void; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; }
/** Deterministic digital-rain fragment shader (column hash, no randomness). */
export const RAIN_SHADER = {
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
precision highp float; varying vec2 vUv; uniform float uTime;
float hash(float n){ return fract(sin(n)*43758.5453123); }
void main(){
  float cols = 90.0; float col = floor(vUv.x * cols);
  float speed = 0.25 + hash(col) * 0.75;
  float rows = 40.0;
  float y = fract(vUv.y * 0.5 + uTime * speed * 0.15);
  float cell = floor(y * rows);
  float g = hash(col * 7.13 + cell * 3.7);
  float head = smoothstep(0.0, 0.12, g) * smoothstep(1.0, 0.55, fract(y * rows) );
  float trail = pow(1.0 - fract(y), 2.0);
  vec3 emerald = vec3(0.0, 1.0, 0.62);
  vec3 col3 = emerald * (head * 0.9 + trail * 0.25) * (0.35 + 0.65 * hash(col + cell));
  gl_FragColor = vec4(col3, 1.0);
}`,
};
/** Matrix-grade renderer: PBR chrome, emerald emissive platforms, holographic pedestals, reflective floor, digital rain. */
export function createMatrixGradeRenderer(canvas: HTMLCanvasElement, seed: number, pixelRatioCap = 2): MatrixRendererHandle {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch { return { ok: false, bindUrbanData: () => '', update: () => {}, setLowPower: () => {}, resize: () => {}, dispose: () => {}, dataLabel: 'SYNTHETIC_CINEMATIC' }; }
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x010403);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 800); camera.position.set(0, 26, 60); camera.lookAt(0, 6, 0);
  const disposables: { dispose(): void }[] = [];
  const pmrem = new THREE.PMREMGenerator(renderer); disposables.push(pmrem);
  const envScene = new THREE.Scene();
  const gradMat = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`, fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y*0.5+0.5; vec3 c = mix(vec3(0.0,0.05,0.03), vec3(0.0,0.35,0.22), pow(h,2.0)); gl_FragColor = vec4(c,1.0); }` });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 16), gradMat)); disposables.push(gradMat);
  const envTex = pmrem.fromScene(envScene, 0.04).texture; disposables.push(envTex);
  scene.environment = envTex;
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 1.0, roughness: 0.08, envMap: envTex, envMapIntensity: 1.4 }); disposables.push(chrome);
  const emerald = new THREE.MeshStandardMaterial({ color: 0x03130c, emissive: 0x00ff9c, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.3 }); disposables.push(emerald);
  const holo = new THREE.MeshBasicMaterial({ color: 0x00ff9c, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }); disposables.push(holo);
  const reflector = new Reflector(new THREE.PlaneGeometry(400, 400), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x0a0f0d });
  reflector.rotation.x = -Math.PI / 2; reflector.position.y = -0.02; scene.add(reflector);
  const rainMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(RAIN_SHADER.uniforms), vertexShader: RAIN_SHADER.vertexShader, fragmentShader: RAIN_SHADER.fragmentShader, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); disposables.push(rainMat);
  const rain = new THREE.Mesh(new THREE.PlaneGeometry(300, 160), rainMat); rain.position.set(0, 60, -120); scene.add(rain); disposables.push(rain.geometry);
  scene.add(new THREE.AmbientLight(0x0a1f16, 0.6));
  const key = new THREE.DirectionalLight(0x9fffe0, 1.2); key.position.set(20, 40, 20); scene.add(key);
  let buildings: THREE.InstancedMesh | null = null; let emittersMesh: THREE.InstancedMesh | null = null; let pedestals: THREE.InstancedMesh | null = null;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  function bindUrbanData(u: UrbanBinding): string {
    if (buildings) { scene.remove(buildings); buildings.geometry.dispose(); }
    if (emittersMesh) { scene.remove(emittersMesh); emittersMesh.geometry.dispose(); }
    if (pedestals) { scene.remove(pedestals); pedestals.geometry.dispose(); }
    buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), chrome, u.buildings.length);
    u.buildings.forEach((b, i) => { M.compose(P.set(b.x, b.heightM / 2, b.z), Q.identity(), S.set(b.footprintM, b.heightM, b.footprintM)); buildings!.setMatrixAt(i, M); });
    buildings.instanceMatrix.needsUpdate = true; scene.add(buildings); disposables.push(buildings.geometry);
    emittersMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 1.2), emerald, u.emitters.length);
    pedestals = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 1.8, 0.4, 24), holo, u.emitters.length);
    u.emitters.forEach((e, i) => { M.compose(P.set(e.x, e.y, e.z), Q.identity(), S.setScalar(1)); emittersMesh!.setMatrixAt(i, M); M.compose(P.set(e.x, 0.2, e.z), Q.identity(), S.setScalar(1)); pedestals!.setMatrixAt(i, M); });
    emittersMesh.instanceMatrix.needsUpdate = true; pedestals.instanceMatrix.needsUpdate = true;
    scene.add(emittersMesh); scene.add(pedestals); disposables.push(emittersMesh.geometry, pedestals.geometry);
    return sha256hex(stableStringify({ seed, nb: u.buildings.length, ne: u.emitters.length, sample: u.buildings.slice(0, 8).map(b => [b.x, b.z, b.heightM]) }));
  }
  return {
    ok: true, bindUrbanData, dataLabel: 'SYNTHETIC_CINEMATIC',
    update(dt, t) { rainMat.uniforms.uTime.value = t; if (emittersMesh) { const flick = 0.7 + 0.3 * Math.sin(t * 6.0); (emittersMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 * flick; } renderer.render(scene, camera); },
    setLowPower(on) { renderer.setPixelRatio(on ? 1 : Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, pixelRatioCap)); reflector.visible = !on; },
    resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose() { reflector.getRenderTarget().dispose(); (reflector.material as THREE.Material).dispose(); reflector.geometry.dispose(); scene.remove(reflector); for (const d of disposables) d.dispose(); renderer.dispose(); scene.clear(); },
  };
}
