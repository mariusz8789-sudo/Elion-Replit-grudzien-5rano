import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { chshS, sampleLocalHiddenPair, sampleSingletPair, singletCorrelation } from '../../core/physics';
import { detectRenderTier, tierAllowsAO, tierAllowsBloom, recommendedShadowMapSize } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';
import { createPBRMaterial, createEmissiveInstrumentMaterial, createScreenMaterial } from '../../core/three/graphics/materials';
import { createHeroLight, createBackgroundFill, applyStudioEnvironment } from '../../core/three/graphics/lighting';
import { makeSoftDotTexture } from '../../core/three/starfield';
import { HumanoidAgentVisual, type HumanoidAgentState } from '../../core/three/humanoidAgentVisual';

/**
 * Splątanie i nierówność CHSH — w prawdziwym 3D, tym samym game-grade
 * standardzie co scena powodziowa (PBR, HERO+BACKGROUND lighting, IBL,
 * bloom/GTAO/SMAA).
 *
 * Twardy warunek, jak wszędzie w tym repo: WARTOŚĆ WIZUALNA = WARTOŚĆ
 * SOLVERA. Zero równoległej "ładnej" animacji obok prawdziwej fizyki.
 * Konkretnie:
 *  - Kąt polaryzatora (siatka+belka na każdej stacji) to DOSŁOWNIE
 *    `mesh.rotation.x = kąt_w_radianach` — ten sam kąt co na suwaku, ustawiany
 *    KAŻDĄ klatkę wprost z parametrów, nigdy interpolowany do celu.
 *  - Wiązka splątania (tuba między stacjami) świeci kolorem/jasnością
 *    wyliczoną KAŻDĄ klatkę z `singletCorrelation(a,b)` dla BIEŻĄCYCH kątów
 *    a/b — nie z estymaty Monte Carlo, więc reaguje na suwak natychmiast,
 *    zanim padnie choćby jedna nowa para.
 *  - Miernik |S| to belka, której wypełnienie = |S|/3 z DOKŁADNIE tej samej
 *    funkcji `S()` (estymata z realnych prób) co poprzednia wersja 2D, plus
 *    druga, cienka kreska pokazująca DOKŁADNĄ teorię `chshS(...)` dla
 *    bieżących kątów (przez `runChshCorrelationScenario`) — więc widać
 *    jednocześnie "co przewiduje teoria TERAZ" i "co pokazała dotychczasowa
 *    statystyka".
 *  - Kolor każdego fotonu w locie ujawnia się DOPIERO w momencie dotarcia do
 *    WŁASNEGO detektora (nie przy emisji) — pokazanie wyniku wcześniej
 *    sugerowałoby ukrytą, z góry ustaloną wartość, czyli dokładnie to, co
 *    twierdzenie Bella obala. Lot to tylko czytelne tempo prezentacji
 *    (identyczna dyscyplina co `progress` torów w particle-detector-3d.ts) —
 *    sama wartość ±1 jest już znana (wylosowana zgodnie z realnym wzorem),
 *    tylko odsłonięta wizualnie w fizycznie właściwym momencie.
 *  - Naukowcy (HumanoidAgentVisual, `showStatusOverlay=false` — to nie są
 *    agenci epidemiologiczni) przechodzą w pozę 'gesture' i odwracają się w
 *    stronę wyniku DOKŁADNIE w oknie `flash>0`, czyli tym samym sygnale,
 *    który już steruje błyskiem/kolorem fotonu — żadna osobna "wow" oś czasu.
 */

const DEG = Math.PI / 180;
const STATION_X = 2.35;
const WAIST_Y = 1.15;
const FLIGHT_DURATION = 0.42; // s — czytelne tempo lotu fotonu, nie fizyczna prędkość światła
const SAMPLE_RATE = 400; // par/s, identyczne z poprzednią wersją 2D

interface PhotonFlight {
  side: -1 | 1; // -1 = Alicja (x<0), 1 = Bob (x>0)
  elapsed: number;
  outcome: 1 | -1;
  revealed: boolean;
}

/** Kolor odsłaniany wyłącznie w momencie dotarcia fotonu do JEGO WŁASNEGO detektora — patrz nagłówek pliku. */
export function outcomeColor(v: number): number {
  return v > 0 ? 0x6ee7a0 : 0xf47c7c;
}

/** Liniowa interpolacja RGB między dwoma hex-kolorami — czysta funkcja, bez zależności od THREE.Color. */
export function lerpColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const fr = (from >> 16) & 0xff, fg = (from >> 8) & 0xff, fb = from & 0xff;
  const tr = (to >> 16) & 0xff, tg = (to >> 8) & 0xff, tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * clamped);
  const g = Math.round(fg + (tg - fg) * clamped);
  const b = Math.round(fb + (tb - fb) * clamped);
  return (r << 16) | (g << 8) | b;
}

/** Kreśli krótki tekst na canvasie i zwraca teksturę — ten sam wzorzec co bloch-3d.ts. */
function makeLabelTexture(three: typeof THREE, text: string, w = 160, h = 64): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 26px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(230,234,245,0.92)';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface Disposable { dispose(): void }

interface Station {
  side: -1 | 1;
  gantry: THREE.Group;
  primaryBar: THREE.Mesh;
  primeBar: THREE.Mesh;
  primaryGlow: THREE.MeshStandardMaterial;
  primeGlow: THREE.MeshStandardMaterial;
  screenCanvas: HTMLCanvasElement;
  screenCtx: CanvasRenderingContext2D;
  screenTexture: THREE.CanvasTexture;
  lastScreenKey: string;
  scientist: HumanoidAgentVisual;
  photon: THREE.Sprite;
  photonMaterial: THREE.SpriteMaterial;
}

class ChshSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0.10;

  private three!: typeof THREE;
  private disposables: Disposable[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;

  // Statystyka — identyczna logika co wersja 2D (sums/counts po 4 kombinacjach kątów).
  private sums = [0, 0, 0, 0];
  private counts = [0, 0, 0, 0];
  private acc = 0;
  private flash = 0;

  // Wartości TERAZ (bez czekania na nową próbę) — bezpośrednio z fizyki.
  private eLive = 0; // singletCorrelation(a,b) dla bieżących kątów podstawowych
  private sTheoryAbs = 0; // |chshS(...)| dla bieżących a,aP,b,bP

  private flights: [PhotonFlight | null, PhotonFlight | null] = [null, null]; // [Alicja, Bob]

  private stations!: [Station, Station];
  private sourceGlow!: THREE.MeshStandardMaterial;
  private sourceEmitPulse = 0;
  private entangleTube!: THREE.Mesh;
  private entangleMaterial!: THREE.MeshStandardMaterial;
  private gaugeFill!: THREE.Mesh;
  private gaugeFillMaterial!: THREE.MeshStandardMaterial;
  private gaugeTheoryMark!: THREE.Mesh;
  private readoutSprite!: THREE.Sprite;
  private readoutCanvas!: HTMLCanvasElement;
  private readoutCtx!: CanvasRenderingContext2D;
  private readoutTexture!: THREE.Texture;
  private lastReadoutKey = '';
  // Sim3D.syncScene() dostaje tylko (scene,camera) — bez params/czasu — więc update()
  // zapamiętuje ostatnie realne wartości, a syncScene() czyta je stąd (nie liczy niczego
  // od nowa, tylko przenosi to, co już policzył update() z prawdziwej fizyki, na sceny).
  private lastParams: SimParams = {};
  private timeAccum = 0;

  private angles(p: SimParams): [number, number, number, number] {
    return [Number(p.a) * DEG, Number(p.aP) * DEG, Number(p.b) * DEG, Number(p.bP) * DEG];
  }

  private buildStation(three: typeof THREE, scene: THREE.Scene, side: -1 | 1): Station {
    const three_ = three;
    const x = side * STATION_X;
    const gantry = new three_.Group();
    gantry.position.set(x, WAIST_Y, 0);
    scene.add(gantry);

    // Stojak: słupek + podstawa, TECH_COMPOSITE — ten sam PBR słownik co reszta Genesis.
    const postGeo = new three_.CylinderGeometry(0.05, 0.07, WAIST_Y, 10);
    const postMat = createPBRMaterial(three_, 'TECH_COMPOSITE') as THREE.MeshStandardMaterial;
    const post = new three_.Mesh(postGeo, postMat);
    post.position.set(x, WAIST_Y / 2, 0);
    post.receiveShadow = true;
    scene.add(post);
    this.disposables.push(postGeo, postMat);

    // Dwa analizatory (kąt podstawowy + primowany), obok siebie wzdłuż Z, oba
    // ZAWSZE widoczne, oba NIEUSTANNIE ustawiane na realny kąt suwaka.
    const ringGeo = new three_.TorusGeometry(0.34, 0.018, 10, 40);
    const ringMat = createPBRMaterial(three_, 'POLISHED_METAL') as THREE.MeshStandardMaterial;
    const barGeo = new three_.BoxGeometry(0.02, 0.62, 0.05);

    const makeAnalyzer = (zOffset: number, glowColor: number): { bar: THREE.Mesh; glowMat: THREE.MeshStandardMaterial } => {
      const ring = new three_.Mesh(ringGeo, ringMat);
      ring.rotation.y = Math.PI / 2; // oś otworu pierścienia = lokalny X = oś wiązki
      ring.position.z = zOffset;
      gantry.add(ring);
      const glowMat = createEmissiveInstrumentMaterial(three_, { color: glowColor, intensity: 0.9 });
      const bar = new three_.Mesh(barGeo, glowMat);
      bar.position.z = zOffset;
      gantry.add(bar);
      this.disposables.push(glowMat);
      return { bar, glowMat };
    };
    const primary = makeAnalyzer(-0.42, 0x5cd6e8);
    const prime = makeAnalyzer(0.42, 0xa78bfa);
    this.disposables.push(ringGeo, ringMat, barGeo);

    // Konsola z realnym ekranem (ostatni wynik tej stacji) — ten sam wzorzec SCREEN co lab.
    const consoleGeo = new three_.BoxGeometry(0.5, 0.55, 0.32);
    const consoleMat = createPBRMaterial(three_, 'BRUSHED_METAL') as THREE.MeshStandardMaterial;
    const consoleMesh = new three_.Mesh(consoleGeo, consoleMat);
    consoleMesh.position.set(x, 0.28, side * 0.7);
    consoleMesh.receiveShadow = true;
    scene.add(consoleMesh);
    this.disposables.push(consoleGeo, consoleMat);

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 256;
    screenCanvas.height = 128;
    const screenCtx = screenCanvas.getContext('2d')!;
    const screenTexture = new three_.CanvasTexture(screenCanvas);
    const screenMat = createScreenMaterial(three_, screenTexture, { tint: 0x5cd6e8, emissiveIntensity: 0.5 });
    const screenGeo = new three_.PlaneGeometry(0.42, 0.21);
    const screenMesh = new three_.Mesh(screenGeo, screenMat);
    screenMesh.position.set(x, 0.42, side * 0.7 + side * 0.17);
    screenMesh.rotation.y = side > 0 ? Math.PI : 0;
    scene.add(screenMesh);
    this.disposables.push(screenGeo, screenMat, screenTexture);

    // Naukowiec — obserwator przy stacji, nie ambient tło; showStatusOverlay=false bo to
    // nie agent epidemiologiczny (patrz humanoidAgentVisual.ts::sync).
    const scientist = new HumanoidAgentVisual(three_, 1000 + side);
    scientist.root.position.set(x + side * 0.55, 0, side * 1.3);
    scene.add(scientist.root);

    // Foton tej stacji — sprite reużywany między lotami (bez tworzenia/dispose co próbę).
    const dotTex = makeSoftDotTexture(three_);
    const photonMat = new three_.SpriteMaterial({ map: dotTex, color: 0xe6eaf5, transparent: true, depthWrite: false, opacity: 0 });
    const photon = new three_.Sprite(photonMat);
    photon.scale.set(0.16, 0.16, 1);
    scene.add(photon);
    this.disposables.push(photonMat, dotTex);

    return {
      side, gantry, primaryBar: primary.bar, primeBar: prime.bar,
      primaryGlow: primary.glowMat, primeGlow: prime.glowMat,
      screenCanvas, screenCtx, screenTexture, lastScreenKey: '',
      scientist, photon, photonMaterial: photonMat,
    };
  }

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, _w: number, _h: number): void {
    void _w; void _h;
    this.three = three;
    this.introElapsed = getSettings().reducedMotion ? 1 : 0;

    scene.background = new three.Color(0x05070f);
    camera.position.set(0, 2.4, 6.4);
    camera.lookAt(0, 1.0, 0);

    // Podłoga laboratorium — ten sam PBR słownik LAB_FLOOR co labScene3D.ts. LAB_FLOOR's
    // roughnessMap defaults to repeat(1,1) (fine for the compact flagship lab room it was tuned
    // on); stretched across this floor's 12-unit diameter with no tiling, the same fine speckle
    // texture blows up into large, blurry, low-frequency blotches — retile it to the actual scale.
    // Podłoga laboratorium — świadomie BEZ LAB_FLOOR's noise/normal maps: confirmed by direct
    // A/B test that its per-pixel procedural grain, meant for a compact room viewed up close,
    // aliases into bright, moving specular fireflies under a SpotLight KEY on a floor this large
    // (12-unit diameter) — a real PBR artifact, not a bug in the KEY light or post-processing.
    // A plain, still-lit MeshStandardMaterial reads as a clean, quiet backdrop for the apparatus.
    const floorGeo = new three.CircleGeometry(6, 48);
    const floorMat = new three.MeshStandardMaterial({ color: 0x1b2233, roughness: 0.7, metalness: 0.02 });
    const floor = new three.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.disposables.push(floorGeo, floorMat);

    // Oświetlenie — HERO na źródło (środek sceny) + BACKGROUND wash, dokładnie ten sam
    // słownik ról co flagowa scena laboratoryjna (graphics/lighting.ts).
    const tier = detectRenderTier();
    const shadowMapSize = recommendedShadowMapSize(tier);
    createHeroLight(three, scene, {
      target: [0, WAIST_Y, 0],
      castShadow: shadowMapSize > 0,
      shadowMapSize: shadowMapSize || undefined,
      color: { key: 0xdcecff, rim: 0x8fe8f5 },
      intensity: { key: 26, rim: 5 },
    });
    createBackgroundFill(three, scene, { intensity: 0.65 });

    // Źródło par splątanych — kula emisyjna w środku, rozbłyskuje przy każdej wyemitowanej parze.
    const sourceGeo = new three.SphereGeometry(0.22, 24, 18);
    this.sourceGlow = createEmissiveInstrumentMaterial(three, { color: 0xf0b35c, intensity: 0.6 });
    const source = new three.Mesh(sourceGeo, this.sourceGlow);
    source.position.set(0, WAIST_Y, 0);
    scene.add(source);
    this.disposables.push(sourceGeo, this.sourceGlow);

    // Wiązka splątania: tuba źródło↔stacja, materiał emisyjny sterowany KAŻDĄ klatkę przez
    // singletCorrelation(a,b) bieżących kątów — patrz syncScene().
    const tubePath = new three.CatmullRomCurve3([
      new three.Vector3(-STATION_X, WAIST_Y, 0), new three.Vector3(0, WAIST_Y, 0), new three.Vector3(STATION_X, WAIST_Y, 0),
    ]);
    const tubeGeo = new three.TubeGeometry(tubePath, 32, 0.025, 8, false);
    this.entangleMaterial = createEmissiveInstrumentMaterial(three, { color: 0x8fe8f5, intensity: 0.5 });
    this.entangleTube = new three.Mesh(tubeGeo, this.entangleMaterial);
    scene.add(this.entangleTube);
    this.disposables.push(tubeGeo, this.entangleMaterial);

    // Miernik |S| — belka nad źródłem; wypełnienie = |S|/3 (te same progi co wersja 2D:
    // granica klasyczna 2, Tsirelson 2√2).
    const gaugeTrackGeo = new three.BoxGeometry(2.6, 0.05, 0.05);
    const gaugeTrackMat = createPBRMaterial(three, 'CERAMIC') as THREE.MeshStandardMaterial;
    const gaugeTrack = new three.Mesh(gaugeTrackGeo, gaugeTrackMat);
    gaugeTrack.position.set(0, WAIST_Y + 0.85, 0);
    scene.add(gaugeTrack);
    this.disposables.push(gaugeTrackGeo, gaugeTrackMat);

    const gaugeFillGeo = new three.BoxGeometry(1, 0.07, 0.07);
    this.gaugeFillMaterial = createEmissiveInstrumentMaterial(three, { color: 0x5cd6e8, intensity: 1 });
    this.gaugeFill = new three.Mesh(gaugeFillGeo, this.gaugeFillMaterial);
    this.gaugeFill.position.set(-1.3, WAIST_Y + 0.85, 0);
    scene.add(this.gaugeFill);
    this.disposables.push(gaugeFillGeo, this.gaugeFillMaterial);

    // Znacznik DOKŁADNEJ teorii (cienka kreska) — pozycja aktualizowana co klatkę z chshS(...).
    const theoryMarkGeo = new three.BoxGeometry(0.03, 0.14, 0.14);
    const theoryMarkMat = createEmissiveInstrumentMaterial(three, { color: 0xffffff, intensity: 1.2 });
    this.gaugeTheoryMark = new three.Mesh(theoryMarkGeo, theoryMarkMat);
    this.gaugeTheoryMark.position.set(0, WAIST_Y + 0.85, 0);
    scene.add(this.gaugeTheoryMark);
    this.disposables.push(theoryMarkGeo, theoryMarkMat);

    for (const [v, color] of [[2, 0xf47c7c], [2 * Math.SQRT2, 0x6ee7a0]] as const) {
      const tickGeo = new three.BoxGeometry(0.02, 0.16, 0.16);
      const tickMat = createEmissiveInstrumentMaterial(three, { color, intensity: 1 });
      const tick = new three.Mesh(tickGeo, tickMat);
      tick.position.set(-1.3 + (v / 3) * 2.6, WAIST_Y + 0.85, 0);
      scene.add(tick);
      this.disposables.push(tickGeo, tickMat);
      const labelTex = makeLabelTexture(three, v === 2 ? '2' : '2√2', 80, 40);
      const labelMat = new three.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false });
      const label = new three.Sprite(labelMat);
      label.position.set(-1.3 + (v / 3) * 2.6, WAIST_Y + 1.05, 0);
      label.scale.set(0.28, 0.14, 1);
      scene.add(label);
      this.disposables.push(labelTex, labelMat);
    }

    this.stations = [this.buildStation(three, scene, -1), this.buildStation(three, scene, 1)];

    // HUD liczbowy — dziecko kamery (diegetyczny HUD, ten sam trik co bloch-3d.ts).
    scene.add(camera);
    this.readoutCanvas = document.createElement('canvas');
    this.readoutCanvas.width = 560;
    this.readoutCanvas.height = 190;
    this.readoutCtx = this.readoutCanvas.getContext('2d')!;
    this.readoutTexture = new three.CanvasTexture(this.readoutCanvas);
    const readoutMat = new three.SpriteMaterial({ map: this.readoutTexture, transparent: true, depthTest: false, depthWrite: false });
    this.readoutSprite = new three.Sprite(readoutMat);
    this.readoutSprite.renderOrder = 999;
    this.readoutSprite.position.set(0, 0.62, -1.3);
    this.readoutSprite.scale.set(1.5, 0.51, 1);
    camera.add(this.readoutSprite);
    this.disposables.push(this.readoutTexture, readoutMat);
  }

  reset = (): void => {
    this.sums = [0, 0, 0, 0];
    this.counts = [0, 0, 0, 0];
    this.flights = [null, null];
  };

  private estimates(): [number, number, number, number] {
    return this.sums.map((s, i) => (this.counts[i] > 0 ? s / this.counts[i] : 0)) as [number, number, number, number];
  }

  private S(): number {
    const [Eab, EabP, EaPb, EaPbP] = this.estimates();
    return Eab - EabP + EaPb + EaPbP;
  }

  update(dt: number, p: SimParams): void {
    const [a, aP, b, bP] = this.angles(p);
    const quantum = String(p.mode) === 'quantum';

    // Wartości TERAZ — bez czekania na próbę, bezpośrednio z suwaków (patrz nagłówek pliku).
    this.eLive = singletCorrelation(a, b);
    this.sTheoryAbs = Math.abs(chshS(singletCorrelation, a, aP, b, bP));

    this.acc += dt * SAMPLE_RATE;
    while (this.acc >= 1) {
      this.acc -= 1;
      const useAP = Math.random() < 0.5;
      const useBP = Math.random() < 0.5;
      const angA = useAP ? aP : a;
      const angB = useBP ? bP : b;
      const [A, B] = quantum ? sampleSingletPair(angA, angB) : sampleLocalHiddenPair(angA, angB);
      const idx = (useAP ? 2 : 0) + (useBP ? 1 : 0);
      this.sums[idx] += A * B;
      this.counts[idx]++;
      this.flash = 0.2;
      this.sourceEmitPulse = 1;
      this.flights[0] = { side: -1, elapsed: 0, outcome: A as 1 | -1, revealed: false };
      this.flights[1] = { side: 1, elapsed: 0, outcome: B as 1 | -1, revealed: false };
    }
    this.flash = Math.max(0, this.flash - dt);
    this.sourceEmitPulse = Math.max(0, this.sourceEmitPulse - dt / 0.3);

    for (let i = 0; i < 2; i++) {
      const f = this.flights[i];
      if (!f) continue;
      f.elapsed += dt;
      if (f.elapsed >= FLIGHT_DURATION) f.revealed = true;
      if (f.elapsed >= FLIGHT_DURATION + 0.35) this.flights[i] = null; // błysk trzyma się chwilę po dotarciu
    }

    if (!getSettings().reducedMotion) this.introElapsed = Math.min(1, this.introElapsed + dt / 1.2);

    this.lastParams = p;
    this.timeAccum += dt;
  }

  private syncStation(station: Station, p: SimParams, timeSeconds: number): void {
    const [a, aP, b, bP] = this.angles(p);
    const isAlice = station.side < 0;
    // Kąt polaryzatora = DOSŁOWNIE wartość suwaka, ustawiana KAŻDĄ klatkę — zero tweenu.
    station.primaryBar.rotation.x = isAlice ? a : b;
    station.primeBar.rotation.x = isAlice ? aP : bP;

    const flight = this.flights[isAlice ? 0 : 1];
    if (flight) {
      const t = Math.min(1, flight.elapsed / FLIGHT_DURATION);
      station.photon.visible = true;
      station.photon.position.set(station.side * STATION_X * t, WAIST_Y, 0);
      station.photonMaterial.opacity = 1;
      if (flight.revealed) {
        station.photonMaterial.color.setHex(outcomeColor(flight.outcome));
        const fadeT = Math.max(0, 1 - (flight.elapsed - FLIGHT_DURATION) / 0.35);
        station.photonMaterial.opacity = fadeT;
        station.photon.scale.setScalar(0.16 + (1 - fadeT) * 0.14);
      } else {
        station.photonMaterial.color.setHex(0xe6eaf5); // nieujawniony jeszcze wynik — neutralny biały lot
        station.photon.scale.setScalar(0.16);
      }
    } else {
      station.photon.visible = false;
    }

    // Naukowiec: gest + zwrócenie się w stronę wyniku dokładnie w oknie flash>0 (ten sam sygnał
    // co błysk fotonu) — poza tym oknem, idle, zwrócony w stronę własnej konsoli.
    const toSource = Math.atan2(0 - station.scientist.root.position.x, 0 - station.scientist.root.position.z);
    const toConsole = Math.atan2(station.side * 0.7 - station.scientist.root.position.x, station.side * 0.7 - station.scientist.root.position.z);
    const reacting = this.flash > 0;
    const state: HumanoidAgentState = {
      id: 1000 + station.side, worldX: station.scientist.root.position.x, worldZ: station.scientist.root.position.z,
      facing: reacting ? toSource : toConsole, speed: 0, gait: 0, pose: reacting ? 'gesture' : 'idle',
      health: 'unknown', behavior: reacting ? 'measure' : 'observe', stateSince: 0, isolated: false, hospitalized: false,
    };
    station.scientist.sync(state, timeSeconds, false);

    // Konsola: ostatni realny wynik tej stacji, tylko przemalowana gdy zmieni się (jak bloch HUD).
    const lastOutcome = flight?.revealed ? flight.outcome : null;
    const key = `${lastOutcome ?? '·'}`;
    if (key !== station.lastScreenKey) {
      station.lastScreenKey = key;
      const ctx = station.screenCtx;
      const { width, height } = station.screenCanvas;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 64px ui-monospace, monospace';
      ctx.fillStyle = lastOutcome === null ? 'rgba(141,151,180,0.6)' : lastOutcome > 0 ? '#6ee7a0' : '#f47c7c';
      ctx.fillText(lastOutcome === null ? '···' : lastOutcome > 0 ? '+1' : '−1', width / 2, height / 2);
      station.screenTexture.needsUpdate = true;
    }
  }

  private updateReadout(p: SimParams): void {
    const total = this.counts.reduce((x, y) => x + y, 0);
    const sEst = Math.abs(this.S());
    const key = `${p.mode}|${p.a}|${p.aP}|${p.b}|${p.bP}|${total}|${sEst.toFixed(3)}`;
    if (key === this.lastReadoutKey) return;
    this.lastReadoutKey = key;
    const ctx = this.readoutCtx;
    const { width, height } = this.readoutCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(230,234,245,0.95)';
    ctx.font = '600 26px ui-monospace, monospace';
    ctx.fillText(`Splątanie (CHSH) — ${p.mode === 'quantum' ? 'kwantowy' : 'ukryte zmienne'}`, 14, 30);
    ctx.font = '400 20px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.9)';
    ctx.fillText(`a=${p.a}°  a′=${p.aP}°   b=${p.b}°  b′=${p.bP}°`, 14, 66);
    ctx.fillStyle = '#8fe8f5';
    ctx.fillText(`E(a,b) teraz = ${this.eLive.toFixed(3)}`, 14, 98);
    ctx.fillStyle = 'rgba(230,234,245,0.95)';
    ctx.font = '600 24px ui-monospace, monospace';
    ctx.fillText(`|S| estymata = ${sEst.toFixed(3)}   |S| teoria = ${this.sTheoryAbs.toFixed(3)}`, 14, 134);
    ctx.font = '400 18px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.85)';
    ctx.fillText(`par: ${total.toLocaleString('pl-PL')}`, 14, 166);
    this.readoutTexture.needsUpdate = true;
  }

  syncScene(): void {
    const p = this.lastParams;
    const t = this.timeAccum;
    if (!p || Object.keys(p).length === 0) return; // pierwsza klatka, zanim update() coś zapamiętał

    for (const station of this.stations) this.syncStation(station, p, t);

    // Wiązka splątania: kolor/jasność KAŻDĄ klatkę z realnej singletCorrelation(a,b) bieżących
    // kątów — niebieski przy silnej antykorelacji (E→−1), bursztynowy przy E→+1.
    const eNorm = Math.max(-1, Math.min(1, this.eLive));
    const mixT = (eNorm + 1) / 2; // 0..1
    const beamColor = mixT < 0.5
      ? lerpColor(0x5cd6e8, 0xe6eaf5, mixT * 2)
      : lerpColor(0xe6eaf5, 0xf0b35c, (mixT - 0.5) * 2);
    this.entangleMaterial.emissive.setHex(beamColor);
    this.entangleMaterial.emissiveIntensity = 0.4 + Math.abs(eNorm) * 1.1;

    // Miernik |S|: wypełnienie z realnej estymaty (sums/counts), znacznik z DOKŁADNEJ teorii —
    // dwie osobne, nigdy zmieszane wielkości (patrz nagłówek pliku).
    const sEst = Math.abs(this.S());
    const fillFrac = Math.max(0.001, Math.min(1, sEst / 3));
    this.gaugeFill.scale.x = fillFrac;
    this.gaugeFill.position.x = -1.3 + (fillFrac * 2.6) / 2;
    this.gaugeFillMaterial.emissive.setHex(sEst > 2.02 ? 0xa78bfa : 0x5cd6e8);
    this.gaugeTheoryMark.position.x = -1.3 + (Math.min(1, this.sTheoryAbs / 3) * 2.6);

    // Puls źródła przy każdej emisji.
    this.sourceGlow.emissiveIntensity = 0.6 + this.sourceEmitPulse * 1.6;

    if (this.fadePass) {
      const f = this.introElapsed;
      this.fadePass.uniforms.uFade.value = f * f * (3 - 2 * f);
    }

    this.updateReadout(p);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    for (const station of this.stations ?? []) {
      station.scientist.dispose();
    }
  }

  getStats(): Record<string, number> {
    return {
      S: Math.round(Math.abs(this.S()) * 1000) / 1000,
      pairs: this.counts.reduce((x, y) => x + y, 0),
      sTheory: Math.round(this.sTheoryAbs * 1000) / 1000,
    };
  }

  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const three = this.three;
    applyStudioEnvironment(three, renderer, scene);
    const { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass, GTAOPass } = modules;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const tier = detectRenderTier();
    if (tierAllowsAO(tier)) {
      const gtao = new GTAOPass(scene, camera, w, h);
      composer.addPass(gtao);
    }
    if (tierAllowsBloom(tier)) {
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.5, 0.5, 0.68));
    }
    this.fadePass = createFadePass(ShaderPass, getSettings().reducedMotion ? 1 : 0);
    composer.addPass(this.fadePass);
    composer.addPass(new OutputPass());
    return {
      render: () => composer.render(),
      setSize: (nw, nh) => composer.setSize(nw, nh),
      dispose: () => {
        this.fadePass?.material.dispose();
        composer.dispose();
      },
    };
  }
}

export function runChshCorrelationScenario({ a = 0, aP = 90, b = 45, bP = 135 }: { a?: number; aP?: number; b?: number; bP?: number } = {}) {
  for (const [name, angle] of Object.entries({ a, aP, b, bP })) {
    if (!Number.isFinite(angle) || angle < 0 || angle > 180) throw new Error(`${name} musi mieścić się w zakresie 0–180°.`);
  }
  const ar = a * DEG;
  const aPr = aP * DEG;
  const br = b * DEG;
  const bPr = bP * DEG;
  const eAB = singletCorrelation(ar, br);
  const eABP = singletCorrelation(ar, bPr);
  const eAPB = singletCorrelation(aPr, br);
  const eAPBP = singletCorrelation(aPr, bPr);
  const s = chshS(singletCorrelation, ar, aPr, br, bPr);
  return { a, aP, b, bP, eAB, eABP, eAPB, eAPBP, s, absS: Math.abs(s), tsirelsonBound: 2 * Math.SQRT2 };
}

export const quantumChsh: ExperimentDef = {
  id: 'chsh',
  name: 'Splątanie (CHSH)',
  honesty: 'exact',
  honestyNote:
    'Korelacje singletu E(a,b) = −cos(a−b) i statystyka par są dokładną mechaniką kwantową; tryb „ukryte zmienne" to uczciwy model lokalnego realizmu (deterministyczny, ze wspólną zmienną λ) — i dlatego nigdy nie przekroczy |S| = 2. Kąt każdego analizatora w scenie 3D to dosłownie wartość suwaka (bez interpolacji); wiązka splątania i miernik |S| liczą się KAŻDĄ klatkę wprost z singletCorrelation/chshS, więc reagują na suwak natychmiast — estymata z realnych prób (belka) i dokładna teoria dla bieżących kątów (kreska) są pokazane osobno, nigdy zmieszane. Kolor fotonu ujawnia się dopiero przy dotarciu do jego własnego detektora, nie przy emisji — pokazanie wyniku wcześniej sugerowałoby ukrytą wartość z góry, czyli dokładnie to, co twierdzenie Bella wyklucza.',
  params: [
    {
      key: 'mode', label: 'Świat', type: 'select', default: 'quantum',
      options: [
        { value: 'quantum', label: 'Kwantowy (splątanie)' },
        { value: 'classical', label: 'Ukryte zmienne (lokalny realizm)' },
      ],
    },
    { key: 'a', label: 'Kąt Alicji a', type: 'slider', min: 0, max: 180, step: 1, default: 0, unit: '°' },
    { key: 'aP', label: 'Kąt Alicji a′', type: 'slider', min: 0, max: 180, step: 1, default: 90, unit: '°' },
    { key: 'b', label: 'Kąt Boba b', type: 'slider', min: 0, max: 180, step: 1, default: 45, unit: '°' },
    { key: 'bP', label: 'Kąt Boba b′', type: 'slider', min: 0, max: 180, step: 1, default: 135, unit: '°' },
  ],
  createSim3D: () => new ChshSim3D(),
  narrate(p, stats) {
    const S = Number(stats.S ?? 0);
    const n = Number(stats.pairs ?? 0);
    const quantum = String(p.mode) === 'quantum';
    const DEG2 = Math.PI / 180;
    const sTheory = Math.abs(
      chshS(singletCorrelation, Number(p.a) * DEG2, Number(p.aP) * DEG2, Number(p.b) * DEG2, Number(p.bP) * DEG2),
    );
    const blocks = [
      {
        title:
          n < 2000
            ? 'Zbieranie statystyki…'
            : S > 2.05
              ? `|S| = ${S.toFixed(2)} — lokalny realizm ZŁAMANY`
              : `|S| = ${S.toFixed(2)} — w granicach klasycznych`,
        body: quantum
          ? `Teoria przewiduje dla tych kątów |S| = ${sTheory.toFixed(2)} (maksimum 2√2 ≈ 2,83 przy 0°/90°/45°/135°). ${S > 2.05 ? 'Żadna teoria z lokalnymi ukrytymi zmiennymi nie potrafi tego wyniku wyprodukować — to twierdzenie Bella, nie opinia. Natura naprawdę nie ustala wyników przed pomiarem.' : 'Przesuń kąty ku 0°/90°/45°/135°, by zmaksymalizować łamanie.'}`
          : `Model ukrytych zmiennych: każda para niesie wspólny „plan" λ ustalony przy emisji, wyniki są z góry określone. Estymaty korelacji układają się w funkcję trójkątną zamiast kosinusa — i |S| nigdy nie przekroczy 2, niezależnie od kątów. Przełącz na świat kwantowy i porównaj.`,
      },
      {
        title: 'Nobel 2022 i żadnych furtek',
        body: 'Aspect (1982) zamknął lukę komunikacji zmieniając kąty w locie fotonów; testy z 2015 r. (Delft, Wiedeń, NIST) zamknęły jednocześnie luki detekcji i lokalności. Splątanie nie przesyła informacji (wyniki Alicji są lokalnie czystym szumem) — łamie tylko wyobrażenie, że własności istnieją przed pomiarem.',
        citation: {
          source: 'Hensen et al. 2015, Nature 526',
          confirmation: 'confirmed' as const,
          doi: '10.1038/nature15759',
          note: 'Pierwszy test Bella bez luk (detekcji i lokalności jednocześnie); Nobel z fizyki 2022 dla Aspecta, Clausera i Zeilingera',
        },
      },
    ];
    return blocks;
  },
};
