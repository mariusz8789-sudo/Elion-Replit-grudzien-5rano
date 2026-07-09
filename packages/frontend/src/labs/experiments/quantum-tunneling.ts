import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { tracePolylineBy } from '../../core/canvasHelpers';

/**
 * Tunelowanie kwantowe — pakiet falowy 1D liczony NA ŻYWO metodą split-step
 * Fourier: ψ(t+dt) = V½ · F⁻¹[K · F[V½ · ψ]]. To rzeczywiste rozwiązanie
 * równania Schrödingera (jednostki naturalne ħ=m=1), nie animacja.
 */

const N = 512; // siatka (potęga 2 dla FFT)
const L = 100; // długość domeny (j.n.)
const DX = L / N;

/** FFT radix-2 (in-place, iteracyjna). re/im długości N. Eksport dla testów. */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 1 : -1) * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = nwr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

class TunnelingSim implements Sim {
  private re = new Float64Array(N);
  private im = new Float64Array(N);
  private V = new Float64Array(N);
  private k = new Float64Array(N); // wektory falowe siatki
  private mask = new Float64Array(N); // tłumienie brzegowe
  private lastE = 0;
  private lastV0 = 0;
  private lastW = 0;
  private trans = 0;
  private refl = 0;

  constructor() {
    for (let i = 0; i < N; i++) {
      const kk = (i < N / 2 ? i : i - N) * ((2 * Math.PI) / L);
      this.k[i] = kk;
      // miękkie tłumienie przy brzegach domeny (pochłania odbicia od "ścian")
      const x = i * DX;
      const edge = Math.min(x, L - x);
      this.mask[i] = edge < 8 ? Math.exp(-(((8 - edge) / 4) ** 2) * 0.15) : 1;
    }
  }

  init() {
    if (this.lastE === 0) this.launch(0.55, 1, 3);
  }

  private launch(eFrac: number, v0: number, w: number) {
    this.lastE = eFrac;
    this.lastV0 = v0;
    this.lastW = w;
    const k0 = Math.sqrt(2 * v0 * eFrac); // E = k0²/2 = eFrac·V0
    const x0 = L * 0.28;
    const sig = 4;
    let norm = 0;
    for (let i = 0; i < N; i++) {
      const x = i * DX;
      const g = Math.exp(-((x - x0) ** 2) / (4 * sig * sig));
      this.re[i] = g * Math.cos(k0 * x);
      this.im[i] = g * Math.sin(k0 * x);
      norm += g * g * DX;
    }
    const s = 1 / Math.sqrt(norm);
    for (let i = 0; i < N; i++) {
      this.re[i] *= s;
      this.im[i] *= s;
    }
    for (let i = 0; i < N; i++) {
      const x = i * DX;
      this.V[i] = Math.abs(x - L / 2) < w / 2 ? v0 : 0;
    }
  }

  reset = () => {
    this.launch(this.lastE, this.lastV0, this.lastW);
  };

  update(dt: number, p: SimParams) {
    const eFrac = Number(p.energy);
    const v0 = Number(p.barrier);
    const w = Number(p.width);
    if (eFrac !== this.lastE || v0 !== this.lastV0 || w !== this.lastW) {
      this.launch(eFrac, v0, w);
    }
    // kilka kroków split-step na klatkę; dt symulacji stałe dla stabilności
    const steps = Math.min(6, Math.max(1, Math.round(dt * 240)));
    const dts = 0.02;
    for (let s = 0; s < steps; s++) this.step(dts);
    // prawdopodobieństwa: za barierą / przed barierą
    let t = 0;
    let r = 0;
    const bEnd = Math.floor(((L / 2 + w / 2) / L) * N);
    const bStart = Math.floor(((L / 2 - w / 2) / L) * N);
    for (let i = 0; i < N; i++) {
      const d = (this.re[i] ** 2 + this.im[i] ** 2) * DX;
      if (i > bEnd) t += d;
      else if (i < bStart) r += d;
    }
    this.trans = t;
    this.refl = r;
  }

  private step(dt: number) {
    const { re, im, V, k, mask } = this;
    // pół kroku potencjału: ψ *= e^{-iV dt/2}
    for (let i = 0; i < N; i++) {
      const ang = -V[i] * dt * 0.5;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const r = re[i] * c - im[i] * s;
      im[i] = re[i] * s + im[i] * c;
      re[i] = r;
    }
    // pełny krok kinetyczny w przestrzeni pędów
    fft(re, im, false);
    for (let i = 0; i < N; i++) {
      const ang = -0.5 * k[i] * k[i] * dt;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const r = re[i] * c - im[i] * s;
      im[i] = re[i] * s + im[i] * c;
      re[i] = r;
    }
    fft(re, im, true);
    // drugie pół kroku potencjału + maska brzegowa
    for (let i = 0; i < N; i++) {
      const ang = -V[i] * dt * 0.5;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const r = re[i] * c - im[i] * s;
      im[i] = (re[i] * s + im[i] * c) * mask[i];
      re[i] = r * mask[i];
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const base = h * 0.78;
    const bw = (this.lastW / L) * w;
    const bh = h * 0.42 * Math.min(this.lastV0 / 2, 1.2);

    // bariera
    ctx.fillStyle = 'rgba(240,179,92,0.25)';
    ctx.strokeStyle = 'rgba(240,179,92,0.8)';
    ctx.fillRect(w / 2 - bw / 2, base - bh, bw, bh);
    ctx.strokeRect(w / 2 - bw / 2, base - bh, bw, bh);

    // poziom energii pakietu
    const eH = base - h * 0.42 * Math.min((this.lastE * this.lastV0) / 2, 1.2);
    ctx.strokeStyle = 'rgba(92,214,232,0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, eH);
    ctx.lineTo(w, eH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(92,214,232,0.8)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('E pakietu', 8, eH - 5);

    // |ψ|²
    const scale = h * 2.4;
    tracePolylineBy(ctx, N, (i) => ({
      x: (i / N) * w,
      y: base - (this.re[i] ** 2 + this.im[i] ** 2) * scale,
    }));
    ctx.strokeStyle = '#5cd6e8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(w, base);
    ctx.lineTo(0, base);
    ctx.closePath();
    ctx.fillStyle = 'rgba(92,214,232,0.15)';
    ctx.fill();
    ctx.lineWidth = 1;

    // Re ψ (delikatnie) — pokazuje oscylacje fazy
    tracePolylineBy(ctx, N, (i) => ({ x: (i / N) * w, y: base - this.re[i] * h * 0.35 }));
    ctx.strokeStyle = 'rgba(167,139,250,0.35)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`przeszło: ${(this.trans * 100).toFixed(1)}%`, w - 130, 18);
    ctx.fillText(`odbite:  ${(this.refl * 100).toFixed(1)}%`, w - 130, 33);
  }

  getStats() {
    return {
      trans: Math.round(this.trans * 1000) / 10,
      refl: Math.round(this.refl * 1000) / 10,
    };
  }
}

export const quantumTunneling: ExperimentDef = {
  id: 'tunneling',
  name: 'Tunelowanie',
  honesty: 'exact',
  honestyNote:
    'Pakiet falowy jest liczony na żywo z równania Schrödingera (metoda split-step Fourier, ħ=m=1, jednostki naturalne) — to rzeczywista symulacja numeryczna na Twoim urządzeniu, nie animacja. Brzegi domeny mają tłumienie pochłaniające.',
  params: [
    {
      key: 'energy', label: 'Energia pakietu / wysokość bariery', type: 'slider',
      min: 0.2, max: 1.6, step: 0.05, default: 0.55,
      format: (v) => `${(v * 100).toFixed(0)}%`,
    },
    { key: 'barrier', label: 'Wysokość bariery', type: 'slider', min: 0.4, max: 2.5, step: 0.1, default: 1, unit: 'j.n.' },
    { key: 'width', label: 'Szerokość bariery', type: 'slider', min: 1, max: 8, step: 0.5, default: 3, unit: 'j.n.' },
  ],
  createSim: () => new TunnelingSim(),
  narrate(p, stats) {
    const e = Number(p.energy);
    const t = Number(stats.trans ?? 0);
    return [
      {
        title: e < 1 ? `Klasycznie: 0%. Kwantowo: ${t.toFixed(1)}%` : `Nad barierą — a mimo to część się odbija`,
        body:
          e < 1
            ? `Pakiet ma tylko ${(e * 100).toFixed(0)}% energii potrzebnej, by przejść nad barierą — klasyczna piłka odbiłaby się zawsze. Funkcja falowa zanika wewnątrz bariery wykładniczo, ale nie do zera: po drugiej stronie odradza się z amplitudą ${t.toFixed(1)}%. Zwęź barierę i patrz, jak transmisja rośnie wykładniczo.`
            : `Energia przekracza barierę, więc klasycznie przeszłoby 100%. Kwantowo część fali ODBIJA SIĘ mimo to (${(100 - t).toFixed(1)}% wciąż po lewej) — odbicie od progu potencjału to czysto falowy efekt, bez klasycznego odpowiednika.`,
      },
      {
        title: 'To zjawisko napędza Słońce i Twój telefon',
        body: 'Protony w jądrze Słońca mają za mało energii, by pokonać odpychanie kulombowskie — fuzja zachodzi wyłącznie dzięki tunelowaniu. Ten sam efekt: rozpad alfa, pamięci flash (elektrony tunelują przez izolator bramki) i skaningowy mikroskop tunelowy, którym „widzi się" pojedyncze atomy.',
      },
    ];
  },
};
