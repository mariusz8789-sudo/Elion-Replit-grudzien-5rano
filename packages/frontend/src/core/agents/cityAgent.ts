import type { SimAgent } from '../simulation/types';
import type { CityLayout, BuildingKind } from '../world/cityWorld';
import { homeIndices, pointInBuilding } from '../world/cityWorld';
import type { InterventionEffects } from '../interventions/interventions';

/**
 * CITY AGENT — agent jako pełny obiekt symulacji: dom, cel, zachowanie, liczniki
 * epidemiologiczne. Ruch jest CELOWY (dom → sklep/szkoła/park → dom), a
 * interwencje realnie zmieniają wybory (mobilność, zamknięte obiekty, izolacja).
 * Rozszerza SimAgent o pola wewnętrzne, których renderer nie potrzebuje.
 */
export interface CityAgent extends SimAgent {
  homeIdx: number;
  destIdx: number;
  destKind: BuildingKind | 'home';
  dwell: number;        // pozostały czas postoju w celu [dni]
  exposedAt: number;    // dzień wejścia w E
  infectedAt: number;   // dzień wejścia w I
}

const ROLES = ['uczeń', 'pracownik', 'senior', 'rodzic', 'sprzedawca', 'lekarz'];

/** Deterministyczny wiek/rola z RNG (cecha „ludzka" agenta do inspekcji). */
function assignPerson(rng: () => number): { age: number; role: string } {
  const role = ROLES[Math.floor(rng() * ROLES.length)];
  const age = role === 'uczeń' ? 6 + Math.floor(rng() * 12)
    : role === 'senior' ? 65 + Math.floor(rng() * 25)
    : 20 + Math.floor(rng() * 45);
  return { age, role };
}

export interface SpawnParams {
  nAgents: number;
  initialInfected: number;
}

/** Rozstawia agentów w domach; kilku zaszczepionych jako ognisko (deterministycznie). */
export function spawnAgents(layout: CityLayout, p: SpawnParams, rng: () => number): CityAgent[] {
  const homes = homeIndices(layout);
  const n = Math.max(1, Math.round(p.nAgents));
  const agents: CityAgent[] = [];
  for (let i = 0; i < n; i++) {
    const homeIdx = homes[Math.floor(rng() * homes.length)];
    const home = layout.buildings[homeIdx];
    const pos = pointInBuilding(home, rng);
    const person = assignPerson(rng);
    agents.push({
      id: i, x: pos.x, y: pos.y, vx: 0, vy: 0,
      goalX: pos.x, goalY: pos.y,
      state: 'S', stateSince: 0, isolated: false, behavior: 'dom', infectedBy: -1,
      age: person.age, role: person.role, hospitalized: false, gait: rng() * Math.PI * 2,
      homeIdx, destIdx: homeIdx, destKind: 'home', dwell: rng() * 0.5,
      exposedAt: -1, infectedAt: -1,
    });
  }
  const seed = Math.max(1, Math.min(n, Math.round(p.initialInfected)));
  for (let i = 0; i < seed; i++) {
    const a = agents[Math.floor(rng() * n)];
    a.state = 'I'; a.infectedAt = 0; a.behavior = 'zakażony';
  }
  return agents;
}

const PUBLIC_KINDS: BuildingKind[] = ['shop', 'school', 'park', 'shop', 'park'];

/**
 * Wybiera nowy cel dla agenta z uwzględnieniem interwencji:
 * - mobilność: przy niskiej szansie agent zostaje/wraca do domu,
 * - zamknięte typy budynków są pomijane,
 * - izolowani zawsze celują w izolatkę.
 */
export function chooseDestination(a: CityAgent, layout: CityLayout, eff: InterventionEffects, rng: () => number): void {
  if (a.isolated) {
    const iso = firstOfKind(layout, 'isolation');
    if (iso >= 0) { setDest(a, layout, iso, 'isolation', rng); a.behavior = 'izolacja'; return; }
  }
  // Mobilność: czy w ogóle wyruszać z domu w miasto?
  const goOut = rng() < eff.mobilityScale;
  if (!goOut) { setDest(a, layout, a.homeIdx, 'home', rng); a.behavior = 'dom'; return; }
  // Wybierz publiczny cel, pomijając zamknięte typy.
  const options = PUBLIC_KINDS.filter((k) => !eff.closedKinds.has(k));
  if (options.length === 0) { setDest(a, layout, a.homeIdx, 'home', rng); a.behavior = 'dom'; return; }
  const kind = options[Math.floor(rng() * options.length)];
  const idx = firstOfKind(layout, kind, rng);
  if (idx < 0) { setDest(a, layout, a.homeIdx, 'home', rng); a.behavior = 'dom'; return; }
  setDest(a, layout, idx, kind, rng);
  a.behavior = kind === 'shop' ? 'sklep' : kind === 'school' ? 'szkoła' : 'park';
}

function setDest(a: CityAgent, layout: CityLayout, idx: number, kind: BuildingKind | 'home', rng: () => number): void {
  const bl = layout.buildings[idx];
  const pt = pointInBuilding(bl, rng);
  a.destIdx = idx; a.destKind = kind; a.goalX = pt.x; a.goalY = pt.y;
}

function firstOfKind(layout: CityLayout, kind: BuildingKind, rng?: () => number): number {
  const idxs: number[] = [];
  layout.buildings.forEach((bl, i) => { if (bl.kind === kind) idxs.push(i); });
  if (idxs.length === 0) return -1;
  return rng ? idxs[Math.floor(rng() * idxs.length)] : idxs[0];
}

/** Ruch w stronę celu ze stałym krokiem. Zwraca true po dotarciu. `speed` w px/dzień. */
export function stepMovement(a: CityAgent, dt: number, speed: number): boolean {
  const dx = a.goalX - a.x, dy = a.goalY - a.y;
  const dist = Math.hypot(dx, dy);
  const stepLen = speed * dt;
  if (dist <= stepLen || dist < 0.5) {
    a.x = a.goalX; a.y = a.goalY; a.vx = 0; a.vy = 0; return true;
  }
  a.vx = (dx / dist) * speed; a.vy = (dy / dist) * speed;
  a.x += (dx / dist) * stepLen; a.y += (dy / dist) * stepLen;
  // Faza chodu rośnie z pokonanym dystansem → animacja nóg wynika z RUCHU modelu.
  a.gait = ((a.gait ?? 0) + stepLen * 0.5) % (Math.PI * 2);
  return false;
}
