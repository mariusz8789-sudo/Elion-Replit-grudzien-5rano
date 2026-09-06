import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Materials
 *
 * Współdzielona biblioteka materiałów PBR + generatory tekstur proceduralnych
 * (canvas, zero nowych plików/assetów — patrz assetGovernance.ts: każdy nowy
 * plik graficzny wymaga wpisu z prowenancją, więc detal materiału robimy
 * proceduralnie, tak jak dotychczas). Wydzielone z labScene3D.ts, żeby każdy
 * kolejny konsument (facilityKit/apparatus, przyszłe sceny Sim3D) reużywał
 * DOKŁADNIE te same materiały zamiast duplikować definicje.
 */

/** Tani, deterministyczny generator liczb pseudolosowych (mulberry32) — teksturom proceduralnym
 * nie wolno migotać między przebudowami sceny (StrictMode / hot reload), więc Math.random() jest
 * zastąpiony ziarnem stałym per-texture. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Teksturę "szczotkowanego metalu" generujemy proceduralnie — tysiące cienkich,
 * poziomych pasm o losowej jasności dają anizotropowe rozproszenie światła
 * zamiast płaskiego, jednolitego koloru PBR. Reużywana jako roughnessMap na
 * kilku metalowych materiałach (różne .repeat na klonach), więc jeden canvas wystarcza.
 */
export function makeBrushedMetalTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(0x5a1e4d);
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const y = rand() * size;
    const shade = 90 + rand() * 110;
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.04 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Returns a `.clone()` of the shared brushed-metal texture with its own `.repeat`, so every
 * caller can tile it differently without generating a second canvas. */
export function brushedMetalFactory(THREE: typeof THREE_NS): (repeatX: number, repeatY: number) => THREE_NS.Texture {
  const base = makeBrushedMetalTexture(THREE);
  return (repeatX: number, repeatY: number) => {
    const tex = base.clone();
    tex.needsUpdate = true;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  };
}

/** Drobny szum kropkowy — "polerowany beton" na podłodze, ta sama zasada co szczotkowany metal. */
export function makeFloorNoiseTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(0x2f6a11);
  ctx.fillStyle = '#3a4258';
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const speck = rand() < 0.12 ? (rand() * 40 - 20) : (rand() * 14 - 7);
    image.data[i] = Math.max(0, Math.min(255, image.data[i]! + speck));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1]! + speck));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2]! + speck));
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Miękki "contact shadow" — radialny gradient (czarny środek -> przezroczyste
 * brzegi) nakładany tuż nad podłogą pod ciężkim sprzętem. Mapa cieni z
 * reflektora modeluje bryłę, ale styk z podłożem musi być czytelny ZAWSZE,
 * niezależnie od tego, ile światła wypełniającego pada akurat w to miejsce —
 * bez tego sprzęt wizualnie "unosi się" nad posadzką.
 */
export function makeContactShadowTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.36)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Canvas + texture for a live readout surface (monitor screens, HUD panels) — content is drawn by the caller. */
export function makeReadoutSurface(THREE: typeof THREE_NS, width = 256, height = 176): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE_NS.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, texture };
}

/** Shared facility-wide material palette — every parametric component (facilityKit, apparatus) reads from this,
 * so the whole world reads as one coherent engineering language instead of per-object one-off colors. */
export interface FacilityMaterials {
  steel: THREE_NS.MeshStandardMaterial;
  darkSteel: THREE_NS.MeshStandardMaterial;
  chrome: THREE_NS.MeshStandardMaterial;
  worktop: THREE_NS.MeshStandardMaterial;
  plastic: THREE_NS.MeshStandardMaterial;
  rubber: THREE_NS.MeshStandardMaterial;
  ceramic: THREE_NS.MeshStandardMaterial;
  copper: THREE_NS.MeshStandardMaterial;
  display: THREE_NS.MeshStandardMaterial;
  amberLed: THREE_NS.MeshStandardMaterial;
  panelGlass: THREE_NS.MeshPhysicalMaterial;
}

export interface FacilityGeometry {
  boltHead: THREE_NS.CylinderGeometry;
  flange: THREE_NS.CylinderGeometry;
  knob: THREE_NS.CylinderGeometry;
  handWheel: THREE_NS.TorusGeometry;
  gaugeBody: THREE_NS.CylinderGeometry;
  gaugeFace: THREE_NS.CircleGeometry;
  vent: THREE_NS.BoxGeometry;
}

/** Builds the shared PBR palette used across the whole facility — one instance per scene, cloned
 * only where a caller needs an independent `.repeat`/`.opacity`. */
export function createFacilityMaterials(
  THREE: typeof THREE_NS,
  brushedFor: (repeatX: number, repeatY: number) => THREE_NS.Texture,
): FacilityMaterials {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.32, metalness: 0.92, roughnessMap: brushedFor(3, 3) }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.5, metalness: 0.75, roughnessMap: brushedFor(2, 2) }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc8d4e6, roughness: 0.08, metalness: 1, envMapIntensity: 1.6 }),
    worktop: new THREE.MeshStandardMaterial({ color: 0x22283a, roughness: 0.62, metalness: 0.15 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.78, metalness: 0.05 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.95, metalness: 0 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xd8e2ee, roughness: 0.42, metalness: 0.04 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb87a4a, roughness: 0.3, metalness: 0.95 }),
    display: new THREE.MeshStandardMaterial({ color: 0x0d2233, emissive: 0x3fc7ff, emissiveIntensity: 0.55, roughness: 0.24 }),
    amberLed: new THREE.MeshStandardMaterial({ color: 0x100c06, emissive: 0xffb545, emissiveIntensity: 1.1, roughness: 0.4 }),
    panelGlass: new THREE.MeshPhysicalMaterial({ color: 0x9fc4e8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 1.8, depthWrite: false }),
  };
}

/** Small, cheap primitive geometries reused (via InstancedMesh where the count is high) by every
 * facility component that needs a bolt/flange/knob/gauge/handwheel/vent — one allocation per scene. */
export function createFacilityGeometry(THREE: typeof THREE_NS): FacilityGeometry {
  return {
    boltHead: new THREE.CylinderGeometry(0.018, 0.018, 0.022, 6),
    flange: new THREE.CylinderGeometry(0.062, 0.062, 0.026, 14),
    knob: new THREE.CylinderGeometry(0.022, 0.026, 0.03, 10),
    handWheel: new THREE.TorusGeometry(0.055, 0.011, 6, 14),
    gaugeBody: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14),
    gaugeFace: new THREE.CircleGeometry(0.037, 14),
    vent: new THREE.BoxGeometry(0.3, 0.012, 0.012),
  };
}

/** Emissive LED-strip materials (the light-strip language woven through the facility's structure)
 * and the contact-shadow decal texture — kept separate from the PBR palette since these are
 * MeshBasic "always-lit" accents rather than physically-lit surfaces. */
export interface FacilityAccents {
  stripCyan: THREE_NS.MeshBasicMaterial;
  stripWarm: THREE_NS.MeshBasicMaterial;
  stripDim: THREE_NS.MeshBasicMaterial;
  contactShadowTexture: THREE_NS.Texture;
}

export function createFacilityAccents(THREE: typeof THREE_NS): FacilityAccents {
  return {
    stripCyan: new THREE.MeshBasicMaterial({ color: 0x74e4ff, transparent: true, opacity: 0.92 }),
    stripWarm: new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8 }),
    stripDim: new THREE.MeshBasicMaterial({ color: 0x3f9fd4, transparent: true, opacity: 0.6 }),
    contactShadowTexture: makeContactShadowTexture(THREE),
  };
}
