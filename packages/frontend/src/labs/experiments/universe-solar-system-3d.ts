import type * as THREE from 'three';
import type { ExperimentDef, NarrationBlock, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { PLANETS, type PlanetData } from '../../data/solarSystem';
import { MOONS, type MoonData } from '../../data/moons';
import { keplerPosition } from '../../core/physics';
import { createStarfield, type Starfield } from '../../core/three/starfield';
import { detectRenderTier, scaleCount, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Prawdziwy Układ Słoneczny — wersja 3D (Three.js/WebGL), flagowa scena
 * Universe Lab. ZERO nowej fizyki orbitalnej względem wersji 2D: ta sama
 * funkcja `keplerPosition` (dokładne rozwiązanie równania Keplera), te
 * same prawdziwe elementy orbitalne NASA (`data/solarSystem.ts`) — zmienia
 * się warstwa renderująca (współdzielone `core/three/starfield.ts`,
 * proceduralne materiały planet, pas planetoid, kinowa kamera) i DODANE
 * (nowe, jawnie opisane w honestyNote) warstwy poglądowe.
 *
 * SYGNATUROWA INTERAKCJA — przelot skali: kliknięcie planety (raycasting w
 * pointer()) uruchamia animowany przelot kamery z widoku całego układu do
 * bliskiej orbity wokół tej planety (startFocusFlight/FocusAnim), gdzie
 * odsłaniają się DOPIERO TAM sensowne: prawdziwe nachylenie osi obrotu
 * (PlanetData.axialTiltDeg, NASA), pierścienie Saturna/Urana i księżyce
 * (data/moons.ts, prawdziwe odległości/okresy). Po ustabilizowaniu kamera
 * "podąża" za planetą przez przesunięcie o deltę jej ruchu między klatkami
 * (nie przez wymuszanie pozycji), więc OrbitControls użytkownika (obrót,
 * zoom) działa bez konfliktu — patrz core/three/types.ts::getOrbitTarget.
 * To bezpośrednia realizacja zasady "camera travel toward selected
 * planetary bodies jako scale transition", nie ozdobna animacja.
 *
 * Dodatkowe uczciwe uproszczenie WZGLĘDEM wersji 2D: orbity planet są tu
 * współpłaszczyznowe (płaszczyzna ekliptyki) — `data/solarSystem.ts` nie
 * przechowuje inklinacji orbitalnej; orbity księżyców są kołowe (bez
 * mimośrodu/inklinacji). Rozmiary planet i księżyców: symboliczne (log
 * promienia), NIE do skali odległości.
 */

interface PlanetView {
  data: PlanetData;
  scaleUnitsPerAu: number;
  radiusScene: number;
  isGasGiant: boolean;
  tiltRad: number;
  /** Grupa pozycjonowana na orbicie (odpowiednik dawnego mesh.position) — dzieci: tiltGroup + księżyce (nachylenie osi NIE dotyczy orbit księżyców). */
  anchor: THREE.Group;
  /** Dziecko `anchor`, nachylone o tiltRad — dzieci: mesh planety + ewentualny pierścień, oba dzielą to samo nachylenie osi. */
  tiltGroup: THREE.Group;
  mesh: THREE.Mesh;
  ringMesh?: THREE.Mesh;
  moons: MoonView[];
}

interface BeltRock {
  r: number;
  a0: number;
  y0: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  scale: number;
}

interface MoonView {
  data: MoonData;
  mesh: THREE.Mesh;
  orbitRadiusScene: number;
}

interface FocusAnim {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  elapsed: number;
  duration: number;
  settleIndex: number | null;
}

const SCENE_RADIUS_MAX = 42; // jednostki sceny dla orbity Neptuna
const GAS_GIANT_RADIUS_KM = 20000; // próg klasyfikacji (Jowisz/Saturn/Uran/Neptun >> próg, reszta poniżej)
const BELT_INNER_AU = 2.1; // realny wewnętrzny brzeg głównego pasa planetoid
const BELT_OUTER_AU = 3.3; // realny zewnętrzny brzeg
const BELT_REF_UNITS_PER_DAY = 0.00055; // empirycznie dobrana skala kątowa (patrz honestyNote: kierunek Keplera prawdziwy, stała — nie)
const INTRO_DURATION = 1.6;
const FOCUS_FLIGHT_DURATION = 1.5; // s — czas przelotu kamery do/z wybranej planety

function makeGlowTexture(three: typeof THREE): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,246,216,0.9)');
  grad.addColorStop(0.35, 'rgba(240,179,92,0.35)');
  grad.addColorStop(1, 'rgba(240,179,92,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Proceduralna tekstura powierzchni planety — poglądowe zróżnicowanie
 * gazowy olbrzym (poziome pasy z turbulencją) vs. planeta skalista
 * (plamista, "zwietrzała" powierzchnia) — klasyfikacja z PRAWDZIWEGO
 * promienia planety (`radiusKm`), ale sam wzór tekstury jest ILUSTRACYJNY:
 * NIE jest to zdjęcie ani prawdziwa mapa powierzchni/atmosfery.
 */
function makePlanetTexture(three: typeof THREE, hex: string, gasGiant: boolean): THREE.Texture {
  const w = 128, h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const base = new three.Color(hex);
  const r0 = base.r * 255, g0 = base.g * 255, b0 = base.b * 255;
  const img = ctx.createImageData(w, h);
  if (gasGiant) {
    const bandCount = 8 + Math.floor(Math.random() * 5);
    for (let y = 0; y < h; y++) {
      const bandT = (y / h) * bandCount;
      const bandWave = Math.sin(bandT * Math.PI * 2 + Math.sin(bandT * 2.3) * 0.7);
      for (let x = 0; x < w; x++) {
        const turb = Math.sin(x * 0.09 + y * 0.35) * 0.06 + Math.sin(x * 0.21 - y * 0.06) * 0.04;
        const k = Math.max(0.55, Math.min(1.3, 0.85 + bandWave * 0.28 + turb));
        const i = (y * w + x) * 4;
        img.data[i] = Math.min(255, r0 * k);
        img.data[i + 1] = Math.min(255, g0 * k);
        img.data[i + 2] = Math.min(255, b0 * k);
        img.data[i + 3] = 255;
      }
    }
  } else {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = Math.sin(x * 0.24 + Math.sin(y * 0.19) * 3.1) * Math.cos(y * 0.22 - Math.sin(x * 0.13) * 2.4);
        const k = Math.max(0.5, Math.min(1.25, 0.85 + n * 0.3));
        const i = (y * w + x) * 4;
        img.data[i] = Math.min(255, r0 * k);
        img.data[i + 1] = Math.min(255, g0 * k);
        img.data[i + 2] = Math.min(255, b0 * k);
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeSunTexture(three: typeof THREE): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.sin(x * 0.3 + Math.sin(y * 0.25) * 4) * Math.cos(y * 0.28 - Math.sin(x * 0.2) * 3);
      const k = Math.max(0.82, Math.min(1.15, 1 + n * 0.09));
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, 255 * k);
      img.data[i + 1] = Math.min(255, 243 * k);
      img.data[i + 2] = Math.min(255, 214 * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tekstura pierścienia: pasma z przerwą inspirowaną prawdziwym podziałem
 * Cassiniego (realna luka w pierścieniach Saturna) — ILUSTRACYJNY wzór,
 * dokładny PRAWDZIWY jest tylko przybliżony zasięg promienia (patrz
 * PlanetData.ring i honestyNote).
 */
function makeRingTexture(three: typeof THREE, hex: string): THREE.Texture {
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const base = new three.Color(hex);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const band = Math.sin(t * 26) * 0.5 + 0.5;
    const cassiniGap = t > 0.4 && t < 0.46 ? 0.12 : 1;
    const alpha = Math.max(0.12, Math.min(1, 0.32 + band * 0.55)) * cassiniGap;
    const shade = 0.7 + band * 0.4;
    ctx.fillStyle = `rgba(${Math.min(255, base.r * 255 * shade)}, ${Math.min(255, base.g * 255 * shade)}, ${Math.min(255, base.b * 255 * shade)}, ${alpha})`;
    ctx.fillRect(0, y, 4, 1);
  }
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

class SolarSystem3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.35;

  private daysElapsed = 0;
  private introElapsed = 0;
  private views: PlanetView[] = [];
  private sunMesh?: THREE.Mesh;
  private glowSprite?: THREE.Sprite;
  private coronaSprite?: THREE.Sprite;
  private starfield?: Starfield;
  private beltMesh?: THREE.InstancedMesh;
  private beltBase: BeltRock[] = [];
  private beltDummy?: THREE.Object3D;
  private camera?: THREE.PerspectiveCamera;
  private three?: typeof THREE;
  private bloom?: import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private disposables: { dispose(): void }[] = [];

  // Przelot kamery do wybranej planety (kliknięcie) — patrz pointer()/startFocusFlight().
  private raycaster?: THREE.Raycaster;
  private viewW = 0;
  private viewH = 0;
  private focusedIndex: number | null = null;
  private focusAnim: FocusAnim | null = null;
  private currentTarget!: THREE.Vector3;
  private overviewCamPos!: THREE.Vector3;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number) {
    this.three = three;
    this.camera = camera;
    this.viewW = w;
    this.viewH = h;
    this.raycaster = new three.Raycaster();
    this.currentTarget = new three.Vector3(0, 0, 0);
    const tier = detectRenderTier();
    const reduced = getSettings().reducedMotion;
    this.introElapsed = reduced ? INTRO_DURATION : 0;

    const aMax = PLANETS[PLANETS.length - 1].semiMajorAxisAu;
    const moonSegs = tier === 'high' ? 20 : 12;
    const planetSegs = tier === 'low' ? 20 : 32;
    const ringSegs = tier === 'low' ? 48 : 96;

    this.views = PLANETS.map((p) => {
      const displayA = SCENE_RADIUS_MAX * Math.sqrt(p.semiMajorAxisAu / aMax);
      const radiusScene = Math.max(0.22, Math.log10(p.radiusKm) * 0.24);
      const anchor = new three.Group();
      const tiltGroup = new three.Group();
      tiltGroup.rotation.z = (p.axialTiltDeg * Math.PI) / 180;
      anchor.add(tiltGroup);
      scene.add(anchor);

      const isGasGiant = p.radiusKm > GAS_GIANT_RADIUS_KM;
      const geo = new three.SphereGeometry(radiusScene, planetSegs, planetSegs);
      const planetTex = makePlanetTexture(three, p.color, isGasGiant);
      const mat = new three.MeshStandardMaterial({ map: planetTex, roughness: isGasGiant ? 0.55 : 0.85, metalness: 0.04 });
      const mesh = new three.Mesh(geo, mat);
      tiltGroup.add(mesh);
      this.disposables.push(geo, mat, planetTex);

      let ringMesh: THREE.Mesh | undefined;
      if (p.ring) {
        const ringGeo = new three.RingGeometry(radiusScene * p.ring.innerFactor, radiusScene * p.ring.outerFactor, ringSegs);
        const ringTex = makeRingTexture(three, p.color);
        const ringMat = new three.MeshBasicMaterial({
          map: ringTex, transparent: true, opacity: p.ring.opacity, side: three.DoubleSide, depthWrite: false,
        });
        ringMesh = new three.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        tiltGroup.add(ringMesh);
        this.disposables.push(ringGeo, ringMat, ringTex);
      }

      // Księżyce: widoczne TYLKO gdy kamera jest przybliżona do tej planety
      // (patrz syncScene) — przy skali całego układu byłyby i tak
      // niewidoczne (prawdziwa odległość Ziemia-Księżyc to <0,3% odległości
      // Ziemia-Słońce), więc ukrywanie ich w widoku ogólnym jest uczciwe,
      // nie tylko wydajnościowe. Promień orbity księżyca: skompresowany
      // pierwiastkiem z prawdziwej odległości (ta sama zasada co orbity
      // planet wokół Słońca) względem najdalszego księżyca TEJ planety —
      // realna kolejność/rozstaw zachowane, bezwzględna skala symboliczna.
      const myMoons = MOONS.filter((m) => m.parentId === p.id);
      const maxMoonDist = myMoons.length ? Math.max(...myMoons.map((m) => m.distanceKm)) : 1;
      const moons: MoonView[] = myMoons.map((m) => {
        const orbitRadiusScene = radiusScene * 1.7 + radiusScene * 3.4 * Math.sqrt(m.distanceKm / maxMoonDist);
        const moonRadiusScene = Math.max(0.03, Math.log10(m.radiusKm) * 0.05);
        const moonGeo = new three.SphereGeometry(moonRadiusScene, moonSegs, moonSegs);
        const moonMat = new three.MeshStandardMaterial({ color: new three.Color(m.color), roughness: 0.9, metalness: 0.02 });
        const moonMesh = new three.Mesh(moonGeo, moonMat);
        moonMesh.visible = false;
        anchor.add(moonMesh);
        this.disposables.push(moonGeo, moonMat);
        return { data: m, mesh: moonMesh, orbitRadiusScene };
      });

      return {
        data: p,
        scaleUnitsPerAu: displayA / p.semiMajorAxisAu,
        radiusScene,
        isGasGiant,
        tiltRad: tiltGroup.rotation.z,
        anchor,
        tiltGroup,
        mesh,
        ringMesh,
        moons,
      };
    });

    // Pole gwiazd współdzielone (patrz core/three/starfield.ts) — ten sam
    // moduł co Einstein Lab, drugi realny konsument, nie duplikat.
    this.starfield = createStarfield(three, tier, 2600, [260, 600]);
    scene.add(this.starfield.points);

    const sunTex = makeSunTexture(three);
    const sunGeo = new three.SphereGeometry(2.4, 32, 32);
    const sunMat = new three.MeshBasicMaterial({ map: sunTex });
    this.sunMesh = new three.Mesh(sunGeo, sunMat);
    scene.add(this.sunMesh);
    this.disposables.push(sunGeo, sunMat, sunTex);

    // Dwie warstwy poświaty Słońca (mała jasna + duża miękka) zamiast
    // jednej — tania sztuczka głębi: korona czyta się jako obłok energii z
    // gradientem jasności, nie płaski, jednorodny dysk.
    const glowTex = makeGlowTexture(three);
    const glowMat = new three.SpriteMaterial({ map: glowTex, color: 0xf0b35c, transparent: true, blending: three.AdditiveBlending, depthWrite: false });
    this.glowSprite = new three.Sprite(glowMat);
    this.glowSprite.scale.set(16, 16, 1);
    scene.add(this.glowSprite);
    this.disposables.push(glowTex, glowMat);

    const coronaMat = new three.SpriteMaterial({ map: glowTex, color: 0xffcf7a, transparent: true, opacity: 0.32, blending: three.AdditiveBlending, depthWrite: false });
    this.coronaSprite = new three.Sprite(coronaMat);
    this.coronaSprite.scale.set(34, 34, 1);
    scene.add(this.coronaSprite);
    this.disposables.push(coronaMat);

    const sunLight = new three.PointLight(0xfff3d6, 4.2, 0, 0.08);
    scene.add(sunLight);
    scene.add(new three.AmbientLight(0x1c2540, 0.7));

    for (const v of this.views) {
      const segs = 160;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const M = (i / segs) * Math.PI * 2;
        const pos = keplerPosition(v.data.semiMajorAxisAu, v.data.eccentricity, M);
        pts.push(new three.Vector3(pos.x * v.scaleUnitsPerAu, 0, pos.y * v.scaleUnitsPerAu));
      }
      const orbitGeo = new three.BufferGeometry().setFromPoints(pts);
      const orbitMat = new three.LineBasicMaterial({ color: 0xe6eaf5, transparent: true, opacity: 0.14 });
      const line = new three.LineLoop(orbitGeo, orbitMat);
      scene.add(line);
      this.disposables.push(orbitGeo, orbitMat);
    }

    // Główny pas planetoid między Marsem a Jowiszem (2,1–3,3 j.a., realny
    // zakres) — InstancedMesh, jeden draw call niezależnie od liczby brył.
    // Ruch: kierunek (bliższe → szybsze, ω ∝ r^-3/2) jest prawdziwym prawem
    // Keplera, ale stała skalująca jest dobrana empirycznie pod scenę, nie
    // policzona z prawdziwych okresów orbitalnych pojedynczych planetoid —
    // patrz honestyNote.
    const beltCount = scaleCount(1600, tier);
    const beltInnerUnits = SCENE_RADIUS_MAX * Math.sqrt(BELT_INNER_AU / aMax);
    const beltOuterUnits = SCENE_RADIUS_MAX * Math.sqrt(BELT_OUTER_AU / aMax);
    this.beltBase = Array.from({ length: beltCount }, () => ({
      r: beltInnerUnits + Math.random() * (beltOuterUnits - beltInnerUnits),
      a0: Math.random() * Math.PI * 2,
      y0: (Math.random() - 0.5) * 0.4,
      spinAxis: new three.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spinSpeed: 0.5 + Math.random() * 1.5,
      scale: 0.5 + Math.random() * 1,
    }));
    // Rozmiar symboliczny (jak planety, patrz honestyNote) — prawdziwe
    // planetoidy są mikroskopijne wobec tej skali sceny i byłyby całkowicie
    // niewidoczne; powiększone tak, żeby pas czytał się jako widoczna,
    // ziarnista wstęga materii między Marsem a Jowiszem.
    const beltGeo = new three.IcosahedronGeometry(0.15, 0);
    const beltMat = new three.MeshStandardMaterial({ color: 0xaaa295, roughness: 0.95, metalness: 0.05, emissive: 0x2a2620, emissiveIntensity: 0.4 });
    this.beltMesh = new three.InstancedMesh(beltGeo, beltMat, beltCount);
    this.beltDummy = new three.Object3D();
    scene.add(this.beltMesh);
    this.disposables.push(beltGeo, beltMat);

    // Kamera 3/4 z góry, nieco bliżej niż poprzednia wersja — pokazuje
    // spłaszczenie ekliptyki (patrz honestyNote) i sprawia, że układ od
    // razu wypełnia kadr zamiast pływać małą chmurą w pustce.
    this.overviewCamPos = new three.Vector3(0, SCENE_RADIUS_MAX * 0.5, SCENE_RADIUS_MAX * 0.8);
    camera.position.copy(this.overviewCamPos);
    camera.lookAt(0, 0, 0);
    if (!reduced) camera.fov = 72;
    camera.updateProjectionMatrix();
  }

  onResize(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
  }

  /**
   * Przesunięcie kamery przy przybliżeniu do planety. WAŻNE geometrycznie:
   * przesuwanie kamery WZDŁUŻ promienia Słońce→planeta NIE pomaga wykluczyć
   * Słońca z kadru — kamera, planeta i Słońce zostają w przybliżeniu
   * współliniowe niezależnie od tego, jak daleko wzdłuż tej samej prostej
   * odsuniemy kamerę (sprawdzone: dla Saturna dawało to kąt ~11° między
   * kierunkiem na planetę a kierunkiem na Słońce — głęboko w polu widzenia
   * 50°). Kierunek NIEZALEŻNY od pozycji orbitalnej planety (głównie w
   * górę + stały kierunek boczny) daje kąt ~60°+ dla tej samej planety —
   * bezpiecznie poza stożkiem widzenia — bo NIE leży na osi Słońce-planeta.
   * Dlatego offset jest stałym kierunkiem świata (jak pierwotny widok
   * całego układu, ten sam kąt 3/4), skalowanym tylko rozmiarem planety.
   */
  private focusOffset(v: PlanetView): THREE.Vector3 {
    const three = this.three!;
    const dist = Math.max(1.8, v.radiusScene * 7.5 + 2);
    return new three.Vector3(0, 0.42, 0.9).normalize().multiplyScalar(dist);
  }

  private startFocusFlight(toIndex: number | null) {
    if (!this.camera || !this.three) return;
    const three = this.three;
    const fromPos = this.camera.position.clone();
    const fromTarget = this.currentTarget.clone();
    let toPos: THREE.Vector3;
    let toTarget: THREE.Vector3;
    if (toIndex === null) {
      toPos = this.overviewCamPos.clone();
      toTarget = new three.Vector3(0, 0, 0);
    } else {
      const v = this.views[toIndex];
      toTarget = v.anchor.position.clone();
      toPos = toTarget.clone().add(this.focusOffset(v));
    }
    this.focusAnim = { fromPos, toPos, fromTarget, toTarget, elapsed: 0, duration: FOCUS_FLIGHT_DURATION, settleIndex: toIndex };
  }

  /**
   * Rozróżnienie "stuknięcie" vs "przeciąganie kamery" (OrbitControls) —
   * bez tego przeciągnięcie zaczęte NA aktualnie przybliżonej planecie
   * byłoby też odczytane jako kliknięcie (bo pointer('down') widzi tylko
   * pozycję startu), co wywoływałoby niechciany powrót do widoku ogólnego
   * w trakcie samego obracania kamerą. Próg 6px w jednostkach ekranu.
   */
  private pointerDownPos: { x: number; y: number } | null = null;
  private pointerDragged = false;

  pointer(x: number, y: number, type: 'down' | 'move' | 'up') {
    if (type === 'down') {
      this.pointerDownPos = { x, y };
      this.pointerDragged = false;
      return;
    }
    if (type === 'move') {
      if (this.pointerDownPos && !this.pointerDragged) {
        const dx = x - this.pointerDownPos.x;
        const dy = y - this.pointerDownPos.y;
        if (Math.hypot(dx, dy) > 6) this.pointerDragged = true;
      }
      return;
    }
    // type === 'up'
    const wasDrag = this.pointerDragged;
    this.pointerDownPos = null;
    this.pointerDragged = false;
    if (wasDrag || !this.raycaster || !this.camera || !this.three || !this.viewW || !this.viewH) return;
    const ndcX = (x / this.viewW) * 2 - 1;
    const ndcY = -((y / this.viewH) * 2 - 1);
    this.raycaster.setFromCamera(new this.three.Vector2(ndcX, ndcY), this.camera);

    if (this.sunMesh) {
      const sunHit = this.raycaster.intersectObject(this.sunMesh, false);
      if (sunHit.length > 0) {
        if (this.focusedIndex !== null || this.focusAnim) this.startFocusFlight(null);
        return;
      }
    }
    // Cel raycastingu obejmuje TAKŻE pierścień (v.ringMesh), nie tylko kulę
    // planety — bez tego Saturn/Uran wyglądają na klikalne w całym
    // widocznym obszarze pierścienia, ale trafienie działałoby tylko w
    // wąską kulę planety w jego środku, co w praktyce robi funkcję
    // niewykrywalną (użytkownik naturalnie celuje w duży, widoczny
    // pierścień).
    const hitTargets: THREE.Object3D[] = [];
    const indexByTarget = new Map<THREE.Object3D, number>();
    this.views.forEach((v, i) => {
      hitTargets.push(v.mesh);
      indexByTarget.set(v.mesh, i);
      if (v.ringMesh) {
        hitTargets.push(v.ringMesh);
        indexByTarget.set(v.ringMesh, i);
      }
    });
    const hits = this.raycaster.intersectObjects(hitTargets, false);
    if (hits.length > 0) {
      const idx = indexByTarget.get(hits[0].object) ?? -1;
      if (idx < 0) return;
      if (this.focusedIndex === idx && !this.focusAnim) {
        this.startFocusFlight(null);
      } else if (this.focusedIndex !== idx) {
        this.startFocusFlight(idx);
      }
    }
  }

  getOrbitTarget(): THREE.Vector3 | null {
    if (this.focusAnim || this.focusedIndex !== null) return this.currentTarget;
    return null;
  }

  setupPostProcessing(modules: PostProcessingModules, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): PostProcessor {
    const { EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass } = modules;
    const tier = detectRenderTier();
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const strength = tierAllowsBloom(tier) ? 0.55 : 0.3;
    this.bloom = new UnrealBloomPass(new this.three!.Vector2(w, h), strength, 0.5, 0.62);
    composer.addPass(this.bloom);
    this.fadePass = createFadePass(ShaderPass, getSettings().reducedMotion ? 1 : 0);
    composer.addPass(this.fadePass);
    composer.addPass(new OutputPass());
    return {
      render: () => composer.render(),
      setSize: (nw, nh) => composer.setSize(nw, nh),
      dispose: () => this.bloom?.dispose(),
    };
  }

  reset = () => {
    this.daysElapsed = 0;
  };

  update(dt: number, p: SimParams) {
    this.daysElapsed += dt * Number(p.speed);
    if (!getSettings().reducedMotion) this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + dt);
    if (this.focusAnim) {
      this.focusAnim.elapsed += dt;
      if (this.focusAnim.elapsed >= this.focusAnim.duration) {
        this.focusedIndex = this.focusAnim.settleIndex;
      }
    }
  }

  syncScene(_scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    const introT = Math.min(1, this.introElapsed / INTRO_DURATION);
    const eased = 1 - Math.pow(1 - introT, 3);
    if (this.camera && !getSettings().reducedMotion) {
      const fov = 72 - (72 - 50) * eased;
      if (Math.abs(this.camera.fov - fov) > 0.01) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
      if (this.fadePass) this.fadePass.uniforms.uFade.value = eased;
    }

    if (this.sunMesh) this.sunMesh.rotation.y += 0.002;
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      const meanAnomaly = ((2 * Math.PI * this.daysElapsed) / v.data.periodDays) % (2 * Math.PI);
      const pos = keplerPosition(v.data.semiMajorAxisAu, v.data.eccentricity, meanAnomaly);
      v.anchor.position.set(pos.x * v.scaleUnitsPerAu, 0, pos.y * v.scaleUnitsPerAu);
      // Wirowanie własne planety NA JEJ nachylonej osi (dziecko tiltGroup) —
      // Wenus obraca się w tej samej "kierunkowej" konwencji co inne
      // planety (dodatnia prędkość); prawdziwa retrogradacja jest już
      // zakodowana w kącie nachylenia (>90°, patrz PlanetData.axialTiltDeg),
      // więc wizualnie i tak kręci się "wstecz" względem obserwatora.
      v.mesh.rotation.y += v.isGasGiant ? 0.014 : 0.008;

      const focused = this.focusedIndex === i;
      for (const m of v.moons) {
        m.mesh.visible = focused;
        if (!focused) continue;
        const angle = ((2 * Math.PI * this.daysElapsed) / m.data.periodDays) % (2 * Math.PI);
        m.mesh.position.set(Math.cos(angle) * m.orbitRadiusScene, 0, Math.sin(angle) * m.orbitRadiusScene);
        m.mesh.rotation.y += 0.01;
      }
    }

    // Kamera: przelot (fromPos→toPos, fromTarget→toTarget) albo — gdy
    // przybliżona i nieruchoma — "podążanie" za planetą przez przesunięcie
    // pozycji kamery o dokładnie tyle, o ile przesunęła się planeta od
    // poprzedniej klatki. Dzięki temu OrbitControls (który liczy swój
    // wewnętrzny offset z camera.position − target) NIE walczy z ręcznym
    // obrotem/zoomem użytkownika — patrz core/three/types.ts::getOrbitTarget.
    if (this.focusAnim && this.camera) {
      const a = this.focusAnim;
      const t = Math.min(1, a.elapsed / a.duration);
      const eased2 = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(a.fromPos, a.toPos, eased2);
      this.currentTarget.lerpVectors(a.fromTarget, a.toTarget, eased2);
      if (t >= 1) this.focusAnim = null;
    } else if (this.focusedIndex !== null && this.camera) {
      const v = this.views[this.focusedIndex];
      const newTarget = v.anchor.position;
      const delta = newTarget.clone().sub(this.currentTarget);
      this.camera.position.add(delta);
      this.currentTarget.copy(newTarget);
    }

    if (this.beltMesh && this.beltDummy && this.three) {
      const dummy = this.beltDummy;
      for (let i = 0; i < this.beltBase.length; i++) {
        const b = this.beltBase[i];
        const rot = b.a0 + this.daysElapsed * BELT_REF_UNITS_PER_DAY * Math.pow(b.r, -1.5) * 40;
        dummy.position.set(b.r * Math.cos(rot), b.y0, b.r * Math.sin(rot));
        dummy.rotation.set(rot * b.spinSpeed, rot * b.spinSpeed * 0.7, 0);
        dummy.scale.setScalar(b.scale);
        dummy.updateMatrix();
        this.beltMesh.setMatrixAt(i, dummy.matrix);
      }
      this.beltMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.starfield) this.starfield.material.opacity = 0.85 * Math.max(0.2, eased);
  }

  getStats() {
    const mercuryOrbits = this.daysElapsed / PLANETS[0].periodDays;
    const earthOrbits = this.daysElapsed / PLANETS[2].periodDays;
    return {
      daysElapsed: Math.round(this.daysElapsed),
      mercuryOrbits: Math.round(mercuryOrbits * 100) / 100,
      earthOrbits: Math.round(earthOrbits * 100) / 100,
      focusedIndex: this.focusedIndex ?? -1,
    };
  }

  dispose() {
    if (this.starfield) {
      this.starfield.geometry.dispose();
      this.starfield.material.dispose();
      this.starfield.texture.dispose();
    }
    this.fadePass?.material.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

export const universeSolarSystem3D: ExperimentDef = {
  id: 'solar-system-3d',
  name: 'Układ Słoneczny 3D',
  honesty: 'exact',
  honestyNote:
    'Orbity planet: DOKŁADNE (równanie Keplera, prawdziwe elementy orbitalne NASA) — identyczne z wersją 2D. Nachylenie osi obrotu każdej planety: DOKŁADNE (NASA Planetary Fact Sheet, "obliquity to orbit") — Wenus ma podane 177,4° celowo: to nie błąd, tylko sposób zakodowania jej prawdziwego ruchu wstecznego (retrogradacji). Kliknij planetę: kamera leci bliżej (przelot to animacja poglądowa, nie fizyczny lot), odsłaniając księżyce — celowo NIEwidoczne w widoku całego układu, bo przy tej skali i tak byłyby niewidocznym punktem (Księżyc jest 400× bliżej Ziemi niż Słońce). Orbity księżyców: kierunek i tempo z PRAWDZIWYCH okresów orbitalnych (NASA Planetary Satellite Fact Sheet), promień orbity skompresowany pierwiastkiem względem najdalszego księżyca tej planety (ta sama zasada co skala Słońce-planety) — zachowana prawdziwa KOLEJNOŚĆ i względny rozstaw, nie bezwzględna skala. Pierścienie Saturna i Urana: przybliżony PRAWDZIWY zasięg promienia względem promienia planety, ale wzór pasm (włącznie z przerwą inspirowaną podziałem Cassiniego) jest ILUSTRACYJNY. Tekstury powierzchni planet i Słońca są PROCEDURALNE i ILUSTRACYJNE: kierunek zróżnicowania (gazowy olbrzym = pasy, planeta skalista = plamista powierzchnia) wynika z prawdziwego promienia planety, ale sam wzór NIE jest zdjęciem ani mapą rzeczywistej atmosfery/powierzchni. Główny pas planetoid: prawdziwy zakres promienia (2,1–3,3 j.a.), a kierunek ruchu (bliższe planetoidy krążą szybciej, ω ∝ r^-3/2) to prawdziwe prawo Keplera — ale to ILUSTRACYJNA populacja (nie prawdziwy katalog planetoid), a stała skalująca prędkość jest dobrana pod scenę, nie policzona z rzeczywistych okresów orbitalnych. Orbity planet współpłaszczyznowe — pominięte inklinacje orbitalne (rzeczywiste, ale małe: 0,003°–7°), bo brak ich w źródle danych; orbity księżyców również uproszczone do kół bez inklinacji/mimośrodu. Skala odległości skompresowana (√a), rozmiary planet symboliczne — identycznie jak w wersji 2D. Bloom i podwójna poświata Słońca to prawdziwy efekt post-processingu (UnrealBloomPass) i dwie warstwy sprite’ów, nie fotorealizm filmowy.',
  params: [
    {
      key: 'speed', label: 'Tempo czasu', type: 'slider',
      min: 1, max: 400, step: 1, default: 60, unit: 'dni/s',
    },
  ],
  createSim3D: () => new SolarSystem3DSim(),
  narrate(_p, stats) {
    const mercuryOrbits = Number(stats.mercuryOrbits ?? 0);
    const earthOrbits = Number(stats.earthOrbits ?? 0);
    const focusedIndex = Number(stats.focusedIndex ?? -1);
    const focused = focusedIndex >= 0 ? PLANETS[focusedIndex] : null;
    const blocks: NarrationBlock[] = [
      {
        title: 'Ta sama fizyka, głębia 3D',
        body: `Widzisz dokładnie te same orbity co w płaskiej wersji — teraz z perspektywą: kąt kamery pokazuje, że wszystkie planety krążą blisko jednej płaszczyzny (ekliptyki), co samo w sobie jest śladem powstania Układu Słonecznego z jednego spłaszczonego dysku protoplanetarnego. Merkury: ${mercuryOrbits.toFixed(2)} okrążenia, Ziemia: ${earthOrbits.toFixed(2)}. Kliknij dowolną planetę, żeby kamera poleciała bliżej — kliknij tę samą planetę jeszcze raz (albo Słońce, jeśli widoczne), żeby wrócić do widoku całego układu.`,
        citation: {
          source: 'NASA Planetary Fact Sheet',
          confirmation: 'confirmed' as const,
          url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
          note: 'Elementy orbitalne wszystkich planet',
        },
      },
    ];
    if (focused) {
      const tilt = focused.axialTiltDeg;
      const tiltNote = tilt > 90
        ? `${focused.name} ma podane nachylenie ${tilt.toFixed(1)}° — to nie błąd: tak koduje się PRAWDZIWY ruch wsteczny (retrogradację) tej planety.`
        : tilt > 45
          ? `${focused.name} ma ekstremalne nachylenie osi: ${tilt.toFixed(1)}° — planeta "toczy się na boku" wokół Słońca, zamiast wirować "pionowo" jak większość reszty układu.`
          : `Oś obrotu ${focused.name} jest nachylona o ${tilt.toFixed(1)}° względem płaszczyzny orbity — to właśnie ten kąt (nie odległość od Słońca) odpowiada za pory roku.`;
      blocks.push({
        title: `Przybliżenie: ${focused.name}`,
        body: focused.ring
          ? `${tiltNote} Widoczny pierścień to przybliżony prawdziwy zasięg promienia planety — szczegóły wzoru pasm są poglądowe.`
          : tiltNote,
        citation: {
          source: 'NASA Planetary Fact Sheet',
          confirmation: 'confirmed' as const,
          url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
          note: 'Obliquity to orbit',
        },
      });
    }
    blocks.push(
      {
        title: 'Dlaczego pas planetoid krąży nierówno',
        body: 'Bliższe Słońcu planetoidy krążą szybciej niż dalsze (trzecie prawo Keplera: T² ∝ a³) — to ten sam powód, dla którego Merkury okrąża Słońce w 88 dni, a Neptun w 165 lat. Obróć scenę i obserwuj: pas nie wiruje jak sztywna płyta, tylko "ścina się" — wewnętrzna krawędź wyprzedza zewnętrzną.',
      },
      {
        title: 'Dlaczego prawie płasko',
        body: 'Dysk protoplanetarny, z którego uformował się Układ Słoneczny 4,6 mld lat temu, spłaszczył się pod wpływem zachowania momentu pędu — dokładnie ten sam mechanizm, który spłaszcza pizzę rozkręcaną w powietrzu. Merkury ma największe odchylenie od tej płaszczyzny (7°) — w tej symulacji ten szczegół jest pominięty.',
      },
    );
    return blocks;
  },
};
