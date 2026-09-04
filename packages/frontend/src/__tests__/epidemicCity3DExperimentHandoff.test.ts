import { describe, expect, it, beforeEach } from 'vitest';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { getRouterModel } from '../core/experimentFabric/router';
import { runExperiment } from '../core/experimentFabric/executor';
import {
  clearExperimentWorldHandoffs,
  consumePendingExperimentWorld,
  setPendingExperimentWorld,
} from '../core/experimentFabric/worldHandoff';

/**
 * Phase 3 proof that a Science-Chat-confirmed epidemic-city run reaches
 * City3D as the SAME live simulation instance, not a second, disconnected
 * one — mirroring the existing HighFidelitySliceScreen handoff pattern
 * (highFidelitySlice3D.ts's existingSimulation parameter) rather than
 * inventing a new World/Evidence/Replay mechanism.
 */
describe('EpidemicCity3DSim — accepts an already-running simulation instead of always self-creating one', () => {
  it('reuses the exact injected EpidemicCitySimulation instance (identity, not a copy)', () => {
    const existing = new EpidemicCitySimulation({ nAgents: 50, seed: 11 });
    for (let i = 0; i < 5; i++) existing.tick(0.25);
    const sim = new EpidemicCity3DSim({}, {}, existing);
    expect(sim.getSim()).toBe(existing);
    expect(sim.getStats().dzien).toBe(existing.stats().dzien);
  });

  it('falls back to a fresh self-created simulation when no instance is injected (unchanged default behavior)', () => {
    const sim = new EpidemicCity3DSim({ nAgents: 50, seed: 11 });
    expect(sim.getSim()).toBeInstanceOf(EpidemicCitySimulation);
  });
});

describe('Science Chat -> epidemic-city -> City3D handoff (not the same as a second Evidence/Replay system)', () => {
  beforeEach(() => clearExperimentWorldHandoffs());

  it('the epidemic-city model now routes to #/city3d, the Command Center with Hospital/Hotspot/Earthquake panels', () => {
    expect(getRouterModel('epidemic-city')?.route).toEqual({ kind: 'live-world', target: 'epidemic-city', hash: '#/city3d' });
  });

  it('confirming "Uruchom epidemię" registers a live world whose simulation is the exact one that ran', () => {
    const request = parseScienceChatMessage('Uruchom epidemię z R0 3 dla 50 agentów.');
    expect(request.modelId).toBe('epidemic-city');
    const run = runExperiment(request);
    expect(run.result.status).toBe('completed');
    expect(run.result.route).toEqual({ kind: 'live-world', target: 'epidemic-city', hash: '#/city3d' });

    expect(setPendingExperimentWorld(run.runId)).toBe(true);
    const handoff = consumePendingExperimentWorld();
    expect(handoff?.modelId).toBe('epidemic-city');
    expect(handoff?.simulation).toBeInstanceOf(EpidemicCitySimulation);

    // The exact instance the handoff carries is what City3D would now mount instead of a fresh one.
    const cityScreenSim = new EpidemicCity3DSim({}, {}, handoff?.simulation);
    expect(cityScreenSim.getSim()).toBe(handoff?.simulation);
    expect(cityScreenSim.getStats().dzien).toBe(handoff?.simulation.stats().dzien);
  });
});
