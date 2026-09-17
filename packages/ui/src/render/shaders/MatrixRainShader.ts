/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export interface MatrixRainOptions { readonly columns?: number; readonly rows?: number; readonly speed?: number; readonly opacity?: number; readonly colorA?: number; readonly colorB?: number; }
export interface MatrixRainUniforms { readonly uTime: { value: number }; readonly uSpeed: { value: number }; readonly uColumns: { value: number }; readonly uRows: { value: number }; readonly uOpacity: { value: number }; readonly uColorA: { value: THREE.Color }; readonly uColorB: { value: THREE.Color }; }
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
precision highp float; varying vec2 vUv;
uniform float uTime; uniform float uSpeed; uniform float uColumns; uniform float uRows; uniform float uOpacity;
uniform vec3 uColorA; uniform vec3 uColorB;
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec2 uv = vUv;
  float col = floor(uv.x * uColumns);
  float colSpeed = 0.6 + hash21(vec2(col, 1.0)) * 1.4;
  float scroll = uTime * uSpeed * colSpeed;
  float rowCell = floor(uv.y * uRows + scroll);
  float charId = hash21(vec2(col, rowCell));
  float glyph = step(0.35, charId);
  float headFract = fract(uv.y * uRows + scroll);
  float head = smoothstep(0.0, 0.25, headFract) * smoothstep(1.0, 0.6, headFract);
  float trail = pow(1.0 - headFract, 1.5);
  float bright = max(head, trail * 0.6) * glyph;
  vec3 stream = mix(uColorA, uColorB, hash21(vec2(col, rowCell + 7.0)));
  stream *= 0.5 + 0.5 * hash21(vec2(col, 3.0));
  gl_FragColor = vec4(stream * bright, bright * uOpacity);
}`;
export function createMatrixRainMaterial(opts: MatrixRainOptions = {}): THREE.ShaderMaterial {
  const uniforms: MatrixRainUniforms = {
    uTime: { value: 0 }, uSpeed: { value: opts.speed ?? 0.35 }, uColumns: { value: opts.columns ?? 96 }, uRows: { value: opts.rows ?? 40 },
    uOpacity: { value: opts.opacity ?? 0.85 }, uColorA: { value: new THREE.Color(opts.colorA ?? 0x00ff9c) }, uColorB: { value: new THREE.Color(opts.colorB ?? 0x38bdf8) },
  };
  return new THREE.ShaderMaterial({ uniforms: uniforms as unknown as Record<string, THREE.IUniform>, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
}
/** Inverted box skybox so rain wraps all walls; deterministic (GLSL hash only, time from SimClock). */
export function createMatrixRainSkybox(size = 600, opts: MatrixRainOptions = {}): THREE.Mesh {
  const mat = createMatrixRainMaterial(opts);
  return new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
}
export function setRainTime(skybox: THREE.Mesh, t: number): void { (skybox.material as THREE.ShaderMaterial).uniforms.uTime.value = t; }
export const MATRIX_RAIN_FRAGMENT_SHADER = FRAG;
export const MATRIX_RAIN_VERTEX_SHADER = VERT;
export const RAIN_SHADER = { uniforms: { uTime: { value: 0 } }, vertexShader: VERT, fragmentShader: FRAG };
export function updateMatrixRainMaterial(material: THREE.Material, t: number): void { const shader = material as THREE.ShaderMaterial; if (shader.uniforms?.uTime) shader.uniforms.uTime.value = t; }
