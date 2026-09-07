import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import type { CityRoadNetwork } from '../../world/roadNetwork';
import { entityId, type EntityId, type GroundingLevel, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * TRAFFIC FLOW — a real macroscopic WorldGraph solver on the existing road
 * geometry (`core/world/roadNetwork.ts`), closing part of the gap
 * `capability/solverCapability.ts` named for TRANSPORT_DISRUPTION/EVACUATION:
 * "agents in cityAgent.ts do not interact at all... no fundamental diagram,
 * no capacity, no network assignment".
 *
 * ## What is real here
 *
 * **1. Fundamental diagram — Greenshields (1935).** `v(k) = vf·(1 − k/kj)`,
 * `q(k) = k·v(k)`, the oldest and still most-cited published speed-density
 * relation in traffic flow theory. It gives a concave flow-density curve
 * with a single capacity point at `k = kj/2`.
 *
 * **2. Cell-Transmission Model (Daganzo 1994) via the Godunov/supply-demand
 * scheme (Lebacque 1996).** Every road is discretised into cells sized from
 * `roadNetwork.ts`'s own geometry (`RouteSegment.length`); each cell holds a
 * scalar density and is updated by conservation of vehicles,
 * `k_i(t+Δt) = k_i(t) + (Δt/L_i)(q_{i-1,i} − q_{i,i+1})`, where the
 * inter-cell flow is the real Godunov flux for a concave fundamental
 * diagram: `q = min(demand(k_i), supply(k_{i+1}))`, `demand` the increasing
 * (free-flow) branch of `q(k)` saturating at capacity, `supply` the
 * decreasing (congested) branch. This is what actually produces shockwaves,
 * queue spillback and congestion propagation — not scripted behaviour.
 * Time is sub-stepped internally to satisfy the CFL condition
 * (`Δt ≤ cellLength/vf`) for whatever `dt` the caller passes, so the scheme
 * stays numerically stable regardless of tick rate.
 *
 * **3. Capacity/saturation flow at intersections, from this geometry.**
 * Every grid crossing of `verticalStreetXs`×`horizontalStreetYs` is a real
 * intersection with a real discharge capacity, computed the HCM
 * (Highway Capacity Manual) way for a two-phase signal:
 * `capacity = saturationFlowPerLane · lanes · (g/C)` — the same formula
 * every signal-timing textbook uses. That capacity caps the Godunov flux at
 * the cell boundary nearest the crossing, so a bottleneck at an
 * under-signalled intersection is a real, geometry-located constraint, not
 * a global fudge factor.
 *
 * ## What is deliberately NOT modelled (see `solverCapability.ts`)
 *
 * - **No origin-destination demand or route choice/assignment.** Vehicles
 *   enter as an aggregate boundary demand at the edge of the grid and are
 *   never assigned a destination or a route — there is one uniform demand
 *   knob, not an OD matrix.
 * - **No turning movements.** An intersection's capacity is split between
 *   its two crossing streets (EW vs NS); it does not model left/right turns,
 *   turn pockets or conflicting-movement gap acceptance.
 * - **No calibration.** Free-flow speed, jam density, saturation flow and
 *   signal timing are textbook defaults, not fitted to any measured count
 *   or probe-speed data for any real place.
 * - **Lane counts are a stated default (1 per direction), because
 *   `roadNetwork.ts` geometry does not carry lane counts.**
 * - **No evacuation behaviour** (warning response, departure-time or
 *   destination-choice modelling) — an evacuation surge here is only an
 *   elevated demand multiplier, not a behavioural model.
 */
export const TRAFFIC_FLOW_SOLVER_ID = 'traffic-flow-ctm-greenshields';
export const TRAFFIC_DOMAIN_ID = 'traffic-flow';

// ---------------------------------------------------------------------------
// 1. FUNDAMENTAL DIAGRAM — Greenshields (1935): v = vf(1 - k/kj), q = k*v.
// ---------------------------------------------------------------------------

export interface GreenshieldsParams {
  /** Free-flow speed, m/s. */
  readonly freeFlowSpeedMS: number;
  /** Jam density, vehicles/km per lane. */
  readonly jamDensityVehPerKm: number;
}

/** 50 km/h free-flow, 140 veh/km/lane jam density — textbook urban-arterial values, not a calibration. */
export const DEFAULT_GREENSHIELDS: GreenshieldsParams = Object.freeze({
  freeFlowSpeedMS: 13.89,
  jamDensityVehPerKm: 140,
});

/** Greenshields speed-density relation, clamped to [0, vf]. */
export function greenshieldsSpeedMS(densityVehPerKm: number, p: GreenshieldsParams): number {
  const k = Math.max(0, Math.min(densityVehPerKm, p.jamDensityVehPerKm));
  return p.freeFlowSpeedMS * (1 - k / p.jamDensityVehPerKm);
}

/** Flow q(k) = k*v(k), vehicles/hour. `densityVehPerKm` is per-km; speed is per-second, so convert. */
export function greenshieldsFlowVehPerHour(densityVehPerKm: number, p: GreenshieldsParams): number {
  const k = Math.max(0, Math.min(densityVehPerKm, p.jamDensityVehPerKm));
  const speedKmPerHour = greenshieldsSpeedMS(k, p) * 3.6;
  return k * speedKmPerHour;
}

/** The single density at which q(k) peaks — kj/2 for the symmetric Greenshields parabola. */
export function criticalDensityVehPerKm(p: GreenshieldsParams): number {
  return p.jamDensityVehPerKm / 2;
}

/** q_max = vf*kj/4, the road's theoretical capacity per lane, vehicles/hour. */
export function capacityVehPerHour(p: GreenshieldsParams): number {
  return greenshieldsFlowVehPerHour(criticalDensityVehPerKm(p), p);
}

/**
 * Godunov "demand" (sending) function for a concave fundamental diagram
 * (Lebacque 1996): the increasing branch of q(k), saturating at capacity
 * once density passes critical — a congested cell can still only DISCHARGE
 * at capacity, never at the (lower) q(k) its own density would suggest.
 */
export function sendingFlowVehPerHour(densityVehPerKm: number, p: GreenshieldsParams): number {
  const kc = criticalDensityVehPerKm(p);
  return densityVehPerKm <= kc ? greenshieldsFlowVehPerHour(densityVehPerKm, p) : capacityVehPerHour(p);
}

/**
 * Godunov "supply" (receiving) function: the decreasing branch of q(k),
 * saturating at capacity while density is below critical — a nearly-empty
 * downstream cell can always ACCEPT up to capacity, never more.
 */
export function receivingFlowVehPerHour(densityVehPerKm: number, p: GreenshieldsParams): number {
  const kc = criticalDensityVehPerKm(p);
  return densityVehPerKm >= kc ? greenshieldsFlowVehPerHour(densityVehPerKm, p) : capacityVehPerHour(p);
}

// ---------------------------------------------------------------------------
// 2 & 3. NETWORK GEOMETRY — cells and intersections derived from roadNetwork.ts
// ---------------------------------------------------------------------------

export type LinkOrientation = 'EW' | 'NS';

export interface TrafficCell {
  readonly id: string;
  /** Cell length, metres — derived from dividing the real road segment length. */
  readonly lengthM: number;
  /** Mutable simulation state: vehicles/km on this cell. */
  densityVehPerKm: number;
}

/** A signalised crossing located at an internal cell boundary, derived from the grid geometry. */
export interface IntersectionBoundary {
  readonly boundaryIndex: number;
  readonly intersectionId: string;
}

export interface TrafficLink {
  readonly id: string;
  readonly orientation: LinkOrientation;
  readonly streetIndex: number;
  readonly lanes: number;
  readonly cells: TrafficCell[];
  /** Signalised boundaries strictly between cells 0 and cells.length, sorted by index, from crossing streets in this geometry. */
  readonly intersectionBoundaries: readonly IntersectionBoundary[];
}

export interface TrafficIntersection {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** HCM signalised-intersection capacity for the EW direction, vehicles/hour: saturationFlow * lanes * (g/C). */
  capacityEWVehPerHour: number;
  /** Same, for the NS direction. */
  capacityNSVehPerHour: number;
}

export interface TrafficNetwork {
  readonly links: readonly TrafficLink[];
  readonly intersections: readonly TrafficIntersection[];
  readonly linksById: ReadonlyMap<string, TrafficLink>;
  readonly intersectionsById: ReadonlyMap<string, TrafficIntersection>;
}

/** HCM 2010 default saturation flow rate per through lane, vehicles/hour — a textbook constant, not a fitted value. */
export const SATURATION_FLOW_VEH_PER_HOUR_PER_LANE = 1900;

export interface TrafficNetworkBuildOptions {
  /** Target CTM cell length, metres, before CFL sub-stepping. Smaller = finer resolution, more cells. */
  cellLengthM?: number;
  /** Lanes per direction — `roadNetwork.ts` geometry carries no lane count, so this is a stated default. */
  lanesPerDirection?: number;
  /** Signal cycle length, seconds (HCM `C`). */
  signalCycleS?: number;
  /** Lost time per phase, seconds (HCM). */
  signalLostTimeS?: number;
}

const DEFAULT_BUILD_OPTIONS: Required<TrafficNetworkBuildOptions> = {
  cellLengthM: 30,
  lanesPerDirection: 1,
  signalCycleS: 90,
  signalLostTimeS: 4,
};

function nearestBoundaryIndex(cellBoundariesM: readonly number[], positionM: number): number {
  let best = 1;
  let bestDist = Infinity;
  for (let i = 1; i < cellBoundariesM.length - 1; i++) {
    const dist = Math.abs(cellBoundariesM[i] - positionM);
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

/**
 * Builds a CTM network directly from `CityRoadNetwork`'s own street grid
 * (`horizontalStreetYs`/`verticalStreetXs`, the same lines the renderer
 * draws as roads): one link per street, discretised into cells sized from
 * the real span (`0..width` or `0..height`), with a signalised intersection
 * at every crossing with the perpendicular streets — real geometry driving
 * both the CTM discretisation and the capacity constraints, not a
 * hand-authored network.
 */
export function buildTrafficNetwork(roadNetwork: CityRoadNetwork, options: TrafficNetworkBuildOptions = {}): TrafficNetwork {
  const opts = { ...DEFAULT_BUILD_OPTIONS, ...options };
  const links: TrafficLink[] = [];
  const intersections = new Map<string, TrafficIntersection>();

  // Two-phase signal, equal split by default (the grid gives no reason to favour either street):
  // g/C = (C/2 - lostTime)/C, per HCM 2010 ch.18.
  const greenRatio = (opts.signalCycleS / 2 - opts.signalLostTimeS) / opts.signalCycleS;
  const perDirectionCapacity = SATURATION_FLOW_VEH_PER_HOUR_PER_LANE * opts.lanesPerDirection * greenRatio;

  function intersectionAt(x: number, y: number, col: number, row: number): TrafficIntersection {
    const id = `intersection:${col}:${row}`;
    let found = intersections.get(id);
    if (!found) {
      found = { id, x, y, capacityEWVehPerHour: perDirectionCapacity, capacityNSVehPerHour: perDirectionCapacity };
      intersections.set(id, found);
    }
    return found;
  }

  function buildLink(orientation: LinkOrientation, streetIndex: number, spanM: number, crossingPositionsM: readonly number[], crossToId: (crossIndex: number) => { x: number; y: number; col: number; row: number }): TrafficLink {
    const numCells = Math.max(1, Math.round(spanM / opts.cellLengthM));
    const actualCellLengthM = spanM / numCells;
    const cellBoundariesM: number[] = [];
    for (let i = 0; i <= numCells; i++) cellBoundariesM.push(i * actualCellLengthM);

    const cells: TrafficCell[] = [];
    for (let i = 0; i < numCells; i++) {
      cells.push({ id: `${orientation}:${streetIndex}:cell:${i}`, lengthM: actualCellLengthM, densityVehPerKm: 0 });
    }

    const intersectionBoundaries: IntersectionBoundary[] = [];
    if (numCells > 1) {
      for (let c = 0; c < crossingPositionsM.length; c++) {
        const boundaryIndex = nearestBoundaryIndex(cellBoundariesM, crossingPositionsM[c]);
        const { x, y, col, row } = crossToId(c);
        const intersection = intersectionAt(x, y, col, row);
        intersectionBoundaries.push({ boundaryIndex, intersectionId: intersection.id });
      }
    }
    intersectionBoundaries.sort((a, b) => a.boundaryIndex - b.boundaryIndex);

    return {
      id: `${orientation}:${streetIndex}`,
      orientation,
      streetIndex,
      lanes: opts.lanesPerDirection,
      cells,
      intersectionBoundaries,
    };
  }

  // Span each link from the ROAD segment `roadNetwork.ts` already built for this exact street
  // (`road:h:${row}` runs the full 0..width, `road:v:${col}` the full 0..height) — its `length`
  // is real geometry, not a re-derived guess.
  const segmentsById = new Map(roadNetwork.segments.map((s) => [s.segmentId, s]));

  roadNetwork.horizontalStreetYs.forEach((y, row) => {
    const spanM = segmentsById.get(`road:h:${row}`)?.length ?? 0;
    if (spanM <= 0) return;
    links.push(buildLink('EW', row, spanM, roadNetwork.verticalStreetXs, (col) => ({ x: roadNetwork.verticalStreetXs[col], y, col, row })));
  });
  roadNetwork.verticalStreetXs.forEach((x, col) => {
    const spanM = segmentsById.get(`road:v:${col}`)?.length ?? 0;
    if (spanM <= 0) return;
    links.push(buildLink('NS', col, spanM, roadNetwork.horizontalStreetYs, (row) => ({ x, y: roadNetwork.horizontalStreetYs[row], col, row })));
  });

  return {
    links,
    intersections: [...intersections.values()],
    linksById: new Map(links.map((l) => [l.id, l])),
    intersectionsById: intersections,
  };
}

// ---------------------------------------------------------------------------
// CTM TIME STEP — Godunov flux, sub-stepped for the CFL condition.
// ---------------------------------------------------------------------------

export interface TrafficDemandParams {
  /** Aggregate vehicles/hour entering the network at EVERY open boundary link end. No OD structure — see module doc. */
  entryDemandVehPerHour: number;
  /**
   * Network-wide multiplier applied to every intersection's HCM capacity
   * (1 = nominal). Models a blanket capacity loss — e.g. blocked lanes,
   * damaged signals — for TRANSPORT_DISRUPTION. This is a single global
   * knob, not per-link damage.
   */
  capacityMultiplier: number;
  /**
   * Multiplies `entryDemandVehPerHour` to represent a mass-egress surge for
   * EVACUATION. Still just a demand scalar: no departure-time curve, no
   * destination choice.
   */
  evacuationDemandMultiplier: number;
}

export const DEFAULT_TRAFFIC_DEMAND: TrafficDemandParams = Object.freeze({
  entryDemandVehPerHour: 400,
  capacityMultiplier: 1,
  evacuationDemandMultiplier: 1,
});

function directionalIntersectionCapacity(link: TrafficLink, intersection: TrafficIntersection): number {
  return link.orientation === 'EW' ? intersection.capacityEWVehPerHour : intersection.capacityNSVehPerHour;
}

/**
 * Advances every cell of one link by one Godunov/CTM step of `dtHours`.
 * Boundary conditions: the two ends of the link are open — inflow is the
 * lesser of demand and what the first cell can receive; outflow is
 * whatever the last cell can send (a free, always-receptive sink).
 * Internal boundaries near a real intersection are additionally capped by
 * that intersection's HCM capacity (times the disruption multiplier).
 */
function stepLink(link: TrafficLink, network: TrafficNetwork, fd: GreenshieldsParams, dtHours: number, demand: TrafficDemandParams): void {
  const n = link.cells.length;
  const flux = new Array<number>(n + 1);
  const effectiveDemandVehPerHour = demand.entryDemandVehPerHour * demand.evacuationDemandMultiplier;

  flux[0] = Math.min(effectiveDemandVehPerHour, receivingFlowVehPerHour(link.cells[0].densityVehPerKm, fd));
  flux[n] = sendingFlowVehPerHour(link.cells[n - 1].densityVehPerKm, fd);

  const boundaryCap = new Map<number, number>();
  for (const b of link.intersectionBoundaries) {
    const intersection = network.intersectionsById.get(b.intersectionId);
    if (!intersection) continue;
    boundaryCap.set(b.boundaryIndex, directionalIntersectionCapacity(link, intersection) * demand.capacityMultiplier);
  }

  for (let i = 1; i < n; i++) {
    const base = Math.min(sendingFlowVehPerHour(link.cells[i - 1].densityVehPerKm, fd), receivingFlowVehPerHour(link.cells[i].densityVehPerKm, fd));
    const cap = boundaryCap.get(i);
    flux[i] = cap === undefined ? base : Math.min(base, cap);
  }

  for (let i = 0; i < n; i++) {
    const cell = link.cells[i];
    const lengthKm = cell.lengthM / 1000;
    const next = cell.densityVehPerKm + (dtHours / lengthKm) * (flux[i] - flux[i + 1]);
    cell.densityVehPerKm = Math.max(0, Math.min(next, fd.jamDensityVehPerKm));
  }
}

export interface TrafficStepSummary {
  readonly meanDensityVehPerKm: number;
  readonly meanSpeedMS: number;
  readonly maxDensityVehPerKm: number;
  readonly totalVehicles: number;
  readonly congestedCellFraction: number;
}

/**
 * One full network step of `dtSeconds`, internally sub-stepped so every
 * link respects its own CFL bound `subDt ≤ cellLength/vf` — required for
 * the Godunov scheme above to be stable and non-diffusive beyond the
 * scheme's own numerical viscosity, whatever tick rate the caller uses.
 */
export function stepTrafficNetwork(network: TrafficNetwork, fd: GreenshieldsParams, dtSeconds: number, demand: TrafficDemandParams): TrafficStepSummary {
  const minCellLengthM = network.links.reduce((min, link) => link.cells.reduce((m, c) => Math.min(m, c.lengthM), min), Infinity);
  const cflLimitS = Number.isFinite(minCellLengthM) && fd.freeFlowSpeedMS > 0 ? minCellLengthM / fd.freeFlowSpeedMS : dtSeconds;
  const substeps = Math.max(1, Math.ceil(dtSeconds / cflLimitS));
  const subDtSeconds = dtSeconds / substeps;
  const subDtHours = subDtSeconds / 3600;

  for (let s = 0; s < substeps; s++) {
    for (const link of network.links) stepLink(link, network, fd, subDtHours, demand);
  }

  return summarizeTrafficNetwork(network, fd);
}

export function summarizeTrafficNetwork(network: TrafficNetwork, fd: GreenshieldsParams): TrafficStepSummary {
  const kc = criticalDensityVehPerKm(fd);
  let totalLengthKm = 0;
  let weightedDensity = 0;
  let weightedSpeed = 0;
  let maxDensity = 0;
  let totalVehicles = 0;
  let congestedLengthKm = 0;
  let cellCount = 0;

  for (const link of network.links) {
    for (const cell of link.cells) {
      const lengthKm = cell.lengthM / 1000;
      totalLengthKm += lengthKm;
      weightedDensity += cell.densityVehPerKm * lengthKm;
      weightedSpeed += greenshieldsSpeedMS(cell.densityVehPerKm, fd) * lengthKm;
      totalVehicles += cell.densityVehPerKm * lengthKm;
      if (cell.densityVehPerKm > maxDensity) maxDensity = cell.densityVehPerKm;
      if (cell.densityVehPerKm > kc) congestedLengthKm += lengthKm;
      cellCount += 1;
    }
  }

  if (totalLengthKm === 0 || cellCount === 0) {
    return { meanDensityVehPerKm: 0, meanSpeedMS: fd.freeFlowSpeedMS, maxDensityVehPerKm: 0, totalVehicles: 0, congestedCellFraction: 0 };
  }

  return {
    meanDensityVehPerKm: weightedDensity / totalLengthKm,
    meanSpeedMS: weightedSpeed / totalLengthKm,
    maxDensityVehPerKm: maxDensity,
    totalVehicles,
    congestedCellFraction: congestedLengthKm / totalLengthKm,
  };
}

// ---------------------------------------------------------------------------
// ECS BINDING — one entity for the whole network; per-cell state lives in the
// closure (same pattern as floodInundation.ts's terrain), scalar knobs and
// aggregate outputs travel through domainState.
// ---------------------------------------------------------------------------

export interface TrafficWorldDomainState extends Record<string, number> {
  entryDemandVehPerHour: number;
  capacityMultiplier: number;
  evacuationDemandMultiplier: number;
  meanDensityVehPerKm: number;
  meanSpeedMS: number;
  maxDensityVehPerKm: number;
  totalVehicles: number;
  congestedCellFraction: number;
  freeFlowSpeedMS: number;
  jamDensityVehPerKm: number;
  capacityVehPerHourPerLane: number;
  linkCount: number;
  intersectionCount: number;
}

let stepCounter = 0;

/**
 * One reusable solver bound to one real `TrafficNetwork` instance (built by
 * `buildTrafficNetwork` from the world's own road geometry). `dt` is
 * expected in seconds, like the network's own physical units (m/s speeds,
 * metre cell lengths) — pass a per-solver `dt` override via
 * `SolverRouter.routeTick`'s `dtBySolverId` if the world's tick otherwise
 * runs in a different unit.
 */
export function makeTrafficFlowSolver(network: TrafficNetwork, fd: GreenshieldsParams = DEFAULT_GREENSHIELDS): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<TrafficWorldDomainState> | undefined;
    const demand: TrafficDemandParams = {
      entryDemandVehPerHour: state?.entryDemandVehPerHour ?? DEFAULT_TRAFFIC_DEMAND.entryDemandVehPerHour,
      capacityMultiplier: state?.capacityMultiplier ?? DEFAULT_TRAFFIC_DEMAND.capacityMultiplier,
      evacuationDemandMultiplier: state?.evacuationDemandMultiplier ?? DEFAULT_TRAFFIC_DEMAND.evacuationDemandMultiplier,
    };

    const summary = stepTrafficNetwork(network, fd, ctx.dt, demand);
    stepCounter += 1;

    const domainState: TrafficWorldDomainState = {
      entryDemandVehPerHour: demand.entryDemandVehPerHour,
      capacityMultiplier: demand.capacityMultiplier,
      evacuationDemandMultiplier: demand.evacuationDemandMultiplier,
      meanDensityVehPerKm: summary.meanDensityVehPerKm,
      meanSpeedMS: summary.meanSpeedMS,
      maxDensityVehPerKm: summary.maxDensityVehPerKm,
      totalVehicles: summary.totalVehicles,
      congestedCellFraction: summary.congestedCellFraction,
      freeFlowSpeedMS: fd.freeFlowSpeedMS,
      jamDensityVehPerKm: fd.jamDensityVehPerKm,
      capacityVehPerHourPerLane: capacityVehPerHour(fd),
      linkCount: network.links.length,
      intersectionCount: network.intersections.length,
    };

    const observation: Observation = {
      observationId: `traffic-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: mean speed=${summary.meanSpeedMS.toFixed(1)}m/s, mean density=${summary.meanDensityVehPerKm.toFixed(1)}veh/km, ${(summary.congestedCellFraction * 100).toFixed(0)}% of network congested`,
      measurements: [
        { key: 'meanSpeedMS', value: summary.meanSpeedMS, tick: ctx.tick, entity: entity.ref, provenance: ['domains/trafficFlow.ts#greenshieldsSpeedMS'] },
        { key: 'meanDensityVehPerKm', value: summary.meanDensityVehPerKm, tick: ctx.tick, entity: entity.ref, provenance: ['domains/trafficFlow.ts#stepTrafficNetwork'] },
        { key: 'congestedCellFraction', value: summary.congestedCellFraction, tick: ctx.tick, entity: entity.ref, provenance: ['domains/trafficFlow.ts#summarizeTrafficNetwork'] },
      ],
      provenance: ['domains/trafficFlow.ts', 'greenshields-1935', 'cell-transmission-model-daganzo-1994', 'godunov-scheme-lebacque-1996', 'hcm-signalized-intersection-capacity'],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `traffic-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'traffic.flow.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'ctm-godunov-step',
      parameters: { ...demand, ...summary },
      provenance: {
        origin: 'model',
        modelId: TRAFFIC_FLOW_SOLVER_ID,
        notes: 'Greenshields fundamental diagram + Godunov/CTM network update + HCM intersection capacity. No OD demand, no route choice, no calibration.',
      },
    };

    return {
      patch: {
        domainState,
        statusLabel: `${summary.meanSpeedMS.toFixed(1)}m/s mean, ${(summary.congestedCellFraction * 100).toFixed(0)}% congested`,
      },
      // Real published FD + real Godunov/CTM numerics + geometry-derived capacity — but lane
      // counts, signal timing and demand are stated textbook defaults, not measured/calibrated:
      // the honest middle ground between an exact solver and an uncalibrated heuristic.
      grounding: 'MODEL_ESTIMATE' as GroundingLevel,
      observation,
      event,
    };
  };
}

export interface AddTrafficNetworkOptions {
  networkId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<TrafficDemandParams>;
  fd?: GreenshieldsParams;
}

export function addTrafficNetworkEntity(graph: WorldGraph, network: TrafficNetwork, options: AddTrafficNetworkOptions = {}): EntityId {
  const ref = { kind: 'traffic-network', id: options.networkId ?? 'traffic-network-1' };
  const demand: TrafficDemandParams = { ...DEFAULT_TRAFFIC_DEMAND, ...options.params };
  const fd = options.fd ?? DEFAULT_GREENSHIELDS;
  const summary = summarizeTrafficNetwork(network, fd);
  const domainState: TrafficWorldDomainState = {
    entryDemandVehPerHour: demand.entryDemandVehPerHour,
    capacityMultiplier: demand.capacityMultiplier,
    evacuationDemandMultiplier: demand.evacuationDemandMultiplier,
    meanDensityVehPerKm: summary.meanDensityVehPerKm,
    meanSpeedMS: summary.meanSpeedMS,
    maxDensityVehPerKm: summary.maxDensityVehPerKm,
    totalVehicles: summary.totalVehicles,
    congestedCellFraction: summary.congestedCellFraction,
    freeFlowSpeedMS: fd.freeFlowSpeedMS,
    jamDensityVehPerKm: fd.jamDensityVehPerKm,
    capacityVehPerHourPerLane: capacityVehPerHour(fd),
    linkCount: network.links.length,
    intersectionCount: network.intersections.length,
  };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Traffic Network',
    scale: { level: 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState,
    domainBinding: { solverId: TRAFFIC_FLOW_SOLVER_ID, domainId: TRAFFIC_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface TrafficWorldOptions {
  cityId?: string;
  buildOptions?: TrafficNetworkBuildOptions;
  fd?: GreenshieldsParams;
  params?: Partial<TrafficDemandParams>;
}

export interface TrafficWorld {
  graph: WorldGraph;
  cityEntityId: EntityId;
  trafficNetworkId: EntityId;
  network: TrafficNetwork;
}

/** Standalone scenario: a city container (MACRO_CITY) with one traffic network bound to the real CTM solver, built from the given road geometry. */
export function buildTrafficWorld(graph: WorldGraph, roadNetwork: CityRoadNetwork, options: TrafficWorldOptions = {}): TrafficWorld {
  const cityRef = { kind: 'city', id: options.cityId ?? roadNetwork.mapId };
  let cityEntityId: EntityId;
  if (graph.has(entityId(cityRef))) {
    cityEntityId = entityId(cityRef);
  } else {
    const city: WorldModelEntity = {
      id: entityId(cityRef),
      ref: cityRef,
      label: 'City',
      scale: { level: 'MACRO_CITY' },
      spatial: { position: { x: 0, y: 0, z: 0 } },
      grounding: 'UNGROUNDED_APPROXIMATION', // a container, not something any solver advances directly
      updatedAtTick: 0,
    };
    graph.addEntity(city);
    cityEntityId = city.id;
  }

  const network = buildTrafficNetwork(roadNetwork, options.buildOptions);
  const trafficNetworkId = addTrafficNetworkEntity(graph, network, { parentEntityId: cityEntityId, params: options.params, fd: options.fd });
  return { graph, cityEntityId, trafficNetworkId, network };
}
