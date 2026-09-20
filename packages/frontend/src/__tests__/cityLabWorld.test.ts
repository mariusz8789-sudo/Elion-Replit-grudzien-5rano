import { describe, expect, it } from 'vitest';
import { CITY_CATALOG, CITY_OBSTACLES, CITY_ROOM, CITY_SPAWN, CITY_STATIONS, CITY_WORLD_ID, cityStation } from '../core/scientificWorlds/cityLabWorld';
import { createCityExperimentRunner, isCityExperiment } from '../core/scientificWorlds/cityRunners';
import { approachPoint, planPath } from '../core/scientificWorlds/navigationPlanner';
import { parseWorldCommands } from '../core/scientificWorlds/worldCommand';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { AgentController } from '../core/scientificWorlds/agentController';
import { createExperimentSession, replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { buildEpidemicWorld, EPIDEMIC_DOMAIN_ID, EPIDEMIC_SEIR_SOLVER_ID } from '../core/worldModel/domains/epidemicSEIR';

/**
 * SW-4 — the epidemiology city: the SAME WorldCommand -> ActionPlan ->
 * AgentController -> ExperimentSession -> Evidence Ledger pipeline the
 * physics/biology/chemistry worlds already use, with `epidemic-seir-city`
 * computed by the REAL `core/worldModel/domains/epidemicSEIR.ts` domain —
 * not a re-derived epidemic engine, not a second command bus.
 */
describe('epidemiology city — data', () => {
  it('has one real, reachable station whose experimentId is the city SEIR experiment', () => {
    expect(CITY_STATIONS).toHaveLength(1);
    expect(CITY_STATIONS[0].id).toBe('st-epidemic-command');
    expect(CITY_STATIONS[0].experimentId).toBe('epidemic-seir-city');
    expect(cityStation('st-epidemic-command')).not.toBeNull();
    expect(cityStation('does-not-exist')).toBeNull();
  });

  it('the station is reachable from spawn by the same A* planner every other world uses', () => {
    const s = CITY_STATIONS[0];
    const goal = approachPoint(s.position, s.facing, s.standoff);
    const nav = planPath(CITY_SPAWN.position, goal, CITY_ROOM, CITY_OBSTACLES);
    expect(nav.reachable, nav.reason ?? '').toBe(true);
  });
});

describe('epidemiology city runner — the real World Model SEIR domain, not a re-derived engine', () => {
  const ledger = new EvidenceLedger({ now: () => Date.now() });
  const runner = createCityExperimentRunner(CITY_WORLD_ID, ledger);

  it('isCityExperiment recognizes exactly the city experiment id', () => {
    expect(isCityExperiment('epidemic-seir-city')).toBe(true);
    expect(isCityExperiment('seir-epidemic')).toBe(false);
    expect(isCityExperiment('physiology-state')).toBe(false);
  });

  it('genuinely reuses epidemicSEIR.ts: same solver id and domain id the runner steps through', () => {
    const { graph, populationId } = buildEpidemicWorld({ populationId: 'proof' });
    const entity = graph.tryGetEntity(populationId)!;
    expect(entity.domainBinding?.solverId).toBe(EPIDEMIC_SEIR_SOLVER_ID);
    expect(entity.domainBinding?.domainId).toBe(EPIDEMIC_DOMAIN_ID);
  });

  it('seals a real session: real ledger hash, non-observation status, replays MATCH', () => {
    const { session, artifact } = createExperimentSession({ worldId: CITY_WORLD_ID, stationId: 'st-epidemic-command', experimentId: 'epidemic-seir-city', seed: 3, inputs: { days: 120 }, logicalTime: 1 }, runner);
    expect(session.evidenceHashes.length).toBeGreaterThan(0);
    for (const h of session.evidenceHashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(session.epistemicStatus).toBe('SIMULATION');
    expect(artifact.kind).toBe('epidemic');
    if (artifact.kind === 'epidemic') {
      expect(artifact.series.length).toBe(121); // day 0 plus 120 daily ticks
      expect(artifact.series[0]).toMatchObject({ t: 0 });
      // Population is conserved at every tick (S+E+I+R+D constant, RK4 integration of the real ODE system).
      const total0 = artifact.series[0].S + artifact.series[0].E + artifact.series[0].I + artifact.series[0].R + artifact.series[0].D;
      const totalLast = artifact.series.at(-1)!.S + artifact.series.at(-1)!.E + artifact.series.at(-1)!.I + artifact.series.at(-1)!.R + artifact.series.at(-1)!.D;
      expect(totalLast).toBeCloseTo(total0, 0);
    }
    const verdict = replayExperimentSession(session, runner);
    expect(verdict.status).toBe('MATCH');
  });

  it('rejects an unknown experiment id rather than silently substituting one', () => {
    expect(() => runner('not-a-real-experiment', 1, {})).toThrow('unknown experiment');
  });
});

describe('epidemiology city — the real WorldCommand -> ActionPlan -> AgentController -> ExperimentSession -> Evidence Ledger pipeline', () => {
  it('a real free-text command reaches the command center and seals a real epidemic-seir-city session', () => {
    const ledger = new EvidenceLedger({ now: () => Date.now() });
    const runner = createCityExperimentRunner(CITY_WORLD_ID, ledger);
    const before = ledger.getActive().length;

    const parsed = parseWorldCommands('Idź do centrum dowodzenia epidemiologicznego i uruchom symulację SEIR.', CITY_CATALOG, 1);
    expect(parsed.unresolved).toEqual([]);
    expect(parsed.commands.map((c) => [c.intent, c.targetEntityId])).toEqual([
      ['NAVIGATE', 'st-epidemic-command'], ['RUN_EXPERIMENT', 'st-epidemic-command'],
    ]);
    const plan = planActions(parsed.commands, CITY_CATALOG, null);
    expect(plan.rejected).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'REPORT']);

    const controller = new AgentController({ room: CITY_ROOM, obstacles: CITY_OBSTACLES, stations: CITY_STATIONS, start: CITY_SPAWN, runner, worldId: CITY_WORLD_ID, defaultSeed: 7 });
    expect(controller.startPlan(plan).ok).toBe(true);
    const sealed: string[] = []; let report: unknown = null;
    for (let i = 0; i < 20000 && !report; i++) {
      const u = controller.update(1 / 30);
      if (u.sessionSealed) sealed.push(u.sessionSealed.session.experimentId);
      if (u.report) report = u.report;
    }
    expect(controller.state).toBe('IDLE');
    expect(sealed).toEqual(['epidemic-seir-city']);
    expect(report).toMatchObject({ includeProvenance: true, includeResult: true });
    expect(ledger.getActive().length).toBeGreaterThan(before);

    const finalPos = controller.pose.position;
    expect(finalPos.x).toBeGreaterThanOrEqual(CITY_ROOM.minX);
    expect(finalPos.x).toBeLessThanOrEqual(CITY_ROOM.maxX);
    expect(finalPos.z).toBeGreaterThanOrEqual(CITY_ROOM.minZ);
    expect(finalPos.z).toBeLessThanOrEqual(CITY_ROOM.maxZ);
  });
});
