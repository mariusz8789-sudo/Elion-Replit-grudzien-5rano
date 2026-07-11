import type { LabDefinition, Sim, SimParams } from '../core/types';
import { quantumTunneling } from './experiments/quantum-tunneling';
import { quantumBloch } from './experiments/quantum-bloch-3d';
import { quantumChsh } from './experiments/quantum-chsh';
import { quantumTeleport } from './experiments/quantum-teleport';

/**
 * Quantum Lab — doświadczenie z dwiema szczelinami.
 * Fizyka: rozkład trafień losowany z |ψ|² dla interferencji dwóch szczelin
 * (cos² z obwiednią pojedynczej szczeliny sinc²) — wzory z optyki falowej,
 * które dla pojedynczych cząstek daje mechanika kwantowa. Włączenie
 * "pomiaru przy szczelinach" niszczy interferencję: rozkład staje się sumą
 * dwóch obwiedni. Cząstki celowo pojawiają się na ekranie bez rysowania
 * trajektorii — w MK cząstka nie ma określonej drogi.
 */

class DoubleSlitSim implements Sim {
  private hits: number[] = []; // pozycje x trafień (0..1)
  private histogram = new Array(96).fill(0);
  private acc = 0;
  private flash: { x: number; t: number }[] = [];
  private t = 0;
  // Płótno akumulacji poświaty trafień — tworzone leniwie w render() (nie
  // init()/w polu klasy), bo sims.test.ts uruchamia createSim()/init() bez
  // DOM (ten sam, udokumentowany powód co nuclear-chart.ts). Każde trafienie
  // dorysowuje się TU raz (additive blending) zamiast być redraw'owane co
  // klatkę — jasność narasta dokładnie tak, jak fizycznie narasta pomiar,
  // nie jako dekoracja.
  private glowCanvas: HTMLCanvasElement | null = null;
  private glowCtx: CanvasRenderingContext2D | null = null;
  private glowW = 0;
  private glowH = 0;
  private drawnHits = 0;

  init() {}

  reset = () => {
    this.hits = [];
    this.histogram.fill(0);
    this.flash = [];
    this.drawnHits = 0;
    this.glowCtx?.clearRect(0, 0, this.glowW, this.glowH);
  };

  /** |ψ|² na ekranie: pozycja u ∈ (-1, 1). */
  private prob(u: number, p: SimParams): number {
    const lambda = Number(p.lambda); // 400..700 (jedn. wizualne)
    const d = Number(p.slitDist); // rozstaw szczelin
    const measured = Boolean(p.measured);
    const a = 0.35; // szerokość szczeliny (jedn. wizualne)
    const k = 5200 / lambda;
    const env = (off: number) => {
      const b = k * a * (u - off);
      const s = b === 0 ? 1 : Math.sin(b) / b;
      return s * s;
    };
    if (measured) {
      const off = d * 0.02;
      return 0.5 * env(-off) + 0.5 * env(off);
    }
    const phase = k * d * 0.06 * u;
    return env(0) * Math.cos(phase) ** 2;
  }

  private sample(p: SimParams): number {
    for (let i = 0; i < 60; i++) {
      const u = Math.random() * 2 - 1;
      if (Math.random() < this.prob(u, p)) return u;
    }
    return 0;
  }

  update(dt: number, p: SimParams) {
    this.t += dt;
    this.acc += dt * Number(p.rate);
    while (this.acc >= 1) {
      this.acc -= 1;
      const u = this.sample(p);
      this.hits.push(u);
      const bin = Math.min(this.histogram.length - 1, Math.max(0, Math.floor(((u + 1) / 2) * this.histogram.length)));
      this.histogram[bin]++;
      this.flash.push({ x: u, t: 0.6 });
      if (this.hits.length > 4000) {
        this.hits.shift();
        this.drawnHits = Math.max(0, this.drawnHits - 1);
      }
    }
    for (const f of this.flash) f.t -= dt;
    this.flash = this.flash.filter((f) => f.t > 0);
  }

  private hitScreenPos(u: number, w: number, h: number, screenX: number): { x: number; y: number } {
    const y = h / 2 + (u * h) / 2.15;
    const x = screenX + (((u * 7919) % 1) + 1) % 1 * (w * 0.06);
    return { x, y };
  }

  private ensureGlowCanvas(w: number, h: number) {
    const iw = Math.max(1, Math.round(w));
    const ih = Math.max(1, Math.round(h));
    if (!this.glowCanvas) {
      this.glowCanvas = document.createElement('canvas');
      this.glowCtx = this.glowCanvas.getContext('2d');
    }
    if (this.glowW !== iw || this.glowH !== ih) {
      this.glowCanvas.width = iw;
      this.glowCanvas.height = ih;
      this.glowW = iw;
      this.glowH = ih;
      this.drawnHits = 0; // rozmiar się zmienił — pozycje trzeba przeliczyć i dorysować od nowa
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.ensureGlowCanvas(w, h);
    const screenX = w * 0.6;
    const toY = (u: number) => h / 2 + (u * h) / 2.15;

    // Trafienia dorysowują się na trwałe płótno TYLKO RAZ, gdy się zdarzą —
    // jasność wzoru interferencyjnego to prawdziwa akumulacja pomiaru, nie
    // ozdobny efekt malowany co klatkę.
    if (this.glowCtx) {
      this.glowCtx.globalCompositeOperation = 'lighter';
      for (let i = this.drawnHits; i < this.hits.length; i++) {
        const { x, y } = this.hitScreenPos(this.hits[i], w, h, screenX);
        const grad = this.glowCtx.createRadialGradient(x, y, 0, x, y, 5);
        grad.addColorStop(0, 'rgba(120,225,240,0.55)');
        grad.addColorStop(1, 'rgba(120,225,240,0)');
        this.glowCtx.fillStyle = grad;
        this.glowCtx.beginPath();
        this.glowCtx.arc(x, y, 5, 0, Math.PI * 2);
        this.glowCtx.fill();
      }
      this.glowCtx.globalCompositeOperation = 'source-over';
      this.drawnHits = this.hits.length;
    }

    // Tło: subtelna winieta zamiast płaskiej czerni
    const bgGrad = ctx.createRadialGradient(w * 0.35, h * 0.5, 0, w * 0.35, h * 0.5, Math.max(w, h) * 0.75);
    bgGrad.addColorStop(0, '#070b16');
    bgGrad.addColorStop(1, '#02030a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Źródło: pulsujące światło (emituje żywe cząstki, nie martwa kropka)
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 3);
    const srcGrad = ctx.createRadialGradient(w * 0.08, h / 2, 0, w * 0.08, h / 2, 14);
    srcGrad.addColorStop(0, `rgba(150,235,250,${0.9 * pulse})`);
    srcGrad.addColorStop(1, 'rgba(92,214,232,0)');
    ctx.fillStyle = srcGrad;
    ctx.beginPath();
    ctx.arc(w * 0.08, h / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5cd6e8';
    ctx.beginPath();
    ctx.arc(w * 0.08, h / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Bariera ze szczelinami
    const barX = w * 0.22;
    ctx.fillStyle = '#8d97b4';
    ctx.fillRect(barX, 0, 3, h * 0.42);
    ctx.fillRect(barX, h * 0.47, 3, h * 0.06);
    ctx.fillRect(barX, h * 0.58, 3, h * 0.42);
    ctx.fillStyle = 'rgba(230,234,245,0.55)';
    ctx.font = '10px system-ui';
    ctx.fillText('źródło', w * 0.05, h / 2 + 22);
    ctx.fillText('2 szczeliny', barX - 24, h * 0.44);

    // Ekran detekcyjny: świecący, akumulowany wzór interferencyjny
    if (this.glowCanvas) ctx.drawImage(this.glowCanvas, 0, 0);

    // Chwilowy błysk cząstki przechodzącej przez barierę teraz
    for (const f of this.flash) {
      ctx.fillStyle = `rgba(255,255,255,${f.t})`;
      ctx.beginPath();
      ctx.arc(screenX + w * 0.03, toY(f.x), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Histogram po prawej — słupki ze świecącą krawędzią
    const maxBin = Math.max(1, ...this.histogram);
    const hw = w * 0.24;
    this.histogram.forEach((v, i) => {
      const u = (i / this.histogram.length) * 2 - 1;
      const y = toY(u);
      const bw = (v / maxBin) * hw;
      if (bw < 0.5) return;
      const barGrad = ctx.createLinearGradient(w * 0.72, 0, w * 0.72 + bw, 0);
      barGrad.addColorStop(0, 'rgba(240,179,92,0.5)');
      barGrad.addColorStop(1, 'rgba(255,214,150,0.95)');
      ctx.fillStyle = barGrad;
      ctx.fillRect(w * 0.72, y, bw, h / this.histogram.length + 0.5);
    });

    ctx.fillStyle = 'rgba(230,234,245,0.6)';
    ctx.font = '10px system-ui';
    ctx.fillText(`cząstek: ${this.hits.length}`, 10, h - 12);
  }

  getStats() {
    return { count: this.hits.length };
  }
}

export const quantumLab: LabDefinition = {
  id: 'quantum',
  name: 'Quantum Lab',
  tagline: 'Superpozycja, interferencja, pomiar, dekoherencja',
  icon: '⚛️',
  accent: '#5cd6e8',
  honesty: 'exact',
  honestyNote:
    'Rozkład trafień losowany z |ψ|² według dokładnych wzorów interferencji dwuszczelinowej. Celowo nie rysujemy trajektorii cząstek — w mechanice kwantowej cząstka nie ma określonej drogi między źródłem a ekranem. Skale odległości są umowne (jednostki wizualne).',
  params: [
    { key: 'lambda', label: 'Długość fali', type: 'slider', min: 400, max: 700, step: 10, default: 550, unit: 'j.u.' },
    { key: 'slitDist', label: 'Rozstaw szczelin', type: 'slider', min: 4, max: 20, step: 1, default: 10, unit: 'j.u.' },
    { key: 'measured', label: 'Detektor przy szczelinach (pomiar drogi)', type: 'toggle', default: false },
    { key: 'rate', label: 'Cząstek na sekundę', type: 'slider', min: 5, max: 200, step: 5, default: 60 },
  ],
  createSim: () => new DoubleSlitSim(),
  experiments: [quantumTunneling, quantumBloch, quantumChsh, quantumTeleport],
  narrate(p, stats) {
    const measured = Boolean(p.measured);
    const lambda = Number(p.lambda);
    const d = Number(p.slitDist);
    const n = Number(stats.count ?? 0);
    const blocks = [];
    if (measured) {
      blocks.push({
        title: 'Pomiar zniszczył interferencję',
        kind: 'warning' as const,
        body: 'Detektor przy szczelinach rozstrzyga, którędy przeszła cząstka — superpozycja dróg znika i prążki zlewają się w dwie plamy. To nie efekt "zaburzenia" przez przyrząd, lecz fundamentalna cecha MK: informacja o drodze wyklucza interferencję. W realnych układach tę samą rolę pełni dekoherencja — niekontrolowane "pomiary" przez otoczenie.',
      });
    } else {
      blocks.push({
        title: n < 200 ? 'Pojedyncze cząstki — na razie chaos' : 'Prążki wyłaniają się z pojedynczych trafień',
        body:
          n < 200
            ? `Po ${n} cząstkach trafienia wyglądają losowo. Każda cząstka przechodzi przez układ pojedynczo — poczekaj, aż statystyka ujawni wzór, którego żadna pojedyncza cząstka "nie zna".`
            : `${n} cząstek ułożyło się w prążki interferencyjne, choć każda leciała osobno. Każda interferuje sama ze sobą — przechodzi przez obie szczeliny w superpozycji. Doświadczenie wykonano z elektronami (Tonomura 1989), a nawet z cząsteczkami ~2000 atomów (2019).`,
      });
    }
    blocks.push({
      title: 'Sprawdź zależność od parametrów',
      body: `Odstęp prążków rośnie z długością fali i maleje z rozstawem szczelin (Δy ∝ λ/d). Obecnie λ=${lambda}, d=${d} — podwój rozstaw i patrz, jak prążki gęstnieją. To samo prawo działa dla światła, elektronów i atomów.`,
    });
    return blocks;
  },
};
