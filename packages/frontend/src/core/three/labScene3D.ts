import type * as THREE_NS from 'three';
import type { Sim3D, PostProcessingModules, PostProcessor } from './types';
import type { SimParams } from '../types';
import { FirstPersonController, type MoveKey } from './firstPersonController';
import { CameraFlight, flightBetween } from '../reality/cameraSequencer';
import type { HospitalStatus } from '../simulation/hospitalResource';
import type { ScenarioDaySample } from '../simulation/scenarioEngine';
import { configureDOF, setupGraphicsPipeline, type GraphicsPipeline } from './graphics/postProcessing';
import { configureCinematicCamera, type CinematicCameraProfile } from './graphics/cinematicCamera';
import { applyShadowPolicy } from './graphics/shadowPolicy';
import { disposeSceneResources } from './graphics/lifecycle';
import { createDustMotes, createLightShaft, type DustMotesHandle } from './graphics/atmosphere';
import { detectRenderTier, tierAllowsAtmosphereParticles, atmosphereParticleCount } from './quality';
import type { CameraIntent } from './graphics/cameraRig';
// GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 1.0: reusable kits, actually wired into this
// production scene's STREFA E (not just proven in an isolated graphics/examples/*.ts file).
import { createBench, createCabinet, createShelfUnit, createMonitor } from './graphics/labKit';
import { createPump, createValve, createPipeNetwork } from './graphics/waterInfrastructure';

/**
 * FIRST-PERSON LAB SCENE — czysta WARSTWA PREZENTACJI (Sim3D). Nigdy nie
 * liczy prawdy naukowej: przyjmuje gotowe, już policzone `ScenarioDaySample[]`
 * (patrz core/experimentFabric/labSession.ts, które woła istniejący
 * Scenario Engine) i wyłącznie POKAZUJE dzień po dniu realne
 * `sample.hospital.bedOccupancy/icuOccupancy/status` na naczyniu na
 * stanowisku. Kamera pierwszoosobowa (core/three/firstPersonController.ts,
 * czysta matematyka) i loty kinowe (core/reality/cameraSequencer.ts,
 * istniejące, niezmienione) to jedyne dwa systemy ruchu kamery — ta klasa
 * tylko je składa i stosuje do prawdziwej kamery WebGL.
 *
 * Reakcja kamery na przekroczenie CRITICAL jest WYŁĄCZNIE odczytem
 * `sample.hospital.status` dostarczonego przez wywołującego — scena nigdy
 * nie decyduje sama, kiedy coś jest "dramatyczne".
 */

export type LabCameraPhase = 'FREE' | 'FLIGHT' | 'FIXED';
export type LabFixedKind = 'NONE' | 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY' | 'WIDE';
export type LabPlayTag = 'NONE' | 'A' | 'B' | 'REPLAY';

// Sala powiększona i asymetryczna: naczynie zostaje na środku (STATION_OBSTACLE
// bez zmian), ale wokół niej mieści się teraz antresola, druga wieża
// zbiornika, szereg szaf aparaturowych i przeszklona ścianka — nie tylko
// cztery ściany wokół jednego cylindra.
const ROOM = { minX: -6, maxX: 6, minZ: -5, maxZ: 4.5 };
const STATION_OBSTACLE = { minX: -0.95, maxX: 0.95, minZ: -0.95, maxZ: 0.95 };
const CONSOLE_POSITION: THREE_NS.Vector3Tuple = [0, 0.55, 0.75];
// Naczynie powiększone do skali centralnej aparatury laboratoryjnej — spód
// opiera się dokładnie na podeście (y=0.15), środek podniesiony proporcjonalnie.
const VESSEL_POSITION: THREE_NS.Vector3Tuple = [0, 1.1, -0.2];
const VESSEL_HALF_HEIGHT = 0.95;
const VESSEL_MAX_FILL_HEIGHT = 1.87;
const INTERACT_MAX_DISTANCE = 1.85;
const INTERACT_MIN_FACING_DOT = 0.45;
const DAYS_PER_SECOND = 10;

const STATUS_COLOR: Record<HospitalStatus, number> = {
  NORMAL: 0x3fa9f5,
  WARNING: 0xf0c542,
  HIGH: 0xf5943f,
  CRITICAL: 0xf24444,
};

function statusCode(status: HospitalStatus | 'IDLE'): number {
  if (status === 'IDLE' || status === 'NORMAL') return 0;
  if (status === 'WARNING') return 1;
  if (status === 'HIGH') return 2;
  return 3;
}

function phaseCode(phase: LabCameraPhase): number {
  return phase === 'FREE' ? 0 : phase === 'FLIGHT' ? 1 : 2;
}

function fixedKindCode(kind: LabFixedKind): number {
  if (kind === 'NONE') return 0;
  if (kind === 'SCIENTIFIC') return 1;
  if (kind === 'ANOMALY') return 2;
  if (kind === 'REPLAY') return 3;
  return 4;
}

function tagCode(tag: LabPlayTag): number {
  return tag === 'NONE' ? 0 : tag === 'A' ? 1 : tag === 'B' ? 2 : 3;
}

/**
 * Ramka kamery [pozycja, lookAt] u wskazanego "wachlarzowego" widoku instrumentu.
 * Odsunięte na tyle, by w kadrze mieściła się cała powiększona aparatura
 * (naczynie + rama + pierścień holograficzny nad nią), nie tylko jej fragment.
 */
function scientificFraming(kind: 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY' | 'WIDE'): { position: [number, number, number]; lookAt: [number, number, number] } {
  const lookAt: [number, number, number] = [VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.5, VESSEL_POSITION[2]];
  if (kind === 'ANOMALY') return { position: [1.5, 1.9, 1.7], lookAt };
  if (kind === 'REPLAY') return { position: [-2.0, 2.5, 2.6], lookAt };
  // WIDE: kadr otwierający — musi faktycznie objąć całą halę (kratownica
  // sufitowa, stoły i szafy pod ścianami, butle gazowe, antresola, druga
  // wieża), nie tylko naczynie z bliska. Poprzednia pozycja (odległość
  // ~4.6 m przy FOV 50°) kadrowała ułamek 12x9,5 m hali — stąd wrażenie
  // pustego pokoju mimo gęstej zabudowy: sprzęt istniał, ale nigdy nie
  // wchodził w kadr. Podniesiony róg hali, spojrzenie po przekątnej.
  if (kind === 'WIDE') return { position: [3.42, 1.72, 3.62], lookAt: [-0.22, 2.15, -1.15] };
  return { position: [2.2, 2.3, 3.0], lookAt };
}

/**
 * Teksturę "szczotkowanego metalu" generujemy proceduralnie (canvas, bez
 * żadnego pliku/asseta) — tysiące cienkich, poziomych pasm o losowej
 * jasności dają anizotropowe rozproszenie światła zamiast płaskiego,
 * jednolitego koloru PBR. Reużywana jako roughnessMap na kilku metalowych
 * materiałach (różne .repeat na klonach), więc jeden canvas wystarcza.
 */
function makeBrushedMetalTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * size;
    const shade = 90 + Math.random() * 110;
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.04 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Drobny szum kropkowy — "polerowany beton" na podłodze, ta sama zasada co szczotkowany metal. */
function makeFloorNoiseTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a4258';
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const speck = Math.random() < 0.12 ? (Math.random() * 40 - 20) : (Math.random() * 14 - 7);
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + speck));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + speck));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + speck));
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * WSPÓLNY SZUM WARTOŚCIOWY dla generatorów tekstur — jedna implementacja
 * zamiast kopii w każdej funkcji. Interpolacja wygładzona (smoothstep), więc
 * daje miękkie plamy, a nie kwadratową kratę.
 */
function valueNoise2D(x: number, y: number, scale: number, seed: number): number {
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

interface WornSurfaceOptions {
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
 */
function makeWornSurface(
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
 */
function makeSurfaceNormalTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
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

/**
 * Pasy ostrzegawcze — skośne żółto-czarne pasy stref technicznych. Jeden z
 * najsilniejszych "czytników" hali przemysłowej: natychmiast komunikuje, że
 * podłoga jest strefą pracy maszyn, a nie po prostu szarym tłem.
 */
function makeHazardStripeTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1d222e';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#c8a23c';
  ctx.lineWidth = size / 7;
  for (let i = -size; i < size * 2; i += size / 3.5) {
    ctx.beginPath();
    ctx.moveTo(i, -10);
    ctx.lineTo(i + size, size + 10);
    ctx.stroke();
  }
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
function makeContactShadowTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
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

/** Canvas + texture for the monitor's live readout — content is drawn by `drawReadout`, never here. */
function makeReadoutSurface(THREE: typeof THREE_NS): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE_NS.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 176;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, texture };
}

const STATUS_LABEL_EN: Record<HospitalStatus | 'IDLE', string> = {
  IDLE: 'STANDBY', NORMAL: 'NORMAL', WARNING: 'WARNING', HIGH: 'HIGH', CRITICAL: 'CRITICAL',
};

export class LabScene3D implements Sim3D {
  disableOrbitControls = true;

  private THREE: typeof THREE_NS | null = null;
  // GENESIS GRAPHICS ENGINE — resource-lifecycle audit finding: this class used to have a
  // one-line no-op `dispose()` on the (mistaken) assumption that "the canvas's GC" frees a torn-
  // down scene's geometries/materials/textures. It doesn't — `WebGLRenderer.dispose()` (called by
  // useThreeLoop.ts right after `sim.dispose()`) never frees them either, since three.js treats
  // them as scene-owned, not renderer-owned. Stored here purely so `dispose()` can hand the whole
  // subtree to `graphics/lifecycle.ts`'s `disposeSceneResources` — see that module's doc comment.
  private scene: THREE_NS.Scene | null = null;
  private controller = new FirstPersonController({
    room: ROOM,
    obstacles: [STATION_OBSTACLE],
    startPosition: { x: 0, z: 3.3 },
    startYaw: 0,
  });

  private raycaster: THREE_NS.Raycaster | null = null;
  private consoleMesh: THREE_NS.Mesh | null = null;
  private consolePanel: THREE_NS.Mesh | null = null;
  // WIDOK PIERWSZOOSOBOWY NAUKOWCA — przedramiona w kombinezonie i rękawice
  // przypięte do kadru kamery. Bez nich pierwsza osoba jest bezcielesną
  // kamerą lecącą przez halę; z nimi widz JEST w laboratorium. Rysowane
  // wyłącznie w trybie FREE (w kadrach kamer naukowych ręce nie istnieją).
  private viewModel: THREE_NS.Group | null = null;
  private leftArmPivot: THREE_NS.Group | null = null;
  private rightArmPivot: THREE_NS.Group | null = null;
  /** 0 = ręce swobodnie, 1 = prawa ręka wyciągnięta do konsoli. Wygładzane w czasie. */
  private reachAmount = 0;
  private viewModelBobT = 0;
  private monitorScreen: THREE_NS.Mesh | null = null;
  // Prawdziwy odczyt danych na małym monitorze — canvas przerysowywany WYŁĄCZNIE
  // z wartości już śledzonych przez tę klasę (vesselFraction/vesselIcuFraction/
  // vesselStatus/playDayIndex), nigdy ze zmyślonej liczby. Przerysowywany tylko
  // gdy treść faktycznie się zmieniła (readoutLastDrawn), nie co klatkę.
  private readoutCtx: CanvasRenderingContext2D | null = null;
  private readoutTexture: THREE_NS.CanvasTexture | null = null;
  private readoutLastDrawn = '';
  private fluidMesh: THREE_NS.Mesh | null = null;
  private icuLight: THREE_NS.PointLight | null = null;
  private vesselLight: THREE_NS.PointLight | null = null;
  private vesselOuterMaterial: THREE_NS.MeshPhysicalMaterial | null = null;
  private pipeline: GraphicsPipeline | null = null;
  // GENESIS GRAPHICS ENGINE — lens/optics per shot (see `graphics/cinematicCamera.ts`). Tracks the
  // last-applied profile so `syncScene` only touches `camera.fov`/near/far/`updateProjectionMatrix`
  // on an actual shot change, not every frame.
  private appliedCinematicProfile: CinematicCameraProfile | null = null;
  // GENESIS GRAPHICS ENGINE — scratch vectors reused every frame in syncScene's focus/interaction
  // math instead of allocating three new THREE.Vector3 per frame forever. Render-loop allocation
  // audit finding (per the engine's own PERFORMANCE.md rule: no avoidable per-frame allocations) —
  // three Vector3s/frame is small on its own, but it's exactly the pattern that compounds badly
  // once a scene has many per-frame consumers, and the fix costs nothing in readability.
  private scratchVecA: THREE_NS.Vector3 | null = null;
  private scratchVecB: THREE_NS.Vector3 | null = null;
  private scratchVecC: THREE_NS.Vector3 | null = null;
  // Agitator wewnątrz naczynia i pierścień holograficzny nad nim — czysto
  // dekoracyjne, ale ich prędkość obrotu/intensywność są sterowane REALNYMI
  // wartościami (vesselFraction/vesselIcuFraction), nigdy zmyśloną liczbą
  // wyświetlaną na scenie.
  private agitatorGroup: THREE_NS.Group | null = null;
  private hologramRing: THREE_NS.Mesh | null = null;
  private hologramMaterial: THREE_NS.MeshBasicMaterial | null = null;
  // GENESIS GRAPHICS ENGINE — atmosphere (graphics/atmosphere.ts): ambient dust drifting through
  // the window's light shaft. Purely a depth/realism cue — its drift speed is a fixed constant,
  // never derived from any scientific/hospital state.
  private dustMotes: DustMotesHandle | null = null;
  // Wewnętrzna "kolonia" wewnątrz płynu: czysto wizualna tekstura gęstości —
  // WIDOCZNA LICZBA punktów (drawRange) jest wprost proporcjonalna do
  // realnego vesselFraction, nigdy do zmyślonego pomiaru "liczby komórek".
  private colonyPoints: THREE_NS.Points | null = null;
  private colonyMaterial: THREE_NS.PointsMaterial | null = null;
  private colonyMaxCount = 0;
  // Wyściółka komory i pierścień podestu — kolor z REALNEGO statusu naczynia.
  private linerMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private plinthMaterial: THREE_NS.MeshBasicMaterial | null = null;
  // Szafy aparaturowe w tle: świecą jaśniej WYŁĄCZNIE gdy realnie coś się
  // odtwarza (ten sam sygnał "playing" co mały monitor) — dekoracja
  // sterowana prawdziwym stanem, nie ozdobny placeholder.
  private rackScreens: THREE_NS.Mesh[] = [];
  // Subtelny "oddech" kamery w kadrze FIXED — czysto kosmetyczny drift,
  // nigdy nie dotyka liveCameraPosition/liveCameraLookAt używanych do lotów.
  private fixedBreatheT = 0;

  private nearStation = false;

  private cameraPhase: LabCameraPhase = 'FREE';
  private fixedKind: LabFixedKind = 'NONE';
  private flight: CameraFlight | null = null;
  private flightGoingToFree = false;
  private liveCameraPosition: [number, number, number] = [0, 1.7, 1.9];
  private liveCameraLookAt: [number, number, number] = [0, 1.7, 0.9];

  private playSeriesData: readonly ScenarioDaySample[] = [];
  private playTag: LabPlayTag = 'NONE';
  private playElapsed = 0;
  private playDayIndex = -1;
  private playbackDone = false;
  private playbackPaused = false;
  private anomalyTriggeredForRun = false;

  private vesselFraction = 0;
  private vesselIcuFraction = 0;
  private vesselStatus: HospitalStatus | 'IDLE' = 'IDLE';

  // --- Input, called from the React screen's key/mouse listeners ---
  setMoveKey(key: MoveKey, down: boolean): void {
    if (this.cameraPhase === 'FREE') this.controller.setKey(key, down);
  }

  addMouseLook(dx: number, dy: number): void {
    if (this.cameraPhase === 'FREE') this.controller.addMouseDelta(dx, dy);
  }

  // --- Experiment/session hooks, called from the React screen ---
  /** Zaczyna odtwarzanie REALNEJ, już policzonej serii dzień po dniu. */
  playSeries(series: readonly ScenarioDaySample[], tag: LabPlayTag): void {
    this.playSeriesData = series;
    this.playTag = tag;
    this.playElapsed = 0;
    this.playDayIndex = -1;
    this.playbackDone = series.length === 0;
    this.playbackPaused = false;
    this.anomalyTriggeredForRun = false;
    if (series.length > 0) this.applyDay(series[0]!);
  }

  pausePlayback(): void { this.playbackPaused = true; }
  resumePlayback(): void { this.playbackPaused = false; }

  resetVessel(): void {
    this.playSeriesData = [];
    this.playTag = 'NONE';
    this.playElapsed = 0;
    this.playDayIndex = -1;
    this.playbackDone = false;
    this.playbackPaused = false;
    this.vesselFraction = 0;
    this.vesselIcuFraction = 0;
    this.vesselStatus = 'IDLE';
  }

  /** Kamera naukowa przejmuje kontrolę — lot z bieżącego kadru do stałego widoku instrumentu. */
  focusScientific(kind: 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY' | 'WIDE'): void {
    if (this.cameraPhase === 'FIXED' && this.fixedKind === kind) return;
    const from = { position: [...this.liveCameraPosition] as [number, number, number], lookAt: [...this.liveCameraLookAt] as [number, number, number] };
    const to = scientificFraming(kind);
    this.flight = flightBetween(from, to, 1.15);
    this.cameraPhase = 'FLIGHT';
    this.flightGoingToFree = false;
    this.fixedKind = kind;
  }

  /** Oddaje kontrolę pierwszoosobową — lot z bieżącego kadru z powrotem do gracza. */
  returnToFirstPerson(): void {
    if (this.cameraPhase === 'FREE') return;
    const state = this.controller.getState();
    const forward = this.controller.getForward();
    const from = { position: [...this.liveCameraPosition] as [number, number, number], lookAt: [...this.liveCameraLookAt] as [number, number, number] };
    const to: [number, number, number] = [state.position.x + forward.x, state.position.y, state.position.z + forward.z];
    this.flight = flightBetween(from, { position: [state.position.x, state.position.y, state.position.z], lookAt: to }, 1.0);
    this.cameraPhase = 'FLIGHT';
    this.flightGoingToFree = true;
    this.fixedKind = 'NONE';
  }

  /**
   * Looking Glass 2.1 — maps a resolved `CameraIntent` (`core/three/graphics/
   * cameraRig.ts`) onto this lab's existing four hand-composed fixed shots
   * (`scientificFraming`), then drives the camera through the EXISTING,
   * already-tested `focusScientific` eased flight — not a second camera
   * system. The lab has a small, closed set of camera positions rather than
   * CameraRig's continuous intent+target+scale framing (see the module-level
   * `flightBetween`/`CameraFlight` import from `../reality/cameraSequencer`,
   * predating this change): WIDE/CINEMATIC read as the establishing "HALA"
   * shot, everything else as the vessel-facing "NAUKOWA" shot — a real,
   * honest boundary, documented rather than papered over with a 5th
   * hand-tuned position this file's own camera model doesn't have.
   */
  applyObservationCameraIntent(cameraIntent: CameraIntent): void {
    const kind = cameraIntent === 'WIDE' || cameraIntent === 'CINEMATIC' ? 'WIDE' : 'SCIENTIFIC';
    this.focusScientific(kind);
  }

  /**
   * Looking Glass 2.1 — the lab's only real addressable object today is the
   * reaction vessel/substance/apparatus at `VESSEL_POSITION` (all synonyms
   * for the same physical instrument). Anything else honestly resolves to
   * `false` — never a guessed camera move onto an unrelated part of the room.
   */
  resolveNamedLabTarget(query: string): boolean {
    return /\b(vessel|substance|apparatus|reaction|naczyni|substancj|aparatur|reakcj)/i.test(query.trim());
  }

  /**
   * Looking Glass 2.1 — exposes the existing per-day application (`applyDay`)
   * for a completed run's own series, so a resolved observation time can
   * show a specific past day without restarting playback. `false` when no
   * run has produced a series yet, or the index is out of range — an honest
   * NOT_MODELLED, never a fabricated day.
   */
  showDay(dayIndex: number): boolean {
    if (dayIndex < 0 || dayIndex >= this.playSeriesData.length) return false;
    this.applyDay(this.playSeriesData[dayIndex]!);
    this.playDayIndex = dayIndex;
    return true;
  }

  getStats(): Record<string, number> {
    return {
      nearStation: this.nearStation ? 1 : 0,
      cameraPhase: phaseCode(this.cameraPhase),
      fixedKind: fixedKindCode(this.fixedKind),
      playing: this.playSeriesData.length > 0 && !this.playbackDone ? 1 : 0,
      playbackDone: this.playbackDone ? 1 : 0,
      dayIndex: this.playDayIndex,
      totalDays: this.playSeriesData.length,
      vesselFraction: this.vesselFraction,
      vesselIcuFraction: this.vesselIcuFraction,
      vesselStatusCode: statusCode(this.vesselStatus),
      playTag: tagCode(this.playTag),
    };
  }

  private applyDay(sample: ScenarioDaySample): void {
    this.vesselFraction = Math.max(0, Math.min(1, sample.hospital.bedOccupancy));
    this.vesselIcuFraction = Math.max(0, Math.min(1, sample.hospital.icuOccupancy));
    this.vesselStatus = sample.hospital.status;
    if (sample.hospital.status === 'CRITICAL' && !this.anomalyTriggeredForRun && this.playTag !== 'REPLAY') {
      this.anomalyTriggeredForRun = true;
      this.focusScientific('ANOMALY');
    }
  }

  /**
   * Rysuje realny odczyt na canvasie monitora: status naczynia, obłożenie
   * łóżek/ICU (procenty z tych samych `vesselFraction`/`vesselIcuFraction`
   * co reaktor) i pozycję w serii (dzień/liczba dni). `force` pomija
   * porównanie z `readoutLastDrawn` — używane tylko przy pierwszym rysowaniu
   * w `init()`, zanim jest jakikolwiek stan do porównania.
   */
  private drawReadout(force = false): void {
    const ctx = this.readoutCtx;
    const texture = this.readoutTexture;
    if (!ctx || !texture) return;
    const status = STATUS_LABEL_EN[this.vesselStatus];
    const occupancyPct = Math.round(this.vesselFraction * 100);
    const icuPct = Math.round(this.vesselIcuFraction * 100);
    const dayLabel = this.playDayIndex >= 0 ? `${this.playDayIndex + 1}/${this.playSeriesData.length}` : '—';
    const key = `${status}|${occupancyPct}|${icuPct}|${dayLabel}`;
    if (!force && key === this.readoutLastDrawn) return;
    this.readoutLastDrawn = key;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const color = `#${STATUS_COLOR[this.vesselStatus === 'IDLE' ? 'NORMAL' : this.vesselStatus].toString(16).padStart(6, '0')}`;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#7fa3c9';
    ctx.font = '600 18px "Courier New", monospace';
    ctx.fillText('SCIENTIFIC WORLD STATE', 14, 30);

    ctx.fillStyle = color;
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.fillText(status, 14, 74);

    ctx.font = '600 20px "Courier New", monospace';
    ctx.fillStyle = '#cfe8ff';
    ctx.fillText(`BEDS  ${occupancyPct}%`, 14, 110);
    ctx.fillText(`ICU   ${icuPct}%`, 14, 136);

    ctx.fillStyle = '#7fa3c9';
    ctx.font = '600 18px "Courier New", monospace';
    ctx.fillText(`DAY ${dayLabel}`, 14, 164);

    texture.needsUpdate = true;
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.THREE = THREE;
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.scratchVecA = new THREE.Vector3();
    this.scratchVecB = new THREE.Vector3();
    this.scratchVecC = new THREE.Vector3();
    // Tekstury proceduralne (canvas, zero nowych plików/assetów) — jedyny
    // sposób na detal materiału metalu/podłogi dostępny bez zatwierdzonego
    // w assetGovernance.ts zestawu PBR dla wnętrza laboratorium.
    const brushedMetalTex = makeBrushedMetalTexture(THREE);
    const floorNoiseTex = makeFloorNoiseTexture(THREE);
    const surfaceNormalTex = makeSurfaceNormalTexture(THREE);
    /**
     * Albedo + roughness dla jednego materiału, z zadanym powtórzeniem.
     * Zwraca gotowy fragment opisu materiału (`map`, `roughnessMap`,
     * `roughness`), który rozpakowujemy do `MeshStandardMaterial`.
     */
    const wornFor = (
      hex: number,
      options: WornSurfaceOptions,
      repeatX: number,
      repeatY: number,
    ): { map: THREE_NS.Texture; roughnessMap: THREE_NS.Texture; roughness: number } => {
      const worn = makeWornSurface(THREE, hex, options);
      worn.map.repeat.set(repeatX, repeatY);
      worn.roughnessMap.repeat.set(repeatX, repeatY);
      return { map: worn.map, roughnessMap: worn.roughnessMap, roughness: 1 };
    };

    /** Klon mapy normalnych o własnym powtórzeniu — jedna tekstura, wiele skal. */
    const normalFor = (repeatX: number, repeatY: number): THREE_NS.Texture => {
      const tex = surfaceNormalTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(repeatX, repeatY);
      return tex;
    };
    const brushedFor = (repeatX: number, repeatY: number): THREE_NS.Texture => {
      const tex = brushedMetalTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(repeatX, repeatY);
      return tex;
    };
    // Tło: pionowy gradient (płótno->tekstura) zamiast płaskiego koloru —
    // tani, standardowy trik dający wrażenie atmosfery/głębi zamiast
    // jednolitej "ściany koloru" za sprzętem. Nadal żaden nowy asset/loader.
    const gradientCanvas = document.createElement('canvas');
    gradientCanvas.width = 8;
    gradientCanvas.height = 256;
    const gradientCtx = gradientCanvas.getContext('2d')!;
    const gradient = gradientCtx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#04060c');
    gradient.addColorStop(0.55, '#0a0f1d');
    gradient.addColorStop(1, '#141d30');
    gradientCtx.fillStyle = gradient;
    gradientCtx.fillRect(0, 0, 8, 256);
    const backgroundTexture = new THREE.CanvasTexture(gradientCanvas);
    backgroundTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = backgroundTexture;
    // Mgła ciaśniej dobrana do rzeczywistych rozmiarów sali (przekątna ~7.8 m) —
    // realny spadek widoczności w głąb, zamiast dekoracji, która nigdy się nie uruchamia.
    // Mgła zaczyna się DALEKO za aparaturą: ma oddzielać plany (ściany, antresola,
    // druga wieża), a nie zamulać pierwszego planu — przy 3.5 m zjadała samo naczynie.
    scene.fog = new THREE.Fog(0x0a1526, 9.5, 28);

    // Ściany + sufit: jeden box renderowany od wewnątrz (BackSide) — tanie i wystarczające.
    const roomWidth = ROOM.maxX - ROOM.minX;
    const roomDepth = ROOM.maxZ - ROOM.minZ;
    const roomHeight = 4.6;
    const roomCenterX = (ROOM.minX + ROOM.maxX) / 2;
    const roomCenterZ = (ROOM.minZ + ROOM.maxZ) / 2;
    // Hala nie kończy się na ścianie za reaktorem. Za przegrodą ciągnie się
    // druga, głębsza nawa (STREFA E) — to ona sprawia, że widz czyta OBIEKT,
    // a nie pokój: przez przeszklenie widać rząd maszyn uciekający w mgłę.
    const DEEP_BAY_DEPTH = 8.4;
    const PARTITION_Z = ROOM.minZ - 0.05;
    const shellDepth = roomDepth + DEEP_BAY_DEPTH;
    const shellCenterZ = roomCenterZ - DEEP_BAY_DEPTH / 2;
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(roomWidth, roomHeight, shellDepth),
      new THREE.MeshStandardMaterial({
        ...(() => {
          // Ściany to największa powierzchnia w kadrze — jednolity kolor od razu
          // czyta się jak pudełko. Duże, miękkie plamy zabrudzenia rozbijają ją
          // na płaszczyzny o różnej jasności, tak jak malowany beton w hali.
          const worn = makeWornSurface(THREE, 0x232c40, { roughness: 0.92, wear: 0.7, streaks: true, seed: 5 });
          worn.map.repeat.set(4, 2);
          worn.roughnessMap.repeat.set(4, 2);
          return { map: worn.map, roughnessMap: worn.roughnessMap, roughness: 1 };
        })(),
        metalness: 0.04, side: THREE.BackSide,
      }),
    );
    shell.position.set(roomCenterX, roomHeight / 2, shellCenterZ);
    scene.add(shell);

    floorNoiseTex.repeat.set(roomWidth / 1.4, roomDepth / 1.4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth - 0.05, roomDepth - 0.05),
      new THREE.MeshStandardMaterial({
        ...(() => {
          // Posadzka żywiczna: przetarcia na ciągach komunikacyjnych, ciemniejszy
          // osad przy krawędziach. Bez tego jest to jedna szara tafla.
          const worn = makeWornSurface(THREE, 0x1b2233, { roughness: 0.42, wear: 0.62, seed: 17 });
          worn.map.repeat.set(7, 6);
          worn.roughnessMap.repeat.set(7, 6);
          return { map: worn.map, roughnessMap: worn.roughnessMap, roughness: 1 };
        })(),
        metalness: 0.26, normalMap: normalFor(14, 11), normalScale: new THREE.Vector2(0.32, 0.32),
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(roomCenterX, 0.01, roomCenterZ);
    scene.add(floor);
    // Dwustrefowa podłoga: jaśniejszy, metaliczny "chodnik" wokół stanowiska
    // centralnego odróżnia strefę roboczą od reszty hali — głębia przez
    // kontrast materiału, nie tylko przez geometrię.
    const walkway = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 2.6, 48),
      new THREE.MeshStandardMaterial({ color: 0x27314b, roughness: 0.24, metalness: 0.55 }),
    );
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.set(VESSEL_POSITION[0], 0.012, VESSEL_POSITION[2]);
    scene.add(walkway);
    // Cienka listwa świetlna wzdłuż podstawy ścian zamiast siatki-debug —
    // czysto dekoracyjna głębia, nie dane naukowe.
    const baseGlow = new THREE.Mesh(
      new THREE.RingGeometry(2.7, 2.78, 48),
      new THREE.MeshBasicMaterial({ color: 0x2f5a8f, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    baseGlow.rotation.x = -Math.PI / 2;
    baseGlow.position.set(VESSEL_POSITION[0], 0.015, VESSEL_POSITION[2]);
    scene.add(baseGlow);

    // "Okno" świecące — realistyczne źródło światła dziennego + głębia/parallax (czysto dekoracyjne).
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x3a6fb5, emissive: 0x4d86d6, emissiveIntensity: 0.9, roughness: 0.4 });
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.15), windowMat);
    windowPane.position.set(-roomWidth / 2 + 0.02, 1.95, -0.6);
    windowPane.rotation.y = Math.PI / 2;
    scene.add(windowPane);
    const windowLight = new THREE.PointLight(0x6ea6e8, 0.6, 6, 2);
    windowLight.position.set(-roomWidth / 2 + 0.6, 1.95, -0.6);
    scene.add(windowLight);

    // GENESIS GRAPHICS ENGINE — atmosphere (graphics/atmosphere.ts): the window now reads as an
    // actual aperture light is streaming through, not just an emissive pane, and the room air reads
    // as a real occupied volume instead of a vacuum. Both generic, reusable primitives — no
    // lab-specific logic lives in atmosphere.ts itself. Quality-gated (quality.ts's
    // tierAllowsAtmosphereParticles): skipped entirely at 'low' tier rather than rendered smaller —
    // a low-end device's budget goes to the geometry/materials it's already drawing.
    const atmosphereTier = detectRenderTier();
    if (tierAllowsAtmosphereParticles(atmosphereTier)) {
      const windowLightShaft = createLightShaft(THREE, {
        origin: [-roomWidth / 2 + 0.05, 2.05, -0.6],
        direction: [1, -0.55, 0.12],
        length: 4.6,
        width: 1.5,
        color: 0xfff2cf,
        opacity: 0.32,
      });
      scene.add(windowLightShaft);
      this.dustMotes = createDustMotes(THREE, {
        bounds: [3.2, 1.1, 2.6],
        center: [-2.6, 1.5, -0.6],
        count: atmosphereParticleCount(140, atmosphereTier),
        size: 0.009,
        opacity: 0.26,
      });
      scene.add(this.dustMotes.points);
    }

    // Oświetlenie warstwowe (key/fill/rim), nie płaskie wypełnienie ze
    // wszystkich stron: wypełnienie ambientowe ZREDUKOWANE, żeby światła
    // kierunkowe/punktowe dawały realny kontrast i cienie zamiast
    // jednolicie oświetlonej sceny bez głębi.
    // Uwaga: ściany/sufit renderowane od wewnątrz (BackSide) mają odwrócone
    // normalne, więc HemisphereLight przypisuje sufitowi kolor "gruntu", a
    // podłodze kolor "nieba".
    // Wypełnienie ambientowe DALEJ obniżone: cztery chłodne źródła (hemisphere +
    // 3x directional) sumowały się do płaskiego wypełnienia, które gasiło
    // kontrast, mimo że każde z osobna było skromne. Ciepły KEY musi wyraźnie
    // dominować nad chłodnym wypełnieniem, żeby hala miała hierarchię
    // światło/cień zamiast równomiernej jasności wszędzie.
    scene.add(new THREE.HemisphereLight(0x8ea4cc, 0x6b7593, 0.16));
    const skyLight = new THREE.DirectionalLight(0xcfe0ff, 0.14);
    skyLight.position.set(-2, 3, -1);
    scene.add(skyLight);
    const fillLight = new THREE.DirectionalLight(0x8fa8d6, 0.1);
    fillLight.position.set(2.5, 2.2, 2);
    scene.add(fillLight);
    // Światło od strony kadru otwierającego (WIDE stoi przy +X/+Z): bez niego
    // szeroki plan pokazywał wyłącznie nieoświetloną stronę aparatury.
    const cameraSideLight = new THREE.DirectionalLight(0xbcd4ff, 0.13);
    cameraSideLight.position.set(4, 3, 5);
    scene.add(cameraSideLight);
    // Światło robocze wprost nad stanowiskiem — DRUGI (i ostatni) emiter z
    // cieniem. Pada pionowo, więc daje cień ZAKOTWICZAJĄCY: aparatura, rama i
    // agregaty kładą się na podłodze zamiast nad nią wisieć. Reflektor KEY
    // modeluje bryłę z boku, ten wiąże ją z podłożem.
    const workLight = new THREE.PointLight(0xfff1d6, 8.5, 12, 2);
    workLight.position.set(0.15, roomHeight - 0.5, 0.1);
    workLight.castShadow = true;
    workLight.shadow.mapSize.set(1024, 1024);
    workLight.shadow.bias = -0.0022;
    workLight.shadow.camera.near = 0.4;
    workLight.shadow.camera.far = 11;
    scene.add(workLight);
    // KEY: ciepłe, skierowane światło z przodu-boku naczynia — główne
    // źródło modelunku na szkle/metalu bioreaktora. Wzmocniony, żeby wyraźnie
    // wygrywał z chłodnym wypełnieniem zamiast się w nim rozmywać.
    // Pozycja przesunięta z osi kamery (kadr WIDE stoi przy +X/+Z): światło
    // padające niemal równolegle do spojrzenia chowa własne cienie ZA
    // obiektami. Ustawione bardziej z boku (-Z), rzuca je w poprzek podłogi,
    // czyli tam, gdzie kamera je widzi.
    const keyLight = new THREE.SpotLight(0xfff0d8, 22, 13, Math.PI / 4.5, 0.5, 1.1);
    keyLight.position.set(3.2, 3.4, -1.7);
    keyLight.target.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1], VESSEL_POSITION[2]);
    // Realny rzucany cień — dotąd BRAK shadowMap w całej scenie było prawdziwą
    // przyczyną płaskiego wrażenia: żadne światło nic nie zasłaniało, więc
    // sprzęt "unosił się" bez zakotwiczenia w podłodze niezależnie od
    // natężenia świateł. Tylko KEY rzuca cień (koszt jednej shadow mapy),
    // reszta świateł zostaje bez cienia — kontrolowany koszt wydajności.
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0018;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 13;
    scene.add(keyLight, keyLight.target);
    // RIM: chłodne światło zza naczynia — odcina jego sylwetkę od tła,
    // dokładnie ten efekt, którego brakowało przy płaskim wypełnieniu.
    const rimLight = new THREE.PointLight(0x7fdcff, 4.5, 7, 2);
    rimLight.position.set(VESSEL_POSITION[0] - 0.3, VESSEL_POSITION[1] + 1.4, VESSEL_POSITION[2] - 1.6);
    scene.add(rimLight);

    // Belka technologiczna (gantry) pod sufitem — niesie trzy oprawy wiszące
    // zamiast jednej pojedynczej lampy, wzmacnia poczucie przemysłowej hali
    // nad centralną aparaturą i sąsiadującym z nią sprzętem.
    const gantryY = roomHeight - 0.35;
    const gantryBeam = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.16, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x2c3348, roughness: 0.45, metalness: 0.65 }),
    );
    gantryBeam.position.set(-0.4, gantryY, 0.1);
    scene.add(gantryBeam);
    const crossBeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x2c3348, roughness: 0.45, metalness: 0.65 }),
    );
    crossBeam.position.set(2.9, gantryY, -1.0);
    scene.add(crossBeam);

    const pendantMat = new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.8 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0xfff1d6, emissiveIntensity: 0.25, roughness: 0.5, side: THREE.DoubleSide });
    const pendantFixtures: Array<{ x: number; z: number; color: number; intensity: number }> = [
      { x: 0, z: 0.1, color: 0xfff1d6, intensity: 1.6 },
      { x: -3.2, z: -2.0, color: 0xffe3b0, intensity: 0.9 },
      { x: 2.9, z: -1.7, color: 0xbfe4ff, intensity: 0.8 },
    ];
    for (const fixture of pendantFixtures) {
      const cableLength = gantryY - 2.28;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cableLength, 8), pendantMat);
      cable.position.set(fixture.x, 2.28 + cableLength / 2, fixture.z);
      scene.add(cable);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 20, 1, true), shadeMat);
      shade.position.set(fixture.x, 2.28, fixture.z);
      scene.add(shade);
      if (fixture.x !== 0) {
        const rigLight = new THREE.PointLight(fixture.color, fixture.intensity, 5, 2);
        rigLight.position.set(fixture.x, 2.15, fixture.z);
        scene.add(rigLight);
      }
    }

    // Stanowisko: podest + trzy nóżki (czyta się jak realna aparatura, nie geometria placeholder).
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.15, 0.15, 28),
      new THREE.MeshStandardMaterial({ color: 0x2c3650, roughness: 0.45, metalness: 0.35, roughnessMap: brushedFor(8, 1) }),
    );
    platform.position.set(VESSEL_POSITION[0], 0.075, VESSEL_POSITION[2]);
    scene.add(platform);
    const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x40485f, roughness: 0.4, metalness: 0.5 });
    for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(VESSEL_POSITION[0] + Math.cos(angle) * 0.85, 0.21, VESSEL_POSITION[2] + Math.sin(angle) * 0.85);
      scene.add(leg);
    }

    // Naczynie: centralny bioreaktor — powiększona "szklana" powłoka (realistyczny
    // szkło PBR: IOR, clearcoat, tłumienie koloru w grubości) + rama z trzech
    // metalowych pierścieni + cztery pionowe wsporniki z sensor-padami (czyta
    // się jak realna aparatura laboratoryjna, nie goły cylinder) + wewnętrzny
    // "płyn" skalowany realnym obłożeniem + wirujący agitator wewnątrz.
    // ==================================================================
    // SZKŁO TRANSMISYJNE, ale CIENKIE.
    //
    // Poprzednie podejście (opacity zamiast transmission) było reakcją na
    // realny problem: transmission 0.92 z grubością rzędu decymetra zamieniało
    // naczynie w mleczną plamę. Ale samo `opacity` to nie szkło — nie załamuje
    // światła, nie ma absorpcji w grubości i nie reaguje na to, co za nim stoi.
    //
    // Właściwe rozwiązanie to transmisja przy MAŁEJ grubości i zerowej
    // szorstkości: refrakcja jest wtedy subtelna (kilka pikseli przesunięcia na
    // krawędziach), tafla ma tłumienie koloru w masie, a wyposażenie komory
    // zostaje ostre. Transmisję niesie WYŁĄCZNIE zewnętrzna tafla — płaszcz
    // wewnętrzny, czoła szczeliny i powłoka fresnelowa zostają na `opacity`,
    // więc dodatkowy render sceny w three jest jeden, nie cztery.
    // ==================================================================
    this.vesselOuterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.02,
      metalness: 0,
      transmission: 0.94,
      thickness: 0.09,
      attenuationColor: new THREE.Color(0xbfe2f5),
      attenuationDistance: 2.6,
      transparent: false,
      opacity: 1,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      specularIntensity: 1,
      envMapIntensity: 2.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.9, VESSEL_HALF_HEIGHT * 2, 40, 1, true),
      this.vesselOuterMaterial,
    );
    outer.position.set(...VESSEL_POSITION);
    scene.add(outer);

    // ==================================================================
    // SZKŁO O REALNEJ GRUBOŚCI — płaszcz dwuścienny, nie jedna cienka błona.
    //
    // Pojedyncza powłoka zawsze czyta się jak folia: nie ma dwóch powierzchni,
    // od których światło odbija się w innym miejscu, ani krawędzi o
    // niezerowej grubości. Prawdziwy bioreaktor jest naczyniem PŁASZCZOWYM —
    // ściana wewnętrzna, szczelina i ściana zewnętrzna. Tu dokładnie to:
    //  - wewnętrzna tafla nieco mniejsza od zewnętrznej (szczelina 4 cm),
    //  - pierścienie czołowe zamykające szczelinę u góry i u dołu, dzięki
    //    czemu przekrój szkła jest WIDOCZNY jako materiał, a nie linia,
    //  - delikatny fresnel na osobnej, addytywnej powłoce, który podbija
    //    krawędzie pod kątem ślizgowym — tak zachowuje się grube szkło.
    // ==================================================================
    const innerGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xdff0ff,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.06,
      ior: 1.52,
      clearcoat: 0.8,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const innerGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.81, 0.86, VESSEL_HALF_HEIGHT * 2 - 0.03, 40, 1, true),
      innerGlassMaterial,
    );
    innerGlass.position.set(...VESSEL_POSITION);
    scene.add(innerGlass);

    // Czoła szczeliny: widoczny PRZEKRÓJ szkła u góry i u dołu płaszcza.
    const glassEdgeMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xcfe6f7, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.34,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.8, side: THREE.DoubleSide,
    });
    for (const edgeY of [VESSEL_HALF_HEIGHT - 0.015, -(VESSEL_HALF_HEIGHT - 0.015)]) {
      const edge = new THREE.Mesh(new THREE.RingGeometry(0.845, 0.885, 48), glassEdgeMaterial);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + edgeY, VESSEL_POSITION[2]);
      scene.add(edge);
    }

    // Fresnel: pod kątem ślizgowym szkło robi się jasne i nieprzezroczyste.
    // Osobna, addytywna powłoka realizuje to bez dotykania materiału bazowego.
    const fresnelShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.862, 0.912, VESSEL_HALF_HEIGHT * 2, 48, 1, true),
      new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(0xbfe4ff) }, uPower: { value: 3.8 }, uStrength: { value: 0.34 } },
        vertexShader: /* glsl */`
          varying vec3 vNormalView;
          varying vec3 vPositionView;
          void main() {
            vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
            vPositionView = viewPosition.xyz;
            vNormalView = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * viewPosition;
          }
        `,
        fragmentShader: /* glsl */`
          precision highp float;
          uniform vec3 uColor;
          uniform float uPower;
          uniform float uStrength;
          varying vec3 vNormalView;
          varying vec3 vPositionView;
          void main() {
            vec3 viewDirection = normalize(-vPositionView);
            float facing = abs(dot(normalize(vNormalView), viewDirection));
            float fresnel = pow(1.0 - facing, uPower);
            gl_FragColor = vec4(uColor * fresnel * uStrength, fresnel * uStrength);
          }
        `,
      }),
    );
    fresnelShell.position.set(...VESSEL_POSITION);
    fresnelShell.renderOrder = 3;
    scene.add(fresnelShell);

    const ringMat = new THREE.MeshStandardMaterial({ color: 0x99a6bd, roughness: 0.16, metalness: 0.96, roughnessMap: brushedFor(6, 1), envMapIntensity: 1.5 });
    const ringGeo = new THREE.TorusGeometry(0.87, 0.045, 14, 40);
    for (const offset of [VESSEL_HALF_HEIGHT - 0.07, 0, -(VESSEL_HALF_HEIGHT - 0.07)]) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + offset, VESSEL_POSITION[2]);
      scene.add(ring);
    }

    // Cztery pionowe wsporniki (klatka reaktora) + sensor-pady ze świecącymi
    // końcówkami — czysto dekoracyjny detal otoczenia aparatury.
    const strutGeo = new THREE.CylinderGeometry(0.035, 0.035, VESSEL_HALF_HEIGHT * 2 + 0.05, 10);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x3d4760, roughness: 0.25, metalness: 0.8, roughnessMap: brushedFor(1, 6) });
    const podGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const podMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0x5ad1ff, emissiveIntensity: 0.9, roughness: 0.4 });
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const sx = VESSEL_POSITION[0] + Math.cos(angle) * 0.98;
      const sz = VESSEL_POSITION[2] + Math.sin(angle) * 0.98;
      const strut = new THREE.Mesh(strutGeo, strutMat);
      strut.position.set(sx, VESSEL_POSITION[1], sz);
      scene.add(strut);
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.position.set(sx, VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT - 0.15, sz);
      scene.add(pod);
    }

    // Kopuła zamykająca naczynie od góry — zastępuje otwarty cylinder
    // sylwetką realnego, złożonego instrumentu, nie gołej rury. Dwa pierścienie
    // zaworów pod kopułą dodają detal "prawdziwej aparatury" bez żadnych
    // zmyślonych odczytów.
    const domeMat = new THREE.MeshStandardMaterial({ color: 0xaebccd, roughness: 0.11, metalness: 1, roughnessMap: brushedFor(5, 3), envMapIntensity: 1.9 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.87, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT, VESSEL_POSITION[2]);
    scene.add(dome);
    const valveGeo = new THREE.BoxGeometry(0.1, 0.14, 0.1);
    const valveMat = new THREE.MeshStandardMaterial({ color: 0xb8623a, roughness: 0.46, metalness: 0.7 });
    for (const angle of [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4]) {
      const vx = VESSEL_POSITION[0] + Math.cos(angle) * 0.55;
      const vz = VESSEL_POSITION[2] + Math.sin(angle) * 0.55;
      const valve = new THREE.Mesh(valveGeo, valveMat);
      valve.position.set(vx, VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 0.55, vz);
      scene.add(valve);
    }

    const fluidMaterial = new THREE.MeshStandardMaterial({ color: STATUS_COLOR.NORMAL, emissive: STATUS_COLOR.NORMAL, emissiveIntensity: 0.45, roughness: 0.25 });
    this.fluidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1, 32), fluidMaterial);
    this.fluidMesh.position.set(VESSEL_POSITION[0], 0.15, VESSEL_POSITION[2]);
    this.fluidMesh.scale.y = 0.001;
    scene.add(this.fluidMesh);

    // "Kolonia" wewnątrz płynu: rozproszone świecące punkty, DZIECKO fluidMesh
    // (dziedziczy jego pozycję/skalę, więc żyje dokładnie w realnej objętości
    // płynu). Liczba WIDOCZNYCH punktów = realny vesselFraction * pula — to
    // wizualizacja gęstości z realnego sygnału, nie fikcyjny licznik komórek.
    this.colonyMaxCount = 220;
    const colonyPositions = new Float32Array(this.colonyMaxCount * 3);
    for (let i = 0; i < this.colonyMaxCount; i++) {
      const r = Math.sqrt(Math.random()) * 0.6;
      const theta = Math.random() * Math.PI * 2;
      colonyPositions[i * 3] = Math.cos(theta) * r;
      colonyPositions[i * 3 + 1] = Math.random() - 0.5;
      colonyPositions[i * 3 + 2] = Math.sin(theta) * r;
    }
    const colonyGeometry = new THREE.BufferGeometry();
    colonyGeometry.setAttribute('position', new THREE.BufferAttribute(colonyPositions, 3));
    colonyGeometry.setDrawRange(0, 0);
    this.colonyMaterial = new THREE.PointsMaterial({
      color: STATUS_COLOR.NORMAL, size: 0.045, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.colonyPoints = new THREE.Points(colonyGeometry, this.colonyMaterial);
    this.fluidMesh.add(this.colonyPoints);

    // Agitator: wirujący wewnątrz naczynia trzon + dwie łopatki — prędkość
    // obrotu sterowana REALNYM vesselFraction w update(), nigdy zmyśloną liczbą.
    this.agitatorGroup = new THREE.Group();
    this.agitatorGroup.position.set(VESSEL_POSITION[0], 0.15, VESSEL_POSITION[2]);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8892ac, roughness: 0.25, metalness: 0.85 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, VESSEL_MAX_FILL_HEIGHT * 0.94, 10), shaftMat);
    shaft.position.y = (VESSEL_MAX_FILL_HEIGHT * 0.94) / 2;
    this.agitatorGroup.add(shaft);
    const bladeGeo = new THREE.BoxGeometry(0.5, 0.035, 0.08);
    const bladeA = new THREE.Mesh(bladeGeo, shaftMat);
    bladeA.position.y = 0.16;
    this.agitatorGroup.add(bladeA);
    const bladeB = new THREE.Mesh(bladeGeo, shaftMat);
    bladeB.position.y = 0.16;
    bladeB.rotation.y = Math.PI / 2;
    this.agitatorGroup.add(bladeB);
    scene.add(this.agitatorGroup);

    // Podświetlana wyściółka komory: wewnętrzny walec emisyjny, który sprawia,
    // że reaktor świeci od środka i jest ewidentnym punktem centralnym kadru.
    // Kolor sterowany REALNYM statusem w syncScene, tak jak płyn.
    this.linerMaterial = new THREE.MeshBasicMaterial({
      color: STATUS_COLOR.NORMAL, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false,
    });
    const liner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.84, VESSEL_HALF_HEIGHT * 2 - 0.06, 32, 1, true),
      this.linerMaterial,
    );
    liner.position.set(...VESSEL_POSITION);
    scene.add(liner);
    // Pierścień akcentowy w podeście — odcina aparaturę od podłogi.
    this.plinthMaterial = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.NORMAL, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const plinthRing = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.1, 48), this.plinthMaterial);
    plinthRing.rotation.x = -Math.PI / 2;
    plinthRing.position.set(VESSEL_POSITION[0], 0.152, VESSEL_POSITION[2]);
    scene.add(plinthRing);

    this.vesselLight = new THREE.PointLight(STATUS_COLOR.NORMAL, 4.2, 6, 2);
    this.vesselLight.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.5, VESSEL_POSITION[2]);
    scene.add(this.vesselLight);

    // Pierścień holograficzny nad naczyniem: addytywne, przezroczyste "skanowanie"
    // sterowane REALNYM vesselIcuFraction/statusem (obrót/opacity/kolor) — bez
    // żadnej zmyślonej liczby czy tekstu na nim.
    this.hologramMaterial = new THREE.MeshBasicMaterial({
      color: STATUS_COLOR.NORMAL, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    this.hologramRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 8, 56), this.hologramMaterial);
    this.hologramRing.rotation.x = Math.PI / 2;
    this.hologramRing.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 1.05, VESSEL_POSITION[2]);
    scene.add(this.hologramRing);

    // Tani, statyczny "wolumetryczny" snop światła nad aparaturą (addytywny stożek) —
    // czysto atmosferyczny, nie źródło danych.
    const shaftLight = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 1.7, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    shaftLight.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 1.7, VESSEL_POSITION[2]);
    scene.add(shaftLight);

    // Statyczna sylwetka referencyjna skali człowieka — czysto wizualna, bez
    // żadnej roli w symulacji ani interakcji.
    const figureMat = new THREE.MeshStandardMaterial({ color: 0x20242f, roughness: 0.9, metalness: 0.05 });
    const figureBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.06, 4, 12), figureMat);
    figureBody.position.set(-1.9, 0.75, 1.15);
    scene.add(figureBody);
    const figureHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), figureMat);
    figureHead.position.set(-1.9, 1.55, 1.15);
    scene.add(figureHead);

    // Konsola — cel interakcji.
    const consoleBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.55, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2a3450, roughness: 0.4, metalness: 0.4 }),
    );
    consoleBody.position.set(CONSOLE_POSITION[0], CONSOLE_POSITION[1] - 0.15, CONSOLE_POSITION[2]);
    scene.add(consoleBody);
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, emissive: 0x2f6fb0, emissiveIntensity: 0.5, roughness: 0.35 });
    this.consolePanel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), panelMaterial);
    this.consolePanel.position.set(CONSOLE_POSITION[0], CONSOLE_POSITION[1] + 0.12, CONSOLE_POSITION[2] - 0.18);
    this.consolePanel.rotation.x = -0.5;
    scene.add(this.consolePanel);
    this.consoleMesh = consoleBody;

    // Dwa instrumenty flankujące z górną opaską (czytelniejszy fokalny detal) — czysto wizualne.
    const instrumentGeo = new THREE.CylinderGeometry(0.22, 0.26, 1.05, 20);
    const bandGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.08, 20);
    const instrumentMat = new THREE.MeshStandardMaterial({ color: 0x5e6b8c, roughness: 0.55, metalness: 0.3 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x5ad1ff, emissive: 0x5ad1ff, emissiveIntensity: 0.6, roughness: 0.3 });
    for (const x of [-1.7, 1.7]) {
      const body = new THREE.Mesh(instrumentGeo, instrumentMat);
      body.position.set(x, 0.525, -0.7);
      scene.add(body);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(x, 0.98, -0.7);
      scene.add(band);
    }
    const accentA = new THREE.PointLight(0x5ad1ff, 0.5, 2.5, 2);
    accentA.position.set(-1.7, 1.05, -0.7);
    scene.add(accentA);
    const accentB = new THREE.PointLight(0x5ad1ff, 0.5, 2.5, 2);
    accentB.position.set(1.7, 1.05, -0.7);
    scene.add(accentB);
    this.icuLight = accentA;

    // Mały monitor obok konsoli — ekran jaśnieje TYLKO gdy realnie coś się odtwarza
    // (patrz syncScene: sygnał "playing", nie zmyślony wskaźnik).
    const monitorBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.24, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1c2334, roughness: 0.5, metalness: 0.3 }),
    );
    monitorBody.position.set(-0.55, 1.0, -0.85);
    monitorBody.rotation.y = 0.35;
    scene.add(monitorBody);
    // Ekran monitora niesie REALNY odczyt (status/obłożenie/dzień) rysowany na
    // canvasie z tych samych pól, które już napędzają naczynie — nigdy osobno
    // zmyślona liczba. `map` niesie treść, `emissive`+`emissiveIntensity` (patrz
    // syncScene) nadal steruje jasnością ekranu tym samym sygnałem "playing".
    const readout = makeReadoutSurface(THREE);
    this.readoutCtx = readout.ctx;
    this.readoutTexture = readout.texture;
    const monitorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x3fc7ff, emissiveIntensity: 0.15, emissiveMap: readout.texture, map: readout.texture, roughness: 0.3,
    });
    this.monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), monitorMat);
    this.monitorScreen.position.set(-0.55 + Math.sin(0.35) * 0.03, 1.0, -0.85 + Math.cos(0.35) * 0.03 - 0.02);
    this.monitorScreen.rotation.y = 0.35;
    scene.add(this.monitorScreen);
    this.drawReadout(true);

    // === OTOCZENIE: druga wieża zbiornika, szafy aparaturowe, antresola,
    // przeszklona ścianka i okablowanie — hala wygląda jak kompleks
    // laboratoryjny, nie jeden cylinder na środku pustego pokoju. ===
    const metalDarkMat = new THREE.MeshStandardMaterial({ color: 0x2c3650, roughness: 0.4, metalness: 0.5 });
    const metalMidMat = new THREE.MeshStandardMaterial({ color: 0x3b4661, roughness: 0.35, metalness: 0.6 });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a566f, roughness: 0.3, metalness: 0.75 });
    const junctionMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0x5ad1ff, emissiveIntensity: 0.7, roughness: 0.4 });

    /** Prosty przewód L-kształtny (pion + poziom) z łącznikiem — tani, ale czytelny jako "instalacja". */
    const addConduit = (x: number, z1: number, z2: number, topY: number): void => {
      const vertical = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, topY, 10), pipeMat);
      vertical.position.set(x, topY / 2, z1);
      scene.add(vertical);
      const runLength = Math.abs(z2 - z1);
      if (runLength > 0.05) {
        const horizontal = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, runLength, 10), pipeMat);
        horizontal.rotation.x = Math.PI / 2;
        horizontal.position.set(x, topY, (z1 + z2) / 2);
        scene.add(horizontal);
      }
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), pipeMat);
      elbow.position.set(x, topY, z1);
      scene.add(elbow);
      const junction = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), junctionMat);
      junction.position.set(x, 0.1, z1);
      scene.add(junction);
    };

    // Druga wieża zbiornika — asymetryczne, duże urządzenie w tle, wizualnie
    // "siostrzane" do centralnego naczynia, ale mniejsze i BEZ powiązania z
    // danymi (żadnej fikcyjnej wartości — tylko otoczenie).
    const tankPos: THREE_NS.Vector3Tuple = [-3.4, 0, -2.0];
    const tankPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.14, 24), metalDarkMat);
    tankPlatform.position.set(tankPos[0], 0.07, tankPos[2]);
    scene.add(tankPlatform);
    const tankBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.54, 2.3, 28),
      new THREE.MeshStandardMaterial({ color: 0x7e8ba3, roughness: 0.24, metalness: 0.9, roughnessMap: brushedFor(4, 4), envMapIntensity: 1.4 }),
    );
    tankBody.position.set(tankPos[0], 1.3, tankPos[2]);
    scene.add(tankBody);
    const tankRingGeo = new THREE.TorusGeometry(0.52, 0.03, 12, 32);
    for (const offset of [0.95, -0.1, -0.95]) {
      const ring = new THREE.Mesh(tankRingGeo, metalMidMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(tankPos[0], 1.3 + offset, tankPos[2]);
      scene.add(ring);
    }
    const tankBeacon = new THREE.PointLight(0xffe3b0, 0.7, 3.5, 2);
    tankBeacon.position.set(tankPos[0], 2.55, tankPos[2]);
    scene.add(tankBeacon);
    addConduit(tankPos[0] + 0.6, tankPos[2], VESSEL_POSITION[2], 0.35);

    // Szereg szaf aparaturowych — infrastruktura serwerowa/pomiarowa z
    // pionowymi paskami LED. Jasność pasków rośnie WYŁĄCZNIE z realnym
    // sygnałem "playing" (dokładnie ta sama zasada co mały monitor obok
    // konsoli) — nigdy zmyślone dane na wyświetlaczu.
    const rackBodyMat = new THREE.MeshStandardMaterial({ color: 0x39435e, roughness: 0.66, metalness: 0.28 });
    const rackScreenMat = new THREE.MeshStandardMaterial({ color: 0x123044, emissive: 0x5ad1ff, emissiveIntensity: 0.2, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const rz = -2.0 + i * 0.62;
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.55), rackBodyMat);
      rack.position.set(3.15, 0.9, rz);
      scene.add(rack);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 1.5), rackScreenMat.clone());
      strip.position.set(3.15 - 0.26, 0.9, rz);
      strip.rotation.y = Math.PI / 2;
      scene.add(strip);
      this.rackScreens.push(strip);
    }
    const rackAccent = new THREE.PointLight(0x5ad1ff, 0.4, 3, 2);
    rackAccent.position.set(3.0, 1.7, -1.1);
    scene.add(rackAccent);
    addConduit(2.7, -2.0, VESSEL_POSITION[2], 0.28);

    // Antresola — podniesiony pomost wzdłuż ściany +X z barierką i podporami,
    // plus krótkie schody — czysta warstwa głębi architektonicznej w tle,
    // niedostępna fizycznie dla gracza (brak kolizji, jak pozostałe rekwizyty).
    const mezzY = 1.75;
    const mezzPlatform = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 4.4), metalMidMat);
    mezzPlatform.position.set(4.9, mezzY, -0.6);
    scene.add(mezzPlatform);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x5a6786, roughness: 0.4, metalness: 0.6 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 0.05), railMat);
    rail.position.set(4.9, mezzY + 0.55, -2.75);
    scene.add(rail);
    const railFar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 0.05), railMat);
    railFar.position.set(4.9, mezzY + 0.55, 1.55);
    scene.add(railFar);
    // Podświetlenie krawędzi antresoli — architektoniczny akcent (jak w
    // realnych halach przemysłowych), czysto dekoracyjne, stałe natężenie.
    const railGlowMat = new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.55 });
    const railGlow = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.012, 4.42), railGlowMat);
    railGlow.position.set(4.9, mezzY + 0.06, -0.6);
    scene.add(railGlow);
    const pillarGeo = new THREE.CylinderGeometry(0.05, 0.05, mezzY, 10);
    for (const pz of [-2.6, -1.0, 0.6, 2.2]) {
      const pillar = new THREE.Mesh(pillarGeo, metalDarkMat);
      pillar.position.set(4.9, mezzY / 2, pz);
      scene.add(pillar);
    }
    for (let s = 0; s < 5; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.32), metalMidMat);
      step.position.set(4.15 - s * 0.12, (s + 1) * (mezzY / 5) - mezzY / 10, 3.1);
      scene.add(step);
    }

    // Przeszklona ścianka za naczyniem — sugeruje kolejne pomieszczenie w
    // głębi (czysta iluzja przestrzeni, brak interakcji), z przyciemnionym
    // wnętrzem widocznym przez szkło.
    const partitionMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe4ff, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.25, thickness: 0.1, ior: 1.4,
    });
    const partition = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.3), partitionMat);
    partition.position.set(-0.5, 1.3, -3.3);
    scene.add(partition);
    const partitionFrame = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.06, 0.06), metalMidMat);
    partitionFrame.position.set(-0.5, 2.46, -3.3);
    scene.add(partitionFrame);
    // Cienka linia LED wzdłuż górnej ramy ścianki — odcina jej krawędź od
    // ciemnego tła, ten sam architektoniczny akcent co antresola.
    const partitionEdge = new THREE.Mesh(
      new THREE.BoxGeometry(4.42, 0.015, 0.015),
      new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.6 }),
    );
    partitionEdge.position.set(-0.5, 2.43, -3.28);
    scene.add(partitionEdge);
    const beyondGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x2a4f7a, transparent: true, opacity: 0.5 }),
    );
    beyondGlow.position.set(-0.5, 1.2, -3.9);
    scene.add(beyondGlow);
    const beyondLight = new THREE.PointLight(0x5ad1ff, 0.5, 4, 2);
    beyondLight.position.set(-0.5, 1.6, -3.7);
    scene.add(beyondLight);

    // ==================================================================
    // WYPOSAŻENIE HALI — gęsta zabudowa laboratoryjna budowana z kilku
    // parametrycznych zespołów (stół, szafa, przewody, butle, kratownica),
    // a nie z pojedynczych prymitywów rozstawionych po pokoju. Wszystkie
    // materiały/geometrie są współdzielone między instancjami, więc gęstość
    // sceny rośnie bez proporcjonalnego wzrostu liczby draw calls.
    // ==================================================================
    const MAT = {
      // Każdy materiał dostaje WŁASNE albedo + skorelowany roughness zamiast
      // jednego płaskiego koloru — to jest różnica między "bryłą w kolorze
      // stali" a stalą. `wear` steruje tym, jak zużyta jest powierzchnia:
      // konstrukcja i podłoga są brudne, chrom i ceramika prawie czyste.
      steel: new THREE.MeshStandardMaterial({
        ...wornFor(0x8a93a6, { roughness: 0.34, wear: 0.55, streaks: true, seed: 3 }, 3, 3),
        metalness: 0.9, normalMap: normalFor(3, 3), normalScale: new THREE.Vector2(0.26, 0.26),
      }),
      darkSteel: new THREE.MeshStandardMaterial({
        ...wornFor(0x39415a, { roughness: 0.52, wear: 0.6, streaks: true, seed: 9 }, 2, 2),
        metalness: 0.72, normalMap: normalFor(2, 2), normalScale: new THREE.Vector2(0.34, 0.34),
      }),
      chrome: new THREE.MeshStandardMaterial({
        ...wornFor(0xc8d4e6, { roughness: 0.1, wear: 0.18, seed: 21 }, 2, 2),
        metalness: 1, envMapIntensity: 1.6,
      }),
      worktop: new THREE.MeshStandardMaterial({
        ...wornFor(0x22283a, { roughness: 0.62, wear: 0.5, seed: 33 }, 4, 2),
        metalness: 0.14, normalMap: normalFor(4, 2), normalScale: new THREE.Vector2(0.24, 0.24),
      }),
      plastic: new THREE.MeshStandardMaterial({
        ...wornFor(0x2a3350, { roughness: 0.78, wear: 0.32, seed: 47 }, 2, 2),
        metalness: 0.04, normalMap: normalFor(2, 2), normalScale: new THREE.Vector2(0.18, 0.18),
      }),
      rubber: new THREE.MeshStandardMaterial({
        ...wornFor(0x14181f, { roughness: 0.95, wear: 0.4, seed: 59 }, 3, 3), metalness: 0,
      }),
      ceramic: new THREE.MeshStandardMaterial({
        ...wornFor(0xd8e2ee, { roughness: 0.44, wear: 0.16, seed: 71 }, 2, 2), metalness: 0.04,
      }),
      copper: new THREE.MeshStandardMaterial({
        ...wornFor(0xb87a4a, { roughness: 0.32, wear: 0.45, streaks: true, seed: 83 }, 2, 2), metalness: 0.92,
      }),
      display: new THREE.MeshStandardMaterial({ color: 0x0d2233, emissive: 0x3fc7ff, emissiveIntensity: 0.55, roughness: 0.24 }),
      amberLed: new THREE.MeshStandardMaterial({ color: 0x100c06, emissive: 0xffb545, emissiveIntensity: 1.1, roughness: 0.4 }),
      panelGlass: new THREE.MeshPhysicalMaterial({ color: 0x9fc4e8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 1.8, depthWrite: false }),
    };
    const GEO = {
      boltHead: new THREE.CylinderGeometry(0.018, 0.018, 0.022, 6),
      flange: new THREE.CylinderGeometry(0.062, 0.062, 0.026, 14),
      knob: new THREE.CylinderGeometry(0.022, 0.026, 0.03, 10),
      handWheel: new THREE.TorusGeometry(0.055, 0.011, 6, 14),
      gaugeBody: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14),
      gaugeFace: new THREE.CircleGeometry(0.037, 14),
      vent: new THREE.BoxGeometry(0.3, 0.012, 0.012),
    };

    /** Pierścień śrub wokół kołnierza — detal, który natychmiast czyta się jako realny sprzęt. */
    const addBoltRing = (cx: number, cy: number, cz: number, radius: number, count: number): void => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const bolt = new THREE.Mesh(GEO.boltHead, MAT.chrome);
        bolt.position.set(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius);
        scene.add(bolt);
      }
    };

    /** Manometr: korpus + tarcza + króciec. Używany na reaktorze i przy rurociągach. */
    const addGauge = (x: number, y: number, z: number, rotY: number): void => {
      const body = new THREE.Mesh(GEO.gaugeBody, MAT.steel);
      body.rotation.set(Math.PI / 2, 0, 0);
      body.rotation.z = rotY;
      body.position.set(x, y, z);
      scene.add(body);
      const face = new THREE.Mesh(GEO.gaugeFace, MAT.ceramic);
      face.position.set(x + Math.sin(rotY) * 0.017, y, z + Math.cos(rotY) * 0.017);
      face.rotation.y = rotY;
      scene.add(face);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), MAT.steel);
      stem.position.set(x, y - 0.05, z);
      scene.add(stem);
    };

    /** Stół laboratoryjny: blat, rama, półka, fronty szuflad i aparatura na blacie. */
    const addBench = (x: number, z: number, rotY: number, length: number, instruments: number): void => {
      const bench = new THREE.Group();
      bench.position.set(x, 0, z);
      bench.rotation.y = rotY;
      const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.055, 0.68), MAT.worktop);
      top.position.y = 0.9;
      bench.add(top);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.035, 0.035), MAT.steel);
      rail.position.set(0, 1.32, -0.3);
      bench.add(rail);
      for (const sx of [-length / 2 + 0.08, length / 2 - 0.08]) {
        for (const sz of [-0.28, 0.28]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.87, 0.05), MAT.darkSteel);
          leg.position.set(sx, 0.435, sz);
          bench.add(leg);
        }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8), MAT.steel);
        post.position.set(sx, 1.11, -0.3);
        bench.add(post);
      }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(length - 0.2, 0.03, 0.5), MAT.darkSteel);
      shelf.position.y = 0.28;
      bench.add(shelf);
      const drawers = Math.max(2, Math.round(length / 0.45));
      for (let i = 0; i < drawers; i++) {
        const front = new THREE.Mesh(new THREE.BoxGeometry(length / drawers - 0.04, 0.19, 0.02), MAT.plastic);
        front.position.set(-length / 2 + (i + 0.5) * (length / drawers), 0.74, 0.35);
        bench.add(front);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(length / drawers * 0.45, 0.016, 0.016), MAT.chrome);
        handle.position.set(front.position.x, 0.74, 0.37);
        bench.add(handle);
      }
      for (let i = 0; i < instruments; i++) {
        const ix = -length / 2 + (i + 0.5) * (length / instruments);
        const h = 0.16 + (i % 3) * 0.07;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, h, 0.32), MAT.plastic);
        box.position.set(ix, 0.93 + h / 2, -0.02);
        bench.add(box);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.19, h * 0.45), MAT.display);
        screen.position.set(ix, 0.95 + h * 0.62, 0.161);
        bench.add(screen);
        for (let k = 0; k < 3; k++) {
          const knob = new THREE.Mesh(GEO.knob, k === 0 ? MAT.amberLed : MAT.chrome);
          knob.rotation.x = Math.PI / 2;
          knob.position.set(ix - 0.07 + k * 0.06, 0.95 + h * 0.2, 0.165);
          bench.add(knob);
        }
      }
      scene.add(bench);
    };

    /** Szafa aparaturowa na ścianie: korpus, przeszklone drzwi, półki, uchwyty. */
    const addWallCabinet = (x: number, y: number, z: number, rotY: number, width: number): void => {
      const cab = new THREE.Group();
      cab.position.set(x, y, z);
      cab.rotation.y = rotY;
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.62, 0.3), MAT.darkSteel);
      cab.add(body);
      const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.07, 0.52), MAT.panelGlass);
      doorGlass.position.z = 0.152;
      cab.add(doorGlass);
      for (const sy of [-0.1, 0.14]) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 0.09, 0.015, 0.24), MAT.steel);
        shelf.position.y = sy;
        cab.add(shelf);
        for (let i = 0; i < Math.round(width / 0.12); i++) {
          const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 8), MAT.ceramic);
          vial.position.set(-width / 2 + 0.08 + i * 0.12, sy + 0.062, 0);
          cab.add(vial);
        }
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), MAT.chrome);
      handle.position.set(width / 2 - 0.06, 0, 0.16);
      cab.add(handle);
      scene.add(cab);
    };

    /** Poziomy rurociąg z kołnierzami i wspornikami — biegnie wzdłuż osi X pod sufitem. */
    const addPipeRun = (y: number, z: number, x1: number, x2: number, radius: number, material: THREE_NS.Material): void => {
      const length = Math.abs(x2 - x1);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 14), material);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set((x1 + x2) / 2, y, z);
      scene.add(pipe);
      const flanges = Math.max(2, Math.floor(length / 1.5));
      for (let i = 0; i <= flanges; i++) {
        const fx = x1 + (i / flanges) * (x2 - x1);
        const flange = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.5, radius * 1.5, 0.03, 14), MAT.steel);
        flange.rotation.z = Math.PI / 2;
        flange.position.set(fx, y, z);
        scene.add(flange);
        if (i % 2 === 0) {
          const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.02), MAT.darkSteel);
          hanger.position.set(fx, y + 0.17, z);
          scene.add(hanger);
        }
      }
    };

    /** Zwisający kabel — realna krzywa (CatmullRom + TubeGeometry), nie prosty walec. */
    const addCable = (from: THREE_NS.Vector3Tuple, to: THREE_NS.Vector3Tuple, sag: number, radius: number): void => {
      const mid: THREE_NS.Vector3Tuple = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - sag, (from[2] + to[2]) / 2];
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(...from), new THREE.Vector3(...mid), new THREE.Vector3(...to),
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, radius, 6, false), MAT.rubber);
      scene.add(cable);
    };

    /** Butle gazowe w stojaku z łańcuchem zabezpieczającym. */
    const addGasCylinders = (x: number, z: number, rotY: number, count: number): void => {
      const rack = new THREE.Group();
      rack.position.set(x, 0, z);
      rack.rotation.y = rotY;
      const colors = [0x2f6f52, 0x8a3030, 0x2a4a7a, 0x6a6a70];
      for (let i = 0; i < count; i++) {
        const bx = -((count - 1) * 0.17) / 2 + i * 0.17;
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.075, 1.15, 14),
          new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.42, metalness: 0.65 }),
        );
        body.position.set(bx, 0.575, 0);
        rack.add(body);
        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), body.material as THREE_NS.Material);
        shoulder.position.set(bx, 1.15, 0);
        rack.add(shoulder);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.12, 8), MAT.chrome);
        neck.position.set(bx, 1.2, 0);
        rack.add(neck);
        const wheel = new THREE.Mesh(GEO.handWheel, MAT.chrome);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(bx, 1.27, 0);
        rack.add(wheel);
      }
      const chain = new THREE.Mesh(new THREE.BoxGeometry(count * 0.17 + 0.08, 0.02, 0.02), MAT.chrome);
      chain.position.set(0, 0.82, 0.08);
      rack.add(chain);
      for (const sx of [-(count * 0.17) / 2 - 0.02, (count * 0.17) / 2 + 0.02]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), MAT.darkSteel);
        post.position.set(sx, 0.5, 0.08);
        rack.add(post);
      }
      scene.add(rack);
    };

    /** Dwuteownik z trzech płaskowników — kratownica sufitowa czytelna jako konstrukcja. */
    const addIBeam = (x: number, y: number, z: number, length: number, alongX: boolean): void => {
      const beam = new THREE.Group();
      beam.position.set(x, y, z);
      if (!alongX) beam.rotation.y = Math.PI / 2;
      const web = new THREE.Mesh(new THREE.BoxGeometry(length, 0.2, 0.022), MAT.darkSteel);
      beam.add(web);
      for (const fy of [-0.1, 0.1]) {
        const flange = new THREE.Mesh(new THREE.BoxGeometry(length, 0.024, 0.13), MAT.darkSteel);
        flange.position.y = fy;
        beam.add(flange);
      }
      scene.add(beam);
    };

    // --- Kratownica sufitowa: dwa dwuteowniki wzdłuż + poprzeczki co 1.6 m ---
    for (const bz of [-2.6, 1.4]) addIBeam(0, roomHeight - 0.62, bz, roomWidth - 0.4, true);
    for (let bx = -4.4; bx <= 4.4; bx += 1.6) addIBeam(bx, roomHeight - 0.62, -0.6, 4.2, false);

    // --- Panele świetlne w suficie (emisyjne prostokąty w regularnej siatce) ---
    const ceilingPanelMat = new THREE.MeshStandardMaterial({ color: 0xcddcf0, emissive: 0xdcecff, emissiveIntensity: 0.22, roughness: 0.9 });
    for (const px of [-3.6, -1.2, 1.2, 3.6]) {
      for (const pz of [-3.2, -1.0, 1.2]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), ceilingPanelMat);
        panel.rotation.x = Math.PI / 2;
        panel.position.set(px, roomHeight - 0.03, pz);
        scene.add(panel);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 0.54), MAT.darkSteel);
        housing.position.set(px, roomHeight - 0.01, pz);
        scene.add(housing);
      }
    }
    // Wash ścian: bez tego obwód hali (ściany, szafy, stoły) gubił się w czerni,
    // bo wszystkie źródła świeciły do środka. Cztery miękkie światła obrysowe
    // odsłaniają zabudowę peryferyjną, nie rozjaśniając środka kadru.
    for (const [wx, wz] of [[-5.2, 0], [5.2, 0], [0, -4.0], [0, 3.6]] as const) {
      const wallWash = new THREE.PointLight(0xaec6ea, 1.1, 7, 2);
      wallWash.position.set(wx, 2.5, wz);
      scene.add(wallWash);
    }

    // Materiał emisyjny sam NIE oświetla sceny w Three.js — bez tych źródeł
    // panele sufitowe świeciły, a hala zostawała czarna. Sześć realnych świateł
    // (co drugi panel) daje równomierne oświetlenie robocze całej zabudowy.
    // Natężenie mocno obniżone (11 -> 4): sześć punktówek BEZ cienia sumowało
    // się do ~66 jednostek światła wypełniającego, które zasypywało każdy cień
    // rzucany przez KEY/workLight. Cień jest widoczny tylko wtedy, gdy źródła
    // rzucające cień mają realny udział w oświetleniu sceny.
    for (const [lx, lz] of [[-3.6, -3.2], [1.2, -3.2], [-1.2, -1.0], [3.6, -1.0], [-3.6, 1.2], [1.2, 1.2]] as const) {
      const panelLight = new THREE.PointLight(0xeaf3ff, 1.15, 11, 2);
      panelLight.position.set(lx, roomHeight - 0.35, lz);
      scene.add(panelLight);
    }

    // --- Rurociągi technologiczne pod sufitem (różne średnice i materiały) ---
    addPipeRun(roomHeight - 0.95, -3.9, -5.7, 5.7, 0.075, MAT.steel);
    addPipeRun(roomHeight - 1.12, -3.9, -5.7, 5.7, 0.045, MAT.copper);
    addPipeRun(roomHeight - 0.95, -4.15, -5.7, 2.2, 0.055, MAT.darkSteel);
    addPipeRun(roomHeight - 1.35, 3.9, -3.0, 5.7, 0.06, MAT.steel);

    // --- Koryta kablowe + realnie zwisające kable wzdłuż tylnej ściany ---
    const trayMat = MAT.darkSteel;
    for (const tz of [-4.35, 4.15]) {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(roomWidth - 0.6, 0.05, 0.22), trayMat);
      tray.position.set(0, roomHeight - 1.6, tz);
      scene.add(tray);
      for (let cx = -5.0; cx < 5.0; cx += 1.25) {
        addCable([cx, roomHeight - 1.63, tz], [cx + 1.25, roomHeight - 1.63, tz], 0.12 + (cx % 2 === 0 ? 0.05 : 0), 0.013);
      }
    }
    // Zejścia kablowe do szaf aparaturowych i do konsoli.
    addCable([2.6, roomHeight - 1.63, -4.15], [3.15, 1.8, -2.0], 0.25, 0.016);
    addCable([-2.4, roomHeight - 1.63, -4.15], [-3.4, 2.4, -2.0], 0.3, 0.016);
    addCable([0.4, roomHeight - 1.63, 4.15], [0.35, 0.75, 0.95], 0.35, 0.014);

    // --- Stoły laboratoryjne wzdłuż ścian (gęsta zabudowa obwodowa) ---
    addBench(-4.4, 2.4, Math.PI / 2, 2.6, 4);
    addBench(-4.4, -0.4, Math.PI / 2, 2.0, 3);
    addBench(1.6, 3.7, Math.PI, 2.8, 4);
    addBench(-1.9, -4.35, 0, 2.4, 3);

    // --- Szafy na ścianach nad stołami ---
    addWallCabinet(-5.85, 2.0, 2.4, Math.PI / 2, 1.5);
    addWallCabinet(-5.85, 2.0, -0.4, Math.PI / 2, 1.2);
    addWallCabinet(1.6, 2.05, 4.42, Math.PI, 1.6);

    // --- Butle gazowe: dwa stanowiska w rogach ---
    addGasCylinders(-5.5, -3.6, 0.35, 4);
    addGasCylinders(5.4, 2.9, -0.5, 3);

    // --- Detale samego reaktora: kołnierze ze śrubami, manometry, koło zaworu ---
    for (const offset of [VESSEL_HALF_HEIGHT - 0.07, -(VESSEL_HALF_HEIGHT - 0.07)]) {
      addBoltRing(VESSEL_POSITION[0], VESSEL_POSITION[1] + offset + 0.05, VESSEL_POSITION[2], 0.9, 16);
    }
    addGauge(VESSEL_POSITION[0] + 0.62, VESSEL_POSITION[1] + 0.72, VESSEL_POSITION[2] + 0.66, 0.7);
    addGauge(VESSEL_POSITION[0] - 0.66, VESSEL_POSITION[1] + 0.52, VESSEL_POSITION[2] + 0.6, -0.6);
    addGauge(VESSEL_POSITION[0] + 0.78, VESSEL_POSITION[1] - 0.35, VESSEL_POSITION[2] - 0.42, 1.9);
    const mainWheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 18), MAT.chrome);
    mainWheel.rotation.x = Math.PI / 2;
    mainWheel.position.set(VESSEL_POSITION[0] + 0.88, VESSEL_POSITION[1] + 0.2, VESSEL_POSITION[2] + 0.3);
    scene.add(mainWheel);
    // Rury procesowe wychodzące z reaktora do instalacji sufitowej i do podłogi.
    const reactorPipeMat = MAT.steel;
    const upPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.5, 12), reactorPipeMat);
    upPipe.position.set(VESSEL_POSITION[0] + 0.72, VESSEL_POSITION[1] + 1.5, VESSEL_POSITION[2] - 0.5);
    scene.add(upPipe);
    const downPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), reactorPipeMat);
    downPipe.position.set(VESSEL_POSITION[0] - 0.78, 0.45, VESSEL_POSITION[2] + 0.42);
    scene.add(downPipe);
    for (const [fx, fy, fz] of [[0.72, VESSEL_POSITION[1] + 0.78, -0.5], [-0.78, 0.9, 0.42]] as const) {
      const flange = new THREE.Mesh(GEO.flange, MAT.steel);
      flange.position.set(VESSEL_POSITION[0] + fx, fy, VESSEL_POSITION[2] + fz);
      scene.add(flange);
    }

    // --- Pomost technologiczny przy reaktorze: krata, barierka, drabinka ---
    const catwalk = new THREE.Group();
    catwalk.position.set(-1.75, 0, -1.5);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.1), MAT.darkSteel);
    deck.position.y = 1.0;
    catwalk.add(deck);
    for (let g = 0; g < 9; g++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.02, 0.03), MAT.steel);
      bar.position.set(0, 1.035, -0.5 + g * 0.125);
      catwalk.add(bar);
    }
    for (const cx of [-0.5, 0.5]) {
      for (const cz of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), MAT.darkSteel);
        leg.position.set(cx, 0.5, cz);
        catwalk.add(leg);
      }
    }
    for (const railY of [1.35, 1.65]) {
      const railBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.028, 0.028), MAT.steel);
      railBar.position.set(0, railY, -0.53);
      catwalk.add(railBar);
    }
    for (const px of [-0.53, 0.53]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 8), MAT.steel);
      post.position.set(px, 1.35, -0.53);
      catwalk.add(post);
    }
    for (let s = 0; s < 4; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.09), MAT.steel);
      step.position.set(0, 0.24 + s * 0.24, 0.62);
      catwalk.add(step);
    }
    scene.add(catwalk);

    // --- Kolumny konstrukcyjne w narożnikach (dwuteowniki pionowe) ---
    for (const [cx, cz] of [[-5.7, -4.6], [5.7, -4.6], [5.7, 4.1]] as const) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.16, roomHeight, 0.16), MAT.darkSteel);
      col.position.set(cx, roomHeight / 2, cz);
      scene.add(col);
      const capPlate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.3), MAT.steel);
      capPlate.position.set(cx, 0.02, cz);
      scene.add(capPlate);
    }

    // --- Kratka wentylacyjna + żaluzje na ścianie tylnej (rytm wizualny) ---
    for (const vz of [-4.44]) {
      for (const vx of [-4.6, 4.6]) {
        const grille = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.05), MAT.darkSteel);
        grille.position.set(vx, 2.7, vz);
        scene.add(grille);
        for (let l = 0; l < 6; l++) {
          const louver = new THREE.Mesh(GEO.vent, MAT.steel);
          louver.scale.x = 2.3;
          louver.position.set(vx, 2.46 + l * 0.09, vz + 0.03);
          scene.add(louver);
        }
      }
    }

    // ==================================================================
    // ZESPOŁY INŻYNIERSKIE — aparatura centralna przestaje być "szklanym
    // walcem z ramą", a staje się SYSTEMEM: rama nośna → przyłącza
    // procesowe → sondy → manifold zaworowy → agregat pompowy → szafa
    // sterownicza → manipulator próbkujący. Każdy zespół jest funkcją
    // parametryczną (jak addBench/addPipeRun wyżej), a nie pojedynczym
    // rekwizytem, więc rozbudowa hali nie oznacza sypania prymitywami.
    // ==================================================================

    /**
     * Ciężka rama nośna reaktora: cztery słupy skrzynkowe + rygle górne/dolne.
     * Słupy stoją na PRZEKĄTNYCH (obrót 45°), nie na wprost kamery — inaczej
     * przedni słup przecinał sylwetkę naczynia dokładnie na środku kadru
     * otwierającego i zasłaniał to, co ma być bohaterem ujęcia.
     */
    const addContainmentFrame = (cx: number, cz: number, half: number, height: number): void => {
      const colGeo = new THREE.BoxGeometry(0.11, height, 0.11);
      const d = half * Math.SQRT1_2 * 1.35;
      const corners: Array<[number, number]> = [[-d, 0], [0, -d], [d, 0], [0, d]];
      for (const [ox, oz] of corners) {
        const col = new THREE.Mesh(colGeo, MAT.darkSteel);
        col.position.set(cx + ox, height / 2, cz + oz);
        scene.add(col);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.26), MAT.steel);
        foot.position.set(cx + ox, 0.02, cz + oz);
        scene.add(foot);
        addBoltRing(cx + ox, 0.05, cz + oz, 0.085, 4);
      }
      // Rygle: górny pierścień ramy + stężenie w połowie wysokości.
      for (const gy of [height - 0.08, height * 0.52]) {
        for (let i = 0; i < 4; i++) {
          const a = corners[i]!;
          const b = corners[(i + 1) % 4]!;
          const dx = b[0] - a[0];
          const dz = b[1] - a[1];
          const len = Math.hypot(dx, dz);
          const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 0.075, 0.075), MAT.darkSteel);
          beam.position.set(cx + (a[0] + b[0]) / 2, gy, cz + (a[1] + b[1]) / 2);
          beam.rotation.y = Math.atan2(-dz, dx);
          scene.add(beam);
        }
      }
    };

    /** Manifold zaworowy: blok rozdzielacza, kołnierze, koła zaworów, manometry, króćce. */
    const addValveManifold = (x: number, y: number, z: number, rotY: number, ports: number): void => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      const block = new THREE.Mesh(new THREE.BoxGeometry(ports * 0.19, 0.26, 0.18), MAT.steel);
      g.add(block);
      for (let i = 0; i < ports; i++) {
        const px = -((ports - 1) * 0.19) / 2 + i * 0.19;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 8), MAT.chrome);
        stem.position.set(px, 0.2, 0);
        g.add(stem);
        const wheel = new THREE.Mesh(GEO.handWheel, i % 2 === 0 ? MAT.chrome : MAT.copper);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(px, 0.28, 0);
        g.add(wheel);
        const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 8), MAT.steel);
        outlet.rotation.x = Math.PI / 2;
        outlet.position.set(px, -0.04, 0.16);
        g.add(outlet);
        const flange = new THREE.Mesh(GEO.flange, MAT.steel);
        flange.rotation.x = Math.PI / 2;
        flange.position.set(px, -0.04, 0.26);
        g.add(flange);
      }
      scene.add(g);
    };

    /** Agregat pompowy na ramie: silnik, korpus pompy, sprzęgło, ssanie/tłoczenie. */
    const addPumpSkid = (x: number, z: number, rotY: number): void => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.09, 0.5), MAT.darkSteel);
      skid.position.y = 0.045;
      g.add(skid);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.44, 18), MAT.steel);
      motor.rotation.z = Math.PI / 2;
      motor.position.set(-0.2, 0.28, 0);
      g.add(motor);
      for (let f = 0; f < 7; f++) {
        const fin = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.008, 5, 14), MAT.darkSteel);
        fin.rotation.y = Math.PI / 2;
        fin.position.set(-0.38 + f * 0.06, 0.28, 0);
        g.add(fin);
      }
      const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 12), MAT.copper);
      coupling.rotation.z = Math.PI / 2;
      coupling.position.set(0.06, 0.28, 0);
      g.add(coupling);
      const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.2, 20), MAT.steel);
      volute.rotation.z = Math.PI / 2;
      volute.position.set(0.26, 0.28, 0);
      g.add(volute);
      const suction = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 10), MAT.steel);
      suction.position.set(0.26, 0.53, 0);
      g.add(suction);
      const discharge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 10), MAT.steel);
      discharge.rotation.x = Math.PI / 2;
      discharge.position.set(0.26, 0.28, 0.25);
      g.add(discharge);
      scene.add(g);
    };

    /** Sonda pomiarowa wpuszczana w komorę: głowica ze złączem, trzon, kabel. */
    const addProbe = (angle: number, radius: number, topY: number, depth: number): void => {
      const px = VESSEL_POSITION[0] + Math.cos(angle) * radius;
      const pz = VESSEL_POSITION[2] + Math.sin(angle) * radius;
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 12), MAT.steel);
      boss.position.set(px, topY, pz);
      scene.add(boss);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.08), MAT.darkSteel);
      head.position.set(px, topY + 0.11, pz);
      scene.add(head);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), MAT.amberLed);
      led.position.set(px, topY + 0.13, pz + 0.042);
      scene.add(led);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, depth, 8), MAT.chrome);
      shaft.position.set(px, topY - depth / 2, pz);
      scene.add(shaft);
      addCable([px, topY + 0.15, pz], [px + Math.cos(angle) * 0.55, topY + 0.05, pz + Math.sin(angle) * 0.55], 0.12, 0.009);
    };

    /** Szafa sterownicza: korpus, pochylony pulpit z ekranem, rząd diod, klamka. */
    const addControlUnit = (x: number, z: number, rotY: number): void => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.28, 0.46), MAT.darkSteel);
      body.position.y = 0.64;
      g.add(body);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.5), MAT.steel);
      plinth.position.y = 0.03;
      g.add(plinth);
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.3), MAT.steel);
      desk.position.set(0, 1.3, 0.16);
      desk.rotation.x = -0.42;
      g.add(desk);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.24), MAT.display);
      screen.position.set(0, 1.33, 0.175);
      screen.rotation.x = -0.42;
      g.add(screen);
      for (let i = 0; i < 5; i++) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.008), i < 2 ? MAT.amberLed : MAT.display);
        led.position.set(-0.2 + i * 0.1, 1.09, 0.232);
        g.add(led);
      }
      for (let r = 0; r < 3; r++) {
        const vent = new THREE.Mesh(GEO.vent, MAT.steel);
        vent.scale.x = 1.6;
        vent.position.set(0, 0.42 + r * 0.1, 0.232);
        g.add(vent);
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.02), MAT.chrome);
      handle.position.set(0.26, 0.72, 0.235);
      g.add(handle);
      scene.add(g);
    };

    /** Manipulator próbkujący: cokół, obrotnica, ramię, przedramię, chwytak. */
    const addManipulator = (x: number, z: number, baseRot: number): void => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = baseRot;
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.62, 16), MAT.darkSteel);
      pedestal.position.y = 0.31;
      g.add(pedestal);
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 16), MAT.steel);
      turret.position.y = 0.7;
      g.add(turret);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), MAT.chrome);
      shoulder.position.y = 0.82;
      g.add(shoulder);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.13), MAT.steel);
      upper.position.set(0, 1.12, 0.06);
      upper.rotation.x = 0.32;
      g.add(upper);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), MAT.chrome);
      elbow.position.set(0, 1.42, 0.25);
      g.add(elbow);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.1), MAT.steel);
      fore.position.set(0, 1.5, 0.55);
      fore.rotation.x = 1.15;
      g.add(fore);
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), MAT.darkSteel);
      wrist.rotation.x = Math.PI / 2;
      wrist.position.set(0, 1.55, 0.79);
      g.add(wrist);
      for (const fx of [-0.035, 0.035]) {
        const finger = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.13, 0.03), MAT.chrome);
        finger.position.set(fx, 1.52, 0.87);
        finger.rotation.x = 0.25;
        g.add(finger);
      }
      const statusLed = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), MAT.amberLed);
      statusLed.position.set(0, 0.78, 0.15);
      g.add(statusLed);
      scene.add(g);
    };

    /** Dygestorium: obudowa, szyba podnoszona, wnętrze z podświetleniem, przyłącza. */
    const addFumeHood = (x: number, z: number, rotY: number): void => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 0.72), MAT.plastic);
      base.position.y = 0.45;
      g.add(base);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 0.78), MAT.darkSteel);
      hood.position.y = 1.45;
      g.add(hood);
      const interior = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.9, 0.02), MAT.display);
      interior.position.set(0, 1.42, -0.34);
      g.add(interior);
      const sash = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.6), MAT.panelGlass);
      sash.position.set(0, 1.32, 0.4);
      g.add(sash);
      const sashRail = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.04), MAT.chrome);
      sashRail.position.set(0, 1.02, 0.4);
      g.add(sashRail);
      const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 14), MAT.steel);
      duct.position.set(0, 2.75, -0.2);
      g.add(duct);
      for (let i = 0; i < 2; i++) {
        const tap = new THREE.Mesh(GEO.handWheel, MAT.copper);
        tap.rotation.x = Math.PI / 2;
        tap.position.set(-0.45 + i * 0.9, 1.0, 0.36);
        g.add(tap);
      }
      scene.add(g);
    };

    /** Regał techniczny: rama, półki, pojemniki — zaplecze magazynowe hali. */
    const addStorageRack = (x: number, z: number, rotY: number, bays: number): void => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      const width = bays * 0.62;
      for (const sx of [-width / 2, width / 2]) {
        for (const sz of [-0.22, 0.22]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.1, 0.05), MAT.darkSteel);
          post.position.set(sx, 1.05, sz);
          g.add(post);
        }
      }
      for (let s = 0; s < 4; s++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, 0.5), MAT.steel);
        shelf.position.y = 0.35 + s * 0.55;
        g.add(shelf);
        for (let b = 0; b < bays; b++) {
          if ((s + b) % 3 === 2) continue;
          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.3, 0.4),
            (s + b) % 2 === 0 ? MAT.plastic : MAT.worktop,
          );
          crate.position.set(-width / 2 + 0.31 + b * 0.62, 0.52 + s * 0.55, 0);
          g.add(crate);
          const label = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), MAT.ceramic);
          label.position.set(-width / 2 + 0.31 + b * 0.62, 0.54 + s * 0.55, 0.201);
          g.add(label);
        }
      }
      scene.add(g);
    };

    /** Stojak aparatury 19": rząd modułów z panelami czołowymi i diodami. */
    const addInstrumentStack = (x: number, y: number, z: number, rotY: number, units: number): void => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.56, units * 0.14 + 0.05, 0.42), MAT.darkSteel);
      g.add(frame);
      for (let u = 0; u < units; u++) {
        const uy = -((units - 1) * 0.14) / 2 + u * 0.14;
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.115, 0.02), MAT.steel);
        face.position.set(0, uy, 0.211);
        g.add(face);
        const readout = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.06), MAT.display);
        readout.position.set(-0.14, uy, 0.223);
        g.add(readout);
        for (let d = 0; d < 4; d++) {
          const dot = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.008), d === u % 4 ? MAT.amberLed : MAT.display);
          dot.position.set(0.04 + d * 0.035, uy, 0.224);
          g.add(dot);
        }
        const knob = new THREE.Mesh(GEO.knob, MAT.chrome);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(0.2, uy, 0.226);
        g.add(knob);
      }
      scene.add(g);
    };

    /** Prostokątny kanał wentylacyjny z segmentami i kołnierzami — infrastruktura sufitowa. */
    const addDuctRun = (y: number, z: number, x1: number, x2: number, size: number, material: THREE_NS.Material = MAT.steel): void => {
      const length = Math.abs(x2 - x1);
      const duct = new THREE.Mesh(new THREE.BoxGeometry(length, size, size), material);
      duct.position.set((x1 + x2) / 2, y, z);
      scene.add(duct);
      const joints = Math.max(2, Math.floor(length / 1.8));
      for (let i = 0; i <= joints; i++) {
        const jx = x1 + (i / joints) * (x2 - x1);
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.04, size * 1.14, size * 1.14), MAT.darkSteel);
        collar.position.set(jx, y, z);
        scene.add(collar);
        const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), MAT.darkSteel);
        hanger.position.set(jx, y + size / 2 + 0.15, z);
        scene.add(hanger);
      }
    };

    /** Szyna serwisowa na ścianie: ceownik + skrzynki przyłączeniowe + peszle. */
    const addServiceRail = (y: number, z: number, x1: number, x2: number): void => {
      const length = Math.abs(x2 - x1);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.09, 0.06), MAT.darkSteel);
      rail.position.set((x1 + x2) / 2, y, z);
      scene.add(rail);
      const boxes = Math.max(2, Math.floor(length / 2.2));
      for (let i = 0; i <= boxes; i++) {
        const bx = x1 + (i / boxes) * (x2 - x1);
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.1), MAT.plastic);
        box.position.set(bx, y - 0.16, z + 0.02);
        scene.add(box);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.008), MAT.display);
        led.position.set(bx, y - 0.09, z + 0.072);
        scene.add(led);
        const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.34, 8), MAT.steel);
        conduit.position.set(bx, y - 0.38, z + 0.02);
        scene.add(conduit);
      }
    };

    // --- Aparatura centralna jako SYSTEM, nie pojedynczy walec ---
    addContainmentFrame(VESSEL_POSITION[0], VESSEL_POSITION[2], 1.28, 3.0);

    // ==================================================================
    // OŚWIETLENIE WŁASNE APARATURY + WYPOSAŻENIE WNĘTRZA KOMORY.
    //
    // Dwa problemy, które sprawiały, że reaktor czytał się jak "szklana rura":
    //  1. Nie był najjaśniejszym obiektem kadru — konkurował z sufitem.
    //     Prawdziwe aparaty mają WŁASNĄ oprawę wpuszczoną w ramę, świecącą
    //     w dół, w komorę. To ona robi z instrumentu bohatera ujęcia.
    //  2. Wnętrze było PUSTE, dopóki nie ruszył eksperyment (drawRange
    //     kolonii = 0 w spoczynku), więc w stanie spoczynku patrzyło się
    //     na przezroczystą pustkę. Sprzęt wewnętrzny (maszt sondy, tace,
    //     wężownica, deflektory) jest KONSTRUKCJĄ, nie danymi — istnieje
    //     zawsze i nie udaje żadnego pomiaru.
    // ==================================================================
    {
      const rigY = VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 1.02;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.26), MAT.darkSteel);
      housing.position.set(VESSEL_POSITION[0], rigY, VESSEL_POSITION[2]);
      scene.add(housing);
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(1.74, 0.05, 0.14),
        new THREE.MeshBasicMaterial({ color: 0xf4faff }),
      );
      tube.position.set(VESSEL_POSITION[0], rigY - 0.08, VESSEL_POSITION[2]);
      scene.add(tube);
      for (const hx of [-0.8, 0.8]) {
        const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), MAT.steel);
        hanger.position.set(VESSEL_POSITION[0] + hx, rigY + 0.3, VESSEL_POSITION[2]);
        scene.add(hanger);
      }
      // Realne źródło skierowane w komorę — aparatura oświetla samą siebie.
      const chamberLight = new THREE.SpotLight(0xf2f8ff, 42, 5.4, Math.PI / 3.0, 0.75, 1.4);
      chamberLight.position.set(VESSEL_POSITION[0], rigY - 0.12, VESSEL_POSITION[2]);
      chamberLight.target.position.set(VESSEL_POSITION[0], 0.2, VESSEL_POSITION[2]);
      scene.add(chamberLight, chamberLight.target);

      // Maszt sondy w osi komory: trzon + pierścienie czujników.
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, VESSEL_HALF_HEIGHT * 1.85, 12), MAT.chrome);
      mast.position.set(VESSEL_POSITION[0] + 0.34, VESSEL_POSITION[1], VESSEL_POSITION[2] - 0.3);
      scene.add(mast);
      for (let r = 0; r < 4; r++) {
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 14), MAT.steel);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(VESSEL_POSITION[0] + 0.34, VESSEL_POSITION[1] - 0.62 + r * 0.42, VESSEL_POSITION[2] - 0.3);
        scene.add(collar);
      }
      // Dwie perforowane tace procesowe wewnątrz komory.
      for (const trayY of [VESSEL_POSITION[1] - 0.32, VESSEL_POSITION[1] + 0.36]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.018, 8, 36), MAT.steel);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(VESSEL_POSITION[0], trayY, VESSEL_POSITION[2]);
        scene.add(ring);
        for (let s = 0; s < 8; s++) {
          const a = (s / 8) * Math.PI * 2;
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.01, 0.022), MAT.steel);
          spoke.position.set(VESSEL_POSITION[0] + Math.cos(a) * 0.3, trayY, VESSEL_POSITION[2] + Math.sin(a) * 0.3);
          spoke.rotation.y = -a;
          scene.add(spoke);
        }
      }
      // Wężownica wymiennika przy ścianie komory — czytelny detal bioreaktora.
      const coilCurve: THREE_NS.Vector3[] = [];
      for (let i = 0; i <= 150; i++) {
        const t = i / 150;
        const a = t * Math.PI * 2 * 5;
        coilCurve.push(new THREE.Vector3(
          VESSEL_POSITION[0] + Math.cos(a) * 0.68,
          0.32 + t * (VESSEL_HALF_HEIGHT * 1.5),
          VESSEL_POSITION[2] + Math.sin(a) * 0.68,
        ));
      }
      const coil = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilCurve), 190, 0.017, 6, false),
        MAT.chrome,
      );
      scene.add(coil);
      // Deflektory (baffles) — cztery pionowe płyty przy ścianie.
      for (const a of [0.6, 2.2, 3.8, 5.4]) {
        const baffle = new THREE.Mesh(new THREE.BoxGeometry(0.04, VESSEL_HALF_HEIGHT * 1.5, 0.16), MAT.steel);
        baffle.position.set(VESSEL_POSITION[0] + Math.cos(a) * 0.74, VESSEL_POSITION[1], VESSEL_POSITION[2] + Math.sin(a) * 0.74);
        baffle.rotation.y = -a;
        scene.add(baffle);
      }
    }
    addValveManifold(VESSEL_POSITION[0] + 1.18, 1.12, VESSEL_POSITION[2] + 0.95, -0.62, 4);
    addPumpSkid(VESSEL_POSITION[0] - 1.35, VESSEL_POSITION[2] + 1.05, 0.5);
    addPumpSkid(VESSEL_POSITION[0] + 1.5, VESSEL_POSITION[2] - 1.3, -2.1);
    for (const [pAngle, pRadius] of [[0.6, 0.42], [2.4, 0.5], [4.2, 0.45]] as const) {
      addProbe(pAngle, pRadius, VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 0.86, 0.72);
    }
    addControlUnit(VESSEL_POSITION[0] - 1.95, VESSEL_POSITION[2] - 0.5, 1.15);
    addManipulator(VESSEL_POSITION[0] + 1.28, VESSEL_POSITION[2] + 0.05, -1.75);

    // --- Rurociągi łączące agregaty z reaktorem (system, nie dekoracja) ---
    addPipeRun(0.62, VESSEL_POSITION[2] + 1.05, VESSEL_POSITION[0] - 1.35, VESSEL_POSITION[0] - 0.6, 0.045, MAT.steel);
    addPipeRun(2.55, VESSEL_POSITION[2] + 0.95, VESSEL_POSITION[0] + 0.5, VESSEL_POSITION[0] + 1.18, 0.04, MAT.copper);

    // --- Zaplecze: dygestoria, regały, stojaki aparatury (drugi plan) ---
    addFumeHood(-3.15, 3.55, Math.PI);
    addFumeHood(-1.55, 3.55, Math.PI);
    addStorageRack(-5.4, 0.9, Math.PI / 2, 3);
    addStorageRack(3.05, -4.0, 0, 3);
    addInstrumentStack(-4.35, 1.55, 2.4, Math.PI / 2, 5);
    addInstrumentStack(1.6, 1.6, 3.62, Math.PI, 4);

    // --- Infrastruktura sufitowa: kanały wentylacyjne wzdłuż hali ---
    addDuctRun(roomHeight - 1.05, -2.1, -5.6, 5.6, 0.34, MAT.darkSteel);
    addDuctRun(roomHeight - 1.05, 2.3, -5.6, 2.4, 0.26, MAT.darkSteel);

    // --- Szyny serwisowe na ścianach (spójny system, ta sama wysokość) ---
    addServiceRail(2.42, PARTITION_Z + 0.08, -5.5, -3.75);
    addServiceRail(2.42, PARTITION_Z + 0.08, 3.75, 5.5);
    addServiceRail(2.42, 4.32, -5.4, 3.2);

    // --- Pierwszy plan przy kadrze otwierającym: barierka + stojak aparatury,
    //     które dają paralaksę i skalę zamiast pustej podłogi na dole kadru. ---
    const foreRailMat = MAT.steel;
    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.08, 10), foreRailMat);
      post.position.set(0.9 + i * 0.76, 0.54, 3.42 - i * 0.11);
      scene.add(post);
    }
    const foreRailTop = new THREE.Mesh(new THREE.BoxGeometry(3.95, 0.05, 0.05), foreRailMat);
    foreRailTop.position.set(2.8, 1.06, 3.15);
    foreRailTop.rotation.y = 0.145;
    scene.add(foreRailTop);
    const foreRailMid = new THREE.Mesh(new THREE.BoxGeometry(3.95, 0.032, 0.032), foreRailMat);
    foreRailMid.position.set(2.8, 0.7, 3.15);
    foreRailMid.rotation.y = 0.145;
    scene.add(foreRailMid);
    const foreKick = new THREE.Mesh(new THREE.BoxGeometry(3.95, 0.14, 0.03), MAT.darkSteel);
    foreKick.position.set(2.8, 0.13, 3.15);
    foreKick.rotation.y = 0.145;
    scene.add(foreKick);
    addInstrumentStack(5.15, 1.0, 0.35, -Math.PI / 2, 4);

    // ==================================================================
    // JĘZYK ŚWIATŁA LINIOWEGO — listwy LED wpisane w konstrukcję: wzdłuż
    // słupów ramy reaktora, po obwodzie podestu, wzdłuż blatów, w kratownicy
    // sufitowej i na krawędziach szaf. To one, razem z bloomem, dają czytelny
    // rysunek inżynierski hali w ciemnych partiach — dokładnie tam, gdzie
    // wcześniej była płaska, jednolita szarość. Materiały są emisyjne
    // (MeshBasic), więc nie kosztują żadnego dodatkowego światła w scenie.
    // ==================================================================
    const stripCyan = new THREE.MeshBasicMaterial({ color: 0x74e4ff, transparent: true, opacity: 0.92 });
    const stripWarm = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.42 });
    const stripDim = new THREE.MeshBasicMaterial({ color: 0x3f9fd4, transparent: true, opacity: 0.34 });

    /** Listwa LED: cienki, świecący prostopadłościan o zadanej osi i długości. */
    const addLightStrip = (
      x: number, y: number, z: number, length: number,
      axis: 'x' | 'y' | 'z', material: THREE_NS.Material, thickness = 0.022,
    ): void => {
      const size: [number, number, number] = axis === 'x'
        ? [length, thickness, thickness]
        : axis === 'y' ? [thickness, length, thickness] : [thickness, thickness, length];
      const strip = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      strip.position.set(x, y, z);
      scene.add(strip);
    };

    // Pionowe listwy na słupach ramy reaktora (rysują wysokość aparatury).
    {
      const d = 1.28 * Math.SQRT1_2 * 1.35;
      for (const [ox, oz] of [[-d, 0], [0, -d], [d, 0], [0, d]] as const) {
        addLightStrip(VESSEL_POSITION[0] + ox + (ox === 0 ? 0 : Math.sign(ox) * 0.058), 1.5,
          VESSEL_POSITION[2] + oz + (oz === 0 ? 0 : Math.sign(oz) * 0.058), 2.5, 'y', stripCyan, 0.018);
      }
      // Obwód podestu — pierścień z czterech odcinków (styk aparatury z podłogą).
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.016, 0.03), stripCyan);
        seg.position.set(VESSEL_POSITION[0] + Math.cos(a) * 1.16, 0.16, VESSEL_POSITION[2] + Math.sin(a) * 1.16);
        seg.rotation.y = -a;
        scene.add(seg);
      }
    }
    // Listwy pod blatami stołów laboratoryjnych (drugi plan zyskuje rysunek).
    addLightStrip(-4.4, 0.86, 2.4, 2.5, 'z', stripDim, 0.016);
    addLightStrip(-4.4, 0.86, -0.4, 1.9, 'z', stripDim, 0.016);
    addLightStrip(1.6, 0.86, 3.66, 2.7, 'x', stripDim, 0.016);
    addLightStrip(-1.9, 0.86, -4.31, 2.3, 'x', stripDim, 0.016);
    // Listwy w kratownicy sufitowej — rytm konstrukcyjny nad halą.
    for (const bz of [-2.6, 1.4]) addLightStrip(0, roomHeight - 0.74, bz, roomWidth - 0.6, 'x', stripWarm, 0.026);
    // Krawędzie szaf/regałów w tle.
    addLightStrip(-5.4, 2.14, 0.9, 1.8, 'z', stripDim, 0.014);
    addLightStrip(3.05, 2.14, -4.0, 1.8, 'x', stripDim, 0.014);
    // Listwa wzdłuż antresoli (już istniejącej) — spójny język w całej hali.
    addLightStrip(4.86, 1.82, -0.6, 4.3, 'z', stripCyan, 0.016);

    // ==================================================================
    // GĘSTOŚĆ DRUGIEGO PLANU — nie WIĘCEJ BRYŁ, tylko więcej DROBNEGO,
    // ŚWIECĄCEGO detalu technicznego. Referencyjne wnętrza czyta się jako
    // gęste nie dlatego, że stoi w nich więcej maszyn, ale dlatego, że każda
    // powierzchnia niesie porty, diody, złącza, etykiety i małe ekrany —
    // setki małych jasnych punktów w ciemnym tle. Wszystko poniżej to
    // parametryczne zespoły, nie rekwizyty rozrzucone po podłodze.
    // ==================================================================
    const ledGreen = new THREE.MeshBasicMaterial({ color: 0x6ef0a4 });
    const ledAmber = new THREE.MeshBasicMaterial({ color: 0xffc061 });
    const ledCyan = new THREE.MeshBasicMaterial({ color: 0x7fe6ff });
    const ledRed = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
    const ledPalette = [ledGreen, ledAmber, ledCyan, ledGreen, ledCyan, ledRed];
    const ledGeo = new THREE.BoxGeometry(0.022, 0.012, 0.008);
    const portGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.018, 10);

    /** Rząd diod statusowych — najtańszy sposób, żeby powierzchnia „żyła". */
    const addLedRow = (parent: THREE_NS.Object3D, x: number, y: number, z: number, count: number, spacing: number, seed: number): void => {
      for (let i = 0; i < count; i++) {
        const led = new THREE.Mesh(ledGeo, ledPalette[(i + seed) % ledPalette.length]!);
        led.position.set(x + i * spacing, y, z);
        parent.add(led);
      }
    };

    /**
     * Panel techniczny na ścianie: płyta bazowa, złącza, rząd diod, mały
     * wyświetlacz, opaska kablowa. Jeden zespół, wiele instancji.
     */
    const addTechPanel = (x: number, y: number, z: number, rotY: number, width: number, height: number, seed: number): void => {
      const panel = new THREE.Group();
      panel.position.set(x, y, z);
      panel.rotation.y = rotY;

      const plate = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), MAT.darkSteel);
      panel.add(plate);
      const bezel = new THREE.Mesh(new THREE.BoxGeometry(width + 0.03, height + 0.03, 0.03), MAT.steel);
      bezel.position.z = -0.02;
      panel.add(bezel);

      // Mały wyświetlacz z realnie świecącą powierzchnią.
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.42, height * 0.34), MAT.display);
      screen.position.set(-width * 0.22, height * 0.2, 0.032);
      panel.add(screen);

      // Złącza/porty w regularnej siatce — czyta się jak panel przyłączeniowy.
      for (let c = 0; c < 4; c++) {
        const port = new THREE.Mesh(portGeo, MAT.chrome);
        port.rotation.x = Math.PI / 2;
        port.position.set(width * 0.12 + (c % 2) * 0.08, height * 0.24 - Math.floor(c / 2) * 0.08, 0.035);
        panel.add(port);
      }
      addLedRow(panel, -width * 0.36, -height * 0.16, 0.034, 5, 0.045, seed);
      addLedRow(panel, -width * 0.36, -height * 0.3, 0.034, 5, 0.045, seed + 2);

      // Etykieta + przepust kablowy pod panelem.
      const label = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.3, 0.035), MAT.ceramic);
      label.position.set(width * 0.2, -height * 0.34, 0.033);
      panel.add(label);
      const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 10), MAT.steel);
      gland.position.set(0, -height / 2 - 0.02, 0.01);
      panel.add(gland);
      scene.add(panel);
    };

    /** Skrzynka przyłączeniowa z peszlami — łączy panele w jedną instalację. */
    const addJunctionBox = (x: number, y: number, z: number, rotY: number, seed: number): void => {
      const box = new THREE.Group();
      box.position.set(x, y, z);
      box.rotation.y = rotY;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.12), MAT.plastic);
      box.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.02), MAT.darkSteel);
      lid.position.z = 0.07;
      box.add(lid);
      addLedRow(box, -0.06, 0.06, 0.082, 3, 0.05, seed);
      for (const sx of [-0.07, 0.07]) {
        const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 8), MAT.steel);
        conduit.position.set(sx, -0.32, 0);
        box.add(conduit);
        const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 6), MAT.chrome);
        nut.position.set(sx, -0.16, 0);
        box.add(nut);
      }
      scene.add(box);
    };

    /** Zawór odcinający na rurociągu: korpus, koło, wskaźnik położenia. */
    const addWallValve = (x: number, y: number, z: number, rotY: number): void => {
      const valve = new THREE.Group();
      valve.position.set(x, y, z);
      valve.rotation.y = rotY;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 12), MAT.steel);
      body.rotation.z = Math.PI / 2;
      valve.add(body);
      const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.1, 10), MAT.copper);
      bonnet.position.y = 0.09;
      valve.add(bonnet);
      const wheel = new THREE.Mesh(GEO.handWheel, MAT.chrome);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.y = 0.15;
      valve.add(wheel);
      const indicator = new THREE.Mesh(ledGeo, ledGreen);
      indicator.position.set(0.05, 0.04, 0.055);
      valve.add(indicator);
      scene.add(valve);
    };

    // --- Panele techniczne na wszystkich czterech ścianach (rytm, nie chaos) ---
    for (let i = 0; i < 4; i++) {
      addTechPanel(-5.92, 1.9, -3.2 + i * 1.9, Math.PI / 2, 0.72, 0.5, i);
      addTechPanel(5.92, 1.9, -3.4 + i * 1.9, -Math.PI / 2, 0.72, 0.5, i + 3);
    }
    // Na tylnej ścianie zostaje tylko to, co mieści się OBOK przeszklenia
    // strefy E — inaczej panele wisiałyby w świetle otworu.
    for (const [pi, px] of [-5.3, -4.45, 4.45, 5.3].entries()) {
      addTechPanel(px, 2.05, PARTITION_Z + 0.06, 0, 0.66, 0.46, pi + 1);
    }
    for (let i = 0; i < 3; i++) {
      addTechPanel(-3.4 + i * 2.6, 2.05, 4.36, Math.PI, 0.66, 0.46, i + 4);
    }
    // --- Skrzynki przyłączeniowe pod panelami (spójna instalacja) ---
    for (let i = 0; i < 4; i++) {
      addJunctionBox(-5.86, 1.15, -3.2 + i * 1.9, Math.PI / 2, i);
      addJunctionBox(5.86, 1.15, -3.4 + i * 1.9, -Math.PI / 2, i + 2);
    }
    for (const [ji, jx] of [-5.25, -4.5, 4.5, 5.25].entries()) addJunctionBox(jx, 1.2, PARTITION_Z + 0.06, 0, ji + 1);
    // --- Zawory na rurociągach przy ścianach ---
    for (let i = 0; i < 5; i++) addWallValve(-4.6 + i * 2.3, roomHeight - 0.95, -3.9, 0);
    for (let i = 0; i < 3; i++) addWallValve(-2.4 + i * 2.6, roomHeight - 1.35, 3.9, Math.PI);
    // --- Diody na frontach istniejących szaf i regałów ---
    for (let i = 0; i < 4; i++) {
      const strip = new THREE.Group();
      strip.position.set(2.88, 1.45 - (i % 2) * 0.5, -2.0 + i * 0.62);
      strip.rotation.y = -Math.PI / 2;
      addLedRow(strip, -0.1, 0, 0, 6, 0.04, i);
      scene.add(strip);
    }

    // --- Oświetlenie zadaniowe stanowisk: oprawa nad każdym blatem ---
    // W realnym laboratorium każde stanowisko ma własne światło nad blatem.
    // Wizualnie to one budują drugi plan: jasne plamy na blatach dają rytm
    // i głębię, zamiast rzędu ciemnych sylwetek pod ścianą.
    const addBenchTaskLight = (x: number, z: number, rotY: number, length: number): void => {
      const rig = new THREE.Group();
      rig.position.set(x, 1.62, z);
      rig.rotation.y = rotY;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(length, 0.07, 0.12), MAT.darkSteel);
      rig.add(housing);
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(length - 0.1, 0.03, 0.07),
        new THREE.MeshBasicMaterial({ color: 0xbdd2e6 }),
      );
      tube.position.y = -0.05;
      rig.add(tube);
      for (const sx of [-length / 2 + 0.06, length / 2 - 0.06]) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 8), MAT.steel);
        stem.position.set(sx, 0.2, 0);
        rig.add(stem);
      }
      scene.add(rig);
      const lamp = new THREE.PointLight(0xf2f7ff, 1.45, 3.0, 2);
      lamp.position.set(x, 1.5, z);
      scene.add(lamp);
    };
    addBenchTaskLight(-4.34, 2.4, Math.PI / 2, 2.4);
    addBenchTaskLight(-4.34, -0.4, Math.PI / 2, 1.9);
    addBenchTaskLight(1.6, 3.62, Math.PI, 2.6);
    addBenchTaskLight(-1.9, -4.27, 0, 2.2);
    addBenchTaskLight(-3.15, 3.5, Math.PI, 1.3);

    // --- Oznakowanie strefy technicznej: pasy ostrzegawcze wokół reaktora ---
    // Naklejone na podłodze obrysowanie strefy pracy maszyn. Bardzo tani
    // element, a natychmiast komunikuje "hala przemysłowa", nie "szary pokój".
    {
      const hazardTex = makeHazardStripeTexture(THREE);
      hazardTex.repeat.set(10, 1);
      const hazardMat = new THREE.MeshStandardMaterial({
        map: hazardTex, roughness: 0.72, metalness: 0.1, transparent: true, opacity: 0.85, depthWrite: false,
      });
      const bandWidth = 0.3;
      const zoneHalf = 2.62;
      for (const [bx, bz, lengthX, lengthZ] of [
        [VESSEL_POSITION[0], VESSEL_POSITION[2] - zoneHalf, zoneHalf * 2, bandWidth],
        [VESSEL_POSITION[0], VESSEL_POSITION[2] + zoneHalf, zoneHalf * 2, bandWidth],
        [VESSEL_POSITION[0] - zoneHalf, VESSEL_POSITION[2], bandWidth, zoneHalf * 2],
        [VESSEL_POSITION[0] + zoneHalf, VESSEL_POSITION[2], bandWidth, zoneHalf * 2],
      ] as const) {
        const band = new THREE.Mesh(new THREE.PlaneGeometry(lengthX, lengthZ), hazardMat);
        band.rotation.x = -Math.PI / 2;
        band.position.set(bx, 0.019, bz);
        band.renderOrder = 2;
        scene.add(band);
      }
    }

    // --- Styk z podłożem: miękkie cienie kontaktowe pod ciężkim sprzętem ---
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: makeContactShadowTexture(THREE), transparent: true, depthWrite: false, opacity: 0.95,
    });
    const contactShadowGeo = new THREE.PlaneGeometry(1, 1);
    const addContactShadow = (x: number, z: number, radius: number, strength = 1): void => {
      const decal = new THREE.Mesh(contactShadowGeo, strength === 1 ? contactShadowMat : contactShadowMat.clone());
      if (strength !== 1) (decal.material as THREE_NS.MeshBasicMaterial).opacity = 0.95 * strength;
      decal.rotation.x = -Math.PI / 2;
      decal.scale.set(radius * 2, radius * 2, 1);
      decal.position.set(x, 0.022, z);
      decal.renderOrder = 1;
      scene.add(decal);
    };
    addContactShadow(VESSEL_POSITION[0], VESSEL_POSITION[2], 1.55);
    addContactShadow(VESSEL_POSITION[0] - 1.35, VESSEL_POSITION[2] + 1.05, 0.62, 0.85);
    addContactShadow(VESSEL_POSITION[0] + 1.5, VESSEL_POSITION[2] - 1.3, 0.62, 0.85);
    addContactShadow(VESSEL_POSITION[0] - 1.95, VESSEL_POSITION[2] - 0.5, 0.55, 0.8);
    addContactShadow(VESSEL_POSITION[0] + 1.28, VESSEL_POSITION[2] + 0.05, 0.5, 0.8);
    addContactShadow(-3.4, -2.0, 0.95, 0.9);
    addContactShadow(3.15, -0.8, 1.3, 0.75);
    addContactShadow(-1.9, 1.15, 0.4, 0.7);
    addContactShadow(-1.75, -1.5, 0.75, 0.7);
    addContactShadow(-3.15, 3.55, 0.85, 0.8);
    addContactShadow(-1.55, 3.55, 0.85, 0.8);
    addContactShadow(-5.4, 0.9, 1.0, 0.7);
    addContactShadow(3.05, -4.0, 1.0, 0.7);
    addContactShadow(-5.5, -3.6, 0.5, 0.7);
    addContactShadow(5.4, 2.9, 0.45, 0.7);
    addContactShadow(-4.4, 2.4, 1.3, 0.6);
    addContactShadow(-4.4, -0.4, 1.1, 0.6);
    addContactShadow(1.6, 3.7, 1.4, 0.6);
    addContactShadow(-1.9, -4.35, 1.2, 0.6);
    addContactShadow(0, 0.75, 0.45, 0.8);

    // ==================================================================
    // PRZEBUDOWA HERO + STREFA E: z "pokoju ze szklanym walcem" na OBIEKT.
    //
    // Dwa braki decydowały o tym, że kadr czytał się jak makieta, a nie jak
    // instalacja badawcza:
    //  1. Aparatura centralna była JEDNYM naczyniem. Prawdziwy reaktor to
    //     zespół: cokół, płaszcz, głowica z napędem, kolektor, szafa
    //     zasilania, pomost serwisowy, wiązka kabli. Sylwetka musi mieć
    //     kilka pięter, nie jedno.
    //  2. Hala kończyła się ścianą tuż za aparaturą. Referencyjne wnętrza
    //     są głębokie: za pierwszą nawą widać drugą, uciekającą w mgłę.
    //     Dopiero to daje wrażenie OBIEKTU większego niż kadr.
    // ==================================================================

    /** Element konstrukcyjny między dwoma punktami — ukosy, stężenia, cięgna. */
    const addStrut = (
      from: THREE_NS.Vector3Tuple, to: THREE_NS.Vector3Tuple,
      thickness: number, material: THREE_NS.Material,
    ): void => {
      const a = new THREE.Vector3(...from);
      const b = new THREE.Vector3(...to);
      const length = a.distanceTo(b);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(thickness, length, thickness), material);
      strut.position.copy(a).add(b).multiplyScalar(0.5);
      strut.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      scene.add(strut);
    };

    const VX = VESSEL_POSITION[0];
    const VZ = VESSEL_POSITION[2];
    const VESSEL_TOP = VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT;

    // KIERUNEK PATRZENIA na aparaturę (kadr otwierający i wejście pierwszej
    // osoby są po tej samej stronie, +X/+Z). Wszystko, co leży w tym wycinku
    // i jest wyższe od cokołu, przecina sylwetkę hero — a hero ma wygrywać
    // kadr. Zamiast dobierać pozycje po jednej, jeden wspólny test decyduje,
    // które elementy zespołu pomijamy albo odsuwamy na zewnątrz.
    const VIEW_AZIMUTH = Math.PI / 4;
    const angleTo = (worldAngle: number): number => {
      let delta = worldAngle - VIEW_AZIMUTH;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      return Math.abs(delta);
    };

    // --- Światło kluczowe na front aparatury (od strony kadru, z góry-boku) ---
    const heroKeyLight = new THREE.SpotLight(0xfff2df, 30, 10, Math.PI / 5.5, 0.6, 1.3);
    heroKeyLight.position.set(VESSEL_POSITION[0] + 2.6, 3.6, VESSEL_POSITION[2] + 2.9);
    heroKeyLight.target.position.set(VESSEL_POSITION[0], 1.45, VESSEL_POSITION[2]);
    scene.add(heroKeyLight.target);
    scene.add(heroKeyLight);

    // --- Światło konturowe zza aparatury: bez niego reaktor zlewa się z tłem ---
    const heroRimLight = new THREE.SpotLight(0x9fd0ff, 34, 11, Math.PI / 5, 0.55, 1.2);
    heroRimLight.position.set(VESSEL_POSITION[0] - 2.9, 3.5, VESSEL_POSITION[2] - 3.4);
    heroRimLight.target.position.set(VESSEL_POSITION[0], 1.6, VESSEL_POSITION[2]);
    scene.add(heroRimLight.target);
    scene.add(heroRimLight);

    // --- Cokół schodkowy: maszyna stoi NA CZYMŚ, nie unosi się nad podłogą ---
    for (const [tierRadius, tierY, tierHeight, tierMat] of [
      [1.74, 0.03, 0.06, MAT.darkSteel], [1.62, 0.09, 0.06, MAT.steel], [1.5, 0.15, 0.06, MAT.darkSteel],
    ] as const) {
      const tier = new THREE.Mesh(new THREE.CylinderGeometry(tierRadius, tierRadius + 0.02, tierHeight, 40), tierMat);
      tier.position.set(VX, tierY, VZ);
      scene.add(tier);
    }
    addBoltRing(VX, 0.19, VZ, 1.44, 24);

    // --- Głowica reaktora: kołnierz, dennica, napęd mieszadła, przekładnia ---
    const headFlange = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.14, 40), MAT.steel);
    headFlange.position.set(VX, VESSEL_TOP + 0.07, VZ);
    scene.add(headFlange);
    addBoltRing(VX, VESSEL_TOP + 0.15, VZ, 0.93, 20);
    // Dennica dostaje matową stal: polerowana łapała pod oprawą komory jeden
    // wypalony na biało odblask dokładnie na szczycie sylwetki.
    const headDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.86, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      MAT.steel,
    );
    headDome.scale.y = 0.52;
    headDome.position.set(VX, VESSEL_TOP + 0.13, VZ);
    scene.add(headDome);
    const gearbox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.38), MAT.darkSteel);
    gearbox.position.set(VX, VESSEL_TOP + 0.72, VZ);
    scene.add(gearbox);
    const driveMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.46, 20), MAT.steel);
    driveMotor.position.set(VX, VESSEL_TOP + 1.11, VZ);
    scene.add(driveMotor);
    for (let f = 0; f < 12; f++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.4, 0.012), MAT.darkSteel);
      const fa = (f / 12) * Math.PI * 2;
      fin.position.set(VX + Math.cos(fa) * 0.2, VESSEL_TOP + 1.11, VZ + Math.sin(fa) * 0.2);
      fin.rotation.y = -fa;
      scene.add(fin);
    }
    const motorCap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.06, 20), MAT.chrome);
    motorCap.position.set(VX, VESSEL_TOP + 1.37, VZ);
    scene.add(motorCap);

    // --- Sześć króćców z głowicy: w bok, w dół, do kolektora obwodowego ---
    const manifoldY = 0.62;
    const manifold = new THREE.Mesh(new THREE.TorusGeometry(1.58, 0.05, 10, 44), MAT.steel);
    manifold.rotation.x = Math.PI / 2;
    manifold.position.set(VX, manifoldY, VZ);
    scene.add(manifold);
    for (let n = 0; n < 6; n++) {
      const na = (n / 6) * Math.PI * 2 + 0.26;
      const cos = Math.cos(na);
      const sin = Math.sin(na);
      const nozzleY = VESSEL_TOP + 0.07;
      const run = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.56, 10), n % 2 === 0 ? MAT.steel : MAT.copper);
      run.rotation.z = Math.PI / 2;
      run.rotation.y = -na;
      run.position.set(VX + cos * 1.28, nozzleY, VZ + sin * 1.28);
      scene.add(run);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), MAT.chrome);
      elbow.position.set(VX + cos * 1.58, nozzleY, VZ + sin * 1.58);
      scene.add(elbow);
      // Pionowy spadek pomijamy tam, gdzie przeciąłby komorę na wprost widza.
      if (angleTo(na) < 0.72) continue;
      const dropHeight = nozzleY - manifoldY;
      const drop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.042, dropHeight, 10),
        n % 2 === 0 ? MAT.steel : MAT.copper,
      );
      drop.position.set(VX + cos * 1.58, manifoldY + dropHeight / 2, VZ + sin * 1.58);
      scene.add(drop);
      const tap = new THREE.Mesh(GEO.flange, MAT.chrome);
      tap.position.set(VX + cos * 1.58, manifoldY + dropHeight * 0.55, VZ + sin * 1.58);
      scene.add(tap);
      const nozzleLed = new THREE.Mesh(ledGeo, ledPalette[n % ledPalette.length]);
      nozzleLed.position.set(VX + cos * 1.64, manifoldY + 0.34, VZ + sin * 1.64);
      nozzleLed.rotation.y = -na;
      scene.add(nozzleLed);
    }

    // --- Osiem zbiorników procesowych wokół cokołu (media, bufory, próbki) ---
    for (let c = 0; c < 8; c++) {
      const ca = (c / 8) * Math.PI * 2 + 0.39;
      const cx = VX + Math.cos(ca) * 1.34;
      const cz = VZ + Math.sin(ca) * 1.34;
      if (angleTo(ca) < 0.5) continue;
      const canister = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.6, 14), c % 3 === 0 ? MAT.copper : MAT.steel);
      canister.position.set(cx, 0.5, cz);
      scene.add(canister);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.095, 0.05, 14), MAT.darkSteel);
      /* c.d. zespołu zbiornika */
      cap.position.set(cx, 0.82, cz);
      scene.add(cap);
      const sight = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.34, 0.012),
        new THREE.MeshBasicMaterial({ color: c % 2 === 0 ? 0x63e0b4 : 0x63b4e0, transparent: true, opacity: 0.9 }),
      );
      sight.position.set(cx + Math.cos(ca) * 0.098, 0.5, cz + Math.sin(ca) * 0.098);
      sight.rotation.y = -ca;
      scene.add(sight);
    }

    // --- Stężenia krzyżowe ramy nośnej: konstrukcja, nie cztery patyki ---
    {
      const d = 1.28 * Math.SQRT1_2 * 1.35;
      const feet: THREE_NS.Vector3Tuple[] = [[-d, 0, 0], [0, 0, -d], [d, 0, 0], [0, 0, d]];
      for (let i = 0; i < 4; i++) {
        const a = feet[i];
        const b = feet[(i + 1) % 4];
        const ax = VX + a[0];
        const az = VZ + a[2];
        const bx = VX + b[0];
        const bz = VZ + b[2];
        // Krzyż stężający rysuje się na tle komory, więc trafia wyłącznie na
        // ściany ramy odwrócone od widza. Poziome rygle zostają na wszystkich
        // czterech — cienka pozioma kreska nie zabiera sylwetki.
        const faceAngle = Math.atan2((a[2] + b[2]) / 2, (a[0] + b[0]) / 2);
        if (angleTo(faceAngle) > 1.1) {
          addStrut([ax, 0.95, az], [bx, 2.35, bz], 0.05, MAT.darkSteel);
          addStrut([ax, 2.35, az], [bx, 0.95, bz], 0.05, MAT.darkSteel);
        }
        // Belka obwodowa u góry ramy — domyka konstrukcję.
        addStrut([ax, 2.98, az], [bx, 2.98, bz], 0.075, MAT.steel);
        addStrut([ax, 0.92, az], [bx, 0.92, bz], 0.04, MAT.darkSteel);
      }
    }

    // --- Pomost serwisowy wokół aparatury: skala człowieka na wysokości ---
    const platformY = 2.42;
    // Pomost jest OTWARTY od strony kadru otwierającego (ćwiartka bez podestu
    // i bez barierki): pełny pierścień zasłaniał komorę poziomą kreską dokładnie
    // na wysokości oczu. Realne pomosty i tak mają wycięcie na dostęp.
    const PLATFORM_GAP_CENTER = Math.PI / 4;
    const PLATFORM_GAP_HALF = 0.98;
    const inPlatformGap = (worldAngle: number): boolean => {
      let delta = worldAngle - PLATFORM_GAP_CENTER;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      return Math.abs(delta) < PLATFORM_GAP_HALF;
    };
    const grating = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 2.02, 44, 1, 0, Math.PI * 1.5),
      new THREE.MeshStandardMaterial({
        ...wornFor(0x4a5568, { roughness: 0.68, wear: 0.6, seed: 101 }, 6, 6),
        metalness: 0.85, side: THREE.DoubleSide,
        normalMap: normalFor(8, 8), normalScale: new THREE.Vector2(0.5, 0.5),
      }),
    );
    grating.rotation.x = -Math.PI / 2;
    grating.position.set(VX, platformY, VZ);
    scene.add(grating);
    const kickPlate = new THREE.Mesh(
      new THREE.CylinderGeometry(2.02, 2.02, 0.09, 44, 1, true, Math.PI / 2, Math.PI * 1.5),
      MAT.darkSteel,
    );
    kickPlate.position.set(VX, platformY + 0.045, VZ);
    scene.add(kickPlate);
    for (let r = 0; r < 20; r++) {
      const ra = (r / 20) * Math.PI * 2;
      if (inPlatformGap(ra)) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.0, 8), MAT.steel);
      post.position.set(VX + Math.cos(ra) * 1.98, platformY + 0.5, VZ + Math.sin(ra) * 1.98);
      scene.add(post);
    }
    for (const railY of [platformY + 0.98, platformY + 0.6]) {
      const rail = new THREE.Mesh(
        new THREE.TorusGeometry(1.98, railY > platformY + 0.8 ? 0.026 : 0.018, 8, 44, Math.PI * 1.5),
        MAT.steel,
      );
      rail.rotation.x = Math.PI / 2;
      rail.position.set(VX, railY, VZ);
      scene.add(rail);
    }
    // Drabina serwisowa z podłogi na pomost.
    for (const side of [-0.22, 0.22]) {
      const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.035, platformY + 0.5, 0.035), MAT.steel);
      stringer.position.set(VX - 2.0 + side * 0.0, (platformY + 0.5) / 2, VZ + 1.32 + side);
      scene.add(stringer);
    }
    for (let rung = 0; rung < 8; rung++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.46), MAT.chrome);
      bar.position.set(VX - 2.0, 0.3 + rung * 0.29, VZ + 1.32);
      scene.add(bar);
    }
    // Listwa LED wzdłuż krawędzi pomostu — rysuje jego okrąg w ciemności.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (inPlatformGap(a)) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.014, 0.024), stripCyan);
      seg.position.set(VX + Math.cos(a) * 2.03, platformY - 0.02, VZ + Math.sin(a) * 2.03);
      seg.rotation.y = -a;
      scene.add(seg);
    }

    // --- Wiązka kabli z głowicy do szafy zasilania: masa i ciężar instalacji ---
    for (let k = 0; k < 6; k++) {
      const ka = 2.55 + k * 0.09;
      addCable(
        [VX + Math.cos(ka) * 0.95, VESSEL_TOP + 0.2, VZ + Math.sin(ka) * 0.95],
        [-2.42, 1.35 + k * 0.045, VZ - 0.42],
        0.32 + k * 0.03,
        0.017,
      );
    }
    for (let k = 0; k < 4; k++) {
      addCable(
        [VX + 1.42, manifoldY + 0.28, VZ - 1.42 + k * 0.06],
        [3.0, 0.9 + k * 0.05, VZ - 2.1],
        0.2,
        0.014,
      );
    }

    // --- Wnętrze komory: nie ma być pustej rury ---
    const chamberLed = new THREE.MeshBasicMaterial({ color: 0xbdf6ff });
    for (const ringY of [-0.55, 0.05, 0.62]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.014, 6, 36), chamberLed);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(VX, VESSEL_POSITION[1] + ringY, VZ);
      scene.add(ring);
    }
    // Trzecia taca hodowlana + fiolki na tacach: wnętrze ma zawartość naukową.
    const cultureTrayMat = new THREE.MeshStandardMaterial({ color: 0xc2d4e6, roughness: 0.26, metalness: 0.9, envMapIntensity: 1.6, side: THREE.DoubleSide });
    const vialMat = new THREE.MeshPhysicalMaterial({
      color: 0xc9e6ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1,
    });
    const vialFill = new THREE.MeshBasicMaterial({ color: 0x6ff0bd });
    for (const [trayY, vials] of [[-0.55, 8], [0.05, 8], [0.62, 6]] as const) {
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.014, 32), cultureTrayMat);
      tray.position.set(VX, VESSEL_POSITION[1] + trayY, VZ);
      scene.add(tray);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 6, 32), cultureTrayMat);
      lip.rotation.x = Math.PI / 2;
      lip.position.set(VX, VESSEL_POSITION[1] + trayY + 0.02, VZ);
      scene.add(lip);
      for (let v = 0; v < vials; v++) {
        const va = (v / vials) * Math.PI * 2 + trayY;
        const vx = VX + Math.cos(va) * 0.42;
        const vz = VZ + Math.sin(va) * 0.42;
        const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.1, 10), vialMat);
        vial.position.set(vx, VESSEL_POSITION[1] + trayY + 0.06, vz);
        scene.add(vial);
        const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.055, 10), vialFill);
        fill.position.set(vx, VESSEL_POSITION[1] + trayY + 0.038, vz);
        scene.add(fill);
      }
    }
    // Wiązka sond zwieszona z głowicy na różne głębokości.
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * Math.PI * 2 + 0.7;
      const depth = 0.5 + p * 0.22;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, depth, 8), MAT.chrome);
      rod.position.set(VX + Math.cos(pa) * 0.55, VESSEL_TOP - depth / 2 - 0.05, VZ + Math.sin(pa) * 0.55);
      scene.add(rod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), ledPalette[p % ledPalette.length]);
      tip.position.set(VX + Math.cos(pa) * 0.55, VESSEL_TOP - depth - 0.05, VZ + Math.sin(pa) * 0.55);
      scene.add(tip);
    }

    // ==================================================================
    // STREFA E — DRUGA NAWA ZA PRZESZKLONĄ PRZEGRODĄ.
    // Przegroda ma realną stolarkę (rygle, słupki, szyby), a za nią hala
    // ciągnie się jeszcze osiem metrów: rzędy szaf, słupy konstrukcyjne,
    // suwnica i drugi, odległy reaktor. Nic z tego nie jest interaktywne —
    // to warstwa GŁĘBI, która ma się czytać jako reszta obiektu.
    // ==================================================================
    const bayFrameMat = MAT.darkSteel;
    const partitionGlass = new THREE.MeshPhysicalMaterial({
      color: 0x8fb8dd, roughness: 0.09, metalness: 0, transparent: true, opacity: 0.14,
      clearcoat: 1, clearcoatRoughness: 0.06, ior: 1.5, envMapIntensity: 1.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const OPENING_HALF = 4.05;
    // Pełne fragmenty ściany po bokach otworu.
    for (const sideSign of [-1, 1]) {
      const solidWidth = ROOM.maxX - OPENING_HALF;
      const solid = new THREE.Mesh(new THREE.BoxGeometry(solidWidth, roomHeight, 0.16), bayFrameMat);
      solid.position.set(sideSign * (OPENING_HALF + solidWidth / 2), roomHeight / 2, PARTITION_Z);
      scene.add(solid);
    }
    // Rygiel dolny i nadproże.
    const sillHeight = 0.62;
    const lintelHeight = 0.55;
    const sill = new THREE.Mesh(new THREE.BoxGeometry(OPENING_HALF * 2, sillHeight, 0.2), bayFrameMat);
    sill.position.set(0, sillHeight / 2, PARTITION_Z);
    scene.add(sill);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(OPENING_HALF * 2, lintelHeight, 0.2), bayFrameMat);
    lintel.position.set(0, roomHeight - lintelHeight / 2, PARTITION_Z);
    scene.add(lintel);
    const glazedHeight = roomHeight - sillHeight - lintelHeight;
    const glazedCenterY = sillHeight + glazedHeight / 2;
    // Słupki podziału + szyby między nimi.
    for (let m = 0; m <= 4; m++) {
      const mx = -OPENING_HALF + (m / 4) * OPENING_HALF * 2;
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.1, glazedHeight, 0.18), bayFrameMat);
      mullion.position.set(mx, glazedCenterY, PARTITION_Z);
      scene.add(mullion);
    }
    const transom = new THREE.Mesh(new THREE.BoxGeometry(OPENING_HALF * 2, 0.08, 0.16), bayFrameMat);
    transom.position.set(0, sillHeight + glazedHeight * 0.66, PARTITION_Z);
    scene.add(transom);
    const glazing = new THREE.Mesh(new THREE.PlaneGeometry(OPENING_HALF * 2 - 0.1, glazedHeight - 0.06), partitionGlass);
    glazing.position.set(0, glazedCenterY, PARTITION_Z);
    scene.add(glazing);
    // Listwa ostrzegawcza na ryglu — ten sam język, co przy reaktorze.
    addLightStrip(0, sillHeight + 0.04, PARTITION_Z + 0.11, OPENING_HALF * 2, 'x', stripWarm, 0.02);

    // Posadzka drugiej nawy — ciemniejsza, bardziej matowa niż strefa robocza.
    const deepFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth - 0.05, DEEP_BAY_DEPTH),
      new THREE.MeshStandardMaterial({
        ...wornFor(0x141a28, { roughness: 0.6, wear: 0.5, seed: 133 }, 6, 6),
        metalness: 0.2, normalMap: normalFor(10, 8), normalScale: new THREE.Vector2(0.28, 0.28),
      }),
    );
    deepFloor.rotation.x = -Math.PI / 2;
    deepFloor.position.set(roomCenterX, 0.008, ROOM.minZ - DEEP_BAY_DEPTH / 2);
    scene.add(deepFloor);

    // Rytm konstrukcyjny: słupy i belki uciekające w głąb — to one budują
    // perspektywę, bez nich druga nawa byłaby płaskim tłem.
    const deepStripMat = new THREE.MeshBasicMaterial({ color: 0xe6f1ff });
    for (let b = 0; b < 5; b++) {
      const bz = ROOM.minZ - 1.5 - b * 1.72;
      for (const cx of [-4.3, 4.3]) {
        const column = new THREE.Mesh(new THREE.BoxGeometry(0.24, roomHeight, 0.24), MAT.darkSteel);
        column.position.set(cx, roomHeight / 2, bz);
        scene.add(column);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.3, 0.16), MAT.darkSteel);
      beam.position.set(0, roomHeight - 0.42, bz);
      scene.add(beam);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.09, 0.2), deepStripMat);
      bar.position.set(0, roomHeight - 0.72, bz);
      scene.add(bar);
      // Dwa światła na całą nawę — reszta rytmu to emisja, nie koszt świateł.
      if (b === 0 || b === 2 || b === 4) {
        const deepLamp = new THREE.PointLight(0xcfe2ff, 20, 13, 2);
        deepLamp.position.set(0, roomHeight - 1.0, bz);
        scene.add(deepLamp);
      }
    }
    // Szyna suwnicy przez całą drugą nawę + wózek.
    for (const rx of [-4.0, 4.0]) {
      const craneRail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, DEEP_BAY_DEPTH), MAT.steel);
      craneRail.position.set(rx, roomHeight - 0.95, ROOM.minZ - DEEP_BAY_DEPTH / 2);
      scene.add(craneRail);
    }
    const craneBridge = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.3, 0.42), MAT.steel);
    craneBridge.position.set(0, roomHeight - 1.05, ROOM.minZ - 3.4);
    scene.add(craneBridge);
    const craneTrolley = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.6), MAT.darkSteel);
    craneTrolley.position.set(1.3, roomHeight - 1.42, ROOM.minZ - 3.4);
    scene.add(craneTrolley);
    const craneHook = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), MAT.chrome);
    craneHook.position.set(1.3, roomHeight - 2.42, ROOM.minZ - 3.4);
    scene.add(craneHook);

    // Rzędy szaf aparaturowych po obu stronach nawy — masa i informacja.
    const deepPanelMat = new THREE.MeshBasicMaterial({ color: 0x4fb9e8, transparent: true, opacity: 0.34 });
    for (let r = 0; r < 6; r++) {
      const rz = ROOM.minZ - 1.1 - r * 1.45;
      for (const sideSign of [-1, 1]) {
        const rx = sideSign * (4.05 + (r % 2) * 0.35);
        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.15 + (r % 3) * 0.22, 0.8), MAT.darkSteel);
        cabinet.position.set(rx, (2.15 + (r % 3) * 0.22) / 2, rz);
        cabinet.rotation.y = sideSign * Math.PI / 2;
        scene.add(cabinet);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), deepPanelMat);
        face.position.set(rx - sideSign * 0.42, 1.55, rz);
        face.rotation.y = -sideSign * Math.PI / 2;
        scene.add(face);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1.4), stripDim);
        edge.position.set(rx - sideSign * 0.41, 0.35, rz);
        scene.add(edge);
      }
    }
    // Drugi, odległy reaktor — dowód, że eksperyment nie jest jedyny w obiekcie.
    {
      const farZ = ROOM.minZ - 5.6;
      const farX = -1.5;
      const farBase = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.3, 28), MAT.darkSteel);
      farBase.position.set(farX, 0.15, farZ);
      scene.add(farBase);
      const farShell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.92, 0.96, 2.3, 28, 1, true),
        new THREE.MeshPhysicalMaterial({
          color: 0xa9d8f0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22,
          clearcoat: 1, envMapIntensity: 2.0, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      farShell.position.set(farX, 1.45, farZ);
      scene.add(farShell);
      const farCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 1.5, 20),
        new THREE.MeshBasicMaterial({ color: 0x2f7fa8, transparent: true, opacity: 0.5 }),
      );
      farCore.position.set(farX, 1.2, farZ);
      scene.add(farCore);
      const farHead = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.16, 28), MAT.steel);
      farHead.position.set(farX, 2.68, farZ);
      scene.add(farHead);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.1, 0.1), MAT.darkSteel);
        col.position.set(farX + Math.cos(a) * 1.24, 1.55, farZ + Math.sin(a) * 1.24);
        scene.add(col);
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.014, 0.022), stripCyan);
        seg.position.set(farX + Math.cos(a) * 1.3, 0.32, farZ + Math.sin(a) * 1.3);
        seg.rotation.y = -a;
        scene.add(seg);
      }
      const farGlow = new THREE.PointLight(0x63c8ff, 7, 6, 2);
      farGlow.position.set(farX, 1.5, farZ);
      scene.add(farGlow);
    }
    // Świetlna ściana czołowa drugiej nawy. Sylwetki maszyn na jasnym tle
    // czytają się jako plany w głąb nawet wtedy, gdy same są prawie czarne —
    // to działa mocniej niż doświetlanie każdej maszyny z osobna.
    {
      const backZ = ROOM.minZ - DEEP_BAY_DEPTH + 0.25;
      const lightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(roomWidth - 0.6, 3.1),
        new THREE.MeshBasicMaterial({ color: 0x8fb6d8 }),
      );
      lightWall.position.set(roomCenterX, 1.9, backZ);
      scene.add(lightWall);
      const wallFrame = new THREE.Mesh(
        new THREE.BoxGeometry(roomWidth - 0.4, 0.16, 0.14),
        MAT.darkSteel,
      );
      wallFrame.position.set(roomCenterX, 3.53, backZ + 0.1);
      scene.add(wallFrame);
      for (let i = 1; i < 6; i++) {
        const mull = new THREE.Mesh(new THREE.BoxGeometry(0.13, 3.1, 0.12), MAT.darkSteel);
        mull.position.set(-4.6 + i * 1.85, 1.9, backZ + 0.1);
        scene.add(mull);
      }
      const wallGlow = new THREE.PointLight(0xa8c8e8, 22, 11, 2);
      wallGlow.position.set(roomCenterX, 2.2, backZ + 1.6);
      scene.add(wallGlow);
      // Sylwetki tuż przed świetlną ścianą — to one robią kontrast planów.
      for (let i = 0; i < 7; i++) {
        const sx = -4.6 + i * 1.55;
        const sh = 1.5 + ((i * 7) % 5) * 0.32;
        const silhouette = new THREE.Mesh(
          new THREE.BoxGeometry(0.9 + (i % 3) * 0.25, sh, 0.7),
          MAT.darkSteel,
        );
        silhouette.position.set(sx, sh / 2, backZ + 1.05 + (i % 2) * 0.5);
        scene.add(silhouette);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.24), MAT.darkSteel);
        cap.position.set(sx, sh + 0.25, backZ + 1.05 + (i % 2) * 0.5);
        scene.add(cap);
      }
    }

    // GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 1.0: real production use of the reusable lab
    // furniture kit (`graphics/labKit.ts`) and water/fluid infrastructure kit
    // (`graphics/waterInfrastructure.ts`) — not just proven in their own isolated example files.
    // Placed in STREFA E's open central corridor (|x| < ~3, clear of the side cabinet rows at
    // |x| > 4, the crane trolley at x=1.3/z=ROOM.minZ-3.4, and the far reactor at x=-1.5) as
    // ADDITIONAL background equipment — purely additive, every hand-tuned object above is untouched.
    // The pump defaults to NORMAL and is never driven to WARNING/FAILED here: this scene has no real
    // pressure/flow feed to back that claim (see waterInfrastructure.ts's own "never fabricate a
    // state" rule) — it reads as installed lab plumbing, not a monitored, currently-failing asset.
    {
      const auxBenchZ = ROOM.minZ - 2.2;
      const auxBench = createBench(THREE, {
        position: [-1.7, 0, auxBenchZ], width: 1.3, depth: 0.6, height: 0.9, topMaterial: MAT.worktop, legMaterial: MAT.darkSteel,
      });
      scene.add(auxBench);
      const auxCabinet = createCabinet(THREE, {
        position: [-1.7, 0, auxBenchZ + 0.75], width: 0.7, depth: 0.5, height: 1.1, bodyMaterial: MAT.darkSteel, doorMaterial: MAT.steel,
      });
      scene.add(auxCabinet);
      const auxShelf = createShelfUnit(THREE, {
        position: [-2.6, 0, auxBenchZ], width: 0.55, depth: 0.32, height: 1.7, material: MAT.steel, shelfCount: 4,
      });
      scene.add(auxShelf);
      const auxMonitor = createMonitor(THREE, {
        position: [-1.7, 0.9, auxBenchZ - 0.28], width: 0.34, height: 0.22, frameMaterial: MAT.darkSteel, screenMaterial: MAT.display,
      });
      scene.add(auxMonitor);

      const auxUtilityZ = ROOM.minZ - 6.4;
      const auxPump = createPump(THREE, {
        position: [1.7, 0, auxUtilityZ], housingMaterial: MAT.darkSteel, pipeMaterial: MAT.copper, state: 'NORMAL',
      });
      // No real C1/C3 hydraulic entity backs this pump (see waterInfrastructureBridge.ts's own
      // doc for the same boundary at the WorldFrame-integration level) — tagged so "no fake C3
      // state is generated" is machine-checkable, not just documented in prose.
      auxPump.group.userData.notModeled = true;
      scene.add(auxPump.group);
      const auxValve = createValve(THREE, { position: [1.9, 0.12, auxUtilityZ + 0.14], material: MAT.chrome });
      scene.add(auxValve);
      const auxPipeRun = createPipeNetwork(THREE, {
        waypoints: [[1.7, 0.12, auxUtilityZ - 0.06], [1.7, 0.12, auxUtilityZ - 0.5], [2.3, 0.12, auxUtilityZ - 0.5]],
        radius: 0.02, material: MAT.copper,
      });
      scene.add(auxPipeRun);
    }

    // Ciąg komunikacyjny w osi nawy — perspektywa czytana z samej podłogi.
    for (let i = 0; i < 10; i++) {
      const gz = ROOM.minZ - 0.8 - i * 0.82;
      for (const gx of [-2.5, 2.5]) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.07), stripWarm);
        marker.position.set(gx, 0.02, gz);
        scene.add(marker);
      }
    }

    // --- PIERWSZY PLAN: instalacja tuż przy obiektywie kadru otwierającego ---
    // Ciemna, nieostra masa na krawędzi kadru natychmiast buduje głębię —
    // bez niej scena zaczyna się dopiero przy aparaturze.
    for (let i = 0; i < 7; i++) {
      addCable(
        [5.86, roomHeight - 0.7 - i * 0.06, 1.1 + i * 0.12],
        [5.86, 1.15, 2.55 + i * 0.1],
        0.18 + (i % 3) * 0.04,
        0.019,
      );
    }
    const foreConduit = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, roomHeight - 0.6, 14), MAT.darkSteel);
    foreConduit.position.set(-5.28, (roomHeight - 0.6) / 2, 3.62);
    scene.add(foreConduit);
    for (let i = 0; i < 5; i++) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.06, 14), MAT.steel);
      collar.position.set(-5.28, 0.5 + i * 0.85, 3.62);
      scene.add(collar);
    }
    addContactShadow(-5.28, 3.62, 0.4, 0.8);

    // GENESIS GRAPHICS ENGINE — one shadow-policy pass over the scene built so far (the view-model
    // hands below are added afterward and get their own explicit castShadow=false, so running this
    // first doesn't miss or mis-tag them). This used to be an inline copy of exactly
    // `graphics/shadowPolicy.ts::applyShadowPolicy`'s own algorithm (same 0.18/0.3 thresholds,
    // same transparent-only-receives rule) — duplicated logic with no behavior difference, now
    // consolidated onto the one shared implementation instead of two copies that could silently
    // drift apart.
    applyShadowPolicy(THREE, scene);

    // ==================================================================
    // NAUKOWIEC W PIERWSZEJ OSOBIE — przedramiona w rękawie kombinezonu PPE
    // i rękawice nitrylowe, przypięte do kadru kamery. To nie jest ozdoba:
    // bez ciała pierwsza osoba czyta się jak bezcielesna kamera, a cel tego
    // laboratorium brzmi "JESTEM naukowcem w środku". Ręce reagują na realny
    // stan: przy konsoli (nearStation) prawa ręka wyciąga się do pulpitu.
    // Nie rzucają cienia (byłby to cień "unoszącej się" geometrii tuż przy
    // obiektywie) i nie istnieją w kadrach kamer naukowych.
    // ==================================================================
    {
      const suitMat = new THREE.MeshStandardMaterial({ color: 0x76869c, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.25, normalMap: normalFor(6, 6), normalScale: new THREE.Vector2(0.5, 0.5) });
      const cuffMat = new THREE.MeshStandardMaterial({ color: 0x243149, roughness: 0.7, metalness: 0.15, envMapIntensity: 0.3 });
      const gloveMat = new THREE.MeshStandardMaterial({ color: 0x2f5fae, roughness: 0.52, metalness: 0.02, envMapIntensity: 0.4 });

      /** Jedno przedramię: rękaw + mankiet + dłoń w rękawicy + kciuk. */
      const buildArm = (side: 1 | -1): THREE_NS.Group => {
        const pivot = new THREE.Group();
        // Bark poza kadrem, z boku i poniżej obiektywu.
        pivot.position.set(side * 0.26, -0.235, -0.06);

        const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.34, 6, 14), suitMat);
        sleeve.position.set(0, -0.035, -0.24);
        sleeve.rotation.x = Math.PI / 2;
        pivot.add(sleeve);

        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.047, 0.042, 16), cuffMat);
        cuff.position.set(0, -0.052, -0.4);
        cuff.rotation.x = Math.PI / 2;
        pivot.add(cuff);

        const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.075, 5, 14), gloveMat);
        hand.position.set(0, -0.06, -0.475);
        hand.rotation.x = Math.PI / 2;
        pivot.add(hand);

        const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.038, 3, 8), gloveMat);
        thumb.position.set(-side * 0.034, -0.045, -0.5);
        thumb.rotation.set(Math.PI / 2, 0, side * 0.5);
        pivot.add(thumb);

        // Lekko rozchylone na zewnątrz i do środka kadru — pozycja spoczynkowa.
        pivot.rotation.set(0.26, side * 0.3, side * 0.16);
        return pivot;
      };

      this.viewModel = new THREE.Group();
      this.leftArmPivot = buildArm(-1);
      this.rightArmPivot = buildArm(1);
      this.viewModel.add(this.leftArmPivot, this.rightArmPivot);
      this.viewModel.visible = false;
      // Ręce przy obiektywie nie mogą wpadać w mapę cieni ani być przez nią
      // przecinane — to geometria kadru, nie element sceny.
      //
      // WŁASNA WARSTWA OŚWIETLENIA (layer 1). Rękawy stoją ~0.4 m od
      // obiektywu, czyli tuż pod punktowymi światłami hali z decay=2 —
      // przy takiej odległości dostawały wielokrotnie więcej energii niż
      // cokolwiek w scenie i wypalały się na biało niezależnie od koloru
      // materiału. Standardowe rozwiązanie dla modelu widoku: własna
      // warstwa, do której NIE sięgają światła sceny, plus jedno dedykowane,
      // miękkie światło o kontrolowanym natężeniu.
      this.viewModel.traverse((object) => {
        const mesh = object as THREE_NS.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;
          mesh.renderOrder = 5;
        }
        object.layers.set(1);
      });
      const viewModelKey = new THREE.DirectionalLight(0xc3d2e8, 0.5);
      viewModelKey.position.set(0.4, 0.9, 1);
      viewModelKey.layers.set(1);
      this.viewModel.add(viewModelKey);
      const viewModelFill = new THREE.HemisphereLight(0x8ba0bd, 0x161c26, 0.32);
      viewModelFill.layers.set(1);
      this.viewModel.add(viewModelFill);
      // Kamera musi widzieć obie warstwy: świat (0) i model widoku (1).
      camera.layers.enable(1);
      scene.add(this.viewModel);
    }

    // KADR OTWIERAJĄCY: scena startuje w szerokim, skomponowanym ujęciu całej
    // hali (FIXED/WIDE), a nie tuż przy szkle naczynia. Pierwszą rzeczą, którą
    // widzi użytkownik, jest więc laboratorium jako całość; dopiero wejście w
    // tryb pierwszoosobowy (returnToFirstPerson) oddaje mu sterowanie.
    const opening = scientificFraming('WIDE');
    this.liveCameraPosition = [...opening.position];
    this.liveCameraLookAt = [...opening.lookAt];
    this.cameraPhase = 'FIXED';
    this.fixedKind = 'WIDE';
    camera.position.set(...opening.position);
    camera.lookAt(...opening.lookAt);
    // FOV szerszy niż domyślne 50° useThreeLoop — 50° czyta się jak teleobiektyw i
    // ściska pokój; 68° w pierwszej osobie mieści całą powiększoną aparaturę
    // nawet z bliska, zamiast kadrować sam środek kopuły/klatki.
    camera.fov = 68;
    camera.updateProjectionMatrix();
  }

  update(dt: number, params: SimParams): void {
    void params;
    if (this.cameraPhase === 'FLIGHT' && this.flight) {
      const flightState = this.flight.advance(dt);
      this.liveCameraPosition = [flightState.position[0], flightState.position[1], flightState.position[2]];
      this.liveCameraLookAt = [flightState.lookAt[0], flightState.lookAt[1], flightState.lookAt[2]];
      if (flightState.done) {
        this.flight = null;
        if (this.flightGoingToFree) {
          this.cameraPhase = 'FREE';
          this.fixedKind = 'NONE';
        } else {
          this.cameraPhase = 'FIXED';
        }
      }
    } else if (this.cameraPhase === 'FREE') {
      const state = this.controller.update(dt);
      const forward = this.controller.getForward();
      this.liveCameraPosition = [state.position.x, state.position.y, state.position.z];
      this.liveCameraLookAt = [state.position.x + forward.x, state.position.y + Math.sin(state.pitch), state.position.z + forward.z];
    }
    // W stałym kadrze (FIXED) kamera nie potrzebuje aktualizacji co klatkę — pozostaje tam, gdzie zakończył się lot.
    // Poza samą pozycją: licznik "oddechu" narasta tylko w FIXED (patrz syncScene) — subtelny drift kamery, żeby ujęcie nie było martwym stopklatka-kadrem.
    if (this.cameraPhase === 'FIXED') this.fixedBreatheT += dt;

    // Agitator i pierścień holograficzny: czysto wizualna animacja, ale jej
    // PRĘDKOŚĆ jest funkcją REALNEGO obłożenia — nigdy stała/zmyślona liczba.
    if (this.agitatorGroup) this.agitatorGroup.rotation.y += dt * (0.6 + this.vesselFraction * 5.2);
    if (this.hologramRing) this.hologramRing.rotation.z += dt * (0.25 + this.vesselIcuFraction * 1.6);
    if (this.colonyPoints) this.colonyPoints.rotation.y += dt * (0.3 + this.vesselFraction * 1.8);
    this.dustMotes?.update(dt);

    if (this.playSeriesData.length > 0 && !this.playbackDone && !this.playbackPaused) {
      this.playElapsed += dt;
      const nextIndex = Math.min(this.playSeriesData.length - 1, Math.floor(this.playElapsed * DAYS_PER_SECOND));
      if (nextIndex !== this.playDayIndex) {
        this.playDayIndex = nextIndex;
        this.applyDay(this.playSeriesData[nextIndex]!);
        if (nextIndex >= this.playSeriesData.length - 1) {
          this.playbackDone = true;
          // REALNE zakończenie eksperymentu — jeśli anomalia nie zabrała już
          // kamery, dajemy "ujęcie rozstrzygnięcia" na tym samym stanowisku.
          // To reakcja na PRAWDZIWE zdarzenie (koniec serii), nie zmyślony dramat.
          if (this.playTag !== 'REPLAY' && this.cameraPhase === 'FREE') this.focusScientific('SCIENTIFIC');
        }
      }
    }
  }

  syncScene(scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    const THREE = this.THREE!;
    camera.position.set(...this.liveCameraPosition);
    if (this.cameraPhase === 'FREE') {
      const state = this.controller.getState();
      const euler = new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);
      // Chód (head bob): wyłącznie prezentacyjne przesunięcie oka — patrz
      // firstPersonController.ts. Nigdy nie dotyka pozycji użytej do kolizji/interakcji.
      camera.position.y += state.bobOffset;
    } else {
      if (this.cameraPhase === 'FIXED') {
        // Kinowy "oddech": mikroskopijny, ciągły drift — tak jak przy statywie
        // z operatorem, nie martwa stopklatka. Amplituda celowo mała, żeby
        // nigdy nie psuć kompozycji ustawionej w scientificFraming().
        camera.position.x += Math.sin(this.fixedBreatheT * 0.35) * 0.035;
        camera.position.y += Math.sin(this.fixedBreatheT * 0.5 + 1.3) * 0.02;
      }
      camera.lookAt(this.liveCameraLookAt[0], this.liveCameraLookAt[1], this.liveCameraLookAt[2]);
    }

    // GENESIS GRAPHICS ENGINE — obiektyw (FOV/near/far) dobrany do bieżącego
    // kadru przez `configureCinematicCamera`, nie jeden stały kąt na cały
    // czas: WIDE (kadr otwierający) i FREE (pierwsza osoba) zostają na
    // szerokim 68° (profile WIDE_ESTABLISHING/SCIENTIST_POV), ale SCIENTIFIC/
    // ANOMALY/REPLAY dostają realny ciaśniejszy obiektyw (HERO_CLOSE_UP, 40°)
    // zamiast tego samego szerokiego kadru co scena otwierająca — razem z
    // ostrością DOF, którą `setupPostProcessing`/`this.pipeline.setFocusDistance`
    // już przestraja poniżej, to robi z tych ujęć faktyczne zbliżenie kinowe.
    // Zastosowywane WYŁĄCZNIE przy zmianie ujęcia (nie co klatkę) przez
    // `appliedCinematicProfile`.
    const desiredCinematicProfile: CinematicCameraProfile = this.cameraPhase === 'FREE' || this.flightGoingToFree
      ? 'SCIENTIST_POV'
      : this.fixedKind === 'WIDE'
        ? 'WIDE_ESTABLISHING'
        : 'HERO_CLOSE_UP';
    if (desiredCinematicProfile !== this.appliedCinematicProfile) {
      configureCinematicCamera(camera, desiredCinematicProfile);
      this.appliedCinematicProfile = desiredCinematicProfile;
    }

    // Naczynie: wysokość = realne obłożenie łóżek, kolor = realny status (uwzględnia też ICU/unmetCare).
    let vesselColor = STATUS_COLOR.NORMAL;
    if (this.fluidMesh) {
      const height = Math.max(0.02, this.vesselFraction) * VESSEL_MAX_FILL_HEIGHT;
      this.fluidMesh.scale.y = height;
      this.fluidMesh.position.y = 0.15 + height / 2;
      vesselColor = this.vesselStatus === 'IDLE' ? STATUS_COLOR.NORMAL : STATUS_COLOR[this.vesselStatus];
      const material = this.fluidMesh.material as THREE_NS.MeshStandardMaterial;
      material.color.setHex(vesselColor);
      material.emissive.setHex(vesselColor);
      if (this.vesselLight) {
        this.vesselLight.color.setHex(vesselColor);
        this.vesselLight.intensity = 4.2 + this.vesselFraction * 3.4;
      }
      if (this.linerMaterial) this.linerMaterial.color.setHex(vesselColor);
      if (this.plinthMaterial) this.plinthMaterial.color.setHex(vesselColor);
      if (this.colonyMaterial && this.colonyPoints) {
        this.colonyMaterial.color.setHex(vesselColor);
        this.colonyPoints.geometry.setDrawRange(0, Math.round(this.colonyMaxCount * this.vesselFraction));
      }
    }
    // Drugi realny sygnał (obłożenie ICU) na akcentowym świetle instrumentu — nic wizualnego ponad to nie jest zmyślone.
    if (this.icuLight) this.icuLight.intensity = 0.3 + this.vesselIcuFraction * 1.4;
    // Pierścień holograficzny: kolor = ten sam realny status naczynia, opacity
    // rośnie z realnym obłożeniem ICU — żadna wartość liczbowa nie jest na nim wyświetlana.
    if (this.hologramMaterial) {
      this.hologramMaterial.color.setHex(vesselColor);
      this.hologramMaterial.opacity = 0.3 + this.vesselIcuFraction * 0.5;
    }
    // Ekran monitora jaśnieje wyłącznie wtedy, gdy realnie coś się właśnie odtwarza
    // (playSeriesData obecne i nie zakończone) — prawdziwy sygnał stanu, nie ozdoba.
    const isPlaying = this.playSeriesData.length > 0 && !this.playbackDone;
    if (this.monitorScreen) {
      const material = this.monitorScreen.material as THREE_NS.MeshStandardMaterial;
      material.emissiveIntensity = isPlaying ? 0.85 : 0.15;
    }
    this.drawReadout();
    // Szafy aparaturowe w tle: ten sam realny sygnał "playing" co mały monitor
    // — infrastruktura "budzi się" podczas prawdziwego przebiegu, nic więcej.
    for (const strip of this.rackScreens) {
      const material = strip.material as THREE_NS.MeshStandardMaterial;
      material.emissiveIntensity = isPlaying ? 0.75 : 0.2;
    }

    // WIDOK NAUKOWCA: ręce podążają za kamerą (pozycja + orientacja), więc są
    // częścią kadru, nie obiektem w hali. Widoczne tylko w pierwszej osobie —
    // kamery naukowe pokazują aparaturę, nie rękawice operatora.
    if (this.viewModel) {
      const firstPerson = this.cameraPhase === 'FREE';
      this.viewModel.visible = firstPerson;
      if (firstPerson) {
        this.viewModel.position.copy(camera.position);
        this.viewModel.quaternion.copy(camera.quaternion);
        // Kołysanie zsynchronizowane z realnym krokiem kontrolera (ten sam
        // bobOffset, którym już porusza się oko) — ręce nie mogą stać w
        // miejscu, gdy postać idzie.
        const walkState = this.controller.getState();
        this.viewModelBobT += 0.016;
        const sway = walkState.bobOffset * 2.4;
        const idle = Math.sin(this.viewModelBobT * 1.3) * 0.004;
        // Sięgnięcie do pulpitu: wygładzone dążenie do pozy interakcji, gdy
        // gracz realnie stoi przy konsoli (ten sam sygnał, który odblokowuje "E").
        const reachTarget = this.nearStation ? 1 : 0;
        this.reachAmount += (reachTarget - this.reachAmount) * 0.12;
        if (this.rightArmPivot) {
          this.rightArmPivot.position.set(0.26 - this.reachAmount * 0.09, -0.235 + sway + idle + this.reachAmount * 0.07, -0.06 - this.reachAmount * 0.2);
          this.rightArmPivot.rotation.set(0.26 - this.reachAmount * 0.4, 0.3 - this.reachAmount * 0.22, 0.16 - this.reachAmount * 0.1);
        }
        if (this.leftArmPivot) {
          this.leftArmPivot.position.set(-0.26, -0.235 + sway * 0.7 - idle, -0.06);
          this.leftArmPivot.rotation.set(0.26 - this.reachAmount * 0.06, -0.3, -0.16);
        }
      }
    }

    // OSTROŚĆ PODĄŻA ZA APARATURĄ. BokehPass ma jedną płaszczyznę ostrości, a
    // kamera przeskakuje między kadrem otwierającym (~5.5 m od naczynia) a
    // pierwszą osobą przy konsoli (~1.5 m). Stała wartość rozmywałaby hero w
    // jednym z tych ujęć, więc przestrajamy ją realną odległością do naczynia.
    if (this.pipeline && this.scratchVecA) {
      const toVessel = this.scratchVecA.set(...VESSEL_POSITION).sub(camera.position).length();
      this.pipeline.setFocusDistance(Math.max(0.6, toVessel));
    }

    // Interakcja: promień z kamery na konsolę, w zasięgu i mniej więcej naprzeciw niej.
    if (this.raycaster && this.consoleMesh && this.cameraPhase === 'FREE' && this.scratchVecB && this.scratchVecC) {
      const forward = this.scratchVecB.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const toConsole = this.scratchVecC.set(...CONSOLE_POSITION).sub(camera.position);
      const distance = toConsole.length();
      const facing = distance > 1e-6 ? forward.dot(toConsole.normalize()) : 0;
      this.nearStation = distance < INTERACT_MAX_DISTANCE && facing > INTERACT_MIN_FACING_DOT;
    } else {
      this.nearStation = false;
    }
    if (this.consolePanel) {
      const material = this.consolePanel.material as THREE_NS.MeshStandardMaterial;
      material.emissiveIntensity = this.nearStation ? 1.1 : 0.5;
    }

    void scene;
  }

  /**
   * POTOK RENDERUJĄCY: delegowany w całości do Genesis Graphics Runtime
   * (`core/three/graphics/postProcessing.ts`), zamiast trzeciej z rzędu
   * ręcznej implementacji tych samych efektów w tym pliku.
   *
   * CO ZNIKA I DLACZEGO. Ta metoda niosła wcześniej własne AO i własne DOF
   * napisane jako ShaderPass, razem z prepassem głębi i materiałem
   * depth-only. Powstały z konieczności: `SSAOPass` z three/examples
   * renderuje scenę własnym przebiegiem, poza ACES i przestrzenią barw
   * renderera, więc w tym łańcuchu wypuszczał biały kadr. Ale `GTAOPass`
   * rozwiązuje dokładnie ten problem poprawnie — blenduje człon okluzji
   * przez CustomBlending WEWNĄTRZ liniowego łańcucha compositora, czyli
   * ściśle przed `OutputPass`. Utrzymywanie własnego shadera AO obok
   * gotowego, utrzymywanego w upstreamie passu było kosztem bez zysku.
   *
   * CO ZOSTAJE PO STRONIE ŚWIATA. Mapa środowiska: Graphics Runtime ustawia
   * proceduralne „studio" (jasny sufit, dwie świetlówki), ale ta scena ma
   * lepsze źródło odbić — jednorazową sondę CubeCamera z PRAWDZIWEJ hali
   * (`captureRoomEnvironment`), zdejmowaną po pierwszej pełnej klatce.
   * Zostaje więc studio jako natychmiastowy fallback na starcie, a sonda
   * podmienia je, gdy scena jest już oświetlona.
   *
   * PRÓG JAKOŚCI. AO i DOF mają w Runtime domyślny próg `'high'`. Ta hala
   * świadomie schodzi z nim do `'medium'`: to AO daje aparaturze kontakt z
   * posadzką (bez niego maszyny unoszą się nad podłogą), więc jest tu
   * ważniejsze niż kilka klatek. Na `'low'` (telefon) oba nadal odpadają.
   */
  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const THREE = this.THREE!;
    const pipeline = setupGraphicsPipeline(THREE, modules, renderer, {
      scene,
      camera,
      width: w,
      height: h,
      // Ekspozycja i bloom dostrojone do TEJ hali: ciemne tło, jasny hero.
      toneMappingExposure: 1.12,
      bloom: { strength: 0.22, radius: 0.55, threshold: 0.95 },
      // Promień AO dobrany do skali hali (maszyny metrowe, nie laboratoryjne
      // szkło na blacie) — domyślne 0.42 gubi się przy tej aparaturze.
      ambientOcclusion: { minTier: 'medium', radius: 0.75, blendIntensity: 1 },
      // Odbicia z PRAWDZIWEJ hali, nie z pudełka studyjnego. Sonda stoi przy
      // aparaturze, na wysokości oczu — to ten punkt widzenia widz ogląda.
      ambient: {
        mode: 'room-probe',
        probe: { position: [VESSEL_POSITION[0] + 0.9, 1.75, VESSEL_POSITION[2] + 1.1], intensity: 1.85 },
      },
      // Ostrość na aparaturze centralnej w kadrze otwierającym; `setFocusDistance`
      // przestraja ją przy cięciach kamery (patrz syncScene).
      // `aperture`/`maxBlur` jawnie zamiast proxy `blurStrength`: przy proxy
      // pas ostrości był węższy niż sama aparatura, więc rozmywały się jej
      // własne krawędzie. Mała apertura = szeroki pas ostrości (cały hero
      // ostry), umiarkowany maxBlur = czytelne oddzielenie dalekich planów.
      depthOfField: configureDOF({ focusDistance: 5.4, aperture: 0.0045, maxBlur: 0.006, minTier: 'medium' }),
    });
    this.pipeline = pipeline;

    let shadowsPrimed = false;
    return {
      render: () => {
        pipeline.render();
        // Cienie liczone raz: scena jest statyczna poza aparaturą, więc
        // przeliczanie mapy co klatkę było czystym kosztem.
        if (!shadowsPrimed) {
          shadowsPrimed = true;
          renderer.shadowMap.autoUpdate = false;
        }
        // Sonda odbić zdejmowana z PIERWSZEJ pełnej klatki: dopiero wtedy
        // światła, cienie i emisja są już policzone, więc mapa środowiska
        // niesie prawdziwą halę, a nie pustą scenę. Sama technika żyje teraz
        // w graphics/lighting.ts — każda kolejna scena wnętrzowa dostaje ją
        // za darmo, zamiast kopiować tę metodę do siebie.
        pipeline.captureRoomProbe();
      },
      setSize: (width, height) => pipeline.setSize?.(width, height),
      dispose: () => {
        this.pipeline = null;
        pipeline.dispose?.();
        renderer.shadowMap.autoUpdate = true;
      },
    };
  }


  onResize(): void { /* kamera pierwszoosobowa: brak dodatkowej logiki poza domyślnym aspect z useThreeLoop */ }

  dispose(): void {
    // See the `scene` field's own comment and graphics/lifecycle.ts's module doc: GC of the scene
    // graph does not free GPU-side geometry/material/texture memory, and `WebGLRenderer.dispose()`
    // (called right after this by useThreeLoop.ts) doesn't either. `scene.environment`/
    // `scene.background` (the studio/HDRI IBL) are deliberately left alone here — they're owned
    // and disposed by the graphics pipeline itself, via `setupPostProcessing`'s own `dispose()`
    // above, not by this per-mesh traversal.
    if (this.scene) disposeSceneResources(this.scene);
    this.scene = null;
    this.dustMotes = null;
  }
}
