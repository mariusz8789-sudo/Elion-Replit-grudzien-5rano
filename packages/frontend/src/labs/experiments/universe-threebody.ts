import type { ExperimentDef, Sim, SimParams } from '../../core/types';

/**
 * Problem trzech ciał — jeden z klasycznych "Grand Challenges" mechaniki
 * nieba. Brak ogólnego rozwiązania analitycznego (Poincaré 1887, nagroda
 * króla Oskara II) — to właśnie ten problem zapoczątkował teorię chaosu.
 * Grawitacja Newtona w jednostkach bezwymiarowych (G=1), integracja
 * velocity-Verlet (symplektyczna: zachowuje energię długoterminowo, w
 * przeciwieństwie do zwykłego Eulera — patrz test `energyDrift` w
 * physics.test.ts).
 *
 * Dwa realne, udokumentowane układy startowe:
 * - "Ósemka" (figure-eight, Moore 1993 numerycznie, Chenciner–Montgomery
 *   2000 dowód istnienia): trzy równe masy krążą po WSPÓLNEJ, okresowej
 *   krzywej w kształcie ósemki. Rzadki przykład STABILNEGO, okresowego
 *   rozwiązania — kontrast dla chaosu.
 * - Problem pitagorejski (Burrau 1913): masy 3:4:5 w wierzchołkach
 *   trójkąta 3-4-5, start z spoczynku. Klasyczny przykład chaotycznej
 *   ewolucji z bliskimi przejściami i wyrzuceniem jednego ciała.
 */

interface Body { x: number; y: number; vx: number; vy: number; m: number }

const G = 1;
const SOFT2 = 1e-6; // zmiękczenie grawitacji (jednostki bezwymiarowe)

function accelerations(bodies: Body[]): { ax: number; ay: number }[] {
  const acc = bodies.map(() => ({ ax: 0, ay: 0 }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r2 = dx * dx + dy * dy + SOFT2;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      const fx = G * dx * invR3;
      const fy = G * dy * invR3;
      acc[i].ax += fx * bodies[j].m;
      acc[i].ay += fy * bodies[j].m;
      acc[j].ax -= fx * bodies[i].m;
      acc[j].ay -= fy * bodies[i].m;
    }
  }
  return acc;
}

/** Jeden krok integracji velocity-Verlet (symplektyczna, zachowuje energię). Eksportowana dla testów. */
export function stepVerlet(bodies: Body[], h: number): void {
  const a0 = accelerations(bodies);
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].vx += 0.5 * a0[i].ax * h;
    bodies[i].vy += 0.5 * a0[i].ay * h;
    bodies[i].x += bodies[i].vx * h;
    bodies[i].y += bodies[i].vy * h;
  }
  const a1 = accelerations(bodies);
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].vx += 0.5 * a1[i].ax * h;
    bodies[i].vy += 0.5 * a1[i].ay * h;
  }
}

export function minPairDistance(bodies: Body[]): number {
  let d = Infinity;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      d = Math.min(d, Math.hypot(bodies[j].x - bodies[i].x, bodies[j].y - bodies[i].y));
    }
  }
  return d;
}

/**
 * Integracja z krokiem adaptacyjnym: h maleje przy bliskich przejściach
 * ciał (klasyczny problem numeryczny problemu pitagorejskiego — bez tego
 * integrator symplektyczny traci energię przy zbliżeniu, mimo że sam
 * schemat jest symplektyczny dla ustalonego h). Eksportowana dla testów.
 */
export function integrateAdaptive(bodies: Body[], totalTime: number, maxH = 0.001): void {
  let remaining = totalTime;
  let guard = 0;
  while (remaining > 1e-9 && guard < 400000) {
    guard++;
    const dmin = minPairDistance(bodies);
    const acc = accelerations(bodies);
    let amax = 1e-9;
    for (const a of acc) amax = Math.max(amax, Math.hypot(a.ax, a.ay));
    const tDyn = Math.sqrt(dmin / amax); // lokalny czas dynamiczny (kryterium Aarsetha, uproszczone)
    const h = Math.min(maxH, remaining, Math.max(1e-8, 0.05 * tDyn));
    stepVerlet(bodies, h);
    remaining -= h;
  }
}

export function totalEnergy(bodies: Body[]): number {
  let ke = 0;
  for (const b of bodies) ke += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
  let pe = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r = Math.sqrt(dx * dx + dy * dy + SOFT2);
      pe -= (G * bodies[i].m * bodies[j].m) / r;
    }
  }
  return ke + pe;
}

/** Znane, udokumentowane warunki początkowe. Eksportowane dla testów. */
export function figure8Bodies(): Body[] {
  const vx3 = -0.93240737;
  const vy3 = -0.86473146;
  return [
    { x: 0.97000436, y: -0.24308753, vx: -vx3 / 2, vy: -vy3 / 2, m: 1 },
    { x: -0.97000436, y: 0.24308753, vx: -vx3 / 2, vy: -vy3 / 2, m: 1 },
    { x: 0, y: 0, vx: vx3, vy: vy3, m: 1 },
  ];
}

export function pythagoreanBodies(): Body[] {
  return [
    { x: 1, y: 3, vx: 0, vy: 0, m: 3 },
    { x: -2, y: -1, vx: 0, vy: 0, m: 4 },
    { x: 1, y: -1, vx: 0, vy: 0, m: 5 },
  ];
}

export type ThreeBodyPreset = 'figure8' | 'pythagorean';

export interface ThreeBodyScenarioResult {
  preset: ThreeBodyPreset;
  horizonTime: number;
  initialEnergy: number;
  finalEnergy: number;
  relativeEnergyDrift: number;
  finalMinPairDistance: number;
  /** Występuje wyłącznie, gdy uruchomiono drugi deterministyczny start różniący się o PERTURBATION. */
  finalSeparation?: number;
}

function cloneBodies(bodies: readonly Body[]): Body[] {
  return bodies.map((body) => ({ ...body }));
}

function totalPositionSeparation(left: readonly Body[], right: readonly Body[]): number {
  let separation = 0;
  for (let index = 0; index < left.length; index++) {
    separation += Math.hypot(left[index].x - right[index].x, left[index].y - right[index].y);
  }
  return separation;
}

/**
 * Deterministyczny adapter obliczeniowy dla Experiment Fabric. Nie używa Canvasu
 * i nie tworzy drugiego modelu: wywołuje te same znane warunki początkowe oraz
 * `integrateAdaptive` oparte na velocity-Verlet co `ThreeBodySim`.
 */
export function runThreeBodyScenario({
  preset = 'figure8',
  horizonTime = 10,
  divergence = false,
}: {
  preset?: ThreeBodyPreset;
  horizonTime?: number;
  divergence?: boolean;
} = {}): ThreeBodyScenarioResult {
  if (!Number.isFinite(horizonTime) || horizonTime <= 0 || horizonTime > 50) {
    throw new Error('horizonTime musi być skończoną liczbą z zakresu (0, 50].');
  }
  const initial = preset === 'pythagorean' ? pythagoreanBodies() : figure8Bodies();
  const bodies = cloneBodies(initial);
  const initialEnergy = totalEnergy(bodies);
  let shadow: Body[] | undefined;
  if (divergence) {
    shadow = cloneBodies(initial);
    shadow[0].x += PERTURBATION;
  }

  integrateAdaptive(bodies, horizonTime);
  if (shadow) integrateAdaptive(shadow, horizonTime);

  const finalEnergy = totalEnergy(bodies);
  const denominator = Math.max(Math.abs(initialEnergy), Number.EPSILON);
  return {
    preset,
    horizonTime,
    initialEnergy,
    finalEnergy,
    relativeEnergyDrift: Math.abs(finalEnergy - initialEnergy) / denominator,
    finalMinPairDistance: minPairDistance(bodies),
    ...(shadow ? { finalSeparation: totalPositionSeparation(bodies, shadow) } : {}),
  };
}

const BODY_COLORS = ['#5cd6e8', '#f0b35c', '#c68cff'];
const SHADOW_ALPHA = 0.45;
const TRAIL_LEN = 900;
const PERTURBATION = 1e-6;

class ThreeBodySim implements Sim {
  private bodies: Body[] = [];
  private shadow: Body[] = [];
  private trails: { x: number; y: number }[][] = [[], [], []];
  private shadowTrails: { x: number; y: number }[][] = [[], [], []];
  private t = 0;
  private lastPreset = '';
  private lastDivergence = false;
  private scale = 120;
  private cx = 0;
  private cy = 0;

  init(w: number, h: number) {
    this.cx = w / 2;
    this.cy = h / 2;
    this.scale = Math.min(w, h) * 0.16;
    if (!this.lastPreset) this.setup('figure8', false);
  }

  reset = () => {
    this.setup(this.lastPreset || 'figure8', this.lastDivergence);
  };

  private setup(preset: string, divergence: boolean) {
    this.lastPreset = preset;
    this.lastDivergence = divergence;
    this.t = 0;
    this.bodies = preset === 'pythagorean' ? pythagoreanBodies() : figure8Bodies();
    this.trails = this.bodies.map(() => []);
    if (divergence) {
      this.shadow = this.bodies.map((b, i) => (i === 0 ? { ...b, x: b.x + PERTURBATION } : { ...b }));
      this.shadowTrails = this.shadow.map(() => []);
    } else {
      this.shadow = [];
      this.shadowTrails = [[], [], []];
    }
  }

  update(dt: number, p: SimParams) {
    const preset = String(p.preset ?? 'figure8');
    const divergence = Boolean(p.divergence);
    if (preset !== this.lastPreset || divergence !== this.lastDivergence) this.setup(preset, divergence);
    const speed = Number(p.speed ?? 1);
    const simDt = Math.min(dt, 0.05) * speed * 0.35;
    integrateAdaptive(this.bodies, simDt);
    if (this.shadow.length) integrateAdaptive(this.shadow, simDt);
    this.t += simDt;
    for (let i = 0; i < this.bodies.length; i++) {
      const tr = this.trails[i];
      tr.push({ x: this.bodies[i].x, y: this.bodies[i].y });
      if (tr.length > TRAIL_LEN) tr.shift();
    }
    for (let i = 0; i < this.shadow.length; i++) {
      const tr = this.shadowTrails[i];
      tr.push({ x: this.shadow[i].x, y: this.shadow[i].y });
      if (tr.length > TRAIL_LEN) tr.shift();
    }
  }

  private drawTrail(ctx: CanvasRenderingContext2D, trail: { x: number; y: number }[], color: string, alpha: number) {
    if (trail.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.1;
    ctx.moveTo(this.cx + trail[0].x * this.scale, this.cy + trail[0].y * this.scale);
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(this.cx + trail[i].x * this.scale, this.cy + trail[i].y * this.scale);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < this.bodies.length; i++) this.drawTrail(ctx, this.trails[i], BODY_COLORS[i], 0.75);
    for (let i = 0; i < this.shadow.length; i++) this.drawTrail(ctx, this.shadowTrails[i], BODY_COLORS[i], SHADOW_ALPHA * 0.5);

    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const px = this.cx + b.x * this.scale;
      const py = this.cy + b.y * this.scale;
      const r = 2.5 + Math.cbrt(b.m) * 1.6;
      ctx.fillStyle = BODY_COLORS[i];
      ctx.shadowColor = BODY_COLORS[i];
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    for (let i = 0; i < this.shadow.length; i++) {
      const b = this.shadow[i];
      const px = this.cx + b.x * this.scale;
      const py = this.cy + b.y * this.scale;
      ctx.fillStyle = `rgba(255,255,255,${SHADOW_ALPHA})`;
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(230,234,245,0.7)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`t = ${this.t.toFixed(2)} (jednostki bezwymiarowe)`, 10, h - 26);
    if (this.shadow.length) {
      const sep = this.separation();
      ctx.fillText(`odległość między startami: ${sep.toExponential(2)}  (start: ${PERTURBATION.toExponential(0)})`, 10, h - 12);
    } else {
      const e = totalEnergy(this.bodies);
      ctx.fillText(`energia całkowita: ${e.toFixed(5)} (stała = integrator symplektyczny działa)`, 10, h - 12);
    }
  }

  private separation(): number {
    let s = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      s += Math.hypot(this.bodies[i].x - this.shadow[i].x, this.bodies[i].y - this.shadow[i].y);
    }
    return s;
  }

  getStats() {
    const stats: Record<string, number> = {
      t: Math.round(this.t * 100) / 100,
      energy: Math.round(totalEnergy(this.bodies) * 1e5) / 1e5,
    };
    if (this.shadow.length) stats.separation = this.separation();
    return stats;
  }
}

export const universeThreeBody: ExperimentDef = {
  id: 'threebody',
  name: 'Problem trzech ciał',
  honesty: 'educational',
  honestyNote:
    'Grawitacja Newtona w jednostkach bezwymiarowych (G=1), integracja symplektyczna velocity-Verlet — dokładna fizyka klasyczna, nie przybliżenie. Uproszczenie jest w jednostkach (nie prawdziwe masy/odległości Słońca), nie w prawach ruchu: to samo równanie różniczkowe, które Poincaré badał w 1887 r.',
  params: [
    {
      key: 'preset', label: 'Układ startowy', type: 'select', default: 'figure8',
      options: [
        { value: 'figure8', label: 'Ósemka (Moore 1993) — stabilna' },
        { value: 'pythagorean', label: 'Problem pitagorejski (Burrau 1913) — chaotyczny' },
      ],
    },
    { key: 'divergence', label: 'Pokaż drugi, niemal identyczny start', type: 'toggle', default: false },
    { key: 'speed', label: 'Tempo czasu', type: 'slider', min: 0.2, max: 3, step: 0.1, default: 1 },
  ],
  createSim: () => new ThreeBodySim(),
  narrate(p, stats) {
    const preset = String(p.preset ?? 'figure8');
    const divergence = Boolean(p.divergence);
    const t = Number(stats.t ?? 0);
    const blocks = [
      preset === 'pythagorean'
        ? {
            title: 'Problem pitagorejski: chaos deterministyczny',
            body:
              'Trzy masy w proporcji 3:4:5, ustawione w wierzchołkach trójkąta 3-4-5, startują z zupełnego spoczynku (Burrau, 1913). Mimo że reguły są w pełni deterministyczne (żadnej losowości), tor jest niemożliwy do przewidzenia na długi czas — po serii bliskich przejść jedno z ciał zwykle zostaje wyrzucone, a pozostałe dwa tworzą ciasny układ podwójny.',
            citation: { source: 'Burrau (1913), Astronomische Nachrichten 195', confirmation: 'confirmed' as const, note: 'Klasyczny problem trzech ciał, numerycznie zbadany od lat 60. XX w.' },
          }
        : {
            title: 'Ósemka: rzadka stabilna orbita',
            body:
              'Trzy równe masy krążą PO TEJ SAMEJ krzywej w kształcie ósemki, w stałych odstępach czasu, w nieskończoność (w idealizacji bez zaburzeń) — jedno z zaledwie kilkuset znanych "choreografii" periodycznych problemu N ciał. Odkryta numerycznie przez Christophera Moore\'a w 1993 r., dowód matematyczny istnienia podali Alain Chenciner i Richard Montgomery w 2000 r.',
            citation: { source: 'Chenciner & Montgomery (2000), Annals of Mathematics 152', confirmation: 'confirmed' as const, note: 'Dowód istnienia orbity ósemkowej' },
          },
      {
        title: 'Dlaczego to "Grand Challenge"',
        body:
          'Newton rozwiązał ruch DWÓCH ciał w pełni analitycznie (elipsy Keplera). Dodanie trzeciego ciała niszczy tę możliwość: Henri Poincaré udowodnił w 1887 r. (praca dla nagrody króla Oskara II Szwecji), że ogólny problem trzech ciał NIE MA rozwiązania w postaci prostych wzorów — to właśnie ta praca zapoczątkowała współczesną teorię chaosu.',
      },
    ];
    if (divergence) {
      const sep = Number(stats.separation ?? 0);
      blocks.push({
        title: t < 2 ? 'Dwa niemal identyczne wszechświaty' : sep > 0.01 ? 'Rozjazd wykładniczy' : 'Na razie blisko',
        body:
          t < 2
            ? `Druga kopia symulacji startuje z przesunięciem zaledwie 10⁻⁶ jednostki w jednym ciele — mniej niż promień atomu w skali Układu Słonecznego. Obserwuj białe punkty (cień) i kolorowe (oryginał): patrz, jak rosną odstępy między nimi.`
            : sep > 0.01
              ? `Po czasie t=${t.toFixed(1)} odległość między dwoma niemal identycznymi startami wynosi już ${sep.toExponential(2)} — z 10⁻⁶ urosła o rzędy wielkości. To wykładniczy wzrost błędu (dodatni wykładnik Lapunowa), sedno "efektu motyla": bez nieskończonej precyzji pomiaru NIE da się przewidzieć odległej przyszłości układu chaotycznego.`
              : `Na razie oba starty wciąż podążają niemal tym samym torem — poczekaj, aż nastąpi bliskie przejście dwóch ciał (${preset === 'pythagorean' ? 'w problemie pitagorejskim zdarza się to szybko' : 'w ósemce stabilność opóźnia rozjazd — spróbuj przełączyć na problem pitagorejski'}), które gwałtownie wzmocni różnicę.`,
      });
    } else {
      blocks.push({
        title: 'Eksperyment do wykonania',
        body: 'Włącz „Pokaż drugi, niemal identyczny start" — druga symulacja różni się o 10⁻⁶ jednostki w położeniu jednego ciała. W ósemce różnica rośnie wolno (orbita jest stabilna); w problemie pitagorejskim po pierwszym bliskim przejściu eksploduje.',
      });
    }
    return blocks;
  },
};
