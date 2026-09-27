import { describe, expect, it } from 'vitest';
import { AgentController } from '../core/scientificWorlds/agentController';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { parseWorldCommands } from '../core/scientificWorlds/worldCommand';
import { LAB_CATALOG, LAB_OBSTACLES, LAB_ROOM, LAB_SPAWN, LAB_STATIONS } from '../core/scientificWorlds/labWorld';
import type { ExperimentRunner } from '../core/scientificWorlds/experimentSession';
import { replayExperimentSession } from '../core/scientificWorlds/experimentSession';

/** Deterministic toy runner so the controller test owns its arithmetic; the real runners have their own test. */
let calls = 0;
const runner: ExperimentRunner<{ n: number }> = (experimentId, seed, inputs) => {
  calls++;
  return { outputs: { experimentId, seed, composition: String(inputs.composition ?? '-'), value: seed * 3 }, evidenceHashes: ['b'.repeat(64)], epistemicStatus: 'MODEL', engineLabel: 'TOY', steps: ['run'], artifact: { n: calls } };
};

function drive(agent: AgentController, seconds: number, dt = 1 / 30) {
  const trail: string[] = [];
  let report = null as ReturnType<AgentController['update']>['report'];
  let sealed = null as ReturnType<AgentController['update']>['sessionSealed'];
  for (let t = 0; t < seconds; t += dt) {
    const u = agent.update(dt);
    if (trail[trail.length - 1] !== u.state) trail.push(u.state);
    if (u.report) report = u.report;
    if (u.sessionSealed) sealed = u.sessionSealed;
    if (report) break;
  }
  return { trail, report, sealed };
}

describe('AgentController — the acceptance sentence, end to end without WebGL', () => {
  it('walks to the synthesizer, reaches, runs ONE session, observes and reports with provenance; the body actually moved', () => {
    calls = 0;
    const agent = new AgentController({ room: LAB_ROOM, obstacles: LAB_OBSTACLES, stations: LAB_STATIONS, start: LAB_SPAWN, runner, worldId: 'lab-test', defaultSeed: 11 });
    const { commands, unresolved } = parseWorldCommands('Idź do laboratorium i uruchom eksperyment na syntezie kryształu NaCl. Potem pokaż mi, co otrzymałeś i skąd to pochodzi.', LAB_CATALOG, 1);
    expect(unresolved).toEqual([]);
    const plan = planActions(commands, LAB_CATALOG, null);
    expect(plan.steps.map((s) => s.kind)).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'REPORT']);
    expect(agent.startPlan(plan)).toEqual({ ok: true });
    expect(agent.startPlan(plan)).toEqual({ ok: false, reason: 'agent is MOVING_TO_TARGET' });
    const start = agent.pose.position;
    const { trail, report, sealed } = drive(agent, 60);
    // ARRIVED and EXECUTING are transient within a frame (arrival starts the alignment, execution seals and moves on).
    expect(trail).toEqual(['MOVING_TO_TARGET', 'ALIGNING', 'REACHING', 'INTERACTING', 'OBSERVING', 'REPORTING', 'IDLE']);
    expect(calls).toBe(1);
    expect(sealed?.session.experimentId).toBe('crystal-synthesis');
    expect(sealed?.session.inputs).toEqual({ composition: 'NaCl' });
    expect(sealed?.session.seed).toBe(11);
    expect(report?.session?.sessionId).toBe(sealed?.session.sessionId);
    expect(report?.includeProvenance).toBe(true);
    const end = agent.pose.position;
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(3);
    // standing in front of the synthesizer, facing it
    const st = LAB_STATIONS[0];
    expect(Math.hypot(end.x - st.position.x, end.z - st.position.z)).toBeCloseTo(st.standoff, 1);
    expect(Math.abs(Math.abs(agent.pose.facing) - Math.PI)).toBeLessThan(0.05); // looking back at the console on the wall
    expect(agent.pose.reach).toBeLessThan(0.2);
    expect(agent.station).toBe('st-synthesizer');
    // replay the sealed session through the same runner: MATCH, and the artifact came from a real rerun
    const verdict = replayExperimentSession(sealed!.session, runner);
    expect(verdict.status).toBe('MATCH');
    expect(calls).toBe(2);
  });
  it('reach and head pitch rise during the work and fall back afterwards; walking drives gait', () => {
    const agent = new AgentController({ room: LAB_ROOM, obstacles: LAB_OBSTACLES, stations: LAB_STATIONS, start: LAB_SPAWN, runner, worldId: 'lab-test' });
    const plan = planActions(parseWorldCommands('uruchom zderzacz', LAB_CATALOG, 2).commands, LAB_CATALOG, null);
    agent.startPlan(plan);
    let maxReach = 0; let maxPitch = 0; let gaitAtArrival = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const u = agent.update(1 / 30);
      maxReach = Math.max(maxReach, agent.pose.reach); maxPitch = Math.max(maxPitch, agent.pose.headPitch);
      if (u.state === 'ALIGNING' && gaitAtArrival === 0) gaitAtArrival = agent.pose.gait;
      if (u.report) break;
    }
    expect(gaitAtArrival).toBeGreaterThan(1);
    expect(maxReach).toBeGreaterThan(0.85);
    expect(maxPitch).toBeGreaterThan(0.2);
  });
  it('an unreachable station blocks with the reason instead of teleporting; a report-only plan reports the last session', () => {
    const boxedIn = [...LAB_OBSTACLES, { minX: -8, maxX: 8, minZ: -1, maxZ: -0.5 }];
    const agent = new AgentController({ room: LAB_ROOM, obstacles: boxedIn, stations: LAB_STATIONS, start: LAB_SPAWN, runner, worldId: 'lab-test' });
    agent.startPlan(planActions(parseWorldCommands('idź do syntezatora', LAB_CATALOG, 3).commands, LAB_CATALOG, null));
    const u = agent.update(1 / 30);
    expect(u.state).toBe('BLOCKED');
    expect(u.blockedReason).toContain('no path to Syntezator');
    expect(agent.pose.position).toEqual(LAB_SPAWN.position);
    const free = new AgentController({ room: LAB_ROOM, obstacles: LAB_OBSTACLES, stations: LAB_STATIONS, start: LAB_SPAWN, runner, worldId: 'lab-test' });
    free.startPlan(planActions(parseWorldCommands('uruchom zderzacz', LAB_CATALOG, 4).commands, LAB_CATALOG, null));
    const first = drive(free, 60);
    expect(first.report?.session).not.toBeNull();
    free.startPlan(planActions(parseWorldCommands('pokaż mi wynik i skąd pochodzi', LAB_CATALOG, 5).commands, LAB_CATALOG, free.station));
    const second = drive(free, 5);
    expect(second.report?.session?.sessionId).toBe(first.report?.session?.sessionId);
    expect(second.report?.includeProvenance).toBe(true);
  });
  it('a what-if is deferred, not acted out', () => {
    const agent = new AgentController({ room: LAB_ROOM, obstacles: LAB_OBSTACLES, stations: LAB_STATIONS, start: LAB_SPAWN, runner, worldId: 'lab-test' });
    agent.startPlan(planActions(parseWorldCommands('Co jeśli transmisja jest dwukrotnie większa?', LAB_CATALOG, 6).commands, LAB_CATALOG, null));
    const { report } = drive(agent, 2);
    expect(report?.deferred.length).toBe(1);
    expect(report?.deferred[0].parameters).toEqual({ transmissionMultiplier: 2 });
    expect(agent.pose.position).toEqual(LAB_SPAWN.position);
  });
});
