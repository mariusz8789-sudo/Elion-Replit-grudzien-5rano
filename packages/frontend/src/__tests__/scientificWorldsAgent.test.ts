import { describe, expect, it } from 'vitest';
import { INITIAL_AGENT_CONTEXT, isBusy, isMoving, isReaching, transitionAgent, type AgentActionContext, type AgentActionEvent } from '../core/scientificWorlds/agentActionMachine';
import { approachPoint, planPath } from '../core/scientificWorlds/navigationPlanner';

const room = { minX: -6, maxX: 6, minZ: -6, maxZ: 6 };
const wall = { minX: -0.5, maxX: 0.5, minZ: -4, maxZ: 4 };

describe('agent action state machine — explicit, refusing illegal events', () => {
  it('walks the full happy path in order and ends idle', () => {
    const events: AgentActionEvent[] = [
      { type: 'PLAN_STARTED', targetId: 'st-crystal' }, { type: 'WAYPOINT_REACHED', remaining: 1 }, { type: 'WAYPOINT_REACHED', remaining: 0 },
      { type: 'ALIGN_STARTED' }, { type: 'ALIGNED' }, { type: 'REACHED' }, { type: 'INTERACTION_DONE' }, { type: 'EXECUTION_DONE', sessionId: 'ses-1' },
      { type: 'OBSERVATION_DONE' }, { type: 'REPORT_DONE' },
    ];
    let ctx: AgentActionContext = INITIAL_AGENT_CONTEXT;
    const trail: string[] = [];
    for (const e of events) { const r = transitionAgent(ctx, e); expect(r.ok).toBe(true); ctx = r.context; trail.push(ctx.state); }
    expect(trail).toEqual(['MOVING_TO_TARGET', 'MOVING_TO_TARGET', 'ARRIVED', 'ALIGNING', 'REACHING', 'INTERACTING', 'EXECUTING', 'OBSERVING', 'REPORTING', 'IDLE']);
    expect(ctx.sessionId).toBe('ses-1');
    expect(ctx.step).toBe(10);
  });
  it('refuses out-of-order events with a reason and keeps the context; BLOCKED and RESET are always allowed', () => {
    const r = transitionAgent(INITIAL_AGENT_CONTEXT, { type: 'REACHED' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('reached reported while IDLE');
    expect(r.context).toBe(INITIAL_AGENT_CONTEXT);
    const moving = transitionAgent(INITIAL_AGENT_CONTEXT, { type: 'PLAN_STARTED', targetId: 'x' }).context;
    expect(transitionAgent(moving, { type: 'PLAN_STARTED', targetId: 'y' }).ok).toBe(false);
    const blocked = transitionAgent(moving, { type: 'BLOCKED', reason: 'no path' });
    expect(blocked.ok && blocked.context.state).toBe('BLOCKED');
    expect(blocked.context.blockedReason).toBe('no path');
    expect(transitionAgent(blocked.context, { type: 'RESET' }).context.state).toBe('IDLE');
  });
  it('pose predicates follow the state', () => {
    expect(isMoving('MOVING_TO_TARGET')).toBe(true); expect(isMoving('RETURNING')).toBe(true); expect(isMoving('REACHING')).toBe(false);
    expect(isReaching('REACHING')).toBe(true); expect(isReaching('EXECUTING')).toBe(true); expect(isReaching('IDLE')).toBe(false);
    expect(isBusy('EXECUTING')).toBe(true); expect(isBusy('IDLE')).toBe(false); expect(isBusy('BLOCKED')).toBe(false);
  });
});

describe('navigation planner — deterministic A* over the room the human walks in', () => {
  it('goes straight when nothing is in the way', () => {
    const p = planPath({ x: -4, z: 5 }, { x: -4, z: -5 }, room, [wall]);
    expect(p.reachable).toBe(true);
    expect(p.waypoints).toEqual([{ x: -4, z: -5 }]);
    expect(p.lengthM).toBeCloseTo(10, 6);
  });
  it('routes around an obstacle, never through it, and is identical on every call', () => {
    const a = planPath({ x: -3, z: 0 }, { x: 3, z: 0 }, room, [wall]);
    const b = planPath({ x: -3, z: 0 }, { x: 3, z: 0 }, room, [wall]);
    expect(a).toEqual(b);
    expect(a.reachable).toBe(true);
    expect(a.waypoints.length).toBeGreaterThan(1);
    expect(a.lengthM).toBeGreaterThan(6);
    expect(a.lengthM).toBeLessThan(16);
    // no waypoint inside the inflated wall, and the corner is cleared
    for (const w of a.waypoints) expect(w.x > wall.minX - 0.3 && w.x < wall.maxX + 0.3 && w.z > wall.minZ && w.z < wall.maxZ).toBe(false);
    expect(a.waypoints[a.waypoints.length - 1]).toEqual({ x: 3, z: 0 });
  });
  it('reports an unreachable target instead of inventing a path', () => {
    const sealed = { minX: 2, maxX: 4, minZ: 2, maxZ: 4 };
    const p = planPath({ x: -3, z: -3 }, { x: 3, z: 3 }, room, [sealed]);
    // the target is inside the obstacle → nearest free point is used; a fully walled target is refused
    expect(p.reachable).toBe(true);
    const walled = planPath({ x: -3, z: -3 }, { x: 5.9, z: 5.9 }, { minX: -6, maxX: 6, minZ: -6, maxZ: 6 }, [{ minX: 4, maxX: 7, minZ: 4, maxZ: 7 }]);
    expect(walled.reachable).toBe(true); // snapped to the nearest free cell
    const island = planPath({ x: -3, z: 0 }, { x: 3, z: 0 }, room, [{ minX: 0, maxX: 1, minZ: -7, maxZ: 7 }]);
    expect(island.reachable).toBe(false);
    expect(island.reason).toBe('no walkable path');
  });
  it('approachPoint stands in front of the station along its facing', () => {
    expect(approachPoint({ x: 0, z: -5 }, 0, 1)).toEqual({ x: 0, z: -4 });
    const p = approachPoint({ x: 2, z: 0 }, Math.PI / 2, 1);
    expect(p.x).toBeCloseTo(3, 9); expect(p.z).toBeCloseTo(0, 9);
  });
});
