/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import type { ColliderEvent } from '@genesis/core/collider/QuantumColliderEngine.js';
import { PHYS } from '@genesis/core/collider/QuantumColliderEngine.js';
export interface ColliderLayerHandle { update(t: number): void; dispose(): void; }
const TRACK_VERT = /* glsl */ `
attribute float aPT; attribute float aPhi0; attribute float aPzOverPt; attribute float aCharge; attribute float aS; attribute float aType;
uniform float uB; uniform float uScale;
varying float vType; varying float vFade; varying float vCharge;
void main(){
  float q = aCharge; float pT = max(aPT, 0.05);
  float R = pT / (0.3 * uB);
  float theta = q * aS / R;
  float x; float y;
  if (abs(q) < 0.5) { x = cos(aPhi0) * aS; y = sin(aPhi0) * aS; }
  else { x = R * (sin(aPhi0 + theta) - sin(aPhi0)); y = -R * (cos(aPhi0 + theta) - cos(aPhi0)); }
  float z = aS * aPzOverPt;
  vec3 pos = vec3(x, y, z) * uScale;
  vFade = exp(-aS * 0.00035);
  vType = aType; vCharge = q;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const TRACK_FRAG = /* glsl */ `
precision highp float; varying float vType; varying float vFade; varying float vCharge;
vec3 palette(float t){ if (t < 0.5) return vec3(0.2,0.9,1.0); if (t < 1.5) return vec3(1.0,0.35,0.6); if (t < 2.5) return vec3(0.4,1.0,0.5); if (t < 3.5) return vec3(1.0,0.85,0.3); return vec3(0.7,0.7,0.75); }
void main(){ vec3 col = palette(vType) * (0.6 + 0.4 * abs(vCharge)); gl_FragColor = vec4(col * vFade, vFade); }`;
const HIT_VERT = /* glsl */ `
attribute float aEnergy; attribute float aKind; uniform float uPixelRatio; varying float vE; varying float vK;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; vE = aEnergy; vK = aKind; gl_PointSize = (4.0 + 26.0 * min(1.0, aEnergy / 400.0)) * uPixelRatio; }`;
const HIT_FRAG = /* glsl */ `
precision highp float; varying float vE; varying float vK;
void main(){ vec2 uv = gl_PointCoord - 0.5; float d = length(uv)*2.0; if (d>1.0) discard; float a = pow(1.0-d,2.0); vec3 col = vK < 0.5 ? vec3(0.2,0.9,0.6) : vec3(1.0,0.6,0.2); gl_FragColor = vec4(col*a*(0.4+0.6*min(1.0,vE/300.0)), a); }`;
const typeOf = (pdg: number): number => (pdg === 22 ? 4 : Math.abs(pdg) === 11 || Math.abs(pdg) === 13 ? 0 : Math.abs(pdg) === 211 ? 1 : Math.abs(pdg) === 12 || Math.abs(pdg) === 14 ? 3 : 2);
const SEG = 48;
export function createColliderLayer(scene: THREE.Scene, ev: ColliderEvent, opts: { B?: number; scale?: number; pixelRatio?: number } = {}): ColliderLayerHandle {
  const B = opts.B ?? PHYS.B_FIELD; const scale = opts.scale ?? 0.02; const pr = opts.pixelRatio ?? 1;
  const tracks = ev.finals.filter(f => f.pdg !== 12 && f.pdg !== 14);
  const vCount = tracks.length * SEG * 2;
  const pos = new Float32Array(vCount * 3);
  const aPT = new Float32Array(vCount); const aPhi0 = new Float32Array(vCount); const aPz = new Float32Array(vCount); const aQ = new Float32Array(vCount); const aS = new Float32Array(vCount); const aT = new Float32Array(vCount);
  let vi = 0;
  const maxLen = 6000;
  for (const f of tracks) {
    const pT = Math.max(0.05, Math.hypot(f.p4.px, f.p4.py));
    const phi0 = Math.atan2(f.p4.py, f.p4.px);
    const pzOverPt = f.p4.pz / pT;
    const charge = f.pdg === 22 ? 0 : (f.pdg === 11 || f.pdg === 13 || f.pdg === -211 ? -1 : 1);
    const t = typeOf(f.pdg);
    const len = Math.min(maxLen, 800 + f.p4.e * 3);
    for (let s = 0; s < SEG; s++) {
      const s0 = (s / SEG) * len; const s1 = ((s + 1) / SEG) * len;
      for (const ss of [s0, s1]) { aPT[vi] = pT; aPhi0[vi] = phi0; aPz[vi] = pzOverPt; aQ[vi] = charge; aS[vi] = ss; aT[vi] = t; vi++; }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPT', new THREE.BufferAttribute(aPT, 1));
  geo.setAttribute('aPhi0', new THREE.BufferAttribute(aPhi0, 1));
  geo.setAttribute('aPzOverPt', new THREE.BufferAttribute(aPz, 1));
  geo.setAttribute('aCharge', new THREE.BufferAttribute(aQ, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  geo.setAttribute('aType', new THREE.BufferAttribute(aT, 1));
  const uni = { uB: { value: B }, uScale: { value: scale } };
  const mat = new THREE.ShaderMaterial({ vertexShader: TRACK_VERT, fragmentShader: TRACK_FRAG, uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(geo, mat); scene.add(lines);
  const hits = ev.finals.filter(f => f.pdg === 22 || Math.abs(f.pdg) === 211 || Math.abs(f.pdg) === 11 || Math.abs(f.pdg) === 13);
  const hPos = new Float32Array(hits.length * 3); const hE = new Float32Array(hits.length); const hK = new Float32Array(hits.length);
  hits.forEach((f, i) => { const dir = new THREE.Vector3(f.p4.px, f.p4.py, f.p4.pz).normalize().multiplyScalar(2.2 / scale * 0.02); hPos[i * 3] = dir.x; hPos[i * 3 + 1] = dir.y; hPos[i * 3 + 2] = dir.z; hE[i] = f.p4.e; hK[i] = f.pdg === 22 ? 0 : 1; });
  const hGeo = new THREE.BufferGeometry();
  hGeo.setAttribute('position', new THREE.BufferAttribute(hPos, 3));
  hGeo.setAttribute('aEnergy', new THREE.BufferAttribute(hE, 1));
  hGeo.setAttribute('aKind', new THREE.BufferAttribute(hK, 1));
  const hUni = { uPixelRatio: { value: pr } };
  const hMat = new THREE.ShaderMaterial({ vertexShader: HIT_VERT, fragmentShader: HIT_FRAG, uniforms: hUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(hGeo, hMat); scene.add(points);
  const shells: THREE.Mesh[] = [];
  for (const [radius, color] of [[1.1, 0x1b2b42], [1.5, 0x14432f], [2.5, 0x4a2b12], [3.5, 0x2b2b33]] as const) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.18 }));
    m.rotation.x = Math.PI / 2; scene.add(m); shells.push(m);
  }
  return { update: (_t) => { uni.uB.value = B; }, dispose: () => { geo.dispose(); mat.dispose(); hGeo.dispose(); hMat.dispose(); shells.forEach(s => { s.geometry.dispose(); (s.material as THREE.Material).dispose(); scene.remove(s); }); scene.remove(lines, points); } };
}
