import type { VisualSimulation, SimAgent, WorldObject, TransmissionEvent } from './types';
import { buildCity, pointInBuilding, type CityLayout } from '../world/cityWorld';
import { spawnAgents, chooseDestination, stepMovement, type CityAgent } from '../agents/cityAgent';
import { resolveContacts } from '../interactions/contacts';
import { interventionEffects, type InterventionState } from '../interventions/interventions';
import { makeRng } from '../epidemic/agents';
import {
  classifyContact,
  HOUSEHOLD_PROVENANCE_NOTE,
  type HouseholdStructure,
  type TransmissionEdge,
} from '../contacts/contactNetwork';
import {
  NEUTRAL_COHORT_PROFILE,
  AGE_BANDS,
  bandOfAgent,
  contactMultiplierFor,
  susceptibilityFor,
  severityFor,
  fatalityFor,
  type AgeBand,
  type CohortProfile,
} from '../agents/cohortModel';

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
  /** 0..1 bazowa chęć wychodzenia z domu, dodatkowo skalowana przez restrykcje. */
  mobility: number;
  severeRate: number;      // 0..1 odsetek zakażonych z ciężkim przebiegiem → szpital
  /**
   * Niezależne zamknięcie szkół — dźwignia oddzielona od `restrictions`, dzięki
   * czemu efekt samego zamknięcia szkoły da się zmierzyć.
   */
  closeSchools: boolean;
  /**
   * Mnożnik zaraźliwości WEWNĄTRZ gospodarstwa domowego (1 = bez zmian).
   * To dźwignia polityki („ochrona domowa"), nie zmierzona skuteczność
   * jakiegokolwiek realnego programu.
   */
  householdTransmissionScale: number;
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
  severeRate: 0.15,
  closeSchools: false,
  householdTransmissionScale: 1,
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
  /**
   * Profil kohortowy. Domyślnie NEUTRALNY: wszystkie mnożniki równe 1, więc
   * model zachowuje się dokładnie tak jak przed dołożeniem heterogeniczności.
   * Pasma wieku i tak są liczone — do rozbicia WYNIKÓW na grupy.
   */
  private cohort: CohortProfile;
  /** Ilu agentów danego pasma w ogóle jest w populacji (mianownik dla grup). */
  private bandPopulation: Record<AgeBand, number> = { child: 0, adult: 0, senior: 0 };
  /**
   * Ilu agentów danego pasma KIEDYKOLWIEK trafiło do szpitala. Flaga
   * `hospitalized` gaśnie przy wyzdrowieniu, więc bez tego licznika ciężkość
   * przebiegu w grupie byłaby niepoliczalna.
   */
  private bandHospitalizedEver: Record<AgeBand, number> = { child: 0, adult: 0, senior: 0 };
  /** Krawędzie transmisji z ostatniego kroku (efemeryczne, jak `events`). */
  private edges: TransmissionEdge[] = [];
  /** Pełny graf transmisji przebiegu — podstawa analizy klastrów. */
  private allEdges: TransmissionEdge[] = [];

  /**
   * Typ kontaktu dla pary agentów w miejscu, w którym stoi cel. Pozycja celu
   * jest tym samym punktem, który trafia do zdarzenia transmisji.
   */
  private classify(source: CityAgent, target: CityAgent) {
    return classifyContact(this.layout, target.x, target.y, source.homeIdx, target.homeIdx);
  }

  constructor(params: Partial<EpidemicCityParams> = {}, width = 900, height = 620, cohort: CohortProfile = NEUTRAL_COHORT_PROFILE) {
    this.params = { ...DEFAULT_CITY_PARAMS, ...params };
    this.cohort = cohort;
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
    this.bandPopulation = { child: 0, adult: 0, senior: 0 };
    this.bandHospitalizedEver = { child: 0, adult: 0, senior: 0 };
    this.edges = [];
    this.allEdges = [];
    for (const a of this.agentsArr) this.bandPopulation[bandOfAgent(a, this.cohort)]++;
    this.sample(true);
  }

  reset(): void { this.seed(); }

  private beta(): number { return this.params.r0 / Math.max(1e-6, this.params.infectiousDays); }

  tick(dt: number): void {
    this.time += dt;
    this.events = [];
    const eff = interventionEffects({
      level: this.params.restrictions,
      isolate: this.params.isolate,
      closeSchools: this.params.closeSchools,
    } as InterventionState);
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
          // Bazowa mobilność modelu BYŁA MARTWYM PARAMETREM: zadeklarowana,
          // udokumentowana i nigdy nieczytana, więc świat zawsze biegł tak,
          // jakby wynosiła 1. Tu wchodzi do decyzji o wyjściu z domu razem z
          // wagą pasma wieku i ochroną priorytetową.
          chooseDestination(a, this.layout, eff, this.rng, clamp01(this.params.mobility) * contactMultiplierFor(a, this.cohort));
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
      susceptibilityOf: (a) => susceptibilityFor(a, this.cohort),
      // Ochrona domowa osłabia transmisję wyłącznie w kontakcie domowym.
      // Domyślny mnożnik 1 nie zmienia progu ani strumienia losowego.
      pairScaleOf: this.params.householdTransmissionScale === 1
        ? undefined
        : (src, tgt) => (this.classify(src as CityAgent, tgt as CityAgent).contactType === 'HOUSEHOLD' ? this.params.householdTransmissionScale : 1),
    });
    this.lastContactPairs = c.contactPairs;
    this.edges = [];
    for (const [ti, src] of c.exposures) {
      const a = this.agentsArr[ti];
      a.state = 'E'; a.stateSince = 0; a.exposedAt = this.time; a.infectedBy = src; a.behavior = 'narażony';
      // Typ kontaktu jest ustalany W CHWILI transmisji, z pozycji obu agentów.
      // Po fakcie byłby już nie do odtworzenia — agenci zdążą się rozejść.
      const source = this.agentsArr.find((x) => x.id === src);
      if (source) {
        const classification = this.classify(source, a);
        this.edges.push({
          source: src,
          target: a.id,
          sourceBand: bandOfAgent(source, this.cohort),
          targetBand: bandOfAgent(a, this.cohort),
          sourceHouseholdId: source.homeIdx,
          targetHouseholdId: a.homeIdx,
          ...classification,
          time: this.time,
          stepDurationDays: dt,
          transmissionProbability: c.exposureProbability.get(ti) ?? 0,
          // Prędkość niezerowa = agent jest w drodze, a nie stoi w celu.
          targetInTransit: a.vx !== 0 || a.vy !== 0,
          targetDestinationKind: a.destKind,
        });
      }
    }
    this.allEdges.push(...this.edges);
    this.events = c.events;

    // (5)+(6) Przejścia stanów + izolacja objawowych.
    this.progress(eff.isolateInfected);

    // (7) Statystyki + próbka szeregu (raz na „dzień" symulacji).
    this.sample(false);
  }

  private progress(isolateInfected: boolean): void {
    const { incubationDays, infectiousDays, ifr, severeRate } = this.params;
    const hosp = this.layout.buildings.findIndex((b) => b.kind === 'hospital');
    for (const a of this.agentsArr) {
      if (a.state === 'E' && this.time - a.exposedAt >= incubationDays) {
        a.state = 'I'; a.stateSince = 0; a.infectedAt = this.time; a.behavior = 'zakażony';
        // Ciężki przebieg → hospitalizacja (deterministycznie z RNG).
        if (this.rng() < clamp01(severeRate * severityFor(a, this.cohort)) && hosp >= 0) {
          a.hospitalized = true; a.isolated = true; a.behavior = 'szpital';
          this.bandHospitalizedEver[bandOfAgent(a, this.cohort)]++;
          const pt = pointInBuilding(this.layout.buildings[hosp], this.rng);
          a.destIdx = hosp; a.destKind = 'hospital'; a.goalX = pt.x; a.goalY = pt.y;
        }
      }
      if (a.state === 'I') {
        // Izolacja domowa: wykryty objawowy (nie-hospitalizowany) → izolatka.
        if (isolateInfected && !a.isolated && this.time - a.infectedAt >= 1) {
          a.isolated = true; a.behavior = 'izolacja';
          chooseDestination(a, this.layout, interventionEffects({ level: this.params.restrictions, isolate: true }), this.rng);
        }
        if (this.time - a.infectedAt >= infectiousDays) {
          // Hospitalizowani mają wyższą śmiertelność (ciężki przebieg).
          // Ryzyko bazowe modelu przemnożone przez mnożnik pasma wieku; przy
          // profilu neutralnym mnożnik wynosi 1 i wyrażenie jest identyczne.
          const byBand = clamp01(ifr * fatalityFor(a, this.cohort));
          const risk = a.hospitalized ? Math.min(1, byBand * 3 + 0.05) : byBand;
          if (this.rng() < risk) { a.state = 'D'; a.stateSince = 0; a.behavior = 'zgon'; a.vx = 0; a.vy = 0; }
          else { a.state = 'R'; a.stateSince = 0; a.isolated = false; a.hospitalized = false; a.behavior = 'ozdrowiały'; }
        }
      }
    }
  }

  private counts(): { S: number; E: number; I: number; R: number; D: number; isolated: number; hospitalized: number } {
    const c = { S: 0, E: 0, I: 0, R: 0, D: 0, isolated: 0, hospitalized: 0 };
    for (const a of this.agentsArr) { c[a.state as 'S' | 'E' | 'I' | 'R' | 'D']++; if (a.isolated) c.isolated++; if (a.hospitalized) c.hospitalized++; }
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
    const byBand: Record<string, number> = {};
    // Wyniki w rozbiciu na pasma wieku. Liczone ZAWSZE, także przy profilu
    // neutralnym — pasma nie zmieniają wtedy dynamiki, ale pozwalają zmierzyć,
    // czy model w ogóle różnicuje grupy. Równe wartości są uczciwym wynikiem.
    for (const band of AGE_BANDS) {
      byBand[`pop_${band}`] = this.bandPopulation[band];
      byBand[`zakazeni_${band}`] = 0;
      byBand[`zgony_${band}`] = 0;
      byBand[`hospitalizowani_kiedykolwiek_${band}`] = this.bandHospitalizedEver[band];
    }
    for (const a of this.agentsArr) {
      const band = bandOfAgent(a, this.cohort);
      // „Zakażony kiedykolwiek" = opuścił stan S; w tym modelu każdy zgon
      // poprzedza zakażenie, więc D też się liczy.
      if (a.state !== 'S') byBand[`zakazeni_${band}`]++;
      if (a.state === 'D') byBand[`zgony_${band}`]++;
    }
    return {
      dzien: Math.floor(this.time),
      S: c.S, E: c.E, I: c.I, R: c.R, D: c.D,
      izolowani: c.isolated,
      hospitalizowani: c.hospitalized,
      szczyt_I: this.peakI,
      kontakty: this.lastContactPairs,
      agenci: this.agentsArr.length,
      ...byBand,
    };
  }

  /** Aktywny profil kohortowy — do prowenancji przebiegu, tylko do odczytu. */
  cohortProfile(): CohortProfile { return this.cohort; }

  /** Krawędzie transmisji z ostatniego kroku. */
  lastTransmissionEdges(): readonly TransmissionEdge[] { return this.edges; }

  /** Pełny graf transmisji od początku przebiegu. */
  transmissionGraph(): readonly TransmissionEdge[] { return this.allEdges; }

  /**
   * Gospodarstwa domowe wyprowadzone z realnego przydziału domów. Relacja jest
   * prawdziwa i odtwarzalna; rozkład liczebności jest artefaktem losowania i
   * niesie to zastrzeżenie ze sobą.
   */
  households(): HouseholdStructure {
    const byHome = new Map<number, number[]>();
    for (const a of this.agentsArr) {
      const list = byHome.get(a.homeIdx);
      if (list) list.push(a.id);
      else byHome.set(a.homeIdx, [a.id]);
    }
    const households = [...byHome.entries()]
      .sort(([a], [b]) => a - b)
      .map(([buildingIndex, memberIds]) => {
        const bandCounts: Record<AgeBand, number> = { child: 0, adult: 0, senior: 0 };
        for (const id of memberIds) {
          const agent = this.agentsArr.find((x) => x.id === id);
          if (agent) bandCounts[bandOfAgent(agent, this.cohort)]++;
        }
        return { householdId: buildingIndex, buildingIndex, memberIds, size: memberIds.length, bandCounts };
      });
    const total = households.reduce((n, h) => n + h.size, 0);
    return {
      calibration: 'SYNTHETIC_CALIBRATION_REQUIRED',
      provenanceNote: HOUSEHOLD_PROVENANCE_NOTE,
      households,
      meanSize: households.length > 0 ? total / households.length : 0,
    };
  }

  history(): readonly Record<string, number>[] { return this.hist; }

  debugInfo(agentId: number): Record<string, string | number> | null {
    const a = this.agentsArr.find((x) => x.id === agentId);
    if (!a) return null;
    return {
      id: a.id, wiek: a.age ?? 0, rola: a.role ?? '—',
      stan: a.state, zachowanie: a.behavior,
      x: Math.round(a.x), y: Math.round(a.y),
      predkosc: Math.round(Math.hypot(a.vx, a.vy)),
      cel: `${Math.round(a.goalX)},${Math.round(a.goalY)} (${a.destKind})`,
      czas_w_stanie: a.stateSince.toFixed(2),
      izolowany: a.isolated ? 'tak' : 'nie',
      hospitalizowany: a.hospitalized ? 'tak' : 'nie',
      zarazony_przez: a.infectedBy,
    };
  }
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
