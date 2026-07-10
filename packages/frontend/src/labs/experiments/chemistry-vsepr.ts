import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { Sim3D } from '../../core/three/types';

/**
 * VSEPR (Valence Shell Electron Pair Repulsion) — teoria odpychania par
 * elektronowych powłoki walencyjnej (Gillespie & Nyholm, 1957): domeny
 * elektronowe (wiązania I wolne pary) wokół atomu centralnego układają się
 * tak, by zminimalizować wzajemne odpychanie. To dobrze potwierdzona,
 * standardowa teoria (★★★★★ jako model geometrii molekularnej), używana
 * do dziś w każdym kursie chemii ogólnej.
 *
 * Pozycje domen: dla geometrii BEZ wolnych par użyto dokładnych wierzchołków
 * bryły platońskiej (tetraedr/oktaedr) lub równomiernego rozkładu na okręgu
 * (trygonalna/bipiramida trygonalna) — to czysta geometria, nie przybliżenie.
 * Dla dwóch klasycznych, najczęściej cytowanych przypadków ODCHYLENIA od
 * kąta idealnego (NH₃: 106,8°, H₂O: 104,5° — obie zmierzone, NIST/CCCBDB)
 * geometria jest dopasowana do PRAWDZIWEGO zmierzonego kąta, nie idealnego.
 * Dla pozostałych geometrii z wolnymi parami (SF₄, ClF₃, XeF₂, BrF₅, XeF₄)
 * użyto pozycji idealnych "rodzica" (bipiramida trygonalna / oktaedr) —
 * realne kąty w tych cząsteczkach odbiegają o kilka stopni od idealnych z
 * tego samego powodu (wolna para odpycha silniej niż para wiążąca), co
 * jest jawnie zaznaczone w honestyNote, zamiast udawać fałszywą precyzję.
 */

type Vec3 = [number, number, number];

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

const TETRA_VERTS: Vec3[] = ([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as Vec3[]).map(normalize3);

const OCTA_VERTS: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function trigPlanar(): Vec3[] {
  return [90, 210, 330].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [Math.cos(a), 0, Math.sin(a)] as Vec3;
  });
}

const LINEAR_VERTS: Vec3[] = [[0, 1, 0], [0, -1, 0]];

function trigBipy(): Vec3[] {
  return [[0, 1, 0], [0, -1, 0], ...trigPlanar()];
}

/**
 * n=2 lub n=3 wektory na "stożku" wokół osi Y, których WZAJEMNY kąt jest
 * DOKŁADNIE równy zmierzonemu realAngleDeg — geometria dopasowana do
 * prawdziwego pomiaru (NH₃ 106,8°, H₂O 104,5°), nie odwrotnie. Wyprowadzenie
 * dla n=3 (azymut 120° między sąsiadami): cos(γ) = cos²θ − ½sin²θ.
 */
export function bentCone(n: 2 | 3, realAngleDeg: number, openUp: boolean, swapAxis = false): Vec3[] {
  const gamma = (realAngleDeg * Math.PI) / 180;
  const sign = openUp ? 1 : -1;
  if (n === 2) {
    const half = gamma / 2;
    const y = Math.cos(half) * sign;
    const s = Math.sin(half);
    return swapAxis ? [[0, y, s], [0, y, -s]] : [[s, y, 0], [-s, y, 0]];
  }
  const cos2Theta = (Math.cos(gamma) + 0.5) / 1.5;
  const cosTheta = Math.sqrt(Math.max(0, cos2Theta));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cos2Theta));
  const y = cosTheta * sign;
  const out: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const phi = (i / 3) * Math.PI * 2;
    out.push([sinTheta * Math.cos(phi), y, sinTheta * Math.sin(phi)]);
  }
  return out;
}

export interface VseprShape {
  id: string;
  name: string;
  example: string;
  bonding: number;
  lone: number;
  /** Etykieta kąta do wyświetlenia (może być zakres, np. „90°/120°"). */
  angleLabel: string;
  /** Czy angleLabel to zmierzona, dokładna wartość (NH₃/H₂O) czy idealizacja rodzica. */
  angleMeasured: boolean;
  bondingVecs: Vec3[];
  loneVecs: Vec3[];
}

export const VSEPR_SHAPES: VseprShape[] = [
  { id: 'ax2', name: 'Liniowa (AX₂)', example: 'BeCl₂, CO₂', bonding: 2, lone: 0, angleLabel: '180°', angleMeasured: false, bondingVecs: LINEAR_VERTS, loneVecs: [] },
  { id: 'ax3', name: 'Trygonalna płaska (AX₃)', example: 'BF₃', bonding: 3, lone: 0, angleLabel: '120°', angleMeasured: false, bondingVecs: trigPlanar(), loneVecs: [] },
  { id: 'ax2e1', name: 'Kątowa, 3 domeny (AX₂E)', example: 'SO₂', bonding: 2, lone: 1, angleLabel: '~119° (idealnie 120°)', angleMeasured: false, bondingVecs: trigPlanar().slice(0, 2), loneVecs: trigPlanar().slice(2, 3) },
  { id: 'ax4', name: 'Tetraedryczna (AX₄)', example: 'CH₄', bonding: 4, lone: 0, angleLabel: '109,5°', angleMeasured: false, bondingVecs: TETRA_VERTS, loneVecs: [] },
  { id: 'ax3e1', name: 'Piramida trygonalna (AX₃E)', example: 'NH₃', bonding: 3, lone: 1, angleLabel: '106,8°', angleMeasured: true, bondingVecs: bentCone(3, 106.8, false), loneVecs: [[0, 1, 0]] },
  { id: 'ax2e2', name: 'Kątowa, 4 domeny (AX₂E₂)', example: 'H₂O', bonding: 2, lone: 2, angleLabel: '104,5°', angleMeasured: true, bondingVecs: bentCone(2, 104.5, true), loneVecs: bentCone(2, 115, false, true) },
  { id: 'ax5', name: 'Bipiramida trygonalna (AX₅)', example: 'PCl₅', bonding: 5, lone: 0, angleLabel: '90° / 120°', angleMeasured: false, bondingVecs: trigBipy(), loneVecs: [] },
  { id: 'ax4e1', name: 'Huśtawka (AX₄E)', example: 'SF₄', bonding: 4, lone: 1, angleLabel: '~89° / 119° / 173° (idealizacja)', angleMeasured: false, bondingVecs: trigBipy().slice(0, 4), loneVecs: trigBipy().slice(4, 5) },
  { id: 'ax3e2', name: 'Kształt T (AX₃E₂)', example: 'ClF₃', bonding: 3, lone: 2, angleLabel: '~87,5° (idealnie 90°)', angleMeasured: false, bondingVecs: [trigBipy()[0], trigBipy()[1], trigBipy()[2]], loneVecs: [trigBipy()[3], trigBipy()[4]] },
  { id: 'ax2e3', name: 'Liniowa, 5 domen (AX₂E₃)', example: 'XeF₂', bonding: 2, lone: 3, angleLabel: '180°', angleMeasured: false, bondingVecs: [trigBipy()[0], trigBipy()[1]], loneVecs: trigBipy().slice(2, 5) },
  { id: 'ax6', name: 'Oktaedryczna (AX₆)', example: 'SF₆', bonding: 6, lone: 0, angleLabel: '90°', angleMeasured: false, bondingVecs: OCTA_VERTS, loneVecs: [] },
  { id: 'ax5e1', name: 'Piramida kwadratowa (AX₅E)', example: 'BrF₅', bonding: 5, lone: 1, angleLabel: '~84,8° (idealnie 90°)', angleMeasured: false, bondingVecs: OCTA_VERTS.slice(0, 5), loneVecs: OCTA_VERTS.slice(5, 6) },
  { id: 'ax4e2', name: 'Kwadratowa płaska (AX₄E₂)', example: 'XeF₄', bonding: 4, lone: 2, angleLabel: '90°', angleMeasured: false, bondingVecs: [OCTA_VERTS[0], OCTA_VERTS[1], OCTA_VERTS[4], OCTA_VERTS[5]], loneVecs: [OCTA_VERTS[2], OCTA_VERTS[3]] },
];

const BOND_LEN = 1.3;
const LONE_LEN = 0.75;
const ATOM_COLOR = 0x5cd6e8;
const CENTER_COLOR = 0xf0b35c;
const LONE_COLOR = 0xe879f9;

class VseprSim implements Sim3D {
  private group?: THREE.Group;
  private disposables: { dispose(): void }[] = [];
  private lastShapeId = '';
  private t = 0;
  private angle = 0;
  private three?: typeof THREE;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    scene.add(new three.AmbientLight(0x445066, 1.1));
    const light = new three.PointLight(0xffffff, 1.4, 0, 0.1);
    light.position.set(3, 4, 5);
    scene.add(light);
    camera.position.set(2.6, 2.0, 3.6);
    camera.lookAt(0, 0, 0);
  }

  reset = () => {
    this.angle = 0;
  };

  private rebuild(scene: THREE.Scene, shapeId: string) {
    const three = this.three!;
    if (this.group) {
      scene.remove(this.group);
      for (const d of this.disposables) d.dispose();
      this.disposables = [];
    }
    const shape = VSEPR_SHAPES.find((s) => s.id === shapeId) ?? VSEPR_SHAPES[0];
    this.lastShapeId = shapeId;
    const group = new three.Group();

    const centerGeo = new three.SphereGeometry(0.36, 24, 24);
    const centerMat = new three.MeshStandardMaterial({ color: CENTER_COLOR, roughness: 0.5, metalness: 0.1 });
    const centerMesh = new three.Mesh(centerGeo, centerMat);
    group.add(centerMesh);
    this.disposables.push(centerGeo, centerMat);

    const bondGeo = new three.CylinderGeometry(0.06, 0.06, 1, 12);
    const bondMat = new three.MeshStandardMaterial({ color: 0x8d97b4, roughness: 0.6 });
    this.disposables.push(bondGeo, bondMat);
    const atomGeo = new three.SphereGeometry(0.26, 20, 20);
    const atomMat = new three.MeshStandardMaterial({ color: ATOM_COLOR, roughness: 0.5, metalness: 0.05 });
    this.disposables.push(atomGeo, atomMat);

    for (const v of shape.bondingVecs) {
      const dir = new three.Vector3(v[0], v[1], v[2]);
      const bond = new three.Mesh(bondGeo, bondMat);
      bond.position.copy(dir.clone().multiplyScalar(BOND_LEN / 2));
      bond.quaternion.setFromUnitVectors(new three.Vector3(0, 1, 0), dir);
      bond.scale.set(1, BOND_LEN, 1);
      group.add(bond);

      const atom = new three.Mesh(atomGeo, atomMat);
      atom.position.copy(dir.clone().multiplyScalar(BOND_LEN));
      group.add(atom);
    }

    const loneGeo = new three.SphereGeometry(0.3, 16, 16);
    const loneMat = new three.MeshStandardMaterial({ color: LONE_COLOR, roughness: 0.3, transparent: true, opacity: 0.45 });
    this.disposables.push(loneGeo, loneMat);
    for (const v of shape.loneVecs) {
      const dir = new three.Vector3(v[0], v[1], v[2]);
      const lone = new three.Mesh(loneGeo, loneMat);
      lone.position.copy(dir.clone().multiplyScalar(LONE_LEN));
      lone.name = 'lone';
      group.add(lone);
    }

    scene.add(group);
    this.group = group;
  }

  update(dt: number, p: SimParams) {
    this.t += dt;
    const shapeId = String(p.shape ?? 'ax4');
    if (shapeId !== this.lastShapeId) this.needsRebuild = shapeId;
    if (p.autoRotate) this.angle += dt * 0.4;
  }

  private needsRebuild: string | null = null;

  syncScene(scene: THREE.Scene) {
    if (this.needsRebuild) {
      this.rebuild(scene, this.needsRebuild);
      this.needsRebuild = null;
    }
    if (!this.group) return;
    this.group.rotation.y = this.angle;
    // Chmury wolnych par "oddychają" — motyw wizualny sygnalizujący, że to
    // chmura prawdopodobieństwa, nie punktowy obiekt (ta sama zasada co
    // orbitale w Atom Lab).
    const pulse = 1 + 0.08 * Math.sin(this.t * 2);
    for (const child of this.group.children) {
      if (child.name === 'lone') child.scale.setScalar(pulse);
    }
  }

  getStats() {
    const shape = VSEPR_SHAPES.find((s) => s.id === this.lastShapeId) ?? VSEPR_SHAPES[0];
    return { bonding: shape.bonding, lone: shape.lone, domains: shape.bonding + shape.lone };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

export const chemistryVsepr: ExperimentDef = {
  id: 'vsepr',
  name: 'Geometria molekularna (VSEPR)',
  honesty: 'educational',
  honestyNote:
    'Teoria VSEPR (Gillespie & Nyholm, 1957) jest dobrze potwierdzonym modelem geometrii molekularnej. Geometrie bez wolnych par (liniowa, trygonalna, tetraedryczna, bipiramida trygonalna, oktaedryczna) to dokładna geometria brył/rozkładów na okręgu. Dla NH₃ i H₂O kąty wiązań są PRAWDZIWYMI zmierzonymi wartościami (106,8° i 104,5°, NIST/CCCBDB). Dla pozostałych geometrii z wolnymi parami (SF₄, ClF₃, XeF₂, BrF₅, XeF₄) pokazano pozycje IDEALNE bryły-rodzica — realne kąty w tych cząsteczkach odbiegają o kilka stopni (wolna para odpycha silniej niż para wiążąca), co tu jest jawnie zaznaczone, nie udawana fałszywa precyzja. Kolory atomów są schematyczne, nie prawdziwymi kolorami pierwiastków.',
  params: [
    {
      key: 'shape', label: 'Geometria (typ AXₙEₘ)', type: 'select', default: 'ax4',
      options: VSEPR_SHAPES.map((s) => ({ value: s.id, label: `${s.name} — ${s.example}` })),
    },
    { key: 'autoRotate', label: 'Automatyczny obrót', type: 'toggle', default: true },
  ],
  createSim3D: () => new VseprSim(),
  narrate(p, stats) {
    const shapeId = String(p.shape ?? 'ax4');
    const shape = VSEPR_SHAPES.find((s) => s.id === shapeId) ?? VSEPR_SHAPES[0];
    const domains = Number(stats.domains ?? shape.bonding + shape.lone);
    return [
      {
        title: `${shape.name}: ${domains} domen elektronowych`,
        body: `Przykład: ${shape.example}. ${shape.bonding} ${shape.bonding === 1 ? 'para wiążąca' : 'par wiążących'} (niebieskie atomy) ${shape.lone > 0 ? `+ ${shape.lone} ${shape.lone === 1 ? 'wolna para' : 'wolne pary'} (fioletowe „chmury", bez atomu na końcu)` : 'i brak wolnych par'} — wszystkie domeny odpychają się nawzajem i układają tak, by zmaksymalizować odległości między sobą. Kąt: ${shape.angleLabel}.`,
        citation: shape.angleMeasured
          ? { source: 'NIST/CCCBDB (Computational Chemistry Comparison and Benchmark DataBase)', confirmation: 'confirmed' as const, note: 'Zmierzony/obliczony kąt wiązania' }
          : { source: 'Gillespie & Nyholm (1957), Quarterly Reviews', confirmation: shape.lone > 0 ? ('partial' as const) : ('confirmed' as const), note: shape.lone > 0 ? 'Pozycje idealne bryły-rodzica; realny kąt odbiega o kilka stopni' : 'Dokładna geometria bez wolnych par' },
      },
      shape.lone > 0
        ? {
            title: 'Dlaczego wolna para "zajmuje więcej miejsca"',
            body: 'Wolna para elektronowa jest przyciągana tylko przez JEDNO jądro (atomu centralnego), więc jej chmura jest bardziej rozmyta i silniej odpycha sąsiednie domeny niż para wiążąca (przyciągana przez DWA jądra, ciaśniej związana między nimi). Dlatego kąty między parami wiążącymi kurczą się poniżej idealnej wartości geometrycznej za każdym razem, gdy w grze jest wolna para — to realny, mierzalny efekt (NH₃: 106,8° zamiast 109,5°; H₂O: 104,5° zamiast 109,5°).',
          }
        : {
            title: 'Zero wolnych par: geometria czysto idealna',
            body: `Gdy wszystkie domeny elektronowe to wiązania, kąty odpowiadają dokładnie idealnej bryle geometrycznej (${shape.bonding === 2 ? 'linia' : shape.bonding === 3 ? 'trójkąt' : shape.bonding === 4 ? 'tetraedr' : shape.bonding === 5 ? 'bipiramida trygonalna' : 'oktaedr'}) — żadnych odchyleń do wyjaśniania.`,
          },
      {
        title: 'Skąd VSEPR w ogóle działa',
        body: 'Ronald Gillespie i Ronald Nyholm sformalizowali tę regułę w 1957 r., ale intuicja jest prosta: elektrony mają ten sam ładunek i odpychają się elektrostatycznie (prawo Coulomba) — układ minimalizujący energię to układ maksymalizujący wzajemne odległości domen na sferze wokół atomu centralnego. Dokładnie ten sam mechanizm co elektrony w Bohr Lab odpychające się na powłokach, tylko w 3D i dla całych par, nie pojedynczych elektronów.',
      },
    ];
  },
};
