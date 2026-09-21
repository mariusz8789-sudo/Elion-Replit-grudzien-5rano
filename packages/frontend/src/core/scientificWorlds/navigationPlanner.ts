import type { Obstacle, RoomBounds, Vec2 } from '../three/firstPersonController';

/**
 * SCIENTIFIC WORLDS — DETERMINISTIC NAVIGATION.
 *
 * Grid A* over the same `RoomBounds` / `Obstacle` rectangles the
 * first-person controller already collides against, so the autonomous
 * agent and the human walk the same walkable surface. No randomness, no
 * heuristic tie flips: ties resolve by insertion order, so the same room
 * and the same request always give the same waypoints. The path is
 * smoothed by line-of-sight against the inflated obstacles, so the rig
 * walks straight where it can instead of stair-stepping.
 */

export interface NavigationPlan {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly waypoints: readonly Vec2[];
  readonly lengthM: number;
  readonly reachable: boolean;
  readonly reason?: string;
}

export interface NavigationOptions {
  readonly cellSize?: number;
  /** Agent radius used to inflate obstacles and walls. */
  readonly radius?: number;
  /** Safety cap on expanded nodes. */
  readonly maxNodes?: number;
}

interface Node { x: number; z: number; g: number; f: number; parent: number; }

function inflated(obstacles: readonly Obstacle[], radius: number): readonly Obstacle[] {
  return obstacles.map((o) => ({ minX: o.minX - radius, maxX: o.maxX + radius, minZ: o.minZ - radius, maxZ: o.maxZ + radius }));
}

/** `inflatedObstacles` are already grown by the agent radius; the room walls are inset by it here. */
function blocked(x: number, z: number, room: RoomBounds, inflatedObstacles: readonly Obstacle[], radius: number): boolean {
  if (x < room.minX + radius || x > room.maxX - radius || z < room.minZ + radius || z > room.maxZ - radius) return true;
  for (const o of inflatedObstacles) if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return true;
  return false;
}

/** Segment–AABB overlap test (Liang–Barsky), used for path smoothing. */
function segmentHitsBox(ax: number, az: number, bx: number, bz: number, o: Obstacle): boolean {
  let t0 = 0; let t1 = 1;
  const dx = bx - ax; const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - o.minX) && clip(dx, o.maxX - ax) && clip(-dz, az - o.minZ) && clip(dz, o.maxZ - az);
}

function lineOfSight(a: Vec2, b: Vec2, obstacles: readonly Obstacle[]): boolean {
  return !obstacles.some((o) => segmentHitsBox(a.x, a.z, b.x, b.z, o));
}

export function nearestFreePoint(p: Vec2, room: RoomBounds, obstacles: readonly Obstacle[], radius: number, cell: number): Vec2 {
  const inf = inflated(obstacles, radius);
  if (!blocked(p.x, p.z, room, inf, radius)) return p;
  for (let ring = 1; ring < 64; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const x = p.x + i * cell; const z = p.z + j * cell;
        if (!blocked(x, z, room, inf, radius)) return { x, z };
      }
    }
  }
  return p;
}

export function planPath(from: Vec2, to: Vec2, room: RoomBounds, obstacles: readonly Obstacle[], options: NavigationOptions = {}): NavigationPlan {
  const cell = options.cellSize ?? 0.25;
  const radius = options.radius ?? 0.35;
  const maxNodes = options.maxNodes ?? 40_000;
  const inf = inflated(obstacles, radius * 0.999);
  const start = nearestFreePoint(from, room, obstacles, radius, cell);
  const goal = nearestFreePoint(to, room, obstacles, radius, cell);
  if (blocked(goal.x, goal.z, room, inf, radius)) return { from, to, waypoints: [], lengthM: 0, reachable: false, reason: 'target is inside an obstacle or outside the room' };
  if (lineOfSight(start, goal, inf)) {
    return { from, to, waypoints: [goal], lengthM: Math.hypot(goal.x - start.x, goal.z - start.z), reachable: true };
  }
  const key = (x: number, z: number): string => `${Math.round(x / cell)},${Math.round(z / cell)}`;
  const nodes: Node[] = [];
  const open: number[] = [];
  const closed = new Set<string>();
  const best = new Map<string, number>();
  const h = (x: number, z: number): number => Math.hypot(goal.x - x, goal.z - z);
  nodes.push({ x: start.x, z: start.z, g: 0, f: h(start.x, start.z), parent: -1 });
  open.push(0); best.set(key(start.x, start.z), 0);
  const dirs: readonly [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let expanded = 0; let found = -1;
  while (open.length && expanded < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (nodes[open[i]].f < nodes[open[bi]].f) bi = i;
    const current = open.splice(bi, 1)[0];
    const n = nodes[current];
    const k = key(n.x, n.z);
    if (closed.has(k)) continue;
    closed.add(k); expanded++;
    if (Math.hypot(goal.x - n.x, goal.z - n.z) <= cell * 1.01) { found = current; break; }
    for (const [dx, dz, cost] of dirs) {
      const x = n.x + dx * cell; const z = n.z + dz * cell;
      if (blocked(x, z, room, inf, radius)) continue;
      if (dx !== 0 && dz !== 0 && (blocked(n.x + dx * cell, n.z, room, inf, radius) || blocked(n.x, n.z + dz * cell, room, inf, radius))) continue;
      const nk = key(x, z);
      if (closed.has(nk)) continue;
      const g = n.g + cost * cell;
      const prev = best.get(nk);
      if (prev !== undefined && nodes[prev].g <= g) continue;
      nodes.push({ x, z, g, f: g + h(x, z), parent: current });
      best.set(nk, nodes.length - 1);
      open.push(nodes.length - 1);
    }
  }
  if (found < 0) return { from, to, waypoints: [], lengthM: 0, reachable: false, reason: expanded >= maxNodes ? 'search budget exhausted' : 'no walkable path' };
  const raw: Vec2[] = [];
  for (let i = found; i >= 0; i = nodes[i].parent) raw.push({ x: nodes[i].x, z: nodes[i].z });
  raw.reverse();
  raw.push(goal);
  // Smoothing: keep the farthest point visible from the current anchor.
  const smooth: Vec2[] = [];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let next = anchor + 1;
    for (let j = raw.length - 1; j > anchor + 1; j--) { if (lineOfSight(raw[anchor], raw[j], inf)) { next = j; break; } }
    smooth.push(raw[next]);
    anchor = next;
  }
  let length = 0; let prev = start;
  for (const w of smooth) { length += Math.hypot(w.x - prev.x, w.z - prev.z); prev = w; }
  return { from, to, waypoints: smooth, lengthM: +length.toFixed(4), reachable: true };
}

/** Where to stand to use a station: `standoff` metres in front of its facing direction. */
export function approachPoint(stationPosition: Vec2, facingRad: number, standoff: number): Vec2 {
  return { x: stationPosition.x + Math.sin(facingRad) * standoff, z: stationPosition.z + Math.cos(facingRad) * standoff };
}
