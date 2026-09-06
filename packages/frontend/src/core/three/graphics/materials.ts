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

export interface FacilityGeometry {
  boltHead: THREE_NS.CylinderGeometry;
  flange: THREE_NS.CylinderGeometry;
  knob: THREE_NS.CylinderGeometry;
  handWheel: THREE_NS.TorusGeometry;
  gaugeBody: THREE_NS.CylinderGeometry;
  gaugeFace: THREE_NS.CircleGeometry;
  vent: THREE_NS.BoxGeometry;
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

/**
 * GENESIS CANONICAL MATERIAL PALETTE
 * ==================================
 *
 * Ten kategorii pokrywających całe słownictwo materiałowe świata Genesis —
 * generic, bez wiedzy o konkretnej scenie/obiekcie (żaden `worktop`, żaden
 * `amberLed`: nazwy opisują RODZAJ powierzchni, nie to, na czym akurat
 * siedzi w tej hali). World-builder wybiera kategorię wg tego, CZYM fizycznie
 * jest powierzchnia — reaktor, poręcz, panel — nie wg tego, gdzie stoi.
 *
 * Dziewięć z dziesięciu to gotowe, współdzielone instancje (`GenesisMaterialPalette`)
 * — jeden `MeshStandardMaterial`/`MeshPhysicalMaterial` per kategoria, bezpieczny do
 * przypisania wielu mesh'om naraz. `SCREEN` jest wyjątkiem: każdy ekran pokazuje
 * inną treść (inny `texture`), więc jest FABRYKĄ (`createScreenMaterial`), nie
 * współdzieloną instancją — patrz jej komentarz.
 */
export type GenesisMaterialId =
  | 'SCIENCE_GLASS' | 'BRUSHED_METAL' | 'POLISHED_METAL' | 'TECH_COMPOSITE'
  | 'RUBBER' | 'CERAMIC' | 'EMISSIVE_INSTRUMENT' | 'LAB_FLOOR' | 'LAB_WALL' | 'SCREEN';

/** The 9 statically-shareable categories — everything in `GenesisMaterialId` except `SCREEN`
 * (which is a per-instance factory; see `createScreenMaterial`). */
export type GenesisMaterialPalette = Record<Exclude<GenesisMaterialId, 'SCREEN' | 'EMISSIVE_INSTRUMENT'>, THREE_NS.Material>;

/**
 * Builds the 9 statically-shareable Genesis materials, each tuned with coherent, already-proven
 * metalness/roughness (and clearcoat/transmission where appropriate) — no configuration required
 * for the common case. One instance per scene; share the same instance across every mesh of that
 * category (that's the point — one `BRUSHED_METAL` reads as one coherent metal vocabulary across
 * the whole world, not nine similar-but-different grays).
 *
 * Every returned value is a plain `THREE.MeshStandardMaterial`/`MeshPhysicalMaterial` — there is
 * no bespoke options API for color/normal-map/detail-map overrides. Need a variant? Treat the
 * result like any other three.js material: `palette.BRUSHED_METAL.clone()` then set `.color`,
 * `.normalMap` (once you have an assetGovernance-APPROVED texture), or `.roughnessMap` directly.
 * That keeps this factory compact and keeps "does this material accept a normal map" a plain
 * three.js fact instead of something this module has to specially wire through.
 */
export function createGenesisMaterialPalette(THREE: typeof THREE_NS): GenesisMaterialPalette {
  const brushed = brushedMetalFactory(THREE)(3, 3);
  const floorNoise = makeFloorNoiseTexture(THREE);

  return {
    // Reflective-not-transmissive by default: proven in the flagship hero vessel — transmission
    // blurs everything behind the glass and eats its own silhouette, while opacity+clearcoat
    // gives sharp edge reflections and a readable outline. Use `createScienceGlass({ transmissive:
    // true })` below instead of this entry for a true see-through pane (windows, partitions).
    SCIENCE_GLASS: new THREE.MeshPhysicalMaterial({
      color: 0xcfe8ff, roughness: 0.03, metalness: 0, transmission: 0, transparent: true,
      opacity: 0.26, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false,
    }),
    BRUSHED_METAL: new THREE.MeshStandardMaterial({
      color: 0x8a93a6, roughness: 0.32, metalness: 0.9, roughnessMap: brushed, envMapIntensity: 1.3,
    }),
    POLISHED_METAL: new THREE.MeshStandardMaterial({
      color: 0xc8d4e6, roughness: 0.08, metalness: 1, envMapIntensity: 1.6,
    }),
    TECH_COMPOSITE: new THREE.MeshStandardMaterial({
      color: 0x2a3350, roughness: 0.72, metalness: 0.08,
    }),
    RUBBER: new THREE.MeshStandardMaterial({
      color: 0x14181f, roughness: 0.95, metalness: 0,
    }),
    // Slight clearcoat (glazed-ceramic sheen) — cheap relative to SCIENCE_GLASS's full
    // transmission setup, and reads correctly for lab vials/insulators without looking like plastic.
    CERAMIC: new THREE.MeshPhysicalMaterial({
      color: 0xd8e2ee, roughness: 0.4, metalness: 0.04, clearcoat: 0.15, clearcoatRoughness: 0.3,
    }),
    LAB_FLOOR: new THREE.MeshStandardMaterial({
      color: 0x1b2233, roughness: 0.38, metalness: 0.3, roughnessMap: floorNoise,
    }),
    LAB_WALL: new THREE.MeshStandardMaterial({
      color: 0x232c40, roughness: 0.9, metalness: 0.05,
    }),
  };
}

/**
 * SCIENCE_GLASS variant generator — the palette's `SCIENCE_GLASS` entry is the reflective, hero-
 * object look; call this instead when a specific pane needs to be genuinely see-through (an
 * observation window, a partition wall). Kept as a separate function rather than a palette entry
 * because "reflective" and "transmissive" glass need materially different renderer behavior
 * (`transmission`+`opacity:1` vs `transmission:0`+partial `opacity`) — one shared instance can't
 * be both.
 */
export function createScienceGlass(THREE: typeof THREE_NS, opts: { transmissive?: boolean; color?: THREE_NS.ColorRepresentation } = {}): THREE_NS.MeshPhysicalMaterial {
  if (opts.transmissive) {
    return new THREE.MeshPhysicalMaterial({
      color: opts.color ?? 0xbfe4ff, roughness: 0.05, metalness: 0, transmission: 0.9,
      transparent: true, opacity: 0.25, thickness: 0.1, ior: 1.4,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0xcfe8ff, roughness: 0.03, metalness: 0, transmission: 0, transparent: true,
    opacity: 0.26, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false,
  });
}

/**
 * EMISSIVE_INSTRUMENT factory — status LEDs, indicator strips, and instrument readouts each need
 * their own color/intensity (amber alarm vs. cyan "nominal" vs. a strip tinted by real scientific
 * state), so unlike the other 9 categories this is a factory, not a shared instance. Coherent
 * defaults: dark base color (so the emissive color reads as the ONLY light source on the part,
 * not a lit-up colored plastic), `MeshStandardMaterial` (not `MeshBasicMaterial`) so it still
 * receives ambient/IBL shading on its non-emissive faces.
 */
export function createEmissiveInstrumentMaterial(
  THREE: typeof THREE_NS,
  opts: { color: THREE_NS.ColorRepresentation; intensity?: number; baseColor?: THREE_NS.ColorRepresentation },
): THREE_NS.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: opts.baseColor ?? 0x0e1220, emissive: opts.color, emissiveIntensity: opts.intensity ?? 0.8, roughness: 0.4,
  });
}

/**
 * SCREEN factory — wires a live canvas/video texture into both `map` and `emissiveMap` so the
 * screen reads as genuinely self-lit content (not a lit photo of a screen), the same pattern
 * proven on the lab's monitor readout. Each screen owns its own texture, so this can't be a
 * shared palette instance — call it once per screen mesh.
 */
export function createScreenMaterial(
  THREE: typeof THREE_NS,
  texture: THREE_NS.Texture,
  opts: { tint?: THREE_NS.ColorRepresentation; emissiveIntensity?: number } = {},
): THREE_NS.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: opts.tint ?? 0x3fc7ff, emissiveIntensity: opts.emissiveIntensity ?? 0.15,
    emissiveMap: texture, map: texture, roughness: 0.3,
  });
}
