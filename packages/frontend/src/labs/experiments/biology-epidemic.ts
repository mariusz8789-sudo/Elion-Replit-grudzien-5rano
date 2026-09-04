import type { ExperimentDef, Sim, SimParams } from '../../core/types';
import { rk4Step, initialState, type EpidemicParams, type Compartments } from '../../core/epidemic/sir';

/**
 * Epidemia na fikcyjnej wyspie — SIR/SEIR/SEIRD (DEMO B).
 *
 * REALNY silnik (core/epidemic/sir.ts, RK4) napędza DWIE wizualizacje na żywo:
 * (1) krzywe przedziałów w czasie, (2) „wyspa" — siatka populacji, której KOLORY
 * odzwierciedlają PROPORCJE przedziałów modelu (fala od ogniska na zewnątrz,
 * potem ozdrowienia). To wizualizacja stanu modelu, NIE realni ludzie i NIE
 * dane przestrzenne. Patogen jest abstrakcyjny („Pathogen X"). Interwencja
 * (dystans społeczny) to dźwignia „co jeśli?"/A-B: zmień dzień i skuteczność,
 * obserwuj spłaszczenie szczytu.
 */

const MAX_DAYS = 240;
const POP = 100_000;
const SEED_INFECTED = 20;

const COLORS = { S: '#6ee7a0', E: '#e8b34a', I: '#f47c7c', R: '#6aa9ff', D: '#8a8f98' };

function paramsFrom(p: SimParams): EpidemicParams {
  return {
    model: (String(p.model ?? 'SEIR') as EpidemicParams['model']),
    population: POP,
    initialInfected: SEED_INFECTED,
    r0: Number(p.r0 ?? 2.5),
    infectiousDays: Number(p.infectiousDays ?? 7),
    incubationDays: Number(p.incubationDays ?? 3),
    ifr: Number(p.ifr ?? 1) / 100, // suwak w %
    interventionDay: Number(p.interventionDay ?? 0),
    interventionEffect: Number(p.interventionEffect ?? 0) / 100, // suwak w %
  };
}

/** Sygnatura parametrów strukturalnych — ich zmiana restartuje przebieg (nowy model = nowy bieg). */
function signature(p: EpidemicParams): string {
  return [p.model, p.r0, p.infectiousDays, p.incubationDays, p.ifr, p.interventionDay, p.interventionEffect].join('|');
}

class EpidemicSim implements Sim {
  private c: Compartments = initialState(paramsFrom({}));
  private day = 0;
  private sig = '';
  private history: { t: number; S: number; E: number; I: number; R: number; D: number }[] = [];
  private peakI = SEED_INFECTED; private peakDay = 0;
  private interventionDay = 0;
  // Agenci „wyspy": pozycje posortowane wg odległości od ogniska (fala od środka).
  private agents: { x: number; y: number }[] = [];

  init(_w: number, _h: number) {
    this.buildIsland();
    this.restart(paramsFrom({}));
  }

  private buildIsland() {
    // Panel wyspy zajmuje prawą część; siatka w kształcie elipsy (wyspa).
    const cols = 26, rows = 20;
    const pts: { x: number; y: number; d: number }[] = [];
    const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
    const seedX = cols * 0.32, seedY = rows * 0.4; // ognisko
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const nx = (i - cx) / (cols / 2), ny = (j - cy) / (rows / 2);
        if (nx * nx + ny * ny <= 0.92) { // wnętrze elipsy = ląd
          const d = Math.hypot(i - seedX, j - seedY);
          pts.push({ x: i / (cols - 1), y: j / (rows - 1), d });
        }
      }
    }
    pts.sort((a, b) => a.d - b.d); // od ogniska na zewnątrz
    this.agents = pts.map((p) => ({ x: p.x, y: p.y }));
  }

  private restart(p: EpidemicParams) {
    this.c = initialState(p);
    this.day = 0;
    this.history = [{ t: 0, ...this.c }];
    this.peakI = this.c.I; this.peakDay = 0;
    this.sig = signature(p);
  }

  update(dt: number, params: SimParams) {
    const p = paramsFrom(params);
    this.interventionDay = p.interventionDay;
    if (signature(p) !== this.sig) this.restart(p); // zmiana modelu/parametrów → nowy bieg
    if (this.day >= MAX_DAYS) return;
    const speed = Number(params.speed ?? 12); // dni/sek
    let remaining = Math.min(dt * speed, MAX_DAYS - this.day);
    const step = 0.25;
    while (remaining > 1e-6) {
      const h = Math.min(step, remaining);
      this.c = rk4Step(this.c, p, this.day, h);
      this.c = { S: Math.max(0, this.c.S), E: Math.max(0, this.c.E), I: Math.max(0, this.c.I), R: Math.max(0, this.c.R), D: Math.max(0, this.c.D) };
      this.day += h; remaining -= h;
      if (this.c.I > this.peakI) { this.peakI = this.c.I; this.peakDay = this.day; }
    }
    const lastDay = this.history[this.history.length - 1].t;
    if (this.day - lastDay >= 1 || this.day >= MAX_DAYS) this.history.push({ t: this.day, ...this.c });
  }

  getStats() {
    return {
      dzien: Math.round(this.day),
      podatni_S: Math.round(this.c.S),
      zakazeni_I: Math.round(this.c.I),
      ozdrowieni_R: Math.round(this.c.R),
      zgony_D: Math.round(this.c.D),
      szczyt_zakazonych: Math.round(this.peakI),
      dzien_szczytu: Math.round(this.peakDay),
    };
  }

  reset() { this.restart(paramsFrom({})); this.sig = ''; }

  render(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.clearRect(0, 0, w, h);
    const split = Math.round(w * 0.6);
    this.renderCurves(ctx, 0, 0, split, h);
    this.renderIsland(ctx, split, 0, w - split, h);
  }

  private renderCurves(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
    const pad = 34;
    const gx = x0 + pad, gy = y0 + pad, gw = w - pad * 1.4, gh = h - pad * 2;
    // osie
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px system-ui';
    ctx.fillText('% populacji', gx - 26, gy - 10);
    ctx.fillText(`dzień → ${MAX_DAYS}`, gx + gw - 60, gy + gh + 18);

    const xAt = (t: number) => gx + (t / MAX_DAYS) * gw;
    const yAt = (frac: number) => gy + gh - frac * gh;
    const line = (key: 'S' | 'E' | 'I' | 'R' | 'D', color: string) => {
      ctx.strokeStyle = color; ctx.lineWidth = key === 'I' ? 2.2 : 1.4; ctx.beginPath();
      this.history.forEach((pt, i) => {
        const px = xAt(pt.t), py = yAt(pt[key] / POP);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };
    line('S', COLORS.S); if (this.history.some((p) => p.E > 0)) line('E', COLORS.E);
    line('R', COLORS.R); if (this.history.some((p) => p.D > 0)) line('D', COLORS.D);
    line('I', COLORS.I);

    // pionowa linia interwencji (dystans społeczny)
    if (this.interventionDay > 0) {
      const ix = xAt(this.interventionDay);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ix, gy); ctx.lineTo(ix, gy + gh); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('interwencja', ix - 20, gy + 10);
    }
  }

  private renderIsland(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
    const pad = 16;
    const gx = x0 + pad, gy = y0 + pad + 14, gw = w - pad * 2, gh = h - pad * 2 - 14;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '11px system-ui';
    ctx.fillText('Wyspa — proporcje modelu (nie realni ludzie)', x0 + pad, y0 + 18);

    const total = this.c.S + this.c.E + this.c.I + this.c.R + this.c.D || 1;
    const A = this.agents.length;
    const nS = Math.round((this.c.S / total) * A);
    const nE = nS + Math.round((this.c.E / total) * A);
    const nI = nE + Math.round((this.c.I / total) * A);
    const nR = nI + Math.round((this.c.R / total) * A);
    const r = Math.max(2, Math.min(gw, gh) / 34);
    this.agents.forEach((a, i) => {
      const color = i < nS ? COLORS.S : i < nE ? COLORS.E : i < nI ? COLORS.I : i < nR ? COLORS.R : COLORS.D;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(gx + a.x * gw, gy + a.y * gh, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

export const biologyEpidemic: ExperimentDef = {
  id: 'biology.epidemic',
  name: 'Epidemia na wyspie (SIR/SEIR)',
  honesty: 'simplified',
  honestyNote:
    'Model przedziałowy SIR/SEIR/SEIRD całkowany RK4 (core/epidemic/sir.ts). DOKŁADNY dla swoich założeń: mieszanie jednorodne, stała populacja, brak struktury wiekowej/przestrzennej/sieci kontaktów. Patogen ABSTRAKCYJNY („Pathogen X") — model edukacyjny, NIE prognoza i NIE odwzorowanie realnego patogenu. „Wyspa" wizualizuje PROPORCJE przedziałów, nie realnych ludzi ani danych przestrzennych. R0 = β·D_inf; próg epidemiczny przy R0 = 1.',
  params: [
    { key: 'model', label: 'Model', type: 'select', default: 'SEIR', options: [
      { value: 'SIR', label: 'SIR' }, { value: 'SEIR', label: 'SEIR (z inkubacją)' }, { value: 'SEIRD', label: 'SEIRD (ze zgonami)' },
    ] },
    { key: 'r0', label: 'R0 (repr. podstawowa)', type: 'slider', default: 2.5, min: 0.5, max: 6, step: 0.1 },
    { key: 'infectiousDays', label: 'Czas zakaźności', type: 'slider', default: 7, min: 2, max: 21, step: 1, unit: 'dni' },
    { key: 'incubationDays', label: 'Czas inkubacji (SEIR)', type: 'slider', default: 3, min: 1, max: 14, step: 1, unit: 'dni' },
    { key: 'ifr', label: 'Śmiertelność IFR (SEIRD)', type: 'slider', default: 1, min: 0, max: 5, step: 0.1, unit: '%' },
    { key: 'interventionDay', label: 'Interwencja: dzień startu', type: 'slider', default: 0, min: 0, max: 120, step: 1 },
    { key: 'interventionEffect', label: 'Interwencja: skuteczność', type: 'slider', default: 0, min: 0, max: 90, step: 5, unit: '%' },
    { key: 'speed', label: 'Tempo (dni/s)', type: 'slider', default: 12, min: 1, max: 30, step: 1 },
  ],
  createSim: () => new EpidemicSim(),
  narrate: (params, stats) => {
    const r0 = Number(params.r0 ?? 2.5);
    const eff = Number(params.interventionEffect ?? 0);
    const blocks = [
      {
        title: 'Co pokazuje model',
        body: `R0 = ${r0.toFixed(1)} oznacza, że jeden zakażony zaraża średnio tylu podatnych na początku epidemii. Przy R0 > 1 fala rośnie, przy R0 < 1 wygasa. Szczyt zakażonych: ${Math.round(Number(stats.szczyt_zakazonych ?? 0)).toLocaleString('pl')} (dzień ${Math.round(Number(stats.dzien_szczytu ?? 0))}).`,
        honesty: 'simplified' as const,
      },
    ];
    if (eff > 0) {
      blocks.push({
        title: 'Interwencja (dystans społeczny)',
        body: `Od dnia ${Number(params.interventionDay ?? 0)} redukujesz kontakty o ${eff}%, co obniża efektywne β i „spłaszcza krzywą". Porównaj szczyt z wariantem bez interwencji (skuteczność 0%).`,
        honesty: 'simplified' as const,
      });
    }
    return blocks;
  },
};
