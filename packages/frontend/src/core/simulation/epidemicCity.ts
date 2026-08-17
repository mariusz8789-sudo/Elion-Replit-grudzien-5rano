import type { VisualSimulation, SimAgent, WorldObject, TransmissionEvent } from './types';
import { buildCity, type CityLayout } from '../world/cityWorld';
import { spawnAgents, chooseDestination, stepMovement, type CityAgent } from '../agents/cityAgent';
import { resolveContacts } from '../interactions/contacts';
import { interventionEffects, type InterventionState } from '../interventions/interventions';
import { makeRng } from '../epidemic/agents';

/**
 * EPIDEMIC CITY SIMULATION — pierwszy model Visual Scene Engine: „Epidemia w
 * małym mieście". Implementuje uniwersalny kontrakt VisualSimulation.
 *
 * To PRAWDZIWY proces, nie animacja wyniku. Każdy tick, w tej kolejności:
 *  1. interwencje → efekty (mobilność, zamknięcia, izolacja),
 *  2. ruch agentów do celów (dom/sklep/szkoła/park), z postojami,
 *  3. wykrycie kontaktów przestrzennych,
 *  4. ekspozycja i transmisja (S→E) — β = R0/D_zak, P=1−e^(−β·Δt),
 *  5. przejścia stanów (E→I→R/D) wg czasów inkubacji/zakaźności i IFR,
 *  6. izolacja wykrytych zakaźnych (zmiana trajektorii → izolatka),
 *  7. statystyki + próbka do szeregu czasowego (wykres jest SKUTKIEM świata).
 *
 * Deterministyczne przy ustalonym ziarnie. Patogen abstrakcyjny „Pathogen X",
 * agenci to wirtualne punkty modelu — symulacja EDUKACYJNA, nie prognoza.
 */

export interface EpidemicCityParams {
  nAgents: number;
  initialInfected: number;
  r0: number;
  infectiousDays: number;
  incubationDays: number;
  ifr: number;             // 0..1
  contactRadius: number;   // px
  transmissionScale: number; // dodatkowy globalny mnożnik zaraźliwości 0..1 (parametr użytkownika)
  restrictions: number;    // 0..1 (interwencja)
  isolate: boolean;        // izolacja objawowych
  mobility: number;        // 0..1 bazowa chęć wychodzenia (skalowana przez restrykcje)
  seed: number;
}

export const DEFAULT_CITY_PARAMS: EpidemicCityParams = {
  nAgents: 260,
  initialInfected: 4,
  r0: 2.5,
  infectiousDays: 6,
  incubationDays: 3,
  ifr: 0.02,
  contactRadius: 14,
  transmissionScale: 1,
  restrictions: 0,
  isolate: false,
  mobility: 0.85,
  seed: 20260817,
};

const COLORS: Record<string, string> = {
  S: '#54d98c', // zdrowy (zielony)
  E: '#e8b34a', // narażony (żółty)
  I: '#f05555', // zakażony (czerwony)
  R: '#5aa2ff', // odporny (niebieski)
  D: '#6b7280', // zgon (szary)
};

export class EpidemicCitySimulation implements VisualSimulation {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly stateColors = COLORS;
  private layout: CityLayout;
  private agentsArr: CityAgent[] = [];
  private rng: () => number;
  private params: EpidemicCityParams;
  private time = 0;
  private events: TransmissionEvent[] = [];
  private hist: Record<string, number>[] = [];
  private lastSample = -1;
  private peakI = 0;
  private lastContactPairs = 0;

  constructor(params: Partial<EpidemicCityParams> = {}, width = 900, height = 620) {
    this.params = { ...DEFAULT_CITY_PARAMS, ...params };
    this.layout = buildCity(width, height);
    this.worldWidth = this.layout.width;
    this.worldHeight = this.layout.height;
    this.rng = makeRng(this.params.seed);
    this.seed();
  }

  private seed(): void {
    this.rng = makeRng(this.params.seed);
    this.time = 0; this.peakI = 0; this.lastSample = -1; this.events = []; this.hist = [];
    this.agentsArr = spawnAgents(this.layout, { nAgents: this.params.nAgents, initialInfected: this.params.initialInfected }, this.rng);
    this.sample(true);
  }

  reset(): void { this.seed(); }

  private beta(): number { return this.params.r0 / Math.max(1e-6, this.params.infectiousDays); }

  tick(dt: number): void {
    this.time += dt;
    this.events = [];
    const eff = interventionEffects({ level: this.params.restrictions, isolate: this.params.isolate } as InterventionState);
    // Zamknięcia budynków (widoczne w renderze).
    for (const b of this.layout.buildings) b.closed = eff.closedKinds.has(b.kind);

    // (2) Ruch celowy + postoje.
    const speed = this.worldWidth * 0.10; // px/dzień
    for (const a of this.agentsArr) {
      if (a.state === 'D') { a.vx = 0; a.vy = 0; continue; }
      a.stateSince += dt;
      const arrived = stepMovement(a, dt, speed);
      if (arrived) {
        a.dwell -= dt;
        if (a.dwell <= 0) {
          chooseDestination(a, this.layout, eff, this.rng);
          a.dwell = 0.15 + this.rng() * (a.destKind === 'home' ? 0.8 : 0.4);
        }
      }
    }

    // (3)+(4) Kontakty i transmisja.
    const c = resolveContacts(this.agentsArr, {
      contactRadius: this.params.contactRadius,
      beta: this.beta(),
      dt,
      rng: this.rng,
      transmissionScale: clamp01(this.params.transmissionScale) * eff.transmissionScale,
      susceptible: 'S', infectious: 'I',
    });
    this.lastContactPairs = c.contactPairs;
    for (const [ti, src] of c.exposures) {
      const a = this.agentsArr[ti];
      a.state = 'E'; a.stateSince = 0; a.exposedAt = this.time; a.infectedBy = src; a.behavior = 'narażony';
    }
    this.events = c.events;

    // (5)+(6) Przejścia stanów + izolacja objawowych.
    this.progress(eff.isolateInfected);

    // (7) Statystyki + próbka szeregu (raz na „dzień" symulacji).
    this.sample(false);
  }

  private progress(isolateInfected: boolean): void {
    const { incubationDays, infectiousDays, ifr } = this.params;
    for (const a of this.agentsArr) {
      if (a.state === 'E' && this.time - a.exposedAt >= incubationDays) {
        a.state = 'I'; a.stateSince = 0; a.infectedAt = this.time; a.behavior = 'zakażony';
      }
      if (a.state === 'I') {
        // Izolacja: wykryty objawowy zostaje skierowany do izolatki (zmiana trajektorii).
        if (isolateInfected && !a.isolated && this.time - a.infectedAt >= 1) {
          a.isolated = true; a.behavior = 'izolacja';
          chooseDestination(a, this.layout, interventionEffects({ level: this.params.restrictions, isolate: true }), this.rng);
        }
        if (this.time - a.infectedAt >= infectiousDays) {
          if (this.rng() < clamp01(ifr)) { a.state = 'D'; a.stateSince = 0; a.behavior = 'zgon'; a.vx = 0; a.vy = 0; }
          else { a.state = 'R'; a.stateSince = 0; a.isolated = false; a.behavior = 'ozdrowiały'; }
        }
      }
    }
  }

  private counts(): { S: number; E: number; I: number; R: number; D: number; isolated: number } {
    const c = { S: 0, E: 0, I: 0, R: 0, D: 0, isolated: 0 };
    for (const a of this.agentsArr) { c[a.state as 'S' | 'E' | 'I' | 'R' | 'D']++; if (a.isolated) c.isolated++; }
    return c;
  }

  private sample(force: boolean): void {
    const c = this.counts();
    if (c.I > this.peakI) this.peakI = c.I;
    const day = Math.floor(this.time);
    if (force || day > this.lastSample) {
      this.lastSample = day;
      this.hist.push({ t: this.time, S: c.S, E: c.E, I: c.I, R: c.R, D: c.D });
      if (this.hist.length > 2000) this.hist.shift();
    }
  }

  // --- VisualSimulation API ---
  /** Ulice do tła (opcjonalne, odczytywane przez renderer). */
  get streets(): { h: number[]; v: number[] } { return { h: this.layout.streetsH, v: this.layout.streetsV }; }
  objects(): readonly WorldObject[] { return this.layout.buildings; }
  agents(): readonly SimAgent[] { return this.agentsArr; }
  lastTransmissions(): readonly TransmissionEvent[] { return this.events; }

  setParam(key: string, value: number | boolean): void {
    if (!(key in this.params)) return;
    const structural = key === 'nAgents' || key === 'initialInfected' || key === 'seed';
    (this.params as unknown as Record<string, number | boolean>)[key] = value;
    if (structural) this.seed(); // zmiana liczby agentów = nowy świat
  }

  getParams(): Record<string, number | boolean> {
    return { ...this.params } as unknown as Record<string, number | boolean>;
  }

  stats(): Record<string, number> {
    const c = this.counts();
    return {
      dzien: Math.floor(this.time),
      S: c.S, E: c.E, I: c.I, R: c.R, D: c.D,
      izolowani: c.isolated,
      szczyt_I: this.peakI,
      kontakty: this.lastContactPairs,
      agenci: this.agentsArr.length,
    };
  }

  history(): readonly Record<string, number>[] { return this.hist; }

  debugInfo(agentId: number): Record<string, string | number> | null {
    const a = this.agentsArr.find((x) => x.id === agentId);
    if (!a) return null;
    return {
      id: a.id, stan: a.state, zachowanie: a.behavior,
      x: Math.round(a.x), y: Math.round(a.y),
      predkosc: Math.round(Math.hypot(a.vx, a.vy)),
      cel: `${Math.round(a.goalX)},${Math.round(a.goalY)} (${a.destKind})`,
      czas_w_stanie: a.stateSince.toFixed(2),
      izolowany: a.isolated ? 'tak' : 'nie',
      zarazony_przez: a.infectedBy,
    };
  }
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
