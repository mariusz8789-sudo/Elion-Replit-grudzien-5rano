import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Tokamak — kryterium Lawsona dla fuzji D-T.
 * Warunek zapłonu: potrójny iloczyn n·T·τ_E ≳ 3×10²¹ keV·s/m³
 * (minimum przy T ≈ 15–25 keV). Model 0-wymiarowy — bilans, nie MHD.
 * Reaktywność D-T ma maksimum przy ~64 keV, ale uwzględniając straty
 * promieniste optimum pracy leży niżej.
 */

class TokamakSim implements Sim {
  private t = 0;
  private ratio = 0;

  init() {}

  update(dt: number, p: SimParams) {
    this.t += dt;
    const n = Math.pow(10, Number(p.n)); // m⁻³
    const T = Number(p.T); // keV
    const tau = Number(p.tau); // s
    this.ratio = (n * T * tau) / 3e21;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const bgGrad = ctx.createRadialGradient(w / 2, h * 0.44, 0, w / 2, h * 0.44, Math.max(w, h) * 0.8);
    bgGrad.addColorStop(0, '#0a0808');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.44;
    const R = Math.min(w, h) * 0.3; // duży promień torusa
    const r = R * 0.42; // mały promień

    const glow = Math.min(this.ratio, 1.5);

    // przekrój torusa: dwa okręgi (przekrój poloidalny)
    for (const side of [-1, 1]) {
      const ox = cx + side * R;
      // komora
      ctx.strokeStyle = 'rgba(141,151,180,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ox, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      // plazma
      const grad = ctx.createRadialGradient(ox, cy, 1, ox, cy, r * 0.85);
      const heat = Math.min(glow, 1);
      grad.addColorStop(0, `rgba(255,255,255,${0.25 + heat * 0.75})`);
      grad.addColorStop(0.5, `rgba(240,${140 + heat * 60},92,${0.2 + heat * 0.5})`);
      grad.addColorStop(1, 'rgba(167,139,250,0.12)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ox, cy, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
      // cewki pola
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        ctx.strokeStyle = 'rgba(92,214,232,0.4)';
        ctx.beginPath();
        ctx.arc(ox, cy, r + 6, a, a + 0.35);
        ctx.stroke();
      }
      // błyski fuzji
      const flashes = Math.floor(glow * 14);
      for (let i = 0; i < flashes; i++) {
        const a = (this.t * 3 + i * 2.4) % (Math.PI * 2);
        const rr = r * 0.5 * ((i * 37 % 10) / 10 + 0.2);
        ctx.fillStyle = `rgba(255,240,200,${0.4 + 0.6 * Math.sin(this.t * 8 + i)})`;
        ctx.fillRect(ox + rr * Math.cos(a), cy + rr * Math.sin(a), 2.5, 2.5);
      }
    }

    // pasek postępu do zapłonu (log)
    const bx = w * 0.08;
    const bw = w * 0.84;
    const by = h * 0.84;
    ctx.strokeStyle = 'rgba(141,151,180,0.5)';
    ctx.strokeRect(bx, by, bw, 10);
    const frac = Math.min(1, Math.max(0, (Math.log10(this.ratio) + 2) / 2.3)); // 10^-2..10^0.3
    ctx.fillStyle = this.ratio >= 1 ? '#6ee7a0' : '#f0b35c';
    ctx.fillRect(bx, by, bw * frac, 10);
    // znacznik zapłonu
    const ignX = bx + bw * (2 / 2.3);
    ctx.strokeStyle = '#6ee7a0';
    ctx.beginPath();
    ctx.moveTo(ignX, by - 6);
    ctx.lineTo(ignX, by + 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(230,234,245,0.8)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('ZAPŁON', ignX - 22, by - 10);
    ctx.fillText(`n·T·τ = ${(this.ratio).toFixed(2)}× progu Lawsona`, bx, by + 28);
  }

  getStats() {
    return { ratio: Math.round(this.ratio * 100) / 100 };
  }
}

export const nuclearTokamak: ExperimentDef = {
  id: 'tokamak',
  name: 'Tokamak',
  honesty: 'simplified',
  honestyNote:
    'Bilans 0-wymiarowy: kryterium Lawsona (n·T·τ_E ≥ 3×10²¹ keV·s/m³) jest realnym warunkiem zapłonu D-T, ale pomijamy profil plazmy, niestabilności MHD i straty promieniste — czyli całą trudną część inżynierii fuzji.',
  params: [
    {
      key: 'n', label: 'Gęstość plazmy n', type: 'slider',
      min: 19, max: 21.5, step: 0.05, default: 20,
      format: (v) => `10^${v.toFixed(2)} m⁻³`,
    },
    { key: 'T', label: 'Temperatura T', type: 'slider', min: 2, max: 40, step: 1, default: 15, unit: 'keV' },
    { key: 'tau', label: 'Czas utrzymania energii τ_E', type: 'slider', min: 0.1, max: 8, step: 0.1, default: 1.5, unit: 's' },
  ],
  createSim: () => new TokamakSim(),
  narrate(p, stats) {
    const ratio = Number(stats.ratio ?? 0);
    const T = Number(p.T);
    const blocks = [
      {
        title: ratio >= 1 ? '🔥 Warunek zapłonu spełniony' : `Do zapłonu brakuje ${ratio > 0 ? (1 / Math.max(ratio, 0.001)).toFixed(1) : '∞'}×`,
        body:
          ratio >= 1
            ? `Potrójny iloczyn n·T·τ_E przekroczył próg Lawsona — plazma grzeje się własnymi cząstkami α (hel z fuzji) i nie potrzebuje zewnętrznego grzania. Dokładnie o ten stan walczy ITER (cel: Q≥10 przy T≈15 keV, τ_E≈3–4 s) i o niego otarł się laserowy NIF w 2022 r.`
            : `Każdy z trzech suwaków to inna bitwa inżynierii: gęstość ogranicza stabilność plazmy, temperaturę osiąga się grzaniem mikrofalowym i wiązkami, a czas utrzymania τ_E — kluczowa słabość — rośnie z rozmiarem maszyny (dlatego ITER jest wielki). Podnieś τ_E i patrz, jak pasek zbliża się do zapłonu.`,
      },
      {
        title: `Dlaczego akurat T ≈ 10–25 keV (${(T * 11.6).toFixed(0)} mln K przy obecnym ustawieniu)`,
        body: 'Reaktywność D-T rośnie z temperaturą aż do ~64 keV, ale straty promieniste rosną szybciej — realne optimum leży przy kilkunastu keV, czyli ~150–200 mln K: dziesięciokrotnie goręcej niż jądro Słońca. Słońce nadrabia gęstością i... tunelowaniem kwantowym (zobacz Quantum Lab → Tunelowanie: to ten sam efekt).',
      },
    ];
    return blocks;
  },
};
