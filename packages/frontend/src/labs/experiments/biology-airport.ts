import type { ExperimentDef, NarrationBlock, Sim, SimParams } from '../../core/types';
import { AgentWorld, AIRPORT_ZONES, type AgentParams, type Zone } from '../../core/epidemic/agents';

/**
 * Epidemia na lotnisku — model AGENTOWY (PRIORYTET 1).
 *
 * REALNY silnik (core/epidemic/agents.ts): każdy punkt to jawny agent, który
 * porusza się proceduralnie przez strefy lotniska (przyloty → kontrola →
 * terminal → bramki), a zakażenie przenosi się przez KONTAKTY (bliskość).
 * Ta sama rodzina parametrów co model przedziałowy (R0, inkubacja, zakaźność,
 * IFR) — do porównań. Interwencja: izolacja objawowych (kwarantanna).
 *
 * Uczciwość: agenci to WIRTUALNE punkty modelu, NIE realni ludzie; „Pathogen X"
 * jest abstrakcyjny; to symulacja EDUKACYJNA, nie prognoza rzeczywistej epidemii.
 */

const MAX_DAYS = 120;
const STATE_COLORS = { S: '#6ee7a0', E: '#e8b34a', I: '#f47c7c', R: '#6aa9ff', D: '#8a8f98' };
const ZONE_TINT: Record<string, string> = {
  arrivals: 'rgba(106,169,255,0.10)',
  security: 'rgba(232,179,74,0.12)',
  concourse: 'rgba(110,231,160,0.07)',
  gate: 'rgba(106,169,255,0.10)',
  isolation: 'rgba(244,124,124,0.14)',
};

function paramsFrom(p: SimParams): Partial<AgentParams> {
  return {
    nAgents: Math.round(Number(p.nAgents ?? 300)),
    r0: Number(p.r0 ?? 3),
    infectiousDays: Number(p.infectiousDays ?? 6),
    incubationDays: Number(p.incubationDays ?? 3),
    ifr: Number(p.ifr ?? 1) / 100,
    contactRadius: Number(p.contactRadius ?? 20) / 1000, // suwak w „promilach" planszy
    isolationEnabled: Boolean(p.isolation ?? false),
    isolationDelayDays: Number(p.isolationDelay ?? 2),
    isolationEffectiveness: Number(p.isolationEffect ?? 70) / 100,
    seed: 12345,
  };
}

function signature(p: Partial<AgentParams>): string {
  return [p.nAgents, p.r0, p.infectiousDays, p.incubationDays, p.ifr, p.contactRadius,
    p.isolationEnabled, p.isolationDelayDays, p.isolationEffectiveness].join('|');
}

class AirportSim implements Sim {
  private world = new AgentWorld(paramsFrom({}));
  private sig = signature(paramsFrom({}));
  private history: { t: number; S: number; E: number; I: number; R: number; D: number }[] = [];

  init(_w: number, _h: number) { this.restart(paramsFrom({})); }

  private restart(p: Partial<AgentParams>) {
    this.world = new AgentWorld(p);
    this.sig = signature(p);
    const c = this.world.getCounts();
    this.history = [{ t: 0, S: c.S, E: c.E, I: c.I, R: c.R, D: c.D }];
  }

  reset() { this.restart(paramsFrom({})); }

  update(dt: number, params: SimParams) {
    const p = paramsFrom(params);
    if (signature(p) !== this.sig) this.restart(p);
    if (this.world.day >= MAX_DAYS) return;
    const speed = Number(params.speed ?? 6); // dni/sek
    let remaining = Math.min(dt * speed, MAX_DAYS - this.world.day);
    const stepDt = 0.25;
    let lastDay = this.history[this.history.length - 1].t;
    while (remaining > 1e-6) {
      const h = Math.min(stepDt, remaining);
      this.world.step(h);
      remaining -= h;
      if (this.world.day - lastDay >= 1 || this.world.day >= MAX_DAYS) {
        const c = this.world.getCounts();
        this.history.push({ t: this.world.day, S: c.S, E: c.E, I: c.I, R: c.R, D: c.D });
        lastDay = this.world.day;
      }
    }
  }

  getStats() {
    const c = this.world.getCounts();
    return {
      dzien: Math.round(this.world.day),
      podatni_S: c.S, zakazeni_I: c.I, ozdrowieni_R: c.R, zgony_D: c.D,
      w_izolacji: c.isolated, szczyt_zakazonych: this.world.getPeakInfected(),
      agenci: this.world.agents.length,
    };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, w, h);
    // Panel lewy: lotnisko; panel prawy (30%): krzywa epidemii.
    const split = Math.round(w * 0.7);
    this.renderAirport(ctx, 0, 0, split, h);
    this.renderCurve(ctx, split, 0, w - split, h);
  }

  private renderAirport(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
    const px = (nx: number) => x0 + nx * w;
    const py = (ny: number) => y0 + ny * h;
    // Strefy.
    ctx.font = '11px ui-monospace, monospace';
    for (const z of AIRPORT_ZONES as Zone[]) {
      ctx.fillStyle = ZONE_TINT[z.role] ?? 'rgba(255,255,255,0.05)';
      ctx.fillRect(px(z.x), py(z.y), z.w * w, z.h * h);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px(z.x), py(z.y), z.w * w, z.h * h);
      ctx.fillStyle = 'rgba(230,234,245,0.55)';
      ctx.fillText(z.label, px(z.x) + 6, py(z.y) + 15);
    }
    // Agenci.
    const rBase = Math.max(1.6, Math.min(3.2, 900 / Math.max(60, this.world.agents.length)));
    for (const a of this.world.agents) {
      ctx.fillStyle = STATE_COLORS[a.state];
      ctx.beginPath();
      ctx.arc(px(a.x), py(a.y), a.state === 'I' ? rBase + 0.6 : rBase, 0, Math.PI * 2);
      ctx.fill();
      // Znacznik zachowania: „telefon/rozmowa" jako kropka nad głową.
      if (a.behavior === 'phone' || a.behavior === 'talk') {
        ctx.fillStyle = a.behavior === 'phone' ? 'rgba(106,169,255,0.9)' : 'rgba(232,179,74,0.9)';
        ctx.beginPath();
        ctx.arc(px(a.x), py(a.y) - rBase - 2, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(230,234,245,0.5)';
    ctx.fillText('wirtualni agenci — nie realni ludzie', x0 + 6, y0 + h - 8);
  }

  private renderCurve(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
    const pad = 30;
    const gx = x0 + pad, gy = y0 + pad, gw = w - pad * 1.3, gh = h - pad * 2.4;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
    ctx.fillStyle = 'rgba(230,234,245,0.6)'; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('epidemia (agenci)', gx - 4, gy - 10);
    ctx.fillText(`dzień → ${MAX_DAYS}`, gx + gw - 62, gy + gh + 16);

    const N = Math.max(1, this.world.agents.length);
    const xAt = (t: number) => gx + (t / MAX_DAYS) * gw;
    const yAt = (v: number) => gy + gh - (v / N) * gh;
    const line = (key: 'S' | 'E' | 'I' | 'R' | 'D', color: string, wLine: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = wLine; ctx.beginPath();
      this.history.forEach((pt, i) => {
        const p = xAt(pt.t), q = yAt(pt[key]);
        if (i === 0) ctx.moveTo(p, q); else ctx.lineTo(p, q);
      });
      ctx.stroke();
    };
    line('S', STATE_COLORS.S, 1.3);
    line('R', STATE_COLORS.R, 1.3);
    if (this.history.some((p) => p.E > 0)) line('E', STATE_COLORS.E, 1.3);
    if (this.history.some((p) => p.D > 0)) line('D', STATE_COLORS.D, 1.3);
    line('I', STATE_COLORS.I, 2.2);

    // Legenda.
    const c = this.world.getCounts();
    const legend: [string, string, number][] = [
      ['S', STATE_COLORS.S, c.S], ['E', STATE_COLORS.E, c.E], ['I', STATE_COLORS.I, c.I],
      ['R', STATE_COLORS.R, c.R], ['D', STATE_COLORS.D, c.D],
    ];
    let ly = gy + gh + 30;
    for (const [lab, col, val] of legend) {
      ctx.fillStyle = col; ctx.fillRect(gx, ly - 8, 9, 9);
      ctx.fillStyle = 'rgba(230,234,245,0.75)';
      ctx.fillText(`${lab}: ${val}`, gx + 14, ly);
      ly += 15;
    }
    if (c.isolated > 0) {
      ctx.fillStyle = 'rgba(230,234,245,0.6)';
      ctx.fillText(`w izolacji: ${c.isolated}`, gx, ly);
    }
  }
}

export const biologyAirport: ExperimentDef = {
  id: 'biology.airport',
  name: 'Epidemia na lotnisku (model agentowy)',
  honesty: 'educational',
  honestyNote:
    'Model AGENTOWY (individual-based), silnik core/epidemic/agents.ts: każdy punkt to wirtualny agent poruszający się proceduralnie przez strefy lotniska; zakażenie przenosi się przez KONTAKTY (bliskość), a nie uśrednione λ. Ta sama rodzina parametrów co model przedziałowy (R0, inkubacja, zakaźność, IFR) — do porównań. Stochastyczny, ale deterministyczny przy ustalonym ziarnie. AGENCI TO NIE REALNI LUDZIE, patogen jest abstrakcyjny („Pathogen X"), a to symulacja EDUKACYJNA — NIE prognoza rzeczywistej epidemii ani realnego lotniska.',
  params: [
    { key: 'nAgents', label: 'Liczba agentów', type: 'slider', default: 300, min: 100, max: 500, step: 20 },
    { key: 'r0', label: 'R0 (repr. podstawowa)', type: 'slider', default: 3, min: 0, max: 6, step: 0.1 },
    { key: 'infectiousDays', label: 'Czas zakaźności', type: 'slider', default: 6, min: 2, max: 14, step: 1, unit: 'dni' },
    { key: 'incubationDays', label: 'Czas inkubacji', type: 'slider', default: 3, min: 1, max: 10, step: 1, unit: 'dni' },
    { key: 'ifr', label: 'Śmiertelność IFR', type: 'slider', default: 1, min: 0, max: 10, step: 0.5, unit: '%' },
    { key: 'contactRadius', label: 'Promień kontaktu', type: 'slider', default: 20, min: 8, max: 40, step: 1, unit: '‰' },
    { key: 'isolation', label: 'Izolacja objawowych (kwarantanna)', type: 'toggle', default: false },
    { key: 'isolationDelay', label: 'Opóźnienie wykrycia', type: 'slider', default: 2, min: 0, max: 6, step: 1, unit: 'dni' },
    { key: 'isolationEffect', label: 'Skuteczność wykrycia', type: 'slider', default: 70, min: 0, max: 100, step: 5, unit: '%' },
    { key: 'speed', label: 'Tempo (dni/s)', type: 'slider', default: 6, min: 1, max: 20, step: 1 },
  ],
  createSim: () => new AirportSim(),
  narrate(p, stats): NarrationBlock[] {
    const iso = Boolean(p.isolation);
    const day = Number(stats.dzien ?? 0);
    const I = Number(stats.zakazeni_I ?? 0);
    const R = Number(stats.ozdrowieni_R ?? 0);
    const D = Number(stats.zgony_D ?? 0);
    const isolated = Number(stats.w_izolacji ?? 0);
    const peak = Number(stats.szczyt_zakazonych ?? 0);
    return [
      {
        title: `Dzień ${day} — zakażonych ${I}, ozdrowiałych ${R}, zgonów ${D} (szczyt: ${peak})`,
        body: iso
          ? `Izolacja objawowych włączona: ${isolated} agentów jest teraz w izolatce i nie zaraża. To realna dźwignia — wykrycie i odseparowanie zakaźnych obniża szczyt epidemii, bo skraca czas, w którym zakaźny agent styka się z podatnymi w kolejce do kontroli i na terminalu.`
          : 'Bez interwencji zakaźni agenci swobodnie kontaktują się z podatnymi w gęstych strefach (kontrola, terminal), napędzając falę. Włącz „Izolację objawowych", by zobaczyć, jak wykrycie i kwarantanna spłaszczają krzywę — ten sam mechanizm co dystans społeczny w modelu przedziałowym.',
        kind: iso ? 'insight' : 'hypothesis',
      },
      {
        title: 'Model agentowy vs przedziałowy',
        body: 'W modelu przedziałowym (SIR/SEIR) zakażenie jest uśrednione po całej populacji (mieszanie jednorodne). Tutaj wynika z konkretnych, lokalnych KONTAKTÓW — dlatego widać ogniska i wpływ tego, GDZIE agenci się gromadzą. Oba modele używają tych samych parametrów (R0, inkubacja, zakaźność, IFR), więc można je porównać.',
      },
    ];
  },
};
