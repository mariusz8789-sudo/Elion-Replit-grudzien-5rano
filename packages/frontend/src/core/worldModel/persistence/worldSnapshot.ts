import type { GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import type { WorldModelEntity } from '../ecs/types';
import { WorldGraph, type EntityRelationship } from '../ecs/worldGraph';
import type { WorldModelProposalProvenance } from '../generation/worldModelProposal';
import type { WorldSpecification } from '../specification/worldSpecification';
import { TemporalBranchRegistry, TemporalEngine } from '../temporal/temporalEngine';
import type { WorldRecord } from './worldRegistry';

/**
 * WORLD PERSISTENCE — PLAIN-DATA SNAPSHOT (Genesis Scientific World Model
 * 4.0, section 6, closing the mission's own "WorldRegistry is in-memory
 * only" gap).
 *
 * `WorldSnapshot` is EVERY field a `WorldRecord` + its live `TemporalEngine`
 * need to be reconstructed byte-identically, and NOTHING else — no
 * `WorldGraph`/`TemporalEngine` instance, no function, no closure. It is
 * plain JSON: `JSON.stringify(serializeWorld(...))` round-trips through
 * ANY durable store (a backend database, a file, IndexedDB) without this
 * module ever needing to know which one. `restoreWorld` is the exact
 * inverse, built entirely from EXISTING primitives
 * (`WorldGraph.fromSnapshot`, `TemporalEngine.restore`) — never a second
 * graph/engine/replay mechanism.
 *
 * Captures the branch's CURRENT state (not its tick-0/fork-point keyframe)
 * as a full entity+relationship snapshot — a restored engine's OWN new
 * keyframe starts exactly HERE, at the tick it was saved at. This is a
 * deliberate, honest scope choice: `scrubTo` on a restored engine can
 * replay anything ticked AFTER restoration (exactly like any live engine),
 * but NOT anything before the save point — resuming a saved world is not
 * the same guarantee as an unbroken live branch's full history, the same
 * way a forked branch already can't `scrubTo` before ITS OWN fork point
 * either. Recorded evidence (`events`/`observations`) IS preserved in
 * full regardless, since journal entries are plain historical records,
 * never replayed as deltas — there is no double-application risk in
 * carrying every one of them forward.
 */
export interface WorldSnapshot {
  worldId: string;
  parentWorldId?: string;
  seed: number;
  specification: WorldSpecification;
  createdAt: string;
  provenance?: WorldModelProposalProvenance;

  branchId: string;
  parentBranchId: string | null;
  forkedAtTick: number | null;
  /** The tick/simulatedTime AT SAVE TIME — becomes the restored engine's own new keyframe point (its `scrubTo` floor). */
  keyframeTick: number;
  keyframeSimulatedTime: number;

  /** The graph's CURRENT state at save time, as plain data — see `WorldGraph.fromSnapshot`. */
  keyframeEntities: readonly WorldModelEntity[];
  keyframeRelationships: readonly EntityRelationship[];

  /** Every event/observation ever recorded on this branch (its own plus, for a fork, everything it shares with its parent up to the fork point) — carried forward in full as plain historical evidence; never replayed as deltas, so there is no risk of double-applying them on top of the already-current `keyframeEntities` above. */
  events: readonly GenesisEvent[];
  observations: readonly Observation[];
}

/** Serializes a registered world's record + its live engine into a plain-data snapshot — pure, synchronous, no network/storage concern of its own. */
export function serializeWorld(record: WorldRecord, engine: TemporalEngine): WorldSnapshot {
  return {
    worldId: record.worldId,
    parentWorldId: record.parentWorldId,
    seed: record.seed,
    specification: record.specification,
    createdAt: record.createdAt,
    provenance: record.provenance,
    branchId: engine.branchId,
    parentBranchId: engine.parentBranchId,
    forkedAtTick: engine.forkedAtTick,
    keyframeTick: engine.tick,
    keyframeSimulatedTime: engine.simulatedTime,
    keyframeEntities: engine.graph.listEntities(),
    keyframeRelationships: engine.graph.listRelationships(),
    events: engine.journal.allEvents(),
    observations: engine.journal.allObservations(),
  };
}

export interface RestoredWorld {
  record: WorldRecord;
  engine: TemporalEngine;
}

/**
 * The exact inverse of `serializeWorld`. `registry` is optional — pass one
 * when the restored branch must be reachable by `compareBranches`
 * alongside sibling branches also being restored into the same registry.
 */
export function restoreWorld(snapshot: WorldSnapshot, registry?: TemporalBranchRegistry): RestoredWorld {
  const graph = WorldGraph.fromSnapshot(snapshot.keyframeEntities, snapshot.keyframeRelationships);
  const engine = TemporalEngine.restore(graph, {
    frames: [], // `keyframeEntities` is already the CURRENT state — no delta log to replay on top of it, see the module doc.
    events: snapshot.events,
    observations: snapshot.observations,
    branchId: snapshot.branchId,
    parentBranchId: snapshot.parentBranchId,
    forkedAtTick: snapshot.forkedAtTick,
    startTick: snapshot.keyframeTick,
    startSimulatedTime: snapshot.keyframeSimulatedTime,
    registry,
  });
  const record: WorldRecord = {
    worldId: snapshot.worldId,
    parentWorldId: snapshot.parentWorldId,
    seed: snapshot.seed,
    specification: snapshot.specification,
    createdAt: snapshot.createdAt,
    branchId: engine.branchId,
    forkedAtTick: snapshot.forkedAtTick ?? undefined,
    provenance: snapshot.provenance,
  };
  return { record, engine };
}
