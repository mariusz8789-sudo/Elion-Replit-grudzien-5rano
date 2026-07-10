import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import {
  kerrCriticalImpactParameter,
  kerrErgosphereEquatorRadius,
  kerrHorizonRadius,
  kerrPhotonOrbitRadius,
  stepKerrEquatorialGeodesic,
} from '../../core/physics';

/**
 * Wirująca czarna dziura Kerra w 3D — geodezyjne fotonów w PŁASZCZYŹNIE
 * RÓWNIKOWEJ (θ=π/2, stała Cartera Q=0), dokładne równania Boyer–Lindquist
 * (Carter 1968), zredukowane do postaci Bineta i całkowane RK4 —
 * core/physics.ts: stepKerrEquatorialGeodesic (jedno miejsce prawdy,
 * pokryte 20 testami fizycznymi w physics.test.ts, w tym cross-checkiem
 * przeciw geodezyjnej Schwarzschilda przy a=0 i znanym granicom
 * ekstremalnym r̂_pro=M, r̂_retro=4M).
 *
 * ŚWIADOME OGRANICZENIE (patrz honestyNote): TYLKO orbity równikowe są tu
 * dokładne. Ogólna geodezyjna Kerra poza równikiem ma niezerową stałą
 * Cartera Q i precesuje w θ — to osobne, znacznie trudniejsze zagadnienie
 * (całki eliptyczne / pełne równania Cartera), świadomie w backlogu.
 * Efekt wleczenia układów inercjalnych (frame-dragging) jest mimo to w
 * pełni widoczny: orbita fotonowa prograde (współbieżna ze spinem) leży
 * BLIŻEJ horyzontu niż orbita retrograde — to jest DOKŁADNY, policzalny
 * skutek metryki Kerra, nie ilustracja.
 */

const SCALE = 1; // 1 jednostka sceny = 1 M (masa czarnej dziury w jednostkach geometrycznych G=c=1)
const MAX_TRAIL = 100;
const MAX_PHOTONS = 30;
const DISK_PARTICLES = 650;
const A_MAX = 0.97; // unikamy a=M dokładnie (osobliwość numeryczna 1/√(M²−a²)→0)

interface Photon3D {
  u: number;
  du: number;
  phi: number;
  b: number;
  prograde: boolean;
  dead: boolean;
  captured: boolean;
  trail: { x: number; y: number; z: number }[];
  line: THREE.Line;
  geo: THREE.BufferGeometry;
}

interface DiskParticle {
  r: number;
  a0: number;
  y0: number;
}

function ergosphereRadiusAtTheta(theta: number, a: number, mass: number): number {
  return mass + Math.sqrt(Math.max(0, mass * mass - a * a * Math.cos(theta) * Math.cos(theta)));
}

class Kerr3DSim implements Sim3D {
  private t = 0;
  private spawnAcc = 0;
  private captured = 0;
  private escaped = 0;
  private a = 0.7;
  private bScale = 1.15;
  private photons: Photon3D[] = [];
  private three?: typeof THREE;
  private scene?: THREE.Scene;
  private diskGeo?: THREE.BufferGeometry;
  private diskBase: DiskParticle[] = [];
  private horizonMesh?: THREE.Mesh;
  private ergoMesh?: THREE.Mesh;
  private proRing?: THREE.Mesh;
  private retroRing?: THREE.Mesh;
  private disposables: { dispose(): void }[] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.scene = scene;

    scene.add(new three.AmbientLight(0x223344, 0.6));

    const horizonGeo = new three.SphereGeometry(1, 40, 40);
    const horizonMat = new three.MeshBasicMaterial({ color: 0x000000 });
    this.horizonMesh = new three.Mesh(horizonGeo, horizonMat);
    scene.add(this.horizonMesh);
    this.disposables.push(horizonGeo, horizonMat);

    const ergoGeo = new three.SphereGeometry(1, 40, 40);
    const ergoMat = new three.MeshBasicMaterial({ color: 0x8866ff, transparent: true, opacity: 0.1, side: three.DoubleSide, wireframe: true });
    this.ergoMesh = new three.Mesh(ergoGeo, ergoMat);
    scene.add(this.ergoMesh);
    this.disposables.push(ergoGeo, ergoMat);

    const proRingGeo = new three.TorusGeometry(1, 0.008, 8, 80);
    const proRingMat = new three.MeshBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.4 });
    this.proRing = new three.Mesh(proRingGeo, proRingMat);
    this.proRing.rotation.x = Math.PI / 2;
    scene.add(this.proRing);
    this.disposables.push(proRingGeo, proRingMat);

    const retroRingGeo = new three.TorusGeometry(1, 0.008, 8, 80);
    const retroRingMat = new three.MeshBasicMaterial({ color: 0xf0b35c, transparent: true, opacity: 0.4 });
    this.retroRing = new three.Mesh(retroRingGeo, retroRingMat);
    this.retroRing.rotation.x = Math.PI / 2;
    scene.add(this.retroRing);
    this.disposables.push(retroRingGeo, retroRingMat);

    const diskPos = new Float32Array(DISK_PARTICLES * 3);
    const diskCol = new Float32Array(DISK_PARTICLES * 3);
    this.diskBase = Array.from({ length: DISK_PARTICLES }, () => ({
      r: 0, // ustawiane w update() po znajomości promienia ergosfery
      a0: Math.random() * Math.PI * 2,
      y0: (Math.random() - 0.5) * 0.05,
    }));
    this.diskGeo = new three.BufferGeometry();
    this.diskGeo.setAttribute('position', new three.BufferAttribute(diskPos, 3));
    this.diskGeo.setAttribute('color', new three.BufferAttribute(diskCol, 3));
    const diskMat = new three.PointsMaterial({
      size: 0.045, vertexColors: true, transparent: true, opacity: 0.9,
      blending: three.AdditiveBlending, depthWrite: false,
    });
    scene.add(new three.Points(this.diskGeo, diskMat));
    this.disposables.push(this.diskGeo, diskMat);

    camera.position.set(11, 6.5, 15);
    camera.lookAt(0, 0, 0);
  }

  setupPostProcessing(modules: PostProcessingModules, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): PostProcessor {
    const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = modules;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new this.three!.Vector2(w, h), 0.8, 0.4, 0.15);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return {
      render: () => composer.render(),
      setSize: (nw, nh) => composer.setSize(nw, nh),
      dispose: () => bloom.dispose(),
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

  private spawn(three: typeof THREE, prograde: boolean) {
    const sign: 1 | -1 = prograde ? 1 : -1;
    const bc = kerrCriticalImpactParameter(this.a, 1, sign);
    const b = bc * this.bScale * (0.75 + Math.random() * 0.5);
    const r0 = 90;
    const phi0 = Math.PI - Math.asin(Math.min(1, Math.abs(b) / r0));
    const u0 = Math.sin(phi0) / Math.abs(b);
    const du0 = Math.cos(phi0) / Math.abs(b);

    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    geo.setDrawRange(0, 0);
    const color = prograde ? 0x5cd6e8 : 0xf0b35c;
    const mat = new three.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const line = new three.Line(geo, mat);
    this.scene!.add(line);

    this.photons.push({ u: u0, du: du0, phi: phi0, b, prograde, dead: false, captured: false, trail: [], line, geo });
  }

  update(dt: number, p: SimParams) {
    this.a = Math.min(A_MAX, Number(p.spin));
    this.bScale = Number(p.impact);
    this.t += dt;
    this.spawnAcc += dt;
    if (this.spawnAcc > 0.15 && this.photons.length < MAX_PHOTONS && this.three) {
      this.spawnAcc = 0;
      this.spawn(this.three, Math.random() < 0.5);
    }

    const rPlus = kerrHorizonRadius(this.a, 1);
    const dphiMag = 0.02;
    for (const ph of this.photons) {
      if (ph.dead) {
        if (ph.trail.length > 0) ph.trail.shift();
        continue;
      }
      const signedStep = ph.prograde ? dphiMag : -dphiMag;
      const steps = Math.round(dt * 220);
      for (let s = 0; s < steps; s++) {
        const next = stepKerrEquatorialGeodesic(ph.u, ph.du, signedStep, this.a, ph.b, 1);
        ph.u = next.u;
        ph.du = next.du;
        ph.phi += signedStep;
        if (ph.u > 1 / (rPlus * 1.01)) {
          ph.dead = true;
          ph.captured = true;
          this.captured++;
          break;
        }
        if (ph.u <= 1 / 95) {
          ph.dead = true;
          this.escaped++;
          break;
        }
      }
      const r = 1 / ph.u;
      const cr = r * Math.cos(ph.phi);
      const sr = r * Math.sin(ph.phi);
      ph.trail.push({ x: cr * SCALE, y: 0, z: sr * SCALE });
      if (ph.trail.length > MAX_TRAIL) ph.trail.shift();
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

    const rErgoEq = kerrErgosphereEquatorRadius(1);
    const rOuter = rErgoEq + 5;
    for (const d of this.diskBase) {
      if (d.r === 0) d.r = rErgoEq + Math.random() * (rOuter - rErgoEq);
    }
  }

  syncScene() {
    if (this.horizonMesh) {
      const rPlus = kerrHorizonRadius(this.a, 1) * SCALE;
      this.horizonMesh.scale.set(rPlus, rPlus, rPlus);
    }
    if (this.ergoMesh && this.three) {
      const posAttr = (this.ergoMesh.geometry as THREE.SphereGeometry).attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        const x0 = posAttr.getX(i), y0 = posAttr.getY(i), z0 = posAttr.getZ(i);
        const len = Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0) || 1;
        const theta = Math.acos(Math.max(-1, Math.min(1, y0 / len)));
        const rErgo = ergosphereRadiusAtTheta(theta, this.a, 1) * SCALE;
        posAttr.setXYZ(i, (x0 / len) * rErgo, (y0 / len) * rErgo, (z0 / len) * rErgo);
      }
      posAttr.needsUpdate = true;
      (this.ergoMesh.geometry as THREE.SphereGeometry).computeVertexNormals();
    }
    if (this.proRing) {
      const rPro = kerrPhotonOrbitRadius(this.a, 1, 1) * SCALE;
      this.proRing.scale.set(rPro, rPro, 1);
    }
    if (this.retroRing) {
      const rRetro = kerrPhotonOrbitRadius(this.a, 1, -1) * SCALE;
      this.retroRing.scale.set(rRetro, rRetro, 1);
    }

    for (const ph of this.photons) {
      const posAttr = ph.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < ph.trail.length; i++) {
        posAttr.setXYZ(i, ph.trail[i].x, ph.trail[i].y, ph.trail[i].z);
      }
      posAttr.needsUpdate = true;
      ph.geo.setDrawRange(0, ph.trail.length);
      (ph.line.material as THREE.LineBasicMaterial).color.setHex(ph.captured ? 0xf47c7c : ph.prograde ? 0x5cd6e8 : 0xf0b35c);
    }

    if (this.diskGeo) {
      const posAttr = this.diskGeo.attributes.position as THREE.BufferAttribute;
      const colAttr = this.diskGeo.attributes.color as THREE.BufferAttribute;
      const rErgoEq = kerrErgosphereEquatorRadius(1);
      const rOuter = rErgoEq + 5;
      for (let i = 0; i < DISK_PARTICLES; i++) {
        const base = this.diskBase[i];
        if (base.r === 0) continue;
        const rot = base.a0 + this.t * (10 / base.r);
        posAttr.setXYZ(i, base.r * Math.cos(rot) * SCALE, base.y0, base.r * Math.sin(rot) * SCALE);
        const tGrad = 1 - (base.r - rErgoEq) / (rOuter - rErgoEq);
        const boost = 1 + 0.55 * Math.sin(rot);
        const bright = Math.max(0.05, Math.min(1, 0.28 + 0.5 * tGrad * boost));
        colAttr.setXYZ(i, bright, 0.5 * bright + 0.18, 0.28 * bright);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  }

  getStats() {
    return {
      captured: this.captured,
      escaped: this.escaped,
      rPlus: kerrHorizonRadius(this.a, 1),
      rPro: kerrPhotonOrbitRadius(this.a, 1, 1),
      rRetro: kerrPhotonOrbitRadius(this.a, 1, -1),
    };
  }

  dispose() {
    for (const ph of this.photons) {
      ph.geo.dispose();
      (ph.line.material as THREE.Material).dispose();
    }
    this.photons = [];
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

export const einsteinKerr3D: ExperimentDef = {
  id: 'kerr-3d',
  name: 'Wirująca czarna dziura Kerra 3D',
  honesty: 'simplified',
  honestyNote:
    'Fotony w płaszczyźnie równikowej (θ=π/2, stała Cartera Q=0): DOKŁADNE równania geodezyjnej Kerra (Boyer–Lindquist, Carter 1968), przekształcone do postaci Bineta i całkowane RK4 (core/physics.ts: stepKerrEquatorialGeodesic, 20 testów fizycznych, w tym zgodność z geodezyjną Schwarzschilda przy spinie zerowym co do 13 cyfry). Promień horyzontu (M+√(M²−a²)) i ergosfery (M+√(M²−a²cos²θ)) to dokładne wzory. Promienie orbit fotonowych prograde/retrograde (r̂=2M[1+cos((2/3)arccos(∓a/M))]) odtwarzają znane granice ekstremalne (M i 4M) — Bardeen 1972, Teo 2003. NIEDOKŁADNE celowo: geodezyjne POZA równikiem (precesja, wymaga stałej Cartera Q≠0 — osobne, znacznie trudniejsze zagadnienie), dysk akrecyjny (poglądowy, prawdziwe ISCO Kerra zależne od spinu i kierunku to osobne obliczenie, celowo pominięte), bloom (postprocessing WebGL, nie fotorealizm filmowy).',
  params: [
    {
      key: 'spin', label: 'Spin a/M (efekt wleczenia układów inercjalnych)', type: 'slider',
      min: 0, max: A_MAX, step: 0.01, default: 0.7,
      format: (v) => `${v.toFixed(2)}`,
    },
    {
      key: 'impact', label: 'Parametr zderzenia b / b_krytyczne', type: 'slider',
      min: 0.5, max: 2.2, step: 0.05, default: 1.15,
      format: (v) => `${v.toFixed(2)}×`,
    },
  ],
  createSim3D: () => new Kerr3DSim(),
  narrate(p, stats) {
    const a = Math.min(A_MAX, Number(p.spin));
    const cap = Number(stats.captured ?? 0);
    const esc = Number(stats.escaped ?? 0);
    const rPro = Number(stats.rPro ?? kerrPhotonOrbitRadius(a, 1, 1));
    const rRetro = Number(stats.rRetro ?? kerrPhotonOrbitRadius(a, 1, -1));
    const rPlus = Number(stats.rPlus ?? kerrHorizonRadius(a, 1));
    return [
      {
        title: `Wleczenie układów inercjalnych: r_prograde=${rPro.toFixed(2)}M, r_retrograde=${rRetro.toFixed(2)}M`,
        body:
          a < 0.05
            ? `Przy zerowym spinie obie orbity fotonowe (turkusowa i pomarańczowa) zbiegają się do jednego promienia 3M — to zwykła, nierotująca czarna dziura Schwarzschilda. Zwiększ spin, żeby zobaczyć, jak rotacja "ciągnie" przestrzeń za sobą.`
            : `Rotująca masa ciągnie za sobą czasoprzestrzeń (frame-dragging, zmierzone przez sondę Gravity Probe B, 2011). Efekt: foton lecący ZGODNIE ze spinem (turkusowy) może krążyć znacznie bliżej horyzontu (${rPro.toFixed(2)}M) niż foton lecący POD PRĄD (pomarańczowy, ${rRetro.toFixed(2)}M) — asymetria, której nie ma w statycznej czarnej dziurze Schwarzschilda (tam obie=3M). Dotąd: ${cap} pochłoniętych, ${esc} uciekło.`,
        citation: {
          source: 'Carter 1968; Bardeen 1972; Gravity Probe B (Everitt et al. 2011, PRL)',
          confirmation: 'confirmed',
          note: 'Frame-dragging zmierzony bezpośrednio przez Gravity Probe B; wzory orbit fotonowych — standardowy wynik Bardeena dla metryki Kerra',
        },
      },
      {
        title: `Horyzont kurczy się ze spinem: r+=${rPlus.toFixed(2)}M`,
        body: `Promień horyzontu zdarzeń Kerra r+=M+√(M²−a²) maleje z ${(2).toFixed(0)}M (bez spinu) do M (spin ekstremalny, a→M) — mniej niż połowa. Fioletowa siatka to ergosfera (M+√(M²−a²cos²θ)): obszar MIĘDZY horyzontem a ergosferą, gdzie NIC — nawet światło — nie może stać w miejscu, bo samo obracanie się czasoprzestrzeni przekracza prędkość światła. To właśnie z ergosfery (nie zza horyzontu) można w zasadzie wydobyć energię obrotu czarnej dziury (proces Penrose'a, 1969).`,
      },
    ];
  },
};
