import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { SCHWARZSCHILD_CRITICAL_IMPACT, stepSchwarzschildGeodesic } from '../../core/physics';

/**
 * Czarna dziura Schwarzschilda w 3D — druga warstwa renderująca dla
 * DOKŁADNIE tej samej fizyki co einstein-geodesics.ts (2D): równanie
 * geodezyjnej zerowej d²u/dφ² = −u + 1,5 r_s u², całkowane RK4
 * (core/physics.ts: stepSchwarzschildGeodesic — jedno miejsce prawdy,
 * współdzielone z wersją 2D). Rozszerzenie na 3D jest fizycznie ścisłe,
 * nie nowym przybliżeniem: geodezyjna fotonu wokół masy sferycznie
 * symetrycznej leży w JEDNEJ płaszczyźnie przechodzącej przez środek —
 * ta sama równanie u(φ) obowiązuje w KAŻDEJ takiej płaszczyźnie, więc
 * losujemy orientację płaszczyzny per foton i mapujemy (r,φ) do 3D przez
 * jej bazę ortonormalną.
 *
 * Dysk akrecyjny: jak w wersji 2D — POGLĄDOWY (jasność strony zbliżającej
 * się ilustruje wzmocnienie relatywistyczne, nie jest precyzyjnym modelem
 * transferu promieniowania). Bloom (UnrealBloomPass) jest prawdziwą
 * techniką postprocessingu, nie ozdobą: bez niego różnica jasności między
 * horyzontem (czarny) a dyskiem (rozgrzana plazma) ginie na małym ekranie.
 */

const RS = 1; // promień Schwarzschilda w jednostkach sceny
const MAX_TRAIL = 90;
const MAX_PHOTONS = 34;
const DISK_PARTICLES = 700;
const ISCO = 3 * RS;
const DISK_OUTER = 7 * RS;

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
  r: number;
  a0: number;
  y0: number;
}

function randomPlaneBasis(three: typeof THREE): [THREE.Vector3, THREE.Vector3] {
  const v1 = new three.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const raw = new three.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
  const v2 = raw.sub(v1.clone().multiplyScalar(raw.dot(v1))).normalize();
  return [v1, v2];
}

class BlackHole3DSim implements Sim3D {
  private t = 0;
  private spawnAcc = 0;
  private captured = 0;
  private escaped = 0;
  private bScale = 1.1;
  private photons: Photon3D[] = [];
  private three?: typeof THREE;
  private scene?: THREE.Scene;
  private diskGeo?: THREE.BufferGeometry;
  private diskBase: DiskParticle[] = [];
  private disposables: { dispose(): void }[] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.scene = scene;

    scene.add(new three.AmbientLight(0x223344, 0.6));

    const horizonGeo = new three.SphereGeometry(RS, 32, 32);
    const horizonMat = new three.MeshBasicMaterial({ color: 0x000000 });
    scene.add(new three.Mesh(horizonGeo, horizonMat));
    this.disposables.push(horizonGeo, horizonMat);

    // Sfera fotonowa (1,5 r_s) — trzy pierścienie ortogonalne poglądowo
    // sugerują pełną powłokę sferyczną bez kosztu prawdziwej siatki sfery.
    for (const rot of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]] as const) {
      const ringGeo = new three.TorusGeometry(1.5 * RS, 0.006, 8, 64);
      const ringMat = new three.MeshBasicMaterial({ color: 0xf0b35c, transparent: true, opacity: 0.3 });
      const ring = new three.Mesh(ringGeo, ringMat);
      ring.rotation.set(rot[0], rot[1], rot[2]);
      scene.add(ring);
      this.disposables.push(ringGeo, ringMat);
    }

    const diskPos = new Float32Array(DISK_PARTICLES * 3);
    const diskCol = new Float32Array(DISK_PARTICLES * 3);
    this.diskBase = Array.from({ length: DISK_PARTICLES }, () => ({
      r: ISCO + Math.random() * (DISK_OUTER - ISCO),
      a0: Math.random() * Math.PI * 2,
      y0: (Math.random() - 0.5) * 0.06,
    }));
    this.diskGeo = new three.BufferGeometry();
    this.diskGeo.setAttribute('position', new three.BufferAttribute(diskPos, 3));
    this.diskGeo.setAttribute('color', new three.BufferAttribute(diskCol, 3));
    const diskMat = new three.PointsMaterial({
      size: 0.05, vertexColors: true, transparent: true, opacity: 0.9,
      blending: three.AdditiveBlending, depthWrite: false,
    });
    scene.add(new three.Points(this.diskGeo, diskMat));
    this.disposables.push(this.diskGeo, diskMat);

    camera.position.set(RS * 13, RS * 7.5, RS * 17);
    camera.lookAt(0, 0, 0);
  }

  setupPostProcessing(modules: PostProcessingModules, renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): PostProcessor {
    const { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = modules;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new this.three!.Vector2(w, h), 0.85, 0.4, 0.15);
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

  private spawn(three: typeof THREE) {
    const bc = SCHWARZSCHILD_CRITICAL_IMPACT * RS;
    const b = bc * this.bScale * (0.75 + Math.random() * 0.5);
    const r0 = RS * 40;
    const phi0 = Math.PI - Math.asin(Math.min(1, b / r0));
    const u0 = Math.sin(phi0) / b;
    const du0 = Math.cos(phi0) / b;
    const [e1v, e2v] = randomPlaneBasis(three);

    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    geo.setDrawRange(0, 0);
    const mat = new three.LineBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.75 });
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
    this.t += dt;
    this.spawnAcc += dt;
    if (this.spawnAcc > 0.15 && this.photons.length < MAX_PHOTONS && this.three) {
      this.spawnAcc = 0;
      this.spawn(this.three);
    }

    const dphi = 0.02;
    for (const ph of this.photons) {
      if (ph.dead) {
        if (ph.trail.length > 0) ph.trail.shift();
        continue;
      }
      const steps = Math.round(dt * 220);
      for (let s = 0; s < steps; s++) {
        // Foton leci w stronę malejącego φ — patrz komentarz w
        // einstein-geodesics.ts (ten sam fizyczny powód, ta sama funkcja).
        const next = stepSchwarzschildGeodesic(ph.u, ph.du, -dphi, RS);
        ph.u = next.u;
        ph.du = next.du;
        ph.phi -= dphi;
        if (ph.u > 1 / (RS * 1.01)) {
          ph.dead = true;
          ph.captured = true;
          this.captured++;
          break;
        }
        if (ph.u <= 1 / (RS * 44)) {
          ph.dead = true;
          this.escaped++;
          break;
        }
      }
      const r = 1 / ph.u;
      const cr = r * Math.cos(ph.phi);
      const sr = r * Math.sin(ph.phi);
      ph.trail.push({
        x: ph.e1[0] * cr + ph.e2[0] * sr,
        y: ph.e1[1] * cr + ph.e2[1] * sr,
        z: ph.e1[2] * cr + ph.e2[2] * sr,
      });
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
  }

  syncScene() {
    for (const ph of this.photons) {
      const posAttr = ph.geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < ph.trail.length; i++) {
        posAttr.setXYZ(i, ph.trail[i].x, ph.trail[i].y, ph.trail[i].z);
      }
      posAttr.needsUpdate = true;
      ph.geo.setDrawRange(0, ph.trail.length);
      (ph.line.material as THREE.LineBasicMaterial).color.setHex(ph.captured ? 0xf47c7c : 0x5cd6e8);
    }

    if (this.diskGeo) {
      const posAttr = this.diskGeo.attributes.position as THREE.BufferAttribute;
      const colAttr = this.diskGeo.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < DISK_PARTICLES; i++) {
        const base = this.diskBase[i];
        const rot = base.a0 + this.t * (0.7 / base.r);
        posAttr.setXYZ(i, base.r * Math.cos(rot), base.y0, base.r * Math.sin(rot));
        const tGrad = 1 - (base.r - ISCO) / (DISK_OUTER - ISCO);
        const boost = 1 + 0.55 * Math.sin(rot);
        const bright = Math.max(0.05, Math.min(1, 0.28 + 0.5 * tGrad * boost));
        colAttr.setXYZ(i, bright, 0.55 * bright + 0.15, 0.22 * bright);
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  }

  getStats() {
    return { captured: this.captured, escaped: this.escaped };
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

export const einsteinBlackHole3D: ExperimentDef = {
  id: 'blackhole-3d',
  name: 'Czarna dziura 3D',
  honesty: 'exact',
  honestyNote:
    'Ta sama fizyka co „Geodezyjne + dysk" (dokładne równanie geodezyjnej zerowej Schwarzschilda d²u/dφ² = −u + 1,5 r_s u², RK4) rozszerzona do 3D: każdy foton porusza się w losowo zorientowanej płaszczyźnie przez środek (dokładne — geodezyjne wokół masy sferycznie symetrycznej ZAWSZE leżą w jednej płaszczyźnie). Dysk akrecyjny jest poglądowy (jasność strony zbliżającej się ilustruje wzmocnienie Dopplera, nie jest precyzyjnym transferem promieniowania). Bloom (poświata) to prawdziwy efekt postprocessingu (UnrealBloomPass), nie fotorealizm filmowy — WebGL w przeglądarce nie osiąga jakości renderingu offline z produkcji filmowej.',
  params: [
    {
      key: 'impact', label: 'Parametr zderzenia b / b_krytyczne', type: 'slider',
      min: 0.5, max: 2.2, step: 0.05, default: 1.1,
      format: (v) => `${v.toFixed(2)}×`,
    },
  ],
  createSim3D: () => new BlackHole3DSim(),
  narrate(p, stats) {
    const bScale = Number(p.impact);
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
        title: 'Dlaczego świeci (bloom)',
        body: 'Materia spiralująca ku ISCO (3 r_s) rozgrzewa się tarciem do milionów kelwinów — najjaśniejsze stałe źródła światła we Wszechświecie (kwazary). Poświata w tej scenie to prawdziwy efekt post-processingu (rozmycie jasnych pikseli), który przybliża tę różnicę skali jasności na małym ekranie — nie jest to jednak fotorealistyczny rendering filmowy.',
      },
    ];
  },
};
