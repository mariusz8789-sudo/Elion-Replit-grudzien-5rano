import type { EquipmentItem } from './types';
import { REGENERATIVE_BAY_EQUIPMENT, REGENERATIVE_BAY_STATION_ID, createRegenerativeBayStation, type RegenerativeBayStation } from './regenerativeMedicineBay';
import type { LabStation as WorldLabStation } from '../labWorld';
import { planPath } from '../navigationPlanner';

export interface PlacementBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface BayPlacementContext {
  readonly room: PlacementBounds;
  readonly obstacles: readonly PlacementBounds[];
  readonly stationFootprints?: readonly PlacementBounds[];
  readonly clearanceMeters?: number;
  readonly stepMeters?: number;
  readonly allowQuarterTurn?: boolean;
  /** Agent collision radius the approach point must clear — matches `navigationPlanner.ts`'s own default. */
  readonly agentRadiusMeters?: number;
  /**
   * A known-reachable reference point (e.g. the building's spawn) and the FULL navigable bounds/
   * obstacle set (not just this room's — the real route may cross other rooms and doors) to verify
   * the candidate's approach point against with the same `planPath` the live `AgentController` uses.
   * Optional: the static `approachPointValid` check alone (footprint containment + no overlap) does
   * NOT prove the point is actually walkable TO — a wide station can leave its own approach point
   * "clear" by that check while sealing the only corridor that would reach it (see the comment below).
   * When omitted (e.g. a unit test with a small, obstacle-free room), only the static check runs.
   */
  readonly navEntryPoint?: { readonly x: number; readonly z: number };
  readonly navRoom?: PlacementBounds;
  readonly navObstacles?: readonly PlacementBounds[];
}

export interface BayPlacement {
  readonly position: { readonly x: number; readonly z: number };
  readonly facing: number;
  readonly standoff: number;
  readonly footprint: PlacementBounds;
}

// FIX ON INTEGRATION: kept identical to `regenerativeMedicineBay.ts`'s own corrected, TRUE-SCALE
// footprint — see that file's `REGENERATIVE_BAY_VISUAL_SCALE` comment. Two separate constants (not one
// shared import) because the delivered package already duplicated the number in both files; fixing
// both keeps the diff minimal and the values manifestly identical to the ones actually used at the
// render/collision boundary.
const BAY_W = 7.8;
const BAY_D = 6.0;
const BAY_CLEARANCE = 0.35;
// FIX ON INTEGRATION: see `regenerativeMedicineBay.ts`'s matching `createRegenerativeBayStation`
// comment — the delivered package's 1.8 default is smaller than this station's own true half-depth
// (BAY_D / 2 = 3.0), which put the operator approach point inside the console's own footprint.
const BAY_STANDOFF = 3.8;

function overlap(a: PlacementBounds, b: PlacementBounds, clearance: number): boolean {
  return !(a.maxX + clearance <= b.minX || a.minX - clearance >= b.maxX || a.maxZ + clearance <= b.minZ || a.minZ - clearance >= b.maxZ);
}

function inside(inner: PlacementBounds, outer: PlacementBounds): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ;
}

/**
 * FIX ON INTEGRATION: the delivered package's placement search only ever validated the station's own
 * FOOTPRINT against the room and its obstacles — never the operator's actual standing point (the same
 * `approachPoint` formula `agentController.ts`/`navigationPlanner.ts` use: `position + standoff` along
 * `facing`). For a small console that is harmless (standoff comfortably clears the footprint and the
 * room), but it let a geometrically broken placement (see the two files above) pass silently: the
 * approach point lands inside the bay's own footprint, `planPath`'s `nearestFreePoint` quietly
 * substitutes the nearest free cell instead of failing, and the agent can end up stopping well outside
 * the room. Validating the approach point here — same clearance, same `AgentController`/planner agent
 * radius — makes an invalid placement fail the search (and fall through to the next candidate) instead
 * of silently mis-seating the operator.
 */
function approachPointValid(position: { x: number; z: number }, facing: number, room: PlacementBounds, obstacles: readonly PlacementBounds[], agentRadius: number): boolean {
  const ax = position.x + Math.sin(facing) * BAY_STANDOFF;
  const az = position.z + Math.cos(facing) * BAY_STANDOFF;
  const approachBounds: PlacementBounds = { minX: ax - agentRadius, maxX: ax + agentRadius, minZ: az - agentRadius, maxZ: az + agentRadius };
  if (!inside(approachBounds, room)) return false;
  return !obstacles.some((o) => overlap(approachBounds, o, 0));
}

function footprintAt(x: number, z: number, facing: number): PlacementBounds {
  const quarterTurn = Math.abs(Math.sin(facing)) > 0.5;
  const w = quarterTurn ? BAY_D : BAY_W;
  const d = quarterTurn ? BAY_W : BAY_D;
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

/**
 * Finds a deterministic collision-free location inside the ACTUAL room bounds supplied by the host.
 * No coordinate from an older V3 lab is encoded here.
 */
export function findRegenerativeBayPlacement(context: BayPlacementContext): BayPlacement {
  const clearance = context.clearanceMeters ?? BAY_CLEARANCE;
  const step = context.stepMeters ?? 0.4;
  const agentRadius = context.agentRadiusMeters ?? 0.35;
  const facings = context.allowQuarterTurn === false ? [0, Math.PI] : [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const obstacles = [...context.obstacles, ...(context.stationFootprints ?? [])];

  const candidates: Array<{ score: number; position: { x: number; z: number }; facing: number; footprint: PlacementBounds }> = [];
  for (const facing of facings) {
    const turned = Math.abs(Math.sin(facing)) > 0.5;
    const w = turned ? BAY_D : BAY_W;
    const d = turned ? BAY_W : BAY_D;
    const minX = context.room.minX + w / 2 + clearance;
    const maxX = context.room.maxX - w / 2 - clearance;
    const minZ = context.room.minZ + d / 2 + clearance;
    const maxZ = context.room.maxZ - d / 2 - clearance;
    if (minX > maxX || minZ > maxZ) continue;

    for (let x = minX; x <= maxX + 1e-6; x += step) {
      for (let z = minZ; z <= maxZ + 1e-6; z += step) {
        const footprint = footprintAt(Number(x.toFixed(4)), Number(z.toFixed(4)), facing);
        if (!inside(footprint, context.room)) continue;
        if (obstacles.some((o) => overlap(footprint, o, clearance))) continue;
        if (!approachPointValid({ x, z }, facing, context.room, [...obstacles, footprint], agentRadius)) continue;
        // Prefer a placement closer to room center, then deterministic X/Z order.
        const cx = (context.room.minX + context.room.maxX) / 2;
        const cz = (context.room.minZ + context.room.maxZ) / 2;
        const score = Math.hypot(x - cx, z - cz) + (turned ? 0.01 : 0);
        candidates.push({ score, position: { x: Number(x.toFixed(4)), z: Number(z.toFixed(4)) }, facing, footprint });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score || a.position.x - b.position.x || a.position.z - b.position.z || a.facing - b.facing);

  // Real reachability, checked lazily (best-scored candidate first) with the SAME planner the live
  // AgentController uses — see the `navEntryPoint`/`navRoom` doc comment above for why the static
  // check alone is not enough. Only run when the host supplied full-building nav context; a caller
  // that only passes this room's own bounds (e.g. a unit test) keeps the pre-existing static-only
  // behavior.
  const winner = context.navEntryPoint && context.navRoom
    ? candidates.find((c) => {
        const goal = { x: c.position.x + Math.sin(c.facing) * BAY_STANDOFF, z: c.position.z + Math.cos(c.facing) * BAY_STANDOFF };
        const nav = planPath(context.navEntryPoint!, goal, context.navRoom!, context.navObstacles ?? context.obstacles, { radius: agentRadius });
        return nav.reachable;
      })
    : candidates[0];
  if (!winner) throw new Error('REGENERATIVE_BAY_NO_VALID_PLACEMENT');
  return { ...winner, standoff: BAY_STANDOFF };
}

export function createCanonicalRegenerativeBayStation(context: BayPlacementContext): RegenerativeBayStation {
  const p = findRegenerativeBayPlacement(context);
  return createRegenerativeBayStation({ position: p.position, facing: p.facing, standoff: p.standoff });
}

/** Merge the bay into the existing station array without creating a second registry. */
export function appendRegenerativeBayStation(stations: readonly WorldLabStation[], bay: RegenerativeBayStation): readonly WorldLabStation[] {
  if (stations.some((s) => s.id === REGENERATIVE_BAY_STATION_ID)) return stations;
  return [...stations, bay];
}

/** Convert the six bay contracts to the existing GENESIS_LAB_EQUIPMENT shape. */
export function regenerativeBayEquipmentItems(stationId: string = REGENERATIVE_BAY_STATION_ID): readonly EquipmentItem[] {
  return REGENERATIVE_BAY_EQUIPMENT.map((e): EquipmentItem => ({
    equipmentId: e.id,
    kind: 'GENERIC',
    label: e.label,
    stationId,
    operational: true,
    assetSlot: e.assetSlot,
    capabilities: e.capabilities,
  }));
}

export function assertRegenerativeBayPlacement(room: PlacementBounds, bay: WorldLabStation): void {
  if (!inside(bay.footprint, room)) throw new Error(`REGENERATIVE_BAY_OUTSIDE_ROOM:${bay.id}`);
}

export function assertRegenerativeBayUnique(stations: readonly WorldLabStation[]): void {
  const count = stations.filter((s) => s.id === REGENERATIVE_BAY_STATION_ID).length;
  if (count !== 1) throw new Error(`REGENERATIVE_BAY_STATION_COUNT:${count}`);
}
