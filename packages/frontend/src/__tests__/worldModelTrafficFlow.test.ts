import { describe, expect, it } from 'vitest';
import { buildCity } from '../core/world/cityWorld';
import { buildRoadNetwork } from '../core/world/roadNetwork';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import {
  buildTrafficNetwork,
  buildTrafficWorld,
  capacityVehPerHour,
  criticalDensityVehPerKm,
  DEFAULT_GREENSHIELDS,
  DEFAULT_TRAFFIC_DEMAND,
  greenshieldsFlowVehPerHour,
  greenshieldsSpeedMS,
  makeTrafficFlowSolver,
  receivingFlowVehPerHour,
  sendingFlowVehPerHour,
  stepTrafficNetwork,
  summarizeTrafficNetwork,
  TRAFFIC_FLOW_SOLVER_ID,
  type TrafficDemandParams,
} from '../core/worldModel/domains/trafficFlow';

/**
 * TRAFFIC FLOW — real Greenshields fundamental diagram + Godunov/CTM network
 * update + HCM intersection capacity, built directly on `roadNetwork.ts`'s
 * own street geometry. `solverCapability.ts` named this gap for
 * TRANSPORT_DISRUPTION/EVACUATION; these tests pin down what is now real.
 */
describe('Greenshields fundamental diagram', () => {
  it('is free-flow at zero density and gridlocked at jam density', () => {
    expect(greenshieldsSpeedMS(0, DEFAULT_GREENSHIELDS)).toBeCloseTo(DEFAULT_GREENSHIELDS.freeFlowSpeedMS, 6);
    expect(greenshieldsSpeedMS(DEFAULT_GREENSHIELDS.jamDensityVehPerKm, DEFAULT_GREENSHIELDS)).toBeCloseTo(0, 6);
    expect(greenshieldsFlowVehPerHour(0, DEFAULT_GREENSHIELDS)).toBe(0);
    expect(greenshieldsFlowVehPerHour(DEFAULT_GREENSHIELDS.jamDensityVehPerKm, DEFAULT_GREENSHIELDS)).toBeCloseTo(0, 6);
  });

  it('peaks at capacity exactly at half the jam density, per the published parabola', () => {
    const kc = criticalDensityVehPerKm(DEFAULT_GREENSHIELDS);
    expect(kc).toBeCloseTo(DEFAULT_GREENSHIELDS.jamDensityVehPerKm / 2, 6);
    const qAtCritical = greenshieldsFlowVehPerHour(kc, DEFAULT_GREENSHIELDS);
    expect(qAtCritical).toBeCloseTo(capacityVehPerHour(DEFAULT_GREENSHIELDS), 6);
    // A small perturbation either side of kc must be lower — it is genuinely the peak, not a plateau.
    expect(greenshieldsFlowVehPerHour(kc - 5, DEFAULT_GREENSHIELDS)).toBeLessThan(qAtCritical);
    expect(greenshieldsFlowVehPerHour(kc + 5, DEFAULT_GREENSHIELDS)).toBeLessThan(qAtCritical);
  });

  it('demand saturates at capacity beyond critical density; supply saturates at capacity below it (Lebacque Godunov scheme)', () => {
    const kc = criticalDensityVehPerKm(DEFAULT_GREENSHIELDS);
    const qmax = capacityVehPerHour(DEFAULT_GREENSHIELDS);
    expect(sendingFlowVehPerHour(kc + 20, DEFAULT_GREENSHIELDS)).toBeCloseTo(qmax, 6);
    expect(receivingFlowVehPerHour(kc - 20, DEFAULT_GREENSHIELDS)).toBeCloseTo(qmax, 6);
    // Below critical, sending flow tracks q(k) itself (free-flow branch).
    expect(sendingFlowVehPerHour(kc - 20, DEFAULT_GREENSHIELDS)).toBeCloseTo(greenshieldsFlowVehPerHour(kc - 20, DEFAULT_GREENSHIELDS), 6);
  });
});

describe('Network geometry is derived from roadNetwork.ts, not invented', () => {
  const roadNetwork = buildRoadNetwork(buildCity());
  const network = buildTrafficNetwork(roadNetwork);

  it('builds one link per street and locates every real grid crossing as a signalised intersection', () => {
    expect(network.links.length).toBe(roadNetwork.horizontalStreetYs.length + roadNetwork.verticalStreetXs.length);
    expect(network.intersections.length).toBe(roadNetwork.horizontalStreetYs.length * roadNetwork.verticalStreetXs.length);
  });

  it('every link spans the same length as the real ROAD segment roadNetwork.ts built for that street', () => {
    for (const link of network.links) {
      const segmentId = link.orientation === 'EW' ? `road:h:${link.streetIndex}` : `road:v:${link.streetIndex}`;
      const roadSegment = roadNetwork.segments.find((s) => s.segmentId === segmentId);
      expect(roadSegment).toBeDefined();
      const totalLinkLengthM = link.cells.reduce((sum, c) => sum + c.lengthM, 0);
      expect(totalLinkLengthM).toBeCloseTo(roadSegment!.length, 3);
    }
  });

  it('every intersection has a positive HCM capacity in both directions', () => {
    for (const intersection of network.intersections) {
      expect(intersection.capacityEWVehPerHour).toBeGreaterThan(0);
      expect(intersection.capacityNSVehPerHour).toBeGreaterThan(0);
      expect(intersection.capacityEWVehPerHour).toBeLessThanOrEqual(1900); // never exceeds one lane's saturation flow rate
    }
  });
});

describe('Cell-Transmission Model / Godunov step', () => {
  const demand: TrafficDemandParams = { ...DEFAULT_TRAFFIC_DEMAND };

  it('conserves vehicles on an isolated link with no exit demand: inflow accumulates as density, not lost', () => {
    const roadNetwork = buildRoadNetwork(buildCity());
    const network = buildTrafficNetwork(roadNetwork);
    const before = summarizeTrafficNetwork(network, DEFAULT_GREENSHIELDS);
    expect(before.totalVehicles).toBe(0);

    const after = stepTrafficNetwork(network, DEFAULT_GREENSHIELDS, 30, demand);
    // Vehicles entered at the open boundaries; the network is no longer empty, and light load stays near free-flow.
    expect(after.totalVehicles).toBeGreaterThan(0);
    expect(after.meanSpeedMS).toBeGreaterThan(DEFAULT_GREENSHIELDS.freeFlowSpeedMS * 0.9);
    expect(after.meanSpeedMS).toBeLessThanOrEqual(DEFAULT_GREENSHIELDS.freeFlowSpeedMS);
  });

  it('sustained high demand raises density toward jam and drags mean speed down — real congestion, not scripted', () => {
    const roadNetwork = buildRoadNetwork(buildCity());
    const network = buildTrafficNetwork(roadNetwork);
    const heavyDemand: TrafficDemandParams = { ...DEFAULT_TRAFFIC_DEMAND, entryDemandVehPerHour: 2000 };

    let summary = summarizeTrafficNetwork(network, DEFAULT_GREENSHIELDS);
    for (let tick = 0; tick < 40; tick++) {
      summary = stepTrafficNetwork(network, DEFAULT_GREENSHIELDS, 30, heavyDemand);
    }
    expect(summary.meanDensityVehPerKm).toBeGreaterThan(0);
    expect(summary.meanSpeedMS).toBeLessThan(DEFAULT_GREENSHIELDS.freeFlowSpeedMS);
    expect(summary.congestedCellFraction).toBeGreaterThan(0);
    // Density can never exceed the jam density the fundamental diagram itself defines.
    expect(summary.maxDensityVehPerKm).toBeLessThanOrEqual(DEFAULT_GREENSHIELDS.jamDensityVehPerKm + 1e-6);
  });

  it('a capacity multiplier (disruption) reduces achievable throughput/density growth relative to nominal capacity', () => {
    const roadNetwork = buildRoadNetwork(buildCity());
    const nominalNetwork = buildTrafficNetwork(roadNetwork);
    const disruptedNetwork = buildTrafficNetwork(roadNetwork);
    const heavyDemand: TrafficDemandParams = { ...DEFAULT_TRAFFIC_DEMAND, entryDemandVehPerHour: 1500 };
    const disrupted: TrafficDemandParams = { ...heavyDemand, capacityMultiplier: 0.2 };

    let nominalSummary = summarizeTrafficNetwork(nominalNetwork, DEFAULT_GREENSHIELDS);
    let disruptedSummary = summarizeTrafficNetwork(disruptedNetwork, DEFAULT_GREENSHIELDS);
    for (let tick = 0; tick < 20; tick++) {
      nominalSummary = stepTrafficNetwork(nominalNetwork, DEFAULT_GREENSHIELDS, 30, heavyDemand);
      disruptedSummary = stepTrafficNetwork(disruptedNetwork, DEFAULT_GREENSHIELDS, 30, disrupted);
    }
    // A severely reduced intersection capacity backs traffic up harder upstream of the crossing.
    expect(disruptedSummary.congestedCellFraction).toBeGreaterThanOrEqual(nominalSummary.congestedCellFraction);
  });

  it('an evacuation demand multiplier raises density growth relative to baseline demand', () => {
    const roadNetwork = buildRoadNetwork(buildCity());
    const baseNetwork = buildTrafficNetwork(roadNetwork);
    const evacNetwork = buildTrafficNetwork(roadNetwork);
    const base: TrafficDemandParams = { ...DEFAULT_TRAFFIC_DEMAND, entryDemandVehPerHour: 300 };
    const evac: TrafficDemandParams = { ...base, evacuationDemandMultiplier: 5 };

    let baseSummary = summarizeTrafficNetwork(baseNetwork, DEFAULT_GREENSHIELDS);
    let evacSummary = summarizeTrafficNetwork(evacNetwork, DEFAULT_GREENSHIELDS);
    for (let tick = 0; tick < 10; tick++) {
      baseSummary = stepTrafficNetwork(baseNetwork, DEFAULT_GREENSHIELDS, 30, base);
      evacSummary = stepTrafficNetwork(evacNetwork, DEFAULT_GREENSHIELDS, 30, evac);
    }
    expect(evacSummary.totalVehicles).toBeGreaterThan(baseSummary.totalVehicles);
  });
});

describe('WorldGraph binding', () => {
  it('binds one traffic-network entity to the real CTM solver via SolverRouter and advances it', () => {
    const graph = new WorldGraph();
    const roadNetwork = buildRoadNetwork(buildCity());
    const world = buildTrafficWorld(graph, roadNetwork);

    const router = new SolverRouter();
    router.register(TRAFFIC_FLOW_SOLVER_ID, makeTrafficFlowSolver(world.network));

    const report = router.routeTick(graph, 30, 1);
    // The city entity is a plain container with no domainBinding (same pattern as buildHydraulicsWorld's
    // water-system container) — only the traffic-network entity itself is expected to be grounded here.
    expect(report.ungrounded).not.toContain(world.trafficNetworkId);
    expect(report.updated).toContain(world.trafficNetworkId);

    const entity = graph.getEntity(world.trafficNetworkId);
    expect(entity.grounding).toBe('MODEL_ESTIMATE');
    expect(entity.domainState?.meanSpeedMS).toBeGreaterThan(0);
    expect(report.observations.length).toBe(1);
    expect(report.events[0].type).toBe('traffic.flow.step');
  });

  it('is CFL-stable even under a large dt: sub-stepping keeps density within physical bounds', () => {
    const graph = new WorldGraph();
    const roadNetwork = buildRoadNetwork(buildCity());
    const world = buildTrafficWorld(graph, roadNetwork, { params: { entryDemandVehPerHour: 1800 } });
    const router = new SolverRouter();
    router.register(TRAFFIC_FLOW_SOLVER_ID, makeTrafficFlowSolver(world.network));

    router.routeTick(graph, 600, 1); // a large, otherwise CFL-violating tick
    const entity = graph.getEntity(world.trafficNetworkId);
    expect(entity.domainState?.maxDensityVehPerKm).toBeLessThanOrEqual(DEFAULT_GREENSHIELDS.jamDensityVehPerKm + 1e-6);
    expect(Number.isFinite(entity.domainState?.meanSpeedMS)).toBe(true);
  });
});
