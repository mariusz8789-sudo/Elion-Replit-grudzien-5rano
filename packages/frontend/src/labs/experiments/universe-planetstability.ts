import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { tracePolylineBy } from '../../core/canvasHelpers';
import { EARTH_MASSES_PER_SOLAR, G_ASTRO_YEAR, orbitalElementsFromState, visVivaSpeed } from '../../core/physics';
import { PLANETS } from '../../data/solarSystem';

/**
 * Stabilność układu planetarnego — PRAWDZIWA grawitacja N-ciał (nie
 * niezależne elipsy Keplera jak w "Prawdziwy Układ Słoneczny"). Sun +
 * cztery planety (Jowisz, Saturn — dominujący zaburzacze; Ziemia, Mars —
 * obserwowane wewnętrzne planety), każda startuje w swoim peryhelium z
 * dokładną prędkością z równania vis-viva (elementy orbitalne i masy:
 * `data/solarSystem.ts`, prawdziwe dane). Integracja velocity-Verlet
 * (symplektyczna, ta sama metoda co problem trzech ciał), jednostki AU/
 * rok/masa Słońca (G=4π² dokładnie — core/physics.ts::G_ASTRO_YEAR).
 *
 * Wyłączenie Jowisza/Saturna usuwa ich grawitację z symulacji — elementy
 * orbitalne (a, e) Ziemi i Marsa są przeliczane NA ŻYWO z chwilowego
 * wektora stanu (nie zakładane), więc widać PRAWDZIWY dryf orbitalny pod
 * wpływem (lub bez) tych zaburzeń — a nie tylko deklarowaną różnicę.
 *
 * Świadome uproszczenie: tylko 4 planety (nie 8) dla przejrzystości i
 * szybkości; wszystkie startują w peryhelium (nie z rzeczywistych,
 * jednoczesnych pozycji z efemeryd) z rozłożonymi kątowo kierunkami
 * peryhelium — realistyczne jakościowo, nie precyzyjna efemeryda na
 * konkretną datę.
 */

interface Body {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
  color: string;
  a0: number;
  e0: number;
  trail: { x: number; y: number }[];
}

const SOFT2 = 1e-7; // AU² — zmiękczenie grawitacji, zaniedbywalne wobec realnych odległości
const AU_PX = 30;
const MAX_TRAIL = 900;

const PERTURBERS = ['jupiter', 'saturn'];
const TRACKED = ['earth', 'mars'];

function accelerations(bodies: Body[]): { ax: number; ay: number }[] {
  const acc = bodies.map(() => ({ ax: 0, ay: 0 }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const r2 = dx * dx + dy * dy + SOFT2;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      const fx = G_ASTRO_YEAR * dx * invR3;
      const fy = G_ASTRO_YEAR * dy * invR3;
      acc[i].ax += fx * bodies[j].m;
      acc[i].ay += fy * bodies[j].m;
      acc[j].ax -= fx * bodies[i].m;
      acc[j].ay -= fy * bodies[i].m;
    }
  }
  return acc;
}

function stepVerlet(bodies: Body[], h: number): void {
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

function buildBodies(includePerturbers: Record<string, boolean>): Body[] {
  const sun: Body = { id: 'sun', name: 'Słońce', x: 0, y: 0, vx: 0, vy: 0, m: 1, color: '#f0b35c', a0: 0, e0: 0, trail: [] };
  const bodies: Body[] = [sun];
  const included = [...PERTURBERS.filter((id) => includePerturbers[id] !== false), ...TRACKED];
  let idx = 0;
  for (const id of included) {
    const p = PLANETS.find((pl) => pl.id === id);
    if (!p) continue;
    const a = p.semiMajorAxisAu;
    const e = p.eccentricity;
    const m = p.massEarths / EARTH_MASSES_PER_SOLAR;
    const rPeri = a * (1 - e);
    const vPeri = visVivaSpeed(G_ASTRO_YEAR, rPeri, a);
    const angle = idx * ((2 * Math.PI) / 6); // rozłożone kątowo dla czytelności — patrz komentarz u góry pliku
    idx++;
    bodies.push({
      id,
      name: p.name,
      x: rPeri * Math.cos(angle),
      y: rPeri * Math.sin(angle),
      vx: -vPeri * Math.sin(angle),
      vy: vPeri * Math.cos(angle),
      m,
      color: p.color,
      a0: a,
      e0: e,
      trail: [],
    });
  }
  return bodies;
}

class PlanetStabilitySim implements Sim {
  private bodies: Body[] = buildBodies({ jupiter: true, saturn: true });
  private yearsElapsed = 0;
  private lastConfig = 'jupiter:1,saturn:1';

  init() {}

  reset = () => {
    this.bodies = buildBodies(this.parseConfig(this.lastConfig));
    this.yearsElapsed = 0;
  };

  private parseConfig(key: string): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const part of key.split(',')) {
      const [id, v] = part.split(':');
      out[id] = v === '1';
    }
    return out;
  }

  update(dt: number, p: SimParams) {
    const jupiterOn = Boolean(p.jupiter);
    const saturnOn = Boolean(p.saturn);
    const key = `jupiter:${jupiterOn ? 1 : 0},saturn:${saturnOn ? 1 : 0}`;
    if (key !== this.lastConfig) {
      this.lastConfig = key;
      this.bodies = buildBodies({ jupiter: jupiterOn, saturn: saturnOn });
      this.yearsElapsed = 0;
    }

    const h = 0.002; // lata
    const steps = Math.round(dt * 1500);
    for (let i = 0; i < steps; i++) {
      stepVerlet(this.bodies, h);
      this.yearsElapsed += h;
    }
    for (const b of this.bodies) {
      if (b.id === 'sun') continue;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > MAX_TRAIL) b.trail.shift();
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    for (const b of this.bodies) {
      if (b.id === 'sun') continue;
      ctx.strokeStyle = `${b.color}55`;
      tracePolylineBy(ctx, b.trail.length, (i) => ({ x: cx + b.trail[i].x * AU_PX, y: cy + b.trail[i].y * AU_PX }));
      ctx.stroke();
    }
    for (const b of this.bodies) {
      const r = b.id === 'sun' ? 8 : Math.max(2.5, 2.5 + Math.log10(b.m * EARTH_MASSES_PER_SOLAR + 1) * 1.4);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(cx + b.x * AU_PX, cy + b.y * AU_PX, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(230,234,245,0.75)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`t = ${this.yearsElapsed.toFixed(0)} lat symulowanych`, 10, h - 10);
  }

  getStats() {
    const stats: Record<string, number> = { years: Math.round(this.yearsElapsed) };
    const sun = this.bodies.find((b) => b.id === 'sun')!;
    for (const id of TRACKED) {
      const b = this.bodies.find((bb) => bb.id === id);
      if (!b) continue;
      const rx = b.x - sun.x;
      const ry = b.y - sun.y;
      const rvx = b.vx - sun.vx;
      const rvy = b.vy - sun.vy;
      const mu = G_ASTRO_YEAR * (sun.m + b.m);
      const el = orbitalElementsFromState(rx, ry, rvx, rvy, mu);
      stats[`${id}Ecc`] = Math.round(el.eccentricity * 100000) / 100000;
      stats[`${id}Ecc0`] = Math.round(b.e0 * 100000) / 100000;
    }
    return stats;
  }
}

export const universePlanetStability: ExperimentDef = {
  id: 'planet-stability',
  name: 'Stabilność układu planetarnego',
  honesty: 'exact',
  honestyNote:
    'Prawdziwa grawitacja N-ciał (nie niezależne elipsy Keplera): każda planeta startuje w swoim peryhelium z dokładną prędkością z równania vis-viva (v²=μ(2/r−1/a)), integracja velocity-Verlet (symplektyczna). Elementy orbitalne (mimośród) pokazane na żywo liczone są z chwilowego wektora stanu metodą energia+moment pędu — nie zakładane, tylko zmierzone z symulacji. Świadome uproszczenie: 4 planety zamiast 8 (Jowisz i Saturn jako dominujący zaburzacze grawitacyjni, Ziemia i Mars jako obserwowane planety wewnętrzne), start w peryhelium z rozłożonymi kątowo kierunkami zamiast prawdziwej efemerydy na konkretną datę. Prawdziwy Układ Słoneczny w tym laboratorium (osobny eksperyment) używa NIEZALEŻNYCH elips Keplera — celowo inne podejście, dobre do pokazania POZYCJI planet, złe do pokazania zaburzeń, które wymagają właśnie N-ciał.',
  params: [
    { key: 'jupiter', label: 'Jowisz (317,8 M⊕, dominujący zaburzacz)', type: 'toggle', default: true },
    { key: 'saturn', label: 'Saturn (95,2 M⊕)', type: 'toggle', default: true },
  ],
  createSim: () => new PlanetStabilitySim(),
  narrate(p, stats) {
    const jupiterOn = Boolean(p.jupiter);
    const saturnOn = Boolean(p.saturn);
    const years = Number(stats.years ?? 0);
    const earthEcc = Number(stats.earthEcc ?? 0);
    const earthEcc0 = Number(stats.earthEcc0 ?? 0.0167);
    const marsEcc = Number(stats.marsEcc ?? 0);
    const marsEcc0 = Number(stats.marsEcc0 ?? 0.0934);
    const dEarth = Math.abs(earthEcc - earthEcc0);
    const dMars = Math.abs(marsEcc - marsEcc0);
    return [
      {
        title: `Po ${years.toFixed(0)} latach: mimośród Ziemi ${earthEcc.toFixed(5)} (start ${earthEcc0.toFixed(4)}), Marsa ${marsEcc.toFixed(5)} (start ${marsEcc0.toFixed(4)})`,
        body: `${jupiterOn || saturnOn ? `Z włączonymi gigantami (${[jupiterOn && 'Jowisz', saturnOn && 'Saturn'].filter(Boolean).join(' i ')}) mimośrody Ziemi i Marsa dryfują od wartości startowej — to PRAWDZIWE zaburzenie grawitacyjne, zmierzone z chwilowej pozycji i prędkości, nie deklarowany efekt.` : 'Bez Jowisza i Saturna Ziemia i Mars krążą niemal dokładnie po swoich niezaburzonych elipsach Keplera — mimośrody prawie się nie zmieniają, bo jedynym znaczącym źródłem grawitacji jest Słońce.'} Różnica dryfu: ΔeZ=${dEarth.toFixed(5)}, ΔeM=${dMars.toFixed(5)}. Włącz/wyłącz giganty i porównaj tempo dryfu — to jest namacalna różnica między "izolowanym" a prawdziwym, grawitacyjnie sprzężonym układem planetarnym.`,
        citation: {
          source: 'Laplace (XVIII w., "Wielka Nierówność" Jowisz–Saturn); Laskar 1989, Nature 338, 237',
          confirmation: 'confirmed',
          note: 'Rezonans Jowisz–Saturn ~5:2 (okresy 11,86 i 29,45 roku, stosunek 2,48) jest realny i historycznie pierwszy wyjaśniony przypadek rezonansu orbitalnego',
        },
      },
      {
        title: 'Czy Układ Słoneczny jest stabilny? Otwarte (częściowo) pytanie',
        body: 'Poincaré (1887) udowodnił, że układ N≥3 ciał grawitujących nie ma ogólnego rozwiązania analitycznego. Laskar (1989) pokazał numerycznie, że WEWNĘTRZNY Układ Słoneczny jest technicznie chaotyczny — czas Lapunowa (czas podwojenia małego błędu) wynosi ~5 milionów lat. To NIE oznacza katastrofy w ludzkiej skali czasu (miliardy lat symulacji pokazują, że orbity pozostają jakościowo podobne przez większość historii Układu Słonecznego), ale oznacza, że DOKŁADNA pozycja planet za >100 mln lat jest w zasadzie nieprzewidywalna z dzisiejszych pomiarów — dokładnie ten sam rodzaj czułości na warunki początkowe co w problemie trzech ciał i atraktorze Lorenza w tym laboratorium.',
      },
    ];
  },
};
