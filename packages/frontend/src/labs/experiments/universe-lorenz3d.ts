import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { Sim3D } from '../../core/three/types';
import { lorenzChaosThreshold, stepLorenzRK4, type LorenzState } from '../../core/physics';

/**
 * Atraktor Lorenza — trzeci przykład chaosu deterministycznego w Genesis
 * OS, obok problemu trzech ciał i podwójnego wahadła. Klasyczne równania
 * Lorenza (1963): dx/dt=σ(y−x), dy/dt=x(ρ−z)−y, dz/dt=xy−βz, całkowane
 * RK4 (core/physics.ts: stepLorenzRK4 — ta sama metoda numeryczna co
 * reszta platformy). σ=10, β=8/3 stałe (klasyczne wartości Lorenza);
 * suwak ρ pokazuje przejście od dwóch stabilnych punktów stałych
 * (ρ<ρ_h≈24,74) do chaotycznego "motyla" (ρ powyżej progu, np. klasyczne
 * ρ=28) — analogiczne do suwaka kąta w podwójnym wahadle.
 */

const SCALE = 0.35; // jednostki sceny na jednostkę współrzędnych Lorenza
const MAX_TRAIL = 2400;
const SIGMA = 10;
const BETA = 8 / 3;

function makeTrailLine(three: typeof THREE, scene: THREE.Scene, color: number): { line: THREE.Line; geo: THREE.BufferGeometry } {
  const geo = new three.BufferGeometry();
  geo.setAttribute('position', new three.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
  geo.setDrawRange(0, 0);
  const mat = new three.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const line = new three.Line(geo, mat);
  scene.add(line);
  return { line, geo };
}

class Lorenz3DSim implements Sim3D {
  private t = 0;
  private rho = 28;
  private divergence = false;
  private stateA: LorenzState = { x: 0.1, y: 0, z: 0 };
  private stateB: LorenzState = { x: 0.1 + 1e-4, y: 0, z: 0 };
  private trailA: { x: number; y: number; z: number }[] = [];
  private trailB: { x: number; y: number; z: number }[] = [];
  private three?: typeof THREE;
  private scene?: THREE.Scene;
  private lineA?: THREE.Line;
  private geoA?: THREE.BufferGeometry;
  private lineB?: THREE.Line;
  private geoB?: THREE.BufferGeometry;
  private disposables: { dispose(): void }[] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.scene = scene;
    scene.add(new three.AmbientLight(0x223344, 0.8));

    const a = makeTrailLine(three, scene, 0x5cd6e8);
    this.lineA = a.line;
    this.geoA = a.geo;
    this.disposables.push(a.geo, a.line.material as THREE.Material);

    // Widok niemal wzdłuż osi y Lorenza (scene.z) pokazuje klasyczny,
    // rozpoznawalny "kształt motyla" (x poziomo, z pionowo) — kamera
    // patrząca głównie z boku (duże scene.x) daje nierozróżnialny,
    // wąski profil, bo oba "skrzydła" nakładają się na siebie.
    camera.position.set(14, 13, 70);
    camera.lookAt(0, 27 * SCALE, 0);
  }

  reset = () => {
    this.stateA = { x: 0.1, y: 0, z: 0 };
    this.stateB = { x: 0.1 + 1e-4, y: 0, z: 0 };
    this.trailA = [];
    this.trailB = [];
    this.t = 0;
  };

  private ensureLineB() {
    if (this.lineB || !this.three || !this.scene) return;
    const b = makeTrailLine(this.three, this.scene, 0xf0b35c);
    this.lineB = b.line;
    this.geoB = b.geo;
    this.disposables.push(b.geo, b.line.material as THREE.Material);
  }

  private removeLineB() {
    if (!this.lineB || !this.scene) return;
    this.scene.remove(this.lineB);
    this.geoB?.dispose();
    (this.lineB.material as THREE.Material).dispose();
    this.lineB = undefined;
    this.geoB = undefined;
    this.trailB = [];
  }

  update(dt: number, p: SimParams) {
    this.rho = Number(p.rho);
    const wantDivergence = Boolean(p.divergence);
    if (wantDivergence !== this.divergence) {
      this.divergence = wantDivergence;
      if (wantDivergence) {
        this.ensureLineB();
        this.stateB = { x: this.stateA.x + 1e-4, y: this.stateA.y, z: this.stateA.z };
        this.trailB = [];
      } else {
        this.removeLineB();
      }
    }

    const dtSim = 0.01;
    const steps = Math.round(dt * 1400);
    for (let i = 0; i < steps; i++) {
      this.stateA = stepLorenzRK4(this.stateA, dtSim, SIGMA, this.rho, BETA);
      if (this.divergence) this.stateB = stepLorenzRK4(this.stateB, dtSim, SIGMA, this.rho, BETA);
      this.t += dtSim;
    }
    this.trailA.push({ x: this.stateA.x * SCALE, y: this.stateA.z * SCALE, z: this.stateA.y * SCALE });
    if (this.trailA.length > MAX_TRAIL) this.trailA.shift();
    if (this.divergence) {
      this.trailB.push({ x: this.stateB.x * SCALE, y: this.stateB.z * SCALE, z: this.stateB.y * SCALE });
      if (this.trailB.length > MAX_TRAIL) this.trailB.shift();
    }
  }

  syncScene() {
    if (this.geoA && this.lineA) {
      const posAttr = this.geoA.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.trailA.length; i++) {
        posAttr.setXYZ(i, this.trailA[i].x, this.trailA[i].y, this.trailA[i].z);
      }
      posAttr.needsUpdate = true;
      this.geoA.setDrawRange(0, this.trailA.length);
    }
    if (this.geoB && this.lineB) {
      const posAttr = this.geoB.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.trailB.length; i++) {
        posAttr.setXYZ(i, this.trailB[i].x, this.trailB[i].y, this.trailB[i].z);
      }
      posAttr.needsUpdate = true;
      this.geoB.setDrawRange(0, this.trailB.length);
    }
  }

  getStats() {
    const dist = this.divergence
      ? Math.sqrt(
          (this.stateA.x - this.stateB.x) ** 2 +
            (this.stateA.y - this.stateB.y) ** 2 +
            (this.stateA.z - this.stateB.z) ** 2,
        )
      : 0;
    return {
      rho: Math.round(this.rho * 100) / 100,
      z: Math.round(this.stateA.z * 100) / 100,
      divergence: Math.round(dist * 10000) / 10000,
    };
  }

  dispose() {
    this.geoA?.dispose();
    (this.lineA?.material as THREE.Material | undefined)?.dispose();
    this.removeLineB();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

export const universeLorenz3D: ExperimentDef = {
  id: 'lorenz',
  name: 'Atraktor Lorenza',
  honesty: 'exact',
  honestyNote:
    'Dokładne, klasyczne równania Lorenza (1963) — uproszczony (3 zmienne) model konwekcji atmosferycznej, NIE symulacja prawdziwej pogody. σ=10 i β=8/3 to oryginalne stałe Lorenza; próg chaosu ρ_h=σ(σ+β+3)/(σ−β−1)≈24,74 (Sparrow 1982) to dokładny wzór matematyczny, nie oszacowanie. Całkowanie RK4 z krokiem 0,01 — jak każda symulacja numeryczna, długoterminowy tor OSTATECZNIE rozjeżdża się od "prawdziwego" rozwiązania analitycznego (błąd numeryczny rośnie wykładniczo w układzie chaotycznym, dokładnie tak jak realny błąd pomiaru) — to nie wada tej symulacji, to podstawowa własność chaosu, o której traktuje cały eksperyment.',
  params: [
    {
      key: 'rho', label: 'ρ (liczba Rayleigha)', type: 'slider',
      min: 5, max: 40, step: 0.5, default: 28,
      format: (v) => v.toFixed(1),
    },
    { key: 'divergence', label: 'Pokaż drugi, niemal identyczny start (efekt motyla)', type: 'toggle', default: false },
  ],
  createSim3D: () => new Lorenz3DSim(),
  narrate(p, stats) {
    const rho = Number(p.rho);
    const divergence = Boolean(p.divergence);
    const threshold = lorenzChaosThreshold(SIGMA, BETA);
    const z = Number(stats.z ?? 0);
    const dist = Number(stats.divergence ?? 0);
    const blocks = [
      {
        title: `ρ=${rho.toFixed(1)} vs próg chaosu ρ_h≈${threshold.toFixed(2)}`,
        body:
          rho < threshold
            ? `Poniżej progu ${threshold.toFixed(2)} układ osiada w jednym z dwóch symetrycznych, stabilnych punktów stałych (odpowiadających dwóm kierunkom obrotu konwekcyjnego) — tor przestaje "skakać" i owija się ciasno wokół jednego z nich. Zwiększ ρ powyżej progu, żeby zobaczyć homokliniczny "wybuch" do chaosu.`
            : `Powyżej progu ${threshold.toFixed(2)} oba punkty stałe stają się niestabilne — tor nieskończenie owija się to wokół jednego, to wokół drugiego "skrzydła motyla", nigdy dokładnie się nie powtarzając (atraktor dziwny). Aktualna wysokość z=${z.toFixed(1)} mówi, w którym skrzydle jest teraz trajektoria.`,
      },
    ];
    if (divergence) {
      blocks.push({
        title: `Efekt motyla: rozjazd = ${dist.toFixed(4)} jednostek`,
        body: `Dwa tory zaczęły się od punktów oddalonych o 0,0001 jednostki — mniej niż grubość linii na ekranie. W układzie chaotycznym (ρ powyżej progu) taka różnica rośnie WYKŁADNICZO z czasem (dodatni wykładnik Lapunowa), więc po chwili tory są całkowicie niezależne — to właśnie ta wrażliwość na warunki początkowe dała nazwę "efekt motyla" (Lorenz, wykład 1972: "Czy trzepot skrzydeł motyla w Brazylii wywołuje tornado w Teksasie?"). Poniżej progu chaosu oba tory zbiegają do TEGO SAMEGO punktu stałego — różnica zanika zamiast rosnąć.`,
      });
    }
    return blocks;
  },
};
