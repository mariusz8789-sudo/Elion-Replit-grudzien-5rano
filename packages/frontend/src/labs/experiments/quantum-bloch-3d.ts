import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { applyGate, blochVector, GATE_ROTATIONS, GATES, rotateVector, type C } from './quantum-bloch';
import { makeSoftDotTexture } from '../../core/three/starfield';
import { detectRenderTier, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Sfera Blocha w prawdziwym 3D — kubit jako punkt na powierzchni kuli
 * jednostkowej, bramki jako te same dokładne macierze unitarne co w
 * quantum-bloch.ts (applyGate — jedno miejsce prawdy dla ewolucji stanu).
 *
 * KLUCZOWA RÓŻNICA wobec poprzedniej wersji (rzut 2D na Canvas): bramka NIE
 * przeskakuje wektora stanu skokowo. Z homomorfizmu SU(2)→SO(3) wynika, że
 * KAŻDA jednokubitowa bramka unitarna działa na wektor Blocha jako DOKŁADNY
 * obrót o konkretny kąt wokół konkretnej osi (GATE_ROTATIONS w
 * quantum-bloch.ts). Animujemy więc CIĄGŁY obrót Rodriguesa od stanu
 * początkowego do końcowego — to nie jest ozdobna interpolacja: to
 * dosłowna, sparametyzowana w czasie wersja tej samej dokładnej macierzy,
 * zweryfikowana w quantumBloch.test.ts. Kolaps przy pomiarze NIE jest
 * animowany obrotem — pomiar projekcyjny jest fizycznie nieciągły
 * (nieunitarny), więc wektor skacze na biegun z krótkim błyskiem, zamiast
 * fałszywie sugerować płynną ewolezję tam, gdzie fizyka jej nie ma.
 *
 * Przyciski bramek to panel HUD zaczepiony jako dziecko kamery (`camera.add`)
 * — dzięki temu zostają na stałym miejscu ekranu niezależnie od obrotu/
 * auto-obrotu kamery (ten sam trik co diegetyczny HUD w grach 3D), zamiast
 * rysować je na osobnej warstwie Canvas 2D nałożonej na kanwę WebGL.
 * Trafienia w przyciski wykrywane są przez THREE.Raycaster w Sim3D.pointer().
 */

const MAX_HISTORY = 10;
const GATE_LABELS = ['H', 'X', 'Y', 'Z', 'S', 'T', '📏'] as const;
const ANIM_DURATION = 0.55; // s — czas ciągłej animacji obrotu jednej bramki
const HUD_DIST = 1.05; // odległość panelu HUD przed kamerą (jednostki lokalne kamery)
const INTRO_DURATION = 1.2; // s — kinowe rozjaśnienie sceny przy wejściu (jak w Einstein/Universe Lab)

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

/** Tekstura etykiety osi (|0⟩, |1⟩, |+⟩, |−⟩) w przestrzeni świata — obraca się razem ze sferą. */
function makeAxisLabelTexture(three: typeof THREE, text: string): THREE.Texture {
  const w = 128;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 34px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(230,234,245,0.92)';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Tekstura przycisku bramki (tło + obwódka + etykieta) — jedna na bramkę, generowana raz przy init(). */
function makeButtonTexture(three: typeof THREE, label: string, variant: 'gate' | 'measure'): THREE.Texture {
  const w = 160;
  const h = 100;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const bg = variant === 'measure' ? 'rgba(240,179,92,0.20)' : 'rgba(16,21,38,0.82)';
  const border = variant === 'measure' ? 'rgba(240,179,92,0.95)' : 'rgba(92,214,232,0.65)';
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 16);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.fillStyle = '#e6eaf5';
  ctx.font = '600 40px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 2);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface Disposable {
  dispose(): void;
}

class BlochSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0.22;

  private three!: typeof THREE;
  private camera!: THREE.PerspectiveCamera;
  private raycaster!: THREE.Raycaster;
  private disposables: Disposable[] = [];

  // stan kwantowy — źródło prawdy, identyczne wzory co w quantum-bloch.ts
  private a: C = [1, 0];
  private b: C = [0, 0];
  private shrink = 1;
  private lastGate = '—';
  private measured: string | null = null;
  private measureTimer = 0;
  private gateCount = 0;
  private history: string[] = [];

  // animacja ciągłego obrotu (patrz komentarz na górze pliku)
  private displayVec: [number, number, number] = [0, 0, 1];
  private anim: { axis: [number, number, number]; angleRad: number; from: [number, number, number]; elapsed: number } | null = null;
  private trail: [number, number, number][] = [];
  private trailAcc = 0;
  private flashPulse = 0;

  // obiekty sceny
  private arrow!: THREE.ArrowHelper;
  private tipGlow!: THREE.Sprite;
  private flashSprite!: THREE.Sprite;
  private trailGeometry!: THREE.BufferGeometry;
  private trailLine!: THREE.Line;

  // HUD (dziecko kamery)
  private hud!: THREE.Group;
  private buttonMeshes: THREE.Mesh[] = [];
  private buttonMeshMap = new Map<string, THREE.Mesh>();
  private readoutSprite!: THREE.Sprite;
  private readoutCanvas!: HTMLCanvasElement;
  private readoutCtx!: CanvasRenderingContext2D;
  private readoutTexture!: THREE.Texture;
  private lastReadoutKey = '';

  private viewW = 0;
  private viewH = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private introElapsed = 0;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number) {
    this.three = three;
    this.camera = camera;
    this.raycaster = new three.Raycaster();
    this.viewW = w;
    this.viewH = h;
    this.introElapsed = getSettings().reducedMotion ? INTRO_DURATION : 0;

    // Kamera musi być częścią grafu sceny, żeby jej dzieci (HUD) były
    // brane pod uwagę przy trawersowaniu renderującym — patrz komentarz
    // na górze pliku o technice diegetycznego HUD.
    scene.add(camera);
    camera.position.set(0, 0.4, 3.1);
    camera.lookAt(0, 0, 0);

    // tło
    scene.background = new three.Color(0x02030a);

    // Sfera Blocha: siatka południków/równoleżników (widoczna geometria kuli
    // jednostkowej, nie płaska elipsa) + wyróżniony równik.
    const sphereGeo = new three.SphereGeometry(1, 28, 18);
    const sphereMat = new three.MeshBasicMaterial({ color: 0x5a6a8f, wireframe: true, transparent: true, opacity: 0.22 });
    const sphereMesh = new three.Mesh(sphereGeo, sphereMat);
    scene.add(sphereMesh);
    this.disposables.push(sphereGeo, sphereMat);

    const equatorGeo = new three.TorusGeometry(1, 0.006, 8, 96);
    const equatorMat = new three.MeshBasicMaterial({ color: 0x8d97b4, transparent: true, opacity: 0.55 });
    const equatorMesh = new three.Mesh(equatorGeo, equatorMat);
    equatorMesh.rotation.x = Math.PI / 2;
    scene.add(equatorMesh);
    this.disposables.push(equatorGeo, equatorMat);

    // Etykiety biegunów (|0⟩,|1⟩) i osi rzeczywistej (|+⟩,|−⟩) — w przestrzeni
    // świata, obracają się razem ze sferą (poprawna intuicja geometryczna).
    const poleLabels: { text: string; pos: [number, number, number] }[] = [
      { text: '|0⟩', pos: [0, 1.22, 0] },
      { text: '|1⟩', pos: [0, -1.22, 0] },
      { text: '|+⟩', pos: [1.22, 0, 0] },
      { text: '|−⟩', pos: [-1.22, 0, 0] },
    ];
    for (const { text, pos } of poleLabels) {
      const tex = makeAxisLabelTexture(three, text);
      const mat = new three.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new three.Sprite(mat);
      sprite.position.set(...pos);
      sprite.scale.set(0.42, 0.21, 1);
      scene.add(sprite);
      this.disposables.push(tex, mat);
    }

    // Wektor stanu — prawdziwa strzałka 3D (ArrowHelper zarządza własną
    // geometrią/materiałem, ma wbudowane dispose()).
    this.arrow = new three.ArrowHelper(new three.Vector3(0, 0, 1), new three.Vector3(0, 0, 0), 1, 0x5cd6e8, 0.2, 0.1);
    scene.add(this.arrow);

    const dotTex = makeSoftDotTexture(three);
    const tipMat = new three.SpriteMaterial({ map: dotTex, color: 0x8fe8f5, transparent: true, depthWrite: false });
    this.tipGlow = new three.Sprite(tipMat);
    this.tipGlow.scale.set(0.22, 0.22, 1);
    scene.add(this.tipGlow);
    this.disposables.push(tipMat);

    const flashMat = new three.SpriteMaterial({ map: dotTex, color: 0xf0b35c, transparent: true, depthWrite: false, opacity: 0 });
    this.flashSprite = new three.Sprite(flashMat);
    this.flashSprite.scale.set(0.3, 0.3, 1);
    scene.add(this.flashSprite);
    this.disposables.push(flashMat, dotTex);

    // Ślad obrotu (łuk geodezyjny zakreślany PRZEZ animowany obrót — patrz
    // update()) — realna trajektoria matematyczna, nie ozdoba.
    this.trailGeometry = new three.BufferGeometry();
    const trailMat = new three.LineBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.55 });
    this.trailLine = new three.Line(this.trailGeometry, trailMat);
    this.trailLine.visible = false;
    scene.add(this.trailLine);
    this.disposables.push(this.trailGeometry, trailMat);

    // HUD: panel przycisków bramek + odczyt P(|0⟩)/P(|1⟩), zaczepiony jako
    // dziecko kamery — patrz komentarz na górze pliku.
    this.hud = new three.Group();
    camera.add(this.hud);

    for (const lbl of GATE_LABELS) {
      const tex = makeButtonTexture(three, lbl, lbl === '📏' ? 'measure' : 'gate');
      const geo = new three.PlaneGeometry(1, 1);
      const mat = new three.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
      const mesh = new three.Mesh(geo, mat);
      mesh.renderOrder = 999;
      mesh.userData.label = lbl;
      this.hud.add(mesh);
      this.buttonMeshMap.set(lbl, mesh);
      this.buttonMeshes.push(mesh);
      this.disposables.push(tex, geo, mat);
    }

    this.readoutCanvas = document.createElement('canvas');
    this.readoutCanvas.width = 512;
    this.readoutCanvas.height = 128;
    this.readoutCtx = this.readoutCanvas.getContext('2d')!;
    this.readoutTexture = new three.CanvasTexture(this.readoutCanvas);
    const readoutMat = new three.SpriteMaterial({ map: this.readoutTexture, transparent: true, depthTest: false, depthWrite: false });
    this.readoutSprite = new three.Sprite(readoutMat);
    this.readoutSprite.renderOrder = 999;
    this.hud.add(this.readoutSprite);
    this.disposables.push(this.readoutTexture, readoutMat);

    this.layoutHud();
    this.updateReadout();
  }

  onResize(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
    this.layoutHud();
  }

  private layoutHud() {
    if (!this.camera || !this.viewW || !this.viewH) return;
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const halfH = Math.tan(fovRad / 2) * HUD_DIST;
    const aspect = this.viewW / this.viewH;
    const halfW = halfH * aspect;

    // Odczyt liczbowy: mały, blisko górnej krawędzi z zapasem (nie może
    // wystawać poza stożek widzenia, inaczej jest ucinany przez viewport).
    const readoutW = Math.min(halfW * 1.3, 1.1);
    this.readoutSprite.position.set(0, halfH * 0.6, -HUD_DIST);
    this.readoutSprite.scale.set(readoutW, readoutW * 0.22, 1);

    // Przyciski: DWA rzędy zakotwiczone od DOLNEJ krawędzi stożka widzenia
    // (nie od stałego ułamka halfH liczonego od góry) — na szerokich,
    // niskich kanwach (typowy .sim-stage) inaczej drugi rząd wypada poza
    // stożek widzenia i jest niewidoczny, mimo że nadal "klikalny" przez
    // raycasting. Rozmiar przycisku ograniczony względem halfH, nie tylko
    // halfW, żeby dwa rzędy zawsze zmieściły się w pionie.
    const rows: string[][] = [['H', 'X', 'Y', 'Z'], ['S', 'T', '📏']];
    const btnW = Math.max(0.1, Math.min((halfW * 2 * 0.88) / 4, halfH * 0.34, 0.2));
    const btnH = btnW * 0.62;
    const gapX = btnW * 0.2;
    const rowGapY = btnH * 1.3;
    const bottomMargin = halfH * 0.08;
    const lastRowY = -halfH + bottomMargin + btnH / 2;
    rows.forEach((row, ri) => {
      const totalW = row.length * btnW + (row.length - 1) * gapX;
      let x = -totalW / 2 + btnW / 2;
      const y = lastRowY + (rows.length - 1 - ri) * rowGapY;
      for (const label of row) {
        const mesh = this.buttonMeshMap.get(label);
        if (mesh) {
          mesh.position.set(x, y, -HUD_DIST);
          mesh.scale.set(btnW, btnH, 1);
        }
        x += btnW + gapX;
      }
    });
  }

  private updateReadout() {
    const p0 = Math.round((this.a[0] ** 2 + this.a[1] ** 2) * 100);
    const key = `${p0}|${this.lastGate}|${this.measured ?? ''}|${this.measureTimer > 0}|${this.shrink.toFixed(2)}`;
    if (key === this.lastReadoutKey) return;
    this.lastReadoutKey = key;
    const ctx = this.readoutCtx;
    const { width, height } = this.readoutCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(230,234,245,0.95)';
    ctx.font = '600 36px ui-monospace, monospace';
    ctx.fillText(`P(|0⟩)=${p0}%  P(|1⟩)=${100 - p0}%`, width / 2, 34);
    ctx.font = '400 26px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(141,151,180,0.9)';
    ctx.fillText(`ostatnia operacja: ${this.lastGate} · |r⃗|=${this.shrink.toFixed(2)}`, width / 2, 76);
    if (this.measured && this.measureTimer > 0) {
      ctx.fillStyle = '#f0b35c';
      ctx.font = '700 30px ui-monospace, monospace';
      ctx.fillText(`pomiar → ${this.measured}`, width / 2, 112);
    }
    this.readoutTexture.needsUpdate = true;
  }

  reset = () => {
    this.a = [1, 0];
    this.b = [0, 0];
    this.shrink = 1;
    this.lastGate = '—';
    this.measured = null;
    this.measureTimer = 0;
    this.gateCount = 0;
    this.history = [];
    this.displayVec = [0, 0, 1];
    this.anim = null;
    this.trail = [];
    this.flashPulse = 0;
  };

  private apply(g: string) {
    if (g === 'M') {
      const p0 = this.a[0] ** 2 + this.a[1] ** 2;
      const zero = Math.random() < p0;
      this.a = zero ? [1, 0] : [0, 0];
      this.b = zero ? [0, 0] : [1, 0];
      this.shrink = 1;
      this.measured = zero ? '|0⟩' : '|1⟩';
      this.measureTimer = 1.6;
      this.lastGate = 'pomiar';
      this.history.push('📏');
      if (this.history.length > MAX_HISTORY) this.history.shift();
      // Kolaps pomiarowy jest fizycznie NIECIĄGŁY (projekcja, nie unitarna
      // ewolucja) — celowo bez animacji obrotu, tylko natychmiastowy skok
      // plus krótki błysk (patrz honestyNote).
      this.displayVec = blochVector(this.a, this.b);
      this.anim = null;
      this.trail = [];
      this.flashPulse = 1;
      return;
    }
    if (!GATES[g]) return;
    const before = this.displayVec;
    [this.a, this.b] = applyGate([this.a, this.b], g);
    this.lastGate = g;
    this.gateCount++;
    this.history.push(g);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    const rot = GATE_ROTATIONS[g];
    if (rot) {
      this.anim = { axis: rot.axis, angleRad: rot.angleRad, from: before, elapsed: 0 };
      this.trail = [before];
      this.trailAcc = 0;
    } else {
      this.displayVec = blochVector(this.a, this.b);
    }
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up') {
    if (type !== 'down' || !this.viewW || !this.viewH) return;
    const ndcX = (x / this.viewW) * 2 - 1;
    const ndcY = -((y / this.viewH) * 2 - 1);
    const ndc = new this.three.Vector2(ndcX, ndcY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.buttonMeshes, false);
    if (hits.length > 0) {
      const label = (hits[0].object.userData as { label?: string }).label;
      if (label) this.apply(label === '📏' ? 'M' : label);
    }
  }

  update(dt: number, p: SimParams) {
    if (p.decoherence) {
      this.shrink = Math.max(0.02, this.shrink - dt * 0.12);
    } else if (this.shrink < 1) {
      this.shrink = Math.min(1, this.shrink + dt * 0.3);
    }
    if (this.measureTimer > 0) this.measureTimer -= dt;
    if (this.flashPulse > 0) this.flashPulse = Math.max(0, this.flashPulse - dt / 0.6);
    if (!getSettings().reducedMotion) this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + dt);

    if (this.anim) {
      this.anim.elapsed += dt;
      const t = Math.min(1, this.anim.elapsed / ANIM_DURATION);
      const angleNow = this.anim.angleRad * easeInOutQuad(t);
      this.displayVec = rotateVector(this.anim.from, this.anim.axis, angleNow);
      this.trailAcc += dt;
      if (this.trailAcc > 0.018) {
        this.trailAcc = 0;
        this.trail.push(this.displayVec);
        if (this.trail.length > 80) this.trail.shift();
      }
      if (t >= 1) {
        this.displayVec = blochVector(this.a, this.b);
        this.anim = null;
      }
    }
  }

  syncScene() {
    const three = this.three;
    const v = this.displayVec;
    // mapowanie fizyka(x,y,z) → three.js(x,z,y): oś z (bieguny |0⟩/|1⟩) w górę ekranu
    const dir = new three.Vector3(v[0] * this.shrink, v[2] * this.shrink, v[1] * this.shrink);
    const len = dir.length();
    if (len > 1e-4) {
      this.arrow.visible = true;
      this.arrow.setDirection(dir.clone().normalize());
      this.arrow.setLength(Math.max(0.06, len), Math.min(0.22, len * 0.32 + 0.05), Math.min(0.11, len * 0.16 + 0.02));
      this.tipGlow.visible = true;
      this.tipGlow.position.copy(dir);
    } else {
      this.arrow.visible = false;
      this.tipGlow.visible = false;
    }

    if (this.trail.length > 1) {
      const pts = this.trail.map((p) => new three.Vector3(p[0] * this.shrink, p[2] * this.shrink, p[1] * this.shrink));
      this.trailGeometry.setFromPoints(pts);
      this.trailLine.visible = true;
    } else {
      this.trailLine.visible = false;
    }

    this.flashSprite.visible = this.flashPulse > 0;
    if (this.flashPulse > 0) {
      this.flashSprite.position.copy(dir);
      const s = 0.28 + (1 - this.flashPulse) * 0.55;
      this.flashSprite.scale.set(s, s, 1);
      (this.flashSprite.material as THREE.SpriteMaterial).opacity = this.flashPulse;
    }

    if (this.fadePass) {
      const t = Math.min(1, this.introElapsed / INTRO_DURATION);
      this.fadePass.uniforms.uFade.value = t * t * (3 - 2 * t); // smoothstep
    }

    this.updateReadout();
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
    const { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass } = modules;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const tier = detectRenderTier();
    if (tierAllowsBloom(tier)) {
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.55, 0.45, 0.62));
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

  getStats() {
    const p0 = this.a[0] ** 2 + this.a[1] ** 2;
    return {
      p0: Math.round(p0 * 100),
      shrink: Math.round(this.shrink * 100) / 100,
      gates: this.gateCount,
      historyLen: this.history.length,
    };
  }

  dispose() {
    this.arrow?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

export const quantumBloch: ExperimentDef = {
  id: 'bloch',
  name: 'Sfera Blocha',
  honesty: 'exact',
  honestyNote:
    'Kubit jest reprezentowany pełnym stanem kwantowym, a bramki to dokładne macierze unitarne — identyczne z używanymi w komputerach kwantowych. NOWOŚĆ: wektor Blocha obraca się CIĄGŁE, a nie skacze — to DOKŁADNE, nie ozdobne, bo z homomorfizmu SU(2)→SO(3) każda bramka jednokubitowa JEST obrotem o konkretny kąt wokół konkretnej osi (matematycznie zweryfikowane w testach). Wyjątek: kolaps przy pomiarze NIE jest animowany obrotem, bo projekcja pomiarowa jest fizycznie nieciągła (nieunitarna) — wektor skacze na biegun, tak jak w rzeczywistości. Dekoherencja jest modelem fenomenologicznym (kurczenie wektora Blocha). Panel przycisków bramek i odczyt liczbowy to interfejs (HUD), nie dane fizyczne. Ograniczenie: to obwód JEDNOKUBITOWY — bramki dwukubitowe (np. CNOT) i splątanie wymagają reprezentacji stanu, której pojedyncza sfera Blocha nie potrafi pokazać, i pozostają w backlogu.',
  params: [
    { key: 'decoherence', label: 'Dekoherencja (sprzężenie z otoczeniem)', type: 'toggle', default: false },
  ],
  createSim3D: () => new BlochSim3D(),
  narrate(p, stats) {
    const p0 = Number(stats.p0 ?? 100);
    const shrink = Number(stats.shrink ?? 1);
    const blocks = [
      {
        title: `Stan kubitu: P(|0⟩) = ${p0}%`,
        body:
          p0 > 95 || p0 < 5
            ? 'Kubit jest niemal w stanie bazowym — jak klasyczny bit. Dotknij H (bramka Hadamarda), by utworzyć superpozycję: wektor obróci się na równik sfery, gdzie oba wyniki pomiaru są równie prawdopodobne.'
            : `Kubit jest w superpozycji: pomiar da |0⟩ z prawdopodobieństwem ${p0}%, ale przed pomiarem stan jest w pełni określony — to punkt na sferze, nie „niewiedza". Bramki Z, S, T obracają fazę (wektor krąży po równiku) — amplitudy zostają, zmienia się coś, czego pojedynczy pomiar nie widzi, a interferencja tak.`,
      },
      {
        title: 'Każda bramka to prawdziwy obrót, nie skok',
        body: 'Obserwuj strzałkę: obraca się płynnie po dokładnym łuku geodezyjnym, bo z matematyki SU(2)→SO(3) wynika, że każda bramka jednokubitowa DOSŁOWNIE jest obrotem sfery Blocha o określony kąt wokół określonej osi (H: π wokół osi (x+z)/√2; X,Y,Z: π wokół odpowiedniej osi; S: π/2, T: π/4 wokół osi z). To nie animacja "dla ładności" — to ta sama macierz, tylko rozłożona w czasie.',
      },
      {
        title: 'Pomiar to nie odczyt — to projekcja',
        body: 'Przycisk 📏 losuje wynik zgodnie z amplitudami i NISZCZY superpozycję: wektor skacze na biegun BEZ animacji obrotu — to jedyny moment, w którym ewolucja jest naprawdę nieciągła, bo pomiar projekcyjny nie jest procesem unitarnym. Dlatego komputer kwantowy mierzy się raz, na końcu obwodu.',
      },
    ];
    const historyLen = Number(stats.historyLen ?? 0);
    if (historyLen >= 2) {
      blocks.push({
        title: 'Obwód to prawdziwa sekwencja macierzy',
        body: 'Bramki kwantowe w OGÓLNOŚCI nie przemieniają — spróbuj X, potem Z, a potem wyczyść i zrób Z, potem X: to różne obwody, mimo tych samych dwóch bramek, bo mnożenie macierzy nie jest przemienne. To realna własność matematyczna, nie ciekawostka — na niej opierają się wszystkie algorytmy kwantowe.',
      });
    }
    if (p.decoherence) {
      blocks.push({
        title: `Dekoherencja: |r⃗| = ${shrink.toFixed(2)}`,
        body: 'Otoczenie „podgląda" kubit i wektor Blocha kurczy się do środka sfery — stan czysty staje się mieszaniną statystyczną. To główny wróg komputerów kwantowych: czasy koherencji dzisiejszych kubitów to mikrosekundy–milisekundy, stąd kriostaty i korekcja błędów.',
      });
    }
    return blocks;
  },
};
