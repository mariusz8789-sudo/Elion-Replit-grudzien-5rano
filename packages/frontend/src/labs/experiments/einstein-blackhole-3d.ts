import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { SCHWARZSCHILD_CRITICAL_IMPACT, stepSchwarzschildGeodesic } from '../../core/physics';
import { createStarfield, makeSoftDotTexture, type Starfield } from '../../core/three/starfield';
import { detectRenderTier, scaleCount, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass, FULLSCREEN_VERTEX } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Czarna dziura Schwarzschilda w 3D — flagowa scena Genesis OS. DOKŁADNIE
 * ta sama fizyka co einstein-geodesics.ts (2D): równanie geodezyjnej
 * zerowej d²u/dφ² = −u + 1,5 r_s u², całkowane RK4 (core/physics.ts:
 * stepSchwarzschildGeodesic — jedno miejsce prawdy, współdzielone z wersją
 * 2D). Rozszerzenie na 3D jest fizycznie ścisłe: geodezyjna fotonu wokół
 * masy sferycznie symetrycznej leży w JEDNEJ płaszczyźnie przechodzącej
 * przez środek — ta sama równanie u(φ) obowiązuje w KAŻDEJ takiej
 * płaszczyźnie, więc losujemy orientację płaszczyzny per foton i mapujemy
 * (r,φ) do 3D przez jej bazę ortonormalną.
 *
 * Suwak "masa" skaluje r_s NAPRAWDĘ (nie kosmetycznie) — trajektorie
 * fotonów są ponownie całkowane w nowej skali, bo r_s wchodzi wprost do
 * powyższego równania (schwarzschildGeodesicRHS). Geodezyjne Schwarzschilda
 * są ściśle samopodobne w jednostkach r_s (kształt zależy tylko od b/r_s),
 * więc zmiana masy jest fizycznie dokładnym, jednorodnym przeskalowaniem
 * przestrzeni sceny — to uczciwy, nie tylko wizualny, efekt (patrz
 * honestyNote). r_s zmienia się w czasie PŁYNNIE (nie skokowo): fotony w
 * locie w trakcie zmiany suwaka są całkowane z bieżącym, chwilowym r_s —
 * uproszczenie względem prawdziwej, znacznie trudniejszej dynamicznej
 * metryki rosnącej masy, jawnie opisane w honestyNote.
 *
 * ARCHITEKTURA RENDEROWANIA (dwie sceny + shader soczewkujący): scena jest
 * podzielona na `bgScene` (pole gwiazd, dysk, korona, tło kosmiczne — WSZYSTKO,
 * co powinno widocznie WYGINAĆ SIĘ wokół czarnej dziury) i scenę pierwszoplanową
 * (horyzont + pierścień fotonowy + tory fotonów — obiekty, które SĄ tym
 * zakrzywieniem, nie mają być przez nie ponownie deformowane). `bgScene`
 * jest renderowana do bufora, potem przepuszczana przez własny fragment
 * shader (LENS_WARP), który dla każdego piksela odwraca RÓWNANIE SOCZEWKI
 * PUNKTOWEJ θ=β+θ_E²/β (ten sam wzór, który wcześniej stosowano tylko do
 * dyskretnych gwiazd na CPU) i próbkuje piksel z pozycji bliższej środka —
 * efekt: całe tło (w tym DYSK) widocznie "opływa" sylwetkę czarnej dziury,
 * nie tylko punkty gwiazd. Warstwa pierwszoplanowa jest domalowywana NA
 * WIERZCH (bez czyszczenia koloru, ze świeżym buforem głębi), więc horyzont
 * poprawnie zasłania to, co za nim.
 *
 * Warstwy WYRAŹNIE oddzielone co do statusu naukowego — patrz honestyNote:
 * (1) tory fotonów — DOKŁADNE; (2) skala horyzontu/ISCO/dysku pod suwakiem
 * masy — DOKŁADNE; (3) gradient barwy dysku — UPROSZCZONA REALNA fizyka
 * (T(r) ∝ r^-3/4); (4) soczewkowanie tła (shader) i pierścień fotonowy —
 * POGLĄDOWE/uproszczone zastosowanie prawdziwych wzorów (promień krytyczny,
 * równanie soczewki słabego pola), bez pełnego ray-tracingu geodezyjnych w
 * przestrzeni obrazu; (5) tło kosmiczne i kinowe efekty wejścia — czysto
 * ILUSTRACYJNE, nie dane astronomiczne.
 */

const MAX_TRAIL = 70;
const MAX_PHOTONS = 16;
const TRAIL_RENDER_UNITS = 15; // tor rysowany dopiero od tej odległości (w r_s) — patrz komentarz przy update()
const ISCO_UNITS = 3; // promień ISCO w jednostkach r_s
const DISK_OUTER_UNITS = 7;
const CORONA_OUTER_UNITS = 5.5;
const RING_UNITS = 1.55; // tuż za sferą fotonową (1,5 r_s)
const RS_MIN = 0.5;
const RS_MAX = 2.2;
const RS_LERP_RATE = 2.2; // zbieżność r_s do wartości docelowej (1/s), przejście płynne, nie skokowe
const INTRO_DURATION = 1.8; // s — kinowe "rozjaśnienie" sceny przy wejściu
const DISK_OMEGA = 2.2; // skala prędkości kątowej dysku (Keplerowsko ω ∝ r^-3/2)
const DISK_BETA_ISCO = 0.42; // v/c materii dysku przy ISCO (poglądowy profil, rośnie ku środkowi jak r^-1/2)
const CORONA_BETA_ISCO = 0.2; // wolniejsza korona

interface Photon3D {
  u: number;
  du: number;
  phi: number;
  e1: [number, number, number];
  e2: [number, number, number];
  dead: boolean;
  captured: boolean;
  trail: { x: number; y: number; z: number }[];
  line: THREE.Line;
  geo: THREE.BufferGeometry;
}

interface DiskParticle {
  r: number; // w jednostkach r_s (mnożone przez bieżące self.RS przy renderze)
  a0: number;
  y0: number;
  speed: number;
}

/** Gradient barwy zbliżony do ciała doskonale czarnego — bliżej ISCO = goręcej = bielej/błękitniej. */
function thermalColor(tGrad: number, boost: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, tGrad));
  const r = 0.65 + 0.35 * t;
  const g = 0.22 + 0.6 * t * t;
  const b = 0.08 + 0.75 * t * t * t;
  const k = Math.max(0.08, Math.min(1.4, boost));
  return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
}

function randomPlaneBasis(three: typeof THREE): [THREE.Vector3, THREE.Vector3] {
  const v1 = new three.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const raw = new three.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  const v2 = raw.sub(v1.clone().multiplyScalar(raw.dot(v1))).normalize();
  return [v1, v2];
}

/** Miękka plama-sprite generowana na canvasie (bez tekstury z pliku) — reużywalna technika glow-sprite z Universe Lab. */
function makeGlowSprite(three: typeof THREE, colorCss: string): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, colorCss);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new three.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: three.AdditiveBlending });
  return new three.Sprite(mat);
}

/**
 * Fresnel/rim-glow shader — świecąca krawędź kuli (sfera fotonowa/cień),
 * bez kosztu ray-marchingu GR. POGLĄDOWE. Asymetria jasności (uPhase)
 * ilustruje wzmocnienie Dopplera strony zbliżającej się dysku — ten sam
 * kierunek efektu co gradient jasności dysku w syncDiskLayer(), więc
 * pierścień i dysk "zgadzają się" co do tego, która strona jest jaśniejsza,
 * zamiast być jednostajnie symetrycznym halo.
 */
const RING_VERTEX = `
varying vec3 vNormalV;
varying vec3 vViewDirV;
varying vec3 vPosL;
void main() {
  vNormalV = normalize(normalMatrix * normal);
  vPosL = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewDirV = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}`;
const RING_FRAGMENT = `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
uniform float uPhase;
varying vec3 vNormalV;
varying vec3 vViewDirV;
varying vec3 vPosL;
void main() {
  float rim = 1.0 - max(dot(normalize(vNormalV), normalize(vViewDirV)), 0.0);
  float angle = atan(vPosL.z, vPosL.x);
  float asym = 0.55 + 0.55 * cos(angle - uPhase);
  float glow = pow(rim, uPower) * uIntensity * asym;
  gl_FragColor = vec4(uColor * glow, glow);
}`;

/**
 * Shader soczewki grawitacyjnej (post-processing, pełny ekran) — dla
 * każdego piksela odwraca równanie soczewki punktowej słabego pola
 * θ = β + θ_E²/β: θ (ρ, kątowa odległość piksela od rzutu czarnej dziury
 * na ekran, w jednostkach r_s) jest ZNANE (to piksel, który rysujemy),
 * odwracamy więc równanie kwadratowe względem β (prawdziwej, nieugiętej
 * pozycji), po czym próbkujemy teksturę tła z pozycji odpowiadającej β
 * zamiast ρ. β<ρ dla ρ>2θ_E, więc próbkowanie "ciągnie" teksturę do
 * środka — obraz w tym miejscu ekranu wygląda na przesunięty NA ZEWNĄTRZ
 * względem swojej prawdziwej pozycji: dokładnie ten kierunek, w którym
 * prawdziwe soczewkowanie grawitacyjne rozciąga/owija obrazy wokół masy.
 * Wewnątrz promienia krytycznego (ρ<2θ_E, brak rzeczywistego rozwiązania)
 * zwracana jest czerń — sylwetka horyzontu i tak ją tam przykrywa.
 * POGLĄDOWE: jeden obraz na piksel (brak wtórnych obrazów/pierścienia
 * Einsteina, jakie dałby pełny ray-tracing geodezyjnych w przestrzeni obrazu).
 */
const LENS_WARP_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform vec2 uCenter;
uniform vec2 uResolution;
uniform float uPxPerRS;
uniform float uThetaE;
varying vec2 vUv;
void main() {
  vec2 centerPx = uCenter * uResolution;
  vec2 pixel = vUv * uResolution;
  vec2 d = pixel - centerPx;
  float rho = length(d) / uPxPerRS;
  float disc = rho * rho - 4.0 * uThetaE * uThetaE;
  if (disc <= 0.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float beta = (rho - sqrt(disc)) * 0.5;
  vec2 dir = d / max(rho * uPxPerRS, 1e-4);
  vec2 samplePx = centerPx + dir * (beta * uPxPerRS);
  vec2 sampleUv = clamp(samplePx / uResolution, vec2(0.001), vec2(0.999));
  gl_FragColor = texture2D(tDiffuse, sampleUv);
}`;

class BlackHole3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.55;

  private t = 0;
  private spawnAcc = 0;
  private captured = 0;
  private escaped = 0;
  private bScale = 1.1;
  private RS = 1; // bieżący (płynnie zbieżny) promień Schwarzschilda w jednostkach sceny
  private targetRS = 1;
  private introElapsed = 0;
  private viewW = 300; // rzeczywista szerokość viewportu w pikselach — jedyny wymiar potrzebny do kalibracji piksele-na-r_s (patrz updateLensUniforms)
  private photons: Photon3D[] = [];
  private three?: typeof THREE;
  private scene?: THREE.Scene; // pierwszoplanowa: horyzont, pierścień, tory fotonów
  private bgScene?: THREE.Scene; // soczewkowana: gwiazdy, dysk, korona, tło
  private camera?: THREE.PerspectiveCamera;
  private horizonMesh?: THREE.Mesh;
  private ringMesh?: THREE.Mesh;
  private ringMat?: THREE.ShaderMaterial;
  private diskGeo?: THREE.BufferGeometry;
  private diskMat?: THREE.PointsMaterial;
  private diskBase: DiskParticle[] = [];
  private diskCount = 0;
  private coronaGeo?: THREE.BufferGeometry;
  private coronaMat?: THREE.PointsMaterial;
  private coronaBase: DiskParticle[] = [];
  private coronaCount = 0;
  private starfield?: Starfield;
  private bloom?: import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass;
  private lensPass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private tmpOrigin?: THREE.Vector3;
  private tmpRight?: THREE.Vector3;
  private tmpXAxis?: THREE.Vector3;
  private tmpYAxis?: THREE.Vector3;
  private tmpZAxis?: THREE.Vector3;
  private disposables: { dispose(): void }[] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, _h: number) {
    this.three = three;
    this.scene = scene;
    this.bgScene = new three.Scene();
    this.camera = camera;
    this.viewW = w;
    this.tmpOrigin = new three.Vector3();
    this.tmpRight = new three.Vector3();
    this.tmpXAxis = new three.Vector3();
    this.tmpYAxis = new three.Vector3();
    this.tmpZAxis = new three.Vector3();
    const tier = detectRenderTier();
    const reduced = getSettings().reducedMotion;
    this.introElapsed = reduced ? INTRO_DURATION : 0;

    const bg = this.bgScene;

    // Tło kosmiczne: kilka wielkich, bardzo słabych plam światła daleko za
    // polem gwiazd — eliminuje "pustą czarną przestrzeń" bez udawania
    // prawdziwego zdjęcia astronomicznego (patrz honestyNote: ILUSTRACYJNE).
    const backdropColors = ['rgba(90,70,160,0.5)', 'rgba(40,110,140,0.4)', 'rgba(150,80,60,0.35)'];
    const backdropDirs: [number, number, number][] = [[0.6, 0.35, -0.7], [-0.8, -0.2, 0.5], [0.1, -0.75, -0.6]];
    for (let i = 0; i < 3; i++) {
      const spr = makeGlowSprite(three, backdropColors[i]);
      const [dx, dy, dz] = backdropDirs[i];
      const dist = 900 + i * 160;
      spr.position.set(dx * dist, dy * dist, dz * dist);
      spr.scale.set(dist * 1.3, dist * 1.3, 1);
      bg.add(spr);
      this.disposables.push(spr.material as THREE.Material, (spr.material as THREE.SpriteMaterial).map as THREE.Texture);
    }

    // Pole gwiazd w tle — trafia do bgScene, więc shader soczewkujący
    // (setupPostProcessing) wygina je wokół sylwetki automatycznie; nie
    // ma już osobnej pętli CPU liczącej ugięcie per gwiazda.
    this.starfield = createStarfield(three, tier, 3200, [220, 520]);
    bg.add(this.starfield.points);

    const horizonGeo = new three.SphereGeometry(1, 40, 40);
    const horizonMat = new three.MeshBasicMaterial({ color: 0x000000 });
    this.horizonMesh = new three.Mesh(horizonGeo, horizonMat);
    scene.add(this.horizonMesh);
    this.disposables.push(horizonGeo, horizonMat);

    // Pierścień fotonowy / krawędź cienia — fresnel rim-glow, promień
    // pochodzi z DOKŁADNEGO b_krytyczne (patrz stała RING_UNITS≈1,5 r_s),
    // ale sam kształt/blask krawędzi jest POGLĄDOWY. Zostaje w scenie
    // PIERWSZOPLANOWEJ (nie soczewkowany) — reprezentuje samą krawędź
    // horyzontu, nie tło za nim.
    const ringGeo = new three.SphereGeometry(1, 48, 48);
    this.ringMat = new three.ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      uniforms: { uColor: { value: new three.Color(0xf7c98a) }, uPower: { value: 2.2 }, uIntensity: { value: 0 }, uPhase: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
    });
    this.ringMesh = new three.Mesh(ringGeo, this.ringMat);
    scene.add(this.ringMesh);
    this.disposables.push(ringGeo, this.ringMat);

    // Warstwa 1: dysk akrecyjny główny — cienki, gęsty, szybki. W bgScene:
    // shader soczewkujący sprawia, że jego dalsza (za horyzontem) strona
    // widocznie "opływa" sylwetkę zamiast być tylko zasłonięta.
    this.diskCount = scaleCount(1400, tier);
    this.diskBase = Array.from({ length: this.diskCount }, () => {
      // Koncentracja radialna ku ISCO (r ∝ u^1.7): wewnętrzna krawędź jest
      // najgęstsza i najgorętsza — tam, gdzie dysk realnie świeci najmocniej.
      const r = ISCO_UNITS + (DISK_OUTER_UNITS - ISCO_UNITS) * Math.pow(Math.random(), 1.7);
      return {
        r,
        a0: Math.random() * Math.PI * 2,
        // Lekkie rozszerzanie dysku na zewnątrz (flaring H∝r) — cienki w środku, grubszy na brzegu.
        y0: (Math.random() - 0.5) * 0.03 * (r / ISCO_UNITS),
        speed: 1,
      };
    });
    const dotTex = makeSoftDotTexture(three);
    this.disposables.push(dotTex);
    this.diskGeo = new three.BufferGeometry();
    this.diskGeo.setAttribute('position', new three.BufferAttribute(new Float32Array(this.diskCount * 3), 3));
    this.diskGeo.setAttribute('color', new three.BufferAttribute(new Float32Array(this.diskCount * 3), 3));
    this.diskMat = new three.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, opacity: 0.92,
      map: dotTex, blending: three.AdditiveBlending, depthWrite: false,
    });
    bg.add(new three.Points(this.diskGeo, this.diskMat));
    this.disposables.push(this.diskGeo, this.diskMat);

    // Warstwa 2: korona/wiatr dysku — rzadsza, grubsza (większy rozrzut
    // pionowy), wolniejsza, ciemniejsza — daje scenie głębię wolumetryczną
    // zamiast płaskiego pierścienia (jonizowany gaz nad/pod płaszczyzną
    // dysku realnie istnieje w dyskach akrecyjnych — tu poglądowo, bez
    // osobnego modelu MHD).
    this.coronaCount = scaleCount(480, tier);
    this.coronaBase = Array.from({ length: this.coronaCount }, () => ({
      r: ISCO_UNITS * 0.9 + Math.random() * (CORONA_OUTER_UNITS - ISCO_UNITS * 0.9),
      a0: Math.random() * Math.PI * 2,
      y0: (Math.random() - 0.5) * 0.9 * (0.3 + Math.random() * 0.7),
      speed: 0.6,
    }));
    this.coronaGeo = new three.BufferGeometry();
    this.coronaGeo.setAttribute('position', new three.BufferAttribute(new Float32Array(this.coronaCount * 3), 3));
    this.coronaGeo.setAttribute('color', new three.BufferAttribute(new Float32Array(this.coronaCount * 3), 3));
    this.coronaMat = new three.PointsMaterial({
      size: 0.14, vertexColors: true, transparent: true, opacity: 0.22,
      map: dotTex, blending: three.AdditiveBlending, depthWrite: false,
    });
    bg.add(new three.Points(this.coronaGeo, this.coronaMat));
    this.disposables.push(this.coronaGeo, this.coronaMat);

    // Kamera znacznie bliżej niż poprzednia wersja (założycielski audyt:
    // "framing" jako słabość — horyzont zajmował tylko ułamek kadru mimo
    // wcześniejszego przybliżenia). Bez zmiany fizyki: r_s pozostaje
    // jedyną skalą sceny, więc horyzont/dysk/pierścień fotonowy nadal
    // skalują się jednorodnie z suwakiem masy — zmienia się tylko dystans
    // obserwatora względem tej skali.
    camera.position.set(this.RS * 5.2, this.RS * 3.1, this.RS * 6.8);
    camera.lookAt(0, 0, 0);
    if (!reduced) camera.fov = 86;
    camera.updateProjectionMatrix();
  }

  setupPostProcessing(modules: PostProcessingModules, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): PostProcessor {
    const { EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass } = modules;
    const tier = detectRenderTier();
    const composer = new EffectComposer(renderer);

    // 1) Tło (gwiazdy/dysk/korona) — czyste, niesoczewkowane, do bufora.
    composer.addPass(new RenderPass(this.bgScene!, camera));

    // 2) Soczewka grawitacyjna — wygina CAŁY bufor tła (patrz LENS_WARP_FRAGMENT).
    this.lensPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uCenter: { value: new this.three!.Vector2(0.5, 0.5) },
        uResolution: { value: new this.three!.Vector2(w, h) },
        uPxPerRS: { value: 100 },
        uThetaE: { value: 0.2 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: LENS_WARP_FRAGMENT,
    });
    composer.addPass(this.lensPass);

    // 3) Pierwszy plan (horyzont + pierścień + tory fotonów) — domalowany
    // NA WIERZCH soczewkowanego tła: nie czyścimy koloru, ale czyścimy
    // głębię, żeby te obiekty depth-testowały się poprawnie MIĘDZY SOBĄ
    // (nie względem "martwego" bufora głębi z kroku 1).
    const fgPass = new RenderPass(scene, camera);
    fgPass.clear = false;
    fgPass.clearDepth = true;
    composer.addPass(fgPass);

    // Bloom jest selektywny wg jasności (threshold) — to właśnie robi go
    // "depth-aware": tylko najgorętsza (najjaśniejsza) materia blisko ISCO
    // i pierścień fotonowy przekraczają próg i świecą, reszta dysku
    // pozostaje matowa — zgodnie z gradientem temperatury z syncScene().
    const strength = tierAllowsBloom(tier) ? 0.95 : 0.55;
    this.bloom = new UnrealBloomPass(new this.three!.Vector2(w, h), strength, 0.45, 0.34);
    composer.addPass(this.bloom);

    // 4) Kinowe rozjaśnienie wejścia — jeden mnożnik nad całym obrazem.
    this.fadePass = createFadePass(ShaderPass, getSettings().reducedMotion ? 1 : 0);
    composer.addPass(this.fadePass);

    composer.addPass(new OutputPass());
    return {
      render: () => composer.render(),
      setSize: (nw, nh) => {
        composer.setSize(nw, nh);
        this.viewW = nw;
        this.lensPass?.uniforms.uResolution.value.set(nw, nh);
      },
      dispose: () => this.bloom?.dispose(),
    };
  }

  reset = () => {
    for (const ph of this.photons) {
      this.scene?.remove(ph.line);
      ph.geo.dispose();
      (ph.line.material as THREE.Material).dispose();
    }
    this.photons = [];
    this.captured = 0;
    this.escaped = 0;
  };

  private spawn(three: typeof THREE) {
    const bc = SCHWARZSCHILD_CRITICAL_IMPACT * this.RS;
    const b = bc * this.bScale * (0.75 + Math.random() * 0.5);
    const r0 = this.RS * 40;
    const phi0 = Math.PI - Math.asin(Math.min(1, b / r0));
    const u0 = Math.sin(phi0) / b;
    const du0 = Math.cos(phi0) / b;
    const [e1v, e2v] = randomPlaneBasis(three);

    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    geo.setAttribute('color', new three.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    geo.setDrawRange(0, 0);
    // Kolor per-wierzchołek (patrz syncScene): jaśniejszy/cieplejszy bliżej
    // horyzontu, przygaszony na "ogonie" toru — geodezyjne mają być
    // informacją naukową NAD sceną, nie dominować nad samą czarną dziurą
    // (patrz honestyNote: hierarchia wizualna).
    const mat = new three.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });
    const line = new three.Line(geo, mat);
    this.scene!.add(line);

    this.photons.push({
      u: u0, du: du0, phi: phi0,
      e1: [e1v.x, e1v.y, e1v.z], e2: [e2v.x, e2v.y, e2v.z],
      dead: false, captured: false, trail: [], line, geo,
    });
  }

  update(dt: number, p: SimParams) {
    this.bScale = Number(p.impact);
    this.targetRS = Math.max(RS_MIN, Math.min(RS_MAX, Number(p.mass) || 1));
    // r_s zbiega płynnie do wartości suwaka — realny czas, niezależny od
    // "tempa symulacji" (to przejście renderujące, nie fizyka toru fotonu).
    this.RS += (this.targetRS - this.RS) * Math.min(1, dt * RS_LERP_RATE);

    const speed = Math.max(0.05, Number(p.speed) || 1);
    const simDt = dt * speed;
    if (!getSettings().reducedMotion) this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + dt);

    this.t += simDt;
    this.spawnAcc += simDt;
    if (this.spawnAcc > 0.22 && this.photons.length < MAX_PHOTONS && this.three) {
      this.spawnAcc = 0;
      this.spawn(this.three);
    }

    const dphi = 0.02;
    for (const ph of this.photons) {
      if (ph.dead) {
        if (ph.trail.length > 0) ph.trail.shift();
        continue;
      }
      const steps = Math.round(simDt * 220);
      for (let s = 0; s < steps; s++) {
        // Foton leci w stronę malejącego φ — patrz komentarz w
        // einstein-geodesics.ts (ten sam fizyczny powód, ta sama funkcja).
        // Bieżące (chwilowe) self.RS — patrz komentarz na górze pliku o
        // płynnej zmianie masy w trakcie lotu fotonu.
        const next = stepSchwarzschildGeodesic(ph.u, ph.du, -dphi, this.RS);
        ph.u = next.u;
        ph.du = next.du;
        ph.phi -= dphi;
        if (ph.u > 1 / (this.RS * 1.01)) {
          ph.dead = true;
          ph.captured = true;
          this.captured++;
          break;
        }
        if (ph.u <= 1 / (this.RS * 44)) {
          ph.dead = true;
          this.escaped++;
          break;
        }
      }
      const r = 1 / ph.u;
      // Tor rysowany dopiero blisko czarnej dziury (patrz TRAIL_RENDER_UNITS)
      // — z 40 r_s dystansu spawn punktu tor byłby długą, niemal prostą
      // "laserową" linią przecinającą cały kadr: fizycznie poprawną (daleko
      // od masy krzywizna jest znikoma), ale wizualnie przytłaczającą samą
      // czarną dziurę. Pomijając ten odcinek NIE tracimy nauki: krzywizna
      // tam i tak jest nieistotna, więc widoczny fragment toru to dokładnie
      // ta część, gdzie ugięcie jest naprawdę widoczne.
      if (r <= this.RS * TRAIL_RENDER_UNITS) {
        const cr = r * Math.cos(ph.phi);
        const sr = r * Math.sin(ph.phi);
        ph.trail.push({
          x: ph.e1[0] * cr + ph.e2[0] * sr,
          y: ph.e1[1] * cr + ph.e2[1] * sr,
          z: ph.e1[2] * cr + ph.e2[2] * sr,
        });
        if (ph.trail.length > MAX_TRAIL) ph.trail.shift();
      }
    }

    this.photons = this.photons.filter((ph) => {
      const alive = !ph.dead || ph.trail.length > 0;
      if (!alive) {
        this.scene?.remove(ph.line);
        ph.geo.dispose();
        (ph.line.material as THREE.Material).dispose();
      }
      return alive;
    });
  }

  /**
   * Rzutuje środek czarnej dziury (zawsze w (0,0,0)) i punkt oddalony o
   * jeden r_s wzdłuż wektora "w prawo" kamery na ekran, żeby policzyć
   * bieżącą skalę piksele-na-r_s — odporne na obrót/zoom kamery, bo
   * przesunięcie wzdłuż wektora "w prawo" kamery zawsze rzutuje się na
   * czysto poziomy offset ekranowy.
   */
  private updateLensUniforms() {
    const pass = this.lensPass;
    const camera = this.camera;
    if (!pass || !camera || !this.tmpOrigin || !this.tmpRight || !this.tmpXAxis || !this.tmpYAxis || !this.tmpZAxis) return;

    this.tmpOrigin.set(0, 0, 0).project(camera);
    const cu = this.tmpOrigin.x * 0.5 + 0.5;
    const cv = this.tmpOrigin.y * 0.5 + 0.5;

    camera.matrixWorld.extractBasis(this.tmpXAxis, this.tmpYAxis, this.tmpZAxis);
    this.tmpRight.copy(this.tmpXAxis).multiplyScalar(this.RS).project(camera);
    const ru = this.tmpRight.x * 0.5 + 0.5;
    const pxPerRS = Math.max(4, Math.abs(ru - cu) * this.viewW);

    pass.uniforms.uCenter.value.set(cu, cv);
    pass.uniforms.uPxPerRS.value = pxPerRS;
    // θ_E w tych samych jednostkach r_s co reszta soczewkowania — steruje
    // nim ZARÓWNO parametr zderzenia, JAK I bieżąca masa (patrz honestyNote).
    pass.uniforms.uThetaE.value = 0.85 * Math.sqrt(this.bScale) * Math.sqrt(this.RS);
  }

  syncScene(_scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    for (const ph of this.photons) {
      const posAttr = ph.geo.attributes.position as THREE.BufferAttribute;
      const colAttr = ph.geo.attributes.color as THREE.BufferAttribute;
      const n = ph.trail.length;
      for (let i = 0; i < n; i++) {
        const pt = ph.trail[i];
        posAttr.setXYZ(i, pt.x, pt.y, pt.z);
        // Hierarchia wizualna (patrz honestyNote): geodezyjna ma być
        // informacją NAD sceną, nie konkurować z czarną dziurą o uwagę.
        // "Ogon" toru (starsze punkty) przygaszony, "głowa" (bieżąca
        // pozycja fotonu) jaśniejsza; blisko horyzontu barwa cieplejsza —
        // dokładnie tam, gdzie krzywizna jest fizycznie największa.
        const r = Math.hypot(pt.x, pt.y, pt.z);
        const closeness = Math.max(0, Math.min(1, 1 - (r - this.RS * 1.5) / (this.RS * 9)));
        const age = n > 1 ? (i + 1) / n : 1;
        const fade = 0.22 + 0.78 * age;
        if (ph.captured) {
          colAttr.setXYZ(i, 0.85 * fade, 0.32 * fade, 0.3 * fade);
        } else {
          const cr = (0.32 + 0.62 * closeness) * fade;
          const cg = (0.68 + 0.28 * closeness) * fade;
          const cb = (0.82 - 0.15 * closeness) * fade;
          colAttr.setXYZ(i, cr, cg, cb);
        }
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      ph.geo.setDrawRange(0, n);
    }

    // Kinowe rozjaśnienie wejścia — jeden mnożnik nad całym skomponowanym
    // obrazem (fadePass), plus zwężenie kąta widzenia. Pomijane przy
    // reducedMotion (patrz setupPostProcessing/init: uFade startuje od 1).
    const introT = Math.min(1, this.introElapsed / INTRO_DURATION);
    const eased = 1 - Math.pow(1 - introT, 3);
    if (this.camera && !getSettings().reducedMotion) {
      const fov = 86 - (86 - 50) * eased;
      if (Math.abs(this.camera.fov - fov) > 0.01) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
      if (this.fadePass) this.fadePass.uniforms.uFade.value = eased;
    }

    if (this.horizonMesh) this.horizonMesh.scale.setScalar(this.RS);
    if (this.ringMesh && this.ringMat) {
      this.ringMesh.scale.setScalar(this.RS * RING_UNITS);
      this.ringMat.uniforms.uIntensity.value = 1.1;
      this.ringMat.uniforms.uPhase.value = this.t * 0.5;
    }

    this.syncDiskLayer(this.diskGeo, this.diskBase, this.diskCount, ISCO_UNITS, DISK_OUTER_UNITS, 1, DISK_BETA_ISCO, camera);
    this.syncDiskLayer(this.coronaGeo, this.coronaBase, this.coronaCount, ISCO_UNITS * 0.9, CORONA_OUTER_UNITS, 0.4, CORONA_BETA_ISCO, camera);

    if (camera) this.updateLensUniforms();
  }

  /**
   * Renderuje jedną warstwę dysku z DWOMA prawdziwymi (kierunkowo) efektami
   * relatywistycznymi, sterowanymi geometrią kamery — to one, a nie ozdoba,
   * dają dyskowi charakterystyczną asymetrię ze zdjęć czarnych dziur:
   *
   * 1. Różniczkowa rotacja Keplerowska: ω ∝ r^-3/2 (materia wewnętrzna okrąża
   *    szybciej) — prawdziwe prawo Keplera, więc wewnętrzna krawędź "wiruje"
   *    wyraźnie szybciej niż zewnętrzna.
   * 2. Wzmocnienie relatywistyczne (beaming) + przesunięcie Dopplera: strona
   *    dysku poruszająca się KU kamerze jest pojaśniona i przesunięta ku
   *    błękitowi, oddalająca się — przygaszona i czerwieńsza. Używamy
   *    prawdziwego czynnika Dopplera δ = 1/(γ(1−β·cosθ)) i strumienia ∝ δ³
   *    (relatywistyczne beaming; wykładnik 3, bez indeksu widmowego α —
   *    poglądowe uproszczenie). β(r) rośnie ku ISCO jak r^-1/2 (kształt
   *    keplerowski), znormalizowane do β(ISCO) warstwy — PHYSICALLY INFORMED:
   *    kierunek, znak i kształt zależności są prawdziwe, dokładny profil
   *    prędkości i pełny transfer promieniowania — nie.
   */
  private syncDiskLayer(geo: THREE.BufferGeometry | undefined, base: DiskParticle[], count: number, rInnerUnits: number, rOuterUnits: number, brightMul: number, betaIsco: number, camera: THREE.PerspectiveCamera) {
    if (!geo) return;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colAttr = geo.attributes.color as THREE.BufferAttribute;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < count; i++) {
      const b = base[i];
      // Keplerowska prędkość kątowa ω ∝ r^-3/2.
      const rot = b.a0 + this.t * b.speed * DISK_OMEGA * Math.pow(b.r, -1.5);
      const c = Math.cos(rot), s = Math.sin(rot);
      const rScene = b.r * this.RS;
      const px = rScene * c, py = b.y0 * this.RS, pz = rScene * s;
      posAttr.setXYZ(i, px, py, pz);

      // Gradient temperatury: T(r) ∝ r^-3/4 (prawdziwy kierunek zależności) —
      // barwa własna materii, jeszcze bez beamingu.
      const tGrad = Math.pow(1 - (b.r - rInnerUnits) / (rOuterUnits - rInnerUnits), 0.75);
      const [tr, tg, tb] = thermalColor(tGrad, 1);

      // Beaming Dopplera. Kierunek prędkości orbitalnej (styczna, zgodnie z
      // rosnącym rot) leży w płaszczyźnie dysku: v̂ = (−sin, 0, cos).
      const vdx = -s, vdz = c;
      let lx = cx - px, lz = cz - pz;
      const ly = cy - py;
      const ll = Math.hypot(lx, ly, lz) || 1e-6; lx /= ll; lz /= ll;
      const cosTheta = vdx * lx + vdz * lz; // składowa pionowa prędkości = 0
      const beta = Math.min(0.75, betaIsco * Math.sqrt(rInnerUnits / b.r));
      const gamma = 1 / Math.sqrt(1 - beta * beta);
      const delta = 1 / (gamma * (1 - beta * cosTheta)); // czynnik Dopplera δ
      const beaming = brightMul * delta * delta * delta; // strumień ∝ δ³

      let r = tr * beaming, g = tg * beaming, bl = tb * beaming;
      // Przesunięcie widmowe: zbliżająca strona (δ>1) bielsza/błękitniejsza.
      const blue = Math.max(0, delta - 1) * brightMul;
      r += blue * 0.45; g += blue * 0.7; bl += blue * 1.0;
      colAttr.setXYZ(i, Math.min(1, r), Math.min(1, g), Math.min(1, bl));
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  getStats() {
    return { captured: this.captured, escaped: this.escaped, rs: Math.round(this.RS * 100) / 100 };
  }

  dispose() {
    for (const ph of this.photons) {
      ph.geo.dispose();
      (ph.line.material as THREE.Material).dispose();
    }
    this.photons = [];
    if (this.starfield) {
      this.starfield.geometry.dispose();
      this.starfield.material.dispose();
      this.starfield.texture.dispose();
    }
    this.lensPass?.material.dispose();
    this.fadePass?.material.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

export const einsteinBlackHole3D: ExperimentDef = {
  id: 'blackhole-3d',
  name: 'Czarna dziura 3D',
  honesty: 'exact',
  honestyNote:
    'Tory fotonów: dokładne równanie geodezyjnej zerowej Schwarzschilda d²u/dφ² = −u + 1,5 r_s u² (RK4), rozszerzone do 3D — każdy foton porusza się w losowo zorientowanej płaszczyźnie przez środek (dokładne — geodezyjne wokół masy sferycznie symetrycznej ZAWSZE leżą w jednej płaszczyźnie). Suwak "masa" NAPRAWDĘ skaluje r_s w tym samym równaniu (nie tylko wizualnie) — geodezyjne Schwarzschilda są ściśle samopodobne w jednostkach r_s, więc jest to dokładne, jednorodne przeskalowanie przestrzeni; r_s zmienia się płynnie w czasie (realny czas, nie klatka), co jest uproszczeniem względem znacznie trudniejszej dynamicznej metryki rosnącej/malejącej masy. Tło (gwiazdy, dysk, korona) jest renderowane w osobnym przebiegu i WYGINANE przez shader post-processingu, który dla każdego piksela odwraca równanie soczewki punktowej słabego pola θ = β + θ_E²/β (ten sam wzór co "test z 1919 roku" w narracji, θ_E sterowane zarówno parametrem zderzenia jak i masą) — to POGLĄDOWE (jeden obraz na piksel, bez wtórnych obrazów/pierścienia Einsteina, jakie dałby pełny ray-tracing geodezyjnych w przestrzeni obrazu), ale to prawdziwe, per-pikselowe wyginanie obrazu wokół sylwetki, nie tylko przesunięcie dyskretnych punktów. Dysk akrecyjny łączy kilka PRAWDZIWYCH (kierunkowo) efektów: różniczkowa rotacja Keplerowska (ω ∝ r^-3/2 — wewnętrzna materia okrąża szybciej), gradient temperatury (T(r) ∝ r^-3/4 — wewnętrzna krawędź gorętsza/bielsza) oraz relatywistyczne wzmocnienie Dopplera (beaming): strona dysku zbliżająca się do kamery jest pojaśniona i przesunięta ku błękitowi, oddalająca — przygaszona i czerwieńsza, liczone prawdziwym czynnikiem Dopplera δ = 1/(γ(1−β·cosθ)) i strumieniem ∝ δ³. To właśnie ten efekt daje jasną asymetrię widoczną na zdjęciach EHT. PHYSICALLY INFORMED: znaki, kierunki i kształt zależności są prawdziwe; dokładny profil prędkości β(r), indeks widmowy beamingu i pełny transfer promieniowania ciała doskonale czarnego — nie. Korona (gruby, rzadki "wiatr" nad dyskiem) jest poglądowa, nie modeluje MHD plazmy. Pierścień fotonowy (świecąca krawędź horyzontu, z asymetrią jasności zgodną z kierunkiem wzmocnienia Dopplera dysku) ma promień z DOKŁADNEGO b_krytyczne = 2,598 r_s, ale jego kształt/blask to fresnel rim-glow, nie ray-tracing OTW. Mgławicowe plamy w bardzo dalekim tle i kinowe rozjaśnienie przy wejściu są CZYSTO ILUSTRACYJNE — nie są zdjęciami ani danymi astronomicznymi. Widoczny fragment toru fotonu zaczyna się dopiero ok. 15 r_s od horyzontu — dalszy, niemal prosty odcinek jest fizycznie prawdziwy, ale krzywizna jest tam znikoma, więc jego pominięcie w rysowaniu nie ukrywa istotnej fizyki, tylko oczyszcza scenę z wizualnego szumu. Bloom to prawdziwy efekt post-processingu (UnrealBloomPass, próg jasności), nie fotorealizm filmowy.',
  params: [
    {
      key: 'mass', label: 'Masa (skala horyzontu)', type: 'slider',
      min: 0.5, max: 2.2, step: 0.05, default: 1,
      format: (v) => `${v.toFixed(2)}×`,
    },
    {
      key: 'impact', label: 'Parametr zderzenia b / b_krytyczne', type: 'slider',
      min: 0.5, max: 2.2, step: 0.05, default: 1.1,
      format: (v) => `${v.toFixed(2)}×`,
    },
    {
      key: 'speed', label: 'Tempo symulacji', type: 'slider',
      min: 0.2, max: 3, step: 0.1, default: 1,
      format: (v) => `${v.toFixed(1)}×`,
    },
  ],
  createSim3D: () => new BlackHole3DSim(),
  narrate(p, stats) {
    const bScale = Number(p.impact);
    const massScale = Number(p.mass ?? 1);
    const cap = Number(stats.captured ?? 0);
    const esc = Number(stats.escaped ?? 0);
    return [
      {
        title: `Granica: b_c = 2,598 r_s (${cap} pochłoniętych, ${esc} uciekło)`,
        body:
          bScale < 0.95
            ? 'Fotony celują poniżej krytycznego parametru zderzenia — wszystkie kończą pod horyzontem, niezależnie od tego, w jakiej płaszczyźnie 3D lecą (symetria sferyczna: kierunek nie ma znaczenia, tylko odległość promienia od środka).'
            : bScale < 1.25
              ? 'Jesteś tuż przy b_c — fotony okrążają czarną dziurę po kilka razy w SWOJEJ płaszczyźnie, zanim uciekną albo wpadną. Te niemal-uwięzione orbity, zsumowane po wszystkich możliwych płaszczyznach, tworzą pierścień fotonowy widoczny na zdjęciach Teleskopu Horyzontu Zdarzeń.'
              : 'Przy b znacznie powyżej b_c fotony są tylko ugięte. Obróć scenę (przeciągnij) — zobaczysz, że tory nie leżą w jednej płaszczyźnie: każdy foton ma własną, losową orientację, bo czarna dziura Schwarzschilda nie wyróżnia żadnego kierunku w przestrzeni.',
        citation: {
          source: 'Schwarzschild 1916; obraz cienia czarnej dziury: Event Horizon Telescope Collaboration 2019/2022',
          confirmation: 'confirmed',
          note: 'Promień krytyczny i kształt cienia potwierdzone obrazami M87* i Sgr A*',
        },
      },
      {
        title: `Masa: ${massScale.toFixed(2)}× — horyzont naprawdę zmienia rozmiar`,
        body: `Suwak masy skaluje r_s wprost w równaniu geodezyjnej: przy ${massScale.toFixed(2)}× domyślnej masy CAŁA scena (horyzont, sfera fotonowa, dysk, ISCO) rośnie lub kurczy się jednorodnie, a nowo wystrzelone fotony są całkowane w tej nowej skali — to dokładna konsekwencja samopodobieństwa geodezyjnych Schwarzschilda, nie ozdobne przybliżenie kamery.`,
      },
      {
        title: 'Dlaczego jedna strona dysku jest jaśniejsza',
        body: 'Materia dysku okrąża czarną dziurę z prędkością bliską światła (najszybciej przy ISCO — rotacja Keplerowska ω ∝ r^-3/2). Strona poruszająca się KU obserwatorowi jest relatywistycznie pojaśniona i przesunięta ku błękitowi (beaming, strumień ∝ δ³), oddalająca — przygaszona i czerwieńsza. Obróć kamerę wokół dysku (przeciągnij) — jasna strona przesuwa się razem z geometrią, bo to efekt kierunkowy względem Ciebie, nie namalowana plama. Dokładnie ta asymetria zdradziła kierunek rotacji dysku M87* na zdjęciu Teleskopu Horyzontu Zdarzeń.',
        citation: {
          source: 'Event Horizon Telescope Collaboration 2019 (M87*); relatywistyczne beaming: Rees 1966',
          confirmation: 'confirmed',
          note: 'Asymetria jasności pierścienia M87* zinterpretowana jako beaming Dopplera wirującego dysku',
        },
      },
      {
        title: 'Dwa suwaki, jeden shader soczewkujący',
        body: `Zarówno parametr zderzenia (${bScale.toFixed(2)}×), JAK I masa sterują siłą soczewkowania grawitacyjnego tła wokół sylwetki czarnej dziury — zwiększ którykolwiek, by zobaczyć silniejsze wyginanie gwiazd I dysku wokół krawędzi cienia.`,
      },
    ];
  },
};
