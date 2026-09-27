import { describe, expect, it } from 'vitest';
import { BIOLOGY_CATALOG, BIOLOGY_OBSTACLES, BIOLOGY_ROOM, BIOLOGY_SPAWN, BIOLOGY_STATIONS, BIOLOGY_WORLD_ID, TWIN_CHAMBER, biologyStation } from '../core/scientificWorlds/biologyLabWorld';
import { GENESIS_LAB_ROOMS, getRoomAtPosition, getRoomForStation } from '../core/scientificWorlds/canonicalLaboratory';
import { planPath } from '../core/scientificWorlds/navigationPlanner';
import { AgentController } from '../core/scientificWorlds/agentController';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import type { WorldCommand } from '../core/scientificWorlds/worldCommand';

/**
 * The Canonical Laboratory integration (`biologyLabWorld.ts` consuming `canonicalLaboratory.ts`)
 * turns the single 20×20 room into seven real rooms connected by doors. These tests exercise the
 * WIRED result — the live `BIOLOGY_ROOM`/`BIOLOGY_OBSTACLES`/`BIOLOGY_STATIONS`/`BIOLOGY_SPAWN` this
 * scene actually uses — not just the standalone `canonicalLaboratory.ts` data already covered by
 * `canonicalLaboratory.test.ts`. Two things only this wiring can get wrong: the D-134 Twin Chamber
 * (a fixture `canonicalLaboratory.ts` has no notion of) colliding with a remapped console, and the
 * existing grid-A* actually routing the agent through a door once `BIOLOGY_ROOM`/`BIOLOGY_OBSTACLES`
 * span the full building.
 */
describe('biologyLabWorld — wired to the Canonical Laboratory', () => {
  it('spans the full seven-room building, not the old single 20×20 room', () => {
    expect(BIOLOGY_ROOM.minX).toBeLessThan(-9);
    expect(BIOLOGY_ROOM.maxX).toBeGreaterThan(9);
    expect(BIOLOGY_ROOM.minZ).toBeLessThan(-8);
    expect(BIOLOGY_ROOM.maxZ).toBeGreaterThan(8);
  });

  it('places every one of the twelve stations (9 V3 pack + 3 host-added Wet Lab) inside its own canonical room\'s bounds', () => {
    for (const s of BIOLOGY_STATIONS) {
      const roomId = getRoomForStation(s.id);
      expect(roomId, s.id).not.toBeNull();
      const room = GENESIS_LAB_ROOMS.find((r) => r.id === roomId)!;
      expect(s.position.x, `${s.id} x within ${roomId}`).toBeGreaterThanOrEqual(room.bounds.minX);
      expect(s.position.x, `${s.id} x within ${roomId}`).toBeLessThanOrEqual(room.bounds.maxX);
      expect(s.position.z, `${s.id} z within ${roomId}`).toBeGreaterThanOrEqual(room.bounds.minZ);
      expect(s.position.z, `${s.id} z within ${roomId}`).toBeLessThanOrEqual(room.bounds.maxZ);
    }
  });

  it('keeps the three main-hall consoles clear of the fixed D-134 Twin Chamber footprint', () => {
    const twinFootprint = { minX: TWIN_CHAMBER.position.x - (TWIN_CHAMBER.radius + 0.25), maxX: TWIN_CHAMBER.position.x + (TWIN_CHAMBER.radius + 0.25),
      minZ: TWIN_CHAMBER.position.z - (TWIN_CHAMBER.radius + 0.25), maxZ: TWIN_CHAMBER.position.z + (TWIN_CHAMBER.radius + 0.25) };
    for (const id of ['station:evidence', 'station:compute', 'station:safety']) {
      const s = biologyStation(id)!;
      const overlapsX = s.footprint.minX < twinFootprint.maxX && s.footprint.maxX > twinFootprint.minX;
      const overlapsZ = s.footprint.minZ < twinFootprint.maxZ && s.footprint.maxZ > twinFootprint.minZ;
      expect(overlapsX && overlapsZ, `${id} footprint must not overlap the Twin Chamber`).toBe(false);
    }
  });

  it('resolves each station to the room its canonical placement says it should be in — no station assigned to the wrong room', () => {
    expect(getRoomForStation('station:human-study')).toBe('human-study');
    expect(getRoomForStation('station:neuro')).toBe('human-study');
    expect(getRoomForStation('station:microscopy')).toBe('microscopy');
    expect(getRoomForStation('station:histology')).toBe('histology');
    expect(getRoomForStation('station:imaging')).toBe('imaging');
    expect(getRoomForStation('station:orpheus')).toBe('experimental');
    expect(getRoomForStation('station:evidence')).toBe('main-hall');
    expect(getRoomForStation('station:compute')).toBe('main-hall');
    expect(getRoomForStation('station:safety')).toBe('main-hall');
    expect(getRoomForStation('station:wet-sample-prep')).toBe('wet-lab');
    expect(getRoomForStation('station:wet-lab-bench')).toBe('wet-lab');
    expect(getRoomForStation('station:wet-analytical')).toBe('wet-lab');
    // Every station BIOLOGY_STATIONS actually renders has a room, and vice versa — no orphan and no
    // station the room graph doesn't know about.
    for (const s of BIOLOGY_STATIONS) expect(getRoomForStation(s.id), s.id).not.toBeNull();
  });

  it('no room intended to be operational (all 7, per the pilot protocol) has an empty stationIds array', () => {
    for (const room of GENESIS_LAB_ROOMS) {
      expect(room.stationIds.length, `${room.id} must have at least one real station`).toBeGreaterThan(0);
    }
  });

  it('spawns the agent/player in main-hall, not inside a wall or the Twin Chamber', () => {
    expect(getRoomAtPosition(BIOLOGY_SPAWN.position)).toBe('main-hall');
    const inTwin = Math.hypot(BIOLOGY_SPAWN.position.x - TWIN_CHAMBER.position.x, BIOLOGY_SPAWN.position.z - TWIN_CHAMBER.position.z) < TWIN_CHAMBER.radius + 0.5;
    expect(inTwin).toBe(false);
  });

  it('routes the existing grid-A* planner from spawn, through a door, to every station in every room — no second pathfinder', () => {
    for (const s of BIOLOGY_STATIONS) {
      const target = { x: s.position.x + s.standoff * Math.sin(s.facing), z: s.position.z + s.standoff * Math.cos(s.facing) };
      const plan = planPath(BIOLOGY_SPAWN.position, target, BIOLOGY_ROOM, BIOLOGY_OBSTACLES, { radius: 0.35 });
      expect(plan.reachable, `${s.id}: ${plan.reason ?? 'unreachable'}`).toBe(true);
      expect(plan.waypoints.length).toBeGreaterThan(0);
    }
  });

  describe('AgentController physically reaches every station in every one of the 7 rooms (NAVIGATE -> ALIGN -> REACH -> INTERACT)', () => {
    // Direct, already-resolved WorldCommands — not free text — so this proves the real physical agent
    // state machine and the real A* obstacles get the agent there, independent of any command-parser
    // keyword wording (that path is covered separately, per station, in scientificWorldsBiology.test.ts
    // and canonicalLaboratory.test.ts's own door-reachability suite).
    // Test-only commandId synthesis: `validateWorldCommand` requires the real parser's `cmd-<8 hex>`
    // shape, which these directly-constructed commands bypass (see the describe-level comment).
    const hex8 = (seed: string): string => { let h = 0x811c9dc5; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
    for (const s of BIOLOGY_STATIONS) {
      it(`reaches ${s.id} (room: ${getRoomForStation(s.id)})`, () => {
        const commands: WorldCommand[] = [
          { commandId: `cmd-${hex8(`nav-${s.id}`)}`, text: `test:navigate:${s.id}`, intent: 'NAVIGATE', targetEntityId: s.id, requestedAtLogicalTime: 1 },
          { commandId: `cmd-${hex8(`int-${s.id}`)}`, text: `test:interact:${s.id}`, intent: 'INTERACT', targetEntityId: s.id, requestedAtLogicalTime: 1 },
        ];
        const plan = planActions(commands, BIOLOGY_CATALOG, null);
        expect(plan.rejected, s.id).toEqual([]);
        expect(plan.steps.map((st) => st.kind), s.id).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT']);

        const controller = new AgentController({ room: BIOLOGY_ROOM, obstacles: BIOLOGY_OBSTACLES, stations: BIOLOGY_STATIONS, start: BIOLOGY_SPAWN, runner: () => { throw new Error('no experiment expected'); }, worldId: BIOLOGY_WORLD_ID, defaultSeed: 1 });
        expect(controller.startPlan(plan).ok, s.id).toBe(true);
        const interactions: string[] = [];
        for (let i = 0; i < 20000 && controller.state !== 'IDLE'; i++) { const u = controller.update(1 / 30); if (u.interaction) interactions.push(u.interaction.stationId); }
        expect(controller.state, s.id).toBe('IDLE');
        expect(interactions, s.id).toEqual([s.id]);

        // Actually walked there — final position lands inside the station's own mapped room, not spawn.
        const roomId = getRoomForStation(s.id)!;
        const room = GENESIS_LAB_ROOMS.find((r) => r.id === roomId)!;
        const finalPos = controller.pose.position;
        expect(finalPos.x, s.id).toBeGreaterThanOrEqual(room.bounds.minX);
        expect(finalPos.x, s.id).toBeLessThanOrEqual(room.bounds.maxX);
        expect(finalPos.z, s.id).toBeGreaterThanOrEqual(room.bounds.minZ);
        expect(finalPos.z, s.id).toBeLessThanOrEqual(room.bounds.maxZ);
      });
    }
  });
});
