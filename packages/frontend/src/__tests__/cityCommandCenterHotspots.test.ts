import { describe, expect, it } from 'vitest';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import { projectWorldState } from '../core/simulation/worldEngineContract';

/**
 * Dowód, że panel OGNISKA w Command Center czyta ten sam World Engine
 * Contract (SC2), który istnieje od dawna — nie liczy niczego drugi raz i
 * nie może pokazać ogniska, którego nie ma w realnym stanie agentów.
 */
describe('City3D Command Center — hotspot/cluster panel reads real World Engine state', () => {
  it('never reports more infectious agents across hotspots than the real I count', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 300, initialInfected: 30, seed: 4242, severeRate: 0.4 });
    for (let i = 0; i < 240; i++) {
      sim.tick(0.25);
      const state = projectWorldState(sim);
      const summed = state.hotspots.reduce((total, h) => total + h.infectious, 0);
      expect(summed).toBe(state.epidemic.infectious);
    }
  });

  it('reports exactly one hotspot and zero clusters at day zero — the model always seeds at least one case, never a fabricated cluster', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 300, initialInfected: 0, seed: 1, severeRate: 0.3 });
    const state = projectWorldState(sim);
    expect(state.epidemic.infectious).toBe(1); // spawnAgents floors initialInfected to at least 1 real case
    expect(state.hotspots.length).toBe(1);
    expect(state.clusters.household.length).toBe(0);
    expect(state.clusters.location.length).toBe(0);
  });

  it('every reported cluster transmission count is a real subset of the transmission graph', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 400, initialInfected: 25, seed: 777, severeRate: 0.4 });
    let sawClusters = false;
    for (let i = 0; i < 320; i++) {
      sim.tick(0.25);
      const state = projectWorldState(sim);
      const totalEdges = sim.transmissionGraph().length;
      for (const cluster of [...state.clusters.household, ...state.clusters.location]) {
        expect(cluster.transmissions).toBeGreaterThanOrEqual(2); // DEFAULT_CLUSTER_MIN_SIZE
        expect(cluster.transmissions).toBeLessThanOrEqual(totalEdges);
        sawClusters = true;
      }
    }
    expect(sawClusters).toBe(true);
  });

  it('is deterministic: same seed produces the same hotspot count trajectory', () => {
    const run = () => {
      const sim = new EpidemicCitySimulation({ nAgents: 300, initialInfected: 20, seed: 999, severeRate: 0.35 });
      const series: number[] = [];
      for (let i = 0; i < 160; i++) { sim.tick(0.25); series.push(projectWorldState(sim).hotspots.length); }
      return series;
    };
    expect(run()).toEqual(run());
  });
});
