import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { createStarfield, makeSoftDotTexture } from '../../core/three/starfield';
import { detectRenderTier, scaleCount, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Skala Kardaszewa jako trzy dosłowne sceny 3D zamiast płaskich kółek z
 * kropkami (płaska wersja: civilization.ts, zachowana jako druga zakładka).
 * Fizyka identyczna jak w wersji 2D — ten sam wzór Sagana i te same progi
 * K=1/2/3 — zmienia się WYŁĄCZNIE reprezentacja przestrzenna:
 *
 * - Sieć energetyczna planety: rozkład węzłów metodą Fibonacciego na kuli
 *   (ten sam kąt złoty 2.39996 rad co w wersji 2D — tam użyty do rozkładu
 *   na płaszczyźnie, tu do prawdziwego, równomiernego rozkładu na
 *   powierzchni sfery — standardowa metoda Vogela/Fibonacciego).
 * - Rój Dysona jako PRAWDZIWA powłoka 3D (satelity na wielu inklinacjach
 *   orbitalnych, nie płaski pierścień) — to akurat czyni wizualizację
 *   NAUKOWO dokładniejszą niż płaska wersja: żaden realistyczny rój
 *   kolektorów wokół gwiazdy nie mógłby być płaskim pierścieniem (kolizje
 *   orbit), musiałby wypełniać powłokę pod wieloma kątami.
 * - Galaktyka jako dysk 3D o malejącej z promieniem grubości (rzeczywiste
 *   galaktyki dyskowe cieńczeją ku brzegom), zamiast płaskich punktów.
 *
 * Rozmiary trzech scen NIE są w prawdziwej skali względem siebie (galaktyka
 * jest ~10¹⁵× większa niż planeta) — podobnie jak w wersji 2D, gdzie każdy
 * etap dobierał promień do wypełnienia canvasu. To wybór czytelności, nie
 * twierdzenie o rozmiarach; liczby (moc w watach) podane są w panelu narracji.
 */

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const CAMERA_POS: [number, number, number] = [4.2, 2.6, 4.6];

function fibonacciSpherePoint(i: number, n: number): { x: number; y: number; z: number } {
  const yy = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
  const radiusAtY = Math.sqrt(Math.max(0, 1 - yy * yy));
  const theta = GOLDEN_ANGLE * i;
  return { x: Math.cos(theta) * radiusAtY, y: yy, z: Math.sin(theta) * radiusAtY };
}

class Kardashev3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.16;

  private three!: typeof THREE;
  private disposables: { dispose(): void }[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private t = 0;
  private K = 0.73;

  // Etap 1: planeta + sieć energetyczna.
  private planetGroup!: THREE.Group;
  private networkGeo!: THREE.BufferGeometry;
  private networkColors!: Float32Array;
  private networkMax = 0;

  // Etap 2: gwiazda + rój Dysona.
  private dysonGroup!: THREE.Group;
  private swarmGeo!: THREE.BufferGeometry;
  private swarmColors!: Float32Array;
  private swarmDirs: { x: number; y: number; z: number; r: number; speed: number }[] = [];
  private swarmMax = 0;

  // Etap 3: galaktyka.
  private galaxyGroup!: THREE.Group;
  private galaxyGeo!: THREE.BufferGeometry;
  private galaxyColors!: Float32Array;
  private galaxyBase: { ang: number; r: number; y0: number }[] = [];
  private galaxyMax = 0;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.introElapsed = getSettings().reducedMotion ? 1 : 0;
    scene.background = new three.Color(0x02030a);
    camera.position.set(...CAMERA_POS);
    camera.lookAt(0, 0, 0);
    scene.add(new three.AmbientLight(0x5a6fa0, 1.6));
    const key = new three.DirectionalLight(0xffffff, 1.3);
    key.position.set(3, 4, 2);
    scene.add(key);
    const fill = new three.DirectionalLight(0x88a6ff, 0.5);
    fill.position.set(-3, -1, -2);
    scene.add(fill);

    const tier = detectRenderTier();
    const tex = makeSoftDotTexture(three);
    this.disposables.push(tex);

    // Tło z rzadkim polem gwiazd — bez niego wszystkie trzy etapy toną w
    // czystej czerni, co (jak w płaskiej wersji) czyni je puste i nieczytelne.
    const bgStars = createStarfield(three, tier, 400, [16, 40]);
    bgStars.material.size = 0.09;
    scene.add(bgStars.points);
    this.disposables.push(bgStars.geometry, bgStars.material, bgStars.texture);

    // --- Etap 1: planeta ---
    this.planetGroup = new three.Group();
    scene.add(this.planetGroup);
    const planetR = 1.3;
    const planetGeo = new three.SphereGeometry(planetR, 40, 28);
    const planetMat = new three.MeshStandardMaterial({ color: 0x1f3a63, roughness: 0.8, metalness: 0.15 });
    this.planetGroup.add(new three.Mesh(planetGeo, planetMat));
    this.disposables.push(planetGeo, planetMat);
    // Poświata atmosfery — bez niej nocna strona planety to czarna sylwetka bez żadnej faktury.
    const atmoGeo = new three.SphereGeometry(planetR * 1.1, 32, 24);
    const atmoMat = new three.MeshBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.16, side: three.BackSide });
    this.planetGroup.add(new three.Mesh(atmoGeo, atmoMat));
    this.disposables.push(atmoGeo, atmoMat);

    this.networkMax = scaleCount(64, tier);
    const netPos = new Float32Array(this.networkMax * 3);
    this.networkColors = new Float32Array(this.networkMax * 3);
    for (let i = 0; i < this.networkMax; i++) {
      const p = fibonacciSpherePoint(i, this.networkMax);
      netPos[i * 3] = p.x * planetR * 1.02;
      netPos[i * 3 + 1] = p.y * planetR * 1.02;
      netPos[i * 3 + 2] = p.z * planetR * 1.02;
    }
    this.networkGeo = new three.BufferGeometry();
    this.networkGeo.setAttribute('position', new three.BufferAttribute(netPos, 3));
    this.networkGeo.setAttribute('color', new three.BufferAttribute(this.networkColors, 3));
    this.networkGeo.setDrawRange(0, 0);
    const netMat = new three.PointsMaterial({
      size: 0.075, vertexColors: true, transparent: true, opacity: 1, map: tex, depthWrite: false,
      blending: three.AdditiveBlending, sizeAttenuation: true,
    });
    this.planetGroup.add(new three.Points(this.networkGeo, netMat));
    this.disposables.push(this.networkGeo, netMat);

    // --- Etap 2: gwiazda + rój Dysona ---
    this.dysonGroup = new three.Group();
    scene.add(this.dysonGroup);
    const starR = 0.55;
    const starGeo = new three.SphereGeometry(starR, 32, 24);
    const starMat = new three.MeshBasicMaterial({ color: 0xf8d9a0 });
    this.dysonGroup.add(new three.Mesh(starGeo, starMat));
    this.disposables.push(starGeo, starMat);
    const glowGeo = new three.SphereGeometry(starR * 1.6, 24, 18);
    const glowMat = new three.MeshBasicMaterial({ color: 0xf0b35c, transparent: true, opacity: 0.12, side: three.BackSide });
    this.dysonGroup.add(new three.Mesh(glowGeo, glowMat));
    this.disposables.push(glowGeo, glowMat);

    this.swarmMax = scaleCount(360, tier);
    const swarmPos = new Float32Array(this.swarmMax * 3);
    this.swarmColors = new Float32Array(this.swarmMax * 3);
    this.swarmDirs = [];
    for (let i = 0; i < this.swarmMax; i++) {
      const p = fibonacciSpherePoint(i, this.swarmMax);
      const r = starR * (2.2 + ((i * 37) % 100) / 100);
      this.swarmDirs.push({ x: p.x, y: p.y, z: p.z, r, speed: 0.15 + ((i * 13) % 7) * 0.03 });
    }
    this.swarmGeo = new three.BufferGeometry();
    this.swarmGeo.setAttribute('position', new three.BufferAttribute(swarmPos, 3));
    this.swarmGeo.setAttribute('color', new three.BufferAttribute(this.swarmColors, 3));
    this.swarmGeo.setDrawRange(0, 0);
    const swarmMat = new three.PointsMaterial({
      size: 0.05, vertexColors: true, transparent: true, opacity: 0.9, map: tex, depthWrite: false,
      blending: three.AdditiveBlending, sizeAttenuation: true,
    });
    this.dysonGroup.add(new three.Points(this.swarmGeo, swarmMat));
    this.disposables.push(this.swarmGeo, swarmMat);

    // --- Etap 3: galaktyka ---
    this.galaxyGroup = new three.Group();
    scene.add(this.galaxyGroup);
    this.galaxyMax = scaleCount(900, tier);
    const galPos = new Float32Array(this.galaxyMax * 3);
    this.galaxyColors = new Float32Array(this.galaxyMax * 3);
    this.galaxyBase = [];
    for (let i = 0; i < this.galaxyMax; i++) {
      const arm = i % 2;
      const tt = (i / this.galaxyMax) * 4.5;
      const ang = tt * 1.8 + arm * Math.PI;
      const r = tt * 0.52;
      const thickness = 0.16 * Math.exp(-tt * 0.35);
      const y0 = (Math.sin(i * 12.9898) * 0.5) * thickness;
      this.galaxyBase.push({ ang, r, y0 });
    }
    this.galaxyGeo = new three.BufferGeometry();
    this.galaxyGeo.setAttribute('position', new three.BufferAttribute(galPos, 3));
    this.galaxyGeo.setAttribute('color', new three.BufferAttribute(this.galaxyColors, 3));
    const galMat = new three.PointsMaterial({
      size: 0.035, vertexColors: true, transparent: true, opacity: 0.85, map: tex, depthWrite: false,
      blending: three.AdditiveBlending, sizeAttenuation: true,
    });
    this.galaxyGroup.add(new three.Points(this.galaxyGeo, galMat));
    this.disposables.push(this.galaxyGeo, galMat);
    // Jądro galaktyki.
    const coreGeo = new three.SphereGeometry(0.14, 20, 16);
    const coreMat = new three.MeshBasicMaterial({ color: 0xf8e8c0 });
    this.galaxyGroup.add(new three.Mesh(coreGeo, coreMat));
    this.disposables.push(coreGeo, coreMat);
  }

  update(dt: number, p: SimParams) {
    this.K = Number(p.k);
    if (!getSettings().reducedMotion) {
      this.t += dt;
      this.introElapsed = Math.min(1, this.introElapsed + dt);
      this.planetGroup.rotation.y += dt * 0.1;
      this.galaxyGroup.rotation.y += dt * 0.015;
    }
  }

  syncScene() {
    const K = this.K;
    const stagePlanet = K < 2;
    const stageDyson = K >= 2 && K < 3;
    const stageGalaxy = K >= 3;
    this.planetGroup.visible = stagePlanet;
    this.dysonGroup.visible = stageDyson;
    this.galaxyGroup.visible = stageGalaxy;

    if (stagePlanet) {
      const cover = Math.min(1, Math.max(0, (K - 0.7) / 0.3));
      const count = Math.floor(cover * this.networkMax);
      this.networkGeo.setDrawRange(0, count);
      for (let i = 0; i < count; i++) {
        const bright = 0.55 + 0.45 * Math.sin(this.t * 2 + i);
        this.networkColors[i * 3] = 0.94 * bright;
        this.networkColors[i * 3 + 1] = 0.7 * bright;
        this.networkColors[i * 3 + 2] = 0.36 * bright;
      }
      (this.networkGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    } else if (stageDyson) {
      const fill = K - 2;
      const count = Math.min(this.swarmMax, Math.floor(20 + fill * (this.swarmMax - 20)));
      this.swarmGeo.setDrawRange(0, count);
      const pos = this.swarmGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < count; i++) {
        const d = this.swarmDirs[i];
        const ang = this.t * d.speed;
        // Precesja kierunku wokół osi Y — każdy satelita ma inną prędkość
        // (ruch różnicowy, nie sztywna bryła), jak w wersji 2D.
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const x = d.x * ca - d.z * sa;
        const z = d.x * sa + d.z * ca;
        pos.setXYZ(i, x * d.r, d.y * d.r, z * d.r);
        this.swarmColors[i * 3] = 0.36;
        this.swarmColors[i * 3 + 1] = 0.84;
        this.swarmColors[i * 3 + 2] = 0.91;
      }
      pos.needsUpdate = true;
      (this.swarmGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    } else if (stageGalaxy) {
      const harvestedFrac = Math.max(0, Math.min(1, (K - 3) * 2));
      const pos = this.galaxyGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.galaxyMax; i++) {
        const b = this.galaxyBase[i];
        const ang = b.ang + this.t * 0.06;
        const x = b.r * Math.cos(ang);
        const z = b.r * Math.sin(ang);
        pos.setXYZ(i, x, b.y0, z);
        const harvested = i / this.galaxyMax < harvestedFrac;
        if (harvested) {
          this.galaxyColors[i * 3] = 0.94; this.galaxyColors[i * 3 + 1] = 0.7; this.galaxyColors[i * 3 + 2] = 0.36;
        } else {
          this.galaxyColors[i * 3] = 0.78; this.galaxyColors[i * 3 + 1] = 0.84; this.galaxyColors[i * 3 + 2] = 1.0;
        }
      }
      pos.needsUpdate = true;
      (this.galaxyGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }

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
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.5, 0.6, 0.7));
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
    return { K: Math.round(this.K * 100) / 100 };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

export const civilizationKardashev3D: ExperimentDef = {
  id: 'kardashev-3d',
  name: 'Skala Kardaszewa (3D)',
  honesty: 'theoretical',
  honestyNote:
    'Ten sam wzór Sagana i te same progi K=1/2/3 co w wersji płaskiej (druga zakładka) — zmienia się tylko reprezentacja przestrzenna. Rozkład węzłów sieci energetycznej i satelitów roju Dysona metodą Fibonacciego (kąt złoty) daje naukowo trafniejszy obraz roju jako powłoki 3D o wielu inklinacjach orbitalnych, nie płaskiego pierścienia — żaden realistyczny rój kolektorów nie mógłby być płaski (kolizje orbit). Trzy etapy (planeta/gwiazda/galaktyka) NIE są pokazane w prawdziwej skali względem siebie — to wybór czytelności, jak w wersji 2D. Wszystko powyżej dzisiejszej ludzkości (K≈0,73) pozostaje spekulacją inżynieryjną (rój Dysona, cywilizacje galaktyczne).',
  params: [
    {
      key: 'k', label: 'Poziom cywilizacji K', type: 'slider', min: 0.5, max: 3.2, step: 0.01, default: 0.73,
      format: (v) => v.toFixed(2),
    },
  ],
  createSim3D: () => new Kardashev3DSim(),
  narrate(p) {
    const K = Number(p.k);
    if (K < 2) {
      return [
        {
          title: 'Sieć energetyczna jako prawdziwa powłoka 3D',
          body: `Każdy węzeł to punkt rozmieszczony metodą Fibonacciego (kąt złoty ≈137,5°) — ta sama matematyka, która daje najbardziej równomierny rozkład nasion słonecznika czy siatek geodezyjnych. Przy K=${K.toFixed(2)} zapalonych jest to, co przewiduje wzór Sagana dla postępu między Typem 0 a I.`,
        },
      ];
    }
    if (K < 3) {
      return [
        {
          title: 'Rój Dysona — powłoka, nie pierścień',
          kind: 'hypothesis' as const,
          body: `Satelity krążą na wielu inklinacjach orbitalnych wokół gwiazdy, każdy z inną prędkością kątową (ruch różnicowy) — dokładnie tak musiałby wyglądać prawdziwy rój, żeby uniknąć kolizji orbit. Płaski pierścień (jak orbity planet Układu Słonecznego) nie zmieściłby wystarczająco kolektorów. Wypełnienie: ${((K - 2) * 100).toFixed(0)}% drogi do Typu III.`,
        },
      ];
    }
    return [
      {
        title: 'Dysk galaktyczny cieńczeje ku brzegom',
        kind: 'hypothesis' as const,
        body: 'Grubość symulowanego dysku maleje z promieniem — tak jak w prawdziwych galaktykach dyskowych, gdzie gwiazdy skupiają się blisko płaszczyzny symetrii tym silniej, im dalej od jądra. Bursztynowe gwiazdy to hipotetyczna cywilizacja typu III — im większy jej zasięg, tym bliżej „gdzie oni są?" (paradoks Fermiego).',
      },
    ];
  },
};
