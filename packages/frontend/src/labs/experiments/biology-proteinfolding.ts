import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import {
  contactCount,
  contactEnergy,
  isConnected,
  isSelfAvoiding,
  mcStep,
  parseSequence,
  straightChain,
  type Point,
  type Residue,
} from '../../core/proteinFolding';

/**
 * Fałdowanie białka — model HP (Hydrophobic–Polar, Dill 1985; Lau & Dill
 * 1989). Sekwencja aminokwasów zredukowana do dwóch typów (H=hydrofobowy,
 * P=polarny), łańcuch to samounikający spacer na siatce kwadratowej,
 * energia = −1 za każdy kontakt H–H nienależący do szkieletu. Symulacja
 * Monte Carlo (algorytm Metropolisa — ta sama metoda co model Isinga w
 * Chemistry Lab) szuka niskoenergetycznych (zwartych, z ukrytym rdzeniem
 * hydrofobowym) konformacji poprzez lokalne ruchy końca/narożnika łańcucha.
 *
 * ŚWIADOME UPROSZCZENIE (patrz honestyNote): to NIE symulacja prawdziwego
 * zwijania białek. Prawdziwe białka mają 20 rodzajów aminokwasów, geometrię
 * 3D, wiązania wodorowe, oddziaływania elektrostatyczne i solwatację —
 * model HP bada wyłącznie zasadę zapadania hydrofobowego, jedną z wielu
 * sił kształtujących prawdziwe struktury. Znajdowanie GLOBALNEGO minimum
 * energii w tym modelu jest udowodnione NP-trudne (Crescenzi i in. 1998)
 * — ta symulacja może utknąć w minimum lokalnym, dokładnie jak prawdziwe
 * błędne fałdowanie (misfolding) w biologii.
 */

const SEQUENCES: Record<string, string> = {
  classic: 'HPHPPHHPHPPHPHHP',
  blockH: 'HHHHPPPPHHHHPPPP',
  alternating: 'HPHPHPHPHPHPHPHP',
  mostlyP: 'PPPHPPPHPPPHPPPH',
};

const CELL_PX = 16;
const STEPS_PER_SECOND = 400;

export type ProteinFoldingScenarioInput = {
  sequenceKey?: keyof typeof SEQUENCES;
  temperature?: number;
  steps?: number;
  seed?: number;
};

/** Seedowany PRNG dla odtwarzalnego runu Metropolisa; nie zmienia jego reguł ani energii HP. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Współdzielony runner Fabric. Używa dokładnie istniejącego HP contactEnergy()
 * oraz mcStep(); seed określa jedynie trajektorię Monte Carlo i jest zwracany
 * dla reprodukowalności.
 */
export function runProteinFoldingScenario({
  sequenceKey = 'classic',
  temperature = 1,
  steps = 5000,
  seed = 20_260_819,
}: ProteinFoldingScenarioInput = {}) {
  if (!(sequenceKey in SEQUENCES)) throw new Error('sequenceKey must select an existing HP preset.');
  if (!Number.isFinite(temperature) || temperature <= 0 || temperature > 3) throw new Error('temperature must be within (0, 3].');
  if (!Number.isInteger(steps) || steps < 1 || steps > 50_000) throw new Error('steps must be an integer within [1, 50000].');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error('seed must be a non-negative 32-bit integer.');

  const sequence = parseSequence(SEQUENCES[sequenceKey]);
  const random = mulberry32(seed);
  let positions = straightChain(sequence.length);
  const initialEnergy = contactEnergy(sequence, positions);
  let energy = initialEnergy;
  let bestEnergy = initialEnergy;
  let acceptedMoves = 0;
  for (let step = 0; step < steps; step++) {
    const result = mcStep(sequence, positions, temperature, random);
    positions = result.positions;
    energy = result.energy;
    if (result.accepted) acceptedMoves++;
    if (energy < bestEnergy) bestEnergy = energy;
  }
  if (!isSelfAvoiding(positions) || !isConnected(positions)) throw new Error('HP chain invariants were violated.');
  return {
    sequenceKey,
    sequenceLength: sequence.length,
    temperature,
    steps,
    seed,
    initialEnergy,
    finalEnergy: energy,
    bestEnergy,
    finalHydrophobicContacts: contactCount(sequence, positions),
    acceptedMoves,
    acceptanceRate: acceptedMoves / steps,
  } as const;
}

class ProteinFoldingSim implements Sim {
  private sequence: Residue[] = parseSequence(SEQUENCES.classic);
  private positions: Point[] = straightChain(this.sequence.length);
  private temperature = 1.0;
  private energy = 0;
  private bestEnergy = 0;
  private steps = 0;
  private accepted = 0;
  private acc = 0;
  private sequenceKey = 'classic';

  init() {
    this.energy = contactEnergy(this.sequence, this.positions);
    this.bestEnergy = this.energy;
  }

  reset = () => {
    this.positions = straightChain(this.sequence.length);
    this.energy = contactEnergy(this.sequence, this.positions);
    this.bestEnergy = this.energy;
    this.steps = 0;
    this.accepted = 0;
  };

  update(dt: number, p: SimParams) {
    const seqKey = String(p.sequence ?? 'classic');
    if (seqKey !== this.sequenceKey) {
      this.sequenceKey = seqKey;
      this.sequence = parseSequence(SEQUENCES[seqKey] ?? SEQUENCES.classic);
      this.reset();
    }
    this.temperature = Math.max(0.05, Number(p.temperature ?? 1.0));

    this.acc += dt * STEPS_PER_SECOND;
    const steps = Math.floor(this.acc);
    this.acc -= steps;
    for (let i = 0; i < steps; i++) {
      const result = mcStep(this.sequence, this.positions, this.temperature, Math.random);
      this.positions = result.positions;
      this.energy = result.energy;
      this.steps++;
      if (result.accepted) this.accepted++;
      if (this.energy < this.bestEnergy) {
        this.bestEnergy = this.energy;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);

    const xs = this.positions.map((p) => p.x);
    const ys = this.positions.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = w / 2 - ((minX + maxX) / 2) * CELL_PX;
    const cy = h / 2 - ((minY + maxY) / 2) * CELL_PX;

    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < this.positions.length; i++) {
      const px = cx + this.positions[i].x * CELL_PX;
      const py = cy + this.positions[i].y * CELL_PX;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    for (let i = 0; i < this.positions.length; i++) {
      const px = cx + this.positions[i].x * CELL_PX;
      const py = cy + this.positions[i].y * CELL_PX;
      const isH = this.sequence[i] === 'H';
      ctx.fillStyle = isH ? '#f0b35c' : '#5cd6e8';
      ctx.beginPath();
      ctx.arc(px, py, isH ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (i === 0 || i === this.positions.length - 1) {
        ctx.strokeStyle = 'rgba(230,234,245,0.85)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    ctx.fillStyle = 'rgba(230,234,245,0.8)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`E = ${this.energy} (najlepsza: ${this.bestEnergy}) · T = ${this.temperature.toFixed(2)}`, 10, h - 24);
    ctx.fillText(`kroki MC: ${this.steps.toLocaleString('pl-PL')} · akceptacja: ${this.steps > 0 ? ((this.accepted / this.steps) * 100).toFixed(0) : 0}%`, 10, h - 10);
    ctx.fillStyle = 'rgba(240,179,92,0.85)';
    ctx.fillText('H (hydrofobowy)', 10, 16);
    ctx.fillStyle = 'rgba(92,214,232,0.85)';
    ctx.fillText('P (polarny)', 110, 16);
  }

  getStats() {
    return {
      energy: this.energy,
      bestEnergy: this.bestEnergy,
      steps: this.steps,
      acceptRate: this.steps > 0 ? Math.round((this.accepted / this.steps) * 1000) / 1000 : 0,
    };
  }
}

export const biologyProteinFolding: ExperimentDef = {
  id: 'protein-folding',
  name: 'Fałdowanie białka (model HP)',
  honesty: 'educational',
  honestyNote:
    'Model HP (Dill 1985; Lau & Dill 1989) to JAWNIE dydaktyczne uproszczenie: 20 rodzajów aminokwasów zredukowane do dwóch (hydrofobowy/polarny), geometria 3D zredukowana do siatki 2D, energia = tylko liczba kontaktów H–H (rzeczywiste fałdowanie obejmuje też wiązania wodorowe, mostki disiarczkowe, oddziaływania elektrostatyczne i entropię łańcucha). To NIE przewidywanie struktury prawdziwego białka (do tego służy AlphaFold — uczenie maszynowe na milionach zmierzonych struktur, nie fizyka analityczna) — to model badający JEDNĄ zasadę: hydrofobowe reszty chowają się przed wodą, tworząc zwarty rdzeń. Znajdowanie globalnego minimum energii w tym modelu jest udowodnione NP-trudne (Crescenzi i in. 1998) — symulacja Monte Carlo może utknąć w minimum lokalnym, tak jak prawdziwe białka czasem błędnie się fałdują (choroby konformacyjne, np. prionowe).',
  params: [
    {
      key: 'sequence', label: 'Sekwencja HP', type: 'select', default: 'classic',
      options: [
        { value: 'classic', label: 'HPHPPHHPHPPHPHHP (mieszana)' },
        { value: 'blockH', label: 'HHHHPPPPHHHHPPPP (bloki)' },
        { value: 'alternating', label: 'HPHPHPHPHPHPHPHP (naprzemienna)' },
        { value: 'mostlyP', label: 'PPPHPPPHPPPHPPPH (rzadka H)' },
      ],
    },
    {
      key: 'temperature', label: 'Temperatura (kontroluje eksplorację vs. zachłanność)', type: 'slider',
      min: 0.1, max: 3, step: 0.05, default: 1.0,
      format: (v) => v.toFixed(2),
    },
  ],
  createSim: () => new ProteinFoldingSim(),
  narrate(p, stats) {
    const seqKey = String(p.sequence ?? 'classic');
    const sequence = SEQUENCES[seqKey] ?? SEQUENCES.classic;
    const hCount = sequence.split('').filter((c) => c === 'H').length;
    const T = Number(p.temperature ?? 1);
    const energy = Number(stats.energy ?? 0);
    const bestEnergy = Number(stats.bestEnergy ?? 0);
    const steps = Number(stats.steps ?? 0);
    const acceptRate = Number(stats.acceptRate ?? 0);
    return [
      {
        title: `E = ${energy} (najlepsza dotąd: ${bestEnergy}) po ${steps.toLocaleString('pl-PL')} krokach`,
        body:
          T < 0.5
            ? `Niska temperatura = ruch niemal wyłącznie "w dół" (zachłanne obniżanie energii, jak hartowanie/wyżarzanie). Sekwencja ma ${hCount}/${sequence.length} reszt hydrofobowych (H) — każdy kontakt H–H poza szkieletem obniża energię o 1. Współczynnik akceptacji ruchów: ${(acceptRate * 100).toFixed(0)}% (przy niskiej T większość proponowanych ruchów, które podniosłyby energię, jest odrzucana).`
            : `Wyższa temperatura pozwala łańcuchowi czasem zaakceptować ruch PODNOSZĄCY energię (ucieczka z minimów lokalnych, jak prawdziwa fluktuacja termiczna) — współczynnik akceptacji: ${(acceptRate * 100).toFixed(0)}%. Zmniejsz temperaturę, żeby zobaczyć, jak łańcuch "zamraża się" w zwartej, niskoenergetycznej strukturze z ukrytym rdzeniem hydrofobowym (pomarańczowe kulki H w środku, niebieskie P na zewnątrz).`,
        citation: {
          source: 'Dill 1985, Biochemistry 24, 1501; Lau & Dill 1989, Macromolecules 22, 3986',
          confirmation: 'confirmed',
          note: 'Model HP i algorytm Metropolisa to standardowe, dobrze ugruntowane narzędzia dydaktyczne i badawcze w biofizyce obliczeniowej',
        },
      },
      {
        title: 'Dlaczego to jest NP-trudne (i dlaczego to ważne)',
        body: 'Crescenzi i in. (1998) udowodnili, że znalezienie GLOBALNIE najlepszej (najniższej energii) konformacji w modelu HP jest NP-trudne — nie istnieje znany algorytm, który rozwiązywałby to szybko dla długich sekwencji. Dokładnie to samo dotyczy prawdziwego zwijania białek: komórki "rozwiązują" ten problem w milisekundy dzięki fizyce (paradoks Levinthala — pełne przeszukanie byłoby niewykonalne), a my wciąż nie rozumiemy w pełni, jak. Ta symulacja, tak jak prawdziwe białko, może utknąć w niedoskonałej, ale stabilnej strukturze — to nie błąd, to fundamentalna cecha problemu.',
      },
    ];
  },
};
