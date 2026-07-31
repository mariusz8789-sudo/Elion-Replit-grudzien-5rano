import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { Sim3D } from '../../core/three/types';
import { TESSERACT_VERTICES, TESSERACT_EDGES, rotate4D, project4Dto3D, type Vec4 } from '../../core/physics';

/**
 * Tesserakt — hipersześcian 4D, obracany w 4D i rzutowany do 3D.
 * Fizyka/matematyka: CZYSTA i dokładna algebra liniowa (core/physics.ts:
 * rotate4D/project4Dto3D/TESSERACT_*) — nie model, nie przybliżenie. To
 * NIE jest twierdzenie o istnieniu fizycznych dodatkowych wymiarów
 * przestrzennych (por. teoria strun, 10/11 wymiarów — osobna, spekulacyjna
 * kwestia fizyki, świadomie NIE miesza się jej tutaj z tą matematyką).
 * Kolor krawędzi koduje współrzędną w (4. wymiar) — standardowa technika
 * wizualizacji obiektów 4D.
 */

const VIEWER_DISTANCE = 3;

class TesseractSim implements Sim3D {
  private angleXW = 0;
  private angleYZ = 0;
  private lineGeo?: THREE.BufferGeometry;
  private lineObj?: THREE.LineSegments;
  private vertGeo?: THREE.BufferGeometry;
  private vertObj?: THREE.Points;
  private disposables: { dispose(): void }[] = [];
  private projected: [number, number, number][] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const posAttr = new Float32Array(TESSERACT_EDGES.length * 2 * 3);
    const colAttr = new Float32Array(TESSERACT_EDGES.length * 2 * 3);
    this.lineGeo = new three.BufferGeometry();
    this.lineGeo.setAttribute('position', new three.BufferAttribute(posAttr, 3));
    this.lineGeo.setAttribute('color', new three.BufferAttribute(colAttr, 3));
    const lineMat = new three.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    this.lineObj = new three.LineSegments(this.lineGeo, lineMat);
    scene.add(this.lineObj);
    this.disposables.push(this.lineGeo, lineMat);

    const vPosAttr = new Float32Array(16 * 3);
    const vColAttr = new Float32Array(16 * 3);
    this.vertGeo = new three.BufferGeometry();
    this.vertGeo.setAttribute('position', new three.BufferAttribute(vPosAttr, 3));
    this.vertGeo.setAttribute('color', new three.BufferAttribute(vColAttr, 3));
    const vertMat = new three.PointsMaterial({ size: 0.09, vertexColors: true, sizeAttenuation: true });
    this.vertObj = new three.Points(this.vertGeo, vertMat);
    scene.add(this.vertObj);
    this.disposables.push(this.vertGeo, vertMat);

    scene.add(new three.AmbientLight(0x334466, 1));

    camera.position.set(2.6, 2.0, 4.2);
    camera.lookAt(0, 0, 0);
  }

  reset = () => {
    this.angleXW = 0;
    this.angleYZ = 0;
  };

  update(dt: number, p: SimParams) {
    const speed = Number(p.speed);
    this.angleXW += dt * speed * 0.5;
    if (p.doubleRotation) this.angleYZ += dt * speed * 0.33;

    this.projected = TESSERACT_VERTICES.map((v) => {
      let r: Vec4 = rotate4D(v, 'xw', this.angleXW);
      if (p.doubleRotation) r = rotate4D(r, 'yz', this.angleYZ);
      return project4Dto3D(r, VIEWER_DISTANCE);
    });
  }

  syncScene() {
    if (!this.lineGeo || !this.vertGeo) return;
    const posAttr = this.lineGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = this.lineGeo.attributes.color as THREE.BufferAttribute;
    TESSERACT_EDGES.forEach(([a, b], i) => {
      const pa = this.projected[a];
      const pb = this.projected[b];
      posAttr.setXYZ(i * 2, pa[0], pa[1], pa[2]);
      posAttr.setXYZ(i * 2 + 1, pb[0], pb[1], pb[2]);
      // Kolor krawędzi = średnia głębi w oryginalnych wierzchołków (4. wymiar)
      const wa = TESSERACT_VERTICES[a][3];
      const wb = TESSERACT_VERTICES[b][3];
      const t = (wa + wb) / 4 + 0.5; // -1..1 → 0..1
      setEdgeColor(colAttr, i * 2, t);
      setEdgeColor(colAttr, i * 2 + 1, t);
    });
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    const vPosAttr = this.vertGeo.attributes.position as THREE.BufferAttribute;
    const vColAttr = this.vertGeo.attributes.color as THREE.BufferAttribute;
    this.projected.forEach((p, i) => {
      vPosAttr.setXYZ(i, p[0], p[1], p[2]);
      const t = TESSERACT_VERTICES[i][3] / 2 + 0.5;
      setEdgeColor(vColAttr, i, t);
    });
    vPosAttr.needsUpdate = true;
    vColAttr.needsUpdate = true;
  }

  getStats() {
    return {
      angleXWDeg: Math.round(((this.angleXW * 180) / Math.PI) % 360),
      angleYZDeg: Math.round(((this.angleYZ * 180) / Math.PI) % 360),
    };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

function setEdgeColor(attr: THREE.BufferAttribute, index: number, t: number) {
  // Gradient cyan (w bliżej widza) → violet (w dalej) — koduje 4. współrzędną.
  const r = 0.36 + t * (0.66 - 0.36);
  const g = 0.84 - t * (0.84 - 0.55);
  const b = 0.91 - t * (0.91 - 0.98);
  attr.setXYZ(index, r, g, b);
}

export const multiverseTesseract: ExperimentDef = {
  id: 'tesseract',
  name: 'Tesserakt (4D)',
  honesty: 'exact',
  honestyNote:
    'Obrót i rzut są dokładną algebrą liniową (macierz obrotu w płaszczyźnie 4D + rzut perspektywiczny 4D→3D dzieleniem przez odległość wzdłuż osi w — ta sama technika co rzut 3D→2D w grafice, o wymiar wyżej), zero przybliżeń. To NIE jest twierdzenie, że fizyczne dodatkowe wymiary przestrzenne istnieją — teoria strun (10/11 wymiarów) to osobna, spekulacyjna kwestia fizyki, celowo tu nieporuszana. Kolor krawędzi koduje współrzędną w (4. wymiar) — bez tego kodu barwnego obrót 4D jest wizualnie nieodróżnialny od zwykłego oddychania bryły 3D.',
  params: [
    { key: 'speed', label: 'Prędkość obrotu w 4D', type: 'slider', min: 0, max: 2, step: 0.05, default: 0.5, unit: 'rad/s' },
    { key: 'doubleRotation', label: 'Podwójny obrót (XW + YZ jednocześnie)', type: 'toggle', default: false },
  ],
  createSim3D: () => new TesseractSim(),
  narrate(p, stats) {
    const deg = Number(stats.angleXWDeg ?? 0);
    const double = Boolean(p.doubleRotation);
    return [
      {
        title: `Obrót w płaszczyźnie XW: ${deg}°`,
        body: 'W 3D obracasz się WOKÓŁ osi (np. wokół Z). W 4D obracasz się W PŁASZCZYŹNIE (np. XW) — pojęcie "osi obrotu" nie uogólnia się wprost, bo płaszczyzna prostopadła do płaszczyzny obrotu w 4D jest 2-wymiarowa, nie jednowymiarowa. Dlatego tesserakt "oddycha" i zmienia kształt swojego cienia, mimo że jako bryła 4D wcale się nie zmienia — dokładnie tak samo jak cień obracającego się sześcianu 3D rzucony na ścianę zmienia kształt, choć sześcian jest sztywny.',
      },
      double
        ? {
            title: 'Dwie niezależne płaszczyzny naraz',
            body: 'W 4D istnieje sześć niezależnych płaszczyzn obrotu (XY, XZ, XW, YZ, YW, ZW) — w 3D tylko trzy. Obracasz teraz jednocześnie XW i YZ: dwa "osobne" obroty, które w 3D wzajemnie by się nie mieszały, tu składają się w jeden, bardziej złożony ruch.',
          }
        : {
            title: 'Kolor = czwarty wymiar',
            body: 'Nie da się narysować osi w prostopadłej do x, y, z na płaskim ekranie — dlatego głębię w 4D koduje kolor krawędzi (cyjan = bliżej, fiolet = dalej wzdłuż w). To ten sam trik, którym mapy geograficzne kodują wysokość kolorem zamiast czwartym wymiarem przestrzennym.',
          },
      {
        title: 'Skąd wiadomo, że to poprawne',
        body: 'Tesserakt ma dokładnie 16 wierzchołków (2⁴, wszystkie kombinacje ±1 w 4 współrzędnych) i 32 krawędzie (każdy wierzchołek łączy się z 4 sąsiadami różniącymi się jedną współrzędną — 16×4/2) — dokładnie tyle, ile widzisz. Ten sam wzór uogólnia sześcian (2³=8 wierzchołków, 3×8/2=12 krawędzi) na jeden wymiar wyżej.',
      },
    ];
  },
};
