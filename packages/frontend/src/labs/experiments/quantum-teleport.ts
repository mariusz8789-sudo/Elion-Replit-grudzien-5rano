import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { teleport, type C, type Correction } from '../../core/quantumState';
import { TELEPORT_STATE_PRESETS } from '../../core/quantum/teleportationRunner';
import { blochVector } from './quantum-bloch';
import { detectRenderTier, tierAllowsAO, tierAllowsBloom, recommendedShadowMapSize } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';
import { createPBRMaterial, createEmissiveInstrumentMaterial, createScreenMaterial } from '../../core/three/graphics/materials';
import { createHeroLight, createBackgroundFill, applyStudioEnvironment } from '../../core/three/graphics/lighting';
import { makeSoftDotTexture } from '../../core/three/starfield';
import { HumanoidAgentVisual, type HumanoidAgentState } from '../../core/three/humanoidAgentVisual';

export { runQuantumTeleportScenario } from '../../core/quantum/teleportationRunner';

/**
 * Teleportacja kwantowa w prawdziwym 3D — ten sam game-grade standard co
 * CHSH (PBR, HERO+BACKGROUND lighting, IBL, bloom/GTAO), ta sama twarda
 * zasada: WARTOŚĆ WIZUALNA = WARTOŚĆ SOLVERA, zero równoległej animacji.
 * `teleport()` (core/quantumState.ts) jest wołane RAZ na próbę — dokładnie
 * ten sam wywóz co poprzednia wersja Canvas 2D i co `runQuantumTeleportScenario`
 * (który ten plik wciąż reeksportuje bez zmian — load-bearing dla backend
 * bundle i Experiment Fabric, patrz `quantumTeleportBridge`/`teleportFabricApi`).
 *
 * UCZCIWOŚĆ CZASU UJAWNIENIA (ten sam wzorzec co kolor fotonu w CHSH):
 *  - Kubit Alicji (ψ) to sfera Blocha zbudowana z DOKŁADNIE tego samego
 *    `blochVector(alpha,beta)` co Bloch Lab — Alicja ZNA swój stan (to ona
 *    go przygotowała), więc jego kierunek jest widoczny od razu.
 *  - Kubit Boba, ZANIM dotrą 2 bity klasyczne, ma `shrink=0` — czyli
 *    strzałka o długości zero, bez kierunku. To nie ozdoba: reduced density
 *    matrix Boba jest wtedy FIZYCZNIE maksymalnie zmieszana (dokładnie to
 *    stwierdzenie z honestyNote — "bez bitów jego kubit jest czystym
 *    szumem"), a `shrink` to ten sam parametr, który BlochSim3D już używa
 *    do dekoherencji — więc "zmieszany stan" ma tu jeden, spójny język
 *    wizualny w całym Genesis.
 *  - Wynik `teleport()` (outcome0/outcome1/correction/finalQubit/fidelity)
 *    jest liczony RAZ na początku próby (ten sam moment co próba w CHSH),
 *    ale strzałka Boba przeskakuje na `blochVector(finalQubit)` (shrink=1)
 *    DOPIERO gdy oba pakiety klasycznych bitów fizycznie dotrą do jego
 *    stacji — ujawnienie odroczone do właściwego momentu fizycznego, nie
 *    do momentu obliczenia.
 *  - Naukowcy (HumanoidAgentVisual, `showStatusOverlay=false`) reagują
 *    (poza 'gesture') dokładnie w oknie błysku WŁASNEGO wydarzenia: Alicja
 *    przy pomiarze, Bob przy odebraniu korekty — nigdy wcześniej.
 */

const STATION_X = 2.5;
const CENTER_Y = 1.3;
const SPHERE_R = 0.5;
const MEASURE_FLASH_DURATION = 0.35; // s — pomiar Alicji + błysk jej konsoli
const BIT_FLIGHT_DURATION = 0.6; // s — czytelne tempo lotu 2 bitów klasycznych (nie prędkość światła)
const HOLD_AFTER_ARRIVAL = 0.7; // s — Bob trzyma odczytany wynik, zanim zacznie się kolejna próba

type Phase = 'measuring' | 'transmitting' | 'holding';

interface Trial {
  outcome0: 0 | 1;
  outcome1: 0 | 1;
  correction: Correction;
  fidelity: number;
  finalQubit: [C, C];
}

interface Disposable { dispose(): void }

/** Kolor pakietu bitu klasycznego — 0/1, nigdy mylony z kolorem wyniku pomiaru CHSH (±1). */
export function bitColor(bit: 0 | 1): number {
  return bit === 1 ? 0xf0b35c : 0x5a6a8f;
}

/** Buduje mini-sferę Blocha (siatka + równik + strzałka) — ten sam język wizualny co quantum-bloch-3d.ts, w mniejszej skali dla stacji. */
function makeBlochSatellite(three: typeof THREE, scene: THREE.Scene, x: number, arrowColor: number, disposables: Disposable[]) {
  const group = new three.Group();
  group.position.set(x, CENTER_Y, 0);
  scene.add(group);

  const sphereGeo = new three.SphereGeometry(SPHERE_R, 24, 16);
  const sphereMat = new three.MeshBasicMaterial({ color: 0x5a6a8f, wireframe: true, transparent: true, opacity: 0.28 });
  const sphereMesh = new three.Mesh(sphereGeo, sphereMat);
  group.add(sphereMesh);
  disposables.push(sphereGeo, sphereMat);

  const equatorGeo = new three.TorusGeometry(SPHERE_R, 0.004, 8, 64);
  const equatorMat = new three.MeshBasicMaterial({ color: 0x8d97b4, transparent: true, opacity: 0.5 });
  const equatorMesh = new three.Mesh(equatorGeo, equatorMat);
  equatorMesh.rotation.x = Math.PI / 2;
  group.add(equatorMesh);
  disposables.push(equatorGeo, equatorMat);

  const arrow = new three.ArrowHelper(new three.Vector3(0, 0, 1), new three.Vector3(0, 0, 0), SPHERE_R, arrowColor, SPHERE_R * 0.32, SPHERE_R * 0.18);
  group.add(arrow);

  const dotTex = makeSoftDotTexture(three);
  const tipMat = new three.SpriteMaterial({ map: dotTex, color: arrowColor, transparent: true, depthWrite: false });
  const tip = new three.Sprite(tipMat);
  tip.scale.set(SPHERE_R * 0.34, SPHERE_R * 0.34, 1);
  group.add(tip);
  disposables.push(dotTex, tipMat);

  return { group, arrow, tip, tipMat };
}

type BlochSatellite = ReturnType<typeof makeBlochSatellite>;

class TeleportSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0.10;

  private three!: typeof THREE;
  private disposables: Disposable[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;

  private presetKey = 'plus';
  private trialCount = 0;
  private correctionCounts: Record<Correction, number> = { I: 0, X: 0, Z: 0, XZ: 0 };
  private fidelitySum = 0;

  private phase: Phase = 'measuring';
  private phaseElapsed = 0;
  private current: Trial | null = null;

  private aliceSat!: BlochSatellite;
  private bobSat!: BlochSatellite;
  private aliceScientist!: HumanoidAgentVisual;
  private bobScientist!: HumanoidAgentVisual;
  private sourceGlow!: THREE.MeshStandardMaterial;
  private sourcePulse = 0;
  private bitMeshes!: [THREE.Mesh, THREE.Mesh]; // [m0, m1]
  private bitMaterials!: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private aliceScreenCanvas!: HTMLCanvasElement;
  private aliceScreenCtx!: CanvasRenderingContext2D;
  private aliceScreenTexture!: THREE.Texture;
  private lastAliceScreenKey = '';
  private bobScreenCanvas!: HTMLCanvasElement;
  private bobScreenCtx!: CanvasRenderingContext2D;
  private bobScreenTexture!: THREE.Texture;
  private lastBobScreenKey = '';
  private readoutSprite!: THREE.Sprite;
  private readoutCanvas!: HTMLCanvasElement;
  private readoutCtx!: CanvasRenderingContext2D;
  private readoutTexture!: THREE.Texture;
  private lastReadoutKey = '';

  // Sim3D.syncScene() dostaje tylko (scene,camera) — patrz quantum-chsh.ts, ten sam wzorzec.
  private lastParams: SimParams = {};
  private timeAccum = 0;

  private buildConsole(three: typeof THREE, scene: THREE.Scene, x: number, side: -1 | 1): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: THREE.Texture } {
    const consoleGeo = new three.BoxGeometry(0.5, 0.55, 0.32);
    const consoleMat = createPBRMaterial(three, 'BRUSHED_METAL') as THREE.MeshStandardMaterial;
    const consoleMesh = new three.Mesh(consoleGeo, consoleMat);
    consoleMesh.position.set(x, 0.28, side * 0.8);
    consoleMesh.receiveShadow = true;
    scene.add(consoleMesh);
    this.disposables.push(consoleGeo, consoleMat);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const texture = new three.CanvasTexture(canvas);
    const screenMat = createScreenMaterial(three, texture, { tint: 0x5cd6e8, emissiveIntensity: 0.5 });
    const screenGeo = new three.PlaneGeometry(0.42, 0.21);
    const screenMesh = new three.Mesh(screenGeo, screenMat);
    screenMesh.position.set(x, 0.42, side * 0.8 + side * 0.17);
    screenMesh.rotation.y = side > 0 ? Math.PI : 0;
    scene.add(screenMesh);
    this.disposables.push(screenGeo, screenMat, texture);

    return { canvas, ctx, texture };
  }

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, _w: number, _h: number): void {
    void _w; void _h;
    this.three = three;
    this.introElapsed = getSettings().reducedMotion ? 1 : 0;

    scene.background = new three.Color(0x05070f);
    camera.position.set(0, 2.2, 6.2);
    camera.lookAt(0, CENTER_Y, 0);

    const floorGeo = new three.CircleGeometry(6, 48);
    const floorMat = new three.MeshStandardMaterial({ color: 0x1b2233, roughness: 0.7, metalness: 0.02 });
    const floor = new three.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.disposables.push(floorGeo, floorMat);

    const tier = detectRenderTier();
    const shadowMapSize = recommendedShadowMapSize(tier);
    createHeroLight(three, scene, {
      target: [0, CENTER_Y, 0],
      castShadow: shadowMapSize > 0,
      shadowMapSize: shadowMapSize || undefined,
      color: { key: 0xdcecff, rim: 0x8fe8f5 },
      intensity: { key: 26, rim: 5 },
    });
    createBackgroundFill(three, scene, { intensity: 0.65 });

    // Źródło pary Bell — kula emisyjna w środku, rozbłyskuje przy każdej nowej próbie
    // (ten sam sourcePulse-przy-zdarzeniu wzorzec co CHSH).
    const sourceGeo = new three.SphereGeometry(0.2, 24, 18);
    this.sourceGlow = createEmissiveInstrumentMaterial(three, { color: 0xa78bfa, intensity: 0.6 });
    const source = new three.Mesh(sourceGeo, this.sourceGlow);
    source.position.set(0, CENTER_Y, 0);
    scene.add(source);
    this.disposables.push(sourceGeo, this.sourceGlow);

    // Wiązki splątania: para Bell dzielona między obie stacje — stały zasób, nie lot.
    for (const side of [-1, 1] as const) {
      const path = new three.CatmullRomCurve3([new three.Vector3(0, CENTER_Y, 0), new three.Vector3(side * STATION_X, CENTER_Y, 0)]);
      const geo = new three.TubeGeometry(path, 24, 0.02, 8, false);
      const mat = createEmissiveInstrumentMaterial(three, { color: 0x8fe8f5, intensity: 0.35 });
      const tube = new three.Mesh(geo, mat);
      scene.add(tube);
      this.disposables.push(geo, mat);
    }

    // Kanał klasyczny: szyna Alicja→Bob, pod wiązką splątania, i 2 pakiety bitów podróżujące po niej.
    const railGeo = new three.BoxGeometry(STATION_X * 2, 0.02, 0.02);
    const railMat = createPBRMaterial(three, 'TECH_COMPOSITE') as THREE.MeshStandardMaterial;
    const rail = new three.Mesh(railGeo, railMat);
    rail.position.set(0, CENTER_Y - 0.55, 0);
    scene.add(rail);
    this.disposables.push(railGeo, railMat);

    const bitGeo = new three.BoxGeometry(0.09, 0.09, 0.09);
    const m0Mat = createEmissiveInstrumentMaterial(three, { color: 0x5a6a8f, intensity: 1 });
    const m1Mat = createEmissiveInstrumentMaterial(three, { color: 0x5a6a8f, intensity: 1 });
    const m0Mesh = new three.Mesh(bitGeo, m0Mat);
    const m1Mesh = new three.Mesh(bitGeo, m1Mat);
    m0Mesh.position.set(-STATION_X, CENTER_Y - 0.55, 0.08);
    m1Mesh.position.set(-STATION_X, CENTER_Y - 0.55, -0.08);
    m0Mesh.visible = false;
    m1Mesh.visible = false;
    scene.add(m0Mesh, m1Mesh);
    this.disposables.push(bitGeo, m0Mat, m1Mat);
    this.bitMeshes = [m0Mesh, m1Mesh];
    this.bitMaterials = [m0Mat, m1Mat];

    this.aliceSat = makeBlochSatellite(three, scene, -STATION_X, 0x5cd6e8, this.disposables);
    this.bobSat = makeBlochSatellite(three, scene, STATION_X, 0x6ee7a0, this.disposables);

    const aliceConsole = this.buildConsole(three, scene, -STATION_X, -1);
    this.aliceScreenCanvas = aliceConsole.canvas;
    this.aliceScreenCtx = aliceConsole.ctx;
    this.aliceScreenTexture = aliceConsole.texture;
    const bobConsole = this.buildConsole(three, scene, STATION_X, 1);
    this.bobScreenCanvas = bobConsole.canvas;
    this.bobScreenCtx = bobConsole.ctx;
    this.bobScreenTexture = bobConsole.texture;

    this.aliceScientist = new HumanoidAgentVisual(three, 2000);
    this.aliceScientist.root.position.set(-STATION_X - 0.55, 0, 1.3);
    scene.add(this.aliceScientist.root);
    this.bobScientist = new HumanoidAgentVisual(three, 2001);
    this.bobScientist.root.position.set(STATION_X + 0.55, 0, 1.3);
    scene.add(this.bobScientist.root);

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
    this.trialCount = 0;
    this.correctionCounts = { I: 0, X: 0, Z: 0, XZ: 0 };
    this.fidelitySum = 0;
    this.phase = 'measuring';
    this.phaseElapsed = 0;
    this.current = null;
  };

  private runTrial(presetKey: string): Trial {
    const preset = TELEPORT_STATE_PRESETS[presetKey] ?? TELEPORT_STATE_PRESETS.plus;
    const r = teleport(preset.alpha, preset.beta);
    return { outcome0: r.outcome0, outcome1: r.outcome1, correction: r.correction, fidelity: r.fidelity, finalQubit: r.finalQubit };
  }

  update(dt: number, p: SimParams): void {
    const presetKey = String(p.state ?? 'plus');
    if (presetKey !== this.presetKey) {
      this.presetKey = presetKey;
      this.reset();
    }

    this.phaseElapsed += dt;
    switch (this.phase) {
      case 'measuring':
        if (!this.current) {
          this.current = this.runTrial(this.presetKey);
          this.sourcePulse = 1;
        }
        if (this.phaseElapsed >= MEASURE_FLASH_DURATION) {
          this.phase = 'transmitting';
          this.phaseElapsed = 0;
        }
        break;
      case 'transmitting':
        if (this.phaseElapsed >= BIT_FLIGHT_DURATION) {
          this.phase = 'holding';
          this.phaseElapsed = 0;
          if (this.current) {
            this.trialCount++;
            this.correctionCounts[this.current.correction]++;
            this.fidelitySum += this.current.fidelity;
          }
        }
        break;
      case 'holding':
        if (this.phaseElapsed >= HOLD_AFTER_ARRIVAL) {
          this.phase = 'measuring';
          this.phaseElapsed = 0;
          this.current = null;
        }
        break;
    }

    this.sourcePulse = Math.max(0, this.sourcePulse - dt / 0.35);
    if (!getSettings().reducedMotion) this.introElapsed = Math.min(1, this.introElapsed + dt / 1.2);

    this.lastParams = p;
    this.timeAccum += dt;
  }

  private syncSatellite(sat: BlochSatellite, vec: [number, number, number] | null): void {
    const three = this.three;
    if (!vec) {
      sat.arrow.visible = false;
      sat.tip.visible = false;
      return;
    }
    // mapowanie fizyka(x,y,z) -> three.js(x,z,y): oś z (bieguny |0>/|1>) w górę — ten sam wzorzec co bloch-3d.ts.
    const dir = new three.Vector3(vec[0], vec[2], vec[1]);
    const len = dir.length();
    if (len < 1e-4) {
      sat.arrow.visible = false;
      sat.tip.visible = false;
      return;
    }
    sat.arrow.visible = true;
    sat.tip.visible = true;
    sat.arrow.setDirection(dir.clone().normalize());
    sat.arrow.setLength(Math.max(0.06, len * SPHERE_R), Math.min(0.16, len * SPHERE_R * 0.32 + 0.03), Math.min(0.09, len * SPHERE_R * 0.18 + 0.02));
    sat.tip.position.copy(dir.multiplyScalar(SPHERE_R));
  }

  private updateAliceScreen(preset: { label: string }): void {
    const m0 = this.current && this.phase !== 'measuring' ? this.current.outcome0 : null;
    const m1 = this.current && this.phase !== 'measuring' ? this.current.outcome1 : null;
    const key = `${preset.label}|${m0 ?? '·'}|${m1 ?? '·'}`;
    if (key === this.lastAliceScreenKey) return;
    this.lastAliceScreenKey = key;
    const ctx = this.aliceScreenCtx;
    const { width, height } = this.aliceScreenCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 20px ui-monospace, monospace';
    ctx.fillStyle = '#5cd6e8';
    ctx.fillText(preset.label, width / 2, height * 0.32);
    ctx.font = '700 34px ui-monospace, monospace';
    ctx.fillStyle = m0 === null ? 'rgba(141,151,180,0.6)' : '#f0b35c';
    ctx.fillText(`m₀=${m0 ?? '·'}  m₁=${m1 ?? '·'}`, width / 2, height * 0.68);
    this.aliceScreenTexture.needsUpdate = true;
  }

  private updateBobScreen(): void {
    const revealed = this.phase === 'holding' && this.current;
    const key = revealed ? `${this.current!.correction}|${this.current!.fidelity.toFixed(6)}` : '·';
    if (key === this.lastBobScreenKey) return;
    this.lastBobScreenKey = key;
    const ctx = this.bobScreenCtx;
    const { width, height } = this.bobScreenCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (revealed) {
      ctx.font = '700 30px ui-monospace, monospace';
      ctx.fillStyle = '#6ee7a0';
      ctx.fillText(`korekta: ${this.current!.correction}`, width / 2, height * 0.4);
      ctx.font = '600 20px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(230,234,245,0.9)';
      ctx.fillText(`F = ${(this.current!.fidelity * 100).toFixed(1)}%`, width / 2, height * 0.7);
    } else {
      ctx.font = '600 24px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(141,151,180,0.6)';
      ctx.fillText('oczekiwanie na bity…', width / 2, height / 2);
    }
    this.bobScreenTexture.needsUpdate = true;
  }

  private updateReadout(preset: { label: string }): void {
    const avgFidelity = this.trialCount > 0 ? this.fidelitySum / this.trialCount : 0;
    const key = `${preset.label}|${this.trialCount}|${avgFidelity.toFixed(5)}|${this.phase}`;
    if (key === this.lastReadoutKey) return;
    this.lastReadoutKey = key;
    const ctx = this.readoutCtx;
    const { width, height } = this.readoutCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(230,234,245,0.95)';
    ctx.font = '600 26px ui-monospace, monospace';
    ctx.fillText(`Teleportacja — ${preset.label}`, 14, 30);
    ctx.font = '400 20px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.9)';
    ctx.fillText(`próby: ${this.trialCount}`, 14, 66);
    ctx.fillStyle = '#6ee7a0';
    ctx.font = '600 24px ui-monospace, monospace';
    ctx.fillText(`średnia wierność: ${(avgFidelity * 100).toFixed(3)}%`, 14, 100);
    ctx.font = '400 18px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.85)';
    const corrections: Correction[] = ['I', 'X', 'Z', 'XZ'];
    const dist = corrections.map((c) => `${c}:${this.correctionCounts[c]}`).join('  ');
    ctx.fillText(dist, 14, 134);
    ctx.fillStyle = 'rgba(141,151,180,0.7)';
    ctx.font = '400 16px ui-monospace, monospace';
    ctx.fillText(this.phase === 'transmitting' ? '2 bity klasyczne w locie…' : this.phase === 'measuring' ? 'Alicja mierzy…' : 'Bob zastosował korektę', 14, 164);
    this.readoutTexture.needsUpdate = true;
  }

  syncScene(): void {
    const p = this.lastParams;
    const t = this.timeAccum;
    if (!p || Object.keys(p).length === 0) return;

    const preset = TELEPORT_STATE_PRESETS[this.presetKey] ?? TELEPORT_STATE_PRESETS.plus;

    // Alicja: zawsze pokazuje realny blochVector jej znanego, przygotowanego stanu ψ.
    this.syncSatellite(this.aliceSat, blochVector(preset.alpha, preset.beta));

    // Bob: shrink=0 (brak kierunku — zmieszany stan) dopóki bity nie dotrą; snap na
    // blochVector(finalQubit) DOKŁADNIE w momencie wejścia w fazę 'holding'.
    if (this.phase === 'holding' && this.current) {
      this.syncSatellite(this.bobSat, blochVector(this.current.finalQubit[0], this.current.finalQubit[1]));
    } else {
      this.syncSatellite(this.bobSat, null);
    }

    // Pakiety bitów: widoczne tylko w fazie transmitting, pozycja = postęp lotu, kolor = realna wartość bitu.
    const flying = this.phase === 'transmitting' && this.current;
    for (const mesh of this.bitMeshes) mesh.visible = !!flying;
    if (flying && this.current) {
      const frac = Math.min(1, this.phaseElapsed / BIT_FLIGHT_DURATION);
      const x = -STATION_X + frac * STATION_X * 2;
      this.bitMeshes[0].position.x = x;
      this.bitMeshes[1].position.x = x;
      this.bitMaterials[0].emissive.setHex(bitColor(this.current.outcome0));
      this.bitMaterials[1].emissive.setHex(bitColor(this.current.outcome1));
    }

    // Naukowcy: Alicja reaguje przy pomiarze (measuring), Bob przy odebraniu korekty (holding) —
    // dokładnie ten sam "reaguj tylko w oknie własnego zdarzenia" wzorzec co CHSH.
    const aliceReacting = this.phase === 'measuring';
    const aliceState: HumanoidAgentState = {
      id: 2000, worldX: this.aliceScientist.root.position.x, worldZ: this.aliceScientist.root.position.z,
      facing: Math.atan2(-STATION_X - this.aliceScientist.root.position.x, 0 - this.aliceScientist.root.position.z),
      speed: 0, gait: 0, pose: aliceReacting ? 'gesture' : 'idle',
      health: 'unknown', behavior: aliceReacting ? 'measure' : 'observe', stateSince: 0, isolated: false, hospitalized: false,
    };
    this.aliceScientist.sync(aliceState, t, false);

    const bobReacting = this.phase === 'holding';
    const bobState: HumanoidAgentState = {
      id: 2001, worldX: this.bobScientist.root.position.x, worldZ: this.bobScientist.root.position.z,
      facing: Math.atan2(STATION_X - this.bobScientist.root.position.x, 0 - this.bobScientist.root.position.z),
      speed: 0, gait: 0, pose: bobReacting ? 'gesture' : 'idle',
      health: 'unknown', behavior: bobReacting ? 'measure' : 'observe', stateSince: 0, isolated: false, hospitalized: false,
    };
    this.bobScientist.sync(bobState, t, false);

    this.sourceGlow.emissiveIntensity = 0.6 + this.sourcePulse * 1.6;

    if (this.fadePass) {
      const f = this.introElapsed;
      this.fadePass.uniforms.uFade.value = f * f * (3 - 2 * f);
    }

    this.updateAliceScreen(preset);
    this.updateBobScreen();
    this.updateReadout(preset);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.aliceScientist?.dispose();
    this.bobScientist?.dispose();
  }

  getStats(): Record<string, number> {
    const avgFidelity = this.trialCount > 0 ? this.fidelitySum / this.trialCount : 0;
    return {
      trials: this.trialCount,
      avgFidelity: Math.round(avgFidelity * 100000) / 100000,
      lastFidelity: this.current ? Math.round(this.current.fidelity * 100000) / 100000 : 0,
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
      composer.addPass(new GTAOPass(scene, camera, w, h));
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

export const quantumTeleport: ExperimentDef = {
  id: 'teleport',
  name: 'Teleportacja kwantowa',
  honesty: 'exact',
  honestyNote:
    'Pełny wektor stanu 3 kubitów, dokładna mechanika kwantowa (nie przybliżenie) — protokół Bennetta i in. (1993). Fidelity=1 w każdej próbie to twierdzenie matematyczne, zweryfikowane dla wszystkich 4 gałęzi pomiaru i dowolnego stanu wejściowego przed napisaniem testów. Scena 3D: sfera Blocha Alicji pokazuje jej realny, przygotowany stan od razu (ona go zna); sfera Boba ma DŁUGOŚĆ ZERO (fizycznie zmieszany stan, brak kierunku) dopóki 2 bity klasyczne nie dotrą do jego stacji, i przeskakuje na dokładny wynik solvera dopiero w tym momencie — nigdy wcześniej. To NIE teleportacja materii/informacji szybszej niż światło: oryginalny stan jest zniszczony na kubicie Alicji (pomiar, nie kopiowanie — zakaz klonowania), a Bob potrzebuje 2 bitów KLASYCZNYCH (ograniczonych prędkością światła) do wykonania właściwej korekty; bez nich jego kubit jest czystym szumem.',
  params: [
    {
      key: 'state', label: 'Stan do teleportacji', type: 'select', default: 'plus',
      options: Object.entries(TELEPORT_STATE_PRESETS).map(([value, { label }]) => ({ value, label })),
    },
  ],
  createSim3D: () => new TeleportSim3D(),
  narrate(p, stats) {
    const presetKey = String(p.state ?? 'plus');
    const preset = TELEPORT_STATE_PRESETS[presetKey] ?? TELEPORT_STATE_PRESETS.plus;
    const trials = Number(stats.trials ?? 0);
    const avgFidelity = Number(stats.avgFidelity ?? 0);
    return [
      {
        title: trials < 2 ? 'Pierwsza teleportacja…' : `${trials} prób, średnia wierność: ${(avgFidelity * 100).toFixed(2)}%`,
        body: `Stan ${preset.label} jest kodowany na kubicie Alicji. Ona i Bob dzielą splątaną parę Bell (H+CNOT). Alicja splata swój nieznany kubit z połową pary (CNOT+H), mierzy OBA swoje kubity (wynik losowy, reguła Borna) i wysyła 2 bity klasyczne do Boba. Zanim te bity dotrą — patrz jego sfera Blocha: strzałka ma długość zero, bo jego reduced density matrix jest naprawdę maksymalnie zmieszana. Bob stosuje jedną z czterech korekt (I/X/Z/XZ) zależnie od tych bitów — i za KAŻDYM razem odzyskuje dokładnie oryginalny stan. To NIE przypadek ani statystyczne przybliżenie: to wynika wprost z algebry liniowej protokołu.`,
        citation: {
          source: 'Bennett, Brassard, Crépeau, Jozsa, Peres, Wootters 1993, PRL 70, 1895; pierwsza realizacja: Bouwmeester i in. 1997, Nature 390, 575',
          confirmation: 'confirmed',
          note: 'Protokół matematycznie dokładny; eksperymentalnie potwierdzony wielokrotnie, także na dystansach satelitarnych (Ren i in. 2017, Nature 549, 70)',
        },
      },
      {
        title: 'Dlaczego to NIE łamie szczególnej teorii względności',
        body: 'Bob nie może odczytać teleportowanego stanu, dopóki nie dostanie 2 bitów klasycznych od Alicji — a te podróżują co najwyżej z prędkością światła (kablem, światłowodem, radiem). Bez tych bitów jego kubit jest, statystycznie, czystym szumem — nie da się z niego wyciągnąć ŻADNEJ informacji o oryginalnym stanie. Splątanie samo w sobie nie przesyła informacji; dopiero splątanie + kanał klasyczny razem przenoszą stan kwantowy, i to nigdy szybciej niż światło.',
      },
    ];
  },
};
