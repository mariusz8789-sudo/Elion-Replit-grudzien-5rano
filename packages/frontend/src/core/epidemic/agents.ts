/**
 * Silnik AGENTOWY (agent-based / individual-based) epidemii — PRIORYTET 1.
 *
 * To NIE jest drugi, równoległy system: to rozszerzenie tej samej rodziny modeli
 * epidemicznych co core/epidemic/sir.ts. Tam populacja jest ciągła (ODE, RK4);
 * tutaj każdy osobnik jest jawnym agentem na planie LOTNISKA, a zakażenie
 * przenosi się przez KONTAKTY przestrzenne (bliskość), nie przez uśrednione λ.
 * Dzięki temu widać zjawiska, których model przedziałowy nie pokazuje:
 * superroznosiciele w kolejce do kontroli, wpływ izolacji objawowych,
 * ogniska lokalne. Oba modele używają tych samych parametrów (R0, czas
 * inkubacji/zakaźności, IFR), więc można je porównywać (PRIORYTET 5).
 *
 * Model jest STOCHASTYCZNY, ale DETERMINISTYCZNY przy ustalonym ziarnie (seed) —
 * to warunek testowalności (те same wejścia → ta sama trajektoria).
 *
 * WAŻNE (bezpieczeństwo i uczciwość): agenci to WIRTUALNE punkty modelu, NIE
 * realni ludzie; patogen jest ABSTRAKCYJNY („Pathogen X"); to symulacja
 * EDUKACYJNA, nie prognoza rzeczywistej epidemii.
 */

export type AgentState = 'S' | 'E' | 'I' | 'R' | 'D';
/** Widoczne zachowanie proceduralne (tylko warstwa wizualna/ruchu). */
export type Behavior = 'walk' | 'wait' | 'talk' | 'phone' | 'queue' | 'board';

/** Rola strefy lotniska — steruje trasą agenta i gęstością kontaktów. */
export type ZoneRole = 'arrivals' | 'security' | 'concourse' | 'gate' | 'isolation';

export interface Zone {
  role: ZoneRole;
  /** Prostokąt w znormalizowanych współrzędnych 0..1. */
  x: number; y: number; w: number; h: number;
  label: string;
}

export interface Agent {
  id: number;
  x: number; y: number;      // pozycja 0..1
  tx: number; ty: number;    // cel ruchu 0..1
  state: AgentState;
  behavior: Behavior;
  /** Indeks etapu podróży (arrivals→security→concourse→gate→board→recykling). */
  leg: number;
  /** Licznik czasu bieżącego zachowania [dni]. */
  behaviorTimer: number;
  /** Dzień wejścia do E / I (dla przejść stanów). */
  exposedAt: number;
  infectedAt: number;
  /** Czy odizolowany (wykryty objawowy → nie zaraża, przeniesiony do izolatki). */
  isolated: boolean;
}

export interface AgentParams {
  nAgents: number;
  /** R0 — steruje szybkością transmisji na kontakt (β = R0/D_zak). */
  r0: number;
  infectiousDays: number;
  incubationDays: number;
  /** Śmiertelność zakażeń IFR [0..1]. */
  ifr: number;
  /** Promień kontaktu (bliskość zakażenia) w jednostkach 0..1. */
  contactRadius: number;
  /** Izolacja objawowych: po wykryciu agent trafia do izolatki i nie zaraża. */
  isolationEnabled: boolean;
  /** Opóźnienie wykrycia objawów [dni] od wejścia do stanu I. */
  isolationDelayDays: number;
  /** Skuteczność wykrywania [0..1] — jaka część objawowych zostaje złapana. */
  isolationEffectiveness: number;
  /** Ziarno RNG — determinizm dla testów. */
  seed: number;
}

export interface AgentCounts { S: number; E: number; I: number; R: number; D: number; isolated: number }

export const DEFAULT_AGENT_PARAMS: AgentParams = {
  nAgents: 300,
  r0: 3,
  infectiousDays: 6,
  incubationDays: 3,
  ifr: 0.01,
  contactRadius: 0.02,
  isolationEnabled: false,
  isolationDelayDays: 2,
  isolationEffectiveness: 0.7,
  seed: 12345,
};

/** Deterministyczny generator liczb pseudolosowych (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Statyczny plan lotniska (strefy) — znormalizowany 0..1. */
export const AIRPORT_ZONES: Zone[] = [
  { role: 'arrivals',  x: 0.03, y: 0.62, w: 0.22, h: 0.34, label: 'Przyloty' },
  { role: 'security',  x: 0.30, y: 0.40, w: 0.16, h: 0.55, label: 'Kontrola' },
  { role: 'concourse', x: 0.50, y: 0.10, w: 0.30, h: 0.85, label: 'Terminal' },
  { role: 'gate',      x: 0.83, y: 0.20, w: 0.14, h: 0.65, label: 'Bramki' },
  { role: 'isolation', x: 0.03, y: 0.06, w: 0.22, h: 0.34, label: 'Izolatka' },
];

/** Kolejność etapów podróży (indeksy do AIRPORT_ZONES bez izolatki). */
const JOURNEY: ZoneRole[] = ['arrivals', 'security', 'concourse', 'gate'];

function zoneByRole(role: ZoneRole): Zone {
  return AIRPORT_ZONES.find((z) => z.role === role)!;
}

function pointInZone(z: Zone, rng: () => number): { x: number; y: number } {
  return { x: z.x + rng() * z.w, y: z.y + rng() * z.h };
}

const BEHAVIORS_IDLE: Behavior[] = ['wait', 'talk', 'phone'];

export class AgentWorld {
  readonly params: AgentParams;
  agents: Agent[] = [];
  day = 0;
  private rng: () => number;
  private counts: AgentCounts = { S: 0, E: 0, I: 0, R: 0, D: 0, isolated: 0 };
  private peakInfected = 0;

  constructor(params: Partial<AgentParams> = {}) {
    this.params = { ...DEFAULT_AGENT_PARAMS, ...params };
    this.rng = makeRng(this.params.seed);
    this.seed();
  }

  /** β na kontakt-dzień z R0 (jak w modelu przedziałowym: β = R0/D_zak). */
  private beta(): number {
    return this.params.r0 / Math.max(1e-6, this.params.infectiousDays);
  }

  seed(): void {
    this.rng = makeRng(this.params.seed);
    this.day = 0;
    this.peakInfected = 0;
    const n = Math.max(1, Math.round(this.params.nAgents));
    this.agents = [];
    for (let i = 0; i < n; i++) {
      const leg = Math.floor(this.rng() * JOURNEY.length);
      const z = zoneByRole(JOURNEY[leg]);
      const p = pointInZone(z, this.rng);
      const t = pointInZone(z, this.rng);
      this.agents.push({
        id: i, x: p.x, y: p.y, tx: t.x, ty: t.y,
        state: 'S', behavior: 'walk', leg,
        behaviorTimer: this.rng() * 0.5,
        exposedAt: -1, infectedAt: -1, isolated: false,
      });
    }
    // Zaszczep kilku zakażonych (I) — ognisko startowe.
    const seedInfected = Math.max(1, Math.round(n * 0.02));
    for (let i = 0; i < seedInfected; i++) {
      const a = this.agents[Math.floor(this.rng() * n)];
      a.state = 'I'; a.infectedAt = 0;
    }
    this.recount();
  }

  reset(): void { this.seed(); }

  private recount(): void {
    const c: AgentCounts = { S: 0, E: 0, I: 0, R: 0, D: 0, isolated: 0 };
    for (const a of this.agents) {
      c[a.state]++;
      if (a.isolated) c.isolated++;
    }
    this.counts = c;
    const infectious = c.I;
    if (infectious > this.peakInfected) this.peakInfected = infectious;
  }

  /** Krok symulacji o dt [dni]. Ruch proceduralny + kontakty + progresja choroby. */
  step(dt: number): void {
    this.day += dt;
    this.moveAgents(dt);
    this.transmit(dt);
    this.progressDisease();
    this.recount();
  }

  private moveAgents(dt: number): void {
    const speed = 0.55; // jednostki 0..1 na dzień
    for (const a of this.agents) {
      if (a.state === 'D') continue;
      if (a.isolated) {
        // W izolatce agent tylko dryfuje w obrębie izolatki.
        this.steer(a, dt, speed * 0.4);
        a.behavior = 'wait';
        continue;
      }
      a.behaviorTimer -= dt;
      if (a.behavior === 'walk') {
        const arrived = this.steer(a, dt, speed);
        if (arrived) {
          // Po dotarciu do celu: albo idź dalej w podróży, albo chwila bezczynności.
          if (this.rng() < 0.5) {
            a.behavior = BEHAVIORS_IDLE[Math.floor(this.rng() * BEHAVIORS_IDLE.length)];
            a.behaviorTimer = 0.15 + this.rng() * 0.5;
          } else {
            this.advanceLeg(a);
          }
        }
      } else {
        // Bezczynność (czeka / rozmawia / telefon) — kończy się i rusza dalej.
        if (a.behaviorTimer <= 0) {
          this.advanceLeg(a);
        }
      }
    }
  }

  /** Rusz agenta do (tx,ty). Zwraca true, gdy dotarł. */
  private steer(a: Agent, dt: number, speed: number): boolean {
    const dx = a.tx - a.x, dy = a.ty - a.y;
    const dist = Math.hypot(dx, dy);
    const stepLen = speed * dt;
    if (dist <= stepLen || dist < 1e-4) { a.x = a.tx; a.y = a.ty; return true; }
    a.x += (dx / dist) * stepLen;
    a.y += (dy / dist) * stepLen;
    return false;
  }

  private advanceLeg(a: Agent): void {
    a.leg = (a.leg + 1) % JOURNEY.length; // pętla: po bramce znów przyloty (recykling populacji)
    const z = zoneByRole(JOURNEY[a.leg]);
    const t = pointInZone(z, this.rng);
    a.tx = t.x; a.ty = t.y;
    a.behavior = 'walk'; // etykieta kolejki/boarding wynika ze strefy w warstwie renderu
  }

  /** Transmisja przez kontakty przestrzenne (siatka przestrzenna → O(n)). */
  private transmit(dt: number): void {
    const R = this.params.contactRadius;
    const beta = this.beta();
    // per-kontakt prawdopodobieństwo zakażenia na krok (proces Poissona).
    const pInfect = 1 - Math.exp(-beta * dt);
    if (pInfect <= 0) return;

    // Siatka przestrzenna o boku R.
    const cell = Math.max(1e-3, R);
    const grid = new Map<number, number[]>();
    const key = (cx: number, cy: number) => cx * 100000 + cy;
    const infectious: Agent[] = [];
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a.state === 'D' || a.isolated) continue;
      const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
      const k = key(cx, cy);
      let bucket = grid.get(k); if (!bucket) { bucket = []; grid.set(k, bucket); }
      bucket.push(i);
      if (a.state === 'I') infectious.push(a);
    }
    const R2 = R * R;
    // Dla każdego zakaźnego sprawdź podatnych w sąsiednich komórkach.
    for (const src of infectious) {
      const cx = Math.floor(src.x / cell), cy = Math.floor(src.y / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(key(cx + ox, cy + oy));
          if (!bucket) continue;
          for (const j of bucket) {
            const tgt = this.agents[j];
            if (tgt.state !== 'S') continue;
            const dx = tgt.x - src.x, dy = tgt.y - src.y;
            if (dx * dx + dy * dy > R2) continue;
            if (this.rng() < pInfect) {
              tgt.state = 'E';
              tgt.exposedAt = this.day;
            }
          }
        }
      }
    }
  }

  private progressDisease(): void {
    const { incubationDays, infectiousDays, ifr, isolationEnabled, isolationDelayDays, isolationEffectiveness } = this.params;
    for (const a of this.agents) {
      if (a.state === 'E' && this.day - a.exposedAt >= incubationDays) {
        a.state = 'I'; a.infectedAt = this.day;
        // Próba wykrycia i izolacji przy pojawieniu się objawów (z opóźnieniem obsłużonym niżej).
      }
      if (a.state === 'I') {
        // Izolacja objawowych po opóźnieniu wykrycia.
        if (isolationEnabled && !a.isolated && this.day - a.infectedAt >= isolationDelayDays) {
          if (this.rng() < isolationEffectiveness) {
            a.isolated = true;
            const iso = zoneByRole('isolation');
            const p = pointInZone(iso, this.rng);
            a.x = p.x; a.y = p.y; a.tx = p.x; a.ty = p.y;
          }
        }
        // Zejście ze stanu zakaźnego po okresie zakaźności → R lub D (wg IFR).
        if (this.day - a.infectedAt >= infectiousDays) {
          if (this.rng() < ifr) { a.state = 'D'; }
          else { a.state = 'R'; a.isolated = false; }
        }
      }
    }
  }

  getCounts(): AgentCounts { return { ...this.counts }; }
  getPeakInfected(): number { return this.peakInfected; }
  /** Suma S+E+I+R+D — inwariant (stała populacja). */
  total(): number { const c = this.counts; return c.S + c.E + c.I + c.R + c.D; }
}
