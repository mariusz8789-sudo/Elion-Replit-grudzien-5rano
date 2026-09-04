import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { tracePolylineBy } from '../../core/canvasHelpers';
import {
  TUNNELING_DOMAIN_LENGTH,
  TUNNELING_GRID_SIZE,
  TunnelingSolver,
} from '../../core/quantum/tunnelingRunner';

export { fft, runTunnelingScenario } from '../../core/quantum/tunnelingRunner';

/**
 * Tunelowanie kwantowe — Canvas wyłącznie odczytuje stan z tego samego runnera
 * split-step Fourier co lokalny Fabric i backendowy bundle. Nie implementuje
 * drugiego solvera ani nie modyfikuje obliczonego pola falowego.
 */
class TunnelingSim extends TunnelingSolver implements Sim {
  init() {
    this.initialize();
  }

  reset() {
    super.reset();
  }

  update(dt: number, p: SimParams) {
    const energy = Number(p.energy);
    const barrier = Number(p.barrier);
    const width = Number(p.width);
    const steps = Math.min(6, Math.max(1, Math.round(dt * 240)));
    this.advance({ energy, barrier, width, steps });
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#070b16');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
    const base = h * 0.78;
    const barrierWidth = (this.lastWidth / TUNNELING_DOMAIN_LENGTH) * w;
    const barrierHeight = h * 0.42 * Math.min(this.lastBarrier / 2, 1.2);

    // Bariera, poziom energii, gęstość i faza czytają wyłącznie stan solvera.
    const barrierGradient = ctx.createLinearGradient(0, base - barrierHeight, 0, base);
    barrierGradient.addColorStop(0, 'rgba(255,214,150,0.4)');
    barrierGradient.addColorStop(1, 'rgba(240,179,92,0.12)');
    ctx.fillStyle = barrierGradient;
    ctx.shadowColor = 'rgba(240,179,92,0.6)';
    ctx.shadowBlur = 14;
    ctx.fillRect(w / 2 - barrierWidth / 2, base - barrierHeight, barrierWidth, barrierHeight);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(240,179,92,0.8)';
    ctx.strokeRect(w / 2 - barrierWidth / 2, base - barrierHeight, barrierWidth, barrierHeight);

    const energyHeight = base - h * 0.42 * Math.min((this.lastEnergy * this.lastBarrier) / 2, 1.2);
    ctx.strokeStyle = 'rgba(92,214,232,0.5)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, energyHeight);
    ctx.lineTo(w, energyHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(92,214,232,0.8)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('E pakietu', 8, energyHeight - 5);

    const densityScale = h * 2.4;
    ctx.shadowColor = '#5cd6e8';
    ctx.shadowBlur = 8;
    tracePolylineBy(ctx, TUNNELING_GRID_SIZE, (i) => ({
      x: (i / TUNNELING_GRID_SIZE) * w,
      y: base - (this.re[i] ** 2 + this.im[i] ** 2) * densityScale,
    }));
    ctx.strokeStyle = '#8de8f5';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineTo(w, base);
    ctx.lineTo(0, base);
    ctx.closePath();
    ctx.fillStyle = 'rgba(92,214,232,0.15)';
    ctx.fill();
    ctx.lineWidth = 1;

    // Faza lokalna ψ=|ψ|e^{iθ} pochodzi z obliczonych Re/Im, nie z dekoracji UI.
    let maximumDensity = 0;
    for (let i = 0; i < TUNNELING_GRID_SIZE; i++) maximumDensity = Math.max(maximumDensity, this.re[i] ** 2 + this.im[i] ** 2);
    for (let i = 0; i < TUNNELING_GRID_SIZE; i += 4) {
      const density = this.re[i] ** 2 + this.im[i] ** 2;
      if (density < maximumDensity * 0.02) continue;
      const phase = Math.atan2(this.im[i], this.re[i]);
      const hue = ((phase / (2 * Math.PI)) * 360 + 360) % 360;
      const x = (i / TUNNELING_GRID_SIZE) * w;
      const y = base - density * densityScale;
      const radius = 1.4 + (density / maximumDensity) * 2.2;
      ctx.fillStyle = `hsla(${hue}, 85%, 68%, 0.9)`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`przeszło: ${(this.transmission * 100).toFixed(1)}%`, w - 8, h - 23);
    ctx.fillText(`odbite:  ${(this.reflection * 100).toFixed(1)}%`, w - 8, h - 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(141,151,180,0.7)';
    ctx.font = '9px system-ui';
    ctx.fillText('kolor = faza ψ (realna dana symulacji)', 8, h - 8);
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
    const energy = Number(p.energy);
    const transmission = Number(stats.trans ?? 0);
    return [
      {
        title: energy < 1 ? `Klasycznie: 0%. Kwantowo: ${transmission.toFixed(1)}%` : `Nad barierą — a mimo to część się odbija`,
        body:
          energy < 1
            ? `Pakiet ma tylko ${(energy * 100).toFixed(0)}% energii potrzebnej, by przejść nad barierą — klasyczna piłka odbiłaby się zawsze. Funkcja falowa zanika wewnątrz bariery wykładniczo, ale nie do zera: po drugiej stronie odradza się z amplitudą ${transmission.toFixed(1)}%. Zwęź barierę i patrz, jak transmisja rośnie wykładniczo.`
            : `Energia przekracza barierę, więc klasycznie przeszłoby 100%. Kwantowo część fali ODBIJA SIĘ mimo to (${(100 - transmission).toFixed(1)}% wciąż po lewej) — odbicie od progu potencjału to czysto falowy efekt, bez klasycznego odpowiednika.`,
      },
      {
        title: 'To zjawisko napędza Słońce i Twój telefon',
        body: 'Protony w jądrze Słońca mają za mało energii, by pokonać odpychanie kulombowskie — fuzja zachodzi wyłącznie dzięki tunelowaniu. Ten sam efekt: rozpad alfa, pamięci flash (elektrony tunelują przez izolator bramki) i skaningowy mikroskop tunelowy, którym „widzi się” pojedyncze atomy.',
      },
    ];
  },
};
