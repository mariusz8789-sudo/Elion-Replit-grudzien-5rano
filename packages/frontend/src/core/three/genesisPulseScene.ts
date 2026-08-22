import type * as THREE from 'three';
import type { SimParams } from '../types';
import type { PostProcessingModules, PostProcessor, Sim3D } from './types';
import { createStarfield, makeSoftDotTexture, type Starfield } from './starfield';
import { detectRenderTier, scaleCount, tierAllowsBloom, tierDpr } from './quality';

/**
 * GENESIS FIELD — przestrzenne środowisko Command Center.
 *
 * To NIE drugi silnik: scena implementuje ten sam kontrakt `Sim3D` i jest
 * montowana przez ten sam `useThreeLoop`, co `epidemicCity3D`, Einstein i
 * Universe Lab. Reużywa wspólne prymitywy (`createStarfield`,
 * `makeSoftDotTexture`, tiering jakości, `setupPostProcessing`/UnrealBloomPass).
 *
 * Scena jest DANE-STEROWANA: każdy węzeł konstelacji to realne laboratorium z
 * `core/registry.ts` — jego kolor to prawdziwy `lab.accent`, a nie ozdoba.
 * Głębia (mgła + siatka gruntu + pole cząstek + bloom) istnieje po to, żeby
 * przestrzeń miała skalę, a nie żeby „ładnie migało".
 */

/** Deterministyczny rozkład phyllotaxis w pierścieniu — równomierny, bez losowości. Czysty: testowalny bez WebGL. */
export function labNodeLayout(
  count: number,
  innerRadius = 5.5,
  outerRadius = 20,
): Array<{ x: number; y: number; z: number }> {
  if (count <= 0) return [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0 : i / (count - 1);
    const radius = innerRadius + (outerRadius - innerRadius) * Math.sqrt(frac);
    const theta = i * goldenAngle;
    out.push({
      x: Math.cos(theta) * radius,
      y: Math.sin(i * 1.7) * 1.5 + Math.cos(i * 0.9) * 0.8,
      z: Math.sin(theta) * radius,
    });
  }
  return out;
}

/** Domyślna paleta, gdy rejestr nie poda koloru akcentu laboratorium. */
const FALLBACK_PALETTE = ['#5cd6e8', '#a78bfa', '#f0b35c', '#6ee7a0'];

export interface GenesisFieldNode {
  /** Realny identyfikator laboratorium (do przyszłego hit-testu / nawigacji). */
  id: string;
  /** Realny `lab.accent` z rejestru. */
  accent: string;
}

export interface GenesisPulseOptions {
  /** Realne laboratoria z rejestru — sterują liczbą i kolorami węzłów. */
  nodes: readonly GenesisFieldNode[];
}

const GROUND_Y = -6.5;

export class GenesisPulseSim implements Sim3D {
  readonly cameraAutoRotateSpeed = 0.32;
  private readonly nodeSpecs: readonly GenesisFieldNode[];
  private t = 0;
  private three: typeof THREE | undefined;
  private root: THREE.Group | undefined;
  private constellation: THREE.Group | undefined;
  private nodes: THREE.Mesh[] = [];
  private halos: THREE.Sprite[] = [];
  private links: THREE.LineSegments | undefined;
  private grid: THREE.LineSegments | undefined;
  private motes: THREE.Points | undefined;
  private moteVelocity: Float32Array | undefined;
  private core: THREE.Mesh | undefined;
  private coreRings: THREE.Mesh[] = [];
  private beam: THREE.Mesh | undefined;
  private starfield: Starfield | undefined;
  private haloTexture: THREE.Texture | undefined;
  private disposables: Array<{ dispose(): void }> = [];

  constructor(options: GenesisPulseOptions) {
    this.nodeSpecs = options.nodes.length > 0
      ? options.nodes
      : FALLBACK_PALETTE.map((accent, i) => ({ id: `node-${i}`, accent }));
  }

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.three = three;
    const tier = detectRenderTier();

    // Kamera prawie na poziomie konstelacji — dzięki temu siatka gruntu ucieka
    // ku horyzontowi i przestrzeń dostaje skalę (zamiast widoku „z góry na kulę").
    scene.fog = new three.FogExp2(0x04050c, 0.0135);
    camera.position.set(0, 2.6, 33);
    camera.lookAt(0, 0.5, 0);

    this.root = new three.Group();
    scene.add(this.root);

    // Odległe pole gwiazd — ta sama funkcja co Einstein/Universe Lab.
    this.starfield = createStarfield(three, tier, 1500, [90, 240]);
    this.root.add(this.starfield.points);

    this.buildGround(three, tier);
    this.buildCore(three);
    this.buildConstellation(three);
    this.buildMotes(three, tier);
  }

  /** Siatka gruntu — daje przestrzeni skalę i horyzont; gaśnie we mgle. */
  private buildGround(three: typeof THREE, tier: ReturnType<typeof detectRenderTier>): void {
    const half = 90;
    const step = tier === 'low' ? 9 : 6;
    const pts: number[] = [];
    for (let v = -half; v <= half; v += step) {
      pts.push(-half, GROUND_Y, v, half, GROUND_Y, v);
      pts.push(v, GROUND_Y, -half, v, GROUND_Y, half);
    }
    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.BufferAttribute(new Float32Array(pts), 3));
    const mat = new three.LineBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.14 });
    this.grid = new three.LineSegments(geo, mat);
    this.root!.add(this.grid);
    this.disposables.push(geo, mat);
  }

  /** Rdzeń Genesis: wewnętrzna bryła + współosiowe pierścienie + pionowa kolumna światła. */
  private buildCore(three: typeof THREE): void {
    const coreGeo = new three.IcosahedronGeometry(2.1, 1);
    const coreMat = new three.MeshBasicMaterial({ color: 0xdfe9ff, wireframe: true, transparent: true, opacity: 0.34 });
    this.core = new three.Mesh(coreGeo, coreMat);
    this.root!.add(this.core);
    this.disposables.push(coreGeo, coreMat);

    for (let i = 0; i < 3; i++) {
      const r = 3.4 + i * 1.7;
      const ringGeo = new three.TorusGeometry(r, 0.012, 8, 128);
      const ringMat = new three.MeshBasicMaterial({
        color: i === 0 ? 0x5cd6e8 : i === 1 ? 0xa78bfa : 0xf0b35c,
        transparent: true, opacity: 0.4 - i * 0.08,
      });
      const ring = new three.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.22;
      ring.rotation.z = i * 0.5;
      this.root!.add(ring);
      this.coreRings.push(ring);
      this.disposables.push(ringGeo, ringMat);
    }

    // Miękka poświata rdzenia rozlana po gruncie — zakotwicza konstelację nad
    // siatką bez twardej geometrii przecinającej kadr.
    const glowGeo = new three.CircleGeometry(26, 64);
    const glowMat = new three.MeshBasicMaterial({
      map: makeSoftDotTexture(three), color: 0x4fb8d8,
      transparent: true, opacity: 0.3, depthWrite: false,
    });
    this.beam = new three.Mesh(glowGeo, glowMat);
    this.beam.rotation.x = -Math.PI / 2;
    this.beam.position.y = GROUND_Y + 0.05;
    this.root!.add(this.beam);
    this.disposables.push(glowGeo, glowMat);
  }

  /** Konstelacja laboratoriów — jeden węzeł = jedno realne laboratorium (kolor = lab.accent). */
  private buildConstellation(three: typeof THREE): void {
    this.constellation = new three.Group();
    this.root!.add(this.constellation);

    const layout = labNodeLayout(this.nodeSpecs.length);
    this.haloTexture = makeSoftDotTexture(three);
    const linkPts: number[] = [];

    layout.forEach((p, i) => {
      const color = new three.Color(this.nodeSpecs[i]?.accent ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]);

      const geo = new three.SphereGeometry(0.3, 20, 20);
      const mat = new three.MeshBasicMaterial({ color });
      const mesh = new three.Mesh(geo, mat);
      mesh.position.set(p.x, p.y, p.z);
      this.constellation!.add(mesh);
      this.nodes.push(mesh);
      this.disposables.push(geo, mat);

      // Miękka poświata — sprite zawsze zwrócony do kamery (bloom ją podbija).
      const spriteMat = new three.SpriteMaterial({
        map: this.haloTexture!, color, transparent: true, opacity: 0.5, depthWrite: false,
      });
      const halo = new three.Sprite(spriteMat);
      halo.position.copy(mesh.position);
      halo.scale.setScalar(2.4);
      this.constellation!.add(halo);
      this.halos.push(halo);
      this.disposables.push(spriteMat);

      // Promień do rdzenia + spięcie z kolejnym węzłem (sieć, nie gwiazda).
      linkPts.push(0, 0, 0, p.x, p.y, p.z);
      const next = layout[(i + 1) % layout.length];
      linkPts.push(p.x, p.y, p.z, next.x, next.y, next.z);
    });

    const linkGeo = new three.BufferGeometry();
    linkGeo.setAttribute('position', new three.BufferAttribute(new Float32Array(linkPts), 3));
    const linkMat = new three.LineBasicMaterial({ color: 0x8fb4ff, transparent: true, opacity: 0.12 });
    this.links = new three.LineSegments(linkGeo, linkMat);
    this.constellation.add(this.links);
    this.disposables.push(linkGeo, linkMat);
  }

  /** Dryfujące drobiny — dają wrażenie objętości powietrza między kamerą a konstelacją. */
  private buildMotes(three: typeof THREE, tier: ReturnType<typeof detectRenderTier>): void {
    const count = scaleCount(420, tier);
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = GROUND_Y + Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70;
      vel[i] = 0.15 + Math.random() * 0.5;
    }
    const geo = new three.BufferGeometry();
    geo.setAttribute('position', new three.BufferAttribute(pos, 3));
    const mat = new three.PointsMaterial({
      color: 0xbcd4ff, size: 0.12, sizeAttenuation: true,
      transparent: true, opacity: 0.5, map: this.haloTexture, depthWrite: false,
    });
    this.motes = new three.Points(geo, mat);
    this.moteVelocity = vel;
    this.root!.add(this.motes);
    this.disposables.push(geo, mat);
  }

  update(dt: number, _params: SimParams): void {
    this.t += dt;
  }

  syncScene(): void {
    const t = this.t;
    if (this.constellation) this.constellation.rotation.y = t * 0.021;
    if (this.core) {
      this.core.rotation.x = t * 0.07;
      this.core.rotation.y = t * 0.11;
      this.core.scale.setScalar(1 + Math.sin(t * 1.1) * 0.035);
    }
    this.coreRings.forEach((ring, i) => {
      ring.rotation.z += (i % 2 === 0 ? 1 : -1) * 0.0016 * (i + 1);
    });
    if (this.beam) {
      (this.beam.material as THREE.Material).opacity = 0.26 + Math.sin(t * 0.55) * 0.06;
    }
    // Węzły oddychają w rozsuniętych fazach — ruch pochodzi z indeksu, nie z losowości.
    this.nodes.forEach((node, i) => {
      const pulse = 1 + Math.sin(t * 1.15 + i * 0.55) * 0.16;
      node.scale.setScalar(pulse);
      const halo = this.halos[i];
      if (halo) {
        halo.scale.setScalar(2.2 * pulse);
        (halo.material as THREE.SpriteMaterial).opacity = 0.34 + Math.sin(t * 1.15 + i * 0.55) * 0.16;
      }
    });
    // Drobiny unoszą się i zawijają — pętla, żeby pole nigdy się nie wyczerpało.
    if (this.motes && this.moteVelocity) {
      const attr = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < this.moteVelocity.length; i++) {
        arr[i * 3 + 1] += this.moteVelocity[i] * 0.016;
        if (arr[i * 3 + 1] > GROUND_Y + 26) arr[i * 3 + 1] = GROUND_Y;
      }
      attr.needsUpdate = true;
    }
  }

  /** Bloom — ten sam wspólny mechanizm post-processingu co inne sceny 3D Genesis. */
  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const composer = new modules.EffectComposer(renderer);
    composer.addPass(new modules.RenderPass(scene, camera));
    // Bloom tylko tam, gdzie urządzenie je udźwignie — ten sam próg co reszta scen 3D.
    if (this.three && tierAllowsBloom(detectRenderTier())) {
      composer.addPass(new modules.UnrealBloomPass(new this.three.Vector2(w, h), 0.62, 0.85, 0.2));
    }
    composer.addPass(new modules.OutputPass());
    return {
      render: () => composer.render(),
      setSize: (width, height) => composer.setSize(width, height),
      dispose: () => composer.dispose?.(),
    };
  }

  dispose(): void {
    this.starfield?.geometry.dispose();
    this.starfield?.material.dispose();
    this.starfield?.texture.dispose();
    this.haloTexture?.dispose();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.nodes = [];
    this.halos = [];
    this.coreRings = [];
  }
}

/** Jeden wspólny DPR helper (reużywany, gdyby powierzchnia chciała sama ograniczyć jakość). */
export function ambientDpr(): number {
  return tierDpr(detectRenderTier());
}
