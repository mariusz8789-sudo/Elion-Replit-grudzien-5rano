/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { mulberry32 } from './shaders/MatrixRainShader.js';
export interface RendererQuality { readonly tier: 'HIGH' | 'FALLBACK'; readonly reasons: readonly string[]; }
export interface ChromeMaterialOptions { readonly tint?: number; readonly obsidian?: boolean; readonly clearcoat?: boolean; }
export interface ProductionRendererHandle {
  readonly ok: boolean; readonly quality: RendererQuality;
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera;
  createPBRMaterial(opts: { color: number; metalness?: number; roughness?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean }): THREE.Material;
  createMatrixChromeMaterial(opts?: ChromeMaterialOptions): THREE.Material;
  update(dt: number, t: number): void; resize(): void; dispose(): void;
}
export function detectQuality(): RendererQuality {
  const reasons: string[] = [];
  const probe = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const gl = probe ? (probe.getContext('webgl2') || probe.getContext('webgl')) : null;
  if (!gl) return { tier: 'FALLBACK', reasons: ['NO_WEBGL'] };
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number }) : null;
  if (nav && /HeadlessChrome|jsdom|Node\.js/i.test(nav.userAgent)) reasons.push('HEADLESS');
  const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
  const unmasked = dbg ? String((gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(unmasked)) reasons.push('SOFTWARE_RASTERIZER');
  if (nav && (nav.hardwareConcurrency ?? 8) <= 2) reasons.push('LOW_CORES');
  if (nav && (nav.deviceMemory ?? 8) <= 2) reasons.push('LOW_MEMORY');
  return { tier: reasons.length === 0 ? 'HIGH' : 'FALLBACK', reasons };
}
/** Procedural cyberpunk environment probe for PBR reflections (deterministic, seeded). */
function buildCyberEnvProbe(renderer: THREE.WebGLRenderer, seed: number): THREE.Texture | null {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`, fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y*0.5+0.5; vec3 c = mix(vec3(0.01,0.02,0.05), vec3(0.0,0.25,0.2), pow(h,1.5)); gl_FragColor = vec4(c,1.0); }` }));
    env.add(sky);
    const rng = mulberry32(seed);
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x0a1626, emissive: 0x00ff9c, emissiveIntensity: 0.6 }), 40);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    for (let i = 0; i < 40; i++) { const a = rng() * Math.PI * 2; const r = 20 + rng() * 20; M.compose(P.set(Math.cos(a) * r, rng() * 14, Math.sin(a) * r), Q, S.set(2 + rng() * 3, 6 + rng() * 16, 2 + rng() * 3)); boxes.setMatrixAt(i, M); }
    boxes.instanceMatrix.needsUpdate = true; env.add(boxes);
    const tex = pmrem.fromScene(env, 0.05).texture;
    sky.geometry.dispose(); (sky.material as THREE.Material).dispose(); boxes.geometry.dispose(); (boxes.material as THREE.Material).dispose(); pmrem.dispose();
    return tex;
  } catch { return null; }
}
export function createProductionRenderer(canvas: HTMLCanvasElement, opts: { pixelRatioCap?: number; shadows?: 'auto' | 'on' | 'off'; seed?: number } = {}): ProductionRendererHandle {
  const quality = detectQuality(); const cap = opts.pixelRatioCap ?? 2; const seed = opts.seed ?? 1337;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.tier === 'HIGH', powerPreference: quality.tier === 'HIGH' ? 'high-performance' : 'default' }); }
  catch { const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    return { ok: false, quality: { tier: 'FALLBACK', reasons: ['WEBGL_CONSTRUCTOR_FAILED'] }, scene, camera, createPBRMaterial: () => new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), createMatrixChromeMaterial: () => new THREE.MeshBasicMaterial({ color: 0x0a0a0f }), update: () => {}, resize: () => {}, dispose: () => {} }; }
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, quality.tier === 'HIGH' ? cap : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  const shadowsOn = opts.shadows === 'on' || (opts.shadows !== 'off' && quality.tier === 'HIGH');
  renderer.shadowMap.enabled = shadowsOn; if (shadowsOn) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02050a); scene.fog = new THREE.FogExp2(0x02050a, 0.008);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900); camera.position.set(0, 20, 55);
  const envTex = quality.tier === 'HIGH' ? buildCyberEnvProbe(renderer, seed) : null;
  if (envTex) scene.environment = envTex;
  const ambient = new THREE.AmbientLight(0x0a1f16, 0.45); scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x00e5ff, 0x02050a, 0.35); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xdfefff, 1.0); sun.position.set(30, 50, 20); sun.castShadow = shadowsOn; if (shadowsOn) { sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.far = 250; sun.shadow.bias = -0.0005; } scene.add(sun);
  const rimGreen = new THREE.PointLight(0x00ff9c, 1.6, 120); rimGreen.position.set(-40, 18, -30); scene.add(rimGreen);
  const rimBlue = new THREE.PointLight(0x38bdf8, 1.6, 120); rimBlue.position.set(40, 14, -20); scene.add(rimBlue);
  const rimCyan = new THREE.PointLight(0x00e5ff, 1.2, 100); rimCyan.position.set(0, 24, 40); scene.add(rimCyan);
  const disposables: { dispose(): void }[] = []; if (envTex) disposables.push(envTex);
  function createPBRMaterial(o: { color: number; metalness?: number; roughness?: number; emissive?: number; emissiveIntensity?: number; transparent?: boolean }): THREE.Material {
    if (quality.tier === 'FALLBACK') { const m = new THREE.MeshLambertMaterial({ color: o.color, emissive: o.emissive ?? 0x000000, transparent: o.transparent ?? false }); disposables.push(m); return m; }
    const m = new THREE.MeshStandardMaterial({ color: o.color, metalness: o.metalness ?? 0.6, roughness: o.roughness ?? 0.35, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1, transparent: o.transparent ?? false, envMap: envTex, envMapIntensity: 1.2 });
    disposables.push(m); return m;
  }
  /** Hyper-reflective chrome/obsidian cinematic surface. */
  function createMatrixChromeMaterial(o: ChromeMaterialOptions = {}): THREE.Material {
    const base = o.obsidian ? 0x0a0a0f : (o.tint ?? 0xb8c4cc);
    if (quality.tier === 'FALLBACK') { const m = new THREE.MeshStandardMaterial({ color: base, metalness: 0.6, roughness: 0.3, envMap: envTex ?? undefined }); disposables.push(m); return m; }
    const m = o.clearcoat
      ? new THREE.MeshPhysicalMaterial({ color: base, metalness: 0.95, roughness: 0.1, envMap: envTex, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.08 })
      : new THREE.MeshStandardMaterial({ color: base, metalness: 0.95, roughness: 0.1, envMap: envTex, envMapIntensity: 1.8 });
    disposables.push(m); return m;
  }
  return {
    ok: true, quality, scene, camera, createPBRMaterial, createMatrixChromeMaterial,
    update(dt, t) { ambient.intensity = 0.4 + 0.15 * Math.sin(t * 0.1); hemi.intensity = 0.3 + 0.12 * Math.sin(t * 0.07 + 1);
      rimGreen.intensity = 1.4 + 0.5 * Math.sin(t * 1.3); rimBlue.intensity = 1.4 + 0.5 * Math.sin(t * 1.1 + 2); rimCyan.intensity = 1.0 + 0.4 * Math.sin(t * 0.9 + 4);
      sun.position.x = 30 * Math.cos(t * 0.02); sun.position.z = 20 * Math.sin(t * 0.02); renderer.render(scene, camera); },
    resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    dispose() { scene.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); for (const d of disposables) d.dispose(); renderer.dispose(); scene.clear(); },
  };
}
