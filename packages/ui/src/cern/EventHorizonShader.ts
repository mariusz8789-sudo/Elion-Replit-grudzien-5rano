/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
export interface EventHorizonUniforms { [uniform: string]: THREE.IUniform; uRs: { value: number }; uTime: { value: number }; uDiskIn: { value: number }; uDiskOut: { value: number }; uTempK: { value: number }; uCamRight: { value: THREE.Vector3 }; uCamUp: { value: THREE.Vector3 }; uCamFwd: { value: THREE.Vector3 }; uSeed: { value: number }; }
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
/** Screen-space gravitational lensing + thin accretion disk with Doppler beaming + photon ring + shadow.
 *  Deflection alpha ~ 4GM/(c^2 b) expressed in screen units via uRs. Educational GR visualization. */
const FRAG = `
precision highp float; varying vec2 vUv;
uniform float uRs; uniform float uTime; uniform float uDiskIn; uniform float uDiskOut; uniform float uTempK; uniform float uSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float stars(vec2 d){ vec2 g = floor(d*180.0); float h = hash(g); return step(0.995, h) * (0.4+0.6*hash(g+7.0)); }
vec3 tempColor(float t){ float x = clamp(t/6000.0, 0.0, 1.0); return mix(vec3(1.0,0.45,0.1), mix(vec3(1.0,0.9,0.7), vec3(0.6,0.8,1.0), x), x); }
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p) + 1e-6;
  float defl = uRs / max(r, 0.02);
  vec2 bent = p * (1.0 - defl*0.35) + vec2(-p.y, p.x) * defl * 0.12;
  vec3 col = vec3(stars(bent + uSeed)) * vec3(0.8,0.9,1.0);
  float shadowR = 2.6 * uRs;
  float ringR = 1.5 * uRs;
  if (r < shadowR) { col = vec3(0.0); }
  float ring = smoothstep(0.12*uRs, 0.0, abs(r - ringR));
  col += vec3(1.0, 0.85, 0.5) * ring * 1.6;
  float inDisk = step(uDiskIn, r) * step(r, uDiskOut);
  float yFlat = abs(p.y);
  float diskMask = inDisk * smoothstep(0.35*uRs, 0.02, yFlat);
  float tProf = uTempK * pow(uDiskIn / max(r, uDiskIn), 0.75);
  float cosPhi = p.x / r;
  float beta = 0.35 * sqrt(uRs / max(r, uRs));
  float beam = 1.0 / pow(max(0.2, 1.0 - beta * cosPhi), 3.0);
  float swirl = 0.75 + 0.25 * sin(atan(p.y, p.x)*3.0 - uTime*2.0 + r*8.0);
  col += tempColor(tProf) * diskMask * beam * swirl * 1.4;
  gl_FragColor = vec4(col, 1.0);
}`;
export function createEventHorizonMaterial(rsScreen = 0.12, tempK = 5500, seed = 7): THREE.ShaderMaterial {
  const uniforms: EventHorizonUniforms = { uRs: { value: rsScreen }, uTime: { value: 0 }, uDiskIn: { value: rsScreen * 3 }, uDiskOut: { value: rsScreen * 12 }, uTempK: { value: tempK }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) }, uCamFwd: { value: new THREE.Vector3(0, 0, -1) }, uSeed: { value: seed } };
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false });
}
export function createEventHorizonQuad(mat: THREE.ShaderMaterial, size = 4): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
}
