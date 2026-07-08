import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Masa niezmiennicza — jak NAPRAWDĘ odkrywa się cząstki.
 * Każde "zdarzenie" to para mionów; histogram M = √((ΣE)² − (Σp)²)
 * wypełnia się na żywo i z szumu wyrastają piki rezonansów.
 * Masy i szerokości z PDG: J/ψ 3,097 GeV; ψ(2S) 3,686; Υ(1S) 9,46;
 * Z⁰ 91,19 GeV (Γ = 2,5 GeV). Proporcje sygnał/tło uproszczone —
 * dane syntetyczne wzorowane na widmach dimionowych CMS.
 */

interface Resonance { m: number; g: number; rate: number; label: string }

const RESONANCES: Resonance[] = [
  { m: 3.097, g: 0.034, rate: 0.3, label: 'J/ψ' },
  { m: 3.686, g: 0.034, rate: 0.06, label: "ψ(2S)" },
  { m: 9.46, g: 0.054, rate: 0.12, label: 'Υ' },
  { m: 91.19, g: 2.5, rate: 0.1, label: 'Z⁰' },
];

const M_MIN = Math.log(2);
const M_MAX = Math.log(130);
const BINS = 130;

class InvMassSim implements Sim {
  private hist = new Float64Array(BINS);
  private total = 0;
  private acc = 0;

  init() {}

  reset = () => {
    this.hist.fill(0);
    this.total = 0;
  };

  private sampleMass(): number {
    const u = Math.random();
    let cum = 0;
    for (const r of RESONANCES) {
      cum += r.rate;
      if (u < cum) {
        // Breit–Wigner (Cauchy) wokół rezonansu
        return Math.max(2.05, r.m + (r.g / 2) * Math.tan(Math.PI * (Math.random() - 0.5)));
      }
    }
    // tło kombinatoryczne: opadające wykładniczo w log M
    return 2.05 + Math.pow(Math.random(), 2.6) * 110;
  }

  update(dt: number, p: SimParams) {
    this.acc += dt * Number(p.rate);
    while (this.acc >= 1) {
      this.acc -= 1;
      const m = this.sampleMass();
      const bin = Math.floor(((Math.log(m) - M_MIN) / (M_MAX - M_MIN)) * BINS);
      if (bin >= 0 && bin < BINS) {
        this.hist[bin]++;
        this.total++;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const bx = w * 0.09;
    const bw = w * 0.86;
    const by = h * 0.1;
    const bh = h * 0.68;

    // osie
    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.strokeRect(bx, by, bw, bh);
    // skala log na osi M: znaczniki
    ctx.fillStyle = 'rgba(141,151,180,0.8)';
    ctx.font = '9px ui-monospace, monospace';
    for (const m of [2, 3, 5, 10, 20, 50, 91, 120]) {
      const x = bx + ((Math.log(m) - M_MIN) / (M_MAX - M_MIN)) * bw;
      ctx.fillText(String(m), x - 6, by + bh + 14);
      ctx.strokeStyle = 'rgba(141,151,180,0.15)';
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.lineTo(x, by + bh);
      ctx.stroke();
    }
    ctx.fillText('M(μ⁺μ⁻) [GeV]', bx + bw / 2 - 40, by + bh + 28);

    // histogram (log-y)
    const maxBin = Math.max(4, ...this.hist);
    ctx.fillStyle = 'rgba(92,214,232,0.85)';
    const binW = bw / BINS;
    for (let i = 0; i < BINS; i++) {
      if (this.hist[i] === 0) continue;
      const y = (Math.log(this.hist[i] + 1) / Math.log(maxBin + 1)) * bh;
      ctx.fillRect(bx + i * binW, by + bh - y, Math.max(binW - 0.5, 1), y);
    }

    // etykiety rezonansów, gdy pik urósł
    ctx.font = '600 11px ui-monospace, monospace';
    for (const r of RESONANCES) {
      const bin = Math.floor(((Math.log(r.m) - M_MIN) / (M_MAX - M_MIN)) * BINS);
      if (this.hist[bin] > 8 + this.total * 0.002) {
        const x = bx + bin * binW;
        const y = by + bh - (Math.log(this.hist[bin] + 1) / Math.log(maxBin + 1)) * bh;
        ctx.fillStyle = '#f0b35c';
        ctx.fillText(r.label, x - 8, y - 6);
      }
    }

    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`zdarzeń: ${this.total.toLocaleString('pl-PL')}`, bx, by - 8);
  }

  getStats() {
    // które piki już "odkryte"
    let peaks = 0;
    for (const r of RESONANCES) {
      const bin = Math.floor(((Math.log(r.m) - M_MIN) / (M_MAX - M_MIN)) * BINS);
      if (this.hist[bin] > 8 + this.total * 0.002) peaks++;
    }
    return { events: this.total, peaks };
  }
}

export const particleInvMass: ExperimentDef = {
  id: 'invmass',
  name: 'Odkryj cząstkę',
  honesty: 'educational',
  honestyNote:
    'Masy i szerokości rezonansów są prawdziwe (PDG); metoda — histogram masy niezmienniczej par mionów — jest dokładnie tą, którą odkryto J/ψ i Z⁰. Proporcje sygnału do tła są uproszczone; dane syntetyczne wzorowane na widmach CMS. Realne dane CERN Open Data (CC0) — plan Etapu 2.',
  params: [
    { key: 'rate', label: 'Zdarzeń na sekundę', type: 'slider', min: 20, max: 600, step: 20, default: 200 },
  ],
  createSim: () => new InvMassSim(),
  narrate(_p, stats) {
    const n = Number(stats.events ?? 0);
    const peaks = Number(stats.peaks ?? 0);
    return [
      {
        title:
          n < 800
            ? 'Na razie szum…'
            : peaks >= 4
              ? 'Odkryłeś wszystkie 4 rezonanse!'
              : `Z szumu wyrosły ${peaks} piki`,
        body:
          n < 800
            ? 'Dla każdej pary mionów detektor mierzy energie i pędy, a fizyk liczy masę niezmienniczą M² = (ΣE)² − (Σp)². Jeśli miony pochodzą z rozpadu jednej cząstki, M trafia zawsze w jej masę — zbieraj statystykę i patrz na oś ~3, ~9,5 i ~91 GeV.'
            : 'Każdy pik to cząstka: J/ψ przy 3,1 GeV (odkryta w 1974 — „rewolucja listopadowa", potwierdziła istnienie kwarka powabnego), Υ przy 9,5 GeV (kwark denny, 1977) i szeroki Z⁰ przy 91 GeV (1983, Nobel dla Rubbii). Szerokość piku Z (2,5 GeV) to nie błąd pomiaru — to zasada nieoznaczoności: czas życia 3×10⁻²⁵ s daje rozmycie energii.',
      },
      {
        title: 'Dokładnie tak znaleziono Higgsa',
        body: 'W 2012 r. ATLAS i CMS zrobiły ten sam histogram dla par fotonów: po bilionach zderzeń przy 125 GeV wyrósł garb o istotności 5σ. Cała fizyka cząstek to statystyka wyrastająca z szumu — właśnie ją masz przed sobą.',
      },
    ];
  },
};
