import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Zderzenie galaktyk — ograniczony problem trzech ciał (metoda
 * Toomre & Toomre 1972): dwa jądra galaktyk oddziałują wzajemnie pełną
 * grawitacją, a gwiazdy są cząstkami próbnymi w polu obu jąder.
 * Ta klasyczna metoda poprawnie odtwarza ogony pływowe i mosty materii;
 * pomija dynamiczne tarcie i samograwitację dysków.
 */

interface Star {
  x: number; y: number; vx: number; vy: number; home: 0 | 1;
}

const SOFT2 = 90; // zmiękczenie grawitacji (px²)

class CollisionGalaxiesSim implements Sim {
  private stars: Star[] = [];
  private cores = [
    { x: 0, y: 0, vx: 0, vy: 0, m: 5200 },
    { x: 0, y: 0, vx: 0, vy: 0, m: 5200 },
  ];
  private w = 0;
  private h = 0;
  private started = false;
  private elapsed = 0;
  private lastRatio = 1;
  private lastRetro = false;

  init(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (!this.started) {
      this.setup(1, false);
      this.started = true;
    }
  }

  reset = () => {
    this.setup(this.lastRatio, this.lastRetro);
  };

  private setup(ratio: number, retro: boolean) {
    this.lastRatio = ratio;
    this.lastRetro = retro;
    this.elapsed = 0;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const sep = Math.min(this.w, this.h) * 0.42;
    const m1 = 5200;
    const m2 = 5200 * ratio;
    // jądra na kursie kolizyjnym z bocznym przesunięciem (parabola-lite)
    this.cores = [
      { x: cx - sep, y: cy - sep * 0.28, vx: 34, vy: 9, m: m1 },
      { x: cx + sep, y: cy + sep * 0.28, vx: -34 * (m1 / m2) * 0 - 34, vy: -9, m: m2 },
    ];
    // pęd całkowity ≈ 0
    this.cores[1].vx = (-this.cores[0].vx * m1) / m2;
    this.cores[1].vy = (-this.cores[0].vy * m1) / m2;

    this.stars = [];
    for (const [ci, core] of this.cores.entries()) {
      const n = ci === 0 ? 900 : Math.round(900 * Math.min(ratio, 1.4));
      const rMax = Math.min(this.w, this.h) * 0.16 * Math.pow(core.m / 5200, 0.35);
      for (let i = 0; i < n; i++) {
        const r = rMax * (0.25 + 0.75 * Math.sqrt(Math.random()));
        const a = Math.random() * Math.PI * 2;
        const v = Math.sqrt(core.m / Math.sqrt(r * r + SOFT2)); // orbita kołowa
        const dir = ci === 1 && retro ? -1 : 1;
        this.stars.push({
          x: core.x + r * Math.cos(a),
          y: core.y + r * Math.sin(a),
          vx: core.vx - dir * v * Math.sin(a),
          vy: core.vy + dir * v * Math.cos(a),
          home: ci as 0 | 1,
        });
      }
    }
  }

  update(dt: number, p: SimParams) {
    const ratio = Number(p.ratio);
    const retro = Boolean(p.retro);
    if (ratio !== this.lastRatio || retro !== this.lastRetro) this.setup(ratio, retro);
    const speed = Number(p.speed);
    const ddt = Math.min(dt, 0.03) * speed;
    this.elapsed += ddt;

    // jądra: wzajemna grawitacja (leapfrog-lite)
    const [c1, c2] = this.cores;
    {
      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      const r2 = dx * dx + dy * dy + SOFT2 * 4;
      const inv = 1 / (Math.sqrt(r2) * r2);
      c1.vx += c2.m * dx * inv * ddt;
      c1.vy += c2.m * dy * inv * ddt;
      c2.vx -= c1.m * dx * inv * ddt;
      c2.vy -= c1.m * dy * inv * ddt;
      c1.x += c1.vx * ddt;
      c1.y += c1.vy * ddt;
      c2.x += c2.vx * ddt;
      c2.y += c2.vy * ddt;
    }
    // gwiazdy: pole obu jąder
    for (const s of this.stars) {
      let ax = 0;
      let ay = 0;
      for (const c of this.cores) {
        const dx = c.x - s.x;
        const dy = c.y - s.y;
        const r2 = dx * dx + dy * dy + SOFT2;
        const inv = c.m / (Math.sqrt(r2) * r2);
        ax += dx * inv;
        ay += dy * inv;
      }
      s.vx += ax * ddt;
      s.vy += ay * ddt;
      s.x += s.vx * ddt;
      s.y += s.vy * ddt;
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = 'rgba(2,3,10,0.5)'; // lekka smuga ruchu
    ctx.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      ctx.fillStyle = s.home === 0 ? 'rgba(92,214,232,0.8)' : 'rgba(240,179,92,0.8)';
      ctx.fillRect(s.x, s.y, 1.4, 1.4);
    }
    for (const c of this.cores) {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = 'rgba(230,234,245,0.65)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`czas: ~${(this.elapsed * 12).toFixed(0)} mln lat`, 10, h - 10);
  }

  getStats() {
    return { myr: Math.round(this.elapsed * 12) };
  }
}

export const universeCollision: ExperimentDef = {
  id: 'collision',
  name: 'Zderzenie galaktyk',
  honesty: 'simplified',
  honestyNote:
    'Metoda ograniczonego problemu trzech ciał (Toomre & Toomre 1972): jądra oddziałują w pełni, gwiazdy są cząstkami próbnymi. Poprawnie odtwarza ogony pływowe; pomija dynamiczne tarcie (jądra nie łączą się tak szybko jak w naturze) i samograwitację dysków. Skala czasu przybliżona.',
  params: [
    {
      key: 'ratio', label: 'Stosunek mas galaktyk', type: 'slider',
      min: 0.25, max: 2, step: 0.05, default: 1,
      format: (v) => `${v.toFixed(2)}×`,
    },
    { key: 'retro', label: 'Orbity przeciwbieżne w drugiej galaktyce', type: 'toggle', default: false },
    { key: 'speed', label: 'Tempo czasu', type: 'slider', min: 0.3, max: 3, step: 0.1, default: 1 },
  ],
  createSim: () => new CollisionGalaxiesSim(),
  narrate(p, stats) {
    const myr = Number(stats.myr ?? 0);
    const retro = Boolean(p.retro);
    return [
      {
        title: myr < 150 ? 'Zbliżenie' : myr < 450 ? 'Ogony pływowe' : 'Taniec ku fuzji',
        body:
          myr < 150
            ? 'Galaktyki spadają na siebie po raz pierwszy. Zwróć uwagę: gwiazdy się NIE zderzą — odległości między nimi to miliony ich średnic. Zderzają się pola grawitacyjne.'
            : myr < 450
              ? 'Siły pływowe (różnica przyciągania między bliższą a dalszą stroną dysku) wyciągają gwiazdy w długie ogony i mosty — dokładnie ten mechanizm bracia Toomre odtworzyli w 1972 r. na 120 cząstkach, tłumacząc dziwne kształty z katalogu Arp. Porównaj z obrazami galaktyk Anteny (NGC 4038/39).'
              : 'Po pierwszym przejściu jądra zawracają — w naturze dynamiczne tarcie (nieujęte w tym modelu) wytraca ich energię i po 1–2 mld lat sklejają się w galaktykę eliptyczną. Ten sam los czeka Drogę Mleczną i Andromedę za ~4,5 mld lat.',
      },
      {
        title: retro ? 'Orbity przeciwbieżne: dysk się broni' : 'Eksperyment do wykonania',
        body: retro
          ? 'Gdy gwiazdy krążą przeciwnie do ruchu orbitalnego intruza, rezonans znika i ogony pływowe są dużo słabsze — porównaj z ustawieniem współbieżnym. To realny efekt: najpiękniejsze ogony mają zderzenia prograde.'
          : 'Włącz „orbity przeciwbieżne" i porównaj długość ogonów pływowych — rezonans między ruchem gwiazd a przelotem intruza decyduje, czy dysk zostanie rozerwany, czy tylko wzburzony.',
      },
    ];
  },
};
