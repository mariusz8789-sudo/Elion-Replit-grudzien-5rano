import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { makeSoftDotTexture } from '../../core/three/starfield';
import { detectRenderTier, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Detektor cząstek w prawdziwym 3D — tory naładowanych cząstek są DOSŁOWNIE
 * helisami (nie płaskimi łukami jak w poprzedniej wersji 2D): pole
 * magnetyczne solenoidu biegnie wzdłuż osi wiązki (tu: oś Y), więc ruch
 * cząstki naładowanej to złożenie okręgu w płaszczyźnie poprzecznej (X–Z,
 * promień R = p_t/(qB) — ta sama fizyczna zależność co w wersji 2D) i
 * ruchu jednostajnego wzdłuż osi wiązki (p_z) — DOKŁADNA geometria toru w
 * jednorodnym polu solenoidalnym, nie przybliżenie. Fotony (bez ładunku)
 * lecą po linii prostej w 3D, nie tylko w płaszczyźnie ekranu.
 *
 * Rodzaje i liczba cząstek na zdarzenie są nadal losowane (nie liczone z
 * rzeczywistej kinematyki zderzenia LHC) — dokładnie ten sam poglądowy
 * status co wersja 2D, patrz honestyNote.
 */

const STEPS = 60;
const TRACKER_R = 2.0;
const ECAL_R = 3.4;
const HCAL_R = 5.0;
const CURV_K = 1.4;
const INTRO_DURATION = 1.0;

interface SpeciesDef { label: string; color: number; charged: boolean }
const SPECIES: SpeciesDef[] = [
  { label: 'e±', color: 0x5cd6e8, charged: true },
  { label: 'μ±', color: 0xa78bfa, charged: true },
  { label: 'π±', color: 0xf0b35c, charged: true },
  { label: 'p', color: 0xf47c7c, charged: true },
  { label: 'γ', color: 0xe6eaf5, charged: false },
];

interface Track3D {
  charge: -1 | 0 | 1;
  pt: number;
  color: number;
  points: { x: number; y: number; z: number }[];
  progress: number;
  line: THREE.Line;
  geo: THREE.BufferGeometry;
}

function computeTrackPath(charge: -1 | 0 | 1, pt: number, phi0: number, zSlope: number): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  let x = 0, y = 0, z = 0, ang = phi0;
  const totalLen = HCAL_R * 1.6;
  const dl = totalLen / STEPS;
  const curv = charge === 0 ? 0 : (charge * CURV_K) / (pt * 4);
  for (let s = 0; s <= STEPS; s++) {
    pts.push({ x, y, z });
    x += Math.cos(ang) * dl;
    z += Math.sin(ang) * dl;
    ang += curv * dl * 0.1;
    y += zSlope * dl;
    if (Math.hypot(x, z) > HCAL_R * 1.1 || Math.abs(y) > HCAL_R * 1.1) break;
  }
  return pts;
}

class DetectorSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0.18;

  private three!: typeof THREE;
  private scene!: THREE.Scene;
  private tracks: Track3D[] = [];
  private timer = 0;
  private events = 0;
  private wantEvent = true;
  private collisionFlash = 0;
  private collisionSprite?: THREE.Sprite;
  private collisionMat?: THREE.SpriteMaterial;
  private dotTexture?: THREE.Texture;
  private disposables: { dispose(): void }[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.scene = scene;
    this.introElapsed = getSettings().reducedMotion ? INTRO_DURATION : 0;
    scene.background = new three.Color(0x02030a);

    // Warstwy detektora jako gładkie, PRZEZROCZYSTE powłoki (nie siatka
    // wireframe) — pierwsza wersja z gęstym wireframe (40 segmentów × 3
    // warstwy) wizualnie "wygrywała" ze scenĄ, tworząc klatkę pionowych
    // prętów zasłaniającą tory (wykryte wizualnie, nie w kodzie). Kilka
    // rzadkich linii szerokości geograficznej wystarcza, by sugerować
    // cylinder, bez dominowania nad torami cząstek.
    const layers: [number, number, number][] = [
      [TRACKER_R, 0x5cd6e8, 0.05],
      [ECAL_R, 0xf0b35c, 0.045],
      [HCAL_R, 0x8d97b4, 0.06],
    ];
    for (const [r, color, opacity] of layers) {
      const solidGeo = new three.CylinderGeometry(r, r, HCAL_R * 1.3, 48, 1, true);
      const solidMat = new three.MeshBasicMaterial({ color, transparent: true, opacity, side: three.DoubleSide, depthWrite: false });
      const solid = new three.Mesh(solidGeo, solidMat);
      scene.add(solid);
      this.disposables.push(solidGeo, solidMat);

      const wireGeo = new three.CylinderGeometry(r, r, HCAL_R * 1.3, 12, 1, true);
      const wireMat = new three.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 3, wireframe: true, side: three.DoubleSide });
      const wire = new three.Mesh(wireGeo, wireMat);
      scene.add(wire);
      this.disposables.push(wireGeo, wireMat);
    }

    this.dotTexture = makeSoftDotTexture(three);
    this.collisionMat = new three.SpriteMaterial({ map: this.dotTexture, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 });
    this.collisionSprite = new three.Sprite(this.collisionMat);
    this.collisionSprite.scale.set(0.5, 0.5, 1);
    scene.add(this.collisionSprite);
    this.disposables.push(this.collisionMat, this.dotTexture);

    camera.position.set(HCAL_R * 1.9, HCAL_R * 1.35, HCAL_R * 1.9);
    camera.lookAt(0, 0, 0);
  }

  reset = () => {
    for (const t of this.tracks) {
      this.scene.remove(t.line);
      t.geo.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    this.tracks = [];
    this.events = 0;
    this.wantEvent = true;
  };

  pointer(_x: number, _y: number, type: 'down' | 'move' | 'up') {
    if (type === 'down') this.wantEvent = true;
  }

  private fire(p: SimParams) {
    const three = this.three;
    const energy = Number(p.energy);
    const n = 5 + Math.floor(Math.random() * (6 + energy / 8));
    for (const t of this.tracks) {
      this.scene.remove(t.line);
      t.geo.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    this.tracks = [];
    for (let i = 0; i < n; i++) {
      const s = SPECIES[Math.floor(Math.random() * SPECIES.length)];
      const charge: -1 | 0 | 1 = s.charged ? (Math.random() < 0.5 ? -1 : 1) : 0;
      const pt = 0.15 + Math.random() * 0.85;
      const phi0 = Math.random() * Math.PI * 2;
      const zSlope = (Math.random() * 2 - 1) * 0.9;
      const points = computeTrackPath(charge, pt, phi0, zSlope);
      const geo = new three.BufferGeometry();
      const posArr = new Float32Array(points.length * 3);
      points.forEach((pt2, idx) => {
        posArr[idx * 3] = pt2.x;
        posArr[idx * 3 + 1] = pt2.y;
        posArr[idx * 3 + 2] = pt2.z;
      });
      geo.setAttribute('position', new three.BufferAttribute(posArr, 3));
      geo.setDrawRange(0, 1);
      const mat = new three.LineBasicMaterial({
        color: s.color, transparent: true, opacity: 0.9,
        linewidth: 1, blending: three.AdditiveBlending, depthWrite: false,
      });
      const line = new three.Line(geo, mat);
      this.scene.add(line);
      this.tracks.push({ charge, pt, color: s.color, points, progress: 0, line, geo });
    }
    this.events++;
    this.collisionFlash = 1;
  }

  update(dt: number, p: SimParams) {
    this.timer += dt;
    if (this.wantEvent || (Boolean(p.auto) && this.timer > 2.4)) {
      this.timer = 0;
      this.wantEvent = false;
      this.fire(p);
    }
    for (const t of this.tracks) t.progress = Math.min(1, t.progress + dt * 1.1);
    if (this.collisionFlash > 0) this.collisionFlash = Math.max(0, this.collisionFlash - dt / 0.4);
    if (!getSettings().reducedMotion) this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + dt);
  }

  syncScene() {
    for (const t of this.tracks) {
      const count = Math.max(1, Math.round(t.progress * (t.points.length - 1)) + 1);
      t.geo.setDrawRange(0, count);
    }
    if (this.collisionMat) {
      this.collisionMat.opacity = this.collisionFlash;
      if (this.collisionSprite) {
        const s = 0.4 + (1 - this.collisionFlash) * 0.6;
        this.collisionSprite.scale.set(s, s, 1);
      }
    }
    if (this.fadePass) {
      const t = Math.min(1, this.introElapsed / INTRO_DURATION);
      this.fadePass.uniforms.uFade.value = t * t * (3 - 2 * t);
    }
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
    if (tierAllowsBloom(detectRenderTier())) {
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.6, 0.5, 0.7));
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
    return { events: this.events, tracks: this.tracks.length };
  }

  dispose() {
    for (const t of this.tracks) {
      t.geo.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    for (const d of this.disposables) d.dispose();
  }
}

export const particleDetector3D: ExperimentDef = {
  id: 'detector-3d',
  name: 'Detektor cząstek 3D',
  honesty: 'educational',
  honestyNote:
    'Wizualizacja poglądowa inspirowana detektorami CERN, teraz w pełnym 3D. Fizycznie DOKŁADNE: tor naładowanej cząstki w jednorodnym polu solenoidalnym wzdłuż osi wiązki jest helisą — okrąg w płaszczyźnie poprzecznej (promień r = p_t/(qB)) złożony z jednostajnym ruchem wzdłuż osi wiązki — dokładnie to widać tutaj, nie przybliżenie płaskiego łuku. Znak krzywizny wynika z ładunku. Rodzaje i liczba cząstek na zdarzenie są losowane — NIE odtwarzamy rzeczywistych przekrojów czynnych ani kinematyki zderzeń LHC. Warstwy detektora (tracker/ECAL/HCAL) są poglądowe co do proporcji.',
  params: [
    { key: 'energy', label: 'Energia zderzenia', type: 'slider', min: 5, max: 100, step: 5, default: 30, unit: 'j.u.' },
    { key: 'auto', label: 'Zderzaj automatycznie', type: 'toggle', default: true },
  ],
  createSim3D: () => new DetectorSim3D(),
  narrate(p, stats) {
    const n = Number(stats.tracks ?? 0);
    return [
      {
        title: `Zdarzenie #${stats.events ?? 0}: ${n} torów`,
        body: 'Kierunek skrętu (w płaszczyźnie poprzecznej do wiązki) zdradza ładunek: w polu solenoidu cząstki dodatnie i ujemne zakręcają w przeciwne strony. Tor jest w rzeczywistości helisą 3D — obróć scenę, żeby zobaczyć składową wzdłuż osi wiązki. Tory mocno zakrzywione = niski pęd poprzeczny; niemal proste = wysoki. γ (bez ładunku) lecą po linii prostej.',
      },
      {
        title: 'Jak odkrywa się cząstki',
        body: `Bozon Higgsa (2012) znaleziono dokładnie tak: miliardy zdarzeń, w nich pary fotonów i czwórki leptonów, a w statystyce — garb przy 125 GeV. Przy energii ${p.energy} j.u. zwiększ suwak i zobacz, jak rośnie krotność cząstek — tak samo działa podnoszenie energii akceleratora.`,
      },
      {
        title: 'Czego ta wizualizacja nie odtwarza',
        kind: 'warning' as const,
        body: 'Kwarki i gluony nie występują swobodnie (uwięzienie koloru) — w prawdziwym detektorze widać tylko ich "dżety", których ten widok nie symuluje; rodzaje i liczba cząstek są tu losowane, nie liczone z rzeczywistej kinematyki zderzenia. Histogram masy niezmienniczej — metoda, którą NAPRAWDĘ odkryto J/ψ i Z⁰ — zobacz w zakładce „Odkryj cząstkę" obok.',
      },
    ];
  },
};
