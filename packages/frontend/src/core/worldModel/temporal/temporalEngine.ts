import { canonicalJson } from '../../events/hash';
import type { EntityId, WorldModelEntity, WorldModelEntityPatch } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';

/**
 * TEMPORAL & DELTA ENGINE.
 *
 * The engine never stores a full snapshot per tick — only one keyframe
 * (the graph this branch started from) plus a delta log. `scrubTo` replays
 * the keyframe forward; it never mutates the live `current` graph, so
 * scrubbing is always safe and repeatable.
 */
export type EntityDelta =
  | { op: 'add'; id: EntityId; entity: WorldModelEntity }
  | { op: 'remove'; id: EntityId }
  | { op: 'update'; id: EntityId; patch: WorldModelEntityPatch };

export interface TemporalFrame {
  tick: number;
  simulatedTime: number;
  deltas: readonly EntityDelta[];
}

export interface TemporalBranchInfo {
  branchId: string;
  label: string;
  parentBranchId: string | null;
  forkedAtTick: number | null;
  headTick: number;
}

let branchCounter = 0;
function nextBranchId(): string {
  branchCounter += 1;
  return `branch-${branchCounter}`;
}

/** Shared directory of every branch derived from a common root — the "multiverse" index. */
export class TemporalBranchRegistry {
  private readonly branches = new Map<string, TemporalEngine>();

  register(engine: TemporalEngine): void {
    this.branches.set(engine.branchId, engine);
  }

  get(branchId: string): TemporalEngine {
    const engine = this.branches.get(branchId);
    if (!engine) throw new Error(`Unknown branch: ${branchId}`);
    return engine;
  }

  list(): readonly TemporalBranchInfo[] {
    return [...this.branches.values()].map((engine) => engine.describe());
  }
}

export class TemporalEngine {
  readonly branchId: string;
  readonly label: string;
  readonly parentBranchId: string | null;
  readonly forkedAtTick: number | null;
  private readonly registry: TemporalBranchRegistry | null;

  private keyframeGraph: WorldGraph;
  private readonly keyframeTick: number;
  private current: WorldGraph;
  private currentTick: number;
  private simulatedTime: number;
  private readonly history: TemporalFrame[] = [];

  constructor(
    initialGraph: WorldGraph,
    options: {
      branchId?: string;
      label?: string;
      parentBranchId?: string | null;
      forkedAtTick?: number | null;
      startTick?: number;
      registry?: TemporalBranchRegistry;
    } = {},
  ) {
    this.branchId = options.branchId ?? nextBranchId();
    this.label = options.label ?? this.branchId;
    this.parentBranchId = options.parentBranchId ?? null;
    this.forkedAtTick = options.forkedAtTick ?? null;
    this.keyframeTick = options.startTick ?? 0;
    this.keyframeGraph = initialGraph.clone();
    this.current = initialGraph.clone();
    this.currentTick = this.keyframeTick;
    this.simulatedTime = 0;
    this.registry = options.registry ?? null;
    this.registry?.register(this);
  }

  get tick(): number {
    return this.currentTick;
  }

  get graph(): WorldGraph {
    return this.current;
  }

  /** Read-only access to the recorded delta log, e.g. for delta-serialization inspection or export. */
  get frames(): readonly TemporalFrame[] {
    return this.history;
  }

  get historyLength(): number {
    return this.history.length;
  }

  describe(): TemporalBranchInfo {
    return {
      branchId: this.branchId,
      label: this.label,
      parentBranchId: this.parentBranchId,
      forkedAtTick: this.forkedAtTick,
      headTick: this.currentTick,
    };
  }

  /**
   * Advances the world by `dt`: `advance` receives the live graph to mutate
   * in place (typically `SolverRouter.routeTick`). The resulting frame is
   * stored as a component-level delta against the pre-tick state, not a
   * full snapshot.
   */
  advance(dt: number, updater: (graph: WorldGraph, dt: number) => void): WorldGraph {
    const before = this.current;
    const after = before.clone();
    updater(after, dt);
    const deltas = diffGraphs(before, after);
    this.currentTick += 1;
    this.simulatedTime += dt;
    this.history.push({ tick: this.currentTick, simulatedTime: this.simulatedTime, deltas });
    this.current = after;
    return this.current;
  }

  /** Rebuilds the graph as of `targetTick` by replaying the keyframe forward. Does not mutate `current`. */
  scrubTo(targetTick: number): WorldGraph {
    if (targetTick < this.keyframeTick) {
      throw new Error(`Cannot scrub to tick ${targetTick}: before this branch's keyframe at ${this.keyframeTick}`);
    }
    const graph = this.keyframeGraph.clone();
    for (const frame of this.history) {
      if (frame.tick > targetTick) break;
      applyDeltas(graph, frame.deltas, frame.tick);
    }
    return graph;
  }

  /**
   * Creates a divergent branch (Multiverse Branching / counterfactual world):
   * shares this branch's history up to `atTick`, then applies `mutate` as
   * the declared divergence before any new ticks run on the fork.
   */
  forkBranch(atTick: number, label: string, mutate: (graph: WorldGraph) => void): TemporalEngine {
    const stateAtFork = this.scrubTo(atTick);
    mutate(stateAtFork);
    return new TemporalEngine(stateAtFork, {
      label,
      parentBranchId: this.branchId,
      forkedAtTick: atTick,
      startTick: atTick,
      registry: this.registry ?? undefined,
    });
  }
}

function diffGraphs(before: WorldGraph, after: WorldGraph): EntityDelta[] {
  const deltas: EntityDelta[] = [];
  const beforeIds = new Set(before.listEntities().map((e) => e.id));
  for (const entity of after.listEntities()) {
    const previous = before.tryGetEntity(entity.id);
    if (!previous) {
      deltas.push({ op: 'add', id: entity.id, entity });
      continue;
    }
    beforeIds.delete(entity.id);
    if (canonicalJson(previous) !== canonicalJson(entity)) {
      deltas.push({
        op: 'update',
        id: entity.id,
        patch: {
          label: entity.label,
          scale: entity.scale,
          spatial: entity.spatial,
          physics: entity.physics,
          chemical: entity.chemical,
          domainBinding: entity.domainBinding,
          grounding: entity.grounding,
        },
      });
    }
  }
  for (const removedId of beforeIds) deltas.push({ op: 'remove', id: removedId });
  return deltas;
}

function applyDeltas(graph: WorldGraph, deltas: readonly EntityDelta[], tick: number): void {
  for (const delta of deltas) {
    if (delta.op === 'add') graph.addEntity(structuredCloneOf(delta.entity));
    else if (delta.op === 'remove') graph.removeEntity(delta.id);
    else graph.updateEntity(delta.id, delta.patch, tick);
  }
}

function structuredCloneOf(entity: WorldModelEntity): WorldModelEntity {
  return JSON.parse(JSON.stringify(entity)) as WorldModelEntity;
}
