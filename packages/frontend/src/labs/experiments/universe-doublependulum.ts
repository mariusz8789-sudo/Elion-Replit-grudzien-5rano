import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Podwójne wahadło — drugi klasyczny przykład chaosu deterministycznego
 * w Genesis OS (obok problemu trzech ciał). Dokładne równania Lagrange'a
 * dla dwóch sztywnych prętów bez tarcia (standardowy wynik podręcznikowy,
 * np. Landau & Lifszyc "Mechanika"), integrowane RK4 — CELOWO NIE
 * symplektycznie (kontrast z `universe-threebody.ts`): RK4 jest prostsze
 * i wystarczająco dokładne na czas obserwacji tego eksperymentu, ale
 * energia POWOLI dryfuje — widoczne w statystykach, uczciwie nazwane,
 * nie ukryte. Przy małym kącie startowym ruch jest niemal okresowy; od
 * pewnego progu (empirycznie ~30-40°) staje się chaotyczny — ten sam
 * mechanizm demonstrowany w probemie trzech ciał, tu w najprostszym
 * możliwym układzie (2 stopnie swobody).
 */

export interface PendulumState { th1: number; th2: number; w1: number; w2: number }

const M1 = 1;
const M2 = 1;
const L1 = 1;
const L2 = 1;
const G = 9.81;

function derivative(s: PendulumState): PendulumState {
  const { th1, th2, w1, w2 } = s;
  const delta = th1 - th2;
  const den = 2 * M1 + M2 - M2 * Math.cos(2 * delta);
  const dw1 =
    (-G * (2 * M1 + M2) * Math.sin(th1) -
      M2 * G * Math.sin(th1 - 2 * th2) -
      2 * Math.sin(delta) * M2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(delta))) /
    (L1 * den);
  const dw2 =
    (2 *
      Math.sin(delta) *
      (w1 * w1 * L1 * (M1 + M2) + G * (M1 + M2) * Math.cos(th1) + w2 * w2 * L2 * M2 * Math.cos(delta))) /
    (L2 * den);
  return { th1: w1, th2: w2, w1: dw1, w2: dw2 };
}

function addScaled(a: PendulumState, b: PendulumState, scale: number): PendulumState {
  return { th1: a.th1 + b.th1 * scale, th2: a.th2 + b.th2 * scale, w1: a.w1 + b.w1 * scale, w2: a.w2 + b.w2 * scale };
}

/** Jeden krok RK4 (klasyczny, rząd 4) — eksportowany dla testów. */
export function stepRK4(s: PendulumState, h: number): PendulumState {
  const k1 = derivative(s);
  const k2 = derivative(addScaled(s, k1, h / 2));
  const k3 = derivative(addScaled(s, k2, h / 2));
  const k4 = derivative(addScaled(s, k3, h));
  return {
    th1: s.th1 + (h / 6) * (k1.th1 + 2 * k2.th1 + 2 * k3.th1 + k4.th1),
    th2: s.th2 + (h / 6) * (k1.th2 + 2 * k2.th2 + 2 * k3.th2 + k4.th2),
    w1: s.w1 + (h / 6) * (k1.w1 + 2 * k2.w1 + 2 * k3.w1 + k4.w1),
    w2: s.w2 + (h / 6) * (k1.w2 + 2 * k2.w2 + 2 * k3.w2 + k4.w2),
  };
}

/** Energia całkowita (kinetyczna + potencjalna) — eksportowana dla testów. */
export function pendulumEnergy(s: PendulumState): number {
  const { th1, th2, w1, w2 } = s;
  const ke =
    0.5 * M1 * L1 * L1 * w1 * w1 +
    0.5 * M2 * (L1 * L1 * w1 * w1 + L2 * L2 * w2 * w2 + 2 * L1 * L2 * w1 * w2 * Math.cos(th1 - th2));
  const pe = -(M1 + M2) * G * L1 * Math.cos(th1) - M2 * G * L2 * Math.cos(th2);
  return ke + pe;
}

const PERTURBATION = 1e-6;
const TRAIL_LEN = 700;
const SUBSTEPS = 6;

class DoublePendulumSim implements Sim {
  private s: PendulumState = { th1: 0, th2: 0, w1: 0, w2: 0 };
  private shadow: PendulumState | null = null;
  private trail: { x: number; y: number }[] = [];
  private shadowTrail: { x: number; y: number }[] = [];
  private lastAngleDeg = -1;
  private lastDivergence = false;
  private cx = 0;
  private cy = 0;
  private scale = 100;

  init(w: number, h: number) {
    this.cx = w / 2;
    this.cy = h * 0.28;
    this.scale = Math.min(w, h) * 0.22;
    if (this.lastAngleDeg < 0) this.setup(120, false);
  }

  reset = () => {
    this.setup(this.lastAngleDeg, this.lastDivergence);
  };

  private setup(angleDeg: number, divergence: boolean) {
    this.lastAngleDeg = angleDeg;
    this.lastDivergence = divergence;
    const th0 = (angleDeg * Math.PI) / 180;
    this.s = { th1: th0, th2: th0, w1: 0, w2: 0 };
    this.trail = [];
    if (divergence) {
      this.shadow = { th1: th0 + PERTURBATION, th2: th0, w1: 0, w2: 0 };
      this.shadowTrail = [];
    } else {
      this.shadow = null;
      this.shadowTrail = [];
    }
  }

  update(dt: number, p: SimParams) {
    const angleDeg = Number(p.angle ?? 120);
    const divergence = Boolean(p.divergence);
    if (angleDeg !== this.lastAngleDeg || divergence !== this.lastDivergence) this.setup(angleDeg, divergence);
    const speed = Number(p.speed ?? 1);
    const ddt = Math.min(dt, 0.05) * speed;
    const h = ddt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      this.s = stepRK4(this.s, h);
      if (this.shadow) this.shadow = stepRK4(this.shadow, h);
    }
    const bob2 = this.bobPositions(this.s).p2;
    this.trail.push(bob2);
    if (this.trail.length > TRAIL_LEN) this.trail.shift();
    if (this.shadow) {
      const sBob2 = this.bobPositions(this.shadow).p2;
      this.shadowTrail.push(sBob2);
      if (this.shadowTrail.length > TRAIL_LEN) this.shadowTrail.shift();
    }
  }

  private bobPositions(s: PendulumState) {
    const x1 = Math.sin(s.th1) * L1;
    const y1 = Math.cos(s.th1) * L1;
    const x2 = x1 + Math.sin(s.th2) * L2;
    const y2 = y1 + Math.cos(s.th2) * L2;
    return { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
  }

  private toScreen(p: { x: number; y: number }) {
    return { x: this.cx + p.x * this.scale, y: this.cy + p.y * this.scale };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, w, h);

    // ślad drugiego odważnika — klasyczny, chaotyczny wzór
    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#5cd6e8';
      ctx.lineWidth = 1;
      const t0 = this.toScreen(this.trail[0]);
      ctx.moveTo(t0.x, t0.y);
      for (let i = 1; i < this.trail.length; i++) {
        const t = this.toScreen(this.trail[i]);
        ctx.globalAlpha = 0.15 + 0.6 * (i / this.trail.length);
        ctx.lineTo(t.x, t.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.shadowTrail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      const t0 = this.toScreen(this.shadowTrail[0]);
      ctx.moveTo(t0.x, t0.y);
      for (const p of this.shadowTrail) {
        const t = this.toScreen(p);
        ctx.lineTo(t.x, t.y);
      }
      ctx.stroke();
    }

    const pivot = { x: this.cx, y: this.cy };
    this.drawPendulum(ctx, this.s, '#f0b35c', '#5cd6e8', 1);
    if (this.shadow) this.drawPendulum(ctx, this.shadow, 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.6)', 0.6);

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(230,234,245,0.7)';
    ctx.font = '10px ui-monospace, monospace';
    const e = pendulumEnergy(this.s);
    ctx.fillText(`energia: ${e.toFixed(3)} J/kg (RK4, nie symplektyczna — powoli dryfuje)`, 10, h - 26);
    if (this.shadow) {
      const sep = Math.hypot(this.s.th1 - this.shadow.th1, this.s.th2 - this.shadow.th2);
      ctx.fillText(`różnica kątów między startami: ${sep.toExponential(2)} rad (start: ${PERTURBATION.toExponential(0)})`, 10, h - 12);
    }
  }

  private drawPendulum(ctx: CanvasRenderingContext2D, s: PendulumState, armColor: string, bobColor: string, alpha: number) {
    const { p1, p2 } = this.bobPositions(s);
    const pivot = { x: this.cx, y: this.cy };
    const sp1 = this.toScreen(p1);
    const sp2 = this.toScreen(p2);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = armColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    ctx.lineTo(sp1.x, sp1.y);
    ctx.lineTo(sp2.x, sp2.y);
    ctx.stroke();
    ctx.fillStyle = bobColor;
    ctx.beginPath();
    ctx.arc(sp1.x, sp1.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sp2.x, sp2.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  getStats() {
    const stats: Record<string, number> = {
      energy: Math.round(pendulumEnergy(this.s) * 1000) / 1000,
      th1Deg: Math.round(((this.s.th1 * 180) / Math.PI) % 360),
      th2Deg: Math.round(((this.s.th2 * 180) / Math.PI) % 360),
    };
    if (this.shadow) {
      stats.separation = Math.hypot(this.s.th1 - this.shadow.th1, this.s.th2 - this.shadow.th2);
    }
    return stats;
  }
}

export const universeDoublePendulum: ExperimentDef = {
  id: 'doublependulum',
  name: 'Podwójne wahadło',
  honesty: 'simplified',
  honestyNote:
    'Dokładne równania ruchu (Lagrange, dwa sztywne pręty bez tarcia i bez masy prętów) — nie przybliżenie fizyki. Integracja RK4 (rząd 4), CELOWO NIE symplektyczna jak w problemie trzech ciał: energia powoli dryfuje w czasie (widoczne w odczycie), co jest uczciwie nazwane, nie ukryte. g=9,81 m/s², L₁=L₂=1 m, m₁=m₂=1 kg.',
  params: [
    { key: 'angle', label: 'Kąt startowy obu wahadeł', type: 'slider', min: 5, max: 179, step: 1, default: 120, unit: '°' },
    { key: 'divergence', label: 'Pokaż drugi, niemal identyczny start', type: 'toggle', default: false },
    { key: 'speed', label: 'Tempo czasu', type: 'slider', min: 0.2, max: 2, step: 0.1, default: 1 },
  ],
  createSim: () => new DoublePendulumSim(),
  narrate(p, stats) {
    const angle = Number(p.angle ?? 120);
    const divergence = Boolean(p.divergence);
    const chaotic = angle > 35;
    const blocks = [
      {
        title: chaotic ? 'Ruch chaotyczny' : 'Ruch niemal okresowy',
        body: chaotic
          ? `Przy kącie startowym ${angle}° ruch jest chaotyczny — drugi odważnik kreśli nieregularny, nigdy dokładnie nie powtarzający się wzór (widoczny ślad na ekranie). To nie losowość: równania są w pełni deterministyczne, ale wrażliwość na warunki początkowe czyni długoterminowe przewidywanie praktycznie niemożliwym.`
          : `Przy małym kącie startowym (${angle}°) ruch jest niemal okresowy — oba wahadła kołyszą się w przewidywalnym, powtarzalnym wzorze, podobnie jak zwykłe pojedyncze wahadło. Zwiększ kąt powyżej ~35-40°, by zobaczyć przejście do chaosu.`,
      },
      {
        title: 'Dwa stopnie swobody wystarczą do chaosu',
        body:
          'Pojedyncze wahadło (1 stopień swobody) NIGDY nie jest chaotyczne — jego ruch jest w pełni przewidywalny i okresowy. Dodanie DRUGIEGO wahadła na końcu pierwszego (2 stopnie swobody) wystarcza, by układ stał się chaotyczny przy dużej energii — to najprostszy fizycznie realizowalny układ mechaniczny wykazujący chaos deterministyczny, klasyczny przykład od czasów Poincarégo.',
      },
      divergence
        ? {
            title: 'Wrażliwość na warunki początkowe',
            body: `Druga kopia różni się o zaledwie 10⁻⁶ radiana w kącie pierwszego wahadła — mniej niż jedna milionowa stopnia. ${chaotic ? 'Obserwuj, jak biały (cień) i kolorowy ślad rozjeżdżają się coraz bardziej — to ten sam mechanizm co w problemie trzech ciał, tu widoczny na najprostszym możliwym układzie.' : 'Przy tym kącie ruch jest regularny, więc różnica rośnie wolno — spróbuj zwiększyć kąt startowy powyżej ~40°, by zobaczyć szybki rozjazd.'}`,
          }
        : {
            title: 'Eksperyment do wykonania',
            body: 'Włącz „Pokaż drugi, niemal identyczny start" i porównaj zachowanie przy małym kącie (regularne, wolny rozjazd) i dużym kącie powyżej 90° (chaotyczne, szybki rozjazd).',
          },
      {
        title: 'Uczciwość integratora',
        body: `Ten eksperyment celowo używa RK4 zamiast integratora symplektycznego (jak w problemie trzech ciał) — RK4 jest prostszy, ale energia całkowita powoli dryfuje w czasie (dziś: ${Number(stats.energy ?? 0).toFixed(3)} J/kg). To świadomy kompromis: na czas obserwacji w tym eksperymencie błąd jest niewidoczny gołym okiem, ale uczciwie pokazany w odczycie liczbowym, nie ukryty.`,
      },
    ];
    return blocks;
  },
};
