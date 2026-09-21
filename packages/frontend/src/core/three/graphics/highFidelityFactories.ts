import type * as THREE_NS from 'three';
import { createFacadeBuilding, createIndustrialBuilding } from './buildingKit';
import { createBench, createCabinet, createMonitor } from './labKit';
import { createPump, createStorageTank, createPipeNetwork } from './waterInfrastructure';
import { createRoadMarkings, createSidewalk } from './streetKit';
import { createWaterSurface } from './water';
import { createAtomSphere, createBond } from './moleculeKit';
import { createPBRMaterial } from './materials';
import type { HighFidelityMaterialPalette } from './highFidelityMaterialRegistry';

export interface HighFidelityFactoryContext {
  palette: HighFidelityMaterialPalette;
  seed: number;
  label: string;
  year?: number;
}

function seedHash(seed: number, salt: number): number {
  let x = (seed ^ salt) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return x >>> 0;
}

function addShadow(mesh: THREE_NS.Object3D): void {
  mesh.traverse((node) => {
    const object = node as THREE_NS.Mesh;
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}


export function createHighFidelityMRI(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group(); g.name = 'hf-mri-scanner';
  const { palette: p } = context;
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 1.05, 96, 1, true), p.medical);
  housing.rotation.z = Math.PI / 2; housing.position.y = 1.18; g.add(housing);
  const frontRing = new THREE.Mesh(new THREE.TorusGeometry(0.94, 0.13, 28, 96), p.chrome);
  frontRing.rotation.y = Math.PI / 2; frontRing.position.set(0, 1.18, 0.52); g.add(frontRing);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.24, 96, 1, true), p.dark);
  inner.rotation.z = Math.PI / 2; inner.position.set(0, 1.18, 0.62); g.add(inner);
  const tunnelGlow = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.035, 12, 96), p.blueGlow);
  tunnelGlow.rotation.y = Math.PI / 2; tunnelGlow.position.set(0, 1.18, 0.7); g.add(tunnelGlow);
  const bedBase = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.24, 2.8), p.dark); bedBase.position.set(0, 0.35, 0.48); g.add(bedBase);
  const bedPad = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.11, 2.45), p.white); bedPad.position.set(0, 0.53, 0.48); g.add(bedPad);
  const headRest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.42), p.medical); headRest.position.set(0, 0.64, 0.94); g.add(headRest);
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 2.35), p.chrome); rail.position.set(side * 0.43, 0.64, 0.48); g.add(rail);
  }
  for (let i = -2; i <= 2; i += 1) {
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), p.blueGlow);
    screen.position.set(i * 0.42, 1.98, -0.15); screen.rotation.x = -0.2; g.add(screen);
  }
  const cable = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.018, 8, 48), p.stainless); cable.rotation.x = Math.PI / 2; cable.position.set(0.76, 1.14, 0.22); g.add(cable);
  addShadow(g); return g;
}

export function createHighFidelityHospital(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = createFacadeBuilding(THREE, {
    position: [0, 0, 0], width: 8.2, depth: 6.8, height: 6.6, seed: context.seed,
    wallMaterial: context.palette.white, windowMaterial: context.palette.glass, roofMaterial: context.palette.stainless, rooftopEquipment: true,
  });
  const entry = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.5, 0.32), context.palette.glass); entry.position.set(0, 1.25, 3.42); g.add(entry);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.05), context.palette.redGlow); crossH.position.set(0, 4.65, 3.48); g.add(crossH);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.05), context.palette.redGlow); crossV.position.set(0, 4.65, 3.48); g.add(crossV);
  return g;
}

export function createHighFidelityLaboratory(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group(); const p = context.palette;
  g.add(createBench(THREE, { position: [0, 0, 0], width: 2.8, depth: 0.9, height: 0.86, topMaterial: p.white, legMaterial: p.stainless }));
  g.add(createCabinet(THREE, { position: [1.65, 0, -0.18], width: 0.58, depth: 0.5, height: 1.9, bodyMaterial: p.medical }));
  g.add(createMonitor(THREE, { position: [-0.65, 0.86, -0.24], width: 1.0, height: 0.56, frameMaterial: p.stainless }));
  for (let i = -1; i <= 1; i += 1) {
    const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.28, 24, 1, true), p.glass);
    beaker.position.set(i * 0.46, 1.04, 0.04); g.add(beaker);
    const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.10, 24), p.blueGlow); fluid.position.set(i * 0.46, 0.98, 0.04); g.add(fluid);
  }
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.65, 0.72), p.glass); hood.position.set(0, 0.84, -0.86); g.add(hood);
  return g;
}

export function createHighFidelityFactory(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const p = context.palette; const g = createIndustrialBuilding(THREE, { position: [0, 0, 0], width: 7.2, depth: 5.8, seed: context.seed, kind: 'industrial', wallMaterial: p.dark, roofMaterial: p.stainless });
  g.add(createPump(THREE, { position: [-1.8, 0, 0], housingMaterial: p.stainless, pipeMaterial: p.chrome, state: 'NORMAL' }).group);
  g.add(createStorageTank(THREE, { position: [0, 0, -0.2], radius: 0.82, height: 2.2, bodyMaterial: p.stainless }));
  g.add(createPipeNetwork(THREE, { waypoints: [[-2.0, 0.72, 0], [-0.6, 0.92, 0], [0.3, 1.2, -0.2], [2.0, 1.2, -0.2]], radius: 0.055, material: p.chrome }));
  for (let i = 0; i < 3; i += 1) {
    const warning = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.12), p.redGlow); warning.position.set(-2.1 + i * 1.2, 2.6, 1.2); g.add(warning);
  }
  return g;
}

export function createHighFidelityWastewater(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group(); const p = context.palette;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.72, 0.7, 64), p.concrete); tank.position.y = 0.35; g.add(tank);
  const water = createWaterSurface(THREE, { width: 2.95, depth: 2.95, transmissive: false, flowSpeed: [0.03, 0.02] }).mesh; water.rotation.x = 0; water.position.y = 0.72; g.add(water);
  for (let i = 0; i < 6; i += 1) {
    const theta = (Math.PI * 2 * i) / 6;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), p.stainless);
    rail.position.set(Math.cos(theta) * 1.55, 0.75, Math.sin(theta) * 1.55); g.add(rail);
  }
  g.add(createPump(THREE, { position: [-3.1, 0, 0], housingMaterial: p.stainless, pipeMaterial: p.chrome, state: 'NORMAL' }).group);
  return g;
}

export function createHistoricalStreet(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const p = context.palette; const g = new THREE.Group();
  const road = new THREE.Mesh(new THREE.BoxGeometry(18, 0.16, 7), p.asphalt); road.position.y = 0.08; g.add(road);
  g.add(createRoadMarkings(THREE, { from: [0, 0.17, -3.2], to: [0, 0.17, 3.2], dashLength: 0.65, gapLength: 0.85, width: 0.06, material: p.white }));
  g.add(createSidewalk(THREE, { from: [-8.5, 0, -2.8], to: [8.5, 0, -2.8], width: 1.2, surfaceMaterial: p.concrete }));
  g.add(createSidewalk(THREE, { from: [-8.5, 0, 2.8], to: [8.5, 0, 2.8], width: 1.2, surfaceMaterial: p.concrete }));
  const facadeColors = [0xb66a52, 0x8f745f, 0xa78d74, 0x7e6960];
  for (let i = 0; i < 6; i += 1) {
    const side = i % 2 === 0 ? -1 : 1; const x = -6.2 + Math.floor(i / 2) * 2.5;
    const building = createFacadeBuilding(THREE, { position: [x, 0, side * 4.4], width: 2.15, depth: 1.55, height: 4.3 + (i % 3) * 0.8, seed: seedHash(context.seed, i), wallMaterial: createPBRMaterial(THREE, 'BUILDING_FACADE', { color: facadeColors[i % facadeColors.length] }), windowMaterial: p.glass, roofMaterial: p.brick, rooftopEquipment: false });
    g.add(building);
  }
  for (let i = -7; i <= 7; i += 2) {
    const lamp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.2, 12), p.stainless); post.position.y = 1.1; lamp.add(post);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), p.blueGlow); glow.position.y = 2.2; lamp.add(glow);
    lamp.position.set(i, 0, i % 4 === 0 ? -2.1 : 2.1); g.add(lamp);
  }
  return g;
}

export function createHighFidelityForest(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group(); const p = context.palette;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(10, 64), p.ground); ground.rotation.x = -Math.PI / 2; g.add(ground);
  for (let i = 0; i < 50; i += 1) {
    const r = 1.5 + (seedHash(context.seed, i) % 900) / 100;
    const theta = ((seedHash(context.seed, i + 100) % 1000) / 1000) * Math.PI * 2;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.7 + (i % 5) * 0.1, 10), p.brick); trunk.position.y = 0.35; tree.add(trunk);
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + (i % 4) * 0.06, 1), p.foliage); canopy.position.y = 1.0 + (i % 3) * 0.05; tree.add(canopy);
    tree.position.set(Math.cos(theta) * r, 0, Math.sin(theta) * r); g.add(tree);
  }
  return g;
}

export function createHighFidelityCell(THREE: typeof THREE_NS, _context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group();
  const membrane = new THREE.MeshPhysicalMaterial({ color: 0xb85fff, roughness: 0.2, transmission: 0.28, transparent: true, opacity: 0.55, thickness: 0.4, ior: 1.36 });
  const nucleusMat = new THREE.MeshPhysicalMaterial({ color: 0x3c4fd9, roughness: 0.22, transmission: 0.18, clearcoat: 0.65, emissive: 0x2436a8, emissiveIntensity: 0.2 });
  const organelleMat = new THREE.MeshStandardMaterial({ color: 0xff8bc6, roughness: 0.4, metalness: 0.05 });
  const cell = new THREE.Mesh(new THREE.SphereGeometry(1.65, 64, 48), membrane); g.add(cell);
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.68, 48, 36), nucleusMat); nucleus.position.set(0.15, 0.12, 0.05); g.add(nucleus);
  for (let i = 0; i < 22; i += 1) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / 22); const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = 0.9 + (i % 5) * 0.06;
    const organelle = new THREE.Mesh(new THREE.SphereGeometry(0.09 + (i % 3) * 0.02, 16, 12), organelleMat);
    organelle.position.set(Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r); g.add(organelle);
  }
  return g;
}

export function createHighFidelityDNA(THREE: typeof THREE_NS, _context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group(); const a = createPBRMaterial(THREE, 'TECH_COMPOSITE', { color: 0x62b4ff }); const b = createPBRMaterial(THREE, 'TECH_COMPOSITE', { color: 0xff6c93 });
  const bond = createPBRMaterial(THREE, 'POLISHED_METAL', { color: 0xe9f3ff });
  const pa: THREE_NS.Vector3[] = []; const pb: THREE_NS.Vector3[] = [];
  const segments = 52;
  for (let i = 0; i < segments; i += 1) {
    const t = i / (segments - 1); const y = (t - 0.5) * 7.2; const angle = t * Math.PI * 7.2; const radius = 0.64;
    const A = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius); const B = new THREE.Vector3(-A.x, y, -A.z); pa.push(A); pb.push(B);
    if (i % 2 === 0) g.add(createBond(THREE, { from: A.toArray(), to: B.toArray(), order: 1, material: bond }));
  }
  const ca = new THREE.CatmullRomCurve3(pa); const cb = new THREE.CatmullRomCurve3(pb);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(ca, 260, 0.04, 12, false), a));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(cb, 260, 0.04, 12, false), b));
  return g;
}

export function createHighFidelityVirus(THREE: typeof THREE_NS, _context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0x68c9ff, roughness: 0.22, transmission: 0.18, transparent: true, opacity: 0.82, clearcoat: 0.7 });
  const spike = new THREE.MeshPhysicalMaterial({ color: 0xff6f8f, roughness: 0.36, metalness: 0.08, clearcoat: 0.6 });
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 3), shell));
  const spikeCount = 64;
  for (let i = 0; i < spikeCount; i += 1) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / spikeCount); const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.35, 12), spike);
    mesh.position.copy(dir.clone().multiplyScalar(1.1)); mesh.lookAt(dir.clone().multiplyScalar(1.9)); mesh.rotateX(Math.PI / 2); g.add(mesh);
  }
  return g;
}

export function createHighFidelityMolecule(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group(); const atoms: Array<{ element: string; pos: [number, number, number] }> = [
    { element: 'C', pos: [-0.78, 0, 0] }, { element: 'C', pos: [0.78, 0, 0] }, { element: 'O', pos: [1.55, 0.75, 0] },
    { element: 'N', pos: [-1.5, 0.72, 0.18] }, { element: 'H', pos: [-0.72, -0.96, 0.58] },
  ];
  for (const atom of atoms) { const mesh = createAtomSphere(THREE, { element: atom.element }); mesh.position.set(...atom.pos); g.add(mesh); }
  const bondMat = context.palette.chrome;
  for (const [a, b] of [[0,1],[1,2],[0,3],[0,4]] as const) g.add(createBond(THREE, { from: atoms[a]!.pos, to: atoms[b]!.pos, order: 1, material: bondMat }));
  return g;
}

export function createHighFidelityPlanet(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const name = context.label.toLowerCase();
  const g = new THREE.Group();
  const isMars = name.includes('mars'); const isMoon = name.includes('moon') || name.includes('księżyc') || name.includes('ksiezyc'); const isEarth = name.includes('earth') || name.includes('ziemia'); const isSun = name.includes('sun') || name.includes('słońce') || name.includes('slonce');
  const color = isMars ? 0x9a4e37 : isMoon ? 0x969da8 : isEarth ? 0x3167a9 : isSun ? 0xf9c46b : 0x8a8f99;
  const radius = isSun ? 2.1 : isEarth ? 1.35 : 1.0;
  const material = new THREE.MeshPhysicalMaterial({ color, roughness: isSun ? 0.45 : 0.75, emissive: isSun ? 0x8f4d09 : 0x000000, emissiveIntensity: isSun ? 1.1 : 0 });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), material));
  if (name.includes('saturn')) { const ringMat = new THREE.MeshStandardMaterial({ color: 0xc8b89c, roughness: 0.8, transparent: true, opacity: 0.78 }); const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.15, 128), ringMat); ring.rotation.x = Math.PI / 2.5; g.add(ring); }
  if (isMars) { const dust = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.01, 64, 48), new THREE.MeshPhysicalMaterial({ color: 0xc4664d, roughness: 0.86, transparent: true, opacity: 0.06 })); g.add(dust); }
  return g;
}

export function createMarsBase(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const g = new THREE.Group(); const p = context.palette;
  const foundation = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.35, 64), p.dark); foundation.position.y = 0.18; g.add(foundation);
  for (let i = 0; i < 4; i += 1) { const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 1.6, 48), p.medical); pod.position.set(-1.5 + i, 0.95, 0); g.add(pod); }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.65, 64, 40, 0, Math.PI * 2, 0, Math.PI / 2), p.glass); dome.position.y = 1.55; g.add(dome);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.8, 16), p.stainless); mast.position.set(2.2, 1.4, -0.7); g.add(mast);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), p.redGlow); beacon.position.set(2.2, 2.85, -0.7); g.add(beacon);
  return g;
}

export function createMarsRover(THREE: typeof THREE_NS, context: HighFidelityFactoryContext): THREE_NS.Group {
  const p = context.palette; const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.96), p.medical); body.position.y = 0.62; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.65), p.glass); cabin.position.set(0.1, 0.95, 0); g.add(cabin);
  const wheels = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 24);
  for (const x of [-0.58, 0.58] as const) for (const z of [-0.39, 0.39] as const) { const w = new THREE.Mesh(wheels, p.dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, z); g.add(w); }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.9, 16), p.stainless); mast.position.set(0, 1.55, 0); g.add(mast);
  const camera = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.12), p.blueGlow); camera.position.set(0, 1.98, 0); g.add(camera);
  return g;
}

export function createSpaceField(THREE: typeof THREE_NS, _context: HighFidelityFactoryContext): THREE_NS.Points {
  const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i += 1) { positions[i*3] = ((i * 97) % 800) / 10 - 40; positions[i*3+1] = ((i * 53) % 500) / 10 - 25; positions[i*3+2] = ((i * 71) % 900) / 10 - 45; }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xcce9ff, size: 0.022, sizeAttenuation: true });
  return new THREE.Points(geometry, material);
}
