import { describe, expect, it } from 'vitest';
import { AgentController } from '../core/scientificWorlds/agentController';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { stationHandoffCommand } from '../core/scientificWorlds/worldCommand';
import { LAB_CATALOG, LAB_OBSTACLES, LAB_ROOM, LAB_SPAWN, LAB_STATIONS, LAB_WORLD_ID } from '../core/scientificWorlds/labWorld';
import type { ExperimentRunner } from '../core/scientificWorlds/experimentSession';

/**
 * LIVE EXPERIMENT F2 — at the drug bench the scientist does not seal a result in one frame: the agent
 * stays EXECUTING at the console while the real (out-of-frame) engine computes, reports the engine's own
 * progress, and seals the session only once the engine says the run is finished.
 */
describe('drug bench: the agent waits on the real engine', () => {
  it('the bench is a station of the one lab, reachable by a chat handoff', () => {
    expect(LAB_STATIONS.some((s) => s.id === 'st-drug-bench' && s.experimentId === 'drug-candidate-run')).toBe(true);
    const command = stationHandoffCommand('station=st-drug-bench&project=p1&campaign=c1', LAB_CATALOG, 1);
    expect(command?.targetEntityId).toBe('st-drug-bench');
    expect(command?.parameters).toEqual({ project: 'p1', campaign: 'c1' });
  });

  it('stays EXECUTING with the engine progress until ready, then seals exactly once', () => {
    let engine = { ready: false, progress: 0.25 };
    let runnerCalls = 0;
    const runner: ExperimentRunner = () => { runnerCalls += 1; return { outputs: { stateHash: 'abc' }, evidenceHashes: [], epistemicStatus: 'MODEL', engineLabel: 'test', steps: [], artifact: null }; };
    const controller = new AgentController({
      room: LAB_ROOM, obstacles: LAB_OBSTACLES, stations: LAB_STATIONS, start: LAB_SPAWN, runner, worldId: LAB_WORLD_ID,
      engineGate: (_s, experimentId) => (experimentId === 'drug-candidate-run' ? engine : null),
    });
    const command = stationHandoffCommand('station=st-drug-bench&project=p1&campaign=c1', LAB_CATALOG, 1)!;
    expect(controller.startPlan(planActions([command], LAB_CATALOG, null)).ok).toBe(true);
    let sealed = 0;
    for (let i = 0; i < 4000 && controller.state !== 'EXECUTING'; i += 1) controller.update(0.05);
    expect(controller.state).toBe('EXECUTING');
    for (let i = 0; i < 50; i += 1) {
      const u = controller.update(0.05);
      if (u.sessionSealed) sealed += 1;
      expect(controller.state).toBe('EXECUTING');
      expect(u.progress).toBe(0.25);
    }
    expect(runnerCalls).toBe(0);
    engine = { ready: true, progress: 1 };
    for (let i = 0; i < 200 && controller.state !== 'IDLE'; i += 1) { const u = controller.update(0.05); if (u.sessionSealed) sealed += 1; }
    expect(runnerCalls).toBe(1);
    expect(sealed).toBe(1);
    expect(controller.session?.outputs.stateHash).toBe('abc');
  });
});
