import { analyseTransmissionClusters, type TransmissionCluster } from '../contacts/clusterAnalysis';
import { CONTACT_NETWORK_NOT_MODELED, type HouseholdView, type TransmissionEdge } from '../contacts/contactNetwork';
import type { EpidemicCitySimulation } from './epidemicCity';
import type { TransmissionEvent } from './types';
import { interventionEffects } from '../interventions/interventions';
import { evaluateHospitalState, DEFAULT_HOSPITAL_CAPACITY, type HospitalCapacityParams, type HospitalState } from './hospitalResource';
import type { RouteSegment } from '../world/roadNetwork';

/**
 * WORLD ENGINE CONTRACT — stabilny, READ-ONLY widok świata dla World Engine
 * (właściciel: Manus).
 *
 * DLACZEGO ISTNIEJE
 * Dotąd konsument dostawał surowy obiekt `EpidemicCitySimulation`. To nie jest
 * kontrakt: renderer sprzęgał się z klasą symulacji, jej metodami i wewnętrznymi
 * nazwami pól, i mógł sięgnąć po wszystko — łącznie z mutacją stanu.
 *
 * ZASADY
 *  - Wyłącznie ODCZYT. Ten kontrakt nie eksponuje żadnej metody zmieniającej stan.
 *  - Jedno źródło prawdy. Wszystkie liczby pochodzą z modelu; nic nie jest tu
 *    doliczane poza jawnie zadeklarowaną warstwą szpitalną.
 *  - Brak drugiego World State — to jest PROJEKCJA istniejącego świata, a nie
 *    jego kopia trzymana równolegle.
 *  - Renderer nigdy nie liczy tych wartości sam.
 *  - Czego model nie liczy, tego nie ma: patrz `notModeled`.
 *
 * POKRYCIE ZAMÓWIONEGO KONTRAKTU
 *  SimulationClock  -> `clock`
 *  AgentState       -> `agents`
 *  LocationState    -> `locations`
 *  TransmissionEvent-> `transmissions` (typ z `./types`, NIE duplikowany)
 *  Hotspot          -> `hotspots`
 *  HospitalState    -> `hospital` (z `./hospitalResource`)
 *  MobilityState    -> `mobility`
 *  ResourceState    -> NOT_MODELED: model nie prowadzi żadnych zapasów ani
 *                      zużycia. Zamiast pustej struktury deklarujemy to
 *                      w `notModeled` — konsument ma pokazać NOT_MODELED.
 *  ScenarioState    -> należy do Scenario Engine; nie jest częścią kadru świata.
 */

export const WORLD_ENGINE_CONTRACT_VERSION = '1.0.0';

export type AgentHealth = 'S' | 'E' | 'I' | 'R' | 'D';

/** Pojedynczy agent w ujęciu konsumenta — bez dostępu do wnętrza symulacji. */
export interface AgentStateView {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  health: AgentHealth;
  isolated: boolean;
  hospitalized: boolean;
  /** Etykieta zachowania z modelu (np. 'szpital', 'izolacja'). */
  behavior: string;
  age?: number;
  role?: string;
}

/** Obiekt świata (budynek/park) — pozycja i stan zamknięcia pochodzą z layoutu. */
export interface LocationStateView {
  kind: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  closed: boolean;
}

/** Zegar naukowy — World Engine nie prowadzi własnego czasu symulacji. */
export interface SimulationClockView {
  day: number;
  /** Liczba agentów, do których odnosi się ten kadr. */
  population: number;
}

/** Stan epidemii w danym kroku — dokładnie to, co raportuje model. */
export interface EpidemicStateView {
  susceptible: number;
  exposed: number;
  infectious: number;
  recovered: number;
  deceased: number;
  isolated: number;
  hospitalized: number;
  peakInfectious: number;
  contacts: number;
}

/** Ognisko przestrzenne wyliczone z realnych pozycji zakażonych agentów. */
export interface HotspotView {
  x: number;
  y: number;
  /** Liczba zakaźnych agentów w komórce siatki. */
  infectious: number;
}

/**
 * Zdarzenie transmisji z ostatniego ticku. Typ jest RE-EKSPORTEM istniejącego
 * `TransmissionEvent` z `./types` — nie tworzymy drugiej definicji tego samego
 * pojęcia.
 */
export type TransmissionEventView = TransmissionEvent;

/**
 * Stan mobilności — wyprowadzony z realnych parametrów modelu i z tej samej
 * funkcji `interventionEffects`, której używa pętla symulacji. Nie jest to
 * osobne, równoległe wyliczenie.
 */
export interface MobilityStateView {
  /** Bazowa chęć wychodzenia z modelu (parametr `mobility`). */
  baseMobility: number;
  /** Poziom restrykcji 0..1 (parametr `restrictions`). */
  restrictionLevel: number;
  /** Mnożnik mobilności wynikający z restrykcji. */
  mobilityScale: number;
  /** Faktyczna mobilność = baseMobility * mobilityScale. */
  effectiveMobility: number;
  /** Mnożnik zaraźliwości na kontakt (maski/dystans). */
  contactTransmissionScale: number;
  /** Typy obiektów zamknięte przez interwencję. */
  closedKinds: readonly string[];
  /** Czy wykryci zakaźni są kierowani do izolacji. */
  isolationEnabled: boolean;
}

/** Read-only topologia tras dostarczana przez World Engine. */
export interface RoutingStateView {
  mapId: string;
  mapVersion: string;
  mapFingerprint: string;
  routeSegments: readonly RouteSegment[];
  providedFields: readonly ['Route.segments', 'Route.segmentType'];
}

/** Krawędź transmisji w ujęciu konsumenta — kopia, nie żywy bufor. */
export type TransmissionEdgeView = TransmissionEdge;

/** Ognisko w ujęciu konsumenta. */
export type TransmissionClusterView = TransmissionCluster;

/** Gospodarstwo domowe w ujęciu konsumenta, wraz z prowenancją rozkładu. */
export interface HouseholdsView {
  calibration: string;
  provenanceNote: string;
  households: readonly HouseholdView[];
  meanSize: number;
}

export interface WorldStateView {
  contractVersion: string;
  clock: SimulationClockView;
  epidemic: EpidemicStateView;
  hospital: HospitalState;
  mobility: MobilityStateView;
  routing: RoutingStateView;
  agents: readonly AgentStateView[];
  locations: readonly LocationStateView[];
  hotspots: readonly HotspotView[];
  transmissions: readonly TransmissionEventView[];
  /**
   * Graf transmisji z typem kontaktu i miejscem. To jest to, co World Engine
   * może pokazać jako „gdzie i jak doszło do zakażenia" — bez liczenia
   * czegokolwiek po swojej stronie.
   */
  transmissionGraph: readonly TransmissionEdgeView[];
  /** Ogniska wyprowadzone z realnych zdarzeń. */
  clusters: {
    household: readonly TransmissionClusterView[];
    location: readonly TransmissionClusterView[];
  };
  /** Gospodarstwa domowe wraz z zastrzeżeniem o pochodzeniu rozkładu. */
  households: HouseholdsView;
  world: { width: number; height: number };
  /** Jawna lista tego, czego model NIE dostarcza — konsument nie ma zgadywać. */
  notModeled: readonly string[];
}

/**
 * Czego rdzeń naukowy dziś NIE modeluje. World Engine musi to pokazywać jako
 * NOT_MODELED, zamiast wypełniać wartościami zastępczymi.
 */
export const WORLD_NOT_MODELED = [
  'vehicle-traffic',       // brak pojazdów w modelu; wizualizacja transportu jest VISUAL_ONLY
  'public-transport-flow', // brak linii, przystanków i pasażerów w modelu
  'animals',               // brak agentów zwierzęcych i transmisji odzwierzęcej
  'workplaces',            // layout ma dom/sklep/szkołę/szpital, nie miejsca pracy
  'weather',
  'resource-stock-levels', // ResourceState: model nie prowadzi zapasów ani zużycia
  'resource-consumption',  // patrz hospitalResource.HOSPITAL_NOT_MODELED
  ...CONTACT_NETWORK_NOT_MODELED,
] as const;

/** Rozmiar komórki siatki hotspotów w jednostkach świata modelu. */
const HOTSPOT_CELL = 60;

/** Agreguje realne pozycje zakaźnych agentów w siatkę — bez wygładzania i bez zmyślania. */
export function computeHotspots(agents: readonly AgentStateView[], cell = HOTSPOT_CELL): HotspotView[] {
  const buckets = new Map<string, HotspotView>();
  for (const a of agents) {
    if (a.health !== 'I') continue;
    const gx = Math.floor(a.x / cell);
    const gy = Math.floor(a.y / cell);
    const key = `${gx}:${gy}`;
    const existing = buckets.get(key);
    if (existing) existing.infectious += 1;
    else buckets.set(key, { x: (gx + 0.5) * cell, y: (gy + 0.5) * cell, infectious: 1 });
  }
  // Malejąco po liczbie zakaźnych: konsument dostaje najgorętsze punkty pierwsze.
  return [...buckets.values()].sort((a, b) => b.infectious - a.infectious || a.x - b.x || a.y - b.y);
}

/** Mobilność wyprowadzona z parametrów modelu tą samą funkcją, co pętla symulacji. */
export function projectMobilityState(params: Record<string, number | boolean>): MobilityStateView {
  const restrictionLevel = Number(params.restrictions) || 0;
  const baseMobility = Number(params.mobility) || 0;
  const effects = interventionEffects({ level: restrictionLevel, isolate: Boolean(params.isolate) });
  return {
    baseMobility,
    restrictionLevel,
    mobilityScale: effects.mobilityScale,
    effectiveMobility: baseMobility * effects.mobilityScale,
    contactTransmissionScale: effects.transmissionScale,
    closedKinds: [...effects.closedKinds].sort(),
    isolationEnabled: effects.isolateInfected,
  };
}

/**
 * Buduje READ-ONLY projekcję świata z żywej symulacji.
 *
 * Nie mutuje modelu i nie zapisuje niczego. Wywołanie jest czyste względem
 * symulacji: ten sam stan modelu zawsze daje ten sam widok.
 */
export function projectWorldState(
  simulation: EpidemicCitySimulation,
  hospitalCapacity: HospitalCapacityParams = DEFAULT_HOSPITAL_CAPACITY,
): WorldStateView {
  const stats = simulation.stats();
  const graph = simulation.transmissionGraph();
  const clusters = analyseTransmissionClusters(graph);
  const households = simulation.households();
  const roadNetwork = simulation.roadNetworkView();
  const agents: AgentStateView[] = simulation.agents().map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    vx: a.vx,
    vy: a.vy,
    health: a.state as AgentHealth,
    isolated: Boolean(a.isolated),
    hospitalized: Boolean(a.hospitalized),
    behavior: a.behavior,
    ...(a.age === undefined ? {} : { age: a.age }),
    ...(a.role === undefined ? {} : { role: a.role }),
  }));

  const locations: LocationStateView[] = simulation.objects().map((o) => ({
    kind: o.kind,
    ...(o.label === undefined ? {} : { label: o.label }),
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.h,
    closed: Boolean(o.closed),
  }));

  return {
    contractVersion: WORLD_ENGINE_CONTRACT_VERSION,
    clock: { day: stats.dzien, population: stats.agenci },
    epidemic: {
      susceptible: stats.S,
      exposed: stats.E,
      infectious: stats.I,
      recovered: stats.R,
      deceased: stats.D,
      isolated: stats.izolowani,
      hospitalized: stats.hospitalizowani,
      peakInfectious: stats.szczyt_I,
      contacts: stats.kontakty,
    },
    hospital: evaluateHospitalState({ day: stats.dzien, hospitalizedNow: stats.hospitalizowani }, hospitalCapacity),
    mobility: projectMobilityState(simulation.getParams()),
    routing: {
      mapId: roadNetwork.mapId,
      mapVersion: roadNetwork.mapVersion,
      mapFingerprint: roadNetwork.mapFingerprint,
      routeSegments: roadNetwork.segments.map((segment) => ({ ...segment, from: { ...segment.from }, to: { ...segment.to } })),
      providedFields: ['Route.segments', 'Route.segmentType'],
    },
    agents,
    locations,
    hotspots: computeHotspots(agents),
    // Kopia listy z modelu: konsument nie może wpłynąć na bufor symulacji.
    transmissions: simulation.lastTransmissions().map((t) => ({ ...t })),
    transmissionGraph: graph.map((e) => ({ ...e })),
    clusters: {
      household: clusters.householdClusters.map((c) => ({ ...c })),
      location: clusters.locationClusters.map((c) => ({ ...c })),
    },
    households: {
      calibration: households.calibration,
      provenanceNote: households.provenanceNote,
      households: households.households.map((h) => ({ ...h })),
      meanSize: households.meanSize,
    },
    world: { width: simulation.worldWidth, height: simulation.worldHeight },
    notModeled: WORLD_NOT_MODELED,
  };
}
