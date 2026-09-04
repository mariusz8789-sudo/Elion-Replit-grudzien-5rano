import { describe, expect, it } from 'vitest';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import { buildCity } from '../core/world/cityWorld';
import { buildRoadNetwork, planCityRoute } from '../core/world/roadNetwork';
import { projectWorldState } from '../core/simulation/worldEngineContract';

describe('World Engine road network — deterministic routing provider', () => {
  it('builds stable road, sidewalk, and crossing segments from the real city layout', () => {
    const network = buildRoadNetwork(buildCity());
    expect(network.mapId).toBe('genesis-city-grid');
    expect(network.segments.some((segment) => segment.segmentType === 'ROAD')).toBe(true);
    expect(network.segments.some((segment) => segment.segmentType === 'SIDEWALK')).toBe(true);
    expect(network.segments.some((segment) => segment.segmentType === 'CROSSING')).toBe(true);
    expect(buildRoadNetwork(buildCity())).toEqual(network);
  });

  it('plans a connected route through declared segments rather than a direct movement vector', () => {
    const network = buildRoadNetwork(buildCity());
    const route = planCityRoute(network, { x: 60, y: 520 }, { x: 810, y: 110 }, 'source', 'destination', 1);
    expect(route.segments.length).toBeGreaterThan(3);
    expect(route.segments.some((segment) => segment.segmentType === 'SIDEWALK')).toBe(true);
    expect(route.segments.some((segment) => segment.segmentType === 'CROSSING')).toBe(true);
    for (let i = 0; i < route.segments.length - 1; i++) {
      expect(route.segments[i].to).toEqual(route.segments[i + 1].from);
    }
  });

  it('remains a read-only World Engine asset and does not mutate established Scientific Core trajectories', () => {
    const run = () => {
      const sim = new EpidemicCitySimulation({ nAgents: 120, initialInfected: 5, seed: 4242 });
      const firstNetwork = sim.roadNetworkView();
      firstNetwork.segments[0].from.x = -999;
      for (let i = 0; i < 40; i++) sim.tick(0.25);
      return { graph: sim.transmissionGraph(), network: sim.roadNetworkView() };
    };
    const first = run();
    const second = run();
    expect(first.graph).toEqual(second.graph);
    expect(first.network.segments[0].from.x).not.toBe(-999);
  });

  it('projects immutable routing topology and assignments through WorldStateView', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 120, initialInfected: 5, seed: 4242 });
    for (let i = 0; i < 40; i++) sim.tick(0.25);
    const view = projectWorldState(sim);
    expect(view.routing.providedFields).toEqual([
      'Route.segments', 'Route.segmentType',
    ]);
    expect(view.routing.routeSegments.length).toBeGreaterThan(0);
    const original = sim.roadNetworkView().segments[0].from.x;
    view.routing.routeSegments[0].from.x = -999;
    expect(sim.roadNetworkView().segments[0].from.x).toBe(original);
  });
});
