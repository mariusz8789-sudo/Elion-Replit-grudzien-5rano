import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Zderzenie galaktyk — ograniczony problem trzech ciał (metoda
 * Toomre & Toomre 1972): dwa jądra galaktyk oddziałują wzajemnie pełną
 * grawitacją, a gwiazdy są cząstkami próbnymi w polu obu jąder.
 * Ta klasyczna metoda poprawnie odtwarza ogony pływowe i mosty materii;
 * pomija dynamiczne tarcie i samograwitację dysków.
 */

export interface CollisionStar {
  x: number; y: number; vx: number; vy: number; home: 0 | 1;
}

export interface CollisionCore {
  x: number; y: number; vx: number; vy: number; m: number;
}

export interface CollisionInitialState {
  seed: number;
  cores: CollisionCore[];
  stars: CollisionStar[];
}

const SOFT2 = 90; // zmiękczenie grawitacji (px²)

/** Stabilny PRNG dla powtarzalnych warunków początkowych — nie zmienia równań ruchu. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Ten sam ratio/retro zawsze mapuje się na ten sam układ początkowy cząstek próbnych. */
export function collisionSeedFor({ ratio, retro }: { ratio: number; retro: boolean }): number {
  const ratioPart = Math.round(ratio * 1_000);
  return (0x71c0111 ^ Math.imul(ratioPart, 0x9e3779b1) ^ (retro ? 0x85ebca6b : 0)) >>> 0;
}

/**
 * Tworzy istniejące warunki startowe ograniczonego modelu Toomre–Toomre.
 * Seed dotyczy wyłącznie rozmieszczenia cząstek próbnych; same równania ruchu są identyczne.
 */
export function createCollisionInitialState({
  width,
  height,
  ratio,
  retro,
  seed = collisionSeedFor({ ratio, retro }),
}: {
  width: number;
  height: number;
  ratio: number;
  retro: boolean;
  seed?: number;
}): CollisionInitialState {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('width i height muszą być dodatnimi liczbami skończonymi.');
  }
  if (!Number.isFinite(ratio) || ratio < 0.25 || ratio > 2) {
    throw new Error('ratio musi być skończoną liczbą z zakresu 0.25–2.');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error('seed musi być 32-bitową nieujemną liczbą całkowitą.');
  }
  const random = mulberry32(seed);
  const cx = width / 2;
  const cy = height / 2;
  const sep = Math.min(width, height) * 0.42;
  const m1 = 5200;
  const m2 = 5200 * ratio;
  const cores: CollisionCore[] = [
    { x: cx - sep, y: cy - sep * 0.28, vx: 34, vy: 9, m: m1 },
    { x: cx + sep, y: cy + sep * 0.28, vx: 0, vy: 0, m: m2 },
  ];
  // Pęd całkowity ≈ 0.
  cores[1].vx = (-cores[0].vx * m1) / m2;
  cores[1].vy = (-cores[0].vy * m1) / m2;

  const stars: CollisionStar[] = [];
  for (const [ci, core] of cores.entries()) {
    const n = ci === 0 ? 900 : Math.round(900 * Math.min(ratio, 1.4));
    const rMax = Math.min(width, height) * 0.16 * Math.pow(core.m / 5200, 0.35);
    for (let i = 0; i < n; i++) {
      const r = rMax * (0.25 + 0.75 * Math.sqrt(random()));
      const a = random() * Math.PI * 2;
      const v = Math.sqrt(core.m / Math.sqrt(r * r + SOFT2)); // orbita kołowa
      const dir = ci === 1 && retro ? -1 : 1;
      stars.push({
        x: core.x + r * Math.cos(a),
        y: core.y + r * Math.sin(a),
        vx: core.vx - dir * v * Math.sin(a),
        vy: core.vy + dir * v * Math.cos(a),
        home: ci as 0 | 1,
      });
    }
  }
  return { seed, cores, stars };
}

class CollisionGalaxiesSim implements Sim {
  private stars: CollisionStar[] = [];
  private cores: CollisionCore[] = [
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
    const initial = createCollisionInitialState({ width: this.w, height: this.h, ratio, retro });
    this.cores = initial.cores;
    this.stars = initial.stars;
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
