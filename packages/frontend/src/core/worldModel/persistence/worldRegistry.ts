import type { WorldGraph } from '../ecs/worldGraph';
import type { WorldModelProposalProvenance } from '../generation/worldModelProposal';
import type { WorldSpecification } from '../specification/worldSpecification';
import { TemporalEngine } from '../temporal/temporalEngine';
import type { CreateScientificWorldResult } from '../orchestration/createScientificWorld';

/**
 * WORLD PERSISTENCE (Genesis Scientific World Model 3.0, section 6).
 *
 * A generated world is not a one-off demo object: it has a stable
 * identity (`worldId`), an optional ancestry (`parentWorldId`, when it was
 * forked from another world), the exact `seed`/`specification` that
 * produced it, and creation/branch metadata. `WorldRegistry` is an
 * HONEST, MINIMAL in-memory implementation of that contract — save/load/
 * list/fork all work today, in-process — kept deliberately small so a real
 * storage backend (a database, a file store) can implement the exact same
 * `WorldRecord` shape later without this module's callers changing at all.
 * It does not itself duplicate any state: the live `TemporalEngine` (the
 * canonical, single source of truth for a world's graph/journal/history)
 * is what's stored — `WorldRecord` is metadata ABOUT it, not a copy of it.
 *
 * "Replay" is not reimplemented here — call `.engine.scrubTo(tick)`
 * (temporal/temporalEngine.ts) on a loaded record's engine, exactly as
 * anywhere else in C3.
 */
export interface WorldRecord {
  worldId: string;
  parentWorldId?: string;
  seed: number;
  specification: WorldSpecification;
  createdAt: string;
  /** This world's own branch identity within its `TemporalEngine` (`engine.branchId`) — surfaced here so a caller need not dereference the engine just to answer "which branch is this." */
  branchId: string;
  /** Set only for a forked world — the tick its parent was forked at. */
  forkedAtTick?: number;
  provenance?: WorldModelProposalProvenance;
}

export interface StoredWorld {
  record: WorldRecord;
  engine: TemporalEngine;
}

export class WorldRegistry {
  private readonly worlds = new Map<string, StoredWorld>();

  /** Registers a newly created world (see orchestration/createScientificWorld.ts) under its own `worldId`. Throws if that id is already taken — same "never silently overwrite" discipline as `WorldGraph.addEntity`. */
  save(created: CreateScientificWorldResult): WorldRecord {
    if (this.worlds.has(created.worldId)) throw new Error(`World already registered: ${created.worldId}`);
    const record: WorldRecord = {
      worldId: created.worldId,
      seed: created.specification.seed,
      specification: created.specification,
      createdAt: new Date().toISOString(),
      branchId: created.engine.branchId,
      provenance: created.provenance.proposalProvenance,
    };
    this.worlds.set(created.worldId, { record, engine: created.engine });
    return record;
  }

  load(worldId: string): StoredWorld | undefined {
    return this.worlds.get(worldId);
  }

  list(): readonly WorldRecord[] {
    return [...this.worlds.values()].map((w) => w.record);
  }

  /**
   * Forks a registered world at `atTick` into a new, independently
   * registered world — reuses `TemporalEngine.forkBranch` verbatim (never a
   * second branch mechanism); `mutate` is the declared divergence, exactly
   * as `forkBranch` already requires.
   */
  fork(parentWorldId: string, newWorldId: string, atTick: number, label: string, mutate: (graph: WorldGraph) => void): WorldRecord {
    const parent = this.worlds.get(parentWorldId);
    if (!parent) throw new Error(`Unknown world: ${parentWorldId}`);
    if (this.worlds.has(newWorldId)) throw new Error(`World already registered: ${newWorldId}`);

    const forkedEngine = parent.engine.forkBranch(atTick, label, mutate);
    const record: WorldRecord = {
      worldId: newWorldId,
      parentWorldId,
      seed: parent.record.seed,
      specification: parent.record.specification,
      createdAt: new Date().toISOString(),
      branchId: forkedEngine.branchId,
      forkedAtTick: atTick,
    };
    this.worlds.set(newWorldId, { record, engine: forkedEngine });
    return record;
  }
}
