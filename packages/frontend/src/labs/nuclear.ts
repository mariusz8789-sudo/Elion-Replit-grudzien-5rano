import type { LabDefinition, Sim, SimParams } from '../core/types';
import { tracePolylineBy } from '../core/canvasHelpers';
import { nuclearChain } from './experiments/nuclear-chain';
import { nuclearTokamak } from './experiments/nuclear-tokamak';

/**
 * Nuclear Lab — rozpad promieniotwórczy.
 * Fizyka: prawo rozpadu jest dokładne (prawdopodobieństwo na krok czasowy
 * p = 1 − 2^(−Δt/T½)); losowość każdego jądra to prawdziwa natura zjawiska.
 * Uproszczenie: pokazujemy pojedynczy rozpad, bez łańcuchów pochodnych.
 * Czas jest skompresowany: 6 sekund ekranu = 1 okres półtrwania.
 */

interface Isotope {
  id: string;
  label: string;
  halfLife: string;
  mode: 'α' | 'β⁻';
  modeText: string;
}

const ISOTOPES: Record<string, Isotope> = {
  c14: { id: 'c14', label: 'Węgiel-14', halfLife: '5 730 lat', mode: 'β⁻', modeText: 'neutron zamienia się w proton: C-14 → N-14 + e⁻ + antyneutrino. Podstawa datowania radiowęglowego.' },
  i131: { id: 'i131', label: 'Jod-131', halfLife: '8,02 dnia', mode: 'β⁻', modeText: 'I-131 → Xe-131 + e⁻ + antyneutrino. Stosowany w medycynie nuklearnej; groźny po awariach reaktorów.' },
  ra226: { id: 'ra226', label: 'Rad-226', halfLife: '1 600 lat', mode: 'α', modeText: 'jądro emituje cząstkę α (2p+2n): Ra-226 → Rn-222 + α. Pierwiastek odkryty przez Marię Skłodowską-Curie.' },
  u238: { id: 'u238', label: 'Uran-238', halfLife: '4,47 mld lat', mode: 'α', modeText: 'U-238 → Th-234 + α — początek łańcucha 14 rozpadów kończącego się na stabilnym ołowiu-206. Zegar wieku Ziemi.' },
};

const GRID = 22; // 22×14 = 308 jąder
const ROWS = 14;
const SEC_PER_HALFLIFE = 6;

class DecaySim implements Sim {
  private alive: boolean[] = [];
  private tHl = 0; // czas w okresach półtrwania
  private history: number[] = [];
  private flash: Map<number, number> = new Map();

  init() {
    if (this.alive.length === 0) this.reset();
  }

  reset = () => {
    this.alive = new Array(GRID * ROWS).fill(true);
    this.tHl = 0;
    this.history = [];
    this.flash.clear();
  };

  update(dt: number, _p: SimParams) {
    const dHl = dt / SEC_PER_HALFLIFE;
    this.tHl += dHl;
    const pDecay = 1 - Math.pow(0.5, dHl);
    this.alive.forEach((a, i) => {
      if (a && Math.random() < pDecay) {
        this.alive[i] = false;
        this.flash.set(i, 0.5);
      }
    });
    for (const [k, v] of this.flash) {
      const nv = v - dt;
      if (nv <= 0) this.flash.delete(k);
      else this.flash.set(k, nv);
    }
    if (this.history.length === 0 || this.tHl - this.history.length * 0.05 > 0) {
      this.history.push(this.remaining());
    }
  }

  private remaining() {
    return this.alive.reduce((s, a) => s + (a ? 1 : 0), 0);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);

    // Siatka jąder (górne ~60%)
    const gh = h * 0.58;
    const cell = Math.min(w / GRID, gh / ROWS);
    const ox = (w - cell * GRID) / 2;
    for (let i = 0; i < this.alive.length; i++) {
      const x = ox + (i % GRID) * cell + cell / 2;
      const y = 8 + Math.floor(i / GRID) * cell + cell / 2;
      const fl = this.flash.get(i);
      if (fl !== undefined) {
        ctx.fillStyle = `rgba(244,124,124,${fl * 2})`;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = this.alive[i] ? '#6ee7a0' : 'rgba(141,151,180,0.25)';
      ctx.beginPath();
      ctx.arc(x, y, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wykres N(t): symulacja vs teoria
    const cy0 = h * 0.66;
    const ch = h * 0.28;
    const total = GRID * ROWS;
    const tMax = Math.max(this.tHl, 4);
    ctx.strokeStyle = 'rgba(141,151,180,0.4)';
    ctx.strokeRect(ox, cy0, cell * GRID, ch);
    // teoria
    ctx.strokeStyle = 'rgba(230,234,245,0.5)';
    ctx.setLineDash([4, 4]);
    const theorySteps = Math.floor((cell * GRID) / 4) + 1;
    tracePolylineBy(ctx, theorySteps, (i) => {
      const px = i * 4;
      const t = (px / (cell * GRID)) * tMax;
      return { x: ox + px, y: cy0 + ch * (1 - Math.pow(0.5, t)) };
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // symulacja
    ctx.strokeStyle = '#6ee7a0';
    ctx.lineWidth = 2;
    tracePolylineBy(ctx, this.history.length, (i) => {
      const t = i * 0.05;
      return { x: ox + (t / tMax) * cell * GRID, y: cy0 + ch * (1 - this.history[i] / total) };
    });
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = 'rgba(230,234,245,0.7)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`pozostało: ${this.remaining()}/${total} · czas: ${this.tHl.toFixed(2)} T½`, ox + 4, h - 8);
  }

  getStats() {
    return { remaining: this.remaining(), halfLives: Math.round(this.tHl * 100) / 100 };
  }
}

export const nuclearLab: LabDefinition = {
  id: 'nuclear',
  name: 'Nuclear Lab',
  tagline: 'Rozpady promieniotwórcze, rozszczepienie, fuzja',
  icon: '☢️',
  accent: '#6ee7a0',
  honesty: 'exact',
  honestyNote:
    'Prawo rozpadu i losowość pojedynczych jąder są fizycznie dokładne. Czas skompresowany (6 s ekranu = 1 okres półtrwania). Pominięte: produkty pośrednie łańcuchów rozpadu. Rozszczepienie i fuzja — Etap 1.',
  params: [
    {
      key: 'isotope', label: 'Izotop', type: 'select', default: 'c14',
      options: Object.values(ISOTOPES).map((i) => ({ value: i.id, label: i.label })),
    },
  ],
  createSim: () => new DecaySim(),
  experiments: [nuclearChain, nuclearTokamak],
  narrate(p, stats) {
    const iso = ISOTOPES[String(p.isotope)] ?? ISOTOPES.c14;
    const rem = Number(stats.remaining ?? 308);
    const hl = Number(stats.halfLives ?? 0);
    return [
      {
        title: `${iso.label}: T½ = ${iso.halfLife}`,
        body: `Rozpad ${iso.mode}: ${iso.modeText} Na ekranie minęło ${hl.toFixed(1)} okresu półtrwania — w rzeczywistości trwałoby to ${iso.halfLife} razy tyle.`,
      },
      {
        title: `Zostało ${rem} z 308 jąder (${((rem / 308) * 100).toFixed(0)}%)`,
        body: `Teoria przewiduje po ${hl.toFixed(1)} T½: ${(Math.pow(0.5, hl) * 100).toFixed(0)}%. Zielona linia (symulacja) faluje wokół przerywanej (teoria) — bo rozpad każdego jądra jest fundamentalnie losowy. Fizyka nie umie wskazać, KTÓRE jądro rozpadnie się następne; umie tylko podać prawdopodobieństwo. Einstein nie mógł się z tym pogodzić — a jednak tak działa świat.`,
      },
      {
        title: 'Reguła kciuka',
        body: 'Po 1 okresie półtrwania zostaje 50%, po 3,3 — 10%, po 10 — mniej niż 0,1%. Dlatego jod-131 znika z okolic awarii w ~3 miesiące, a uran-238 przetrwa do śmierci Słońca.',
      },
    ];
  },
  roadmap: [
    'Rozszczepienie U-235 z reakcją łańcuchową i masą krytyczną (Etap 1)',
    'Fuzja D-T i warunki tokamaka (Etap 1)',
    'Pełne łańcuchy rozpadu z produktami pośrednimi (Etap 2)',
  ],
};
