import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { PLANETS, type PlanetData } from '../../data/solarSystem';
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
 * Dodatkowe uczciwe uproszczenie WZGLĘDEM wersji 2D: orbity są tu
 * współpłaszczyznowe (płaszczyzna ekliptyki) — `data/solarSystem.ts` nie
 * przechowuje inklinacji orbitalnej. Rozmiary planet: symboliczne (log
 * promienia), NIE do skali odległości.
 */

interface PlanetView {
  data: PlanetData;
  scaleUnitsPerAu: number;
  radiusScene: number;
  isGasGiant: boolean;
}

interface BeltRock {
  r: number;
  a0: number;
  y0: number;
  spinAxis: THREE.Vector3;
  spinSpeed: number;
  scale: number;
}

const SCENE_RADIUS_MAX = 42; // jednostki sceny dla orbity Neptuna
const GAS_GIANT_RADIUS_KM = 20000; // próg klasyfikacji (Jowisz/Saturn/Uran/Neptun >> próg, reszta poniżej)
const BELT_INNER_AU = 2.1; // realny wewnętrzny brzeg głównego pasa planetoid
const BELT_OUTER_AU = 3.3; // realny zewnętrzny brzeg
const BELT_REF_UNITS_PER_DAY = 0.00055; // empirycznie dobrana skala kątowa (patrz honestyNote: kierunek Keplera prawdziwy, stała — nie)
const INTRO_DURATION = 1.6;

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

class SolarSystem3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.35;

  private daysElapsed = 0;
  private introElapsed = 0;
  private views: PlanetView[] = [];
  private planetMeshes: THREE.Mesh[] = [];
  private sunMesh?: THREE.Mesh;
  private glowSprite?: THREE.Sprite;
  private starfield?: Starfield;
  private beltMesh?: THREE.InstancedMesh;
  private beltBase: BeltRock[] = [];
  private beltDummy?: THREE.Object3D;
  private camera?: THREE.PerspectiveCamera;
  private three?: typeof THREE;
  private bloom?: import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private disposables: { dispose(): void }[] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.camera = camera;
    const tier = detectRenderTier();
    const reduced = getSettings().reducedMotion;
    this.introElapsed = reduced ? INTRO_DURATION : 0;

    const aMax = PLANETS[PLANETS.length - 1].semiMajorAxisAu;
    this.views = PLANETS.map((p) => {
      const displayA = SCENE_RADIUS_MAX * Math.sqrt(p.semiMajorAxisAu / aMax);
      return {
        data: p,
        scaleUnitsPerAu: displayA / p.semiMajorAxisAu,
        radiusScene: Math.max(0.22, Math.log10(p.radiusKm) * 0.24),
        isGasGiant: p.radiusKm > GAS_GIANT_RADIUS_KM,
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

    const glowTex = makeGlowTexture(three);
    const glowMat = new three.SpriteMaterial({ map: glowTex, color: 0xf0b35c, transparent: true, blending: three.AdditiveBlending, depthWrite: false });
    this.glowSprite = new three.Sprite(glowMat);
    this.glowSprite.scale.set(16, 16, 1);
    scene.add(this.glowSprite);
    this.disposables.push(glowTex, glowMat);

    const sunLight = new three.PointLight(0xfff3d6, 4.2, 0, 0.08);
    scene.add(sunLight);
    scene.add(new three.AmbientLight(0x1c2540, 0.7));

    this.planetMeshes = [];
    for (const v of this.views) {
      const geo = new three.SphereGeometry(v.radiusScene, 32, 32);
      const planetTex = makePlanetTexture(three, v.data.color, v.isGasGiant);
      const mat = new three.MeshStandardMaterial({
        map: planetTex,
        roughness: v.isGasGiant ? 0.55 : 0.85,
        metalness: 0.04,
      });
      const mesh = new three.Mesh(geo, mat);
      scene.add(mesh);
      this.planetMeshes.push(mesh);
      this.disposables.push(geo, mat, planetTex);

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
    camera.position.set(0, SCENE_RADIUS_MAX * 0.5, SCENE_RADIUS_MAX * 0.8);
    camera.lookAt(0, 0, 0);
    if (!reduced) camera.fov = 72;
    camera.updateProjectionMatrix();
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
      const mesh = this.planetMeshes[i];
      mesh.position.set(pos.x * v.scaleUnitsPerAu, 0, pos.y * v.scaleUnitsPerAu);
      mesh.rotation.y += v.isGasGiant ? 0.014 : 0.008;
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
    'Orbity planet: DOKŁADNE (równanie Keplera, prawdziwe elementy orbitalne NASA) — identyczne z wersją 2D. Tekstury powierzchni planet i Słońca są PROCEDURALNE i ILUSTRACYJNE: kierunek zróżnicowania (gazowy olbrzym = pasy, planeta skalista = plamista powierzchnia) wynika z prawdziwego promienia planety, ale sam wzór NIE jest zdjęciem ani mapą rzeczywistej atmosfery/powierzchni. Główny pas planetoid: prawdziwy zakres promienia (2,1–3,3 j.a.), a kierunek ruchu (bliższe planetoidy krążą szybciej, ω ∝ r^-3/2) to prawdziwe prawo Keplera — ale to ILUSTRACYJNA populacja (nie prawdziwy katalog planetoid), a stała skalująca prędkość jest dobrana pod scenę, nie policzona z rzeczywistych okresów orbitalnych. Orbity współpłaszczyznowe — pominięte inklinacje orbitalne (rzeczywiste, ale małe: 0,003°–7°), bo brak ich w źródle danych. Skala odległości skompresowana (√a), rozmiary planet symboliczne — identycznie jak w wersji 2D. Bloom to prawdziwy efekt post-processingu (UnrealBloomPass), nie fotorealizm filmowy.',
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
    return [
      {
        title: 'Ta sama fizyka, głębia 3D',
        body: `Widzisz dokładnie te same orbity co w płaskiej wersji — teraz z perspektywą: kąt kamery pokazuje, że wszystkie planety krążą blisko jednej płaszczyzny (ekliptyki), co samo w sobie jest śladem powstania Układu Słonecznego z jednego spłaszczonego dysku protoplanetarnego. Merkury: ${mercuryOrbits.toFixed(2)} okrążenia, Ziemia: ${earthOrbits.toFixed(2)}.`,
        citation: {
          source: 'NASA Planetary Fact Sheet',
          confirmation: 'confirmed',
          url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
          note: 'Elementy orbitalne wszystkich planet',
        },
      },
      {
        title: 'Dlaczego pas planetoid krąży nierówno',
        body: 'Bliższe Słońcu planetoidy krążą szybciej niż dalsze (trzecie prawo Keplera: T² ∝ a³) — to ten sam powód, dla którego Merkury okrąża Słońce w 88 dni, a Neptun w 165 lat. Obróć scenę i obserwuj: pas nie wiruje jak sztywna płyta, tylko "ścina się" — wewnętrzna krawędź wyprzedza zewnętrzną.',
      },
      {
        title: 'Dlaczego prawie płasko',
        body: 'Dysk protoplanetarny, z którego uformował się Układ Słoneczny 4,6 mld lat temu, spłaszczył się pod wpływem zachowania momentu pędu — dokładnie ten sam mechanizm, który spłaszcza pizzę rozkręcaną w powietrzu. Merkury ma największe odchylenie od tej płaszczyzny (7°) — w tej symulacji ten szczegół jest pominięty.',
      },
    ];
  },
};
