import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { Sim3D } from '../../core/three/types';
import { dnaMeltingTempWallace } from '../../core/physics';

/**
 * Podwójna helisa DNA (B-DNA) — geometria Watson–Crick (1953, Nature 171,
 * 737), sparametryzowana rzeczywistymi wartościami zmierzonymi
 * krystalografią rentgenowską włókien (Franklin & Gosling 1953; Wang
 * 1979 dla dokładnego skrętu): promień ~1,0 nm, wzniesienie 0,34 nm na
 * parę zasad, ~10,5 pary zasad na skręt. Dwie nici NIE są diametralnie
 * naprzeciw siebie (przesunięcie ~120°/240°, nie 180°/180°) — stąd
 * asymetria rowka większego i mniejszego, realna cecha struktury DNA
 * (dokładne szerokości rowków w Å pominięte jako zbyt precyzyjne dla
 * tej wizualizacji, ale sama JAKOŚCIOWA asymetria jest pokazana wiernie).
 *
 * Topnienie: reguła Wallace'a Tm=2°C·(A+T)+4°C·(G+C) (Wallace i in.
 * 1979) — im więcej par G≡C (3 wiązania wodorowe) względem A=T (2
 * wiązania), tym wyższa Tm. Krzywa rozdzielania nici jest logistyczna
 * (kooperatywne przejście wokół Tm) — jakościowo poprawne (prawdziwe
 * topnienie DNA JEST kooperatywnym przejściem, jak przejście fazowe —
 * porównaj z modelem Isinga w Chemistry Lab), ale szerokość przejścia
 * jest ILUSTRACYJNA, nie zmierzoną stałą termodynamiczną konkretnej
 * sekwencji.
 */

const RISE_PER_BP = 0.34; // nm
const RADIUS_NM = 1.0; // nm
const BP_PER_TURN = 10.5;
const TWIST_PER_BP = (2 * Math.PI) / BP_PER_TURN;
const STRAND_OFFSET = (2 * Math.PI * 120) / 360; // ~120° — asymetria rowka większego/mniejszego
const SCENE_SCALE = 2; // jednostki sceny na nm

const COMPLEMENT: Record<string, string> = { A: 'T', T: 'A', G: 'C', C: 'G' };
const BASE_COLOR: Record<string, number> = { A: 0x6ee7a0, T: 0xf47c7c, G: 0x5cd6e8, C: 0xf0d060 };
const H_BONDS: Record<string, number> = { A: 2, T: 2, G: 3, C: 3 };

// 20 par zasad (~2 skręty helisy) — długość dobrana tak, żeby (a) skręt
// spirali był widoczny wielokrotnie (krótsza sekwencja, np. 11 bp, daje
// mniej niż jeden pełny skręt i nie wygląda jak rozpoznawalne DNA), i
// (b) pozostać w udokumentowanym zakresie ważności reguły Wallace'a
// (krótkie oligonukleotydy, <~20-25 zasad) — dłuższe sekwencje wymagałyby
// metody najbliższego sąsiada, świadomie tu pominiętej.
const SEQUENCES: Record<string, string> = {
  mixed: 'GATTACACGGTAGCTAGCAT',
  gcRich: 'GCGCGCGCGCGCGCGCGCGC',
  atRich: 'ATATATATATATATATATAT',
};

function backbonePoint(i: number, n: number, strandOffset: number): { x: number; y: number; z: number } {
  const angle = i * TWIST_PER_BP + strandOffset;
  const centered = i - (n - 1) / 2;
  return {
    x: RADIUS_NM * Math.cos(angle) * SCENE_SCALE,
    y: centered * RISE_PER_BP * SCENE_SCALE,
    z: RADIUS_NM * Math.sin(angle) * SCENE_SCALE,
  };
}

function logisticFraction(temperature: number, tm: number, width = 3): number {
  return 1 / (1 + Math.exp(-(temperature - tm) / width));
}

class DnaHelixSim implements Sim3D {
  private three?: typeof THREE;
  private scene?: THREE.Scene;
  private sequenceKey = 'mixed';
  private temperature = 37;
  private strand1?: THREE.Line;
  private strand2?: THREE.Line;
  private rungs: THREE.Line[] = [];
  private bases: string[] = [];
  private disposables: { dispose(): void }[] = [];

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.scene = scene;
    scene.add(new three.AmbientLight(0x445566, 0.9));
    scene.add(new three.PointLight(0xffffff, 0.6, 100).translateY(10));
    this.buildHelix(SEQUENCES[this.sequenceKey]);
    camera.position.set(7, 2, 15);
    camera.lookAt(0, 0, 0);
  }

  private clearHelix() {
    if (!this.scene) return;
    if (this.strand1) { this.scene.remove(this.strand1); }
    if (this.strand2) { this.scene.remove(this.strand2); }
    for (const r of this.rungs) this.scene.remove(r);
    this.rungs = [];
  }

  private buildHelix(sequence: string) {
    if (!this.three || !this.scene) return;
    this.clearHelix();
    this.bases = sequence.split('');
    const n = this.bases.length;

    const mkLine = (points: { x: number; y: number; z: number }[], color: number, opacity = 0.9): THREE.Line => {
      const geo = new this.three!.BufferGeometry().setFromPoints(points.map((p) => new this.three!.Vector3(p.x, p.y, p.z)));
      const mat = new this.three!.LineBasicMaterial({ color, transparent: true, opacity });
      this.disposables.push(geo, mat);
      const line = new this.three!.Line(geo, mat);
      this.scene!.add(line);
      return line;
    };

    const strand1Pts = Array.from({ length: n }, (_, i) => backbonePoint(i, n, 0));
    const strand2Pts = Array.from({ length: n }, (_, i) => backbonePoint(i, n, STRAND_OFFSET));
    this.strand1 = mkLine(strand1Pts, 0xa8a29e);
    this.strand2 = mkLine(strand2Pts, 0xa8a29e);

    for (let i = 0; i < n; i++) {
      const p1 = strand1Pts[i];
      const p2 = strand2Pts[i];
      const base = this.bases[i];
      const rung = mkLine([p1, p2], BASE_COLOR[base] ?? 0xffffff, 0.85);
      this.rungs.push(rung);
    }
  }

  reset = () => {};

  update(_dt: number, p: SimParams) {
    const seqKey = String(p.sequence ?? 'mixed');
    this.temperature = Number(p.temperature ?? 37);
    if (seqKey !== this.sequenceKey) {
      this.sequenceKey = seqKey;
      this.buildHelix(SEQUENCES[seqKey] ?? SEQUENCES.mixed);
    }
  }

  syncScene() {
    if (!this.three) return;
    const tm = dnaMeltingTempWallace(SEQUENCES[this.sequenceKey] ?? '');
    const frac = logisticFraction(this.temperature, tm);
    const n = this.bases.length;

    const strand1Pts: THREE.Vector3[] = [];
    const strand2Pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const p1 = backbonePoint(i, n, 0);
      const p2 = backbonePoint(i, n, STRAND_OFFSET);
      // rozdzielanie nici: przesunięcie promieniowe rosnące z frakcją rozdzielenia
      const push = frac * 3.5;
      const a1 = i * TWIST_PER_BP;
      const a2 = a1 + STRAND_OFFSET;
      strand1Pts.push(new this.three.Vector3(p1.x - Math.cos(a1) * push, p1.y, p1.z - Math.sin(a1) * push));
      strand2Pts.push(new this.three.Vector3(p2.x + Math.cos(a2) * push, p2.y, p2.z + Math.sin(a2) * push));
    }
    if (this.strand1) {
      this.strand1.geometry.setFromPoints(strand1Pts);
    }
    if (this.strand2) {
      this.strand2.geometry.setFromPoints(strand2Pts);
    }
    for (let i = 0; i < this.rungs.length; i++) {
      const rung = this.rungs[i];
      rung.geometry.setFromPoints([strand1Pts[i], strand2Pts[i]]);
      (rung.material as THREE.LineBasicMaterial).opacity = Math.max(0.08, 0.85 * (1 - frac));
    }
  }

  getStats() {
    const tm = dnaMeltingTempWallace(SEQUENCES[this.sequenceKey] ?? '');
    const frac = logisticFraction(this.temperature, tm);
    return {
      tm: Math.round(tm * 10) / 10,
      temperature: Math.round(this.temperature * 10) / 10,
      denatured: Math.round(frac * 1000) / 1000,
      basePairs: this.bases.length,
    };
  }

  dispose() {
    this.clearHelix();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}

export const biologyDnaHelix: ExperimentDef = {
  id: 'dna-helix',
  name: 'Podwójna helisa DNA',
  honesty: 'exact',
  honestyNote:
    'Geometria B-DNA: promień ~1,0 nm, wzniesienie 0,34 nm/parę zasad, ~10,5 pary zasad na skręt — zmierzone wartości krystalograficzne (Watson & Crick 1953; Franklin & Gosling 1953; Wang 1979). Dwie nici przesunięte o ~120° (nie 180°) — realna, jakościowa przyczyna asymetrii rowka większego/mniejszego; dokładne szerokości rowków w angstremach pominięte jako nadmiarowa precyzja dla tej skali wizualizacji. Temperatura topnienia: reguła Wallace\'a Tm=2°C(A+T)+4°C(G+C) (Wallace i in. 1979) — przybliżenie empiryczne dla krótkich sekwencji, nie metoda najbliższego sąsiada używana dla dłuższych/precyzyjniejszych obliczeń. Krzywa rozdzielania nici jest logistyczna wokół Tm (jakościowo poprawne kooperatywne przejście — prawdziwe topnienie DNA jest ostre, jak przejście fazowe), ale szerokość przejścia jest ILUSTRACYJNA.',
  params: [
    {
      key: 'sequence', label: 'Sekwencja', type: 'select', default: 'mixed',
      options: [
        { value: 'mixed', label: 'Mieszana sekwencja (20 pz)' },
        { value: 'gcRich', label: 'Bogata w G≡C — wysoka Tm (20 pz)' },
        { value: 'atRich', label: 'Bogata w A=T — niska Tm (20 pz)' },
      ],
    },
    {
      key: 'temperature', label: 'Temperatura (°C)', type: 'slider',
      min: 0, max: 100, step: 1, default: 37,
      format: (v) => `${v.toFixed(0)}°C`,
    },
  ],
  createSim3D: () => new DnaHelixSim(),
  narrate(p, stats) {
    const seqKey = String(p.sequence ?? 'mixed');
    const sequence = SEQUENCES[seqKey] ?? SEQUENCES.mixed;
    const complement = sequence.split('').map((b) => COMPLEMENT[b] ?? '?').join('');
    const tm = Number(stats.tm ?? 0);
    const T = Number(stats.temperature ?? 37);
    const denatured = Number(stats.denatured ?? 0);
    const gcCount = sequence.split('').filter((b) => b === 'G' || b === 'C').length;
    return [
      {
        title: `Tm=${tm.toFixed(0)}°C (${gcCount}/${sequence.length} par G≡C) — przy T=${T.toFixed(0)}°C nici rozdzielone w ${(denatured * 100).toFixed(0)}%`,
        body: `5'-${sequence}-3' paruje z komplementarną nicią 3'-${complement}-5' zgodnie z regułami Watsona–Cricka: A=T (${H_BONDS.A} wiązania wodorowe), G≡C (${H_BONDS.G} wiązania wodorowe — silniejsze parowanie). ${denatured > 0.5 ? `Powyżej Tm nici się rozdzielają (denaturacja) — dokładnie to dzieje się podczas PCR przy podgrzaniu do ~95°C, tylko odwracalnie: po ochłodzeniu nici renaturują.` : 'Poniżej Tm podwójna helisa jest stabilna — wiązania wodorowe między parami zasad (nie kowalencyjne, więc słabsze i odwracalne) utrzymują obie nici razem.'} Suwak temperatury pokazuje, dlaczego sekwencje bogate w G≡C są bardziej termostabilne — to realna zasada wykorzystywana przy projektowaniu starterów PCR.`,
        citation: {
          source: 'Watson & Crick 1953, Nature 171, 737; Wallace i in. 1979, Nucleic Acids Res. 6, 3543',
          confirmation: 'confirmed',
          note: 'Struktura podwójnej helisy potwierdzona krystalografią rentgenowską; reguła Wallace\'a to standardowe przybliżenie używane do dziś przy projektowaniu krótkich starterów',
        },
      },
      {
        title: 'Dlaczego rowek większy i mniejszy mają znaczenie',
        body: 'Ponieważ dwie nici NIE są symetrycznie naprzeciwko siebie, DNA ma dwa rowki o różnej szerokości. Białka regulatorowe (np. czynniki transkrypcyjne) rozpoznają konkretne sekwencje głównie przez rowek WIĘKSZY — jest wystarczająco szeroki, żeby chemiczne "krawędzie" par zasad (A=T vs G≡C) były czytelne z zewnątrz helisy, bez rozplatania nici. To dlatego kształt tej z pozoru prostej struktury jest tak biologicznie istotny.',
      },
    ];
  },
};
