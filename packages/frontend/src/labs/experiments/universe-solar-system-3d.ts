import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { Sim3D } from '../../core/three/types';
import { PLANETS, type PlanetData } from '../../data/solarSystem';
import { keplerPosition } from '../../core/physics';

/**
 * Prawdziwy Układ Słoneczny — wersja 3D (Three.js/WebGL) tego samego
 * eksperymentu co universe-solar-system.ts. ZERO nowej fizyki: ta sama
 * funkcja `keplerPosition` (dokładne rozwiązanie równania Keplera), te
 * same prawdziwe elementy orbitalne NASA (`data/solarSystem.ts`) — zmienia
 * się wyłącznie warstwa renderująca (patrz core/three/useThreeLoop.ts).
 *
 * Dodatkowe uczciwe uproszczenie WZGLĘDEM wersji 2D: orbity są tu
 * współpłaszczyznowe (płaszczyzna ekliptyki) — `data/solarSystem.ts` nie
 * przechowuje inklinacji orbitalnej (dla większości planet <3,5°, dla
 * Merkurego 7° — mała, ale realna różnica, celowo pominięta zamiast
 * zmyślona). Rozmiary planet: symboliczne (log promienia), NIE do skali
 * odległości — jak w wersji 2D, z tego samego powodu (Jowisz zasłoniłby
 * ekran w skali liniowej).
 */

interface PlanetView {
  data: PlanetData;
  scaleUnitsPerAu: number;
  radiusScene: number;
}

const SCENE_RADIUS_MAX = 42; // jednostki sceny dla orbity Neptuna

function makeGlowTexture(three: typeof THREE): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,246,216,0.9)');
  grad.addColorStop(0.35, 'rgba(240,179,92,0.35)');
  grad.addColorStop(1, 'rgba(240,179,92,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeStarfield(three: typeof THREE): THREE.Points {
  const N = 2600;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 260 + Math.random() * 340;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new three.BufferGeometry();
  geo.setAttribute('position', new three.BufferAttribute(positions, 3));
  const mat = new three.PointsMaterial({ color: 0xdfe6ff, size: 1.15, sizeAttenuation: true, transparent: true, opacity: 0.85 });
  return new three.Points(geo, mat);
}

class SolarSystem3DSim implements Sim3D {
  private daysElapsed = 0;
  private views: PlanetView[] = [];
  private planetMeshes: THREE.Mesh[] = [];
  private sunMesh?: THREE.Mesh;
  private glowSprite?: THREE.Sprite;
  private disposables: { dispose(): void }[] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const aMax = PLANETS[PLANETS.length - 1].semiMajorAxisAu;
    this.views = PLANETS.map((p) => {
      const displayA = SCENE_RADIUS_MAX * Math.sqrt(p.semiMajorAxisAu / aMax);
      return {
        data: p,
        scaleUnitsPerAu: displayA / p.semiMajorAxisAu,
        radiusScene: Math.max(0.22, Math.log10(p.radiusKm) * 0.24),
      };
    });

    const stars = makeStarfield(three);
    scene.add(stars);
    this.disposables.push(stars.geometry, stars.material as THREE.Material);

    const sunGeo = new three.SphereGeometry(2.4, 32, 32);
    const sunMat = new three.MeshBasicMaterial({ color: 0xfff3d6 });
    this.sunMesh = new three.Mesh(sunGeo, sunMat);
    scene.add(this.sunMesh);
    this.disposables.push(sunGeo, sunMat);

    const glowTex = makeGlowTexture(three);
    const glowMat = new three.SpriteMaterial({ map: glowTex, color: 0xf0b35c, transparent: true, blending: three.AdditiveBlending, depthWrite: false });
    this.glowSprite = new three.Sprite(glowMat);
    this.glowSprite.scale.set(16, 16, 1);
    scene.add(this.glowSprite);
    this.disposables.push(glowTex, glowMat);

    const sunLight = new three.PointLight(0xfff3d6, 4.2, 0, 0.08);
    scene.add(sunLight);
    scene.add(new three.AmbientLight(0x1c2540, 0.7));

    this.planetMeshes = [];
    for (const v of this.views) {
      const geo = new three.SphereGeometry(v.radiusScene, 28, 28);
      const mat = new three.MeshStandardMaterial({ color: v.data.color, roughness: 0.75, metalness: 0.05 });
      const mesh = new three.Mesh(geo, mat);
      scene.add(mesh);
      this.planetMeshes.push(mesh);
      this.disposables.push(geo, mat);

      const segs = 160;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const M = (i / segs) * Math.PI * 2;
        const pos = keplerPosition(v.data.semiMajorAxisAu, v.data.eccentricity, M);
        pts.push(new three.Vector3(pos.x * v.scaleUnitsPerAu, 0, pos.y * v.scaleUnitsPerAu));
      }
      const orbitGeo = new three.BufferGeometry().setFromPoints(pts);
      const orbitMat = new three.LineBasicMaterial({ color: 0xe6eaf5, transparent: true, opacity: 0.16 });
      const line = new three.LineLoop(orbitGeo, orbitMat);
      scene.add(line);
      this.disposables.push(orbitGeo, orbitMat);
    }

    // Kamera 3/4 z góry — pokazuje płaszczyznę ekliptyki pod kątem, żeby jej
    // spłaszczenie (patrz honestyNote) było w ogóle widoczne, nie krawędziowo.
    camera.position.set(0, SCENE_RADIUS_MAX * 0.62, SCENE_RADIUS_MAX * 0.95);
    camera.lookAt(0, 0, 0);
  }

  reset = () => {
    this.daysElapsed = 0;
  };

  update(dt: number, p: SimParams) {
    this.daysElapsed += dt * Number(p.speed);
  }

  syncScene() {
    if (this.sunMesh) this.sunMesh.rotation.y += 0.002;
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      const meanAnomaly = ((2 * Math.PI * this.daysElapsed) / v.data.periodDays) % (2 * Math.PI);
      const pos = keplerPosition(v.data.semiMajorAxisAu, v.data.eccentricity, meanAnomaly);
      const mesh = this.planetMeshes[i];
      mesh.position.set(pos.x * v.scaleUnitsPerAu, 0, pos.y * v.scaleUnitsPerAu);
      mesh.rotation.y += 0.008;
    }
  }

  getStats() {
    const mercuryOrbits = this.daysElapsed / PLANETS[0].periodDays;
    const earthOrbits = this.daysElapsed / PLANETS[2].periodDays;
    return {
      daysElapsed: Math.round(this.daysElapsed),
      mercuryOrbits: Math.round(mercuryOrbits * 100) / 100,
      earthOrbits: Math.round(earthOrbits * 100) / 100,
    };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

export const universeSolarSystem3D: ExperimentDef = {
  id: 'solar-system-3d',
  name: 'Układ Słoneczny 3D',
  honesty: 'exact',
  honestyNote:
    'Ta sama fizyka co „Prawdziwy Układ Słoneczny" (dokładne równanie Keplera, prawdziwe elementy orbitalne NASA) w scenie 3D (Three.js/WebGL): przeciągnij, by obrócić kamerę, uszczypnij/scrolluj, by przybliżyć. Dodatkowe uproszczenie wersji 3D: orbity współpłaszczyznowe — pominięte inklinacje orbitalne (rzeczywiste, ale małe: 0,003°–7°), bo brak ich w źródle danych (NASA Planetary Fact Sheet nie podaje inklinacji w użytym zestawie). Skala odległości skompresowana (√a), rozmiary planet symboliczne — identycznie jak w wersji 2D.',
  params: [
    {
      key: 'speed', label: 'Tempo czasu', type: 'slider',
      min: 1, max: 400, step: 1, default: 60, unit: 'dni/s',
    },
  ],
  createSim3D: () => new SolarSystem3DSim(),
  narrate(_p, stats) {
    const mercuryOrbits = Number(stats.mercuryOrbits ?? 0);
    const earthOrbits = Number(stats.earthOrbits ?? 0);
    return [
      {
        title: 'Ta sama fizyka, głębia 3D',
        body: `Widzisz dokładnie te same orbity co w płaskiej wersji — teraz z perspektywą: kąt kamery pokazuje, że wszystkie planety krążą blisko jednej płaszczyzny (ekliptyki), co samo w sobie jest śladem powstania Układu Słonecznego z jednego spłaszczonego dysku protoplanetarnego. Merkury: ${mercuryOrbits.toFixed(2)} okrążenia, Ziemia: ${earthOrbits.toFixed(2)}.`,
        citation: {
          source: 'NASA Planetary Fact Sheet',
          confirmation: 'confirmed',
          url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
          note: 'Elementy orbitalne wszystkich planet',
        },
      },
      {
        title: 'Dlaczego prawie płasko',
        body: 'Dysk protoplanetarny, z którego uformował się Układ Słoneczny 4,6 mld lat temu, spłaszczył się pod wpływem zachowania momentu pędu — dokładnie ten sam mechanizm, który spłaszcza pizzę rozkręcaną w powietrzu. Merkury ma największe odchylenie od tej płaszczyzny (7°) — w tej symulacji, tak jak w wersji 2D, ten szczegół jest pominięty.',
      },
    ];
  },
};
