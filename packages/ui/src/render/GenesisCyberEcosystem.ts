/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { mulberry32 } from './shaders/MatrixRainShader.js';
export type EntityKind = 'PODIUM' | 'AGENT' | 'CAR' | 'CAT' | 'SHOP';
export interface EcosystemOptions { readonly seed: number; readonly bounds: number; readonly podiums?: number; readonly agents?: number; readonly cars?: number; readonly cats?: number; readonly shops?: number; }
export interface EcosystemHandle { readonly group: THREE.Group; readonly counts: Readonly<Record<EntityKind, number>>; update(dt: number, t: number): void; dispose(): void; }
const wrap = (v: number, range: number): number => ((v % range) + range) % range - range / 2;
/** Procedural cyber ecosystem: podiums w/ pulsing rings, chrome agents, traffic cars, cyber-cats, neon shops. All motion is a pure function of sim time t. */
export function createCyberEcosystem(deps: { chrome: (o?: { obsidian?: boolean }) => THREE.Material; emissive: (color: number, intensity?: number) => THREE.Material }, opts: EcosystemOptions): EcosystemHandle {
  const rng = mulberry32(opts.seed); const B = opts.bounds;
  const group = new THREE.Group();
  const nPod = opts.podiums ?? 3, nAg = opts.agents ?? 24, nCar = opts.cars ?? 18, nCat = opts.cats ?? 6, nShop = opts.shops ?? 12;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  // Podiums + pulsing emissive rings
  const podGeo = track(new THREE.CylinderGeometry(1.6, 2.0, 0.6, 32));
  const podMat = deps.chrome({ obsidian: true });
  const podiums = new THREE.InstancedMesh(podGeo, podMat, nPod);
  const ringGeo = track(new THREE.TorusGeometry(2.2, 0.08, 12, 48));
  const ringMat = deps.emissive(0x00ff9c, 2.0);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, nPod);
  const podPos: [number, number][] = [];
  for (let i = 0; i < nPod; i++) { const x = (rng() - 0.5) * B * 0.4, z = (rng() - 0.5) * B * 0.4; podPos.push([x, z]);
    M.compose(P.set(x, 0.3, z), Q.identity(), S.setScalar(1)); podiums.setMatrixAt(i, M);
    M.compose(P.set(x, 0.62, z), Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), S.setScalar(1)); rings.setMatrixAt(i, M); }
  podiums.instanceMatrix.needsUpdate = true; rings.instanceMatrix.needsUpdate = true; group.add(podiums, rings);
  // Chrome agents (capsules) with deterministic idle bob
  const agGeo = track(new THREE.CapsuleGeometry(0.35, 1.1, 6, 12));
  const agMat = deps.chrome();
  const agents = new THREE.InstancedMesh(agGeo, agMat, nAg);
  const agBase: { x: number; z: number; ph: number }[] = [];
  for (let i = 0; i < nAg; i++) agBase.push({ x: (rng() - 0.5) * B * 0.8, z: (rng() - 0.5) * B * 0.8, ph: rng() * 6.28 });
  group.add(agents);
  // Sleek cars on lanes (instanced), traffic = pure fn of t
  const carGeo = track(new THREE.BoxGeometry(1.1, 0.45, 2.6));
  const carMat = deps.chrome({ obsidian: true });
  const cars = new THREE.InstancedMesh(carGeo, carMat, nCar);
  const carLane: { z: number; speed: number; ph: number }[] = [];
  for (let i = 0; i < nCar; i++) carLane.push({ z: (Math.floor(rng() * 4) - 1.5) * (B / 5), speed: 6 + rng() * 8, ph: rng() * B });
  group.add(cars);
  // Cyber-cats: body capsule + head sphere (two instanced meshes), wander = sin/cos of t
  const catBodyGeo = track(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8));
  const catHeadGeo = track(new THREE.SphereGeometry(0.14, 10, 10));
  const catMat = deps.emissive(0x00e5ff, 0.8);
  const catBodies = new THREE.InstancedMesh(catBodyGeo, catMat, nCat);
  const catHeads = new THREE.InstancedMesh(catHeadGeo, catMat, nCat);
  const catBase: { x: number; z: number; ph: number }[] = [];
  for (let i = 0; i < nCat; i++) catBase.push({ x: (rng() - 0.5) * B * 0.6, z: (rng() - 0.5) * B * 0.6, ph: rng() * 6.28 });
  group.add(catBodies, catHeads);
  // Modular neon shops: box storefront + emissive sign plane
  const shopGeo = track(new THREE.BoxGeometry(3, 2.4, 2.4));
  const shopMat = deps.chrome({ obsidian: true });
  const shops = new THREE.InstancedMesh(shopGeo, shopMat, nShop);
  const signGeo = track(new THREE.PlaneGeometry(2.6, 0.5));
  const signMat = deps.emissive(0xff2d78, 1.8);
  const signs = new THREE.InstancedMesh(signGeo, signMat, nShop);
  for (let i = 0; i < nShop; i++) { const x = (rng() - 0.5) * B * 0.9, z = (rng() < 0.5 ? -1 : 1) * B * 0.45;
    M.compose(P.set(x, 1.2, z), Q.identity(), S.setScalar(1)); shops.setMatrixAt(i, M);
    M.compose(P.set(x, 2.2, z + (z > 0 ? -1.21 : 1.21)), Q.identity(), S.setScalar(1)); signs.setMatrixAt(i, M); }
  shops.instanceMatrix.needsUpdate = true; signs.instanceMatrix.needsUpdate = true; group.add(shops, signs);
  function update(_dt: number, t: number): void {
    (ringMat as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 + 0.8 * Math.sin(t * 2.2);
    (signMat as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + 0.6 * Math.sin(t * 3.1 + 1);
    for (let i = 0; i < nAg; i++) { const a = agBase[i]; const y = 0.95 + 0.08 * Math.sin(t * 2 + a.ph);
      M.compose(P.set(a.x, y, a.z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.4 + a.ph) * 0.4), S.setScalar(1)); agents.setMatrixAt(i, M); }
    agents.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < nCar; i++) { const c = carLane[i]; const x = wrap(t * c.speed + c.ph, B);
      M.compose(P.set(x, 0.35, c.z), Q.identity(), S.setScalar(1)); cars.setMatrixAt(i, M); }
    cars.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < nCat; i++) { const c = catBase[i]; const x = c.x + 1.6 * Math.sin(t * 0.5 + c.ph); const z = c.z + 1.6 * Math.cos(t * 0.4 + c.ph);
      M.compose(P.set(x, 0.28, z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * 0.3 + c.ph), S.setScalar(1)); catBodies.setMatrixAt(i, M);
      M.compose(P.set(x + 0.32 * Math.cos(t * 0.3 + c.ph), 0.5, z - 0.32 * Math.sin(t * 0.3 + c.ph)), Q.identity(), S.setScalar(1)); catHeads.setMatrixAt(i, M); }
    catBodies.instanceMatrix.needsUpdate = true; catHeads.instanceMatrix.needsUpdate = true;
  }
  function dispose(): void { group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); for (const d of disposables) d.dispose(); group.clear(); }
  return { group, counts: { PODIUM: nPod, AGENT: nAg, CAR: nCar, CAT: nCat, SHOP: nShop }, update, dispose };
}
/** Smooth procedural fallback hero entity (sleek capsule + curve) if GLTF assets fail. */
export function createFallbackHeroEntity(chrome: THREE.Material, emissive: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.4, 8, 16), chrome); body.position.y = 1.1; g.add(body);
  const visor = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 10, 32), emissive); visor.position.y = 1.6; visor.rotation.x = Math.PI / 2; g.add(visor);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0.6, 0.8, 0.3), new THREE.Vector3(0.2, 1.6, -0.4)]);
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.05, 8, false), emissive); g.add(ribbon);
  return g;
}
