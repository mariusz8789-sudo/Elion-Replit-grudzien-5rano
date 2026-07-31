import type * as THREE from 'three';
import type { CameraFraming, RealityScene } from '../types';
import type { PropagationStep } from '../../modelGraph/graph';
import type { EngineeringModel } from '../../engineeringGraph/EngineeringModel';
import { NODE_TO_COMPONENT, type PUMP_PIPE_COMPONENTS } from '../../engineeringGraph/pumpPipe';
import { CameraFlight, type FlightKeyframe } from '../cameraSequencer';
import { realityEngine } from '../RealityEngine';

type Component = (typeof PUMP_PIPE_COMPONENTS)[number];

/**
 * SCHEMATYCZNA scena maszyny „pompa–rurociąg" w persystentnym silniku 3D.
 *
 * UCZCIWOŚĆ WIZUALNA (krytyczne — patrz honestyNote w UI):
 *  - To jest SCHEMAT inżynierski (zbiornik → pompa → rura → wylot), NIE
 *    symulacja CFD. Nie ma tu pola prędkości, śladu turbulencji ani rozkładu
 *    ciśnienia liczonego solverem — bo Faza 1 JAWNIE takich solverów nie ma.
 *  - Cząstki płynące rurą poruszają się z prędkością proporcjonalną do
 *    PRAWDZIWEJ wartości `flowVelocity` z grafu — to uczciwe odwzorowanie
 *    jednej liczby, nie udawany przepływ 3D.
 *  - Średnica rysowanej rury jest proporcjonalna do PRAWDZIWEGO parametru
 *    `pipeDiameter`; wysokość podnoszenia do `staticLift`. Zmiana suwaka
 *    realnie zmienia geometrię sceny.
 *  - Fala przyczynowa „zapala" komponenty maszyny w KOLEJNOŚCI faktycznej
 *    propagacji w grafie (NODE_TO_COMPONENT), a nie w wyreżyserowanej — to
 *    wizualizacja OBLICZENIA. Sama trasa kamery jest warstwą kinową.
 */

const SCENE = {
  reservoirX: -6,
  pumpX: -3.2,
  pipeStartX: -2.4,
  pipeEndX: 5,
  baseY: 0.5,
  liftVisualPerMeter: 0.05, // 1 m podnoszenia => 0,05 jednostki sceny (skala schematu)
  diameterVisualGain: 6, // 0,1 m średnicy => 0,6 jednostki promienia rysunku
  minPipeRadius: 0.12,
  particleCount: 22,
};

const COLOR: Record<Component, number> = {
  reservoir: 0x3b82f6,
  pump: 0xf59e0b,
  pipe: 0x38bdf8,
  outlet: 0x6ee7a0,
};

export class PumpPipeRealityScene implements RealityScene {
  id = 'pump-pipe-machine';
  label = 'Maszyna: pompa–rurociąg (schemat inżynierski)';

  private model: EngineeringModel;
  private three?: typeof THREE;
  private sceneRef?: THREE.Scene;
  private disposables: { dispose(): void }[] = [];

  private machineGroup?: THREE.Group;
  private pipeMesh?: THREE.Mesh;
  private outletRiser?: THREE.Mesh;
  private componentMat = new Map<Component, THREE.MeshStandardMaterial>();
  private renderedDiameter = -1;
  private renderedLift = -1;

  // Cząstki płynące rurą — prędkość ∝ flowVelocity (jedna prawdziwa liczba).
  private particles: { mesh: THREE.Mesh; t: number }[] = [];
  private impeller?: THREE.Mesh;

  // Fala przyczynowa po komponentach (kolejność realnej propagacji).
  private pulses: { component: Component; startAt: number }[] = [];
  private waveElapsed = Infinity;
  private readonly PULSE_GAP = 0.32; // s między kolejnymi komponentami
  private readonly PULSE_DECAY = 0.9; // s zanikania rozbłysku

  // Porównanie gałęzi — półprzezroczysty „duch" drugiej maszyny.
  private ghostGroup?: THREE.Group;

  constructor(model: EngineeringModel) {
    this.model = model;
  }

  private liftVisual(): number {
    return this.model.getValue('staticLift') * SCENE.liftVisualPerMeter;
  }

  private pipeRadius(): number {
    return Math.max(SCENE.minPipeRadius, this.model.getValue('pipeDiameter') * SCENE.diameterVisualGain);
  }

  init(three: typeof THREE, scene: THREE.Scene): void {
    this.three = three;
    this.sceneRef = scene;

    scene.add(new three.AmbientLight(0x556070, 1.15));
    const key = new three.DirectionalLight(0xdfe8ff, 1.5);
    key.position.set(3, 8, 6);
    scene.add(key);
    const fill = new three.PointLight(0x99b8ff, 0.8, 40);
    fill.position.set(-6, 4, 4);
    scene.add(fill);
    this.disposables.push({ dispose: () => { scene.remove(key); scene.remove(fill); } });

    // Płyta podłoża — daje schematowi „stół warsztatowy", czytelny cień/kontrast.
    const floorGeo = new three.PlaneGeometry(30, 16);
    const floorMat = new three.MeshStandardMaterial({ color: 0x0a1020, roughness: 0.95, metalness: 0 });
    const floor = new three.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);
    this.disposables.push(floorGeo, floorMat, { dispose: () => scene.remove(floor) });

    this.machineGroup = new three.Group();
    scene.add(this.machineGroup);
    this.disposables.push({ dispose: () => scene.remove(this.machineGroup!) });

    this.buildComponents();
    this.buildParticles();
  }

  private mat(component: Component, opts: { metalness?: number; roughness?: number } = {}): THREE.MeshStandardMaterial {
    const three = this.three!;
    const m = new three.MeshStandardMaterial({
      color: COLOR[component],
      emissive: COLOR[component],
      emissiveIntensity: 0.12,
      metalness: opts.metalness ?? 0.35,
      roughness: opts.roughness ?? 0.5,
    });
    this.componentMat.set(component, m);
    this.disposables.push(m);
    return m;
  }

  private buildComponents(): void {
    const three = this.three!;
    const g = this.machineGroup!;
    const y = SCENE.baseY;

    // Zbiornik — otwarta skrzynia z powierzchnią wody.
    const tankGeo = new three.BoxGeometry(1.8, 1.4, 1.8);
    const tank = new three.Mesh(tankGeo, this.mat('reservoir', { metalness: 0.2, roughness: 0.6 }));
    tank.position.set(SCENE.reservoirX, y, 0);
    g.add(tank);
    this.disposables.push(tankGeo);

    // Pompa — walec (obudowa) + wirnik (schematyczny wskaźnik obrotu).
    const pumpGeo = new three.CylinderGeometry(0.75, 0.75, 1.1, 28);
    const pump = new three.Mesh(pumpGeo, this.mat('pump', { metalness: 0.6, roughness: 0.35 }));
    pump.position.set(SCENE.pumpX, y, 0);
    g.add(pump);
    this.disposables.push(pumpGeo);

    const impGeo = new three.BoxGeometry(1.0, 0.08, 0.18);
    const impMat = new three.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb347, emissiveIntensity: 0.4 });
    this.impeller = new three.Mesh(impGeo, impMat);
    this.impeller.position.set(SCENE.pumpX, y + 0.62, 0);
    g.add(this.impeller);
    this.disposables.push(impGeo, impMat);

    // Rura + pionowy wznios do wylotu (przebudowywane, gdy zmienia się D/H).
    this.rebuildPipe();

    // Wylot — krótki króciec na szczycie wzniosu.
    const outletGeo = new three.CylinderGeometry(0.28, 0.28, 0.5, 20);
    const outlet = new three.Mesh(outletGeo, this.mat('outlet', { metalness: 0.4, roughness: 0.4 }));
    outlet.position.set(SCENE.pipeEndX, y + this.liftVisual() + 0.3, 0);
    g.add(outlet);
    this.disposables.push(outletGeo, { dispose: () => { /* pozycja aktualizowana w syncScene */ } });
    this.outletMeshRef = outlet;
  }

  private outletMeshRef?: THREE.Mesh;

  /** Rura jako pochylony walec od pompy do podstawy wzniosu + pionowy wznios; średnica i wznios z PRAWDZIWYCH parametrów. */
  private rebuildPipe(): void {
    const three = this.three!;
    const g = this.machineGroup!;
    const y = SCENE.baseY;
    const r = this.pipeRadius();
    const lift = this.liftVisual();

    if (this.pipeMesh) { g.remove(this.pipeMesh); this.pipeMesh.geometry.dispose(); }
    if (this.outletRiser) { g.remove(this.outletRiser); this.outletRiser.geometry.dispose(); }

    // Główny bieg rury: od (pipeStartX, y) do (pipeEndX, y) — poziomy.
    const runLen = SCENE.pipeEndX - SCENE.pipeStartX;
    const runGeo = new three.CylinderGeometry(r, r, runLen, 24, 1, true);
    const pipeMat = this.componentMat.get('pipe') ?? this.mat('pipe', { metalness: 0.5, roughness: 0.4 });
    this.pipeMesh = new three.Mesh(runGeo, pipeMat);
    this.pipeMesh.rotation.z = Math.PI / 2;
    this.pipeMesh.position.set((SCENE.pipeStartX + SCENE.pipeEndX) / 2, y, 0);
    g.add(this.pipeMesh);

    // Pionowy wznios (wysokość podnoszenia) na końcu rury.
    const riserGeo = new three.CylinderGeometry(r, r, Math.max(0.05, lift), 24, 1, true);
    this.outletRiser = new three.Mesh(riserGeo, pipeMat);
    this.outletRiser.position.set(SCENE.pipeEndX, y + lift / 2, 0);
    g.add(this.outletRiser);

    this.renderedDiameter = this.model.getValue('pipeDiameter');
    this.renderedLift = this.model.getValue('staticLift');
  }

  private buildParticles(): void {
    const three = this.three!;
    const g = this.machineGroup!;
    const geo = new three.SphereGeometry(0.08, 10, 8);
    const mat = new three.MeshBasicMaterial({ color: 0xbfefff });
    this.disposables.push(geo, mat);
    for (let i = 0; i < SCENE.particleCount; i++) {
      const mesh = new three.Mesh(geo, mat);
      g.add(mesh);
      this.particles.push({ mesh, t: i / SCENE.particleCount });
    }
  }

  /** Ścieżka cząstki: zbiornik → pompa → rura → wznios → wylot, jako funkcja t∈[0,1]. */
  private pathAt(t: number): [number, number, number] {
    const y = SCENE.baseY;
    const lift = this.liftVisual();
    // Segmenty proporcjonalne do długości poglądowej.
    const p0: [number, number, number] = [SCENE.reservoirX + 0.4, y, 0];
    const p1: [number, number, number] = [SCENE.pipeStartX, y, 0];
    const p2: [number, number, number] = [SCENE.pipeEndX, y, 0];
    const p3: [number, number, number] = [SCENE.pipeEndX, y + lift, 0];
    const segs: [number, [number, number, number], [number, number, number]][] = [
      [0.18, p0, p1],
      [0.6, p1, p2],
      [0.22, p2, p3],
    ];
    let acc = 0;
    for (const [frac, a, b] of segs) {
      if (t <= acc + frac || frac === segs[segs.length - 1][0]) {
        const local = Math.min(1, (t - acc) / frac);
        return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local, a[2] + (b[2] - a[2]) * local];
      }
      acc += frac;
    }
    return p3;
  }

  update(dt: number): void {
    // Prędkość cząstek ∝ prawdziwej flowVelocity; łagodne skalowanie do sceny.
    const v = this.model.getValue('flowVelocity');
    const speed = Math.min(0.6, 0.04 + v * 0.02);
    for (const p of this.particles) {
      p.t = (p.t + dt * speed) % 1;
    }
    if (this.impeller) this.impeller.rotation.y += dt * Math.min(12, 1 + v * 1.5);
    if (this.waveElapsed !== Infinity) this.waveElapsed += dt;
  }

  syncScene(): void {
    if (this.model.getValue('pipeDiameter') !== this.renderedDiameter || this.model.getValue('staticLift') !== this.renderedLift) {
      this.rebuildPipe();
      if (this.outletMeshRef) this.outletMeshRef.position.set(SCENE.pipeEndX, SCENE.baseY + this.liftVisual() + 0.3, 0);
    }
    for (const p of this.particles) {
      const [x, y, z] = this.pathAt(p.t);
      p.mesh.position.set(x, y, z);
    }
    this.applyPulses();
  }

  // ---------------- Fala przyczynowa po komponentach ----------------

  /**
   * Wyzwala falę przyczynową na podstawie PRAWDZIWYCH kroków propagacji.
   * Każdy krok mapuje się na komponent maszyny (NODE_TO_COMPONENT); komponenty
   * „zapalają się" w kolejności, w jakiej węzły faktycznie zostały przeliczone.
   * To wizualizacja przebiegu OBLICZENIA przez maszynę, nie ozdoba.
   */
  emitComponentWave(steps: PropagationStep[]): void {
    const ordered: Component[] = [];
    for (const s of steps) {
      const c = NODE_TO_COMPONENT[s.nodeId];
      if (c && !ordered.includes(c)) ordered.push(c);
    }
    if (ordered.length === 0) { this.waveElapsed = Infinity; return; }
    this.pulses = ordered.map((component, i) => ({ component, startAt: i * this.PULSE_GAP }));
    this.waveElapsed = 0;
  }

  private applyPulses(): void {
    // Baza emisji + ewentualny rozbłysk gasnący po przejściu fali.
    for (const [, m] of this.componentMat) m.emissiveIntensity = 0.12;
    if (this.waveElapsed === Infinity) return;
    let anyActive = false;
    for (const pulse of this.pulses) {
      const since = this.waveElapsed - pulse.startAt;
      if (since < 0) { anyActive = true; continue; }
      if (since > this.PULSE_DECAY) continue;
      anyActive = true;
      const m = this.componentMat.get(pulse.component);
      if (m) {
        const glow = 0.12 + 1.5 * (1 - since / this.PULSE_DECAY);
        m.emissiveIntensity = Math.max(m.emissiveIntensity, glow);
      }
    }
    if (!anyActive) this.waveElapsed = Infinity;
  }

  // ---------------- Porównanie gałęzi (duch) ----------------

  /** Pokazuje DRUGĄ maszynę (inna gałąź) jako półprzezroczysty schemat, przesunięty w Z — realne, jednoczesne porównanie geometrii dwóch policzonych stanów. */
  showGhost(params: Record<string, number>): void {
    const three = this.three;
    const scene = this.sceneRef;
    if (!three || !scene) return;
    this.clearGhost();

    const d = params.pipeDiameter ?? this.model.getValue('pipeDiameter');
    const lift = (params.staticLift ?? this.model.getValue('staticLift')) * SCENE.liftVisualPerMeter;
    const r = Math.max(SCENE.minPipeRadius, d * SCENE.diameterVisualGain);
    const y = SCENE.baseY;

    this.ghostGroup = new three.Group();
    this.ghostGroup.position.set(0, 0, -4);
    scene.add(this.ghostGroup);

    const ghostMat = new three.MeshStandardMaterial({ color: 0xf0b35c, transparent: true, opacity: 0.35, emissive: 0xf0b35c, emissiveIntensity: 0.1 });
    const runLen = SCENE.pipeEndX - SCENE.pipeStartX;
    const runGeo = new three.CylinderGeometry(r, r, runLen, 20, 1, true);
    const run = new three.Mesh(runGeo, ghostMat);
    run.rotation.z = Math.PI / 2;
    run.position.set((SCENE.pipeStartX + SCENE.pipeEndX) / 2, y, 0);
    this.ghostGroup.add(run);

    const riserGeo = new three.CylinderGeometry(r, r, Math.max(0.05, lift), 20, 1, true);
    const riser = new three.Mesh(riserGeo, ghostMat);
    riser.position.set(SCENE.pipeEndX, y + lift / 2, 0);
    this.ghostGroup.add(riser);
  }

  clearGhost(): void {
    if (this.ghostGroup && this.sceneRef) this.sceneRef.remove(this.ghostGroup);
    this.ghostGroup?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    });
    this.ghostGroup = undefined;
  }

  getDefaultFraming(): CameraFraming {
    // Kadrowanie zależne od aspektu: układ jest szeroki (~13 j.), więc na wąskim
    // ekranie portretowym (telefon) kamera musi się cofnąć, żeby zbiornik i wylot
    // się zmieściły. Odległość liczymy z poziomego pola widzenia (vFOV 50°).
    // Panel dolny zasłania ~2/3 ekranu, więc celujemy PONIŻEJ maszyny — obiekty
    // nad punktem lookAt rzutują się powyżej środka, w widoczny górny pas.
    const aspect = realityEngine.viewportAspect || 1.6;
    const halfSpan = 7.5; // połowa rozpiętości maszyny + margines
    const tanHalfH = 0.4663 * Math.max(aspect, 0.42); // 0.4663 = tan(25°)
    const dist = Math.min(34, Math.max(11, halfSpan / tanHalfH));
    const lift = this.liftVisual();
    return { position: [-0.5, dist * 0.27, dist], lookAt: [-0.5, -dist * 0.3 + lift * 0.4, 0] };
  }

  getStats(): Record<string, number> {
    return {
      flowVelocity: this.model.getValue('flowVelocity'),
      reynolds: this.model.getValue('reynolds'),
      headLoss: this.model.getValue('headLoss'),
      totalHead: this.model.getValue('totalHead'),
      shaftPower: this.model.getValue('shaftPower'),
    };
  }

  /**
   * Ciągły lot kamery odwiedzający komponenty w kolejności realnej propagacji
   * (steps z ModelGraph). Warstwa KINOWA — trasa jest reżyserska, ale KOLEJNOŚĆ
   * pochodzi z faktycznego przeliczenia grafu, nie z animacji.
   */
  buildConsequenceFlight(steps: PropagationStep[]): CameraFlight | null {
    const componentPos: Record<Component, [number, number, number]> = {
      reservoir: [SCENE.reservoirX, SCENE.baseY + 2.5, 5.5],
      pump: [SCENE.pumpX, SCENE.baseY + 2, 4.5],
      pipe: [1, SCENE.baseY + 2.4, 5.5],
      outlet: [SCENE.pipeEndX, SCENE.baseY + this.liftVisual() + 2, 5],
    };
    const lookAt: Record<Component, [number, number, number]> = {
      reservoir: [SCENE.reservoirX, SCENE.baseY, 0],
      pump: [SCENE.pumpX, SCENE.baseY, 0],
      pipe: [1, SCENE.baseY, 0],
      outlet: [SCENE.pipeEndX, SCENE.baseY + this.liftVisual(), 0],
    };
    const seen: Component[] = [];
    for (const s of steps) {
      const c = NODE_TO_COMPONENT[s.nodeId];
      if (c && !seen.includes(c)) seen.push(c);
    }
    if (seen.length === 0) return null;
    const frames: FlightKeyframe[] = [];
    let t = 0;
    const home = this.getDefaultFraming();
    frames.push({ t, position: home.position as [number, number, number], lookAt: home.lookAt as [number, number, number], label: 'Maszyna — stan wyjściowy' });
    const compLabel: Record<Component, string> = {
      reservoir: 'Zbiornik', pump: 'Pompa', pipe: 'Rurociąg', outlet: 'Wylot',
    };
    for (const c of seen) {
      t += 1.5;
      frames.push({ t, position: componentPos[c], lookAt: lookAt[c], label: compLabel[c] });
    }
    t += 1.6;
    frames.push({ t, position: home.position as [number, number, number], lookAt: home.lookAt as [number, number, number], label: 'Nowy stan ustalony' });
    if (frames.length < 2) return null;
    return new CameraFlight(frames);
  }

  dispose(): void {
    this.clearGhost();
    for (const p of this.particles) this.machineGroup?.remove(p.mesh);
    this.particles = [];
    if (this.pipeMesh) { this.pipeMesh.geometry.dispose(); }
    if (this.outletRiser) { this.outletRiser.geometry.dispose(); }
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.componentMat.clear();
    this.pulses = [];
    this.waveElapsed = Infinity;
  }
}
