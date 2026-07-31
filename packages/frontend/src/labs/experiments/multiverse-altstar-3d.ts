import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { createStarfield } from '../../core/three/starfield';
import { detectRenderTier, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Gwiazda hipotetycznego wszechświata jako prawdziwa scena 3D — te same
 * skalowania co w wersji 2D (multiverse.ts::AltStarSim), tylko gwiazda,
 * strefa ekosfery i orbita planety są bryłami w przestrzeni, nie płaskimi
 * kołami. Fizyka identyczna: promień gwiazdy ∝ G^-0,25 (poglądowo — gęstsza
 * grawitacja ściska gwiazdę), promień ekosfery ∝ √L ∝ G^0,4 (poglądowo),
 * niestabilność (miganie) przy sile silnej poza oknem ±~9%.
 */

function effectiveConstants(p: SimParams): { g: number; alpha: number; strong: number } {
  const preset = String(p.preset ?? 'custom');
  if (preset === 'carbonless') return { g: 1, alpha: 1, strong: 0.86 };
  if (preset === 'explosive') return { g: 1, alpha: 1, strong: 1.14 };
  if (preset === 'crushing') return { g: Math.pow(10, 0.7), alpha: 1, strong: 1 };
  return { g: Math.pow(10, Number(p.g)), alpha: Number(p.alpha), strong: Number(p.strong) };
}

class AltStar3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.15;

  private three!: typeof THREE;
  private disposables: { dispose(): void }[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private t = 0;
  private planetAng = 0;
  private g = 1;
  private alpha = 1;
  private strong = 1;

  private starMesh!: THREE.Mesh;
  private starMat!: THREE.MeshBasicMaterial;
  private glowMesh!: THREE.Mesh;
  private glowMat!: THREE.MeshBasicMaterial;
  private hzMesh!: THREE.Mesh;
  private hzMat!: THREE.MeshBasicMaterial;
  private orbitLine!: THREE.Line;
  private planetMesh!: THREE.Mesh;
  private planetMat!: THREE.MeshStandardMaterial;
  private planetGlow!: THREE.PointLight;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.introElapsed = getSettings().reducedMotion ? 1 : 0;
    scene.background = new three.Color(0x02030a);
    scene.add(new three.AmbientLight(0x445066, 0.9));

    const tier = detectRenderTier();
    const bgStars = createStarfield(three, tier, 350, [18, 44]);
    bgStars.material.size = 0.09;
    scene.add(bgStars.points);
    this.disposables.push(bgStars.geometry, bgStars.material, bgStars.texture);

    const starGeo = new three.SphereGeometry(1, 40, 28);
    this.starMat = new three.MeshBasicMaterial({ color: 0xfff2c0 });
    this.starMesh = new three.Mesh(starGeo, this.starMat);
    scene.add(this.starMesh);
    this.disposables.push(starGeo, this.starMat);

    const glowGeo = new three.SphereGeometry(1, 32, 24);
    this.glowMat = new three.MeshBasicMaterial({ color: 0xf0b35c, transparent: true, opacity: 0.16, side: three.BackSide });
    this.glowMesh = new three.Mesh(glowGeo, this.glowMat);
    scene.add(this.glowMesh);
    this.disposables.push(glowGeo, this.glowMat);

    const hzGeo = new three.TorusGeometry(1, 0.012, 12, 96);
    this.hzMat = new three.MeshBasicMaterial({ color: 0x6ee7a0, transparent: true, opacity: 0.55 });
    this.hzMesh = new three.Mesh(hzGeo, this.hzMat);
    this.hzMesh.rotation.x = Math.PI / 2;
    scene.add(this.hzMesh);
    this.disposables.push(hzGeo, this.hzMat);

    const orbitGeo = new three.BufferGeometry();
    const orbitPts = new Float32Array(97 * 3);
    orbitGeo.setAttribute('position', new three.BufferAttribute(orbitPts, 3));
    const orbitMat = new three.LineBasicMaterial({ color: 0x8d97b4, transparent: true, opacity: 0.35 });
    this.orbitLine = new three.Line(orbitGeo, orbitMat);
    scene.add(this.orbitLine);
    this.disposables.push(orbitGeo, orbitMat);

    const planetGeo = new three.SphereGeometry(0.05, 20, 16);
    this.planetMat = new three.MeshStandardMaterial({ color: 0x8d97b4, roughness: 0.7 });
    this.planetMesh = new three.Mesh(planetGeo, this.planetMat);
    scene.add(this.planetMesh);
    this.disposables.push(planetGeo, this.planetMat);
    this.planetGlow = new three.PointLight(0x5cd6e8, 0, 2.5);
    this.planetMesh.add(this.planetGlow);

    camera.position.set(2.6, 1.9, 3.0);
    camera.lookAt(0, 0, 0);
  }

  update(dt: number, p: SimParams) {
    const eff = effectiveConstants(p);
    this.g = eff.g;
    this.alpha = eff.alpha;
    this.strong = eff.strong;
    if (!getSettings().reducedMotion) {
      this.t += dt;
      this.introElapsed = Math.min(1, this.introElapsed + dt);
      this.planetAng += dt * 0.5 * Math.sqrt(this.g);
    }
  }

  syncScene() {
    const three = this.three;
    const g = this.g;
    const strong = this.strong;
    const starR = 0.62 / Math.pow(g, 0.25);
    const hot = Math.min(1, Math.max(0, (g - 1) * 0.5 + (strong - 1) * 2));
    const unstable = strong > 1.09 || strong < 0.91;
    const flicker = unstable ? 1 + Math.sin(this.t * 30) * 0.12 : 1;
    const hue = (45 - hot * 25) / 360;

    this.starMesh.scale.setScalar(starR * flicker);
    const starColor = unstable
      ? new three.Color(0xff8080)
      : new three.Color().setHSL(hue, 0.85, 0.6 + hot * 0.15);
    this.starMat.color.copy(starColor);
    this.glowMesh.scale.setScalar(starR * 2.1);
    this.glowMat.color.copy(unstable ? new three.Color(0xf47c7c) : starColor);

    const hz = 1.6 * Math.pow(g, 0.4);
    this.hzMesh.scale.setScalar(hz);

    const orbR = 1.6;
    const posAttr = this.orbitLine.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < 97; i++) {
      const a = (i / 96) * Math.PI * 2;
      posAttr.setXYZ(i, Math.cos(a) * orbR, 0, Math.sin(a) * orbR);
    }
    posAttr.needsUpdate = true;

    const px = Math.cos(this.planetAng) * orbR;
    const pz = Math.sin(this.planetAng) * orbR;
    this.planetMesh.position.set(px, 0, pz);
    const inHz = Math.abs(orbR - hz) < 0.18;
    this.planetMat.color.set(inHz ? 0x5cd6e8 : 0x8d97b4);
    // Odchylenie α od 1 sygnalizuje wątpliwą chemię (patrz narrate()) — fiolet, jak etykieta laboratorium.
    const alphaShift = Math.min(1, Math.max(0, Math.abs(this.alpha - 1) - 0.04) * 4);
    if (alphaShift > 0) this.planetMat.color.lerp(new three.Color(0xa78bfa), alphaShift);
    this.planetMat.emissive.set(inHz ? 0x1a4a52 : 0x000000);
    this.planetGlow.intensity = inHz ? 0.8 : 0;

    if (this.fadePass) {
      const ft = this.introElapsed;
      this.fadePass.uniforms.uFade.value = ft * ft * (3 - 2 * ft);
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
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.55, 0.6, 0.65));
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
    return { g: Math.round(this.g * 100) / 100, strong: Math.round(this.strong * 100) / 100 };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

export const multiverseAltStar3D: ExperimentDef = {
  id: 'altstar-3d',
  name: 'Gwiazda innego wszechświata (3D)',
  honesty: 'theoretical',
  honestyNote:
    'Te same skalowania rzędu wielkości co w wersji 2D (druga zakładka): promień gwiazdy ∝ G⁻⁰·²⁵ i promień ekosfery ∝ G⁰·⁴ są poglądowe, nie precyzyjnymi wzorami astrofizycznymi (kalibrowane wyłącznie tak, by ruch suwaka był widoczny i w dobrym kierunku). Migotanie gwiazdy przy sile silnej poza oknem ±~9% oznacza niestabilność syntezy jądrowej (diproton związany / deuter niezwiązany) — to jakościowo poprawne, ale animacja migotania jest ilustracją, nie symulacją plazmy. Cała reszta lasu — istnienie innych wszechświatów, multiwersum — pozostaje hipotezą bez potwierdzenia obserwacyjnego (patrz honestyNote laboratorium).',
  params: [
    {
      key: 'preset', label: 'Scenariusz', type: 'select', default: 'custom',
      options: [
        { value: 'custom', label: 'Własny' },
        { value: 'carbonless', label: 'Bez węgla' },
        { value: 'explosive', label: 'Wybuchowe gwiazdy' },
        { value: 'crushing', label: 'Ciężka grawitacja' },
      ],
    },
    {
      key: 'g', label: 'Grawitacja (×G)', type: 'slider', min: -1, max: 1, step: 0.05, default: 0,
      format: (v) => `${Math.pow(10, v).toFixed(2)}×`,
    },
    {
      key: 'alpha', label: 'Siła elektromagnetyczna (×α)', type: 'slider', min: 0.8, max: 1.2, step: 0.01, default: 1,
      format: (v) => `${v.toFixed(2)}×`,
    },
    {
      key: 'strong', label: 'Oddziaływanie silne', type: 'slider', min: 0.8, max: 1.2, step: 0.01, default: 1,
      format: (v) => `${v.toFixed(2)}×`,
    },
  ],
  createSim3D: () => new AltStar3DSim(),
  narrate(p) {
    const { g, strong } = effectiveConstants(p);
    const starLife = 10 / (g * g);
    const unstable = strong > 1.09 || strong < 0.91;
    return [
      {
        title: `Gwiazda: żyje ~${starLife < 0.01 ? starLife.toExponential(1) : starLife.toFixed(starLife < 1 ? 2 : 1)} mld lat`,
        kind: 'hypothesis' as const,
        body: `Promień gwiazdy i pierścień ekosfery są teraz bryłami w przestrzeni 3D, nie płaskimi kółkami — planeta (szara/cyjan kulka) faktycznie krąży w tej samej płaszczyźnie co pierścień ekosfery, więc widać bezpośrednio, kiedy orbita go przecina.`,
      },
      {
        title: unstable ? 'Migocząca, niestabilna gwiazda' : 'Stabilne, powolne spalanie',
        kind: 'hypothesis' as const,
        body: unstable
          ? `Przy sile silnej ${strong.toFixed(2)}× poza oknem ±~9% synteza jądrowa przestaje być powolna — migotanie gwiazdy to wizualny sygnał tej niestabilności.`
          : 'Siła silna w oknie życia: gwiazda świeci stabilnym, ciągłym blaskiem — dokładnie tak jak Słońce przez ostatnie 4,6 mld lat.',
      },
    ];
  },
};
