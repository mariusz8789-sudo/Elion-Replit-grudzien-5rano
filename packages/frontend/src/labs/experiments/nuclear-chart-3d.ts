import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { semfBindingPerNucleon } from '../../core/physics';
import { KNOWN_NUCLIDES } from '../../data/nuclides';
import { colorForMode, MAGIC, NMAX, ZMAX } from './nuclear-chart';
import { detectRenderTier, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * "Dolina stabilności" jako prawdziwy krajobraz 3D — dokładnie ten sam
 * model SEMF (Weizsäcker), co w płaskiej mapie nuklidów (nuclear-chart.ts),
 * tylko wysokość powierzchni w każdym punkcie (Z,N) to energia wiązania na
 * nukleon zamiast koloru piksela. To dokładnie ta sama liczba, inna
 * projekcja — "dolina" nie jest metaforą narysowaną ręcznie, to dosłowny
 * kształt funkcji semfBindingPerNucleon(z,n) wyniesiony w oś Y. Realne,
 * zmierzone izotopy (NNDC) są naniesione jako kolorowe punkty NA
 * powierzchni, w tej samej pozycji (Z,N,B/A) co model przewiduje dla nich —
 * widać więc bezpośrednio, jak blisko/daleko od modelu SEMF leżą prawdziwe
 * dane (SEMF pomija efekty powłokowe, patrz honestyNote).
 */

const GRID_N = 130; // rozdzielczość siatki wzdłuż N
const GRID_Z = 90; // rozdzielczość siatki wzdłuż Z
const HEIGHT_SCALE = 2.6; // jednostki sceny na MeV/nukleon
const XZ_SCALE_N = 9.5; // jednostki sceny na pełny zakres N
const XZ_SCALE_Z = 7.2; // jednostki sceny na pełny zakres Z
const INTRO_DURATION = 1.0;

function heightAt(z: number, n: number): number {
  if (z < 1 || n < 0) return 0;
  return semfBindingPerNucleon(z, n);
}

class BindingSurface3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.15;

  private three!: typeof THREE;
  private disposables: { dispose(): void }[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.introElapsed = getSettings().reducedMotion ? INTRO_DURATION : 0;
    scene.background = new three.Color(0x02030a);

    const geo = new three.PlaneGeometry(XZ_SCALE_N, XZ_SCALE_Z, GRID_N - 1, GRID_Z - 1);
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    let maxH = 0;
    for (let i = 0; i < posAttr.count; i++) {
      const localX = posAttr.getX(i); // -XZ_SCALE_N/2 .. XZ_SCALE_N/2 -> N
      const localZ = posAttr.getZ(i); // -XZ_SCALE_Z/2 .. XZ_SCALE_Z/2 -> Z
      const n = ((localX / XZ_SCALE_N) + 0.5) * NMAX;
      const z = ((localZ / XZ_SCALE_Z) + 0.5) * ZMAX;
      const bpa = heightAt(Math.round(z), Math.round(n));
      const h = bpa * HEIGHT_SCALE * 0.1;
      posAttr.setY(i, h);
      if (h > maxH) maxH = h;
      const v = Math.max(0, Math.min(1, bpa / 8.8));
      colors[i * 3] = 0.08 + v * 0.24;
      colors[i * 3 + 1] = 0.1 + v * 0.75;
      colors[i * 3 + 2] = 0.18 + v * 0.6;
    }
    geo.setAttribute('color', new three.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new three.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: three.DoubleSide });
    const mesh = new three.Mesh(geo, mat);
    scene.add(mesh);
    this.disposables.push(geo, mat);

    scene.add(new three.AmbientLight(0x445066, 1.2));
    const light = new three.DirectionalLight(0xffffff, 1.1);
    light.position.set(4, 6, 3);
    scene.add(light);

    // Liczby magiczne jako cienkie linie prowadzące na powierzchni.
    const magicMat = new three.LineBasicMaterial({ color: 0xe6eaf5, transparent: true, opacity: 0.22 });
    this.disposables.push(magicMat);
    for (const m of MAGIC) {
      if (m <= NMAX) {
        const x = (m / NMAX - 0.5) * XZ_SCALE_N;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < GRID_Z; i++) {
          const z = (i / (GRID_Z - 1)) * ZMAX;
          const zLocal = (z / ZMAX - 0.5) * XZ_SCALE_Z;
          const h = heightAt(Math.round(z), m) * HEIGHT_SCALE * 0.1 + 0.02;
          pts.push(new three.Vector3(x, h, zLocal));
        }
        const lineGeo = new three.BufferGeometry().setFromPoints(pts);
        const line = new three.Line(lineGeo, magicMat);
        scene.add(line);
        this.disposables.push(lineGeo);
      }
    }

    // Realne, zmierzone izotopy jako punkty na powierzchni.
    const dotGeo = new three.SphereGeometry(0.045, 8, 8);
    this.disposables.push(dotGeo);
    for (const k of KNOWN_NUCLIDES) {
      const x = (k.n / NMAX - 0.5) * XZ_SCALE_N;
      const zLocal = (k.z / ZMAX - 0.5) * XZ_SCALE_Z;
      const h = heightAt(k.z, k.n) * HEIGHT_SCALE * 0.1 + 0.03;
      const dotMat = new three.MeshBasicMaterial({ color: colorForMode(k.decayMode) });
      const dot = new three.Mesh(dotGeo, dotMat);
      dot.position.set(x, h, zLocal);
      scene.add(dot);
      this.disposables.push(dotMat);
    }

    camera.position.set(XZ_SCALE_N * 0.55, maxH + XZ_SCALE_Z * 0.65, XZ_SCALE_Z * 0.95);
    camera.lookAt(0, maxH * 0.3, 0);
  }

  update(dt: number, _p: SimParams) {
    if (!getSettings().reducedMotion) this.introElapsed = Math.min(INTRO_DURATION, this.introElapsed + dt);
  }

  syncScene() {
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
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.35, 0.5, 0.75));
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
    return {};
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

export const nuclearChart3D: ExperimentDef = {
  id: 'chart-3d',
  name: 'Dolina stabilności (3D)',
  honesty: 'simplified',
  honestyNote:
    'Wysokość powierzchni to DOKŁADNIE ta sama wielkość co kolor na płaskiej mapie nuklidów: energia wiązania na nukleon z półempirycznego wzoru SEMF (Weizsäcker) — model, nie pomiar (pomija efekty powłokowe, dlatego prawdziwe maksimum leży przy Ni-62/Fe-58, nie dokładnie tam, gdzie przewiduje SEMF). Kolorowe kropki na powierzchni to ~55 realnych, zmierzonych izotopów (NNDC) — model i dane zmierzone są tu celowo odróżnione, tak jak na płaskiej wersji. Linie prowadzące oznaczają liczby magiczne (2,8,20,28,50,82,126), których SEMF NIE przewiduje (efekt powłokowy — Maria Goeppert-Mayer, Nobel 1963).',
  params: [],
  createSim3D: () => new BindingSurface3DSim(),
  narrate() {
    return [
      {
        title: 'Dolina stabilności to dosłowna dolina',
        body: 'Wysokość terenu w każdym punkcie (Z,N) to energia wiązania na nukleon — grzbiet biegnący przez środek mapy to jądra najmocniej związane. Poza grzbietem teren opada coraz gwałtowniej, aż znika przy liniach kroplenia (drip lines), gdzie dodatkowy nukleon w ogóle się nie wiąże. Rozszczepienie (ciężkie jądra, A>~56) i fuzja (lekkie jądra, A<~56) uwalniają energię, bo OBA kierunki od skrajów prowadzą w górę grzbietu.',
      },
      {
        title: 'Kolorowe punkty to prawdziwe dane, nie model',
        body: 'Każda kropka to zmierzony, skatalogowany izotop (NNDC) naniesiony na przewidywaną przez SEMF wysokość. Tam, gdzie kropki leżą wyraźnie NAD powierzchnią modelu, widać bezpośrednio efekt powłokowy — szczególnie blisko liczb magicznych (linie prowadzące) — którego gładki wzór SEMF nie potrafi przewidzieć.',
      },
    ];
  },
};
