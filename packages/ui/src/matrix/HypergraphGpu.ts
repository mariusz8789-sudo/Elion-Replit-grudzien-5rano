/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { mulberry32 } from '@genesis/core/knowledge/EvidenceLedger.js';
import type { ScenarioNode, HyperEdge } from '@genesis/core/postmythos/RecursiveSimulationMatrix.js';
export interface HypergraphLayerHandle { update(t: number): void; dispose(): void; }
const NODE_VERT = `attribute float aMargin; attribute float aSeed; uniform float uTime; uniform float uPixelRatio; varying float vM; varying float vS;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; vM = aMargin; vS = aSeed;
 gl_PointSize = (3.0 + 8.0 * aMargin) * uPixelRatio * (0.8 + 0.2 * sin(uTime * (0.5 + aSeed))); }`;
const NODE_FRAG = `precision highp float; varying float vM; varying float vS;
void main(){ vec2 uv = gl_PointCoord - 0.5; float d = length(uv)*2.0; if (d>1.0) discard; float a = pow(1.0-d,2.2);
 vec3 col = mix(vec3(1.0,0.2,0.4), vec3(0.0,1.0,0.6), clamp(vM,0.0,1.0)); gl_FragColor = vec4(col*a, a); }`;
const EDGE_VERT = `attribute float aFlow; varying float vF; void main(){ vF = aFlow; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const EDGE_FRAG = `precision highp float; varying float vF; uniform float uTime;
void main(){ float dash = step(0.5, fract(vF * 20.0 - uTime * 0.6)); vec3 col = vec3(0.2,0.8,1.0) * (0.25 + 0.75*dash); gl_FragColor = vec4(col, 0.55); }`;
/** Deterministic radial-ring layout (depth -> radius, golden-angle spread). No force sim => reproducible. */
export function layoutHypergraph(nodes: readonly ScenarioNode[], seed: number): Map<string, THREE.Vector3> {
  const rng = mulberry32(seed);
  const out = new Map<string, THREE.Vector3>();
  const perDepth = new Map<number, number>();
  for (const n of nodes) { const k = perDepth.get(n.depth) ?? 0; perDepth.set(n.depth, k + 1);
    const radius = 4 + n.depth * 3.2; const angle = k * 2.399963229728653 + rng() * 0.05;
    out.set(n.id, new THREE.Vector3(Math.cos(angle) * radius, (rng() - 0.5) * 2.5, Math.sin(angle) * radius)); }
  return out;
}
export function createHypergraphLayer(scene: THREE.Scene, nodes: readonly ScenarioNode[], edges: readonly HyperEdge[], margins: ReadonlyMap<string, number>, seed: number, pixelRatio: number): HypergraphLayerHandle {
  const pos = layoutHypergraph(nodes, seed);
  const nGeo = new THREE.BufferGeometry();
  const nPos = new Float32Array(nodes.length * 3); const nMar = new Float32Array(nodes.length); const nSeed = new Float32Array(nodes.length);
  nodes.forEach((n, i) => { const v = pos.get(n.id)!; nPos[i * 3] = v.x; nPos[i * 3 + 1] = v.y; nPos[i * 3 + 2] = v.z; nMar[i] = margins.get(n.id) ?? 0.5; nSeed[i] = (i * 0.61803398875) % 1; });
  nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  nGeo.setAttribute('aMargin', new THREE.BufferAttribute(nMar, 1));
  nGeo.setAttribute('aSeed', new THREE.BufferAttribute(nSeed, 1));
  const nUni = { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } };
  const nMat = new THREE.ShaderMaterial({ vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, uniforms: nUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(nGeo, nMat); scene.add(points);
  const ePos: number[] = []; const eFlow: number[] = [];
  for (const e of edges) { const a = pos.get(e.from); const b = pos.get(e.to); if (!a || !b) continue; ePos.push(a.x, a.y, a.z, b.x, b.y, b.z); eFlow.push(0, 1); }
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ePos), 3));
  eGeo.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(eFlow), 1));
  const eUni = { uTime: { value: 0 } };
  const eMat = new THREE.ShaderMaterial({ vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, uniforms: eUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lines = new THREE.LineSegments(eGeo, eMat); scene.add(lines);
  return { update: (t) => { nUni.uTime.value = t; eUni.uTime.value = t; }, dispose: () => { nGeo.dispose(); nMat.dispose(); eGeo.dispose(); eMat.dispose(); scene.remove(points, lines); } };
}
