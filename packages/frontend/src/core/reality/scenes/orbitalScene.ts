import type * as THREE from 'three';
import type { CameraFraming, RealityScene } from '../types';
import type { ModelGraph, PropagationStep } from '../../modelGraph/graph';
import { SEMI_MAJOR_AXIS_AU } from '../../modelGraph/orbitalGraph';
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

  private starMesh?: THREE.Mesh;
  private planetGroup?: THREE.Group;
  private planetMesh?: THREE.Mesh;
  private orbitLine?: THREE.Line;

  constructor(graph: ModelGraph) {
    this.graph = graph;
  }

  init(three: typeof THREE, scene: THREE.Scene): void {
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

    const orbitPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      orbitPts.push(new three.Vector3(Math.cos(a) * SEMI_MAJOR_AXIS_AU * SCENE_AU, 0, Math.sin(a) * SEMI_MAJOR_AXIS_AU * SCENE_AU));
    }
    const orbitGeo = new three.BufferGeometry().setFromPoints(orbitPts);
    const orbitMat = new three.LineBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.3 });
    this.orbitLine = new three.Line(orbitGeo, orbitMat);
    scene.add(this.orbitLine);
    this.disposables.push(orbitGeo, orbitMat, { dispose: () => scene.remove(this.orbitLine!) });

    this.planetGroup = new three.Group();
    const planetGeo = new three.SphereGeometry(PLANET_RADIUS, 24, 18);
    const planetMat = new three.MeshStandardMaterial({ color: 0x6ee7a0, roughness: 0.6, metalness: 0.1 });
    this.planetMesh = new three.Mesh(planetGeo, planetMat);
    this.planetGroup.add(this.planetMesh);
    scene.add(this.planetGroup);
    this.disposables.push(planetGeo, planetMat, { dispose: () => scene.remove(this.planetGroup!) });
  }

  update(dt: number): void {
    const periodYears = this.graph.getValue('orbitalPeriodYears');
    this.meanAnomaly = (this.meanAnomaly + dt * SIM_YEARS_PER_SECOND * ((2 * Math.PI) / periodYears)) % (2 * Math.PI);
  }

  syncScene(): void {
    if (!this.planetGroup || !this.planetMesh) return;
    const { x, y } = keplerPosition(SEMI_MAJOR_AXIS_AU, 0, this.meanAnomaly);
    const px = x * SCENE_AU;
    const pz = y * SCENE_AU;
    this.planetGroup.position.set(px, 0, pz);
    this.planetGroup.lookAt(0, 0, 0);

    const tidal = this.graph.getValue('relativeTidalStrength');
    const elongation = 1 + TIDAL_VISUAL_GAIN * Math.max(0, tidal - 1);
    const compression = 1 - TIDAL_VISUAL_GAIN * 0.5 * Math.max(0, tidal - 1);
    this.planetMesh.scale.set(elongation, Math.max(0.4, compression), Math.max(0.4, compression));
  }

  getDefaultFraming(): CameraFraming {
    const r = SEMI_MAJOR_AXIS_AU * SCENE_AU;
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
    const r = SEMI_MAJOR_AXIS_AU * SCENE_AU;
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
        const { x, y } = keplerPosition(SEMI_MAJOR_AXIS_AU, 0, this.meanAnomaly);
        const px = x * SCENE_AU;
        const pz = y * SCENE_AU;
        frames.push({ t, position: [px + 0.7, 0.5, pz + 0.7], lookAt: [px, 0, pz], label: node.label });
      }
    }
    if (frames.length < 2) return null;
    t += 1.8;
    frames.push({ t, position: [r * 0.55, r * 0.6, r * 1.15], lookAt: [0, 0, 0], label: 'Nowy stan ustalony' });
    return new CameraFlight(frames);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
