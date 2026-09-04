import type * as THREE from 'three';
import type { SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { ORBITALS, type OrbitalDef } from '../atom';
import { makeSoftDotTexture } from '../../core/three/starfield';
import { detectRenderTier, scaleCount, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Chmura elektronowa atomu wodoru w prawdziwym 3D — Monte Carlo (odrzucanie)
 * z DOKŁADNEGO |ψ|² (te same analityczne rozwiązania równania Schrödingera
 * co w atom.tsx::OrbitalSim, `Y` jako funkcja pełnego wektora jednostkowego
 * (dx,dy,dz), nie tylko przekroju x–z). Gęstość punktów w chmurze DOSŁOWNIE
 * jest gęstością prawdopodobieństwa — dokładnie ta interpretacja, której
 * uczy się w podręcznikach ("gdyby sfotografować pozycję elektronu tysiące
 * razy, tak wyglądałby wykres"), nie ozdobna analogia. Barwa punktu koduje
 * ZNAK ψ (faza rzeczywistej funkcji falowej — cyjan dodatni, fiolet ujemny)
 * — fizycznie znacząca informacja (znak decyduje o interferencji przy
 * hybrydyzacji orbitali), nie dekoracja.
 *
 * Maksimum gęstości do normalizacji odrzucania liczone jest skanem
 * płaszczyzny x–z (y=0) — DOKŁADNE dla wszystkich siedmiu orbitali w tym
 * zestawie, bo każdy ma m=0 albo jest rzeczywistą kombinacją ±m (3dxz),
 * więc globalne maksimum |ψ|² zawsze leży w tej płaszczyźnie.
 */

const BASE_POINTS = 16000;
const INTRO_DURATION = 1.0;

export function runHydrogenOrbitalScenario({ orbital = '2pz', x = 0, y = 0, z = 1 }: { orbital?: string; x?: number; y?: number; z?: number } = {}) {
  const orb = ORBITALS[orbital];
  if (!orb) throw new Error('Nieznany orbital wodoru.');
  if (![x, y, z].every(Number.isFinite)) throw new Error('Współrzędne muszą być skończone.');
  const r = Math.hypot(x, y, z);
  if (r > orb.extent) throw new Error('Punkt leży poza zakresem istniejącej wizualizacji orbitalu.');
  const dx = r === 0 ? 0 : x / r;
  const dy = r === 0 ? 0 : y / r;
  const dz = r === 0 ? 0 : z / r;
  const radial = orb.R(r);
  const angular = orb.Y(dx, dy, dz);
  const psi = radial * angular;
  return { orbital, label: orb.label, extentBohr: orb.extent, x, y, z, radiusBohr: r, radial, angular, psi, relativeDensity: psi * psi };
}

/**
 * Maksimum GĘSTOŚCI WAŻONEJ OBJĘTOŚCIOWO r²|ψ|² (nie samego |ψ|²) po
 * (r, kąt) w płaszczyźnie x–z — dokładnie ta wielkość, którą trzeba
 * znormalizować przy losowaniu r JEDNOSTAJNIE na promieniu (patrz
 * sampleOrbitalCloudInto). Bez czynnika r² maksimum |ψ|² dla orbitali s
 * leży przy r=0, co przy próbkowaniu objętościowym (stary algorytm: punkt
 * jednostajny w kuli) dawało DRAMATYCZNIE niską akceptację dla ciasnych
 * orbitali (1s: ~0,3%, bo niemal cała objętość kuli o promieniu `extent`
 * leży tam, gdzie gęstość jest already znikoma) — zmierzone: ~500 ms
 * synchronicznego przycięcia UI na jeden przełącznik orbitalu. Z wagą r²
 * maksimum przesuwa się w rozsądne r>0 (promień najbardziej prawdopodobny,
 * nie promień zerowy), więc jednostajne losowanie r w [0,extent] trafia w
 * sensowny zakres dużo częściej (~16% dla 1s, zmierzone) — bez ŻADNEGO
 * obcięcia ogona rozkładu (`extent` się nie zmienia, wciąż >99,9%
 * prawdopodobieństwa).
 */
export function findMaxWeightedDensityXZPlane(orb: OrbitalDef, N = 300): number {
  let max = 1e-15;
  for (let ir = 1; ir <= N; ir++) {
    const r = (ir / N) * orb.extent;
    for (let ia = 0; ia <= N; ia++) {
      const theta = (ia / N) * Math.PI;
      const dz = Math.cos(theta);
      const dx = Math.sin(theta);
      const psi = orb.R(r) * orb.Y(dx, 0, dz);
      const w = r * r * psi * psi;
      if (w > max) max = w;
    }
  }
  return max;
}

/**
 * Wypełnia (w miejscu) prealokowane bufory pozycji/kolorów metodą
 * odrzucania — zwraca liczbę faktycznie wylosowanych punktów. Kandydat:
 * promień r JEDNOSTAJNY w [0,extent] (nie punkt jednostajny w kuli —
 * patrz komentarz przy findMaxWeightedDensityXZPlane) i kierunek
 * jednostajny na sferze jednostkowej (odrzucanie sześcian→kula, klasyczna
 * metoda). Akceptacja ∝ r²|ψ(r,kierunek)|² / maxWeighted — DOKŁADNE
 * próbkowanie z |ψ|² w pełnej objętości 3D, tylko wydajniejsze.
 */
export function sampleOrbitalCloudInto(orb: OrbitalDef, positions: Float32Array, colors: Float32Array, count: number, maxWeightedDensity: number): number {
  const cyan: [number, number, number] = [0.36, 0.84, 0.91];
  const violet: [number, number, number] = [0.62, 0.42, 0.95];
  let filled = 0;
  let attempts = 0;
  const maxAttempts = count * 400 + 100000;
  while (filled < count && attempts < maxAttempts) {
    attempts++;
    const cx = Math.random() * 2 - 1;
    const cy = Math.random() * 2 - 1;
    const cz = Math.random() * 2 - 1;
    const cl2 = cx * cx + cy * cy + cz * cz;
    if (cl2 > 1 || cl2 === 0) continue;
    const cl = Math.sqrt(cl2);
    const dx = cx / cl;
    const dy = cy / cl;
    const dz = cz / cl;
    const r = Math.random() * orb.extent;
    const psi = orb.R(r) * orb.Y(dx, dy, dz);
    const weighted = r * r * psi * psi;
    if (Math.random() * maxWeightedDensity >= weighted) continue;
    // Mapowanie fizyka(x,y,z) → three.js(x,z,y): oś biegunowa (fizyczne z,
    // wzdłuż której leżą płaty pz/dz²) staje się osią PIONOWĄ na ekranie —
    // ta sama konwencja co sfera Blocha (quantum-bloch-3d.ts) i podręcznikowe
    // rysunki orbitali (2pz rysowany pionowo). Bez tego kamera patrząca
    // wzdłuż three.js Z byłaby ustawiona DOKŁADNIE wzdłuż osi hantli 2pz —
    // oba płaty nakładałyby się w jeden rozmyty kleks (bug wykryty wizualnie).
    positions[filled * 3] = dx * r;
    positions[filled * 3 + 1] = dz * r;
    positions[filled * 3 + 2] = dy * r;
    const c = psi >= 0 ? cyan : violet;
    colors[filled * 3] = c[0];
    colors[filled * 3 + 1] = c[1];
    colors[filled * 3 + 2] = c[2];
    filled++;
  }
  return filled;
}

export class OrbitalCloud3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.3;

  private three!: typeof THREE;
  private camera!: THREE.PerspectiveCamera;
  private points?: THREE.Points;
  private geometry?: THREE.BufferGeometry;
  private material?: THREE.PointsMaterial;
  private texture?: THREE.Texture;
  private nucleus?: THREE.Sprite;
  private nucleusMat?: THREE.SpriteMaterial;
  private pointCount = 0;
  private currentKey = '';
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.camera = camera;
    this.introElapsed = getSettings().reducedMotion ? INTRO_DURATION : 0;
    scene.background = new three.Color(0x02030a);

    const tier = detectRenderTier();
    this.pointCount = scaleCount(BASE_POINTS, tier);

    this.geometry = new three.BufferGeometry();
    this.geometry.setAttribute('position', new three.BufferAttribute(new Float32Array(this.pointCount * 3), 3));
    this.geometry.setAttribute('color', new three.BufferAttribute(new Float32Array(this.pointCount * 3), 3));
    this.geometry.setDrawRange(0, 0);

    this.texture = makeSoftDotTexture(three);
    this.material = new three.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.82,
      map: this.texture, blending: three.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new three.Points(this.geometry, this.material);
    scene.add(this.points);

    this.nucleusMat = new three.SpriteMaterial({ map: this.texture, color: 0xf0b35c, transparent: true, depthWrite: false });
    this.nucleus = new three.Sprite(this.nucleusMat);
    this.nucleus.scale.set(0.35, 0.35, 1);
    scene.add(this.nucleus);

    camera.position.set(0, 3, 9);
    camera.lookAt(0, 0, 0);
  }

  private rebuild(key: string) {
    const orb = ORBITALS[key];
    if (!orb || !this.geometry) return;
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;
    const maxDensity = findMaxWeightedDensityXZPlane(orb);
    const filled = sampleOrbitalCloudInto(orb, posAttr.array as Float32Array, colAttr.array as Float32Array, this.pointCount, maxDensity);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, filled);
    this.geometry.computeBoundingSphere();
    this.currentKey = key;

    // Dystans kamery skalowany zasięgiem orbitalu (1s: promień ~6 a₀, 3dxz: ~34 a₀) —
    // ta sama różnica skali co w prawdziwym wodorze, nie stały kadr dla wszystkich.
    // Kąt kamery CELOWO nie leży na żadnej głównej osi ani płaszczyźnie węzłowej
    // orbitalu, żeby żaden kształt w tym zestawie siedmiu orbitali nie "spłaszczył
    // się" widokowo: pz/dz² mają płaty wzdłuż osi Y (po mapowaniu fizyka(z)→three(Y))
    // — patrząc WZDŁUŻ Y widać jeden kleks zamiast hantli (wykryte wizualnie w
    // pierwszej wersji). dxz ma płaty w płaszczyźnie X–Y (fizyczna x–z) — patrząc
    // Z BOKU tej płaszczyzny (duża składowa X kamery) cztery płaty zlewają się w
    // dwa. Kamera niżej, silnie "z przodu" (duża składowa Z, mała X) pokazuje
    // płaszczyznę X–Y niemal na wprost (czytelne cztery płaty dxz), a pz/dz² są
    // i tak azymutalnie symetryczne wokół Y, więc ten sam kąt działa dla obu grup.
    const dist = orb.extent * 1.55;
    this.camera.position.set(dist * 0.28, dist * 0.5, dist * 0.98);
    this.camera.lookAt(0, 0, 0);
  }

  update(dt: number, p: SimParams) {
    const key = String(p.orbital ?? '2pz');
    if (key !== this.currentKey) this.rebuild(key);
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
    const tier = detectRenderTier();
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

  getStats() {
    return { points: this.geometry?.drawRange.count ?? 0 };
  }

  dispose() {
    this.geometry?.dispose();
    this.material?.dispose();
    this.texture?.dispose();
    this.nucleusMat?.dispose();
  }
}
