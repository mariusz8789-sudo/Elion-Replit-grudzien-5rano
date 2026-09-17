import * as THREE from 'three';
export interface RelativisticParams { massKg: number; velocityC: number; zoom: number; simTime: number; }
export interface RelativisticPipelineHandle { readonly ok: boolean; setParams(p: RelativisticParams): void; update(dt: number): void; resize(): void; dispose(): void; }
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
precision highp float; varying vec2 vUv;
uniform float uRs; uniform float uVel; uniform float uZoom; uniform float uTime; uniform float uMass;
vec3 diskColor(float r){ float t = clamp(1.0 - r/3.0, 0.0, 1.0); return mix(vec3(0.9,0.35,0.05), vec3(1.0,0.85,0.5), t); }
void main(){
  vec2 p = (vUv - 0.5) * 2.0; p /= max(uZoom, 0.001);
  float r = length(p);
  float bend = uRs / max(r, 0.001);
  vec2 dir = normalize(p + vec2(0.0001));
  vec2 bent = normalize(dir + bend * vec2(-dir.y, dir.x) * 0.6);
  float lr = length(p + bent * bend * 0.5);
  float doppler = 1.0 + uVel * dot(bent, vec2(1.0, 0.0));
  vec3 col = vec3(0.0);
  if (lr < uRs) { col = vec3(0.0); }
  else { float disk = smoothstep(uRs*2.6, uRs*1.2, lr) * smoothstep(uRs*0.9, uRs*1.1, lr);
         col = diskColor(lr) * disk * doppler;
         float ring = smoothstep(0.02, 0.0, abs(lr - uRs*1.5)); col += vec3(0.6,0.8,1.0) * ring * 0.4; }
  col += vec3(0.02,0.03,0.06) * (0.5 + 0.5*sin(uTime*0.5));
  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`;
/** Three.js/WebGL relativistic shader pipeline. No CDN. Injected sim time only. */
export function createRelativisticPipeline(canvas: HTMLCanvasElement, onWebGLFail: (m: string) => void): RelativisticPipelineHandle {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
  catch (e) { onWebGLFail(String(e)); return { ok: false, setParams() {}, update() {}, resize() {}, dispose() {} }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uRs: { value: 0.2 }, uVel: { value: 0 }, uZoom: { value: 1 }, uTime: { value: 0 }, uMass: { value: 1 } } });
  const quad = new THREE.Mesh(geo, mat); scene.add(quad);
  let params: RelativisticParams = { massKg: 1.989e30, velocityC: 0, zoom: 1, simTime: 0 };
  const apply = () => { mat.uniforms.uRs.value = Math.min(0.6, 0.1 + (params.massKg / 1.989e30) * 0.2); mat.uniforms.uVel.value = params.velocityC; mat.uniforms.uZoom.value = params.zoom; mat.uniforms.uMass.value = params.massKg; };
  apply();
  return {
    ok: true,
    setParams(p) { params = p; apply(); mat.uniforms.uTime.value = p.simTime; },
    update(_dt) { renderer.render(scene, cam); },
    resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); },
    dispose() { geo.dispose(); mat.dispose(); renderer.renderLists.dispose(); renderer.dispose(); scene.clear(); },
  };
}
