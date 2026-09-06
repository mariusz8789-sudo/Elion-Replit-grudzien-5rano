import type { GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson } from '../../events/hash';
import type { Observation } from '../../world/scientificWorldState';
import type { EntityId, WorldModelEntity, WorldModelEntityPatch } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import { WorldJournal } from './worldJournal';

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

/** What a real solver step hands back to be recorded as evidence/provenance for that tick. */
export interface TemporalUpdateResult {
  observations?: readonly Observation[];
  events?: readonly GenesisEvent[];
}

export type TemporalUpdater = (graph: WorldGraph, dt: number, tick: number) => TemporalUpdateResult | void;

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
  private currentSimulatedTime: number;
  private readonly history: TemporalFrame[] = [];
  private readonly worldJournal: WorldJournal;

  constructor(
    initialGraph: WorldGraph,
    options: {
      branchId?: string;
      label?: string;
      parentBranchId?: string | null;
      forkedAtTick?: number | null;
      startTick?: number;
      /** World Generation 1.0: a `WorldBlueprint`'s declared initial simulated time — see generation/worldBlueprint.ts. Defaults to 0 (the pre-existing behavior). */
      startSimulatedTime?: number;
      registry?: TemporalBranchRegistry;
      journal?: WorldJournal;
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
    this.currentSimulatedTime = options.startSimulatedTime ?? 0;
    this.worldJournal = options.journal ?? new WorldJournal();
    this.registry = options.registry ?? null;
    this.registry?.register(this);
  }

  get tick(): number {
    return this.currentTick;
  }

  get simulatedTime(): number {
    return this.currentSimulatedTime;
  }

  get graph(): WorldGraph {
    return this.current;
  }

  /** Evidence/provenance recorded by real solvers on this branch (own entries after the fork point, shared before it). */
  get journal(): WorldJournal {
    return this.worldJournal;
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
   * Advances the world by `dt`: `updater` receives the live graph to mutate
   * in place (typically `SolverRouter.routeTick`) plus the absolute tick
   * this step produces, so a real solver can stamp its `Observation`s and
   * `GenesisEvent`s correctly. The resulting frame is stored as a
   * component-level delta against the pre-tick state, not a full snapshot;
   * anything the updater returns is appended to this branch's journal.
   */
  advance(dt: number, updater: TemporalUpdater): WorldGraph {
    const before = this.current;
    const after = before.clone();
    const nextTick = this.currentTick + 1;
    const result = updater(after, dt, nextTick) ?? undefined;
    const deltas = diffGraphs(before, after);
    this.currentTick = nextTick;
    this.currentSimulatedTime += dt;
    this.history.push({ tick: this.currentTick, simulatedTime: this.currentSimulatedTime, deltas });
    for (const observation of result?.observations ?? []) this.worldJournal.recordObservation(observation);
    for (const event of result?.events ?? []) this.worldJournal.recordEvent(event);
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
      journal: this.worldJournal.cloneUpToTick(atTick),
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
          domainState: entity.domainState,
          statusLabel: entity.statusLabel,
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
