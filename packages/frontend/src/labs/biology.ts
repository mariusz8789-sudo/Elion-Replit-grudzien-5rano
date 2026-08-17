import type { ExperimentDef, LabDefinition, NarrationBlock, Sim, SimParams } from '../core/types';
import { biologyDnaHelix } from './experiments/biology-dnahelix';
import { biologyProteinFolding } from './experiments/biology-proteinfolding';
import { biologyLogisticConsequence } from './experiments/biology-logistic-consequence';
import { biologyEpidemic } from './experiments/biology-epidemic';

/**
 * Biology Lab — flagowy eksperyment to teraz prawdziwa podwójna helisa DNA
 * 3D (geometria Watson-Crick, patrz biology-dnahelix.ts) — promowana z
 * zakładki pobocznej, żeby pierwszym widokiem NIE był płaski 2D rozsyp
 * jonów. Dawny bazowy eksperyment (transport przez błonę komórkową) NIE
 * został usunięty — jest teraz pierwszą pozycją w `experiments` jako
 * „Transport błonowy (2D)": model płynnej mozaiki (Singer & Nicolson 1972)
 * z trzema realnymi, jakościowo poprawnymi mechanizmami transportu:
 * - dyfuzja prosta: małe, niepolarne cząsteczki (O2, CO2) przechodzą
 *   bezpośrednio przez dwuwarstwę lipidową, zawsze Z gradientem stężenia
 * - dyfuzja wspomagana: naładowane/polarne cząsteczki (glukoza, jony)
 *   wymagają kanału białkowego — wciąż Z gradientem, ale NASYCALNA
 *   (ograniczona liczbą kanałów, jak kinetyka Michaelisa–Menten)
 * - transport aktywny: pompa sodowo-potasowa (Na⁺/K⁺-ATPaza) — jedyny
 *   mechanizm pompujący PRZECIW gradientowi stężenia, kosztem ATP.
 *   Stechiometria 3 Na⁺ na zewnątrz : 2 K⁺ do wewnątrz na 1 ATP to
 *   realny, zmierzony fakt biochemiczny (odkrycie: Jens Skou, Nagroda
 *   Nobla 1997) — nie liczba dobrana dla wygody wizualizacji.
 *
 * Świadome uproszczenie: liczby cząstek i tempo są ILUSTRACYJNE (nie
 * prawdziwe stężenia molowe ani stałe kinetyczne pompy) — poprawna jest
 * JAKOŚCIOWA fizyka (kierunek transportu, nasycalność kanałów,
 * stechiometria pompy, i to że aktywny transport MOŻE utrzymać gradient
 * wbrew biernemu przeciekowi, podczas gdy sama dyfuzja zawsze dąży do
 * wyrównania stężeń).
 */

type Side = 'out' | 'in';
interface Ion { side: Side; kind: 'na' | 'k'; x: number; y: number; targetX: number; phase: number }

const MEMBRANE_Y_FRAC = 0.5;
const CHANNEL_COUNT = 5;
const PUMP_ATP_COST = 1; // 1 "ATP" na jeden cykl pompy (3 Na+ na zewnątrz, 2 K+ do wewnątrz)

class MembraneSim implements Sim {
  private ions: Ion[] = [];
  private w = 0;
  private h = 0;
  private pumpAcc = 0;
  private atpUsed = 0;
  private naOut = 0;
  private naIn = 0;
  private kOut = 0;
  private kIn = 0;

  init(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.seed();
  }

  private seed() {
    this.ions = [];
    // Start: wysoki Na+ na zewnątrz, wysoki K+ wewnątrz — jak w realnej komórce w spoczynku
    for (let i = 0; i < 28; i++) this.ions.push(this.spawnIon('na', 'out'));
    for (let i = 0; i < 6; i++) this.ions.push(this.spawnIon('na', 'in'));
    for (let i = 0; i < 8; i++) this.ions.push(this.spawnIon('k', 'out'));
    for (let i = 0; i < 26; i++) this.ions.push(this.spawnIon('k', 'in'));
    this.atpUsed = 0;
  }

  private spawnIon(kind: 'na' | 'k', side: Side): Ion {
    const x = 20 + Math.random() * (this.w - 40);
    const y = side === 'out' ? Math.random() * this.h * MEMBRANE_Y_FRAC * 0.9 : this.h * MEMBRANE_Y_FRAC * 1.1 + Math.random() * this.h * (1 - MEMBRANE_Y_FRAC) * 0.9;
    return { side, kind, x, y, targetX: x, phase: Math.random() * Math.PI * 2 };
  }

  reset = () => this.seed();

  update(dt: number, p: SimParams) {
    const pumpOn = Boolean(p.pump);
    const channelsOpen = Boolean(p.channels);

    for (const ion of this.ions) {
      ion.phase += dt * 2;
      ion.x += Math.sin(ion.phase) * dt * 8;
      ion.x = Math.max(10, Math.min(this.w - 10, ion.x));
      const targetY = ion.side === 'out' ? this.h * MEMBRANE_Y_FRAC * 0.5 : this.h * (MEMBRANE_Y_FRAC + (1 - MEMBRANE_Y_FRAC) * 0.5);
      ion.y += (targetY - ion.y) * Math.min(1, dt * 0.6) + Math.sin(ion.phase * 0.7) * dt * 6;
    }

    // dyfuzja wspomagana przez kanały: jony przechodzą Z gradientem, nasycalnie (max CHANNEL_COUNT naraz)
    if (channelsOpen) {
      let crossings = 0;
      for (const ion of this.ions) {
        if (crossings >= CHANNEL_COUNT) break;
        if (Math.random() > dt * 1.5) continue;
        const countOnSide = this.ions.filter((i2) => i2.kind === ion.kind && i2.side === ion.side).length;
        const countOther = this.ions.filter((i2) => i2.kind === ion.kind && i2.side !== ion.side).length;
        if (countOnSide > countOther) {
          ion.side = ion.side === 'out' ? 'in' : 'out';
          crossings++;
        }
      }
    }

    // transport aktywny: pompa Na+/K+-ATPaza, PRZECIW gradientowi, stechiometria 3:2 na "ATP"
    if (pumpOn) {
      this.pumpAcc += dt;
      const cycleTime = 0.35; // czas jednego cyklu pompy (ilustracyjny)
      while (this.pumpAcc >= cycleTime) {
        this.pumpAcc -= cycleTime;
        const naIn = this.ions.filter((i2) => i2.kind === 'na' && i2.side === 'in');
        const kOut = this.ions.filter((i2) => i2.kind === 'k' && i2.side === 'out');
        let pumped = 0;
        for (const ion of naIn) {
          if (pumped >= 3) break;
          ion.side = 'out';
          pumped++;
        }
        pumped = 0;
        for (const ion of kOut) {
          if (pumped >= 2) break;
          ion.side = 'in';
          pumped++;
        }
        this.atpUsed += PUMP_ATP_COST;
      }
    }

    this.naOut = this.ions.filter((i2) => i2.kind === 'na' && i2.side === 'out').length;
    this.naIn = this.ions.filter((i2) => i2.kind === 'na' && i2.side === 'in').length;
    this.kOut = this.ions.filter((i2) => i2.kind === 'k' && i2.side === 'out').length;
    this.kIn = this.ions.filter((i2) => i2.kind === 'k' && i2.side === 'in').length;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const membY = h * MEMBRANE_Y_FRAC;
    ctx.fillStyle = 'rgba(232,200,138,0.12)';
    ctx.fillRect(0, membY - 10, w, 20);
    ctx.strokeStyle = 'rgba(232,200,138,0.5)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, membY);
    ctx.lineTo(w, membY);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const ion of this.ions) {
      ctx.fillStyle = ion.kind === 'na' ? 'rgba(92,214,232,0.9)' : 'rgba(240,124,124,0.9)';
      ctx.beginPath();
      ctx.arc(ion.x, ion.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('zewnątrz komórki', 10, 14);
    ctx.fillText('wnętrze komórki', 10, h - 8);
    ctx.fillText(`Na⁺: ${this.naOut} na zewn. / ${this.naIn} wewn. · K⁺: ${this.kOut} na zewn. / ${this.kIn} wewn. · ATP zużyte: ${this.atpUsed}`, 10, membY + 24);
  }

  getStats() {
    return {
      naOut: this.naOut, naIn: this.naIn, kOut: this.kOut, kIn: this.kIn, atpUsed: this.atpUsed,
    };
  }
}

/** Dawny bazowy eksperyment (transport przez błonę komórkową) — teraz zakładka poboczna, nieusunięta. */
const biologyMembraneTransport2D: ExperimentDef = {
  id: 'membrane-transport-2d',
  name: 'Transport błonowy (2D)',
  honesty: 'simplified',
  honestyNote:
    'Model płynnej mozaiki (Singer & Nicolson 1972): jakościowo poprawny kierunek i mechanizm transportu (dyfuzja prosta i wspomagana ZAWSZE z gradientem, transport aktywny MOŻE iść pod prąd kosztem ATP). Stechiometria pompy Na⁺/K⁺-ATPazy (3 Na⁺ na zewnątrz : 2 K⁺ do wewnątrz na 1 ATP) to zmierzony fakt biochemiczny (Skou, Nagroda Nobla 1997). Liczby cząstek, tempo dyfuzji i czas cyklu pompy są ILUSTRACYJNE — nie prawdziwe stężenia molowe ani zmierzone stałe kinetyczne.',
  params: [
    { key: 'channels', label: 'Otwarte kanały białkowe (dyfuzja wspomagana)', type: 'toggle', default: true },
    { key: 'pump', label: 'Pompa Na⁺/K⁺-ATPaza (transport aktywny)', type: 'toggle', default: false },
  ],
  createSim: () => new MembraneSim(),
  narrate(p, stats): NarrationBlock[] {
    const channelsOpen = Boolean(p.channels);
    const pumpOn = Boolean(p.pump);
    const naOut = Number(stats.naOut ?? 0);
    const naIn = Number(stats.naIn ?? 0);
    const kOut = Number(stats.kOut ?? 0);
    const kIn = Number(stats.kIn ?? 0);
    const atpUsed = Number(stats.atpUsed ?? 0);
    return [
      {
        title: `Na⁺: ${naOut} zewn. / ${naIn} wewn. · K⁺: ${kOut} zewn. / ${kIn} wewn.`,
        body: pumpOn
          ? `Pompa Na⁺/K⁺-ATPaza aktywnie wypompowuje Na⁺ na zewnątrz i wciąga K⁺ do środka — PRZECIW naturalnemu kierunkowi dyfuzji — kosztem ATP (zużyto: ${atpUsed}). To dokładnie tak działa prawdziwa komórka: bez tej pompy bierny przeciek przez kanały wyrównałby stężenia w kilka minut, a bez gradientu Na⁺/K⁺ neurony nie mogłyby przewodzić sygnałów.`
          : channelsOpen
            ? 'Kanały białkowe otwarte, pompa wyłączona — jony dyfundują biernie Z gradientem stężenia (od strony, gdzie jest ich więcej, do strony, gdzie jest ich mniej), aż stężenia się wyrównają. To dyfuzja wspomagana: szybsza niż przez samą dwuwarstwę lipidową, ale wciąż tylko z gradientem, nigdy pod prąd.'
            : 'Kanały zamknięte, pompa wyłączona — jony prawie nie przechodzą przez błonę (małe, naładowane jony nie dyfundują swobodnie przez dwuwarstwę lipidową). Włącz kanały, żeby zobaczyć dyfuzję wspomaganą, albo pompę, żeby zobaczyć transport aktywny pod prąd.',
        citation: {
          source: 'Singer & Nicolson 1972, Science 175, 720 (model płynnej mozaiki); Skou 1957/Nagroda Nobla 1997 (Na⁺/K⁺-ATPaza)',
          confirmation: 'confirmed',
          note: 'Stechiometria pompy (3 Na⁺:2 K⁺:1 ATP) jest zmierzonym faktem biochemicznym, nie modelem przybliżonym',
        },
      },
      {
        title: 'Dlaczego to ma znaczenie: potencjał spoczynkowy',
        body: 'Wysokie stężenie Na⁺ na zewnątrz i K⁺ wewnątrz (utrzymywane przez pompę) to fundament potencjału spoczynkowego błony (~−70 mV) — bez niego neurony nie mogłyby generować potencjałów czynnościowych, a mięśnie by się nie kurczyły. Pompa zużywa nawet ~20–40% całkowitego ATP neuronu tylko po to, żeby utrzymać ten gradient wbrew nieustannemu biernemu przeciekowi przez kanały jonowe.',
      },
    ];
  },
};

export const biologyLab: LabDefinition = {
  id: 'biology',
  name: 'Biology Lab',
  tagline: 'DNA, białka, błona komórkowa, transport',
  icon: '🧬',
  accent: '#6ee7a0',
  honesty: biologyDnaHelix.honesty,
  honestyNote: biologyDnaHelix.honestyNote,
  params: biologyDnaHelix.params,
  createSim3D: biologyDnaHelix.createSim3D,
  experiments: [biologyMembraneTransport2D, biologyProteinFolding, biologyLogisticConsequence, biologyEpidemic],
  narrate: biologyDnaHelix.narrate,
};
