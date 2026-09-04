import type * as THREE from 'three';
import type { CameraFraming, RealityScene } from '../types';
import { buildOrbitalModelGraph } from '../../modelGraph/orbitalGraph';
import type { ModelGraph, PropagationStep } from '../../modelGraph/graph';
import { keplerPosition } from '../../physics';
import { CameraFlight, type FlightKeyframe } from '../cameraSequencer';

/**
 * Pierwsza scena Reality Navigatora: gwiazda + planeta na orbicie kołowej,
 * napędzana WYŁĄCZNIE wartościami z core/modelGraph/orbitalGraph.ts.
 *
 * Fizyka (dokładna, DERIVED z Grafu Modeli):
 *  - pozycja planety: core/physics.ts::keplerPosition przy e=0 (dokładna
 *    orbita kołowa), kąt średni napędzany prawdziwym orbitalPeriodYears.
 *  - wybrzuszenie pływowe planety: skalowanie siatki wzdłuż osi gwiazda-
 *    planeta proporcjonalne do relativeTidalStrength — KIERUNEK i
 *    PROPORCJA są dokładne, WIELKOŚĆ wizualna jest przesadzona o stały
 *    czynnik (TIDAL_VISUAL_GAIN) dla czytelności — jawnie ujawnione w
 *    honestyNote węzła, nie ukryte.
 *
 * Kinematyka kamery (INTERPRETACJA — HonestyLevel 'cinematic'):
 *  - domyślne kadrowanie i lot "widocznej konsekwencji" po zmianie
 *    parametru to reżyserska decyzja Reality Navigatora, nie przewidywanie
 *    fizyczne. Sama TRASA nie zmienia żadnej wartości w grafie.
 */

const SCENE_AU = 3.2; // jednostki sceny na 1 AU
const STAR_RADIUS = 0.42;
const PLANET_RADIUS = 0.09;
const TIDAL_VISUAL_GAIN = 0.4; // przesadzenie wizualne wybrzuszenia — ujawnione w honestyNote
const SIM_YEARS_PER_SECOND = 0.35;

export class OrbitalRealityScene implements RealityScene {
  id = 'orbital-consequence';
  label = 'Gwiazda i planeta — mechanika orbitalna';

  private graph: ModelGraph;
  private meanAnomaly = 0;
  private disposables: { dispose(): void }[] = [];
  private renderedRadiusAu = -1; // do wykrycia zmiany promienia orbity i przebudowy linii

  private three?: typeof THREE;
  private sceneRef?: THREE.Scene;
  private starMesh?: THREE.Mesh;
  private planetGroup?: THREE.Group;
  private planetMesh?: THREE.Mesh;
  private orbitLine?: THREE.Line;
  private orbitGeo?: THREE.BufferGeometry;

  // Causal Shockwave — patrz emitShockwave(). Znaczniki węzłów rozmieszczone
  // wzdłuż promienia W KOLEJNOŚCI realnej propagacji; pierścień fali zapala je,
  // gdy przez nie przechodzi. To wizualizacja OBLICZENIA, nie ozdoba.
  private shockGroup?: THREE.Group;
  private shockRing?: THREE.Mesh;
  private shockMarkers: { mesh: THREE.Mesh; radius: number; lit: boolean; label: string }[] = [];
  private shockElapsed = Infinity; // Infinity = brak aktywnej fali
  private readonly SHOCK_SPEED = 3.4; // jednostek sceny na sekundę
  private readonly SHOCK_MAX_RADIUS = 9;

  // Porównanie gałęzi — półprzezroczysty „duch" drugiej rzeczywistości.
  private ghostGroup?: THREE.Group;
  private ghostPlanet?: THREE.Mesh;
  private ghostMeanAnomaly = 0;
  private ghostParams: Record<string, number> | null = null;

  private radiusAu(): number {
    return this.graph.getValue('orbitalRadiusAu');
  }

  constructor(graph: ModelGraph) {
    this.graph = graph;
  }

  init(three: typeof THREE, scene: THREE.Scene): void {
    this.sceneRef = scene;
    scene.add(new three.AmbientLight(0x445066, 1.1));
    const light = new three.PointLight(0xfff2c0, 2.2, 60);
    light.position.set(0, 0, 0);
    scene.add(light);
    this.disposables.push({ dispose: () => scene.remove(light) });

    const starGeo = new three.SphereGeometry(STAR_RADIUS, 32, 24);
    const starMat = new three.MeshBasicMaterial({ color: 0xfff2c0 });
    this.starMesh = new three.Mesh(starGeo, starMat);
    scene.add(this.starMesh);
    this.disposables.push(starGeo, starMat, { dispose: () => scene.remove(this.starMesh!) });

    this.three = three;
    this.orbitGeo = new three.BufferGeometry();
    const orbitMat = new three.LineBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.3 });
    this.orbitLine = new three.Line(this.orbitGeo, orbitMat);
    scene.add(this.orbitLine);
    this.disposables.push(this.orbitGeo, orbitMat, { dispose: () => scene.remove(this.orbitLine!) });
    this.rebuildOrbitLine(); // rysuje pierścień o bieżącym promieniu

    this.planetGroup = new three.Group();
    const planetGeo = new three.SphereGeometry(PLANET_RADIUS, 24, 18);
    const planetMat = new three.MeshStandardMaterial({ color: 0x6ee7a0, roughness: 0.6, metalness: 0.1 });
    this.planetMesh = new three.Mesh(planetGeo, planetMat);
    this.planetGroup.add(this.planetMesh);
    scene.add(this.planetGroup);
    this.disposables.push(planetGeo, planetMat, { dispose: () => scene.remove(this.planetGroup!) });
  }

  /** Przebudowuje pierścień orbity, gdy zmieni się parametr promienia (gałąź/suwak) — pierścień jest DOSŁOWNIE promieniem z grafu, nie stałą. */
  private rebuildOrbitLine(): void {
    if (!this.three || !this.orbitGeo) return;
    const rScene = this.radiusAu() * SCENE_AU;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new this.three.Vector3(Math.cos(a) * rScene, 0, Math.sin(a) * rScene));
    }
    this.orbitGeo.setFromPoints(pts);
    this.renderedRadiusAu = this.radiusAu();
  }

  update(dt: number): void {
    const periodYears = this.graph.getValue('orbitalPeriodYears');
    this.meanAnomaly = (this.meanAnomaly + dt * SIM_YEARS_PER_SECOND * ((2 * Math.PI) / periodYears)) % (2 * Math.PI);
  }

  syncScene(): void {
    if (!this.planetGroup || !this.planetMesh) return;
    if (this.radiusAu() !== this.renderedRadiusAu) this.rebuildOrbitLine();
    const radiusScene = this.radiusAu() * SCENE_AU;
    const { x, y } = keplerPosition(radiusScene, 0, this.meanAnomaly);
    this.planetGroup.position.set(x, 0, y);
    this.planetGroup.lookAt(0, 0, 0);

    const tidal = this.graph.getValue('relativeTidalStrength');
    const elongation = 1 + TIDAL_VISUAL_GAIN * Math.max(0, tidal - 1);
    const compression = 1 - TIDAL_VISUAL_GAIN * 0.5 * Math.max(0, tidal - 1);
    this.planetMesh.scale.set(elongation, Math.max(0.4, compression), Math.max(0.4, compression));

    this.updateShockwave();
    this.updateGhost();
  }

  // ---------------- Causal Shockwave ----------------

  /**
   * Wyzwala falę przyczynową na podstawie PRAWDZIWYCH kroków propagacji
   * (PropagationStep[] z ModelGraph). Znaczniki węzłów są rozmieszczone wzdłuż
   * promienia W KOLEJNOŚCI, w jakiej węzły faktycznie zostały przeliczone; ich
   * kolor zależy od `derivation` (zielony=direct, bursztyn=approximate,
   * fiolet=interpretive). Rozszerzający się pierścień zapala każdy znacznik
   * dokładnie wtedy, gdy do niego dotrze — to jest wizualizacja OBLICZENIA,
   * nie ozdoba (bez kroków nie ma fali).
   */
  emitShockwave(steps: PropagationStep[]): void {
    const three = this.three;
    const scene = this.sceneRef;
    if (!three || !scene) return;
    this.disposeShock();

    const derived = steps.filter((s) => (this.graph.getNode(s.nodeId)?.inputs.length ?? 0) > 0);
    if (derived.length === 0) return;

    this.shockGroup = new three.Group();
    scene.add(this.shockGroup);

    const ringGeo = new three.RingGeometry(0.9, 1.0, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new three.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5, side: three.DoubleSide });
    this.shockRing = new three.Mesh(ringGeo, ringMat);
    this.shockGroup.add(this.shockRing);

    this.shockMarkers = [];
    const colorFor = (deriv: string): number =>
      deriv === 'direct' ? 0x6ee7a0 : deriv === 'approximate' ? 0xf0b35c : 0xa78bfa;
    derived.forEach((step, idx) => {
      const node = this.graph.getNode(step.nodeId)!;
      const radius = 2.2 + idx * 1.9; // rosnący promień = kolejność propagacji
      const angle = -0.5 + idx * 0.7;
      const geo = new three.SphereGeometry(0.16, 16, 12);
      const mat = new three.MeshBasicMaterial({ color: colorFor(node.derivation), transparent: true, opacity: 0.18 });
      const mesh = new three.Mesh(geo, mat);
      mesh.position.set(Math.cos(angle) * radius, 0.15, Math.sin(angle) * radius);
      this.shockGroup!.add(mesh);
      this.shockMarkers.push({ mesh, radius, lit: false, label: node.label });
    });
    this.shockElapsed = 0;
  }

  private updateShockwave(): void {
    if (this.shockElapsed === Infinity || !this.shockRing) return;
    // syncScene nie dostaje dt; używamy stałego kroku ~60 FPS dla postępu fali
    // (fala jest efektem czysto wizualnym, nie fizyką — drobna niestałość dt jej nie psuje).
    this.shockElapsed += 1 / 60;
    const waveR = this.shockElapsed * this.SHOCK_SPEED;
    this.shockRing.scale.setScalar(Math.max(0.001, waveR));
    const ringMat = this.shockRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = Math.max(0, 0.5 * (1 - waveR / this.SHOCK_MAX_RADIUS));
    for (const m of this.shockMarkers) {
      const mat = m.mesh.material as THREE.MeshBasicMaterial;
      if (!m.lit && waveR >= m.radius) m.lit = true;
      const target = m.lit ? 0.95 : 0.18;
      mat.opacity += (target - mat.opacity) * 0.2;
      const s = m.lit ? 1 + 0.25 * Math.max(0, 1 - (waveR - m.radius) / 2) : 1;
      m.mesh.scale.setScalar(s);
    }
    if (waveR > this.SHOCK_MAX_RADIUS) this.shockElapsed = Infinity; // fala dobiegła — znaczniki zostają zapalone chwilę, potem sprzątane przy następnej fali
  }

  private disposeShock(): void {
    if (this.shockGroup && this.sceneRef) this.sceneRef.remove(this.shockGroup);
    this.shockGroup?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    });
    this.shockGroup = undefined;
    this.shockRing = undefined;
    this.shockMarkers = [];
    this.shockElapsed = Infinity;
  }

  // ---------------- Porównanie gałęzi (duch) ----------------

  /**
   * Pokazuje DRUGĄ rzeczywistość (inna gałąź) jako półprzezroczysty układ
   * obok bieżącego, z parametrami TEJ gałęzi policzonymi przez świeży graf —
   * prawdziwe, jednoczesne porównanie przestrzenne dwóch policzonych stanów,
   * nie płaska lista. Duch jest przesunięty w bok, żeby oba były widoczne naraz.
   */
  showGhost(params: Record<string, number>): void {
    const three = this.three;
    const scene = this.sceneRef;
    if (!three || !scene) return;
    this.clearGhost();
    this.ghostParams = params;

    const ghostGraph = buildOrbitalModelGraph();
    ghostGraph.applyParameterSnapshot(params);
    const ghostRadiusScene = ghostGraph.getValue('orbitalRadiusAu') * SCENE_AU;
    const offsetX = (this.radiusAu() * SCENE_AU) + ghostRadiusScene + 2.2;

    this.ghostGroup = new three.Group();
    this.ghostGroup.position.set(offsetX, 0, 0);
    scene.add(this.ghostGroup);

    const starGeo = new three.SphereGeometry(STAR_RADIUS, 24, 18);
    const starMat = new three.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.4 });
    this.ghostGroup.add(new three.Mesh(starGeo, starMat));

    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push(new three.Vector3(Math.cos(a) * ghostRadiusScene, 0, Math.sin(a) * ghostRadiusScene));
    }
    const orbitGeo = new three.BufferGeometry().setFromPoints(pts);
    const orbitMat = new three.LineBasicMaterial({ color: 0xf0b35c, transparent: true, opacity: 0.4 });
    this.ghostGroup.add(new three.Line(orbitGeo, orbitMat));

    const planetGeo = new three.SphereGeometry(PLANET_RADIUS, 20, 14);
    const planetMat = new three.MeshBasicMaterial({ color: 0xf0b35c, transparent: true, opacity: 0.6 });
    this.ghostPlanet = new three.Mesh(planetGeo, planetMat);
    this.ghostGroup.add(this.ghostPlanet);
  }

  clearGhost(): void {
    if (this.ghostGroup && this.sceneRef) this.sceneRef.remove(this.ghostGroup);
    this.ghostGroup?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    });
    this.ghostGroup = undefined;
    this.ghostPlanet = undefined;
    this.ghostParams = null;
  }

  private updateGhost(): void {
    if (!this.ghostGroup || !this.ghostPlanet || !this.ghostParams) return;
    const ghostGraph = buildOrbitalModelGraph();
    ghostGraph.applyParameterSnapshot(this.ghostParams);
    const period = ghostGraph.getValue('orbitalPeriodYears');
    const ghostRadiusScene = ghostGraph.getValue('orbitalRadiusAu') * SCENE_AU;
    this.ghostMeanAnomaly = (this.ghostMeanAnomaly + (1 / 60) * SIM_YEARS_PER_SECOND * ((2 * Math.PI) / period)) % (2 * Math.PI);
    const { x, y } = keplerPosition(ghostRadiusScene, 0, this.ghostMeanAnomaly);
    this.ghostPlanet.position.set(x, 0, y);
  }

  getDefaultFraming(): CameraFraming {
    const r = this.radiusAu() * SCENE_AU;
    return { position: [r * 0.55, r * 0.6, r * 1.15], lookAt: [0, 0, 0] };
  }

  getStats(): Record<string, number> {
    return {
      orbitalPeriodYears: this.graph.getValue('orbitalPeriodYears'),
      orbitalSpeedAuPerYear: this.graph.getValue('orbitalSpeedAuPerYear'),
      relativeTidalStrength: this.graph.getValue('relativeTidalStrength'),
      centralMassSolar: this.graph.getValue('centralMassSolar'),
    };
  }

  /**
   * Buduje CIĄGŁY lot kamery, który odwiedza węzły Grafu Modeli w
   * DOKŁADNIE tej kolejności, w jakiej faktycznie zostały przeliczone
   * (steps pochodzi z ModelGraph.setParameter — patrz jego docstring).
   * To jest "widoczna konsekwencja" z dyrektywy: kamera nie odgrywa
   * wyreżyserowanej fali, tylko realną kolejność obliczeń.
   */
  buildConsequenceFlight(steps: PropagationStep[]): CameraFlight | null {
    const r = this.radiusAu() * SCENE_AU;
    const frames: FlightKeyframe[] = [];
    let t = 0;
    frames.push({ t, position: [r * 0.55, r * 0.6, r * 1.15], lookAt: [0, 0, 0], label: 'Znajomy świat' });

    for (const step of steps) {
      const node = this.graph.getNode(step.nodeId);
      if (!node || node.inputs.length === 0) continue; // pomiń sam parametr — kamera pokazuje KONSEKWENCJE, nie przyczynę samą w sobie
      t += 1.6;
      if (step.nodeId === 'orbitalPeriodYears' || step.nodeId === 'orbitalSpeedAuPerYear') {
        frames.push({ t, position: [r * 1.3, r * 1.15, r * 1.3], lookAt: [0, 0, 0], label: node.label });
      } else if (step.nodeId === 'relativeTidalStrength') {
        const { x, y } = keplerPosition(r, 0, this.meanAnomaly);
        frames.push({ t, position: [x + 0.7, 0.5, y + 0.7], lookAt: [x, 0, y], label: node.label });
      }
    }
    if (frames.length < 2) return null;
    t += 1.8;
    frames.push({ t, position: [r * 0.55, r * 0.6, r * 1.15], lookAt: [0, 0, 0], label: 'Nowy stan ustalony' });
    return new CameraFlight(frames);
  }

  dispose(): void {
    this.disposeShock();
    this.clearGhost();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
