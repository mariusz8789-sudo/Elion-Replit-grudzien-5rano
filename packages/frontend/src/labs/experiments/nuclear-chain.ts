import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Reakcja łańcuchowa — model cząsteczkowy: neutrony latają po komorze,
 * trafienie w jądro rozszczepialne = rozszczepienie (2–3 nowe neutrony),
 * pręty kontrolne pochłaniają. Współczynnik k liczony z rzeczywistych
 * zdarzeń symulacji (neutrony potomne / neutrony zużyte). Model dydaktyczny —
 * prawdziwa neutronika to transport Monte Carlo z przekrojami czynnymi.
 */

interface Neutron { x: number; y: number; vx: number; vy: number }
interface Nucleus { x: number; y: number; alive: boolean; fissile: boolean }

class ChainReactionSim implements Sim {
  private neutrons: Neutron[] = [];
  private nuclei: Nucleus[] = [];
  private w = 0;
  private h = 0;
  private births = 0;
  private deaths = 0;
  private k = 0;
  private flash: { x: number; y: number; t: number }[] = [];
  private lastEnrich = -1;

  init(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (this.nuclei.length === 0) this.seed(0.35);
  }

  private seed(enrich: number) {
    this.lastEnrich = enrich;
    this.nuclei = [];
    const cols = 26;
    const rows = 15;
    for (let i = 0; i < cols * rows; i++) {
      this.nuclei.push({
        x: (this.w / cols) * (i % cols) + this.w / cols / 2,
        y: (this.h * 0.92 / rows) * Math.floor(i / cols) + 14,
        alive: true,
        fissile: Math.random() < enrich,
      });
    }
    this.neutrons = [];
    this.births = 0;
    this.deaths = 0;
    this.k = 0;
  }

  reset = () => {
    this.seed(this.lastEnrich);
  };

  pointer(x: number, y: number, type: 'down' | 'move' | 'up') {
    if (type !== 'down') return;
    const a = Math.random() * Math.PI * 2;
    this.neutrons.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 });
  }

  private rodXs(count: number): number[] {
    const xs: number[] = [];
    for (let i = 1; i <= count; i++) xs.push((this.w / (count + 1)) * i);
    return xs;
  }

  update(dt: number, p: SimParams) {
    const enrich = Number(p.enrich);
    if (enrich !== this.lastEnrich) this.seed(enrich);
    const rodDepth = Number(p.rods); // 0..1
    this.lastRodDepth = rodDepth;
    const rods = this.rodXs(4);

    // źródło startowe: pojedynczy neutron co 1,5 s, gdy pusto
    if (this.neutrons.length === 0 && Math.random() < dt / 1.2) {
      this.pointer(this.w * (0.2 + Math.random() * 0.6), this.h * (0.2 + Math.random() * 0.6), 'down');
    }

    const newNeutrons: Neutron[] = [];
    let births = 0;
    let deaths = 0;
    for (const n of this.neutrons) {
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      // ściany: ucieczka
      if (n.x < 0 || n.x > this.w || n.y < 0 || n.y > this.h * 0.95) {
        deaths++;
        continue;
      }
      // pręty kontrolne
      let absorbed = false;
      for (const rx of rods) {
        if (Math.abs(n.x - rx) < 4 && n.y < this.h * 0.95 * rodDepth) {
          absorbed = true;
          break;
        }
      }
      if (absorbed) {
        deaths++;
        continue;
      }
      // trafienia w jądra
      let hit = false;
      for (const nc of this.nuclei) {
        if (!nc.alive) continue;
        const dx = nc.x - n.x;
        const dy = nc.y - n.y;
        if (dx * dx + dy * dy < 36) {
          hit = true;
          deaths++;
          if (nc.fissile) {
            nc.alive = false;
            this.flash.push({ x: nc.x, y: nc.y, t: 0.4 });
            const kids = 2 + (Math.random() < 0.45 ? 1 : 0);
            for (let c = 0; c < kids && this.neutrons.length + newNeutrons.length < 900; c++) {
              const a = Math.random() * Math.PI * 2;
              newNeutrons.push({ x: nc.x, y: nc.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 });
              births++;
            }
          }
          break;
        }
      }
      if (!hit) newNeutrons.push(n);
    }
    this.neutrons = newNeutrons;
    // wygładzany estymator k
    this.births += births;
    this.deaths += deaths;
    if (this.deaths > 24) {
      this.k = this.births / this.deaths;
      this.births *= 0.3;
      this.deaths *= 0.3;
    }
    for (const f of this.flash) f.t -= dt;
    this.flash = this.flash.filter((f) => f.t > 0);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    for (const nc of this.nuclei) {
      if (!nc.alive) {
        ctx.fillStyle = 'rgba(141,151,180,0.15)';
      } else {
        ctx.fillStyle = nc.fissile ? 'rgba(110,231,160,0.9)' : 'rgba(141,151,180,0.5)';
      }
      ctx.beginPath();
      ctx.arc(nc.x, nc.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const f of this.flash) {
      ctx.fillStyle = `rgba(255,220,150,${f.t * 2})`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 9 * (0.5 - f.t) * 4 + 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#5cd6e8';
    for (const n of this.neutrons) {
      ctx.fillRect(n.x - 1, n.y - 1, 2.4, 2.4);
    }
    // pręty
    const rodDepth = this.lastRodDepth;
    for (const rx of this.rodXs(4)) {
      ctx.fillStyle = 'rgba(244,124,124,0.75)';
      ctx.fillRect(rx - 3, 0, 6, h * 0.95 * rodDepth);
    }
    ctx.fillStyle = 'rgba(230,234,245,0.8)';
    ctx.font = '11px ui-monospace, monospace';
    const verdict = this.k > 1.05 ? 'NADKRYTYCZNY' : this.k > 0.95 ? 'krytyczny' : 'podkrytyczny';
    ctx.fillText(`neutrony: ${this.neutrons.length} · k ≈ ${this.k.toFixed(2)} (${verdict})`, 10, h - 8);
  }

  private lastRodDepth = 0.4;

  getStats() {
    return { neutrons: this.neutrons.length, k: Math.round(this.k * 100) / 100 };
  }
}

export const nuclearChain: ExperimentDef = {
  id: 'chain',
  name: 'Reakcja łańcuchowa',
  honesty: 'educational',
  honestyNote:
    'Model cząsteczkowy reakcji łańcuchowej: k liczone z rzeczywistych zdarzeń symulacji. Fizyka jakościowa jest poprawna (rozszczepienie U-235 daje średnio ~2,4 neutronu; pręty pochłaniają); prawdziwa neutronika wymaga przekrojów czynnych i transportu Monte Carlo. Dotknij ekranu, by wstrzyknąć neutron.',
  params: [
    {
      key: 'rods', label: 'Zanurzenie prętów kontrolnych', type: 'slider',
      min: 0, max: 1, step: 0.02, default: 0.4,
      format: (v) => `${(v * 100).toFixed(0)}%`,
    },
    {
      key: 'enrich', label: 'Wzbogacenie (udział jąder rozszczepialnych)', type: 'slider',
      min: 0.1, max: 0.7, step: 0.02, default: 0.35,
      format: (v) => `${(v * 100).toFixed(0)}%`,
    },
  ],
  createSim: () => new ChainReactionSim(),
  narrate(_p, stats) {
    const k = Number(stats.k ?? 0);
    const n = Number(stats.neutrons ?? 0);
    return [
      {
        title: `k ≈ ${k.toFixed(2)} — ${k > 1.05 ? 'lawina rośnie' : k > 0.95 ? 'stan krytyczny: reaktor pracuje' : 'reakcja wygasa'}`,
        body:
          k > 1.05
            ? `Każde pokolenie neutronów jest ${k.toFixed(2)}× liczniejsze od poprzedniego — wzrost wykładniczy (${n} neutronów w komorze). W reaktorze pręty wsuwa się automatycznie w ułamku sekundy; fizyka bomby to właśnie k≫1 utrzymane przez mikrosekundy. Wsuń pręty i zobacz, jak szybko lawina gaśnie.`
            : k > 0.95
              ? 'Dokładnie k = 1 to serce energetyki jądrowej: każde rozszczepienie prowadzi średnio do dokładnie jednego następnego. Reaktorem da się sterować dzięki neutronom opóźnionym (~0,65% neutronów rodzi się sekundy po rozszczepieniu) — bez nich regulacja byłaby niemożliwa.'
              : `Przy k = ${k.toFixed(2)} każde pokolenie jest słabsze — reakcja wygasa sama. Tak wygląda bezpieczeństwo pasywne: za dużo pochłaniania (pręty, wzbogacenie za niskie, ucieczka przez brzegi), by lawina się utrzymała.`,
      },
      {
        title: 'Dlaczego rozmiar ma znaczenie',
        body: 'Neutrony uciekają przez powierzchnię (∝ r²), a rodzą się w objętości (∝ r³) — dlatego istnieje masa krytyczna: dla kuli czystego U-235 to ~52 kg. W symulacji widzisz ten sam efekt: przy małym wzbogaceniu neutrony częściej giną w ścianach, niż trafiają w jądra rozszczepialne.',
      },
    ];
  },
};
