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

/** Cheap deterministic value-noise (smoothstep-interpolated lattice noise) — the shared building
 * block behind `makeWornSurface`/`makeSurfaceNormalTexture` below. Generalized out of the flagship
 * lab scene's own private copy (previously duplicated nowhere else, but every future consumer of
 * "add real surface variation to a flat PBR material" would otherwise have re-derived this from
 * scratch) so any material-detail generator in this module can share one noise primitive. */
export function valueNoise2D(x: number, y: number, scale: number, seed: number): number {
  const raw = (px: number, py: number): number => {
    const n = Math.sin(px * 12.9898 + py * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  };
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const ease = (t: number): number => t * t * (3 - 2 * t);
  const ex = ease(fx);
  const ey = ease(fy);
  const top = raw(x0, y0) + (raw(x0 + 1, y0) - raw(x0, y0)) * ex;
  const bottom = raw(x0, y0 + 1) + (raw(x0 + 1, y0 + 1) - raw(x0, y0 + 1)) * ex;
  return top + (bottom - top) * ey;
}

export interface WornSurfaceOptions {
  /** Bazowa szorstkość materiału — mapa moduluje ją w górę i w dół. */
  roughness: number;
  /** Siła zabrudzeń/przetarć w albedo (0 = czysto, 1 = mocno zużyte). */
  wear: number;
  /** Pionowe zacieki — charakterystyczne dla metalu w hali przemysłowej. */
  streaks?: boolean;
  /** Ziarno, żeby dwa materiały o tym samym kolorze nie miały identycznego wzoru. */
  seed?: number;
}

/**
 * ALBEDO + ROUGHNESS JEDNEGO MATERIAŁU, wygenerowane razem i SKORELOWANE.
 *
 * To jest sedno różnicy między "proceduralną bryłą" a materiałem: prawdziwa
 * powierzchnia nigdy nie ma jednego koloru ani jednej szorstkości. Ma plamy,
 * przetarcia na krawędziach, osad w zagłębieniach i zacieki. Co ważne, te
 * dwie mapy MUSZĄ być skorelowane — tam, gdzie osiadł brud, powierzchnia jest
 * ciemniejsza I bardziej matowa; tam, gdzie jest wytarta, jaśniejsza I
 * gładsza. Rozjechane mapy czytają się jak naklejka na plastiku.
 *
 * Generujemy jedną teksturę albedo w kolorze bazowym (a nie szarą maskę),
 * więc materiał dostaje `map` zamiast płaskiego `color` — stąd bierze się
 * zróżnicowanie, którego nie da żaden `MeshStandardMaterial({ color })`.
 *
 * Generalized out of the flagship lab scene (where it was proven on painted-metal panels/floors)
 * so any Genesis category needing this same worn-albedo-plus-roughness treatment — the shared
 * palette's ground/exterior categories below included — reuses this exact generator instead of a
 * scene re-deriving its own copy.
 */
export function makeWornSurface(
  THREE: typeof THREE_NS,
  baseColor: number,
  options: WornSurfaceOptions,
): { map: THREE_NS.Texture; roughnessMap: THREE_NS.Texture } {
  const size = 256;
  const seed = options.seed ?? 1;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const albedoCtx = albedoCanvas.getContext('2d')!;
  const roughCtx = roughCanvas.getContext('2d')!;
  const albedo = albedoCtx.createImageData(size, size);
  const rough = roughCtx.createImageData(size, size);

  const baseR = (baseColor >> 16) & 0xff;
  const baseG = (baseColor >> 8) & 0xff;
  const baseB = baseColor & 0xff;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Trzy skale: duże plamy (nierównomierność lakieru/osadu), średnie
      // przetarcia, drobne ziarno. Suma daje wzór bez widocznej powtarzalności.
      const broad = valueNoise2D(x, y, 74, seed);
      const mid = valueNoise2D(x, y, 21, seed + 13);
      const fine = valueNoise2D(x, y, 5, seed + 41);
      let variation = broad * 0.55 + mid * 0.3 + fine * 0.15;

      if (options.streaks) {
        // Zacieki: szum mocno rozciągnięty w pionie, widoczny tylko miejscami.
        const streak = valueNoise2D(x, y * 0.12, 17, seed + 77);
        variation = variation * 0.72 + streak * 0.28;
      }

      // Zużycie jest NIESYMETRYCZNE: brud potrafi przyciemnić powierzchnię
      // mocno, natomiast przetarcie nigdy jej nie rozjaśnia w tym samym
      // stopniu — wypolerowany metal robi się JAŚNIEJSZY W ODBICIU (niższy
      // roughness), a nie jaśniejszy w albedo. Symetryczny tint rozmywał
      // materiały w jasną, mydlaną szarość; ta krzywa trzyma je w tonacji.
      const signed = (variation - 0.5) * 2;
      const tint = 1 + (signed < 0 ? signed * options.wear * 0.5 : signed * options.wear * 0.16);
      // Wytarte miejsca tracą nasycenie (pigment schodzi pierwszy), więc
      // przetarcie ściąga kolor do luminancji zamiast podbijać jego odcień.
      const luma = (baseR * 0.299 + baseG * 0.587 + baseB * 0.114) * tint;
      const desat = Math.max(0, signed) * options.wear * 0.35;
      const mix = (channel: number): number => {
        const tinted = channel * tint;
        return Math.max(0, Math.min(255, tinted + (luma - tinted) * desat));
      };
      const index = (y * size + x) * 4;
      albedo.data[index] = mix(baseR);
      albedo.data[index + 1] = mix(baseG);
      albedo.data[index + 2] = mix(baseB);
      albedo.data[index + 3] = 255;

      // Roughness ODWROTNIE skorelowany z jasnością albedo: ciemniejszy osad
      // = bardziej matowo, jaśniejsze przetarcie = gładziej.
      const roughValue = Math.max(0, Math.min(1, options.roughness + (0.5 - variation) * 0.55 * options.wear));
      const roughByte = roughValue * 255;
      rough.data[index] = roughByte;
      rough.data[index + 1] = roughByte;
      rough.data[index + 2] = roughByte;
      rough.data[index + 3] = 255;
    }
  }
  albedoCtx.putImageData(albedo, 0, 0);
  roughCtx.putImageData(rough, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  return { map, roughnessMap };
}

/**
 * Proceduralna mapa normalnych: drobna, nieregularna falistość powierzchni.
 * Płaskie materiały PBR o stałym roughness czytają się jak plastik, bo światło
 * odbija się od nich idealnie równomiernie. Mikrorelief łamie ten odbłysk i
 * dopiero on sprawia, że lakierowana blacha wygląda jak blacha.
 *
 * Generalized out of the flagship lab scene for the same reason as `makeWornSurface` above — this
 * is the module's one normal-detail generator, reused (via `.clone()` + per-caller `.repeat`,
 * exactly like `brushedMetalFactory`) wherever a Genesis category needs to stop reading as a flat,
 * uniformly-lit primitive.
 */
export function makeSurfaceNormalTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  // Wysokość z sumy dwóch częstotliwości szumu wartościowego, potem gradient
  // liczony różnicami skończonymi -> wektor normalnej zapisany w RGB.
  const height = new Float32Array(size * size);
  const noise = (x: number, y: number, seed: number): number => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  };
  const sampleSmooth = (x: number, y: number, scale: number, seed: number): number => {
    const sx = x / scale;
    const sy = y / scale;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const fx = sx - x0;
    const fy = sy - y0;
    const ease = (t: number): number => t * t * (3 - 2 * t);
    const a = noise(x0, y0, seed);
    const b = noise(x0 + 1, y0, seed);
    const c = noise(x0, y0 + 1, seed);
    const d = noise(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * ease(fx)) + ((c + (d - c) * ease(fx)) - (a + (b - a) * ease(fx))) * ease(fy);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] = sampleSmooth(x, y, 9, 1.7) * 0.65 + sampleSmooth(x, y, 3, 5.1) * 0.35;
    }
  }
  const at = (x: number, y: number): number => height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const nx = -dx * 2.2;
      const ny = -dy * 2.2;
      const nz = 1;
      const length = Math.hypot(nx, ny, nz);
      const index = (y * size + x) * 4;
      image.data[index] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[index + 2] = ((nz / length) * 0.5 + 0.5) * 255;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Returns a `.clone()` of the shared surface-normal-detail texture with its own `.repeat`, so
 * every caller can tile it differently without generating a second canvas — the normal-map
 * counterpart to `brushedMetalFactory`. */
export function surfaceNormalFactory(THREE: typeof THREE_NS): (repeatX: number, repeatY: number) => THREE_NS.Texture {
  const base = makeSurfaceNormalTexture(THREE);
  return (repeatX: number, repeatY: number) => {
    const tex = base.clone();
    tex.needsUpdate = true;
    tex.repeat.set(repeatX, repeatY);
    return tex;
  };
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
 * A vocabulary of material CATEGORIES covering both interior/lab surfaces
 * and exterior/urban ones — generic, with no knowledge of a specific scene
 * or object (no `worktop`, no `amberLed`, no `cityAsphalt`: names describe
 * WHAT KIND of surface something is, not which world it happens to sit in).
 * A world-builder picks a category by what the surface physically IS — a
 * reactor vessel, a handrail, a sidewalk — never by which world it's for;
 * `LAB_FLOOR`/`LAB_WALL` and `ASPHALT`/`CONCRETE`/`BRICK`/`GROUND` sit in the
 * same palette because a future natural-hazard or molecular world is just
 * as likely to need weathered exterior surfaces as the lab is interior ones.
 *
 * Every category except `SCREEN`/`EMISSIVE_INSTRUMENT` is a ready-made,
 * shared instance (`GenesisMaterialPalette`) — one `MeshStandardMaterial`/
 * `MeshPhysicalMaterial` per category, safe to assign to many meshes at
 * once. `SCREEN` is the exception: every screen shows different content
 * (a different `texture`), so it's a FACTORY (`createScreenMaterial`), not
 * a shared instance — see its own comment.
 */
export type GenesisMaterialId =
  | 'SCIENCE_GLASS' | 'BRUSHED_METAL' | 'POLISHED_METAL' | 'TECH_COMPOSITE'
  | 'RUBBER' | 'CERAMIC' | 'PAINTED_METAL' | 'EMISSIVE_INSTRUMENT' | 'LAB_FLOOR' | 'LAB_WALL'
  | 'CONCRETE' | 'ASPHALT' | 'BRICK' | 'GROUND' | 'SCREEN';

/** The statically-shareable categories — everything in `GenesisMaterialId` except `SCREEN` and
 * `EMISSIVE_INSTRUMENT` (both per-instance factories; see `createScreenMaterial`/
 * `createEmissiveInstrumentMaterial`). */
export type StaticGenesisMaterialId = Exclude<GenesisMaterialId, 'SCREEN' | 'EMISSIVE_INSTRUMENT'>;
export type GenesisMaterialPalette = Record<StaticGenesisMaterialId, THREE_NS.Material>;

export interface PBRMaterialOverrides {
  color?: THREE_NS.ColorRepresentation;
}

/**
 * Every category's default tuning as `(THREE, overrides) => Material` — the single source of
 * truth `createGenesisMaterialPalette` (bulk) and `createPBRMaterial` (one at a time) both read
 * from, so the two entry points can never quietly drift apart. Most categories generate their own
 * small detail-texture canvas(es) per call — cheap (one-time 256x256 draws at scene setup, not a
 * per-frame cost) and simpler than threading a shared-texture cache through every builder for a
 * saving that only matters if you call these thousands of times.
 */
const MATERIAL_BUILDERS: {
  [K in StaticGenesisMaterialId]: (THREE: typeof THREE_NS, overrides: PBRMaterialOverrides) => THREE_NS.Material;
} = {
  // Reflective-not-transmissive by default: proven in the flagship hero vessel — transmission
  // blurs everything behind the glass and eats its own silhouette, while opacity+clearcoat gives
  // sharp edge reflections (via three.js's built-in Fresnel response on `clearcoat`, which
  // brightens at grazing angles with no custom shader needed) and a readable outline. Use
  // `createScientificGlass({ transmissive: true })` for a true see-through pane instead.
  SCIENCE_GLASS: (THREE, overrides) => createScientificGlass(THREE, overrides),
  BRUSHED_METAL: (THREE, overrides) => new THREE.MeshStandardMaterial({
    color: overrides.color ?? 0x8a93a6, roughness: 0.32, metalness: 0.9, roughnessMap: brushedMetalFactory(THREE)(3, 3), envMapIntensity: 1.3,
  }),
  POLISHED_METAL: (THREE, overrides) => new THREE.MeshStandardMaterial({
    color: overrides.color ?? 0xc8d4e6, roughness: 0.08, metalness: 1, envMapIntensity: 1.6,
  }),
  // Subtle normal-only detail (no albedo/roughness texture — these are small facility parts, not
  // large tiled surfaces, so a gentle micro-bump is enough to stop reading as injection-molded
  // plastic without fighting the part's own paint/finish color).
  TECH_COMPOSITE: (THREE, overrides) => new THREE.MeshStandardMaterial({
    color: overrides.color ?? 0x2a3350, roughness: 0.72, metalness: 0.08,
    normalMap: surfaceNormalFactory(THREE)(2, 2), normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  RUBBER: (THREE, overrides) => new THREE.MeshStandardMaterial({
    color: overrides.color ?? 0x14181f, roughness: 0.95, metalness: 0,
    normalMap: surfaceNormalFactory(THREE)(2, 2), normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  // Slight clearcoat (glazed-ceramic sheen) — cheap relative to SCIENCE_GLASS's full transmission
  // setup, and reads correctly for lab vials/insulators without looking like plastic.
  CERAMIC: (THREE, overrides) => new THREE.MeshPhysicalMaterial({
    color: overrides.color ?? 0xd8e2ee, roughness: 0.4, metalness: 0.04, clearcoat: 0.15, clearcoatRoughness: 0.3,
    normalMap: surfaceNormalFactory(THREE)(2, 2), normalScale: new THREE.Vector2(0.18, 0.18),
  }),
  // Painted steel: paint hides most of the substrate's metalness (low but nonzero — most
  // industrial paints have a faint metallic fleck), with its own thin glossy clearcoat layer
  // distinct from the bare metal's own roughness.
  PAINTED_METAL: (THREE, overrides) => new THREE.MeshPhysicalMaterial({
    color: overrides.color ?? 0x3a4a68, roughness: 0.45, metalness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.25,
    normalMap: surfaceNormalFactory(THREE)(2, 2), normalScale: new THREE.Vector2(0.25, 0.25),
  }),
  LAB_FLOOR: (THREE, overrides) => new THREE.MeshStandardMaterial({
    color: overrides.color ?? 0x1b2233, roughness: 0.38, metalness: 0.3, roughnessMap: makeFloorNoiseTexture(THREE),
    normalMap: surfaceNormalFactory(THREE)(3, 3), normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  LAB_WALL: (THREE, overrides) => new THREE.MeshStandardMaterial({
    color: overrides.color ?? 0x232c40, roughness: 0.9, metalness: 0.05,
    normalMap: surfaceNormalFactory(THREE)(2, 2), normalScale: new THREE.Vector2(0.22, 0.22),
  }),
  // Exterior/urban categories below — real-world-plausible roughness/metalness for a paved,
  // built environment, proven in the epidemiology city scene before being generalized here.
  //
  // Each now carries a full `makeWornSurface` (correlated albedo+roughness patina) plus a
  // `makeSurfaceNormalTexture` micro-bump, generalized from the flagship lab's own private
  // material-detail generators (see their doc comments above) — the single biggest lever against
  // "flat primitive-looking surfaces" for the ground/wall planes every exterior AND interior scene
  // stands on. The albedo is always baked at this category's OWN default hue (not `overrides.color`)
  // — `overrides.color` instead stays a `MeshStandardMaterial.color` multiply on top, exactly the
  // existing convention every other category in this file uses (`material.color` IS the override,
  // checkable directly), just now modulating a textured pattern instead of a flat fill. A scene
  // loading its own real photographic PBR set (the city/HF street scenes already do, via
  // `loadGovernedTexture`) simply overwrites `.map`/`.normalMap`/`.roughnessMap` afterward — this
  // only upgrades the many other/future consumers of the shared palette that don't.
  CONCRETE: (THREE, overrides) => {
    const worn = makeWornSurface(THREE, 0x87919a, { roughness: 0.86, wear: 0.42, seed: 11 });
    worn.map.repeat.set(4, 4);
    worn.roughnessMap.repeat.set(4, 4);
    return new THREE.MeshStandardMaterial({
      color: overrides.color ?? 0xffffff, map: worn.map, roughnessMap: worn.roughnessMap, metalness: 0.02,
      normalMap: surfaceNormalFactory(THREE)(4, 4), normalScale: new THREE.Vector2(0.5, 0.5),
    });
  },
  ASPHALT: (THREE, overrides) => {
    const worn = makeWornSurface(THREE, 0x2b3034, { roughness: 0.82, wear: 0.36, streaks: true, seed: 23 });
    worn.map.repeat.set(5, 5);
    worn.roughnessMap.repeat.set(5, 5);
    return new THREE.MeshStandardMaterial({
      color: overrides.color ?? 0xffffff, map: worn.map, roughnessMap: worn.roughnessMap, metalness: 0.03,
      normalMap: surfaceNormalFactory(THREE)(5, 5), normalScale: new THREE.Vector2(0.45, 0.45),
    });
  },
  BRICK: (THREE, overrides) => {
    const worn = makeWornSurface(THREE, 0x835a4b, { roughness: 0.8, wear: 0.5, seed: 37 });
    worn.map.repeat.set(3, 3);
    worn.roughnessMap.repeat.set(3, 3);
    return new THREE.MeshStandardMaterial({
      color: overrides.color ?? 0xffffff, map: worn.map, roughnessMap: worn.roughnessMap, metalness: 0.01,
      normalMap: surfaceNormalFactory(THREE)(3, 3), normalScale: new THREE.Vector2(0.55, 0.55),
    });
  },
  // Terrain/foliage-adjacent ground plane — a dark, near-fully-rough green so grass/dirt reads
  // correctly under directional light without any per-blade geometry.
  GROUND: (THREE, overrides) => {
    const worn = makeWornSurface(THREE, 0x42534b, { roughness: 0.96, wear: 0.3, seed: 53 });
    worn.map.repeat.set(4, 4);
    worn.roughnessMap.repeat.set(4, 4);
    return new THREE.MeshStandardMaterial({
      color: overrides.color ?? 0xffffff, map: worn.map, roughnessMap: worn.roughnessMap, metalness: 0.01,
      normalMap: surfaceNormalFactory(THREE)(4, 4), normalScale: new THREE.Vector2(0.35, 0.35),
    });
  },
};

/**
 * Builds one Genesis material by category — the requested `createPBRMaterial(...)` API. Prefer
 * `createGenesisMaterialPalette` when you need several/all categories at once, so every mesh of a
 * given category shares one material instance instead of each getting its own.
 */
export function createPBRMaterial(THREE: typeof THREE_NS, id: StaticGenesisMaterialId, overrides: PBRMaterialOverrides = {}): THREE_NS.Material {
  return MATERIAL_BUILDERS[id](THREE, overrides);
}

/**
 * Builds every statically-shareable Genesis material at once, each tuned with coherent,
 * already-proven metalness/roughness (and clearcoat/transmission where appropriate) — no
 * configuration required for the common case. One instance per scene; share the same instance
 * across every mesh of that category (that's the point — one `BRUSHED_METAL` reads as one
 * coherent metal vocabulary across the whole world, not ten similar-but-different grays).
 *
 * Every returned value is a plain `THREE.MeshStandardMaterial`/`MeshPhysicalMaterial` — there is
 * no bespoke options API for normal-map/detail-map overrides. Need a variant beyond `color`? Treat
 * the result like any other three.js material: `palette.BRUSHED_METAL.clone()` then set
 * `.normalMap` (once you have an assetGovernance-APPROVED texture) or `.roughnessMap` directly.
 * That keeps this factory compact and keeps "does this material accept a normal map" a plain
 * three.js fact instead of something this module has to specially wire through.
 */
export function createGenesisMaterialPalette(THREE: typeof THREE_NS): GenesisMaterialPalette {
  const result = {} as GenesisMaterialPalette;
  for (const id of Object.keys(MATERIAL_BUILDERS) as StaticGenesisMaterialId[]) {
    result[id] = MATERIAL_BUILDERS[id](THREE, {});
  }
  return result;
}

export interface ScientificGlassOptions {
  color?: THREE_NS.ColorRepresentation;
  /** `false` (default) = the reflective hero-object look proven on the flagship vessel
   * (opacity+clearcoat, sharp edge reflections, no refraction cost). `true` = genuinely
   * see-through (an observation window, a partition wall) via real transmission/refraction. */
  transmissive?: boolean;
  /**
   * Wall thickness in meters — feeds `MeshPhysicalMaterial.thickness` (its transmission model's
   * refraction depth) when `transmissive`, and otherwise nudges the reflective variant's opacity
   * slightly denser for a thicker wall. Default 0.01 (1cm — typical labware/vessel wall
   * thickness). This is a look parameter, not a simulated ray-traced thickness.
   */
  thicknessMeters?: number;
  /** Surface micro-roughness — lower reads as more optically perfect/clean glass, higher as worn/
   * etched. Default differs by variant (reflective is cleaner than transmissive by default). */
  roughness?: number;
  /** Index of refraction. Default 1.5 (reflective, close to real borosilicate glass) / 1.4
   * (transmissive — slightly softer refraction bend, reads better for a wide observation pane). */
  ior?: number;
}

/**
 * The canonical Genesis scientific-glass material — reflective hero-object look by default, or a
 * true see-through pane via `transmissive: true`. Kept as one function (not a palette entry)
 * because "reflective" and "transmissive" glass need materially different renderer behavior
 * (`transmission`+`opacity:1` vs `transmission:0`+partial `opacity`) — one shared instance can't
 * be both, so this always returns a fresh instance.
 */
export function createScientificGlass(THREE: typeof THREE_NS, opts: ScientificGlassOptions = {}): THREE_NS.MeshPhysicalMaterial {
  const thickness = opts.thicknessMeters ?? 0.01;
  if (opts.transmissive) {
    return new THREE.MeshPhysicalMaterial({
      color: opts.color ?? 0xbfe4ff, roughness: opts.roughness ?? 0.05, metalness: 0, transmission: 0.9,
      transparent: true, opacity: 0.25, thickness, ior: opts.ior ?? 1.4,
    });
  }
  // Thicker reflective glass reads marginally denser/more tinted — clamped so it never approaches
  // fully opaque (that would stop reading as glass at all).
  const opacity = Math.min(0.45, 0.22 + thickness * 4);
  return new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0xcfe8ff, roughness: opts.roughness ?? 0.03, metalness: 0, transmission: 0, transparent: true,
    opacity, ior: opts.ior ?? 1.5, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false,
  });
}

export interface DoubleWalledGlassOptions extends ScientificGlassOptions {
  /** How much the inner wall's finish differs from the outer — 0 = effectively identical shells,
   * 1 = a strongly frosted/denser inner wall, the pronounced look of a vacuum-jacketed vessel
   * (a Dewar flask, a cryostat). Default 0.4. */
  jacketContrast?: number;
}

export interface DoubleWalledGlassHandles {
  outer: THREE_NS.MeshPhysicalMaterial;
  inner: THREE_NS.MeshPhysicalMaterial;
}

/**
 * A double-wall/vacuum-jacket glass technique: two concentric shells (build the geometry
 * yourself — two cylinders/spheres at slightly different radii) with matched-but-distinct
 * materials, so the pair reads as one insulated vessel rather than two coincidentally similar
 * panes. This is a MATERIAL technique, not geometry — it doesn't know or place the two shells.
 */
export function createDoubleWalledGlass(THREE: typeof THREE_NS, opts: DoubleWalledGlassOptions = {}): DoubleWalledGlassHandles {
  const contrast = Math.max(0, Math.min(1, opts.jacketContrast ?? 0.4));
  const outer = createScientificGlass(THREE, opts);
  const inner = createScientificGlass(THREE, { ...opts, roughness: (opts.roughness ?? (opts.transmissive ? 0.05 : 0.03)) + contrast * 0.12 });
  inner.opacity = Math.min(0.65, inner.opacity + contrast * 0.15);
  inner.clearcoat = Math.max(0, inner.clearcoat - contrast * 0.3);
  return { outer, inner };
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
