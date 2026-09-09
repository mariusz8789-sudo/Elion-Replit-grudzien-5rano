import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import {
  TUNNELING_DOMAIN_LENGTH,
  TUNNELING_DX,
  TUNNELING_GRID_SIZE,
  TunnelingSolver,
} from '../../core/quantum/tunnelingRunner';
import { detectRenderTier, tierAllowsAO, tierAllowsBloom, recommendedShadowMapSize } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';
import { createPBRMaterial, createEmissiveInstrumentMaterial } from '../../core/three/graphics/materials';
import { createHeroLight, createBackgroundFill, applyStudioEnvironment } from '../../core/three/graphics/lighting';
import { HumanoidAgentVisual, type HumanoidAgentState } from '../../core/three/humanoidAgentVisual';

export { fft, runTunnelingScenario } from '../../core/quantum/tunnelingRunner';

/**
 * Tunelowanie kwantowe w prawdziwym 3D — ten sam game-grade standard i ta
 * sama twarda zasada co CHSH/teleportacja: WARTOŚĆ WIZUALNA = WARTOŚĆ
 * SOLVERA. `TunnelingSim3D extends TunnelingSolver` — DOKŁADNIE ten sam
 * wzorzec dziedziczenia co istniejący Canvas 2D (`TunnelingSim` powyżej w
 * historii tego pliku): jeden solver (split-step Fourier, ħ=m=1,
 * `core/quantum/tunnelingRunner.ts`), zero drugiej implementacji fizyki.
 * `fft`/`runTunnelingScenario` reeksportowane bez zmian — `runTunnelingScenario`
 * jest już importowany bezpośrednio z `tunnelingRunner.ts` przez
 * `serverEntry.ts`/`experimentFabric/executor.ts`, więc ten plik (i jego nowe
 * zależności Three.js) nigdy nie trafia do backendowego bundle'a — ten sam
 * bezpieczny wzorzec importu co teleportacja.
 *
 * CO SOLVER NAPRAWDĘ ZWRACA (przeczytane z `tunnelingRunner.ts` PRZED
 * napisaniem tej sceny, nie zgadywane):
 *  - `re[i]`/`im[i]` (pola `protected`, ten sam dostęp co Canvas) — część
 *    rzeczywista/urojona ψ(x) na siatce 512 punktów, domena 0–100 j.n.
 *    (`TUNNELING_DX` ≈ 0,195 j.n./punkt). `re[i]²+im[i]²` to gęstość
 *    prawdopodobieństwa |ψ(x)|² (bez wagi dx — Canvas skaluje ją tak samo).
 *  - `potential[i]` — prostokątna bariera V(x): wysokość `barrier`,
 *    środek domeny, szerokość `width`.
 *  - `lastEnergy`/`lastBarrier`/`lastWidth` — ostatnie uruchomione
 *    parametry. UWAGA: `energy` to UŁAMEK E/V₀, NIE energia bezwzględna —
 *    `launch()` liczy `k0 = sqrt(2·barrier·energy)`, czyli energia
 *    bezwzględna pakietu to `barrier·energy`. Ten fakt jest pokazany
 *    wprost na HUD (patrz `updateReadout()`), inaczej suwak "Energia"
 *    sugerowałby błędnie wartość absolutną.
 *  - `transmission`/`reflection` — całki gęstości (z wagą dx) odpowiednio
 *    za barierą (i > barrierEnd) i przed nią (i < barrierStart), odświeżane
 *    KAŻDE wywołanie `advance()` (czyli co klatkę animacji) — dokładnie ten
 *    sam odczyt co istniejący Canvas.
 *  - `runScenario()` zwraca też `remainingProbability = 1 - transmission -
 *    reflection` — ale to NIE jest samo "w barierze": może zawierać też
 *    prawdopodobieństwo utracone na tłumieniu brzegowym (patrz niżej). Ta
 *    scena rozdziela te dwie rzeczy uczciwie zamiast je mieszać — patrz
 *    `absorbedCumulative` poniżej.
 *
 * NOWA, UCZCIWA WIELKOŚĆ TEJ SCENY — "pochłonięte na granicy": solver ma
 * pochłaniającą maskę brzegową (`edgeMask`) tłumiącą ψ blisko krawędzi
 * skończonej domeny (efekt numeryczny zapobiegający zawijaniu FFT, NIE
 * fizyczna absorpcja). To JEDYNA nieunitarna operacja w `step()` — ewolucja
 * kinetyczna i potencjałowa zachowują normę dokładnie. Dlatego różnica
 * `totalProbability()` PRZED i PO każdym wywołaniu `advance()` jest
 * dokładnie tym, co maska brzegowa pochłonęła w tej klatce — liczone z
 * tych samych, realnych tablic `re`/`im`, zerowy nowy wzór fizyczny, tylko
 * odczyt tego, co solver już zrobił. Zerowana przy każdym relaunchu (nowy
 * pakiet = 100% z powrotem).
 *
 * ZMIERZONE, NIE ZAŁOŻONE: w pierwszych kilku sekundach realnego czasu
 * pozostaje bliska zeru (pakiet startuje 22 j.n. od krawędzi maski), ale
 * PO DŁUŻSZYM DZIAŁANIU (dziesiątki jednostek czasu symulacji) rośnie
 * istotnie — zmierzone bezpośrednio w tej sesji: ~13% po ok. 22 j.n. czasu
 * symulacji przy domyślnych parametrach. To NIE błąd pomiaru ani tej sceny:
 * odbita część pakietu realnie wędruje z powrotem w lewo i, mając dość
 * czasu, sama dociera do pochłaniającej krawędzi domeny po przeciwnej
 * stronie od bariery. Innymi słowy: ta symulacja NIE MA stabilnego stanu
 * końcowego, do którego można bezpiecznie "zostawić działać" — z czasem
 * całe prawdopodobieństwo ostatecznie odpływa (albo tranzytem w prawo poza
 * domenę, albo z powrotem w lewo w maskę). To realne ograniczenie
 * skończonej siatki tego solvera (nie tej sceny), i HUD pokazuje je na
 * żywo zamiast je ukrywać.
 *
 * OGRANICZENIA MODELU (sprawdzone przed projektowaniem sceny, UI ich nie
 * ukrywa — patrz honestyNote):
 *  - 1D: to wykres funkcji jednej zmiennej x, nie fala 2D/3D. Wstążka w tej
 *    scenie jest CELOWO płaska (bez grubości Z, `side: DoubleSide`) —
 *    żywa w 3D tylko dla czytelnej perspektywy kamery, nigdy nie sugeruje
 *    dodatkowego wymiaru fizycznego.
 *  - Stała siatka 512 punktów / dx≈0,195 j.n. — skończona rozdzielczość
 *    przestrzenna.
 *  - Pochłaniająca granica domeny (opisana wyżej).
 *  - ħ=m=1 (jednostki naturalne, nie SI) — każda wartość energii/pędu na
 *    HUD podpisana "j.n.", nigdy bez jednostki.
 *  - Bariera jest idealnym prostokątem (skok potencjału), nie realistycznym
 *    profilem.
 *
 * NIE POKAZUJE POJEDYNCZEJ CZĄSTKI: solver liczy falę, nie tor cząstki —
 * ta scena renderuje WYŁĄCZNIE |ψ(x)|² i fazę jako ciągłą wstążkę, zero
 * osobnego "kulki przelatującej przez ścianę".
 */

const WORLD_HALF_WIDTH = 4; // j.n. domeny (0..100) mapowane na -4..+4 jednostek świata
const RIBBON_BASE_Y = 1.05;
const DENSITY_VISUAL_SCALE = 5.5; // tylko skala wizualna wysokości — sama gęstość jest realna
const BARRIER_HEIGHT_SCALE = 1.05;
const TRANSMISSION_EVENT_THRESHOLD = 0.005; // 0.5% — pierwszy realnie wykrywalny sygnał za barierą
const REACTION_FLASH_DURATION = 0.6; // s

/** Mapuje pozycję fizyczną x∈[0,100] j.n. na współrzędną świata X — czysta geometria, nie fizyka. */
function worldXFromPhysical(xPhysical: number): number {
  return -WORLD_HALF_WIDTH + (xPhysical / TUNNELING_DOMAIN_LENGTH) * (2 * WORLD_HALF_WIDTH);
}

function worldXFromIndex(i: number): number {
  return worldXFromPhysical(i * TUNNELING_DX);
}

/** HSL→RGB, czysta matematyka (bez zależności od THREE.Color, testowalna w izolacji). h∈[0,360), s,l∈[0,1]. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1: number, g1: number, b1: number;
  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

/**
 * Kolor lokalnej fazy ψ=|ψ|e^{iθ} — DOKŁADNIE ta sama konwencja co istniejący
 * Canvas 2D (`hue = atan2(im,re)` przeskalowane na 0..360°), tylko zwrócona
 * jako RGB 0..1 do atrybutu koloru wierzchołka zamiast stringa CSS `hsla()`.
 */
export function phaseColor(re: number, im: number): [number, number, number] {
  const phase = Math.atan2(im, re);
  const hue = (((phase / (2 * Math.PI)) * 360) + 360) % 360;
  return hslToRgb(hue, 0.85, 0.62);
}

/** Całka gęstości prawdopodobieństwa po całej domenie — ta sama waga dx co solver's own measure(). */
export function totalProbability(re: Float64Array, im: Float64Array, dx: number): number {
  let sum = 0;
  for (let i = 0; i < re.length; i++) sum += (re[i] * re[i] + im[i] * im[i]) * dx;
  return sum;
}

interface Disposable { dispose(): void }

class TunnelingSim3D extends TunnelingSolver implements Sim3D {
  cameraAutoRotateSpeed = 0.08;

  private three!: typeof THREE;
  private disposables: Disposable[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;

  private ribbonGeometry!: THREE.BufferGeometry;
  private ribbonMaterial!: THREE.MeshBasicMaterial;
  private barrierMesh!: THREE.Mesh;
  private barrierMaterial!: THREE.MeshStandardMaterial;
  private energyLine!: THREE.Mesh;
  private scientist!: HumanoidAgentVisual;

  private readoutSprite!: THREE.Sprite;
  private readoutCanvas!: HTMLCanvasElement;
  private readoutCtx!: CanvasRenderingContext2D;
  private readoutTexture!: THREE.Texture;
  private lastReadoutKey = '';

  // Uczciwe śledzenie prawdopodobieństwa pochłoniętego przez maskę brzegową — patrz nagłówek pliku.
  private absorbedCumulative = 0;
  private transmissionEventFired = false;
  private reactionFlash = 0;

  private lastParams: SimParams = {};
  private timeAccum = 0;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, _w: number, _h: number): void {
    void _w; void _h;
    this.three = three;
    this.initialize();
    this.introElapsed = getSettings().reducedMotion ? 1 : 0;

    scene.background = new three.Color(0x05070f);
    camera.position.set(0, 2.5, 6.2);
    camera.lookAt(0, RIBBON_BASE_Y + 0.6, 0);

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
      target: [0, RIBBON_BASE_Y, 0],
      castShadow: shadowMapSize > 0,
      shadowMapSize: shadowMapSize || undefined,
      color: { key: 0xdcecff, rim: 0x8fe8f5 },
      intensity: { key: 24, rim: 5 },
    });
    createBackgroundFill(three, scene, { intensity: 0.65 });

    // Tor/konsola pod wstążką — kontekst wizualny (nie dane), ten sam wzorzec co szyna
    // kanału klasycznego w teleportacji.
    const railGeo = new three.BoxGeometry(WORLD_HALF_WIDTH * 2, 0.03, 0.5);
    const railMat = createPBRMaterial(three, 'TECH_COMPOSITE') as THREE.MeshStandardMaterial;
    const rail = new three.Mesh(railGeo, railMat);
    rail.position.set(0, RIBBON_BASE_Y - 0.03, 0);
    scene.add(rail);
    this.disposables.push(railGeo, railMat);

    // Wstążka |ψ(x)|² — CELOWO płaska (bez grubości Z), widoczna z obu stron. Geometria
    // budowana raz; position/color aktualizowane co klatkę wprost z re/im — patrz syncScene().
    this.ribbonGeometry = new three.BufferGeometry();
    const positions = new Float32Array(TUNNELING_GRID_SIZE * 2 * 3);
    const colors = new Float32Array(TUNNELING_GRID_SIZE * 2 * 3);
    this.ribbonGeometry.setAttribute('position', new three.BufferAttribute(positions, 3));
    this.ribbonGeometry.setAttribute('color', new three.BufferAttribute(colors, 3));
    const indices: number[] = [];
    for (let i = 0; i < TUNNELING_GRID_SIZE - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }
    this.ribbonGeometry.setIndex(indices);
    this.ribbonMaterial = new three.MeshBasicMaterial({ vertexColors: true, side: three.DoubleSide, transparent: true, opacity: 0.92 });
    const ribbonMesh = new three.Mesh(this.ribbonGeometry, this.ribbonMaterial);
    scene.add(ribbonMesh);
    this.disposables.push(this.ribbonGeometry, this.ribbonMaterial);

    // Bariera — blok, rozmiar/pozycja z realnych parametrów (width/barrier), aktualizowany co klatkę.
    const barrierGeo = new three.BoxGeometry(1, 1, 0.7);
    this.barrierMaterial = createPBRMaterial(three, 'CERAMIC', { color: 0xf0b35c }) as THREE.MeshStandardMaterial;
    this.barrierMaterial.transparent = true;
    this.barrierMaterial.opacity = 0.35;
    this.barrierMesh = new three.Mesh(barrierGeo, this.barrierMaterial);
    scene.add(this.barrierMesh);
    this.disposables.push(barrierGeo, this.barrierMaterial);

    // Linia energii pakietu (E = barrier·energy, patrz nagłówek pliku) — kreska nad domeną.
    const energyGeo = new three.BoxGeometry(WORLD_HALF_WIDTH * 2, 0.015, 0.015);
    const energyMat = createEmissiveInstrumentMaterial(three, { color: 0x5cd6e8, intensity: 0.9 });
    this.energyLine = new three.Mesh(energyGeo, energyMat);
    scene.add(this.energyLine);
    this.disposables.push(energyGeo, energyMat);

    this.scientist = new HumanoidAgentVisual(three, 3000);
    this.scientist.root.position.set(WORLD_HALF_WIDTH + 0.7, 0, 1.1);
    scene.add(this.scientist.root);

    scene.add(camera);
    this.readoutCanvas = document.createElement('canvas');
    this.readoutCanvas.width = 600;
    this.readoutCanvas.height = 220;
    this.readoutCtx = this.readoutCanvas.getContext('2d')!;
    this.readoutTexture = new three.CanvasTexture(this.readoutCanvas);
    const readoutMat = new three.SpriteMaterial({ map: this.readoutTexture, transparent: true, depthTest: false, depthWrite: false });
    this.readoutSprite = new three.Sprite(readoutMat);
    this.readoutSprite.renderOrder = 999;
    this.readoutSprite.position.set(0, 0.66, -1.3);
    this.readoutSprite.scale.set(1.6, 0.59, 1);
    camera.add(this.readoutSprite);
    this.disposables.push(this.readoutTexture, readoutMat);
  }

  reset = (): void => {
    super.reset();
    this.absorbedCumulative = 0;
    this.transmissionEventFired = false;
    this.reactionFlash = 0;
  };

  update(dt: number, p: SimParams): void {
    const energy = Number(p.energy);
    const barrier = Number(p.barrier);
    const width = Number(p.width);
    // Ten sam warunek relaunchu co advance() sam sprawdza wewnętrznie — sprawdzony TU, PRZED
    // wywołaniem advance(), żeby wiedzieć, czy zerować śledzenie pochłaniania dla nowego pakietu.
    const relaunching = energy !== this.lastEnergy || barrier !== this.lastBarrier || width !== this.lastWidth;
    if (relaunching) {
      this.absorbedCumulative = 0;
      this.transmissionEventFired = false;
    }
    const probBefore = relaunching ? 1 : totalProbability(this.re, this.im, TUNNELING_DX);

    const steps = Math.min(6, Math.max(1, Math.round(dt * 240)));
    this.advance({ energy, barrier, width, steps });

    if (!relaunching) {
      const probAfter = totalProbability(this.re, this.im, TUNNELING_DX);
      this.absorbedCumulative += Math.max(0, probBefore - probAfter);
    }

    if (!this.transmissionEventFired && this.transmission > TRANSMISSION_EVENT_THRESHOLD) {
      this.transmissionEventFired = true;
      this.reactionFlash = 1;
    }
    this.reactionFlash = Math.max(0, this.reactionFlash - dt / REACTION_FLASH_DURATION);

    if (!getSettings().reducedMotion) this.introElapsed = Math.min(1, this.introElapsed + dt / 1.2);

    this.lastParams = p;
    this.timeAccum += dt;
  }

  private updateRibbon(): void {
    const posAttr = this.ribbonGeometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.ribbonGeometry.attributes.color as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) {
      const re = this.re[i];
      const im = this.im[i];
      const density = re * re + im * im;
      const x = worldXFromIndex(i);
      const topIdx = i * 2 * 3;
      const botIdx = (i * 2 + 1) * 3;
      positions[topIdx] = x;
      positions[topIdx + 1] = RIBBON_BASE_Y + density * DENSITY_VISUAL_SCALE;
      positions[topIdx + 2] = 0;
      positions[botIdx] = x;
      positions[botIdx + 1] = RIBBON_BASE_Y;
      positions[botIdx + 2] = 0;
      const [r, g, b] = phaseColor(re, im);
      colors[topIdx] = r;
      colors[topIdx + 1] = g;
      colors[topIdx + 2] = b;
      // Dolna krawędź przyciemniona — czysto dekoracyjny gradient ku podstawie (ten sam
      // realny odcień fazy co góra), nie osobna dana.
      colors[botIdx] = r * 0.32;
      colors[botIdx + 1] = g * 0.32;
      colors[botIdx + 2] = b * 0.32;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  private updateReadout(p: SimParams): void {
    const energyRatio = Number(p.energy);
    const barrier = this.lastBarrier;
    const width = this.lastWidth;
    const absoluteEnergy = barrier * energyRatio;
    const transPct = this.transmission * 100;
    const reflPct = this.reflection * 100;
    const absorbedPct = this.absorbedCumulative * 100;
    const barrierZonePct = Math.max(0, 100 - transPct - reflPct - absorbedPct);
    const key = `${energyRatio}|${barrier}|${width}|${transPct.toFixed(2)}|${reflPct.toFixed(2)}|${absorbedPct.toFixed(3)}`;
    if (key === this.lastReadoutKey) return;
    this.lastReadoutKey = key;
    const ctx = this.readoutCtx;
    const { width: cw, height: ch } = this.readoutCanvas;
    ctx.clearRect(0, 0, cw, ch);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(230,234,245,0.95)';
    ctx.font = '600 26px ui-monospace, monospace';
    ctx.fillText('Tunelowanie 1D (split-step Fourier)', 14, 30);
    ctx.font = '400 19px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.9)';
    ctx.fillText(`E/V₀=${energyRatio.toFixed(2)}  ⇒ E=${absoluteEnergy.toFixed(2)} j.n.   V₀=${barrier.toFixed(2)} j.n.   szer.=${width.toFixed(1)} j.n.`, 14, 64);
    ctx.font = '600 22px ui-monospace, monospace';
    ctx.fillStyle = '#6ee7a0';
    ctx.fillText(`przeszło: ${transPct.toFixed(1)}%`, 14, 98);
    ctx.fillStyle = '#f47c7c';
    ctx.fillText(`przed barierą: ${reflPct.toFixed(1)}%`, 220, 98);
    ctx.font = '400 17px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(230,234,245,0.85)';
    ctx.fillText(`w barierze / nierozstrzygnięte: ${barrierZonePct.toFixed(1)}%`, 14, 130);
    ctx.fillStyle = absorbedPct > 0.05 ? '#ffcf7a' : 'rgba(141,151,180,0.6)';
    ctx.fillText(`pochłonięte na granicy domeny: ${absorbedPct.toFixed(3)}% (efekt siatki, nie fizyka)`, 14, 158);
    ctx.font = '400 15px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.7)';
    ctx.fillText('kolor wstążki = faza ψ (realna dana), wysokość = |ψ(x)|²', 14, 190);
    this.readoutTexture.needsUpdate = true;
  }

  syncScene(): void {
    const p = this.lastParams;
    const t = this.timeAccum;
    if (!p || Object.keys(p).length === 0) return;

    this.updateRibbon();

    const barrierWorldStart = worldXFromPhysical(TUNNELING_DOMAIN_LENGTH / 2 - this.lastWidth / 2);
    const barrierWorldEnd = worldXFromPhysical(TUNNELING_DOMAIN_LENGTH / 2 + this.lastWidth / 2);
    const barrierWorldWidth = Math.max(0.02, barrierWorldEnd - barrierWorldStart);
    const barrierVisualHeight = BARRIER_HEIGHT_SCALE * Math.min(this.lastBarrier / 2, 1.2);
    this.barrierMesh.scale.set(barrierWorldWidth, Math.max(0.02, barrierVisualHeight), 1);
    this.barrierMesh.position.set((barrierWorldStart + barrierWorldEnd) / 2, RIBBON_BASE_Y + barrierVisualHeight / 2, 0);

    const energyRatio = Number(p.energy);
    const energyVisualHeight = BARRIER_HEIGHT_SCALE * Math.min((this.lastBarrier * energyRatio) / 2, 1.2);
    this.energyLine.position.set(0, RIBBON_BASE_Y + energyVisualHeight, 0);

    const reacting = this.reactionFlash > 0;
    const state: HumanoidAgentState = {
      id: 3000, worldX: this.scientist.root.position.x, worldZ: this.scientist.root.position.z,
      facing: Math.atan2(0 - this.scientist.root.position.x, 0 - this.scientist.root.position.z),
      speed: 0, gait: 0, pose: reacting ? 'gesture' : 'idle',
      health: 'unknown', behavior: reacting ? 'measure' : 'observe', stateSince: 0, isolated: false, hospitalized: false,
    };
    this.scientist.sync(state, t, false);

    if (this.fadePass) {
      const f = this.introElapsed;
      this.fadePass.uniforms.uFade.value = f * f * (3 - 2 * f);
    }

    this.updateReadout(p);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.scientist?.dispose();
  }

  getStats() {
    return {
      trans: Math.round(this.transmission * 1000) / 10,
      refl: Math.round(this.reflection * 1000) / 10,
      absorbedPct: Math.round(this.absorbedCumulative * 100000) / 1000,
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

export const quantumTunneling: ExperimentDef = {
  id: 'tunneling',
  name: 'Tunelowanie',
  honesty: 'exact',
  honestyNote:
    'Pakiet falowy jest liczony na żywo z równania Schrödingera (metoda split-step Fourier, ħ=m=1, jednostki naturalne, siatka 512 punktów) — to rzeczywista symulacja numeryczna na Twoim urządzeniu, nie animacja. Scena 3D pokazuje WYŁĄCZNIE |ψ(x)|² i fazę ψ jako ciągłą, płaską wstążkę (kolor=faza, wysokość=gęstość) — nigdy pojedynczą cząstkę, bo model liczy falę. "Przed barierą" i "przeszło" to te same całki gęstości co dotychczasowy Canvas 2D; "pochłonięte na granicy domeny" to nowa, uczciwie policzona wielkość — różnica całkowitego prawdopodobieństwa przed i po każdym kroku solvera, co jest równe DOKŁADNIE temu, co pochłania tłumiąca maska brzegowa (jedyna nieunitarna operacja w kroku całkowania) — nie fizyczna absorpcja, tylko ograniczenie skończonej siatki, i tak nazwana. ZMIERZONE w tej sesji: po kilkudziesięciu jednostkach czasu symulacji (dziesiątki sekund realnego oglądania) ta wartość rośnie ISTOTNIE (~13% przy domyślnych parametrach) — odbita część pakietu realnie dociera z powrotem do przeciwległej krawędzi domeny i tam jest pochłaniana. Ta symulacja NIE MA stabilnego stanu, do którego można bezpiecznie "zostawić działać w nieskończoność" — z czasem całe prawdopodobieństwo ostatecznie odpływa z domeny. Suwak "Energia" to ułamek E/V₀ (energia względem wysokości bariery), nie wartość bezwzględna — HUD pokazuje obie. Bariera jest idealnym prostokątem, nie realistycznym profilem potencjału.',
  params: [
    {
      key: 'energy', label: 'Energia pakietu / wysokość bariery', type: 'slider',
      min: 0.2, max: 1.6, step: 0.05, default: 0.55,
      format: (v) => `${(v * 100).toFixed(0)}%`,
    },
    { key: 'barrier', label: 'Wysokość bariery', type: 'slider', min: 0.4, max: 2.5, step: 0.1, default: 1, unit: 'j.n.' },
    { key: 'width', label: 'Szerokość bariery', type: 'slider', min: 1, max: 8, step: 0.5, default: 3, unit: 'j.n.' },
  ],
  createSim3D: () => new TunnelingSim3D(),
  narrate(p, stats) {
    const energy = Number(p.energy);
    const transmission = Number(stats.trans ?? 0);
    return [
      {
        title: energy < 1 ? `Klasycznie: 0%. Kwantowo: ${transmission.toFixed(1)}%` : `Nad barierą — a mimo to część się odbija`,
        body:
          energy < 1
            ? `Pakiet ma tylko ${(energy * 100).toFixed(0)}% energii potrzebnej, by przejść nad barierą — klasyczna piłka odbiłaby się zawsze. Funkcja falowa zanika wewnątrz bariery wykładniczo, ale nie do zera: po drugiej stronie odradza się z amplitudą ${transmission.toFixed(1)}%. Zwęź barierę i patrz, jak transmisja rośnie wykładniczo.`
            : `Energia przekracza barierę, więc klasycznie przeszłoby 100%. Kwantowo część fali ODBIJA SIĘ mimo to (patrz "przed barierą" na HUD) — odbicie od progu potencjału to czysto falowy efekt, bez klasycznego odpowiednika.`,
      },
      {
        title: 'Uwaga interpretacyjna: "przed barierą" na starcie nic jeszcze nie mówi',
        body: 'Pakiet startuje po lewej stronie bariery, więc zaraz po uruchomieniu CAŁA gęstość leży w strefie "przed barierą" — to jeszcze nie pomiar odbicia, tylko fakt, że fala nie zdążyła dotrzeć do bariery. Prawdziwe odbicie widać dopiero, gdy część wstążki wróci w lewo PO interakcji z barierą (patrz środkowa, wolniej opadająca faza symulacji).',
      },
      {
        title: 'To zjawisko napędza Słońce i Twój telefon',
        body: 'Protony w jądrze Słońca mają za mało energii, by pokonać odpychanie kulombowskie — fuzja zachodzi wyłącznie dzięki tunelowaniu. Ten sam efekt: rozpad alfa, pamięci flash (elektrony tunelują przez izolator bramki) i skaningowy mikroskop tunelowy, którym „widzi się” pojedyncze atomy.',
      },
    ];
  },
};
